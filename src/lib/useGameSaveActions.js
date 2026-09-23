import { useCallback } from "react";
import { cloneSaveSnapshot } from "@/lib/simulationTransport";
import { hydrateHistory } from "@/lib/historyRepository";
import { processSaveFile } from "@/lib/saveFileClient";
import { loadCurrent, loadAutosave, listManualSlots, saveManualSlot, loadManualSlot, deleteManualSlot } from "@/lib/persistence";

// Benutzeraktionen auf Speicherständen. Die Aktivierung bleibt zentral,
// damit lokale, Cloud- und importierte Stände dieselben Sitzungsregeln nutzen.
export function useGameSaveActions({
  sessionToken, isCurrentSession, assertWritable, beginStateChange, activateState,
  stateRef, userIdRef, changingStateRef, ensurePartyId,
  uploadToCloud, refreshCloudSaves, showToast, setLocalSaveError,
}) {
  const preserveCurrentParty = useCallback(async (token) => {
    if (!stateRef.current) return;
    const snapshot = cloneSaveSnapshot(stateRef.current);
    ensurePartyId(snapshot);
    await saveManualSlot(token.userId, "Partie · " + snapshot.company.name + " · " + snapshot.meta.partyId, snapshot);
    if (!isCurrentSession(token)) throw new Error("Die Sitzung hat sich geändert. Bitte erneut versuchen.");
  }, [ensurePartyId, isCurrentSession]);


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
  const exportGame = useCallback(async () => {
    if (!stateRef.current) return null;
    return processSaveFile("export", await hydrateHistory(userIdRef.current, stateRef.current));
  }, []);

  const queryHistory = useCallback(async (snapshot, options = {}) => {
    const token = sessionToken();
    const result = await processSaveFile("historyPage", { ...options, state: { historyArchive: snapshot.historyArchive }, userId: token.userId, sessionGeneration: token.generation });
    if (!isCurrentSession(token)) throw Error("Spielstand wurde inzwischen gewechselt.");
    return result;
  }, [sessionToken, isCurrentSession]);
  const queryJournal = useCallback(async (snapshot, options = {}) => {
    const token = sessionToken();
    const result = await processSaveFile("journalPage", { ...options, state: { historyArchive: snapshot.historyArchive, accounting: { journal: snapshot.accounting?.journal } }, userId: token.userId, sessionGeneration: token.generation });
    if (!isCurrentSession(token)) throw Error("Spielstand wurde inzwischen gewechselt.");
    return result;
  }, [sessionToken, isCurrentSession]);
  const exportHistory = useCallback(async () => processSaveFile("archive", await hydrateHistory(userIdRef.current, stateRef.current)), []);

  const importGame = useCallback(async (exportStr) => {
    let token;
    try {
      // Ein ungültiger Import soll nicht einmal die laufende Partie pausieren.
      const importToken = sessionToken();
      const imported = await processSaveFile("import", exportStr);
      if (!isCurrentSession(importToken)) return { skipped: true };
      token = beginStateChange();
      await preserveCurrentParty(token);
      return await activateState(imported, token);
    } catch (error) { return { ok: false, error: error.message }; }
    finally { if (token && isCurrentSession(token)) changingStateRef.current = false; }
  }, [beginStateChange, activateState, isCurrentSession, sessionToken, preserveCurrentParty]);

  const saveSlot = useCallback(async (name) => {
    if (!stateRef.current) return { ok: false, error: "Kein Spielstand" };
    const token = sessionToken();
    const snapshot = stateRef.current;
    try {
      assertWritable();
      await saveManualSlot(token.userId, name, cloneSaveSnapshot(snapshot));
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


  return {
    preserveCurrentParty, reload, exportGame, queryHistory, queryJournal, exportHistory,
    importGame, saveSlot, loadSlot, deleteSlot, listSlots, loadAutosaveSlot,
  };
}
