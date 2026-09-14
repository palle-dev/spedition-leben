import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { applyCommandRemote, gameCommand } from "@/lib/gameClient";
import { eventToToast } from "@/lib/eventNotifications";
import { getUnseenEventCount } from "@/lib/eventLogClient";

const GameContext = createContext(null);

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame muss innerhalb von GameProvider verwendet werden");
  return ctx;
}

const LS_STATE = "spedition_leben_state";
const LS_STATE_ID = "spedition_leben_state_id";
const LS_SERVER_REV = "spedition_leben_server_rev";

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
  const [overlay, setOverlay] = useState(null);
  const prevAchievementsRef = useRef(new Set());
  const pendingAchievementsRef = useRef([]);
  const stateRef = useRef(null);
  const stateIdRef = useRef(null);
  const serverRevRef = useRef(0);
  const dirtyRef = useRef(false);
  const localRevRef = useRef(0);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [displayGameTime, setDisplayGameTime] = useState(0);
  const userWantsAutomationRef = useRef(false);
  const lastSyncGameTimeRef = useRef(0);
  const lastSyncRealMsRef = useRef(0);
  const clockIntervalRef = useRef(null);
  const pollRef = useRef(null);
  const syncTimerRef = useRef(null);
  const [toasts, setToasts] = useState([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const [connectionState, setConnectionState] = useState("connected");
  const seenEventIdsRef = useRef(new Set());
  const lastEventSeqRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const syncInFlightRef = useRef(false);
  const sendInFlightRef = useRef(false);
  const syncFailCountRef = useRef(0);

  useEffect(() => {
    document.body.classList.toggle("no-motion", !motionEnabled);
  }, [motionEnabled]);

  // ---- Glatte Uhr ----
  useEffect(() => {
    if (!automationEnabled || !state?.timeControl?.enabled) {
      setDisplayGameTime(state?.gameTime || 0);
      if (clockIntervalRef.current) { clearInterval(clockIntervalRef.current); clockIntervalRef.current = null; }
      return;
    }
    const tick = () => {
      const elapsedMs = Date.now() - lastSyncRealMsRef.current;
      const advancedMin = Math.floor(elapsedMs / 1000 * 3);
      setDisplayGameTime(lastSyncGameTimeRef.current + advancedMin);
    };
    tick();
    clockIntervalRef.current = setInterval(tick, 500);
    return () => { if (clockIntervalRef.current) { clearInterval(clockIntervalRef.current); clockIntervalRef.current = null; } };
  }, [automationEnabled, state?.gameTime, state?.timeControl?.enabled]);

  const toggleMotion = useCallback(() => setMotionEnabled(v => !v), []);

  const showToast = useCallback((msg, kind = "info") => {
    setToast({ msg, kind, id: Date.now() });
    setTimeout(() => setToast(null), 4200);
  }, []);

  const dismissToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);
  const dismissOverlay = useCallback(() => {
    setOverlay(null);
    if (pendingAchievementsRef.current.length > 0) {
      const next = pendingAchievementsRef.current.shift();
      setTimeout(() => setOverlay({ type: "achievement", data: next }), 300);
    }
  }, []);

  const saveToStorage = useCallback((s) => {
    try { localStorage.setItem(LS_STATE, JSON.stringify(s)); } catch (e) {}
  }, []);

  const processNewEvents = useCallback((newState) => {
    const events = newState.events || [];
    if (isInitialLoadRef.current) {
      for (const ev of events) { seenEventIdsRef.current.add(ev.id); if (ev.seq > lastEventSeqRef.current) lastEventSeqRef.current = ev.seq; }
      isInitialLoadRef.current = false;
    } else {
      const newEvents = events.filter(ev => !seenEventIdsRef.current.has(ev.id) && ev.seq > lastEventSeqRef.current);
      if (newEvents.length > 0) {
        const newToasts = [];
        for (const ev of newEvents) {
          const t = eventToToast(ev);
          if (t) newToasts.push(t);
          seenEventIdsRef.current.add(ev.id);
          if (ev.seq > lastEventSeqRef.current) lastEventSeqRef.current = ev.seq;
        }
        if (newToasts.length > 0) setToasts(prev => [...prev, ...newToasts].slice(-20));
      }
    }
    setUnseenCount(getUnseenEventCount(newState));
  }, []);

  const processResult = useCallback(async (newState, result, command) => {
    if (result?.events) {
      const delivery = result.events.find(e => e.type === "delivery");
      if (delivery) {
        const order = newState.orders.find(o => o.id === delivery.order);
        const trip = newState.trips.find(t => t.id === delivery.trip);
        setOverlay({
          type: "delivery",
          data: { customer: order?.customer, fromCity: order?.fromCity, toCity: order?.toCity, paymentCents: delivery.paymentCents, onTime: delivery.onTime, contributionCents: trip ? delivery.paymentCents - trip.fuelCents - trip.tollCents : null },
        });
      }
    }
    const newAchs = (newState.achievements || []).filter(a => a.unlocked && !prevAchievementsRef.current.has(a.id));
    if (newAchs.length > 0) {
      const ACHIEVEMENT_DEFS = await import("@/lib/achievementCatalog.js").then(m => m.ACHIEVEMENTS).catch(() => []);
      const achData = newAchs.map(a => { const def = ACHIEVEMENT_DEFS.find(d => d.id === a.id); return { id: a.id, title: def?.title || a.id, xp: def?.xp || 0, category: def?.category || "", desc: def?.desc || "" }; });
      pendingAchievementsRef.current = achData.slice(1);
      setOverlay({ type: "achievement", data: achData[0] });
    }
    prevAchievementsRef.current = new Set((newState.achievements || []).filter(a => a.unlocked).map(a => a.id));
    if (command === "startTransport" && result?.fuelCents != null) setOverlay({ type: "transportStart", data: { fuelCents: result.fuelCents, tollCents: result.tollCents, endMin: result.endMin } });
    if (command === "answerInvitation" && result?.choice) setOverlay({ type: "invitation", data: { choice: result.choice, relationship: newState.private.relationship, happiness: newState.private.happiness, stress: newState.private.stress } });
  }, []);

  // ---- Server-Backup ----
  const syncToServer = useCallback(async () => {
    if (!dirtyRef.current || !stateRef.current || !stateIdRef.current) return;
    dirtyRef.current = false; setDirty(false); setSaving(true);
    try {
      const data = await gameCommand({ command: "saveBackup", stateId: stateIdRef.current, action_id: "backup_" + Date.now(), expected_revision: serverRevRef.current, params: { state: stateRef.current } });
      serverRevRef.current = data.revision;
      localStorage.setItem(LS_SERVER_REV, String(data.revision));
      setRevision(data.revision);
      setConnectionState("connected");
      syncFailCountRef.current = 0;
    } catch (e) {
      if (e.conflict && e.current_revision != null) {
        serverRevRef.current = e.current_revision;
        localStorage.setItem(LS_SERVER_REV, String(e.current_revision));
        // Konflikt: Server hat eine neuere Revision. Prüfe, ob der Serverstand
        // auch zeitlich neuer ist (z.B. durch processAutomationTick im Hintergrund).
        // Nur dann den Clientstand durch den Serverstand ersetzen — sonst behalten
        // wir den lokalen Stand (enthält aktuelle Spielaktionen) und speichern erneut.
        try {
          const serverData = await gameCommand({ command: "load", stateId: stateIdRef.current });
          const serverTime = serverData.state?.gameTime || 0;
          const localTime = stateRef.current?.gameTime || 0;
          if (serverTime > localTime) {
            stateRef.current = serverData.state; setState(serverData.state);
            saveToStorage(serverData.state);
            serverRevRef.current = serverData.revision;
            localStorage.setItem(LS_SERVER_REV, String(serverData.revision));
            setRevision(serverData.revision);
            syncFailCountRef.current = 0;
            setConnectionState("connected");
          } else {
            dirtyRef.current = true; setDirty(true);
            syncFailCountRef.current++;
            if (syncFailCountRef.current >= 3) setConnectionState("reconnecting");
          }
        } catch (e2) {
          dirtyRef.current = true; setDirty(true);
          syncFailCountRef.current++;
          if (syncFailCountRef.current >= 3) setConnectionState("reconnecting");
        }
      } else {
        dirtyRef.current = true; setDirty(true);
        syncFailCountRef.current++;
        if (syncFailCountRef.current >= 3) setConnectionState("reconnecting");
      }
    } finally { setSaving(false); }
  }, []);

  const scheduleServerSync = useCallback(() => {
    dirtyRef.current = true; setDirty(true);
    if (syncTimerRef.current) return;
    syncTimerRef.current = setTimeout(() => { syncTimerRef.current = null; syncToServer(); }, 10000);
  }, [syncToServer]);

  // ---- Befehl über applyCommandRemote (Simulation serverseitig, kein DB-Zugriff) ----
  const send = useCallback(async (command, params) => {
    // Warte auf laufende Automatik-Synchronisation, um Race-Conditions zu vermeiden:
    // syncAutomation und send nutzen denselben stateRef als Eingabe. Ohne Synchronisation
    // würde der später zurückkehrende Aufruf den Zustand des früheren überschreiben und
    // dabei Dispositionsentscheidungen oder Spieleraktionen verlieren.
    while (syncInFlightRef.current) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!stateRef.current) throw new Error("Kein Spielstand geladen");
    setBusy(true); sendInFlightRef.current = true;
    try {
      const data = await applyCommandRemote({ state: stateRef.current, command, params: params || {} });
      const newState = data.state; const result = data.result;
      stateRef.current = newState; setState(newState);
      localRevRef.current++; setRevision(localRevRef.current);
      saveToStorage(newState);
      processNewEvents(newState);
      await processResult(newState, result, command);
      scheduleServerSync();
      return result;
    } catch (e) {
      showToast(e.message, "error");
      throw e;
    } finally { setBusy(false); sendInFlightRef.current = false; }
  }, [saveToStorage, processNewEvents, processResult, scheduleServerSync, showToast]);

  // ---- Zeitautomatik über applyCommandRemote ----
  const syncAutomation = useCallback(async () => {
    if (!stateRef.current || syncInFlightRef.current || sendInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      const data = await applyCommandRemote({ state: stateRef.current, command: "syncAutomation", params: {} });
      // Zustand IMMER aktualisieren — auch ohne Ereignisse advanced die Spielzeit.
      // Früher wurde hier übersprungen, was dazu führte, dass die Automatik stehen blieb.
      const newState = data.state;
      stateRef.current = newState; setState(newState);
      saveToStorage(newState);
      processNewEvents(newState);
      lastSyncGameTimeRef.current = newState.gameTime;
      lastSyncRealMsRef.current = Date.now();
      scheduleServerSync();
      syncFailCountRef.current = 0;
      setConnectionState("connected");
    } catch (e) {
      syncFailCountRef.current++;
      if (syncFailCountRef.current >= 4) setConnectionState("reconnecting");
    } finally { syncInFlightRef.current = false; }
  }, [saveToStorage, processNewEvents, scheduleServerSync]);

  const enableAutomation = useCallback(async (silent = false) => {
    if (!stateRef.current) return;
    setAutomationBusy(true); userWantsAutomationRef.current = true;
    try {
      await send("enableAutomation", {});
      setAutomationEnabled(true);
      if (!silent) showToast("Zeitautomatik aktiviert – läuft, solange das Spiel geöffnet ist.", "success");
    } catch (e) { if (!silent) showToast("Automatik konnte nicht aktiviert werden: " + (e?.message || "Unbekannt"), "error"); }
    finally { setAutomationBusy(false); }
  }, [send, showToast]);

  const pauseAutomation = useCallback(async (silent = false, reason) => {
    if (!stateRef.current) return;
    setAutomationBusy(true);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const isUserInitiated = !silent;
    if (isUserInitiated) userWantsAutomationRef.current = false;
    try {
      await send("pauseAutomation", { reason: reason || "user" });
      setAutomationEnabled(false);
      if (isUserInitiated) showToast("Zeitautomatik pausiert.", "info");
    } catch (e) { if (isUserInitiated) showToast("Automatik konnte nicht pausiert werden: " + (e?.message || "Unbekannt"), "error"); }
    finally { setAutomationBusy(false); }
  }, [send, showToast]);

  useEffect(() => {
    if (!automationEnabled) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    syncAutomation();
    pollRef.current = setInterval(syncAutomation, 15000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [automationEnabled, syncAutomation]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        // Pausieren und erst danach speichern — sonst bekommt der Server den
        // unpausierten Stand und processAutomationTick treibt ihn weiter voran.
        if (automationEnabled) pauseAutomation(true, "tab_hidden").then(() => syncToServer());
        else syncToServer();
      } else { if (userWantsAutomationRef.current && !automationEnabled && !automationBusy) enableAutomation(true); }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [automationEnabled, automationBusy, enableAutomation, pauseAutomation, syncToServer]);

  useEffect(() => {
    if (!state) return;
    const timer = setInterval(() => syncToServer(), 3 * 60 * 1000);
    return () => clearInterval(timer);
  }, [state, syncToServer]);

  useEffect(() => {
    const onBeforeUnload = () => { if (stateRef.current) saveToStorage(stateRef.current); };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveToStorage]);

  // ---- Startup: Server- und localStorage-Stand abgleichen ----
  // Verhindert, dass ein veralteter lokaler Stand einen neueren Serverstand
  // überschreibt (z.B. wenn processAutomationTick im Hintergrund Zeit vorgetrieben hat).
  useEffect(() => {
    (async () => {
      const sid = localStorage.getItem(LS_STATE_ID);
      const savedState = localStorage.getItem(LS_STATE);
      let localState = null;
      try { localState = savedState ? JSON.parse(savedState) : null; } catch (e) {}

      let chosenState = null;
      let chosenRev = parseInt(localStorage.getItem(LS_SERVER_REV) || "0", 10);

      if (sid) {
        try {
          const serverData = await gameCommand({ command: "load", stateId: sid });
          const serverTime = serverData.state?.gameTime || 0;
          const localTime = localState?.gameTime || 0;
          if (serverTime > localTime) {
            // Serverstand ist zeitlich neuer — verwende ihn.
            chosenState = serverData.state;
            chosenRev = serverData.revision;
          } else {
            // Lokaler Stand ist aktueller (enthält letzte Spielaktionen) — behalte ihn,
            // aber nutze die Server-Revision für den nächsten Save.
            chosenState = localState;
            chosenRev = serverData.revision;
          }
        } catch (e) {
          // Server nicht erreichbar — verwende lokalen Stand.
          chosenState = localState;
        }
      } else {
        chosenState = localState;
      }

      if (chosenState) {
        stateRef.current = chosenState; setState(chosenState);
        if (sid) { stateIdRef.current = sid; setStateId(sid); }
        serverRevRef.current = chosenRev;
        localStorage.setItem(LS_SERVER_REV, String(chosenRev));
        saveToStorage(chosenState);
        setAutomationEnabled(!!chosenState.timeControl?.enabled);
        lastSyncGameTimeRef.current = chosenState.gameTime || 0;
        lastSyncRealMsRef.current = Date.now();
        prevAchievementsRef.current = new Set((chosenState.achievements || []).filter(a => a.unlocked).map(a => a.id));
        processNewEvents(chosenState);
        if (chosenState.timeControl?.enabled) {
          const paused = await applyCommandRemote({ state: stateRef.current, command: "pauseAutomation", params: { reason: "loaded" } });
          stateRef.current = paused.state; setState(paused.state); saveToStorage(paused.state);
          setAutomationEnabled(false);
        }
        userWantsAutomationRef.current = false;
      }
      setLoading(false);
    })();
  }, [processNewEvents, saveToStorage]);

  useEffect(() => {
    if (stateId) { isInitialLoadRef.current = true; seenEventIdsRef.current = new Set(); lastEventSeqRef.current = 0; setToasts([]); setUnseenCount(0); setDirty(false); }
  }, [stateId]);

  // ---- Hintergrund-Check: Server-State verifizieren, localStorage ggf. leeren ----
  useEffect(() => {
    if (!stateId || loading) return;
    let cancelled = false;
    (async () => {
      try {
        await gameCommand({ command: "load", stateId });
      } catch (e) {
        if (cancelled) return;
        if (e?.message && e.message.includes("Kein Zugriff")) {
          localStorage.removeItem(LS_STATE);
          localStorage.removeItem(LS_STATE_ID);
          localStorage.removeItem(LS_SERVER_REV);
          stateRef.current = null;
          setState(null);
          setStateId(null);
          stateIdRef.current = null;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [stateId, loading]);

  const markAllEventsSeen = useCallback(async () => {
    if (!stateRef.current) return;
    try { await send("markAllEventsSeen", {}); setUnseenCount(0); } catch (e) {}
  }, [send]);

  const newGame = useCallback(async (names) => {
    setBusy(true);
    try {
      const action_id = crypto.randomUUID ? crypto.randomUUID() : "a_" + Date.now();
      const data = await gameCommand({ command: "newGame", action_id, params: names || {} });
      stateRef.current = data.state; setState(data.state);
      stateIdRef.current = data.stateId; setStateId(data.stateId);
      serverRevRef.current = data.revision;
      localStorage.setItem(LS_STATE_ID, data.stateId);
      localStorage.setItem(LS_SERVER_REV, String(data.revision));
      saveToStorage(data.state);
      setAutomationEnabled(!!data.state.timeControl?.enabled);
      lastSyncGameTimeRef.current = data.state.gameTime || 0;
      lastSyncRealMsRef.current = Date.now();
      prevAchievementsRef.current = new Set((data.state.achievements || []).filter(a => a.unlocked).map(a => a.id));
      processNewEvents(data.state);
      return data;
    } finally { setBusy(false); }
  }, [saveToStorage, processNewEvents]);

  const listGames = useCallback(async () => await gameCommand({ command: "list" }), []);

  const loadGame = useCallback(async (sid) => {
    const data = await gameCommand({ command: "load", stateId: sid });
    stateRef.current = data.state; setState(data.state);
    stateIdRef.current = sid; setStateId(sid); serverRevRef.current = data.revision;
    localStorage.setItem(LS_STATE_ID, sid); localStorage.setItem(LS_SERVER_REV, String(data.revision));
    saveToStorage(data.state);
    setAutomationEnabled(!!data.state.timeControl?.enabled);
    lastSyncGameTimeRef.current = data.state.gameTime || 0;
    prevAchievementsRef.current = new Set((data.state.achievements || []).filter(a => a.unlocked).map(a => a.id));
    processNewEvents(data.state);
    if (data.state.timeControl?.enabled) {
      const paused = await applyCommandRemote({ state: stateRef.current, command: "pauseAutomation", params: { reason: "loaded" } });
      stateRef.current = paused.state; setState(paused.state); saveToStorage(paused.state);
      setAutomationEnabled(false);
    }
    userWantsAutomationRef.current = false;
  }, [saveToStorage, processNewEvents]);

  const reload = useCallback(async () => {
    const savedState = localStorage.getItem(LS_STATE);
    if (savedState) { try { const parsed = JSON.parse(savedState); stateRef.current = parsed; setState(parsed); processNewEvents(parsed); } catch (e) {} }
  }, [processNewEvents]);

  const save = useCallback(async () => { await syncToServer(); }, [syncToServer]);

  const value = {
    state, revision, stateId, loading, busy, toast, showToast, send, newGame, listGames, loadGame, reload,
    motionEnabled, toggleMotion, overlay, dismissOverlay,
    automationEnabled, automationBusy, enableAutomation, pauseAutomation,
    displayGameTime,
    dirty, save, saving,
    toasts, dismissToast, unseenCount, markAllEventsSeen, connectionState,
  };
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}