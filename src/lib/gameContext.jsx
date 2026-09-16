import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { saveCurrent, loadCurrent, saveAutosave, loadAutosave, getAllAutosaveMetas, listManualSlots, saveManualSlot, loadManualSlot, deleteManualSlot, deleteAutosave, exportSave, importSave, getSyncMeta, setSyncMeta, clearSyncMeta, hasUnassignedSaves, claimUnassignedSaves } from "@/lib/persistence";
import { acquireLock, refreshLock, releaseLock, LOCK_REFRESH } from "@/lib/tabLock";
import { eventToToast } from "@/lib/eventNotifications";
import { getUnseenEventCount } from "@/lib/eventLogClient";
import { useAuth } from "@/lib/AuthContext";
import { listCloudSaves, loadCloudSave, createCloudSave, saveCloudSave, deleteCloudSave, CloudSyncQueue, generatePartyId, makeSyncMeta } from "@/lib/cloudSync";
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
function executeInWorker(state, command, params, onProgress, diag) {
  const id = ++_workerMsgId;
  const tSend = performance.now();
  let stateSize = 0;
  try { stateSize = new Blob([JSON.stringify(state)]).size; } catch(e) {}
  return new Promise((resolve) => {
    if (onProgress) _workerProgress.set(id, onProgress);
    _workerPending.set(id, (data) => {
      if (diag) {
        diag.workerMs = performance.now() - tSend;
        diag.stateSizeKb = Math.round(stateSize / 1024);
      }
      resolve(data);
    });
    simWorker.postMessage({ id, state, command, params });
  });
}

const GameContext = createContext(null);
const GameActionsContext = createContext(null);
const DisplayGameTimeContext = createContext(null);

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

export function useDisplayGameTime() {
  return useContext(DisplayGameTimeContext);
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
  const { user: authUser } = useAuth();
  const userIdRef = useRef(null);
  const prevUserIdRef = useRef(null);
  const autosaveIndexRef = useRef(0);
  const cloudSyncQueueRef = useRef(null);
  const syncMetaRef = useRef(null);
  const [syncMeta, setSyncMeta] = useState(null);
  const [cloudSaves, setCloudSaves] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const cloudDirtyRef = useRef(false);
  const cloudUploadCounterRef = useRef(0);
  const dirtyAutosaveRef = useRef(false);
  const [autosaveMetas, setAutosaveMetas] = useState([null, null, null]);
  const [backgroundAdvance, setBackgroundAdvance] = useState(null);
  const backgroundAdvanceRef = useRef(false);
  const diagRef = useRef(null);

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
    try { await saveCurrent(userIdRef.current, s); } catch (e) {}
    dirtyAutosaveRef.current = true;
    cloudDirtyRef.current = true;
  }, []);

  // Markiert den Zustand als geändert — Speicherung erfolgt debounced (alle 3 s).
  const markDirty = useCallback(() => {
    dirtySaveRef.current = true;
    cloudDirtyRef.current = true;
  }, []);

  // ---- Cloud-Synchronisation ----
  // Der Client ist die einzige Simulationsinstanz. Die Cloud speichert
  // bestätigte Snapshots. Upload nur bei geänderten Speicherpunkten,
  // nicht bei jeder Spielminute.

  if (!cloudSyncQueueRef.current) cloudSyncQueueRef.current = new CloudSyncQueue();

  const updateSyncMeta = useCallback((updater) => {
    const current = syncMetaRef.current || makeSyncMeta(null, null, 0, "idle", null, null);
    const updated = typeof updater === "function" ? updater(current) : { ...current, ...updater };
    syncMetaRef.current = updated;
    setSyncMeta(updated);

    return updated;
  }, []);

  // Stellt sicher, dass der Zustand eine partyId hat (generiert falls fehlt).
  const ensurePartyId = useCallback((s) => {
    if (!s) return s;
    if (!s.meta) s.meta = {};
    if (!s.meta.partyId) {
      s.meta.partyId = generatePartyId();
      s.meta.createdAt = Date.now();
    }
    return s;
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

  // Cloud-Upload eines vollständigen, konsistenten Speicherpunkts.
  // Verwendet die Queue — nur ein Upload gleichzeitig, verspätete Antworten
  // werden verworfen. localBaseRevision wird nur nach Bestätigung aktualisiert.
  const uploadToCloud = useCallback(async (s, saveLabel, saveType) => {
    if (!userIdRef.current || !s) return { skipped: true };
    const partyId = s.meta?.partyId;
    if (!partyId) return { skipped: true };
    const meta = syncMetaRef.current || makeSyncMeta(partyId, null, 0, "idle", null, null);

    updateSyncMeta({ status: "uploading", lastError: null });

    try {
      const task = async () => {
        if (!meta.cloudId) {
          // Erster Upload: Cloud-Datensatz erstellen
          const res = await createCloudSave(s, partyId, saveLabel, saveType || "new");
          if (res.error) throw new Error(res.error);
          return { cloudId: res.stateId, revision: res.revision, isNew: true };
        }
        // Bestehenden Datensatz mit Revisionsprüfung aktualisieren
        const res = await saveCloudSave(meta.cloudId, s, meta.localBaseRevision, saveLabel, saveType || "auto");
        if (res.error) {
          if (res.conflict) {
            return { conflict: true, currentRevision: res.current_revision, cloudMeta: res.cloud_meta };
          }
          throw new Error(res.error);
        }
        return { cloudId: meta.cloudId, revision: res.revision, isNew: false };
      };

      const result = await cloudSyncQueueRef.current.enqueue(task);
      if (result.stale) return { skipped: true };

      if (result.conflict) {
        updateSyncMeta({ status: "conflict", lastError: "Cloud-Stand wurde auf einem anderen Gerät geändert" });
        return { conflict: true, currentRevision: result.currentRevision, cloudMeta: result.cloudMeta };
      }

      // Erfolg: localBaseRevision und cloudId aktualisieren
      updateSyncMeta({
        partyId,
        cloudId: result.cloudId,
        localBaseRevision: result.revision,
        status: "synced",
        lastCloudSyncAt: Date.now(),
        lastError: null,
      });
      return { ok: true, revision: result.revision };
    } catch (e) {
      const isOffline = e.message?.includes("Network") || e.message?.includes("Failed to fetch") || !navigator.onLine;
      updateSyncMeta({ status: isOffline ? "offline" : "error", lastError: e.message });
      return { error: e.message };
    }
  }, [updateSyncMeta]);

  // Cloud-Spielstände auflisten (für geräteübergreifendes Fortsetzen)
  const refreshCloudSaves = useCallback(async () => {
    if (!userIdRef.current) return;
    setCloudLoading(true);
    try {
      const res = await listCloudSaves();
      if (res.saves) setCloudSaves(res.saves);
    } catch (e) {
      // Offline oder Fehler — still, lokale Partie bleibt nutzbar
    } finally {
      setCloudLoading(false);
    }
  }, []);

  // Cloud-Spielstand laden (geräteübergreifendes Fortsetzen)
  const loadCloudGame = useCallback(async (cloudId) => {
    setBusy(true);
    try {
      const res = await loadCloudSave(cloudId);
      if (res.error) throw new Error(res.error);
      const loaded = res.state;
      ensurePartyId(loaded);
      // Sync-Meta aus der Cloud-Antwort übernehmen
      const newMeta = makeSyncMeta(
        loaded.meta?.partyId || res.party_id,
        cloudId,
        res.revision,
        "synced",
        Date.now(),
        null
      );
      syncMetaRef.current = newMeta;
      setSyncMeta(newMeta);

      stateRef.current = loaded; setState(loaded);
      setShowStart(false);
      saveNow(loaded);
      setAutomationEnabled(false);
      lastSyncGameTimeRef.current = loaded.gameTime || 0;
      lastSyncRealMsRef.current = Date.now();
      prevAchievementsRef.current = new Set((loaded.achievements || []).filter(a => a.unlocked).map(a => a.id));
      processNewEvents(loaded);
      return { ok: true };
    } catch (e) {
      showToast(e.message, "error");
      return { ok: false, error: e.message };
    } finally { setBusy(false); }
  }, [ensurePartyId, saveNow, processNewEvents, showToast]);

  // Cloud-Spielstand löschen
  const deleteCloudGame = useCallback(async (cloudId) => {
    try {
      await deleteCloudSave(cloudId);
      setCloudSaves(prev => prev.filter(s => s.id !== cloudId));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, []);

  // Konflikt auflösen: beide Fassungen behalten (lokale als neue Partie in Cloud)
  const resolveConflictKeepBoth = useCallback(async () => {
    if (!stateRef.current) return;
    const localState = stateRef.current;
    const oldPartyId = localState.meta?.partyId;
    // Neue partyId für die lokale Fassung — sie wird zu einer eigenen Partie
    const newPartyId = generatePartyId();
    localState.meta = localState.meta || {};
    localState.meta.partyId = newPartyId;
    localState.meta.forkedFrom = oldPartyId;
    localState.meta.forkedAt = Date.now();
    // Neue Cloud-Aufzeichnung für die lokale Fassung erstellen
    const newMeta = makeSyncMeta(newPartyId, null, 0, "idle", null, null);
    syncMetaRef.current = newMeta;
    setSyncMeta(newMeta);
    if (userIdRef.current) setSyncMeta(userIdRef.current, newMeta).catch(() => {});
    saveNow(localState);
    await uploadToCloud(localState, "Konflikt-Kopie (lokal)", "conflict_backup");
    return { ok: true };
  }, [saveNow, uploadToCloud]);

  // Konflikt auflösen: mit lokaler Fassung fortsetzen (Cloud überschreiben)
  const resolveConflictKeepLocal = useCallback(async () => {
    if (!stateRef.current) return;
    // Vor dem Überschreiben erneut Cloud-Revision prüfen
    const meta = syncMetaRef.current;
    if (!meta?.cloudId) return;
    try {
      const res = await loadCloudSave(meta.cloudId);
      if (res.error) throw new Error(res.error);
      if (res.revision !== meta.localBaseRevision) {
        // Cloud hat sich erneut geändert — Konflikt bleibt bestehen
        updateSyncMeta({ status: "conflict", localBaseRevision: res.revision, lastError: "Cloud-Stand hat sich erneut geändert" });
        return { ok: false, error: "Cloud-Stand hat sich erneut geändert — bitte erneut prüfen" };
      }
    } catch (e) {
      return { ok: false, error: e.message };
    }
    // Erneut mit aktueller Revision hochladen
    const r = await uploadToCloud(stateRef.current, "Konflikt-Auflösung (lokal gewählt)", "manual");
    return r;
  }, [uploadToCloud, updateSyncMeta]);

  // Konflikt auflösen: mit Cloud-Fassung fortsetzen (lokal überschreiben)
  const resolveConflictKeepCloud = useCallback(async () => {
    const meta = syncMetaRef.current;
    if (!meta?.cloudId) return;
    try {
      // Aktuelle lokale Fassung als Backup sichern
      if (stateRef.current && userIdRef.current) {
        const backupName = "Backup_vor_Cloud_" + new Date().toLocaleString("de-DE").replace(/[.,\s]/g, "_");
        await saveManualSlot(userIdRef.current, backupName, stateRef.current);
      }
      const res = await loadCloudSave(meta.cloudId);
      if (res.error) throw new Error(res.error);
      const loaded = res.state;
      ensurePartyId(loaded);
      const newMeta = makeSyncMeta(loaded.meta?.partyId, meta.cloudId, res.revision, "synced", Date.now(), null);
      syncMetaRef.current = newMeta;
      setSyncMeta(newMeta);

      stateRef.current = loaded; setState(loaded);
      saveNow(loaded);
      processNewEvents(loaded);
      return { ok: true };
    } catch (e) {
      showToast(e.message, "error");
      return { ok: false, error: e.message };
    }
  }, [ensurePartyId, saveNow, processNewEvents, showToast]);

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
  const startBackgroundAdvance = useCallback(async (minutes, diag) => {
    if (backgroundAdvanceRef.current) return;
    const tClick = performance.now();
    // bgRef VOR der Warteschleife setzen: verhindert, dass der Nutzer
    // erneut klickt (Button wird sofort disabled) und dass syncAutomation
    // während der Wartezeit neu startet (syncAutomation prüft bgRef).
    backgroundAdvanceRef.current = true;
    setBackgroundAdvance({ active: true, progress: null, result: null });
    // Auf bereits laufende syncAutomation- oder send-Aufrufe warten.
    // Ein bereits im Worker laufender syncAutomation-Tick muss erst
    // fertig werden, damit stateRef.current den aktualisierten Zustand
    // hat — sonst würde der Vorlauf auf einem veralteten Zustand arbeiten.
    let waitPolls = 0;
    const tWaitStart = performance.now();
    while (syncInFlightRef.current || sendInFlightRef.current) {
      waitPolls++;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const tWaitEnd = performance.now();
    if (!stateRef.current) {
      backgroundAdvanceRef.current = false;
      setBackgroundAdvance({ active: false, progress: null, result: null });
      return;
    }
    try {
      const data = await executeInWorker(stateRef.current, "advanceTime", { minutes }, (progress) => {
        setBackgroundAdvance(prev => prev ? { ...prev, progress } : prev);
      }, diag);
      const tRecv = performance.now();
      if (!data) throw new Error("Simulations-Worker hat keine Antwort gesendet.");
      if (data.error) throw new Error(data.error);
      const newState = data.state; const result = data.result;
      stateRef.current = newState; setState(newState);
      markDirty();
      processNewEvents(newState);
      await processResult(newState, result, "advanceTime");
      const tProcessEnd = performance.now();
      if (diag) {
        diag.waitMs = tWaitEnd - tWaitStart;
        diag.waitPolls = waitPolls;
        diag.processMs = tProcessEnd - tRecv;
        diag.totalMs = tProcessEnd - tClick;
      }
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
          saveAutosave(userIdRef.current, autosaveIndexRef.current, stateRef.current).catch(() => {});
          // Best-Effort Cloud-Upload beim Schließen (kann asynchron nicht awaited werden)
          if (navigator.onLine && syncMetaRef.current?.cloudId) {
            uploadToCloud(stateRef.current, null, "auto").catch(() => {});
          }
          releaseLock();
        }
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveNow, uploadToCloud]);

  // ---- Online/Offline-Event-Handling ----
  // Bei Wiederherstellung der Verbindung: Cloud-Revision prüfen,
  // nicht einfach Cloud überschreiben. Bei Konflikt Status setzen.
  useEffect(() => {
    const onOnline = () => {
      // Cloud-Spielstände neu laden und Sync prüfen
      refreshCloudSaves();
      if (stateRef.current && syncMetaRef.current?.cloudId) {
        // Cloud-Revision prüfen vor erneutem Upload
        loadCloudSave(syncMetaRef.current.cloudId).then(res => {
          if (!res.error && res.revision > syncMetaRef.current.localBaseRevision) {
            updateSyncMeta({ status: "conflict", lastError: "Cloud-Stand ist nach Offline-Phase geändert worden" });
          } else if (!res.error) {
            // Cloud ist gleich oder älter — lokalen Stand hochladen
            uploadToCloud(stateRef.current, null, "auto");
          }
        }).catch(() => {
          updateSyncMeta({ status: "offline", lastError: null });
        });
      }
    };
    const onOffline = () => {
      updateSyncMeta({ status: "offline", lastError: null });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [uploadToCloud, refreshCloudSaves, updateSyncMeta]);

  // ---- Rotierende Autosaves (alle 60 s bei Änderung) ----
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!dirtyAutosaveRef.current || !stateRef.current || !hasLockRef.current) return;
      dirtyAutosaveRef.current = false;
      const idx = autosaveIndexRef.current;
      try {
        await saveAutosave(userIdRef.current, idx, stateRef.current);
        autosaveIndexRef.current = (idx + 1) % 3;
        setAutosaveMetas(await getAllAutosaveMetas(userIdRef.current, !!stateRef.current?.scenario));
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
      if (hasLockRef.current) { try { await saveCurrent(userIdRef.current, s); } catch (e) {} }
      dirtyAutosaveRef.current = true;
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // ---- Cloud-Synchronisation (alle 3 Min bei Änderung) ----
  // Begrenzt automatische Uploads: nicht bei jeder Spielminute, sondern
  // nur bei geänderten Speicherpunkten. Manuelle Speichern und wichtige
  // Aktionen triggern sofortige Uploads über uploadToCloud direkt.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!cloudDirtyRef.current || !stateRef.current || !userIdRef.current) return;
      // Nur hochladen wenn online
      if (!navigator.onLine) return;
      cloudDirtyRef.current = false;
      cloudUploadCounterRef.current++;
      // Alle 3 Min hochladen (entspricht jedem 3. Debounced-Save-Zyklus-Check)
      await uploadToCloud(stateRef.current, null, "auto");
    }, 180000); // 3 Minuten
    return () => clearInterval(timer);
  }, [uploadToCloud]);

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

  // ---- Benutzer-Wechsel und Startup ----
  // Setzt userIdRef und behandet Benutzerwechsel: alte Sync-Anfragen und
  // verspätete Antworten dürfen nicht der neuen Sitzung zugeordnet werden.
  useEffect(() => {
    const newUserId = authUser?.id || null;
    if (prevUserIdRef.current && prevUserIdRef.current !== newUserId) {
      // Benutzerwechsel: alle Cloud-Sync-States zurücksetzen
      syncMetaRef.current = null;
      setSyncMeta(null);
      setCloudSaves([]);
      cloudDirtyRef.current = false;
      // State zurücksetzen — neue Sitzung lädt eigene Spielstände
      stateRef.current = null; setState(null);
      setShowStart(true);
    }
    userIdRef.current = newUserId;
    prevUserIdRef.current = newUserId;
  }, [authUser]);

  // ---- Startup: IndexedDB laden (benutzergetrennt) ----
  useEffect(() => {
    if (!authUser) return;
    (async () => {
      const uid = authUser.id;
      let localState = null;
      try { localState = await loadCurrent(uid); } catch (e) {}
      if (!localState) {
        const savedState = localStorage.getItem(LS_STATE);
        if (savedState) { try { localState = JSON.parse(savedState); } catch (e) {} }
      }

      // Sync-Metadaten laden
      try {
        const savedSyncMeta = await getSyncMeta(uid);
        if (savedSyncMeta) {
          syncMetaRef.current = savedSyncMeta;
          setSyncMeta(savedSyncMeta);
        }
      } catch (e) {}

      // Cloud-Spielstände auflisten (im Hintergrund)
      refreshCloudSaves();

      if (localState) {
        ensurePartyId(localState);
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
        // Nach Startup Cloud-Sync prüfen (wenn online)
        if (navigator.onLine && syncMetaRef.current?.cloudId) {
          try {
            const res = await loadCloudSave(syncMetaRef.current.cloudId);
            if (!res.error && res.revision > syncMetaRef.current.localBaseRevision) {
              // Cloud ist neuer — Konflikt melden
              updateSyncMeta({ status: "conflict", lastError: "Cloud-Stand ist neuer als der lokale Stand" });
            }
          } catch (e) {}
        }
      }
      try { setAutosaveMetas(await getAllAutosaveMetas(uid, !!localState?.scenario)); } catch (e) {}
      setLoading(false);
    })();
  }, [authUser, processNewEvents, saveNow, ensurePartyId, refreshCloudSaves, updateSyncMeta]);

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
      ensurePartyId(newState);
      // Sync-Meta für neue Partie initialisieren
      const newMeta = makeSyncMeta(newState.meta.partyId, null, 0, "idle", null, null);
      syncMetaRef.current = newMeta;
      setSyncMeta(newMeta);
      stateRef.current = newState; setState(newState);
      setShowStart(false);
      saveNow(newState);
      setAutomationEnabled(!!newState.timeControl?.enabled);
      lastSyncGameTimeRef.current = newState.gameTime || 0;
      lastSyncRealMsRef.current = Date.now();
      prevAchievementsRef.current = new Set((newState.achievements || []).filter(a => a.unlocked).map(a => a.id));
      processNewEvents(newState);
      // Neue Partie sofort in die Cloud hochladen
      if (navigator.onLine) {
        uploadToCloud(newState, newState.company?.name || "Neue Partie", "new");
      }
      return { ok: true };
    } catch (e) {
      showToast(e.message, "error");
      throw e;
    } finally { setBusy(false); }
  }, [saveNow, processNewEvents, showToast, ensurePartyId, uploadToCloud]);

  // Neues Szenario-Spiel starten
  const newScenarioGame = useCallback(async (scenarioId, names) => {
    setBusy(true);
    try {
      const data = await executeInWorker(null, "newScenarioGame", { scenarioId, names: names || {} });
      if (data.error) throw new Error(data.error);
      const newState = data.state;
      ensurePartyId(newState);
      const newMeta = makeSyncMeta(newState.meta.partyId, null, 0, "idle", null, null);
      syncMetaRef.current = newMeta;
      setSyncMeta(newMeta);
      stateRef.current = newState; setState(newState);
      setShowStart(false);
      saveNow(newState);
      setAutomationEnabled(false);
      lastSyncGameTimeRef.current = newState.gameTime || 0;
      lastSyncRealMsRef.current = Date.now();
      prevAchievementsRef.current = new Set((newState.achievements || []).filter(a => a.unlocked).map(a => a.id));
      processNewEvents(newState);
      return { ok: true };
    } catch (e) {
      showToast(e.message, "error");
      throw e;
    } finally { setBusy(false); }
  }, [saveNow, processNewEvents, showToast, ensurePartyId]);

  // Szenario als freies Spiel fortsetzen
  const continueScenarioAsFreePlay = useCallback(async () => {
    if (!stateRef.current) return;
    try {
      const data = await executeInWorker(stateRef.current, "continueScenarioAsFreePlay", {});
      if (data.error) throw new Error(data.error);
      const newState = data.state;
      // Alten Szenario-Current löschen, neuen freien Current speichern
      const { clearScenarioCurrent } = await import("@/lib/persistence");
      await clearScenarioCurrent(userIdRef.current);
      stateRef.current = newState; setState(newState);
      saveNow(newState);
      showToast("Szenario abgeschlossen — das Spiel wird als freie Partie fortgesetzt.", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  }, [saveNow, showToast]);

  const reload = useCallback(async () => {
    let loaded = null;
    try { loaded = await loadCurrent(userIdRef.current); } catch (e) {}
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
      // Import wird als eigene Partie angelegt: neue partyId, keine
      // fremde Benutzerzuordnung oder Cloud-Schreibberechtigung übernehmen.
      ensurePartyId(imported);
      imported.meta = imported.meta || {};
      imported.meta.cloudId = null;
      imported.meta.importedAt = Date.now();
      const newMeta = makeSyncMeta(imported.meta.partyId, null, 0, "idle", null, null);
      syncMetaRef.current = newMeta;
      setSyncMeta(newMeta);
      stateRef.current = imported; setState(imported);
      setShowStart(false);
      saveNow(imported);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, [saveNow, ensurePartyId]);

  const saveSlot = useCallback(async (name) => {
    if (!stateRef.current) return { ok: false, error: "Kein Spielstand" };
    try {
      await saveManualSlot(userIdRef.current, name, stateRef.current);
      // Manueller Speicherpunkt → sofort Cloud-Sync auslösen
      if (navigator.onLine) {
        uploadToCloud(stateRef.current, name, "manual");
      }
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [uploadToCloud]);

  const loadSlot = useCallback(async (name) => {
    try {
      const isScenario = !!stateRef.current?.scenario;
      const loaded = await loadManualSlot(userIdRef.current, name, isScenario);
      if (!loaded) return { ok: false, error: "Slot nicht gefunden" };
      ensurePartyId(loaded);
      // Sync-Meta für geladenen Slot zurücksetzen (evtl. andere Partie)
      const loadedMeta = makeSyncMeta(loaded.meta?.partyId, syncMetaRef.current?.cloudId, syncMetaRef.current?.localBaseRevision || 0, "idle", null, null);
      syncMetaRef.current = loadedMeta;
      setSyncMeta(loadedMeta);
      stateRef.current = loaded; setState(loaded);
      setShowStart(false);
      saveNow(loaded);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [saveNow, ensurePartyId]);

  const deleteSlot = useCallback(async (name) => {
    try { await deleteManualSlot(userIdRef.current, name, !!stateRef.current?.scenario); return { ok: true }; }
    catch (e) { return { ok: false, error: e.message }; }
  }, []);

  const listSlots = useCallback(async () => {
    try { return await listManualSlots(userIdRef.current, !!stateRef.current?.scenario); }
    catch (e) { return []; }
  }, []);

  const loadAutosaveSlot = useCallback(async (index) => {
    try {
      const isScenario = !!stateRef.current?.scenario;
      const loaded = await loadAutosave(userIdRef.current, index, isScenario);
      if (!loaded) return { ok: false, error: "Autosave-Slot leer" };
      ensurePartyId(loaded);
      stateRef.current = loaded; setState(loaded);
      setShowStart(false);
      saveNow(loaded);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }, [saveNow, ensurePartyId]);

  const dismissBackgroundAdvanceResult = useCallback(() => {
    setBackgroundAdvance(null);
  }, []);

  // ---- Entwickler-Diagnose: gemessener Tagesvorlauf ----
  const runDiagnosedAdvance = useCallback(async () => {
    const diag = {};
    diag.automationEnabled = automationEnabled;
    diag.gameTimeBefore = stateRef.current?.gameTime || 0;
    await startBackgroundAdvance(1440, diag);
    diag.gameTimeAfter = stateRef.current?.gameTime || 0;
    diagRef.current = diag;
    return diag;
  }, [startBackgroundAdvance, automationEnabled]);

  const getDiagReport = useCallback(() => {
    const s = stateRef.current;
    const diag = diagRef.current || {};
    if (!s) return null;
    const stats = {
      vehicles: (s.vehicles || []).filter(v => v.status !== "sold" && v.status !== "archived").length,
      drivers: (s.drivers || []).filter(d => d.employmentStatus === "employed").length,
      dispatchers: (s.employees || []).filter(e => e.employmentStatus === "employed" && (e.role === "dispatcher" || e.role === "dispatcher_senior")).length,
      ordersTotal: (s.orders || []).length,
      ordersOffered: (s.orders || []).filter(o => o.status === "offered").length,
      ordersAccepted: (s.orders || []).filter(o => o.status === "angenommen").length,
      ordersUnterwegs: (s.orders || []).filter(o => o.status === "unterwegs").length,
      toursActive: (s.tours || []).filter(t => t.status === "active").length,
      tripsInProgress: (s.trips || []).filter(t => t.status === "in_progress").length,
      events: (s.events || []).length,
      bookings: (s.bookings || []).length,
      employees: (s.employees || []).filter(e => e.employmentStatus === "employed").length,
      branches: (s.branches || []).filter(b => b.status === "active").length,
    };
    let stateSizeKb = 0;
    try { stateSizeKb = Math.round(new Blob([JSON.stringify(s)]).size / 1024); } catch(e) {}
    return {
      timestamp: new Date().toISOString(),
      gameTimeBefore: diag.gameTimeBefore || 0,
      gameTimeAfter: diag.gameTimeAfter || 0,
      automationEnabled: diag.automationEnabled ?? false,
      timings: {
        waitMs: Math.round(diag.waitMs || 0),
        waitPolls: diag.waitPolls || 0,
        workerMs: Math.round(diag.workerMs || 0),
        processMs: Math.round(diag.processMs || 0),
        totalMs: Math.round(diag.totalMs || 0),
        stateSizeKb: diag.stateSizeKb || stateSizeKb,
      },
      stats,
      stateSizeKb,
    };
  }, []);

  // Actions sind stabil (alle Callbacks haben stabile Deps) — eigener Context,
  // damit Komponenten, die nur Aktionen brauchen, nicht bei jeder Zustandsänderung
  // neu rendern.
  const actions = useMemo(() => ({
    send, newGame, newScenarioGame, continueScenarioAsFreePlay, reload,
    enableAutomation, pauseAutomation,
    startBackgroundAdvance, dismissBackgroundAdvanceResult,
    runDiagnosedAdvance, getDiagReport,
    markAllEventsSeen,
    showToast, dismissToast, dismissOverlay, dismissStart, toggleMotion,
    exportGame, importGame, saveSlot, loadSlot, deleteSlot, listSlots, loadAutosaveSlot,
    uploadToCloud, refreshCloudSaves, loadCloudGame, deleteCloudGame,
    resolveConflictKeepBoth, resolveConflictKeepLocal, resolveConflictKeepCloud,
  }), [
    send, newGame, newScenarioGame, continueScenarioAsFreePlay, reload,
    enableAutomation, pauseAutomation,
    startBackgroundAdvance, dismissBackgroundAdvanceResult,
    runDiagnosedAdvance, getDiagReport,
    markAllEventsSeen,
    showToast, dismissToast, dismissOverlay, dismissStart, toggleMotion,
    exportGame, importGame, saveSlot, loadSlot, deleteSlot, listSlots, loadAutosaveSlot,
    uploadToCloud, refreshCloudSaves, loadCloudGame, deleteCloudGame,
    resolveConflictKeepBoth, resolveConflictKeepLocal, resolveConflictKeepCloud,
  ]);

  const value = useMemo(() => ({
    state, loading, busy, toast,
    motionEnabled, overlay,
    automationEnabled, automationBusy,
    dirty: false, save: async () => {}, saving: false,
    toasts, unseenCount,
    showStart,
    connectionState: "connected",
    hasLock, autosaveMetas,
    backgroundAdvance,
    syncMeta, cloudSaves, cloudLoading,
  }), [
    state, loading, busy, toast,
    motionEnabled, overlay,
    automationEnabled, automationBusy,
    toasts, unseenCount,
    showStart,
    hasLock, autosaveMetas,
    backgroundAdvance,
    syncMeta, cloudSaves, cloudLoading,
  ]);
  return (
    <GameActionsContext.Provider value={actions}>
      <GameContext.Provider value={value}>
        <DisplayGameTimeContext.Provider value={displayGameTime}>
          {children}
        </DisplayGameTimeContext.Provider>
      </GameContext.Provider>
    </GameActionsContext.Provider>
  );
}