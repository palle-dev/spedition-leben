import { useCallback, useEffect } from "react";
import { cloneSaveSnapshot } from "@/lib/simulationTransport";
import { saveCurrent, saveAutosave, getAllAutosaveMetas } from "@/lib/persistence";
import { writeRecoverySave } from "@/lib/saveSafety";
import { releaseLock } from "@/lib/tabLock";

// Lokale Schreibqueue, Sicherheitskopie und periodische Sicherungen.
// Sitzung und Tab-Sperre gehören dem Provider; jeder Schreibpfad prüft sie erneut.
export function useLocalSaveWriter({
  sessionToken, isCurrentSession, assertWritable,
  stateRef, syncMetaRef, changingStateRef, hasLockRef, lockRequiresReloadRef,
  userIdRef, changeVersionRef, dirtySaveRef, dirtyAutosaveRef,
  localSaveQueueRef, autosaveIndexRef, setLocalSaveError, setAutosaveMetas,
}) {
  // Sofortiges Speichern (für kritische Operationen: newGame, loadSlot, beforeunload).
  const saveNow = useCallback(async (s) => {
    const token = sessionToken();
    const version = changeVersionRef.current;
    if (!s || changingStateRef.current || !isCurrentSession(token)) return { skipped: true };
    const snapshot = cloneSaveSnapshot(s);
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


  // Rotierende Sicherungen behalten die Änderungsmarkierung bis zum Erfolg.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!dirtyAutosaveRef.current || !stateRef.current || !hasLockRef.current || changingStateRef.current) return;
      const token = sessionToken();
      const version = changeVersionRef.current;
      const snapshot = cloneSaveSnapshot(stateRef.current);
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


  return { saveNow };
}
