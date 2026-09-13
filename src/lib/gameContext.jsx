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
  const [motionEnabled, setMotionEnabled] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return true;
  });
  const revRef = useRef(0);
  const idRef = useRef(null);
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
  // ---- Glatte Uhr & Visibility-basierte Automatik ----
  const [displayGameTime, setDisplayGameTime] = useState(0);
  const userWantsAutomationRef = useRef(false);
  const lastSyncGameTimeRef = useRef(0);
  const lastSyncRealMsRef = useRef(0);
  const clockIntervalRef = useRef(null);
  const dismissOverlay = useCallback(() => {
    setOverlay(null);
    // Nächste ausstehende Auszeichnung anzeigen, falls vorhanden
    if (pendingAchievementsRef.current.length > 0) {
      const next = pendingAchievementsRef.current.shift();
      setTimeout(() => setOverlay({ type: "achievement", data: next }), 300);
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle("no-motion", !motionEnabled);
  }, [motionEnabled]);

  // ---- Glatte Uhr: interpoliert Spielzeit zwischen Backend-Syncs ----
  // 1 Echtsekunde = 1 Spielminute → die Uhr tickt sekündlich, ohne Sprünge.
  useEffect(() => {
    if (!automationEnabled || !state?.timeControl?.enabled) {
      setDisplayGameTime(state?.gameTime || 0);
      if (clockIntervalRef.current) { clearInterval(clockIntervalRef.current); clockIntervalRef.current = null; }
      return;
    }
    const tick = () => {
      const elapsedMs = Date.now() - lastSyncRealMsRef.current;
      const advancedMin = Math.floor(elapsedMs / 1000); // 1s = 1 Spielminute
      setDisplayGameTime(lastSyncGameTimeRef.current + advancedMin);
    };
    tick();
    clockIntervalRef.current = setInterval(tick, 500);
    return () => { if (clockIntervalRef.current) { clearInterval(clockIntervalRef.current); clockIntervalRef.current = null; } };
  }, [automationEnabled, state?.gameTime, state?.timeControl?.enabled]);

  // Snapshot für Willkommen-zurück-Bericht speichern (beim Verlassen der Seite).
  useEffect(() => {
    const storeSnapshot = () => {
      const s = stateRef.current;
      if (!s) return;
      try {
        localStorage.setItem(LS_SNAPSHOT_KEY, JSON.stringify({
          gameMin: s.gameTime,
          companyCents: s.company?.accountCents,
          totalDeliveries: s.stats?.totalDeliveries,
          ts: Date.now(),
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

  // ---- Toast-Verwaltung (Auftrag 23) ----
  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const markAllEventsSeen = useCallback(async () => {
    if (!idRef.current) return;
    try {
      await gameCommand({
        stateId: idRef.current,
        action_id: (crypto.randomUUID ? crypto.randomUUID() : "seen_" + Date.now()),
        expected_revision: revRef.current,
        command: "markAllEventsSeen",
        params: {},
      });
      // Lokalen Zähler sofort aktualisieren
      setUnseenCount(0);
    } catch (e) { /* Silent fail – wird beim nächsten Sync korrigiert */ }
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

    // ---- Neue Ereignisse erkennen und Toasts anzeigen (Auftrag 23) ----
    const events = data.state?.events || [];
    if (isInitialLoadRef.current) {
      // Erster Laden: alle vorhandenen Ereignisse als gesehen markieren, keine Toasts
      for (const ev of events) {
        seenEventIdsRef.current.add(ev.id);
        if (ev.seq > lastEventSeqRef.current) lastEventSeqRef.current = ev.seq;
      }
      isInitialLoadRef.current = false;
    } else {
      // Folge-Update: nur neue Ereignisse anzeigen
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
          setToasts(prev => {
            // Max 20 Toasts im Speicher, nur 3 sichtbar
            const combined = [...prev, ...newToasts];
            return combined.slice(-20);
          });
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
          // Beim Laden: Automatik immer pausieren – kein Hintergrundbetrieb mehr.
          // Der Nutzer aktiviert die Zeitautomatik per Klick, wenn er sie möchte.
          if (data.state?.timeControl?.enabled) {
            try {
              await gameCommand({
                stateId: savedId,
                action_id: (crypto.randomUUID ? crypto.randomUUID() : "pause_" + Date.now()),
                expected_revision: data.revision,
                command: "pauseAutomation",
                params: { reason: "loaded" },
              });
              const paused = await gameCommand({ command: "load", stateId: savedId });
              applyLoaded(paused);
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

  const send = useCallback(async (command, params) => {
    if (!idRef.current) throw new Error("Kein Spielstand geladen");
    setBusy(true);
    try {
      const action_id = (crypto.randomUUID ? crypto.randomUUID() : "a_" + Date.now() + "_" + Math.random());
      const data = await gameCommand({
        stateId: idRef.current,
        action_id,
        expected_revision: revRef.current,
        command,
        params: params || {}
      });
      if (data.conflict) {
        await reload();
        throw new Error(data.error || "Konflikt: Zustand wurde gleichzeitig geändert. Bitte wiederholen.");
      }
      if (data.error) throw new Error(data.error);
      applyLoaded(data);
      const result = data.result;
      if (result?.events) {
        const delivery = result.events.find(e => e.type === "delivery");
        if (delivery) {
          const order = data.state.orders.find(o => o.id === delivery.order);
          const trip = data.state.trips.find(t => t.id === delivery.trip);
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
      // Neue Erfolge erkennen und als Overlay anzeigen
      const newAchs = (data.state?.achievements || []).filter(a => a.unlocked && !prevAchievementsRef.current.has(a.id));
      if (newAchs.length > 0) {
        const ACHIEVEMENT_DEFS = await import("@/lib/achievementCatalog.js").then(m => m.ACHIEVEMENTS).catch(() => []);
        const achData = newAchs.map(a => {
          const def = ACHIEVEMENT_DEFS.find(d => d.id === a.id);
          return { id: a.id, title: def?.title || a.id, xp: def?.xp || 0, category: def?.category || "", desc: def?.desc || "" };
        });
        pendingAchievementsRef.current = achData.slice(1);
        setOverlay({ type: "achievement", data: achData[0] });
      }
      prevAchievementsRef.current = new Set((data.state?.achievements || []).filter(a => a.unlocked).map(a => a.id));
      if (command === "startTransport" && result?.fuelCents != null) {
        setOverlay({ type: "transportStart", data: { fuelCents: result.fuelCents, tollCents: result.tollCents, endMin: result.endMin } });
      }
      if (command === "answerInvitation" && result?.choice) {
        setOverlay({
          type: "invitation",
          data: { choice: result.choice, relationship: data.state.private.relationship, happiness: data.state.private.happiness, stress: data.state.private.stress }
        });
      }
      return data.result;
    } catch (e) {
      if (e.response && e.response.data && e.response.data.conflict) {
        await reload();
        throw new Error(e.response.data.error || "Konflikt. Bitte wiederholen.");
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }, [applyLoaded, reload]);

  // ---- Zeitautomatik ----
  const syncAutomation = useCallback(async () => {
    if (!idRef.current) return;
    // Nur ein gleichzeitiger Sync pro Spielstand (Auftrag 23)
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      const action_id = (crypto.randomUUID ? crypto.randomUUID() : "sync_" + Date.now());
      const data = await gameCommand({
        stateId: idRef.current, action_id, expected_revision: revRef.current,
        command: "syncAutomation", params: {}
      });
      if (data.conflict) { await reload(); return; }
      if (data.error) return;
      applyLoaded(data);
      // Verbindung erfolgreich
      syncFailCountRef.current = 0;
      setConnectionState("connected");
    } catch (e) {
      // Verbindungsstatus verfolgen
      syncFailCountRef.current++;
      if (syncFailCountRef.current >= 4) setConnectionState("reconnecting");
    } finally {
      syncInFlightRef.current = false;
    }
  }, [applyLoaded, reload]);

  const enableAutomation = useCallback(async (silent = false) => {
    if (!idRef.current) return;
    setAutomationBusy(true);
    userWantsAutomationRef.current = true;
    try {
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await send("enableAutomation", {});
          setAutomationEnabled(true);
          if (!silent) showToast("Zeitautomatik aktiviert – läuft, solange das Spiel geöffnet ist.", "success");
          return;
        } catch (e) {
          lastError = e;
          await new Promise(r => setTimeout(r, 50));
        }
      }
      if (!silent) showToast("Automatik konnte nicht aktiviert werden: " + (lastError?.message || "Unbekannt"), "error");
    } finally {
      setAutomationBusy(false);
    }
  }, [send, showToast]);

  const pauseAutomation = useCallback(async (silent = false, reason) => {
    if (!idRef.current) return;
    setAutomationBusy(true);
    // Sofort Polling stoppen, um Entity-Read-Limit zu entlasten.
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const isUserInitiated = !silent;
    if (isUserInitiated) userWantsAutomationRef.current = false;
    try {
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await send("pauseAutomation", { reason: reason || "user" });
          setAutomationEnabled(false);
          if (isUserInitiated) showToast("Zeitautomatik pausiert.", "info");
          return;
        } catch (e) {
          lastError = e;
          await new Promise(r => setTimeout(r, 100));
        }
      }
      if (isUserInitiated) showToast("Automatik konnte nicht pausiert werden: " + (lastError?.message || "Unbekannt"), "error");
    } finally {
      setAutomationBusy(false);
    }
  }, [send, showToast]);

  // Polling: alle 3 Sekunden syncen, wenn Automatik aktiv (Auftrag 23).
  // Echtzeit-Subscription sorgt für sofortige Updates; Polling ist Fallback.
  // Längerer Intervall schont das Entity-Read-Limit der Plattform.
  useEffect(() => {
    if (!automationEnabled) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    syncAutomation();
    pollRef.current = setInterval(syncAutomation, 15000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [automationEnabled, syncAutomation]);

  // ---- Visibility-basierte Automatik: nur laufen, wenn Tab sichtbar ----
  // Bei Tab-Wechsel/Minimierung: Automatik pausieren und sichern.
  // Bei Rückkehr: Automatik fortsetzen, wenn der Nutzer sie aktiviert hatte.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (automationEnabled) {
          pauseAutomation(true, "tab_hidden");
        }
      } else {
        if (userWantsAutomationRef.current && !automationEnabled && !automationBusy) {
          enableAutomation(true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [automationEnabled, automationBusy, enableAutomation, pauseAutomation]);

  // ---- Echtzeit-Subscription für GameState-Änderungen (Auftrag 23) ----
  // Subscribe zu GameState-Entity: bei Änderung sofortigen Sync anstoßen.
  // Polling bleibt als belastbarer Fallback aktiv.
  useEffect(() => {
    if (!stateId) return;
    let unsub = null;
    try {
      unsub = base44.entities.GameState.subscribe((event) => {
        // Nur reagieren wenn es unser Spielstand ist
        if (event?.id === stateId || event?.data?.id === stateId) {
          // Debounced: nur syncen wenn letzter Sync >5s zurück liegt
          const sinceLast = Date.now() - lastSyncRealMsRef.current;
          if (sinceLast > 5000) syncAutomation();
        }
      });
      subscriptionRef.current = unsub;
    } catch (e) {
      // Subscription nicht verfügbar – Polling ist ausreichend
    }
    return () => {
      if (unsub) { try { unsub(); } catch (e) {} }
      subscriptionRef.current = null;
    };
  }, [stateId, syncAutomation]);

  // ---- Bei Spielstandwechsel: Event-Tracking zurücksetzen ----
  useEffect(() => {
    if (stateId) {
      isInitialLoadRef.current = true;
      seenEventIdsRef.current = new Set();
      lastEventSeqRef.current = 0;
      setToasts([]);
      setUnseenCount(0);
    }
  }, [stateId]);

  const newGame = useCallback(async (names) => {
    setBusy(true);
    try {
      const action_id = (crypto.randomUUID ? crypto.randomUUID() : "a_" + Date.now());
      const data = await gameCommand({ command: "newGame", action_id, params: names || {} });
      applyLoaded(data);
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
  }, [applyLoaded]);

  const value = {
    state, revision, stateId, loading, busy, toast, showToast, send, newGame, listGames, loadGame, reload,
    motionEnabled, toggleMotion, overlay, dismissOverlay,
    automationEnabled, automationBusy, enableAutomation, pauseAutomation,
    displayGameTime,
    // Live-Dienst (Auftrag 23)
    toasts, dismissToast, unseenCount, markAllEventsSeen, connectionState,
  };
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}