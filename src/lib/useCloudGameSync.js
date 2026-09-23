import { useCallback, useEffect, useRef, useState } from "react";
import { cloneSaveSnapshot } from "@/lib/simulationTransport";
import { saveManualSlot, setSyncMeta as persistSyncMeta } from "@/lib/persistence";
import {
  withCloudRetry, listCloudSaves, loadCloudSave, createCloudSave, saveCloudSave,
  deleteCloudSave, CloudSyncQueue, generatePartyId, makeSyncMeta,
} from "@/lib/cloudSync";

// Cloud-Abläufe der aktiven Partie. Der Provider besitzt Sitzung, Tab-Sperre
// und Spielstandaktivierung; dieser Hook besitzt Uploadqueue und Cloud-Liste.
// Die Queue lebt über Partiewechsel hinweg, damit laufende IO nicht überholt wird.
export function useCloudGameSync({
  sessionToken, isCurrentSession, assertWritable, beginStateChange, activateState,
  stateRef, syncMetaRef, cloudDirtyRef, changingStateRef, changeVersionRef,
  hasLockRef, lockRequiresReloadRef, userIdRef,
  setSyncMeta, setLocalSaveError, saveNow, showToast,
  setBusy, setLoading, setLoadingProgress, setLoadingPhase,
}) {
  const cloudSyncQueueRef = useRef(null);
  const cloudListRequest = useRef(0);
  const [cloudSaves, setCloudSaves] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);

  const resetCloudState = useCallback(() => {
    cloudListRequest.current++;
    setCloudSaves([]);
    setCloudLoading(false);
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

  // Cloud-Upload eines vollständigen, konsistenten Speicherpunkts.
  // Verwendet die Queue — nur ein Upload gleichzeitig, verspätete Antworten
  // werden verworfen. localBaseRevision wird nur nach Bestätigung aktualisiert.
  const uploadToCloud = useCallback(async (s, saveLabel, saveType, options = {}) => {
    const token = sessionToken();
    const partyId = s?.meta?.partyId;
    if (!partyId || !isCurrentSession(token) || changingStateRef.current) return { skipped: true };
    const snapshot = cloneSaveSnapshot(s);
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
        const res = await withCloudRetry(() => meta.cloudId
          ? saveCloudSave(meta.cloudId, snapshot, expectedRevision, saveLabel, saveType || "auto", token.userId)
          : createCloudSave(snapshot, partyId, saveLabel, saveType || "new", token.userId),
          { isCurrent: () => stillCurrent() && hasLockRef.current && !lockRequiresReloadRef.current });
        if (res.skipped) return res;
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

  const retryCloudSync = useCallback(async () => {
    const current = stateRef.current;
    const token = sessionToken();
    if (!current || changingStateRef.current) return { ok: false, error: "Kein aktiver Spielstand." };
    if (syncMetaRef.current?.status === "conflict") return { ok: false, error: "Bitte zuerst den Versionskonflikt lösen." };
    const local = await saveNow(current);
    if (!isCurrentSession(token) || stateRef.current?.meta?.partyId !== current.meta?.partyId) return { skipped: true };
    if (!local?.ok) return { ok: false, error: "Lokale Sicherung nicht möglich. Bitte den Spielstand exportieren." };
    return uploadToCloud(current, null, "manual");
  }, [saveNow, sessionToken, isCurrentSession, uploadToCloud]);

  // Cloud-Spielstände auflisten (für geräteübergreifendes Fortsetzen)
  const refreshCloudSaves = useCallback(async () => {
    const token = sessionToken();
    if (!isCurrentSession(token)) return;
    const request=++cloudListRequest.current;
    setCloudLoading(true);
    try {
      const res = await listCloudSaves();
      if ((isCurrentSession(token) && request===cloudListRequest.current) && res.saves) setCloudSaves(res.saves);
    } catch (error) {
      if ((isCurrentSession(token) && request===cloudListRequest.current)) showToast("Cloud-Spielstände konnten nicht geladen werden: " + error.message, "error");
    } finally { if ((isCurrentSession(token) && request===cloudListRequest.current)) setCloudLoading(false); }
  }, [sessionToken, isCurrentSession, showToast]);

  // Cloud-Spielstand laden (geräteübergreifendes Fortsetzen)
  const loadCloudGame = useCallback(async (cloudId) => {
    let token;
    setBusy(true);
    setLoading(true);
    setLoadingProgress(0);
    setLoadingPhase("");
    try {
      token = beginStateChange();
      const onProgress = (pct, phase) => {
        if (isCurrentSession(token)) { setLoadingProgress(pct); setLoadingPhase(phase); }
      };
      onProgress(5, "Cloud-Spielstand wird heruntergeladen …");
      const res = await loadCloudSave(cloudId);
      if (!isCurrentSession(token)) return { skipped: true };
      if (res.error) throw new Error(res.error);
      const meta = makeSyncMeta(res.party_id || res.state?.meta?.partyId || generatePartyId(),
        cloudId, res.revision, "synced", Date.now(), null);
      const result = await activateState(res.state, token, meta, false, onProgress);
      if (result.ok && isCurrentSession(token)) onProgress(100, "Bereit zur Abfahrt …");
      return result;
    } catch (error) {
      if (!token || isCurrentSession(token)) showToast(error.message, "error");
      return { ok: false, error: error.message };
    } finally {
      if (!token || isCurrentSession(token)) { changingStateRef.current = false; setBusy(false); setLoading(false); }
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
        await saveManualSlot(userIdRef.current, "Backup_vor_Cloud_" + Date.now(), cloneSaveSnapshot(stateRef.current));
      }
      if (!isCurrentSession(token)) return { skipped: true };
      return await loadCloudGame(cloudId);
    } catch (error) { return { ok: false, error: error.message }; }
  }, [assertWritable, loadCloudGame, sessionToken, isCurrentSession]);


  // Beim Start nur auf eine neuere Fassung hinweisen, niemals ungefragt laden.
  const checkCloudRevision = useCallback(async (token) => {
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

  }, [isCurrentSession, updateSyncMeta]);

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

  useEffect(() => {
    const timer = setInterval(async () => {
      if (!cloudDirtyRef.current || !stateRef.current || !hasLockRef.current || changingStateRef.current ||
          !navigator.onLine || syncMetaRef.current?.status === "conflict") return;
      await uploadToCloud(stateRef.current, null, "auto");
    }, 180000);
    return () => clearInterval(timer);
  }, [uploadToCloud]);


  return {
    cloudSaves, cloudLoading, resetCloudState, checkCloudRevision, updateSyncMeta,
    uploadToCloud, retryCloudSync, refreshCloudSaves, loadCloudGame, deleteCloudGame,
    resolveConflictKeepBoth, resolveConflictKeepLocal, resolveConflictKeepCloud,
  };
}
