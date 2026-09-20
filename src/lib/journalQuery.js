import { readHistoryBlock } from './historyRepository';
import { readArchiveRecords } from './historyArchive';

// Newest booking numbers first across active and immutable records. The cursor
// belongs to the pinned snapshot used by the caller, not the changing live game.
export async function journalPage({ state, userId, filters = {}, before = Infinity }) {
  const needle = (filters.search || '').toLocaleLowerCase('de-DE');
  const matches = e => e.entryNo < before &&
    (!filters.account || e.lines.some(l => l.account === filters.account)) &&
    (!filters.type || e.type === filters.type) &&
    (filters.fromMin == null || e.gameTime >= filters.fromMin) &&
    (filters.toMin == null || e.gameTime <= filters.toMin) &&
    (!filters.orderId || e.orderId === filters.orderId) &&
    (!filters.vehicleId || e.vehicleId === filters.vehicleId) &&
    (!needle || [e.text, e.partnerName, e.entryNo].join(' ').toLocaleLowerCase('de-DE').includes(needle));
  let rows = [];
  function include(entries) {
    for (const e of entries) if (matches(e)) rows.push(e);
    rows.sort((a, b) => b.entryNo - a.entryNo);
    rows = rows.slice(0, 51);
  }
  include(state.accounting?.journal || []);
  const chunks = (state.historyArchive?.chunks || []).filter(c => c.kind === 'accountingJournal')
    .sort((a, b) => (b.maxEntryNo ?? Infinity) - (a.maxEntryNo ?? Infinity));
  for (const c of chunks) {
    if (c.minEntryNo >= before || (rows.length === 51 && c.maxEntryNo < rows[50].entryNo)) continue;
    include(await readArchiveRecords(c, await readHistoryBlock(userId, c)));
  }
  return { rows: rows.slice(0, 50), before: rows.length > 50 ? rows[49].entryNo : null };
}
