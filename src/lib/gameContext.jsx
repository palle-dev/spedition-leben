import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
// Simulations-Engine läuft in einem Web Worker – der Haupt-Thread
// bleibt für UI und Rendering frei, auch bei großen Flotten.
const simWorker = new Worker(new URL("./simulationWorker.js", import.meta.url), { type: "module" });
let _workerMsgId = 0;
const _workerPending = new Map();
const _workerProgress = new Map();
simWorker.onmessage = (e) => {
  const { id, data, type, progress } = e.data;
  if (type === "progress") {
    const cb = _workerProgress.get(id);
    if (cb) cb(progress);
    return;
  }
  const resolver = _workerPending.get(id);
  if (resolver) { _workerPending.delete(id); _workerProgress.delete(id); resolver(data); }
};
simWorker.onerror = (e) => {
  // Worker-Absturz: alle pending Promises mit Fehler auflösen
  for (const [id, resolver] of _workerPending) {
    _workerPending.delete(id);
    _workerProgress.delete(id);
    resolver({ error: "Simulations-Worker abgestürzt: " + (e.message || "Unbekannter Fehler") });
  }
};
function executeInWorker(state, command, params, onProgress) {
  const id = ++_workerMsgId;
  return new Promise((resolve) => {
    if (onProgress) _workerProgress.set(id, onProgress);
    _workerPending.set(id, resolve);
    simWorker.postMessage({ id, state, command, params });
  });
}
import { saveCurrent, loadCurrent, saveAutosave, loadAutosave, getAllAutosaveMetas, listManualSlots, saveManualSlot, loadManualSlot, deleteManualSlot, exportSave, importSave } from "@/lib/persistence";
import { acquireLock, refreshLock, releaseLock, LOCK_REFRESH } from "@/lib/tabLock";
import { eventToToast } from "@/lib/eventNotifications";
import { getUnseenEventCount } from "@/lib/eventLogClient";

const GameContext = createContext(null);
const GameActionsContext = createContext(null);

export function useGame() {
  const ctx = useContext(GameContext);
  const actions = useContext(GameActionsContext);
  if (!ctx) throw new Error("useGame muss innerhalb von GameProvider verwendet werden");
  return { ...ctx, ...actions };
}

export function useGameActions() {
  const ctx = useContext(GameActionsContext);
  if (!ctx) throw new Error("useGameActions muss innerhalb von GameProvider verwendet werden");
  return ctx;
}

const LS_STATE = "spedition_leben_state";

export function GameProvider({ children }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [motionEnabled, setMotionEnabled] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return true;
  });
  const [overlay, setOverlay] = useState(null);
  const [showStart, setShowStart] = useState(true);
  const prevAchievementsRef = useRef(new Set());
  const pendingAchievementsRef = useRef([]);
  const stateRef = useRef(null);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [displayGameTime, setDisplayGameTime] = useState(0);
  const userWantsAutomationRef = useRef(false);
  const lastSyncGameTimeRef = useRef(0);
  const lastSyncRealMsRef = useRef(0);
  const clockIntervalRef = useRef(null);
  const pollRef = useRef(null);
  const [toasts, setToasts] = useState([]);
  const [unseenCount, setUnseenCount] = useState(0);
  const seenEventIdsRef = useRef(new Set());
  const lastEventSeqRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const syncInFlightRef = useRef(false);
  const sendInFlightRef = useRef(false);
  const [hasLock, setHasLock] = useState(true);
  const hasLockRef = useRef(true);
  const autosaveIndexRef = useRef(0);
  const dirtyAutosaveRef = useRef(false);
  const [autosaveMetas, setAutosaveMetas] = useState([null, null, null]);
  const [backgroundAdvance, setBackgroundAdvance] = useState(null);
  const backgroundAdvanceRef = useRef(false);

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

  const dismissStart = useCallback(() => setShowStart(false), []);

  // Dirty-Flag für debounced Speicherung — verhindert I/O auf jeden Befehl.
  const dirtySaveRef = useRef(false);

  // Sofortiges Speichern (für kritische Operationen: newGame, loadSlot, beforeunload).
  const saveNow = useCallback(async (s) => {
    try { localStorage.setItem(LS_STATE, JSON.stringify(s)); } catch (e) {}
    if (!hasLockRef.current) return;
    try { await saveCurrent(s); } catch (e) {}
    dirtyAutosaveRef.current = true;
  }, []);

  // Markiert den Zustand als geändert — Speicherung erfolgt debounced (alle 3 s).
  const markDirty = useCallback(() => {
    dirtySaveRef.current = true;
  }, []);

  const processNewEvents = useCallback((newState) => {
    const events = newState.events || [];
    if (isInitialLoadRef.current) {
      for (const ev of events) { seenEventIdsRef.current.add(ev.id); if (ev.seq > lastEventSeqRef.current) lastEventSeqRef.current = ev.seq; }
      isInitialLoadRef.current = false;
    } else {
      // Events sind sortiert (seq aufsteigend) — vom Ende iterieren bis
      // der letzte verarbeitete seq erreicht ist. O(k) statt O(n).
      const newToasts = [];
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i];
        if (ev.seq <= lastEventSeqRef.current) break;
        if (seenEventIdsRef.current.has(ev.id)) { if (ev.seq > lastEventSeqRef.current) lastEventSeqRef.current = ev.seq; continue; }
        const t = eventToToast(ev);
        if (t) newToasts.unshift(t);
        seenEventIdsRef.current.add(ev.id);
        if (ev.seq > lastEventSeqRef.current) lastEventSeqRef.current = ev.seq;
      }
      if (newToasts.length > 0) setToasts(prev => [...prev, ...newToasts].slice(-20));
    }
    setUnseenCount(getUnseenEventCount(newState));
  }, []);

  const processResult = useCallback(async (newState, result, command) => {
    // Lieferungen werden nur gebucht (in der Engine) und als Toast angezeigt —
    // kein modales Overlay mehr. Toast erfolgt über processNewEvents → eventToToast.
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

  // ---- Befehl lokal ausführen (kein Netzwerk) ----
  const send = useCallback(async (command, params, onProgress) => {
    while (syncInFlightRef.current || backgroundAdvanceRef.current) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!stateRef.current) throw new Error("Kein Spielstand geladen");
    setBusy(true); sendInFlightRef.current = true;
    try {
      const data = await executeInWorker(stateRef.current, command, params || {}, onProgress);
      if (!data) throw new Error("Simulations-Worker hat keine Antwort gesendet.");
      if (data.error) throw new Error(data.error);
      const newState = data.state; const result = data.result;
      stateRef.current = newState; setState(newState);
      markDirty();
      processNewEvents(newState);
      await processResult(newState, result, command);
      return result;
    } catch (e) {
      showToast(e.message, "error");
      throw e;
    } finally { setBusy(false); sendInFlightRef.current = false; }
  }, [markDirty, processNewEvents, processResult, showToast]);

  // ---- Tagesvorlauf im Hintergrund (nicht-blockierend) ----
  // Der Tagesvorlauf läuft im Worker, während der Spieler weiter navigieren
  // und Menüs nutzen kann. send() wird blockiert, bis der Vorlauf fertig ist.
  const startBackgroundAdvance = useCallback(async (minutes) => {
    if (!stateRef.current || backgroundAdvanceRef.current || sendInFlightRef.current) return;
    backgroundAdvanceRef.current = true;
    setBackgroundAdvance({ active: true, progress: null, result: null });
    try {
      const data = await executeInWorker(stateRef.current, "advanceTime", { minutes }, (progress) => {
        setBackgroundAdvance(prev => prev ? { ...prev, progress } : prev);
      });
      if (!data) throw new Error("Simulations-Worker hat keine Antwort gesendet.");
      if (data.error) throw new Error(data.error);
      const newState = data.state; const result = data.result;
      stateRef.current = newState; setState(newState);
      markDirty();
      processNewEvents(newState);
      await processResult(newState, result, "advanceTime");
      setBackgroundAdvance({ active: false, progress: null, result });
    } catch (e) {
      showToast(e.message, "error");
      setBackgroundAdvance({ active: false, progress: null, result: null, error: e.message });
    } finally {
      backgroundAdvanceRef.current = false;
    }
  }, [markDirty, processNewEvents, processResult, showToast]);

  // ---- Zeitautomatik (lokal) ----
  const syncAutomation = useCallback(async () => {
    if (!stateRef.current || syncInFlightRef.current || sendInFlightRef.current || backgroundAdvanceRef.current) return;
    syncInFlightRef.current = true;
    try {
      const data = await executeInWorker(stateRef.current, "syncAutomation", {});
      if (!data) throw new Error("Simulations-Worker hat keine Antwort gesendet.");
      if (data.error) throw new Error(data.error);
      const newState = data.state;
      stateRef.current = newState; setState(newState);
      markDirty();
      processNewEvents(newState);
      lastSyncGameTimeRef.current = newState.gameTime;
      lastSyncRealMsRef.current = Date.now();
    } catch (e) {
      // Automatik-Fehler werden nicht angezeigt
    } finally { syncInFlightRef.current = false; }
  }, [markDirty, processNewEvents]);

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
        if (automationEnabled) pauseAutomation(true, "tab_hidden");
      } else { if (userWantsAutomationRef.current && !automationEnabled && !automationBusy) enableAutomation(true); }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [automationEnabled, automationBusy, enableAutomation, pauseAutomation]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (stateRef.current) {
        saveNow(stateRef.current);
        if (hasLockRef.current) {
          saveAutosave(autosaveIndexRef.current, stateRef.current).catch(() => {});
          releaseLock();
        }
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveNow]);

  // ---- Rotierende Autosaves (alle 60 s bei Änderung) ----
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!dirtyAutosaveRef.current || !stateRef.current || !hasLockRef.current) return;
      dirtyAutosaveRef.current = false;
      const idx = autosaveIndexRef.current;
      try {
        await saveAutosave(idx, stateRef.current);
        autosaveIndexRef.current = (idx + 1) % 3;
        setAutosaveMetas(await getAllAutosaveMetas());
      } catch (e) {}
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // ---- Debounced Speicherung (alle 3 s bei Änderung) ----
  // Verhindert localStorage/IndexedDB-I/O auf jeden Befehl. Der Zustand wird
  // nur geschrieben, wenn er sich geändert hat, höchstens alle 3 Sekunden.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!dirtySaveRef.current || !stateRef.current) return;
      dirtySaveRef.current = false;
      const s = stateRef.current;
      try { localStorage.setItem(LS_STATE, JSON.stringify(s)); } catch (e) {}
      if (hasLockRef.current) { try { await saveCurrent(s); } catch (e) {} }
      dirtyAutosaveRef.current = true;
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // ---- Tab-Schreibsperre über localStorage ----
  useEffect(() => {
    const acquired = acquireLock();
    hasLockRef.current = acquired;
    setHasLock(acquired);
    const heartbeat = setInterval(() => {
      if (hasLockRef.current) refreshLock();
      else {
        const got = acquireLock();
        if (got) { hasLockRef.current = true; setHasLock(true); }
      }
    }, LOCK_REFRESH);
    return () => { clearInterval(heartbeat); releaseLock(); };
  }, []);

  // ---- Startup: IndexedDB laden ----
  useEffect(() => {
    (async () => {
      let localState = null;
      try { localState = await loadCurrent(); } catch (e) {}
      if (!localState) {
        const savedState = localStorage.getItem(LS_STATE);
        if (savedState) { try { localState = JSON.parse(savedState); } catch (e) {} }
      }

      if (localState) {
        stateRef.current = localState; setState(localState);
        saveNow(localState);
        setAutomationEnabled(!!localState.timeControl?.enabled);
        lastSyncGameTimeRef.current = localState.gameTime || 0;
        lastSyncRealMsRef.current = Date.now();
        prevAchievementsRef.current = new Set((localState.achievements || []).filter(a => a.unlocked).map(a => a.id));
        processNewEvents(localState);
        if (localState.timeControl?.enabled) {
          const paused = await executeInWorker(stateRef.current, "pauseAutomation", { reason: "loaded" });
          if (paused && !paused.error) {
            stateRef.current = paused.state; setState(paused.state); saveNow(paused.state);
          }
          setAutomationEnabled(false);
        }
        userWantsAutomationRef.current = false;
      }
      try { setAutosaveMetas(await getAllAutosaveMetas()); } catch (e) {}
      setLoading(false);
    })();
  }, [processNewEvents, saveNow]);

  const markAllEventsSeen = useCallback(async () => {
    if (!stateRef.current) return;
    try { await send("markAllEventsSeen", {}); setUnseenCount(0); } catch (e) {}
  }, [send]);

  const newGame = useCallback(async (names) => {
    setBusy(true);
    try {
      const data = await executeInWorker(null, "newGame", names || {});
      if (data.error) throw new Error(data.error);
      const newState = data.state;
      stateRef.current = newState; setState(newState);
      setShowStart(false);
      saveNow(newState);
      setAutomationEnabled(!!newState.timeControl?.enabled);
      lastSyncGameTimeRef.current = newState.gameTime || 0;
      lastSyncRealMsRef.current = Date.now();
      prevAchievementsRef.current = new Set((newState.achievements || []).filter(a => a.unlocked).map(a => a.id));
      processNewEvents(newState);
      return { ok: true };
    } catch (e) {
      showToast(e.message, "error");
      throw e;
    } finally { setBusy(false); }
  }, [saveNow, processNewEvents, showToast]);

  const reload = useCallback(async () => {
    let loaded = null;
    try { loaded = await loadCurrent(); } catch (e) {}
    if (!loaded) {
      const savedState = localStorage.getItem(LS_STATE);
      if (savedState) { try { loaded = JSON.parse(savedState); } catch (e) {} }
    }
    if (loaded) { stateRef.current = loaded; setState(loaded); processNewEvents(loaded); }
  }, [processNewEvents]);

  // ---- Export / Import / Manuelle Slots ----
  const exportGame = useCallback(() => {
    if (!stateRef.current) return null;
    return exportSave(stateRef.current);
  }, []);

  const importGame = useCallback(async (exportStr) => {
    try {
      const imported = importSave(exportStr);
      stateRef.current = imported; setState(imported);
      setShowStart(false);
      saveNow(imported);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [saveNow]);

  const saveSlot = useCallback(async (name) => {
    if (!stateRef.current) return { ok: false, error: "Kein Spielstand" };
    try { await saveManualSlot(name, stateRef.current); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  }, []);

  const loadSlot = useCallback(async (name) => {
    try {
      const loaded = await loadManualSlot(name);
      if (!loaded) return { ok: false, error: "Slot nicht gefunden" };
      stateRef.current = loaded; setState(loaded);
      setShowStart(false);
      saveNow(loaded);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [saveNow]);

  const deleteSlot = useCallback(async (name) => {
    try { await deleteManualSlot(name); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  }, []);

  const listSlots = useCallback(async () => {
    try { return await listManualSlots(); }
    catch (e) { return []; }
  }, []);

  const loadAutosaveSlot = useCallback(async (index) => {
    try {
      const loaded = await loadAutosave(index);
      if (!loaded) return { ok: false, error: "Autosave-Slot leer" };
      stateRef.current = loaded; setState(loaded);
      setShowStart(false);
      saveNow(loaded);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [saveNow]);

  const dismissBackgroundAdvanceResult = useCallback(() => {
    setBackgroundAdvance(null);
  }, []);

  // Actions sind stabil (alle Callbacks haben stabile Deps) — eigener Context,
  // damit Komponenten, die nur Aktionen brauchen, nicht bei jeder Zustandsänderung
  // neu rendern.
  const actions = useMemo(() => ({
    send, newGame, reload,
    enableAutomation, pauseAutomation,
    startBackgroundAdvance, dismissBackgroundAdvanceResult,
    markAllEventsSeen,
    showToast, dismissToast, dismissOverlay, dismissStart, toggleMotion,
    exportGame, importGame, saveSlot, loadSlot, deleteSlot, listSlots, loadAutosaveSlot,
  }), [
    send, newGame, reload,
    enableAutomation, pauseAutomation,
    startBackgroundAdvance, dismissBackgroundAdvanceResult,
    markAllEventsSeen,
    showToast, dismissToast, dismissOverlay, dismissStart, toggleMotion,
    exportGame, importGame, saveSlot, loadSlot, deleteSlot, listSlots, loadAutosaveSlot,
  ]);

  const value = {
    state, loading, busy, toast,
    motionEnabled, overlay,
    automationEnabled, automationBusy,
    displayGameTime,
    dirty: false, save: async () => {}, saving: false,
    toasts, unseenCount,
    showStart,
    connectionState: "connected",
    hasLock, autosaveMetas,
    backgroundAdvance,
  };
  return (
    <GameActionsContext.Provider value={actions}>
      <GameContext.Provider value={value}>{children}</GameContext.Provider>
    </GameActionsContext.Provider>
  );
}