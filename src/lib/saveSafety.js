import { migrateCompetition } from "./simulation/competitionCore";
import { isCompleteSnapshot } from "./simulation/snapshotValidation";
import { migrateApprovals } from "./simulation/delegationEngine";
import { ensureWorldContinuation } from "./simulation/worldContinuation";

// Gemeinsame Grenzen für lokale Spielstände und den Import.
export const MAX_SAVE_BYTES = 256 * 1024 * 1024;

export function localSaveKey(userId) {
  if (!userId) throw new Error("Zum Speichern bitte anmelden.");
  return "spedition_leben_state:user:" + userId;
}

export function writeRecoverySave(userId, state, savedAt = Date.now()) {
  if (state?.historyArchive?.chunks?.length) throw new Error("Archiv-Spielstände benötigen IndexedDB oder einen Datei-Export.");
  localStorage.setItem(localSaveKey(userId), JSON.stringify({ userId, state, savedAt }));
}

export function readRecoverySave(userId) {
  if (!userId) return null;
  const raw = localStorage.getItem(localSaveKey(userId));
  if (!raw) return null;
  const record = JSON.parse(raw);
  return record?.userId === userId && record.state ? record : null;
}

// Erst validieren, dann eine unabhängige Kopie aktivieren. Alte Speicherdaten
// werden nicht verändert; ein fehlgeschlagener Import lässt die Partie intakt.
export function prepareLoadedState(raw) {
  if (!isCompleteSnapshot(raw)) {
    throw new Error("Der Spielstand ist unvollständig oder hat ein ungültiges Format.");
  }
  return prepareOwnedLoadedState(structuredClone(raw));
}

// Only for a state exclusively owned by this operation (e.g. postMessage copy).
// On failure this owned value is discarded; never pass a live UI state here.
export function prepareOwnedLoadedState(state) {
  if (!isCompleteSnapshot(state)) {
    throw new Error("Der Spielstand ist unvollständig oder hat ein ungültiges Format.");
  }
  for (const key of ["appointments", "branches", "trips", "tours", "events", "achievements", "bookings"]) {
    if (state[key] == null) state[key] = [];
    if (!Array.isArray(state[key])) throw new Error("Ungültiger Spielstand: " + key);
  }
  if (!state.meta || typeof state.meta !== "object" || Array.isArray(state.meta)) state.meta = {};
  // Geladene Spielstände starten pausiert, ohne verstrichene Offline-Zeit nachzuholen.
  if (state.timeControl) {
    state.timeControl = {
      ...state.timeControl, enabled: false, anchorRealMs: null,
      anchorGameNumerator: state.gameTime * 100,
      frozenGameNumerator: state.gameTime * 100,
      processedGameMinute: state.gameTime, pauseReason: "loaded",
      claim: { owner: null, expiresAt: 0, generation: 0 },
    };
  }
  // Freigaben vor der ersten Anzeige normalisieren, auch ohne Spielbefehl.
  migrateApprovals(state);
  ensureWorldContinuation(state);
  migrateCompetition(state);
  return state;
}