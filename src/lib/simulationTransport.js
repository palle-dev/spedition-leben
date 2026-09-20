import { packProjection, unpackProjection } from "./projectionTransport";
// Immutable finance trees support response references and stable save snapshots.
// Read-only UI orders can also be retained by the worker for confirmed inputs.
const frozen = new WeakSet();
function freezeTree(value) {
  if (!value || typeof value !== 'object' || frozen.has(value)) return;
  frozen.add(value);
  for (const child of Object.values(value)) freezeTree(child);
  Object.freeze(value);
}
// UI order snapshots are read-only; the worker owns its mutable copy.
export function freezeOrderSnapshot(state) { freezeTree(state?.orders); }
export function freezeFinancialSnapshot(state) {
  freezeTree(state?.accounting?.journal);
  freezeTree(state?.accounting?.journalProjection);
}
export function coldPart(state) {
  const a = state?.accounting;
  return a && Array.isArray(a.journal) ? { journal: a.journal, projection: a.journalProjection, hasProjection: Object.hasOwn(a, 'journalProjection') } : null;
}
export function withoutCold(state) {
  const accounting = { ...state.accounting };
  delete accounting.journal; delete accounting.journalProjection;
  return { ...state, accounting };
}
export function withCold(state, cold) {
  const accounting = { ...state.accounting, journal: cold.journal };
  if (cold.hasProjection) accounting.journalProjection = cold.projection;
  else delete accounting.journalProjection;
  return { ...state, accounting };
}
export function packResult(data, source) {
  const next = coldPart(data.state);
  if (!source || !next) return { data, reusedRows: 0 };
  const indices = new Map(source.journal.map((entry, index) => [entry, index]));
  let reusedRows = 0;
  const rows = next.journal.map(entry => {
    if (indices.has(entry)) { reusedRows++; return indices.get(entry); }
    return entry;
  });
  const reuseProjection = next.hasProjection === source.hasProjection && next.projection === source.projection;
  return { data: { ...data, state: withoutCold(data.state) },
    cold: { rows, reuseProjection, hasProjection: next.hasProjection, ...(reuseProjection ? {} : packProjection(next.projection, source.projection)) }, reusedRows };
}
export function unpackResult(packet, source) {
  if (!packet.cold) return packet.data;
  if (!source || !Array.isArray(packet.cold.rows) || !packet.data?.state?.accounting) throw Error('Ungültige Simulationsantwort.');
  const journal = packet.cold.rows.map(row => {
    if (typeof row !== 'number') {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Ungültiger Journalbeleg.');
      return row;
    }
    if (!Number.isSafeInteger(row) || row < 0 || row >= source.journal.length) throw Error('Ungültiger Journalverweis.');
    return source.journal[row];
  });
  return { ...packet.data, state: withCold(packet.data.state, {
    journal, hasProjection: packet.cold.hasProjection,
    projection: unpackProjection(packet.cold, source),
  }) };
}

// A queued save needs a stable point-in-time view, not mutable engine input.
// Reuse only trees frozen by this module (a shallow Object.freeze is not enough).
// Imported/legacy/unconfirmed states take the ordinary full-copy path.
export function cloneSaveSnapshot(state) {
  const cold = coldPart(state);
  const safeTree = value => value === null || typeof value !== 'object' || frozen.has(value);
  if (!cold || !frozen.has(cold.journal) || !safeTree(cold.projection)) return structuredClone(state);
  return withCold(structuredClone(withoutCold(state)), cold);
}
