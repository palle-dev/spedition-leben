import { coldPart, withCold, packResult } from './simulationTransport';

// The worker retains the last response's financial originals and orders. Reuse is
// explicit and revision-bound; a failed command discards every retained value.
export function createSimulationRuntime(execute, compact) {
  let retained = null;
  return async function run(message) {
    const { id, command, params } = message;
    if ((message.reuseCold || message.reuseOrders) && (!retained || retained.revision !== message.baseRevision || (message.reuseOrders && !Array.isArray(retained.orders)))) return { id, needsSnapshot: true };
    let state = message.reuseCold ? withCold(message.state, retained) : message.state;
    if (message.reuseOrders) state = { ...state, orders: retained.orders };
    const source = coldPart(state);
    // The engine appends/prunes arrays; existing original entries are immutable.
    // Freeze only rows, not the mutable journal array used by postJournal.
    if (source) for (const entry of source.journal) freezeOriginal(entry);
    // Source array must survive push/splice/filter operations during execution.
    const base = source ? { ...source, journal: source.journal.slice() } : null;
    retained = null;
    try {
      const data = await execute(state, command, params || {});
      if (data.error) return { id, data };
      if (data.state) {
        try { data.state = await compact(data.state); }
        catch { /* Keep complete originals and outbox if compaction fails. */ }
      }
      const packet = packResult(data, base);
      const cold = coldPart(data.state);
      if (cold) retained = { ...cold, orders: data.state.orders, revision: id };
      return { id, ...packet };
    } catch (error) {
      retained = null;
      return { id, data: { error: error?.message || 'Unbekannter Fehler im Worker' } };
    }
  };
}
const frozen = new WeakSet();
function freezeOriginal(value) {
  if (!value || typeof value !== 'object' || frozen.has(value)) return;
  frozen.add(value);
  for (const child of Object.values(value)) freezeOriginal(child);
  Object.freeze(value);
}
