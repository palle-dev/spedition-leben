// Immutable gzip Blobs are stored by IndexedDB and shared cheaply by structured
// clone. The engine never inflates them. Portable saves embed verified base64.
const DAY = 1440;
const MAX_RAW = 256 * 1024 * 1024;
const KINDS = new Set(["expiredOffers", "accountingTasks"]);
export const ARCHIVE_VERSION = 1;

export async function readLimited(stream, limit = MAX_RAW) {
  const reader = stream.getReader(), parts = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw Error("Die entpackten Daten sind zu groß (maximal 256 MB). Bitte eine kleinere Sicherung verwenden.");
      parts.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  return new Blob(parts);
}
async function hash(blob) {
  const bytes = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
}
async function encode(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
function decode(value) {
  if (typeof value !== "string" || value.length > MAX_RAW * 1.4) throw Error("Ungültiger Archivinhalt.");
  const binary = atob(value);
  return new Blob([Uint8Array.from(binary, c => c.charCodeAt(0))], { type: "application/gzip" });
}
function chunksOf(state) {
  const archive = state?.historyArchive;
  if (!archive) return [];
  if (archive.version !== ARCHIVE_VERSION || !Array.isArray(archive.chunks) || archive.chunks.length > 20000) throw Error("Unbekanntes oder ungültiges Spielstandsarchiv.");
  const ids = new Set();
  for (const c of archive.chunks) {
    if (!KINDS.has(c.kind) || !/^[a-f0-9]{64}$/.test(c.id) || ids.has(c.id) ||
        !Number.isSafeInteger(c.count) || c.count < 1 || !Number.isSafeInteger(c.rawBytes) || c.rawBytes < 1 || c.rawBytes > MAX_RAW) throw Error("Ungültiger Archivindex.");
    ids.add(c.id);
  }
  return archive.chunks;
}
export async function portableHistory(state) {
  const chunks = chunksOf(state);
  if (!chunks.length) return state;
  const portable = [];
  for (const c of chunks) {
    if (!(c.data instanceof Blob)) throw Error("Archivdaten fehlen. Bitte den ursprünglichen Spielstand erneut laden.");
    portable.push({ ...c, data: await encode(c.data) });
  }
  return { ...state, historyArchive: { ...state.historyArchive, chunks: portable } };
}
export async function restoreHistory(state) {
  const chunks = chunksOf(state), restored = [];
  // Inflate one chunk at a time; never hold the entire historical object tree.
  for (const c of chunks) {
    const data = c.data instanceof Blob ? c.data : decode(c.data);
    if (await hash(data) !== c.id) throw Error("Archiv-Prüfsumme stimmt nicht überein.");
    const raw = await readLimited(data.stream().pipeThrough(new DecompressionStream("gzip")), c.rawBytes);
    if (raw.size !== c.rawBytes) throw Error("Archiv ist unvollständig.");
    const records = JSON.parse(await raw.text());
    if (!Array.isArray(records) || records.length !== c.count || records.some(r => !r || typeof r !== "object" || Array.isArray(r))) throw Error("Archiv enthält ungültige Datensätze.");
    restored.push({ ...c, data });
  }
  return chunks.length ? { ...state, historyArchive: { ...state.historyArchive, chunks: restored } } : state;
}
// Preserve every explicitly referenced order, including contracts, decisions,
// accounting documents and return legs. Unknown/new consumers remain conservative.
function referencedOrders(state) {
  const ids = new Set();
  function visit(value, key = "") {
    if (typeof value === "string") { if (/order/i.test(key)) ids.add(value); return; }
    if (!value || typeof value !== "object" || value instanceof Blob) return;
    if (Array.isArray(value)) { for (const item of value) visit(item, key); return; }
    for (const [k, item] of Object.entries(value)) visit(item, k);
  }
  for (const [key, value] of Object.entries(state)) if (key !== "orders" && key !== "historyArchive") visit(value, key);
  return ids;
}
export function partitionHistory(state) {
  const references = referencedOrders(state);
  const offers = [], orders = [];
  for (const o of state.orders || []) {
    const removable = o.status === "expired" && o.acceptedAtMin == null && o.startedAtMin == null &&
      !o.contractId && !o.keyAccountContractId && !o.paidCents && !references.has(o.id) &&
      Number.isFinite(o.acceptDeadlineMin) && o.acceptDeadlineMin < state.gameTime - 2 * DAY;
    (removable ? offers : orders).push(o);
  }
  const tasks = [], taskQueue = [];
  for (const t of state.accounting?.taskQueue || []) {
    (t.status === "done" && Number.isFinite(t.completedAtMin) && t.completedAtMin < state.gameTime - 7 * DAY ? tasks : taskQueue).push(t);
  }
  return { offers, orders, tasks, taskQueue };
}
export async function compactHistory(state) {
  if (!state || !Array.isArray(state.orders) || typeof CompressionStream === "undefined") return state;
  const day = Math.floor(state.gameTime / DAY);
  if (state.historyArchive?.checkedDay === day) return state;
  const old = chunksOf(state);
  const p = partitionHistory(state), additions = [];
  for (const [kind, records] of [["expiredOffers", p.offers], ["accountingTasks", p.tasks]]) {
    // Bounded chunks make export/validation/archive browsing memory independent
    // of the total age of a game.
    for (let offset = 0; offset < records.length; offset += 1000) {
      const rows = records.slice(offset, offset + 1000);
      const raw = new Blob([JSON.stringify(rows)]);
      const data = await readLimited(raw.stream().pipeThrough(new CompressionStream("gzip")));
      additions.push({ id: await hash(data), kind, count: rows.length, rawBytes: raw.size, data });
    }
  }
  // Only exchange arrays after ALL compression has succeeded. A failure leaves
  // the original snapshot intact, including every historical record.
  return { ...state, orders: p.orders,
    ...(state.accounting ? { accounting: { ...state.accounting, taskQueue: p.taskQueue } } : {}),
    historyArchive: { version: ARCHIVE_VERSION, checkedDay: day, chunks: [...old, ...additions] } };
}
export function archiveStats(state) {
  const chunks = state?.historyArchive?.chunks || [];
  return { records: chunks.reduce((n, c) => n + c.count, 0),
    rawBytes: chunks.reduce((n, c) => n + c.rawBytes, 0),
    compressedBytes: chunks.reduce((n, c) => n + (c.data?.size || 0), 0) };
}
