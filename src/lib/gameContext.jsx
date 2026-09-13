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
      if (e.conflict && e.current_revision != null) { serverRevRef.current = e.current_revision; localStorage.setItem(LS_SERVER_REV, String(e.current_revision)); }
      dirtyRef.current = true; setDirty(true);
      syncFailCountRef.current++;
      if (syncFailCountRef.current >= 3) setConnectionState("reconnecting");
    } finally { setSaving(false); }
  }, []);

  const scheduleServerSync = useCallback(() => {
    dirtyRef.current = true; setDirty(true);
    if (syncTimerRef.current) return;
    syncTimerRef.current = setTimeout(() => { syncTimerRef.current = null; syncToServer(); }, 10000);
  }, [syncToServer]);

  // ---- Befehl über applyCommandRemote (Simulation serverseitig, kein DB-Zugriff) ----
  const send = useCallback(async (command, params) => {
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
      if (!data.result.events || data.result.events.length === 0) { syncInFlightRef.current = false; return; }
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
      if (document.hidden) { if (automationEnabled) pauseAutomation(true, "tab_hidden"); syncToServer(); }
      else { if (userWantsAutomationRef.current && !automationEnabled && !automationBusy) enableAutomation(true); }
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

  // ---- Startup: localStorage laden ----
  useEffect(() => {
    (async () => {
      const savedState = localStorage.getItem(LS_STATE);
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          stateRef.current = parsed; setState(parsed);
          const sid = localStorage.getItem(LS_STATE_ID);
          if (sid) { stateIdRef.current = sid; setStateId(sid); serverRevRef.current = parseInt(localStorage.getItem(LS_SERVER_REV) || "0", 10); }
          setAutomationEnabled(!!parsed.timeControl?.enabled);
          lastSyncGameTimeRef.current = parsed.gameTime || 0;
          lastSyncRealMsRef.current = Date.now();
          prevAchievementsRef.current = new Set((parsed.achievements || []).filter(a => a.unlocked).map(a => a.id));
          processNewEvents(parsed);
          if (parsed.timeControl?.enabled) {
            const data = await applyCommandRemote({ state: stateRef.current, command: "pauseAutomation", params: { reason: "loaded" } });
            stateRef.current = data.state; setState(data.state); saveToStorage(data.state);
            setAutomationEnabled(false);
          }
          userWantsAutomationRef.current = false;
        } catch (e) {}
      } else {
        const sid = localStorage.getItem(LS_STATE_ID);
        if (sid) {
          try {
            const data = await gameCommand({ command: "load", stateId: sid });
            stateRef.current = data.state; setState(data.state);
            stateIdRef.current = sid; setStateId(sid); serverRevRef.current = data.revision;
            localStorage.setItem(LS_SERVER_REV, String(data.revision));
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
          } catch (e) {}
        }
      }
      setLoading(false);
    })();
  }, [processNewEvents, saveToStorage]);

  useEffect(() => {
    if (stateId) { isInitialLoadRef.current = true; seenEventIdsRef.current = new Set(); lastEventSeqRef.current = 0; setToasts([]); setUnseenCount(0); setDirty(false); }
  }, [stateId]);

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