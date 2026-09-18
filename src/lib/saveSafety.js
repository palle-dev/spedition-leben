// Gemeinsame Grenzen für lokale Spielstände und den Import.
export const MAX_SAVE_BYTES = 50 * 1024 * 1024;

export function localSaveKey(userId) {
  if (!userId) throw new Error("Zum Speichern bitte anmelden.");
  return "spedition_leben_state:user:" + userId;
}

export function writeRecoverySave(userId, state, savedAt = Date.now()) {
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
  if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
      !Number.isFinite(raw.gameTime) || raw.gameTime < 0 ||
      !raw.company || typeof raw.company !== "object" || Array.isArray(raw.company) ||
      !raw.private || typeof raw.private !== "object" || Array.isArray(raw.private) ||
      !["vehicles", "drivers", "orders"].every(key => Array.isArray(raw[key]))) {
    throw new Error("Der Spielstand ist unvollständig oder hat ein ungültiges Format.");
  }
  const state = structuredClone(raw);
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
  return state;
}
