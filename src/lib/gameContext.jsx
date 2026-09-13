import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { gameCommand } from "@/lib/gameClient";
import { base44 } from "@/api/base44Client";
import { eventToToast, eventToNotification } from "@/lib/eventNotifications";
import { getUnseenEventCount } from "@/lib/eventLogClient";

const GameContext = createContext(null);

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame muss innerhalb von GameProvider verwendet werden");
  return ctx;
}

const LS_KEY = "spedition_leben_state_id";
const LS_SNAPSHOT_KEY = "spedition_leben_last_seen";

export function GameProvider({ children }) {
  const [state, setState] = useState(null);
  const [revision, setRevision] = useState(0);
  const [stateId, setStateId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return true;
  });
  const revRef = useRef(0);
  const idRef = useRef(null);
  const savingRef = useRef(false);
  const [overlay, setOverlay] = useState(null);
  const prevAchievementsRef = useRef(new Set());
  const pendingAchievementsRef = useRef([]);
  const stateRef = useRef(null);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationBusy, setAutomationBusy] = useState(false);
  const pollRef = useRef(null);
  // ---- Live-Dienst (Auftrag 23) ----
  const [toasts, setToasts] = useState([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [connectionState, setConnectionState] = useState("connected");
  const seenEventIdsRef = useRef(new Set());
  const lastEventSeqRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const subscriptionRef = useRef(null);
  const syncFailCountRef = useRef(0);
  const syncInFlightRef = useRef(false);
  const sendInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  // ---- Glatte Uhr & Visibility-basierte Automatik ----
  const [displayGameTime, setDisplayGameTime] = useState(0);
  const userWantsAutomationRef = useRef(false);
  const lastSyncGameTimeRef = useRef(0);
  const lastSyncRealMsRef = useRef(0);
  const clockIntervalRef = useRef(null);
  const dismissOverlay = useCallback(() => {
    setOverlay(null);
    if (pendingAchievementsRef.current.length > 0) {
      const next = pendingAchievementsRef.current.shift();
      setTimeout(() => setOverlay({ type: "achievement", data: next }), 300);
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("no-motion", !motionEnabled);
  }, [motionEnabled]);

  // ---- Glatte Uhr: interpoliert Spielzeit zwischen Syncs ----
  useEffect(() => {
    if (!automationEnabled || !state?.timeControl?.enabled) {
      setDisplayGameTime(state?.gameTime || 0);
      if (clockIntervalRef.current) { clearInterval(clockIntervalRef.current); clockIntervalRef.current = null; }
      return;
    }
    const tick = () => {
      const elapsedMs = Date.now() - lastSyncRealMsRef.current;
      // 20 echte Sekunden = 60 Spielminuten → 3 Spielminuten pro Sekunde
      const advancedMin = Math.floor(elapsedMs / 1000 * 3);
      setDisplayGameTime(lastSyncGameTimeRef.current + advancedMin);
    };
    tick();
    clockIntervalRef.current = setInterval(tick, 500);
    return () => { if (clockIntervalRef.current) { clearInterval(clockIntervalRef.current); clockIntervalRef.current = null; } };
  }, [automationEnabled, state?.gameTime, state?.timeControl?.enabled]);

  // Snapshot speichern
  useEffect(() => {
    const storeSnapshot = () => {
      const s = stateRef.current;
      if (!s) return;
      try {
        localStorage.setItem(LS_SNAPSHOT_KEY, JSON.stringify({
          gameMin: s.gameTime, companyCents: s.company?.accountCents,
          totalDeliveries: s.stats?.totalDeliveries, ts: Date.now(),
        }));
      } catch (e) {}
    };
    const onVisibility = () => { if (document.hidden) storeSnapshot(); };
    window.addEventListener("beforeunload", storeSnapshot);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", storeSnapshot);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const toggleMotion = useCallback(() => setMotionEnabled(v => !v), []);

  const showToast = useCallback((msg, kind = "info") => {
    setToast({ msg, kind, id: Date.now() });
    setTimeout(() => setToast(null), 4200);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const applyLoaded = useCallback((data) => {
    setState(data.state);
    setRevision(data.revision);
    revRef.current = data.revision;
    setStateId(data.stateId);
    idRef.current = data.stateId;
    if (data.stateId) localStorage.setItem(LS_KEY, data.stateId);
    stateRef.current = data.state;
    setAutomationEnabled(!!data.state?.timeControl?.enabled);
    lastSyncGameTimeRef.current = data.state?.gameTime || 0;
    lastSyncRealMsRef.current = Date.now();
    prevAchievementsRef.current = new Set((data.state?.achievements || []).filter(a => a.unlocked).map(a => a.id));

    const events = data.state?.events || [];
    if (isInitialLoadRef.current) {
      for (const ev of events) {
        seenEventIdsRef.current.add(ev.id);
        if (ev.seq > lastEventSeqRef.current) lastEventSeqRef.current = ev.seq;
      }
      isInitialLoadRef.current = false;
    } else {
      const newEvents = events.filter(ev =>
        !seenEventIdsRef.current.has(ev.id) && ev.seq > lastEventSeqRef.current
      );
      if (newEvents.length > 0) {
        const newToasts = [];
        for (const ev of newEvents) {
          const toast = eventToToast(ev);
          if (toast) newToasts.push(toast);
          seenEventIdsRef.current.add(ev.id);
          if (ev.seq > lastEventSeqRef.current) lastEventSeqRef.current = ev.seq;
        }
        if (newToasts.length > 0) {
          setToasts(prev => [...prev, ...newToasts].slice(-20));
        }
      }
    }
    setUnseenCount(getUnseenEventCount(data.state));
  }, []);

  const reload = useCallback(async () => {
    if (!idRef.current) return;
    try {
      const data = await gameCommand({ command: "load", stateId: idRef.current });
      applyLoaded(data);
      setDirty(false);
    } catch (e) {
      showToast("Spielstand konnte nicht geladen werden: " + e.message, "error");
    }
  }, [applyLoaded, showToast]);

  useEffect(() => {
    (async () => {
      const savedId = localStorage.getItem(LS_KEY);
      if (savedId) {
        try {
          const data = await gameCommand({ command: "load", stateId: savedId });
          applyLoaded(data);
          if (data.state?.timeControl?.enabled) {
            try {
              const r = await gameCommand({
                command: "pauseAutomation",
                stateId: savedId,
                action_id: "pause_load_" + Date.now(),
                expected_revision: data.revision,
                params: { reason: "loaded" },
              });
              if (r.state) {
                applyLoaded({ state: r.state, revision: r.revision, stateId: savedId, result: r.result });
                revRef.current = r.revision;
                setRevision(r.revision);
              }
            } catch (e) {}
            userWantsAutomationRef.current = false;
          }
        } catch (e) {
          localStorage.removeItem(LS_KEY);
        }
      }
      setLoading(false);
    })();
  }, [applyLoaded]);

  // Server-autoritativ: Jeder Befehl wird über gameCommand atomar persistiert.
  // save ist ein No-op für Abwärtskompatibilität mit manuellen Speichern-Aufrufen.
  const save = useCallback(async (_silent = false) => {}, []);

  // ---- Befehle server-autoritativ über gameCommand (lädt, wendet an, persistiert atomar) ----
  const send = useCallback(async (command, params) => {
    if (!idRef.current) throw new Error("Kein Spielstand geladen");
    setBusy(true);
    sendInFlightRef.current = true;
    const action_id = (crypto.randomUUID ? crypto.randomUUID() : "a_" + Date.now() + "_" + Math.random());
    try {
      const data = await gameCommand({
        command,
        stateId: idRef.current,
        action_id,
        expected_revision: revRef.current,
        params: params || {},
      });

      const newState = data.state;
      const result = data.result;

      applyLoaded({ state: newState, revision: data.revision, stateId: idRef.current, result });
      revRef.current = data.revision;
      setRevision(data.revision);

      // Overlay-Logik
      if (result?.events) {
        const delivery = result.events.find(e => e.type === "delivery");
        if (delivery) {
          const order = newState.orders.find(o => o.id === delivery.order);
          const trip = newState.trips.find(t => t.id === delivery.trip);
          setOverlay({
            type: "delivery",
            data: {
              customer: order?.customer, fromCity: order?.fromCity, toCity: order?.toCity,
              paymentCents: delivery.paymentCents, onTime: delivery.onTime,
              contributionCents: trip ? delivery.paymentCents - trip.fuelCents - trip.tollCents : null
            }
          });
        }
      }
      const newAchs = (newState.achievements || []).filter(a => a.unlocked && !prevAchievementsRef.current.has(a.id));
      if (newAchs.length > 0) {
        const ACHIEVEMENT_DEFS = await import("@/lib/achievementCatalog.js").then(m => m.ACHIEVEMENTS).catch(() => []);
        const achData = newAchs.map(a => {
          const def = ACHIEVEMENT_DEFS.find(d => d.id === a.id);
          return { id: a.id, title: def?.title || a.id, xp: def?.xp || 0, category: def?.category || "", desc: def?.desc || "" };
        });
        pendingAchievementsRef.current = achData.slice(1);
        setOverlay({ type: "achievement", data: achData[0] });
      }
      prevAchievementsRef.current = new Set((newState.achievements || []).filter(a => a.unlocked).map(a => a.id));
      if (command === "startTransport" && result?.fuelCents != null) {
        setOverlay({ type: "transportStart", data: { fuelCents: result.fuelCents, tollCents: result.tollCents, endMin: result.endMin } });
      }
      if (command === "answerInvitation" && result?.choice) {
        setOverlay({
          type: "invitation",
          data: { choice: result.choice, relationship: newState.private.relationship, happiness: newState.private.happiness, stress: newState.private.stress }
        });
      }
      return result;
    } catch (e) {
      if (e.conflict) await reload();
      if (e.message && !e.message.includes("Kein Spielstand")) showToast(e.message, "error");
      throw e;
    } finally {
      setBusy(false);
      sendInFlightRef.current = false;
    }
  }, [applyLoaded, showToast, reload]);

  // ---- Zeitautomatik: server-autoritativ über gameCommand (atomar, revisionssicher) ----
  const syncAutomation = useCallback(async () => {
    if (!idRef.current) return;
    if (syncInFlightRef.current) return;
    if (sendInFlightRef.current) return; // Benutzerbefehl hat Vorrang – Tick überspringen
    syncInFlightRef.current = true;
    const action_id = "sync_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    try {
      const data = await gameCommand({
        command: "syncAutomation",
        stateId: idRef.current,
        action_id,
        expected_revision: revRef.current,
        params: {},
      });
      // Idle: keine Zeit vergangen, Zustand unverändert – Revision nicht aktualisieren
      if (data.idle) {
        syncFailCountRef.current = 0;
        setConnectionState("connected");
        return;
      }
      applyLoaded({ state: data.state, revision: data.revision, stateId: idRef.current, result: data.result });
      revRef.current = data.revision;
      setRevision(data.revision);
      syncFailCountRef.current = 0;
      setConnectionState("connected");
    } catch (e) {
      syncFailCountRef.current++;
      if (syncFailCountRef.current >= 4) setConnectionState("reconnecting");
      if (e.conflict) await reload();
    } finally {
      syncInFlightRef.current = false;
    }
  }, [applyLoaded, reload]);

  const enableAutomation = useCallback(async (silent = false) => {
    if (!idRef.current) return;
    setAutomationBusy(true);
    userWantsAutomationRef.current = true;
    try {
      await send("enableAutomation", {});
      setAutomationEnabled(true);
      if (!silent) showToast("Zeitautomatik aktiviert – läuft, solange das Spiel geöffnet ist.", "success");
    } catch (e) {
      if (!silent) showToast("Automatik konnte nicht aktiviert werden: " + (e?.message || "Unbekannt"), "error");
    } finally {
      setAutomationBusy(false);
    }
  }, [send, save, showToast]);

  const pauseAutomation = useCallback(async (silent = false, reason) => {
    if (!idRef.current) return;
    setAutomationBusy(true);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const isUserInitiated = !silent;
    if (isUserInitiated) userWantsAutomationRef.current = false;
    try {
      await send("pauseAutomation", { reason: reason || "user" });
      setAutomationEnabled(false);
      if (isUserInitiated) showToast("Zeitautomatik pausiert.", "info");
    } catch (e) {
      if (isUserInitiated) showToast("Automatik konnte nicht pausiert werden: " + (e?.message || "Unbekannt"), "error");
    } finally {
      setAutomationBusy(false);
    }
  }, [send, save, showToast]);

  // Polling: alle 15 Sekunden syncen, wenn Automatik aktiv
  useEffect(() => {
    if (!automationEnabled) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    syncAutomation();
    pollRef.current = setInterval(syncAutomation, 15000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [automationEnabled, syncAutomation]);

  // ---- Visibility-basierte Automatik ----
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (automationEnabled) pauseAutomation(true, "tab_hidden");
      } else {
        if (userWantsAutomationRef.current && !automationEnabled && !automationBusy) {
          enableAutomation(true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [automationEnabled, automationBusy, dirty, enableAutomation, pauseAutomation, save]);

  // ---- Auto-Save entfällt: Server-autoritativ, jeder Befehl persistiert atomar über gameCommand ----

  // ---- Echtzeit-Subscription ----
  useEffect(() => {
    if (!stateId) return;
    let unsub = null;
    try {
      unsub = base44.entities.GameState.subscribe((event) => {
        if (event?.id === stateId || event?.data?.id === stateId) {
          const sinceLast = Date.now() - lastSyncRealMsRef.current;
          if (sinceLast > 5000 && automationEnabled) syncAutomation();
        }
      });
      subscriptionRef.current = unsub;
    } catch (e) {}
    return () => {
      if (unsub) { try { unsub(); } catch (e) {} }
      subscriptionRef.current = null;
    };
  }, [stateId, syncAutomation, automationEnabled]);

  // ---- Bei Spielstandwechsel: Event-Tracking zurücksetzen ----
  useEffect(() => {
    if (stateId) {
      isInitialLoadRef.current = true;
      seenEventIdsRef.current = new Set();
      lastEventSeqRef.current = 0;
      setToasts([]);
      setUnseenCount(0);
      setDirty(false);
    }
  }, [stateId]);

  const markAllEventsSeen = useCallback(async () => {
    if (!idRef.current) return;
    try {
      await send("markAllEventsSeen", {});
      setUnseenCount(0);
    } catch (e) {}
  }, [send]);

  const newGame = useCallback(async (names) => {
    setBusy(true);
    try {
      const action_id = (crypto.randomUUID ? crypto.randomUUID() : "a_" + Date.now());
      const data = await gameCommand({ command: "newGame", action_id, params: names || {} });
      applyLoaded(data);
      setDirty(false);
      return data;
    } finally {
      setBusy(false);
    }
  }, [applyLoaded]);

  const listGames = useCallback(async () => {
    return await gameCommand({ command: "list" });
  }, []);

  const loadGame = useCallback(async (sid) => {
    const data = await gameCommand({ command: "load", stateId: sid });
    applyLoaded(data);
    setDirty(false);
  }, [applyLoaded]);

  const value = {
    state, revision, stateId, loading, busy, toast, showToast, send, newGame, listGames, loadGame, reload,
    motionEnabled, toggleMotion, overlay, dismissOverlay,
    automationEnabled, automationBusy, enableAutomation, pauseAutomation,
    displayGameTime,
    // Cache-System
    dirty, save, saving,
    // Live-Dienst
    toasts, dismissToast, unseenCount, markAllEventsSeen, connectionState,
  };
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}