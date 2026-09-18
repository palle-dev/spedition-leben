// Gemeinsame Mindeststruktur für Laden und Persistieren.
// Optionale Felder älterer Spielstände dürfen fehlen und werden später migriert.
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isCompleteSnapshot(state) {
  return isObject(state) && Number.isFinite(state.gameTime) && state.gameTime >= 0 &&
    isObject(state.company) && isObject(state.private) &&
    ["vehicles", "drivers", "orders"].every(key => Array.isArray(state[key])) &&
    ["appointments", "branches", "trips", "tours", "events", "achievements", "bookings"]
      .every(key => state[key] == null || Array.isArray(state[key])) &&
    (state.meta?.partyId == null ||
      (typeof state.meta.partyId === "string" && state.meta.partyId.trim().length > 0));
}

// Auch die nach dem Schreiben folgende Revision muss exakt darstellbar bleiben.
export function isWritableRevision(revision) {
  return Number.isSafeInteger(revision) && revision >= 1 && revision < Number.MAX_SAFE_INTEGER;
}
