import { isFrozenSnapshotTree } from './simulationTransport';
import { readLimited } from './historyArchive';
const FORMAT = 'local-finance-gzip-v1';
const LIMIT = 256 * 1024 * 1024;
const cached = new WeakMap();
const hash = async blob => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())), n => n.toString(16).padStart(2, '0')).join('');
async function encode(projection) {
  const raw = new Blob([JSON.stringify(projection)]);
  if (raw.size < 65536) return null;
  if (raw.size > LIMIT) throw Error('Finanzhistorie ist für dieses Speicherformat zu groß.');
  const data = await readLimited(raw.stream().pipeThrough(new CompressionStream('gzip')), LIMIT);
  if (data.size >= raw.size) return null;
  return { format: FORMAT, rawBytes: raw.size, sha256: await hash(data), data };
}
// The block belongs to the same snapshot/transaction, never an external pointer.
export async function packStoredProjection(record) {
  const p = record?.state?.accounting?.journalProjection;
  if (!p || p.version !== 1 || typeof CompressionStream === 'undefined') return record;
  const count = p.count;
  const immutable = isFrozenSnapshotTree(p);
  let block = immutable ? cached.get(p) : undefined;
  if (block === undefined) {
    block = await encode(p);
    if (immutable) cached.set(p, block);
  }
  if (!block) return record;
  return { ...record, localFinancialProjection: block, state: { ...record.state,
    accounting: { ...record.state.accounting, journalProjection: { version: FORMAT, count } } } };
}
export async function unpackStoredProjection(record) {
  const marker = record?.state?.accounting?.journalProjection;
  const block = record?.localFinancialProjection;
  if (marker?.version !== FORMAT && !block) return record;
  if (marker?.version !== FORMAT || block?.format !== FORMAT || !(block.data instanceof Blob) ||
      !Number.isSafeInteger(block.rawBytes) || block.rawBytes < 1 || block.rawBytes > LIMIT ||
      typeof block.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(block.sha256)) throw Error('Ungültiger Finanzhistorienblock in der Sicherung.');
  if (await hash(block.data) !== block.sha256) throw Error('Finanzhistorien-Prüfsumme stimmt nicht überein.');
  const raw = await readLimited(block.data.stream().pipeThrough(new DecompressionStream('gzip')), block.rawBytes);
  if (raw.size !== block.rawBytes) throw Error('Finanzhistorie ist unvollständig.');
  const projection = JSON.parse(await raw.text());
  if (projection?.version !== 1 || projection.count !== marker.count || !projection.days || typeof projection.days !== 'object' || Array.isArray(projection.days)) throw Error('Ungültige Finanzhistorie in der Sicherung.');
  const { localFinancialProjection, ...rest } = record;
  return { ...rest, state: { ...record.state, accounting: { ...record.state.accounting, journalProjection: projection } } };
}
