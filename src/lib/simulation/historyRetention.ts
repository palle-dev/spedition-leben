// Lossless transfer queue. The adapter compresses these original records; the
// persistence layer acknowledges immutable blocks before the UI adopts them.
// No global state, RNG calls, clock reads or changes to the game's id counter.
export function preserveHistory(state, kind, records, scope = null) {
  if (!records?.length) return;
  state.historyOutbox ||= [];
  for (const data of records) {
    state.historySequence = (state.historySequence || 0) + 1;
    state.historyOutbox.push({ sequence: state.historySequence, kind,
      archivedAtMin: state.gameTime, scope, data: structuredClone(data) });
  }
}
export function retainHistory(state, kind, previous, retained, scope = null) {
  const keep = new Set(retained);
  preserveHistory(state, kind, (previous || []).filter(record => !keep.has(record)), scope);
  return retained;
}
export function retainLatestHistory(state, kind, records, limit, scope = null) {
  if (records.length <= limit) return records;
  preserveHistory(state, kind, records.slice(0, -limit), scope);
  return records.slice(-limit);
}
