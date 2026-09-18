import { playExperienceSound } from "@/lib/experienceSound";
import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { saveCurrent, loadCurrent, saveAutosave, loadAutosave, getAllAutosaveMetas, listManualSlots, saveManualSlot, loadManualSlot, deleteManualSlot, exportSave, importSave, getSyncMeta, setSyncMeta as persistSyncMeta } from "@/lib/persistence";
import { acquireLock, refreshLock, releaseLock, LOCK_REFRESH } from "@/lib/tabLock";
import { writeRecoverySave, prepareLoadedState } from "@/lib/saveSafety";
import { eventToToast, summarizeRoutineToasts, CRITICAL_EVENT_TYPES } from "@/lib/eventNotifications";
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
  if (diag) { try { stateSize = new Blob([JSON.stringify(state)]).size; } catch(e) {} }
  return new Promise((resolve) => {
    if (onProgress) _workerProgress.set(id, onProgress);
    _workerPending.set(id, (data) => {
      if (diag) {
        diag.workerMs = performance.now() - tSend;
        diag.stateSizeKb = Math.round(stateSize / 1024);
      }
      resolve(data);
    });
    try { simWorker.postMessage({ id, state, command, params }); }
    catch (error) {
      _workerPending.delete(id); _workerProgress.delete(id);
      resolve({ error: error.message || "Spielzustand konnte nicht an den Worker übertragen werden." });
    }
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

// Wiederherstellungsdaten werden ausschließlich benutzerbezogen gespeichert.

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
  const autosaveIndexRef = useRef(0);
  const cloudSyncQueueRef = useRef(null);
  const syncMetaRef = useRef(null);
  const [syncMeta, setSyncMeta] = useState(null);
  const [cloudSaves, setCloudSaves] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const cloudDirtyRef = useRef(false);
  const dirtyAutosaveRef = useRef(false);
  const [autosaveMetas, setAutosaveMetas] = useState([null, null, null]);
  const [backgroundAdvance, setBackgroundAdvance] = useState(null);
  const backgroundAdvanceRef = useRef(false);
  const diagRef = useRef(null);
  const sessionGenerationRef = useRef(0);
  const changingStateRef = useRef(false);
  const activeUserRef = useRef(authUser?.id);
  activeUserRef.current = authUser?.id;
  const localSaveQueueRef = useRef(Promise.resolve());
  const changeVersionRef = useRef(0);
  const lockRequiresReloadRef = useRef(false);
  const [localSaveError, setLocalSaveError] = useState(null);

  const sessionToken = useCallback(() => ({
    userId: userIdRef.current, generation: sessionGenerationRef.current,
  }), []);
  const isCurrentSession = useCallback((token) =>
    !!token.userId && token.userId === userIdRef.current &&
    token.userId === activeUserRef.current &&
    token.generation === sessionGenerationRef.current, []);

  const assertWritable = useCallback(() => {
    let writable = false;
    try { writable = !lockRequiresReloadRef.current && refreshLock(); } catch { /* Speicher blockiert. */ }
    if (!writable) {
      hasLockRef.current = false;
      lockRequiresReloadRef.current = true;
      setHasLock(false);
      throw new Error("Dieses Spiel ist in einem anderen Tab geöffnet oder der Browserspeicher ist gesperrt. Bitte den anderen Tab schließen und diese Seite neu laden.");
    }
    hasLockRef.current = true;
    return true;
  }, []);

  const beginStateChange = useCallback(() => {
    assertWritable();
    if (!userIdRef.current || userIdRef.current !== activeUserRef.current) throw new Error("Bitte erneut anmelden.");
    sessionGenerationRef.current++;
    changingStateRef.current = true;
    setAutomationEnabled(false);
    userWantsAutomationRef.current = false;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    return sessionToken();
  }, [assertWritable, sessionToken]);

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
    const token = sessionToken();
    const version = changeVersionRef.current;
    if (!s || changingStateRef.current || !isCurrentSession(token)) return { skipped: true };
    const snapshot = structuredClone(s);
    const partyId = snapshot.meta?.partyId;
    const meta = syncMetaRef.current?.partyId === partyId ? { ...syncMetaRef.current } : null;
    const task = async () => {
      if (!isCurrentSession(token) || stateRef.current?.meta?.partyId !== partyId) return { skipped: true };
      try { assertWritable(); } catch (error) { return { ok: false, error: error.message }; }
      const savedAt = Date.now();
      let recoveryError = null, databaseError = null;
      try { writeRecoverySave(token.userId, snapshot, savedAt); } catch (error) { recoveryError = error; }
      try { await saveCurrent(token.userId, snapshot, meta, savedAt); } catch (error) { databaseError = error; }
      if (!isCurrentSession(token)) return { skipped: true };
      if (databaseError) {
        dirtySaveRef.current = true;
        setLocalSaveError(recoveryError
          ? "Spielstand konnte nicht lokal gespeichert werden. Bitte Speicherplatz freigeben und den Spielstand exportieren."
          : "Nur die lokale Sicherheitskopie wurde gespeichert. Die Speicherung wird erneut versucht.");
      } else {
        if (changeVersionRef.current === version) dirtySaveRef.current = false;
        setLocalSaveError(null);
      }
      dirtyAutosaveRef.current = true;
      return { ok: !databaseError || !recoveryError, degraded: !!databaseError };
    };
    const pending = localSaveQueueRef.current.then(task, task);
    localSaveQueueRef.current = pending.then(() => {}, () => {});
    return pending;
  }, [sessionToken, isCurrentSession, assertWritable]);

  // Markiert den Zustand als geändert — Speicherung erfolgt debounced (alle 3 s).
  const markDirty = useCallback(() => {
    changeVersionRef.current++;
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
    const token = sessionToken();
    if (isCurrentSession(token) && hasLockRef.current && !lockRequiresReloadRef.current && updated.partyId) {
      persistSyncMeta(token.userId, updated).catch(() => {
        if (isCurrentSession(token)) setLocalSaveError("Die Cloud-Zuordnung konnte lokal nicht gespeichert werden. Bitte den Browserspeicher prüfen.");
      });
    }
    return updated;
  }, [sessionToken, isCurrentSession]);

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
      seenEventIdsRef.current = new Set(events.map(event => event.id));
      lastEventSeqRef.current = events.reduce((max, event) => Math.max(max, event.seq || 0), 0);
      isInitialLoadRef.current = false;
    } else {
      const previousSeq = lastEventSeqRef.current;
      let latestSeq = previousSeq;
      const newToasts = [];
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event.seq <= previousSeq) break;
        latestSeq = Math.max(latestSeq, event.seq || 0);
        if (seenEventIdsRef.current.has(event.id)) continue;
        const toast = eventToToast(event);
        if (toast) {
          toast._eventType = event.type;
          newToasts.unshift(toast);
        }
        seenEventIdsRef.current.add(event.id);
      }
      lastEventSeqRef.current = latestSeq;
      // Intelligente Toast-Steuerung: Bei vielen gleichzeitigen Events
      // (typisch bei Zeitvorläufen) werden Routine-Meldungen zu einer
      // einzigen Zusammenfassung gebündelt. Kritische Ereignisse
      // (Fehler, Beziehungen, Belohnungen) erscheinen weiterhin einzeln.
      if (newToasts.length) playExperienceSound(newToasts.some(t => t.kind === "error") ? "alert" : "success");
      if (newToasts.length <= 2) {
        if (newToasts.length) setToasts(previous => [...previous, ...newToasts].slice(-6));
      } else {
        const critical = [];
        const routine = [];
        for (const t of newToasts) {
          if (CRITICAL_EVENT_TYPES.has(t._eventType)) critical.push(t);
          else routine.push(t);
        }
        // Höchstens 2 kritische Toasts einzeln zeigen;
        // alle weiteren (kritisch + routinemäßig) in einer Zusammenfassung bündeln.
        const visibleCritical = critical.slice(-2);
        const overflow = critical.slice(0, -2);
        const summary = summarizeRoutineToasts([...routine, ...overflow]);
        const finalToasts = summary ? [...visibleCritical, summary] : visibleCritical;
        if (finalToasts.length) setToasts(previous => [...previous, ...finalToasts].slice(-6));
      }
    }
    setUnseenCount(getUnseenEventCount(newState));
  }, []);

  // Cloud-Upload eines vollständigen, konsistenten Speicherpunkts.
  // Verwendet die Queue — nur ein Upload gleichzeitig, verspätete Antworten
  // werden verworfen. localBaseRevision wird nur nach Bestätigung aktualisiert.
  const uploadToCloud = useCallback(async (s, saveLabel, saveType, options = {}) => {
    const token = sessionToken();
    const partyId = s?.meta?.partyId;
    if (!partyId || !isCurrentSession(token) || changingStateRef.current) return { skipped: true };
    const snapshot = structuredClone(s);
    const stillCurrent = () => isCurrentSession(token) &&
      !changingStateRef.current && stateRef.current?.meta?.partyId === partyId;
    // Die Queue-Aufgabe umfasst auch die Übernahme der bestätigten Revision.
    // Erst danach darf die nächste Aufgabe ihre Metadaten lesen.
    return cloudSyncQueueRef.current.enqueue(async () => {
      if (!stillCurrent()) return { skipped: true };
      try {
        assertWritable();
        const meta = syncMetaRef.current;
        if (meta?.partyId !== partyId) throw new Error("Spielstand und Cloud-Zuordnung passen nicht zusammen. Bitte den Spielstand neu laden.");
        if (meta.status === "conflict" && !options.resolveConflict) return { conflict: true };
        if (!navigator.onLine) {
          updateSyncMeta({ status: "offline", lastError: null });
          return { skipped: true };
        }
        const version = changeVersionRef.current;
        updateSyncMeta({ status: "uploading", lastError: null });
        let expectedRevision = meta.localBaseRevision;
        if (options.resolveConflict && meta.cloudId) {
          const latest = await loadCloudSave(meta.cloudId);
          if (!stillCurrent()) return { skipped: true };
          expectedRevision = latest.revision;
        }
        if (!stillCurrent()) return { skipped: true };
        const res = meta.cloudId
          ? await saveCloudSave(meta.cloudId, snapshot, expectedRevision, saveLabel, saveType || "auto")
          : await createCloudSave(snapshot, partyId, saveLabel, saveType || "new");
        if (!stillCurrent()) return { skipped: true };
        assertWritable();
        if (res.conflict) {
          updateSyncMeta({ status: "conflict", cloudId: res.stateId || meta.cloudId, lastError: res.error || "Cloud-Stand wurde geändert" });
          return { conflict: true, currentRevision: res.current_revision, cloudMeta: res.cloud_meta };
        }
        if (res.error) throw new Error(res.error);
        updateSyncMeta({
          partyId, cloudId: res.stateId || meta.cloudId, localBaseRevision: res.revision,
          status: "synced", lastCloudSyncAt: Date.now(), lastError: null,
        });
        if (changeVersionRef.current === version && stateRef.current === s) cloudDirtyRef.current = false;
        return { ok: true, revision: res.revision };
      } catch (error) {
        if (!stillCurrent()) return { skipped: true };
        cloudDirtyRef.current = true;
        const offline = !navigator.onLine || /Network|Failed to fetch/.test(error.message || "");
        updateSyncMeta({ status: offline ? "offline" : "error", lastError: error.message });
        return { ok: false, error: error.message };
      }
    });
  }, [sessionToken, isCurrentSession, assertWritable, updateSyncMeta]);

  // Cloud-Spielstände auflisten (für geräteübergreifendes Fortsetzen)
  const refreshCloudSaves = useCallback(async () => {
    const token = sessionToken();
    if (!isCurrentSession(token)) return;
    setCloudLoading(true);
    try {
      const res = await listCloudSaves();
      if (isCurrentSession(token) && res.saves) setCloudSaves(res.saves);
    } catch (error) {
      if (isCurrentSession(token)) showToast("Cloud-Spielstände konnten nicht geladen werden: " + error.message, "error");
    } finally { if (isCurrentSession(token)) setCloudLoading(false); }
  }, [sessionToken, isCurrentSession, showToast]);

  // Ein Ladeweg für Startup, Cloud, Slots, Autosaves und Import.
  const activateState = useCallback(async (raw, token, providedMeta = null, keepStart = false) => {
    const loaded = prepareLoadedState(raw);
    if (providedMeta?.partyId) loaded.meta.partyId = providedMeta.partyId;
    ensurePartyId(loaded);
    let savedMeta = providedMeta;
    if (!savedMeta) {
      try { savedMeta = await getSyncMeta(token.userId, loaded.meta.partyId); } catch { /* Sichere neue Cloud-Zuordnung. */ }
    }
    if (!isCurrentSession(token)) return { skipped: true };
    const newMeta = savedMeta?.partyId === loaded.meta.partyId
      ? { ...savedMeta, status: savedMeta.status === "conflict" ? "conflict" : "idle" }
      : makeSyncMeta(loaded.meta.partyId, null, 0, "idle", null, null);
    if (providedMeta) newMeta.status = "synced";
    syncMetaRef.current = newMeta;
    setSyncMeta(newMeta);
    stateRef.current = loaded;
    setState(loaded);
    setShowStart(keepStart);
    changingStateRef.current = false;
    setAutomationEnabled(false);
    userWantsAutomationRef.current = false;
    lastSyncGameTimeRef.current = loaded.gameTime;
    lastSyncRealMsRef.current = Date.now();
    isInitialLoadRef.current = true;
    seenEventIdsRef.current = new Set();
    lastEventSeqRef.current = 0;
    setToasts([]);
    setOverlay(null);
    setBackgroundAdvance(null);
    pendingAchievementsRef.current = [];
    prevAchievementsRef.current = new Set(loaded.achievements.filter(a => a.unlocked).map(a => a.id));
    processNewEvents(loaded);
    changeVersionRef.current++;
    dirtySaveRef.current = true;
    cloudDirtyRef.current = !providedMeta;
    if (hasLockRef.current && !lockRequiresReloadRef.current) await saveNow(loaded);
    try {
      const metas = await getAllAutosaveMetas(token.userId, !!loaded.scenario);
      if (isCurrentSession(token)) setAutosaveMetas(metas);
    } catch { /* Speicherfehler wird beim Speichern angezeigt. */ }
    return { ok: true };
  }, [ensurePartyId, isCurrentSession, processNewEvents, saveNow]);

  // Cloud-Spielstand laden (geräteübergreifendes Fortsetzen)
  const loadCloudGame = useCallback(async (cloudId) => {
    let token;
    setBusy(true);
    try {
      token = beginStateChange();
      const res = await loadCloudSave(cloudId);
      if (!isCurrentSession(token)) return { skipped: true };
      if (res.error) throw new Error(res.error);
      const meta = makeSyncMeta(res.party_id || res.state?.meta?.partyId || generatePartyId(),
        cloudId, res.revision, "synced", Date.now(), null);
      return await activateState(res.state, token, meta);
    } catch (error) {
      if (!token || isCurrentSession(token)) showToast(error.message, "error");
      return { ok: false, error: error.message };
    } finally {
      if (!token || isCurrentSession(token)) { changingStateRef.current = false; setBusy(false); }
    }
  }, [beginStateChange, isCurrentSession, activateState, showToast]);

  // Cloud-Spielstand löschen
  const deleteCloudGame = useCallback(async (cloudId) => {
    const token = sessionToken();
    try {
      assertWritable();
      // Mit Uploads serialisieren, damit kein gelöschtes Ziel bestätigt wird.
      return await cloudSyncQueueRef.current.enqueue(async () => {
        if (!isCurrentSession(token)) return { skipped: true };
        assertWritable();
        await deleteCloudSave(cloudId);
        if (!isCurrentSession(token)) return { skipped: true };
        setCloudSaves(previous => previous.filter(save => save.id !== cloudId));
        if (syncMetaRef.current?.cloudId === cloudId) {
          updateSyncMeta({ cloudId: null, localBaseRevision: 0, status: "idle", lastCloudSyncAt: null });
          cloudDirtyRef.current = false;
        }
        return { ok: true };
      });
    } catch (error) { return { ok: false, error: error.message }; }
  }, [sessionToken, isCurrentSession, assertWritable, updateSyncMeta]);

  // Konflikt auflösen: beide Fassungen behalten (lokale als neue Partie in Cloud)
  const resolveConflictKeepBoth = useCallback(async () => {
    if (!stateRef.current) return { ok: false, error: "Kein Spielstand" };
    let token;
    try {
      token = beginStateChange();
      const copy = structuredClone(stateRef.current);
      copy.meta = { ...copy.meta, partyId: generatePartyId(), forkedFrom: copy.meta?.partyId, forkedAt: Date.now() };
      const result = await activateState(copy, token);
      if (!result.ok) return result;
      return await uploadToCloud(stateRef.current, "Konflikt-Kopie (lokal)", "conflict_backup");
    } catch (error) { return { ok: false, error: error.message }; }
    finally { if (token && isCurrentSession(token)) changingStateRef.current = false; }
  }, [beginStateChange, activateState, uploadToCloud, isCurrentSession]);

  // Konflikt auflösen: mit lokaler Fassung fortsetzen (Cloud überschreiben)
  const resolveConflictKeepLocal = useCallback(async () => {
    if (!stateRef.current) return { ok: false, error: "Kein Spielstand" };
    return await uploadToCloud(stateRef.current, "Konflikt-Auflösung (lokal gewählt)", "manual", { resolveConflict: true });
  }, [uploadToCloud]);

  // Konflikt auflösen: mit Cloud-Fassung fortsetzen (lokal überschreiben)
  const resolveConflictKeepCloud = useCallback(async () => {
    const token = sessionToken();
    try {
      assertWritable();
      const cloudId = syncMetaRef.current?.cloudId;
      if (!cloudId) return { ok: false, error: "Kein Cloud-Spielstand" };
      if (stateRef.current) {
        await saveManualSlot(userIdRef.current, "Backup_vor_Cloud_" + Date.now(), structuredClone(stateRef.current));
      }
      if (!isCurrentSession(token)) return { skipped: true };
      return await loadCloudGame(cloudId);
    } catch (error) { return { ok: false, error: error.message }; }
  }, [assertWritable, loadCloudGame, sessionToken, isCurrentSession]);

  const processResult = useCallback(async (newState, result, command) => {
    if (result?.requiresApproval) showToast(result.approvalRejected
      ? "Diese unveränderte Anfrage wurde bereits abgelehnt."
      : "Freigabe angefordert – unter Führung & Delegation prüfen.", "info");
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
  }, [showToast]);

  // ---- Befehl lokal ausführen (kein Netzwerk) ----
  const send = useCallback(async (command, params, onProgress) => {
    const token = sessionToken();
    if (changingStateRef.current) throw new Error("Spielstand wird gerade geladen.");
    while (syncInFlightRef.current || backgroundAdvanceRef.current || sendInFlightRef.current) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (!isCurrentSession(token)) throw new Error("Spielstand wurde inzwischen gewechselt.");
    assertWritable();
    if (!stateRef.current) throw new Error("Kein Spielstand geladen");
    setBusy(true); sendInFlightRef.current = true;
    try {
      const data = await executeInWorker(stateRef.current, command, params || {}, onProgress);
      if (!isCurrentSession(token)) throw new Error("Spielstand wurde inzwischen gewechselt.");
      assertWritable();
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
    } finally { if (isCurrentSession(token)) setBusy(false); sendInFlightRef.current = false; }
  }, [markDirty, processNewEvents, processResult, showToast, sessionToken, isCurrentSession, assertWritable]);

  // ---- Tagesvorlauf im Hintergrund (nicht-blockierend) ----
  // Der Tagesvorlauf läuft im Worker, während der Spieler weiter navigieren
  // und Menüs nutzen kann. send() wird blockiert, bis der Vorlauf fertig ist.
  const startBackgroundAdvance = useCallback(async (minutes, diag) => {
    if (backgroundAdvanceRef.current || changingStateRef.current) return;
    const token = sessionToken();
    try { assertWritable(); } catch (error) { showToast(error.message, "error"); return; }
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
    if (!stateRef.current || !isCurrentSession(token)) {
      backgroundAdvanceRef.current = false;
      setBackgroundAdvance({ active: false, progress: null, result: null });
      return;
    }
    try {
      const data = await executeInWorker(stateRef.current, "advanceTime", { minutes }, (progress) => {
        if (isCurrentSession(token)) setBackgroundAdvance(prev => prev ? { ...prev, progress } : prev);
      }, diag);
      if (!isCurrentSession(token)) return;
      assertWritable();
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
  }, [markDirty, processNewEvents, processResult, showToast, sessionToken, isCurrentSession, assertWritable]);

  // ---- Zeitautomatik (lokal) ----
  const syncAutomation = useCallback(async () => {
    if (!stateRef.current || changingStateRef.current || syncInFlightRef.current || sendInFlightRef.current || backgroundAdvanceRef.current) return;
    const token = sessionToken();
    syncInFlightRef.current = true;
    try {
      assertWritable();
      const data = await executeInWorker(stateRef.current, "syncAutomation", {});
      if (!isCurrentSession(token)) return;
      assertWritable();
      if (!data || data.error) throw new Error(data?.error || "Simulations-Worker antwortet nicht.");
      stateRef.current = data.state; setState(data.state);
      markDirty();
      processNewEvents(data.state);
      lastSyncGameTimeRef.current = data.state.gameTime;
      lastSyncRealMsRef.current = Date.now();
    } catch (error) {
      if (isCurrentSession(token)) {
        setAutomationEnabled(false);
        showToast("Zeitautomatik pausiert: " + error.message, "error");
      }
    } finally { syncInFlightRef.current = false; }
  }, [markDirty, processNewEvents, sessionToken, isCurrentSession, assertWritable, showToast]);

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
      if (!stateRef.current || changingStateRef.current || !hasLockRef.current || lockRequiresReloadRef.current) return;
      try {
        assertWritable();
        // Synchroner, benutzergetrennter Fallback vor dem Schließen.
        writeRecoverySave(userIdRef.current, stateRef.current);
      } catch { /* Der persistente Fehlerhinweis ist während der Sitzung sichtbar. */ }
      saveNow(stateRef.current);
      releaseLock();
    };
    const onHidden = () => { if (document.hidden && stateRef.current) saveNow(stateRef.current); };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [saveNow, assertWritable]);

  useEffect(() => {
    const onOnline = async () => {
      refreshCloudSaves();
      if (!hasLockRef.current || lockRequiresReloadRef.current) return;
      if (stateRef.current && cloudDirtyRef.current) await uploadToCloud(stateRef.current, null, "auto");
    };
    const onOffline = () => updateSyncMeta({ status: "offline", lastError: null });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, [uploadToCloud, refreshCloudSaves, updateSyncMeta]);

  // Rotierende Sicherungen behalten die Änderungsmarkierung bis zum Erfolg.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!dirtyAutosaveRef.current || !stateRef.current || !hasLockRef.current || changingStateRef.current) return;
      const token = sessionToken();
      const version = changeVersionRef.current;
      const snapshot = structuredClone(stateRef.current);
      const index = autosaveIndexRef.current;
      try {
        assertWritable();
        await saveAutosave(token.userId, index, snapshot);
        if (!isCurrentSession(token)) return;
        if (changeVersionRef.current === version) dirtyAutosaveRef.current = false;
        autosaveIndexRef.current = (index + 1) % 3;
        const metas = await getAllAutosaveMetas(token.userId, !!snapshot.scenario);
        if (isCurrentSession(token)) setAutosaveMetas(metas);
      } catch {
        if (isCurrentSession(token)) setLocalSaveError("Automatische Sicherung fehlgeschlagen. Bitte den Spielstand exportieren und den Browserspeicher prüfen.");
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [sessionToken, isCurrentSession, assertWritable]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (dirtySaveRef.current && stateRef.current && hasLockRef.current && !changingStateRef.current) saveNow(stateRef.current);
    }, 3000);
    return () => clearInterval(timer);
  }, [saveNow]);

  useEffect(() => {
    const timer = setInterval(async () => {
      if (!cloudDirtyRef.current || !stateRef.current || !hasLockRef.current || changingStateRef.current ||
          !navigator.onLine || syncMetaRef.current?.status === "conflict") return;
      await uploadToCloud(stateRef.current, null, "auto");
    }, 180000);
    return () => clearInterval(timer);
  }, [uploadToCloud]);

  useEffect(() => {
    let acquired = false;
    try { acquired = acquireLock(); } catch { /* Gesperrter Speicher erlaubt keine sichere Schreibsperre. */ }
    hasLockRef.current = acquired;
    lockRequiresReloadRef.current = !acquired;
    setHasLock(acquired);
    const heartbeat = setInterval(() => {
      if (!hasLockRef.current) return;
      let retained = false;
      try { retained = refreshLock(); } catch { /* Sperre verloren. */ }
      if (!retained) {
        hasLockRef.current = false;
        lockRequiresReloadRef.current = true;
        sessionGenerationRef.current++;
        setHasLock(false);
        setAutomationEnabled(false);
        userWantsAutomationRef.current = false;
      }
    }, LOCK_REFRESH);
    return () => { clearInterval(heartbeat); try { releaseLock(); } catch { /* Speicher nicht verfügbar. */ } };
  }, []);

  // Jede Anmeldung erhält eine eigene Generation; Antworten alter Sitzungen
  // dürfen weder den neuen Zustand noch seine Cloud-Zuordnung verändern.
  useEffect(() => {
    const uid = authUser?.id;
    sessionGenerationRef.current++;
    userIdRef.current = uid || null;
    changingStateRef.current = true;
    const token = sessionToken();
    stateRef.current = null;
    syncMetaRef.current = null;
    setState(null); setSyncMeta(null); setCloudSaves([]);
    setCloudLoading(false); setShowStart(true); setLoading(true);
    setLocalSaveError(null);
    setAutomationEnabled(false);
    cloudDirtyRef.current = false; dirtySaveRef.current = false;
    dirtyAutosaveRef.current = false;
    if (!uid) { setLoading(false); return; }
    (async () => {
      try {
        const loaded = await loadCurrent(uid);
        if (!isCurrentSession(token)) return;
        if (loaded) {
          await activateState(loaded, token, null, true);
          if (!isCurrentSession(token)) return;
          const meta = syncMetaRef.current;
          if (navigator.onLine && meta?.cloudId) {
            try {
              const remote = await loadCloudSave(meta.cloudId);
              if (isCurrentSession(token) && remote.revision > meta.localBaseRevision) {
                updateSyncMeta({ status: "conflict", lastError: "Cloud-Stand ist neuer als der lokale Stand" });
              }
            } catch { /* Lokales Spiel bleibt bei fehlender Verbindung verfügbar. */ }
          }
        }
        if (isCurrentSession(token)) refreshCloudSaves();
      } catch (error) {
        if (isCurrentSession(token)) setLocalSaveError("Spielstand konnte nicht geladen werden: " + error.message);
      } finally {
        if (isCurrentSession(token)) { changingStateRef.current = false; setLoading(false); }
      }
    })();
    return () => { sessionGenerationRef.current++; changingStateRef.current = true; };
  }, [authUser?.id, sessionToken, isCurrentSession, activateState, refreshCloudSaves, updateSyncMeta]);

  const markAllEventsSeen = useCallback(async () => {
    if (!stateRef.current) return;
    try { await send("markAllEventsSeen", {}); setUnseenCount(0); } catch (e) {}
  }, [send]);

  // Vor dem Ersetzen bleibt jede Partie als eigener, wieder ladbarer Slot erhalten.
  const preserveCurrentParty = useCallback(async (token) => {
    if (!stateRef.current) return;
    const snapshot = structuredClone(stateRef.current);
    ensurePartyId(snapshot);
    await saveManualSlot(token.userId, "Partie · " + snapshot.company.name + " · " + snapshot.meta.partyId, snapshot);
    if (!isCurrentSession(token)) throw new Error("Die Sitzung hat sich geändert. Bitte erneut versuchen.");
  }, [ensurePartyId, isCurrentSession]);

  const openStartScreen = useCallback(async () => {
    if (sendInFlightRef.current || syncInFlightRef.current || backgroundAdvanceRef.current || changingStateRef.current) {
      showToast("Bitte den laufenden Vorgang abwarten.", "info");
      return;
    }
    userWantsAutomationRef.current = false;
    setAutomationEnabled(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    const saved = stateRef.current ? await saveNow(stateRef.current) : { ok: true };
    if (saved.ok) setShowStart(true);
    else showToast("Bitte den Spielstand zuerst erfolgreich speichern.", "error");
  }, [saveNow, showToast]);

  const newGame = useCallback(async (names) => {
    let token;
    setBusy(true);
    try {
      token = beginStateChange();
      await preserveCurrentParty(token);
      const data = await executeInWorker(null, "newGame", names || {});
      if (!isCurrentSession(token)) return { skipped: true };
      if (data.error) throw new Error(data.error);
      const result = await activateState(data.state, token);
      if (result.ok && isCurrentSession(token) && navigator.onLine) {
        uploadToCloud(stateRef.current, stateRef.current.company?.name || "Neue Partie", "new");
      }
      return result;
    } catch (error) { showToast(error.message, "error"); throw error; }
    finally { if (!token || isCurrentSession(token)) { changingStateRef.current = false; setBusy(false); } }
  }, [beginStateChange, isCurrentSession, activateState, uploadToCloud, showToast, preserveCurrentParty]);

  // Neues Szenario-Spiel starten
  const newScenarioGame = useCallback(async (scenarioId, names) => {
    let token;
    setBusy(true);
    try {
      token = beginStateChange();
      await preserveCurrentParty(token);
      const data = await executeInWorker(null, "newScenarioGame", { scenarioId, names: names || {} });
      if (!isCurrentSession(token)) return { skipped: true };
      if (data.error) throw new Error(data.error);
      const result = await activateState(data.state, token);
      if (result.ok && isCurrentSession(token) && navigator.onLine) {
        uploadToCloud(stateRef.current, stateRef.current.company?.name || "Neues Szenario", "new");
      }
      return result;
    } catch (error) { showToast(error.message, "error"); throw error; }
    finally { if (!token || isCurrentSession(token)) { changingStateRef.current = false; setBusy(false); } }
  }, [beginStateChange, isCurrentSession, activateState, uploadToCloud, showToast, preserveCurrentParty]);

  // Szenario als freies Spiel fortsetzen
  const continueScenarioAsFreePlay = useCallback(async () => {
    try {
      await send("continueScenarioAsFreePlay", {});
      await saveNow(stateRef.current);
      showToast("Szenario abgeschlossen — das Spiel wird als freie Partie fortgesetzt.", "success");
    } catch (error) { showToast(error.message, "error"); }
  }, [send, saveNow, showToast]);

  const reload = useCallback(async () => {
    let token;
    try {
      token = beginStateChange();
      const loaded = await loadCurrent(token.userId);
      if (loaded) return await activateState(loaded, token);
      return { ok: false, error: "Kein Spielstand gefunden." };
    } catch (error) { showToast(error.message, "error"); return { ok: false, error: error.message }; }
    finally { if (token && isCurrentSession(token)) changingStateRef.current = false; }
  }, [beginStateChange, activateState, isCurrentSession, showToast]);

  // ---- Export / Import / Manuelle Slots ----
  const exportGame = useCallback(() => {
    if (!stateRef.current) return null;
    return exportSave(stateRef.current);
  }, []);

  const importGame = useCallback(async (exportStr) => {
    let token;
    try {
      // Ein ungültiger Import soll nicht einmal die laufende Partie pausieren.
      const imported = importSave(exportStr);
      token = beginStateChange();
      return await activateState(imported, token);
    } catch (error) { return { ok: false, error: error.message }; }
    finally { if (token && isCurrentSession(token)) changingStateRef.current = false; }
  }, [beginStateChange, activateState, isCurrentSession]);

  const saveSlot = useCallback(async (name) => {
    if (!stateRef.current) return { ok: false, error: "Kein Spielstand" };
    const token = sessionToken();
    const snapshot = stateRef.current;
    try {
      assertWritable();
      await saveManualSlot(token.userId, name, structuredClone(snapshot));
      if (!isCurrentSession(token)) return { skipped: true };
      if (navigator.onLine) {
        const result = await uploadToCloud(snapshot, name, "manual");
        if (result.error || result.conflict) showToast("Lokal gespeichert. Die Cloud-Sicherung ist noch offen.", "info");
        if (isCurrentSession(token)) refreshCloudSaves();
      }
      return { ok: true };
    } catch (error) {
      if (isCurrentSession(token)) setLocalSaveError("Manueller Speicherpunkt konnte nicht gespeichert werden: " + error.message);
      return { ok: false, error: error.message };
    }
  }, [sessionToken, isCurrentSession, assertWritable, uploadToCloud, refreshCloudSaves, showToast]);

  const loadSlot = useCallback(async (name, isScenario = !!stateRef.current?.scenario) => {
    let token;
    try {
      token = beginStateChange();
      await preserveCurrentParty(token);
      const loaded = await loadManualSlot(token.userId, name, isScenario);
      if (!loaded) throw new Error("Slot nicht gefunden");
      return await activateState(loaded, token);
    } catch (error) { return { ok: false, error: error.message }; }
    finally { if (token && isCurrentSession(token)) changingStateRef.current = false; }
  }, [beginStateChange, activateState, isCurrentSession, preserveCurrentParty]);

  const deleteSlot = useCallback(async (name) => {
    try {
      assertWritable();
      await deleteManualSlot(userIdRef.current, name, !!stateRef.current?.scenario);
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  }, [assertWritable]);

  const listSlots = useCallback(async (isScenario = !!stateRef.current?.scenario) => {
    try { return await listManualSlots(userIdRef.current, isScenario); }
    catch (e) { return []; }
  }, []);

  const loadAutosaveSlot = useCallback(async (index) => {
    let token;
    try {
      token = beginStateChange();
      const loaded = await loadAutosave(token.userId, index, !!stateRef.current?.scenario);
      if (!loaded) throw new Error("Autosave-Slot leer");
      return await activateState(loaded, token);
    } catch (error) { return { ok: false, error: error.message }; }
    finally { if (token && isCurrentSession(token)) changingStateRef.current = false; }
  }, [beginStateChange, activateState, isCurrentSession]);

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
    showToast, dismissToast, dismissOverlay, dismissStart, openStartScreen, toggleMotion,
    exportGame, importGame, saveSlot, loadSlot, deleteSlot, listSlots, loadAutosaveSlot,
    uploadToCloud, refreshCloudSaves, loadCloudGame, deleteCloudGame,
    resolveConflictKeepBoth, resolveConflictKeepLocal, resolveConflictKeepCloud,
  }), [
    send, newGame, newScenarioGame, continueScenarioAsFreePlay, reload,
    enableAutomation, pauseAutomation,
    startBackgroundAdvance, dismissBackgroundAdvanceResult,
    runDiagnosedAdvance, getDiagReport,
    markAllEventsSeen,
    showToast, dismissToast, dismissOverlay, dismissStart, openStartScreen, toggleMotion,
    exportGame, importGame, saveSlot, loadSlot, deleteSlot, listSlots, loadAutosaveSlot,
    uploadToCloud, refreshCloudSaves, loadCloudGame, deleteCloudGame,
    resolveConflictKeepBoth, resolveConflictKeepLocal, resolveConflictKeepCloud,
  ]);

  const value = useMemo(() => ({
    state, loading, busy, toast,
    motionEnabled, overlay,
    automationEnabled, automationBusy,
    dirty: !!localSaveError, save: async () => stateRef.current ? saveNow(stateRef.current) : null, saving: false,
    toasts, unseenCount,
    showStart,
    connectionState: "connected",
    hasLock, autosaveMetas, localSaveError,
    backgroundAdvance,
    syncMeta, cloudSaves, cloudLoading,
  }), [
    state, loading, busy, toast,
    motionEnabled, overlay,
    automationEnabled, automationBusy,
    toasts, unseenCount,
    showStart,
    hasLock, autosaveMetas, localSaveError, saveNow,
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