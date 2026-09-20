import { readHistoryBlock } from './historyRepository';
import { readArchiveRecords } from './historyArchive';
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
// Limits are decoded JSON bytes and row counts, not an exact JS heap estimate.
export function createHistoryReadCache({ load = readHistoryBlock, decode = readArchiveRecords,
  maxBytes = 8 * 1024 * 1024, maxRows = 4000, maxChunks = 8 } = {}) {
  const entries = new Map();
  let owner, bytes = 0, rows = 0;
  function clear() { entries.clear(); bytes = 0; rows = 0; }
  return async function read(userId, chunk) {
    if (owner !== userId) { clear(); owner = userId; }
    // Only immutable, persisted references are cached. Inline input must always
    // be validated, even when it claims the hash of an already cached block.
    const cacheable = !!userId && chunk.data == null;
    const key = JSON.stringify(Object.keys(chunk).filter(k => k !== 'data').sort().map(k => [k, chunk[k]]));
    if (cacheable && entries.has(key)) {
      const hit = entries.get(key); entries.delete(key); entries.set(key, hit);
      return hit.records;
    }
    const records = await decode(chunk, await load(userId, chunk));
    if (!cacheable || owner !== userId || !Number.isSafeInteger(chunk.rawBytes) || chunk.rawBytes < 1 ||
        chunk.rawBytes > maxBytes || records.length > maxRows) return records;
    while (entries.size && (bytes + chunk.rawBytes > maxBytes || rows + records.length > maxRows || entries.size >= maxChunks)) {
      const first = entries.keys().next().value, old = entries.get(first);
      bytes -= old.bytes; rows -= old.records.length; entries.delete(first);
    }
    entries.set(key, { records: freeze(records), bytes: chunk.rawBytes });
    bytes += chunk.rawBytes; rows += records.length;
    return records;
  };
}
