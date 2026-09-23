import { archiveIdentity } from "./cloudArchive.ts";

// Blocks are immutable and owner-scoped. Never delete during save/delete:
// another slot or an in-flight CAS may still refer to them.
//
// Current saves are complete private files. Older embedded snapshots and
// immutable owner-scoped archive blocks remain readable. Missing originals
// are an error: loading must never silently shorten history or alter totals.
export class CloudArchiveError extends Error {}

const URI_PREFIX = "uri:";

function isFileUri(data: unknown): data is string {
  return typeof data === "string" && data.startsWith(URI_PREFIX);
}

function chunks(state: any): any[] {
  const archive = state?.historyArchive;
  if (!archive) {
    if (state?.accounting?.journalProjection?.count) throw new CloudArchiveError("Finanzarchiv fehlt. Die Sicherung wurde nicht verändert.");
    return [];
  }
  if (archive.version !== 1 || !Array.isArray(archive.chunks)) throw new CloudArchiveError("Ungültiges Cloud-Archiv.");
  const seen = new Set();
  for (const c of archive.chunks) {
    if (!c || !/^[a-f0-9]{64}$/.test(c.id) || seen.has(c.id) ||
        !Number.isSafeInteger(c.count) || c.count < 1 ||
        !Number.isSafeInteger(c.rawBytes) || c.rawBytes < 1 ||
        !/^(expiredOffers|accountingTasks|accountingJournal|history:[a-zA-Z0-9_.-]+)$/.test(c.kind)) {
      throw new CloudArchiveError("Ungültiger Cloud-Archivindex.");
    }
    seen.add(c.id);
  }
  if (state.accounting?.journalProjection && archive.chunks.filter(c => c.kind === "accountingJournal").reduce((n, c) => n + c.count, 0) !== state.accounting.journalProjection.count) {
    throw new CloudArchiveError("Finanzarchiv und Auswertung sind unvollständig. Die Sicherung wurde nicht verändert.");
  }
  return archive.chunks;
}

async function verifyBase64(data: unknown, id: string): Promise<void> {
  if (typeof data !== "string" || !data.length) throw new CloudArchiveError("Cloud-Archivblock fehlt.");
  let binary: string;
  try { binary = atob(data); } catch { throw new CloudArchiveError("Ungültiger Cloud-Archivinhalt."); }
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(binary, c => c.charCodeAt(0)));
  const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  if (actual !== id) throw new CloudArchiveError("Cloud-Archiv-Prüfsumme stimmt nicht überein.");
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}

function reference(c: any): any { const { data, ...rest } = c; return rest; }
function stateWithChunks(state: any, items: any[]): any {
  if (!state.historyArchive) return state;
  const archive = { ...state.historyArchive, chunks: items };
  delete archive.storage;
  return { ...state, historyArchive: archive };
}
function validRecord(row: any, ownerId: string, c: any): boolean {
  return row?.owner_id === ownerId && row.content_hash === c.id &&
    row.descriptor && archiveIdentity(row.descriptor) === archiveIdentity(c);
}

// Bounded concurrency: processes async tasks in parallel batches to avoid
// sequential round-trips per chunk (the main cause of multi-minute sync hangs).
const CONCURRENCY = 3;
// Retry transient server errors (disconnects, timeouts) that were causing
// HTTP 500 failures during archive block uploads on long-running saves.
async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelayMs = 1500): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === retries) throw error;
      const msg = (error?.message || "") + "";
      if (/disconnect|timeout|network|fetch|ECONNRESET|socket|503|502|504/i.test(msg)) {
        await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error("withRetry: unreachable");
}
// Retry fetch calls that fail with transient network errors (disconnects,
// timeouts) — common when downloading many archive blocks from private storage.
async function fetchWithRetry(url: string, retries = 3, baseDelayMs = 1500): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok || attempt === retries) return response;
      // 5xx server errors are worth retrying; 4xx are not.
      if (response.status >= 500 && attempt < retries) {
        await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === retries) throw error;
      await new Promise(r => setTimeout(r, baseDelayMs * (attempt + 1)));
    }
  }
  throw new Error("fetchWithRetry: unreachable");
}
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Offload the full state to a private file when it exceeds the BSON document
// size limit (~16 MB). Small states stay inline for zero overhead.
const STATE_FILE_THRESHOLD = 12_000_000;
export async function stageState(storage: any, state: any): Promise<any> {
  if (!storage?.uploadPrivateFile) return state;
  const json = JSON.stringify(state);
  if (json.length < STATE_FILE_THRESHOLD) return state;
  const blob = new Blob([json], { type: "application/json" });
  const file = new File([blob], "state.json", { type: "application/json" });
  const { file_uri } = await withRetry(() => storage.uploadPrivateFile({ file }));
  if (typeof file_uri !== "string" || !file_uri.trim()) throw new CloudArchiveError("Spielstandsdatei wurde nicht bestätigt.");
  return URI_PREFIX + file_uri;
}
export async function hydrateState(storage: any, state: any): Promise<any> {
  if (typeof state !== "string" || !isFileUri(state)) return state;
  if (!storage?.createSignedUrl) throw new CloudArchiveError("Storage-Funktionen fehlen zum Laden des Spielstands.");
  const file_uri = state.slice(URI_PREFIX.length);
  const { signed_url } = await withRetry(() => storage.createSignedUrl({ file_uri }));
  const response = await fetchWithRetry(signed_url);
  if (!response.ok) throw new CloudArchiveError("Spielstand konnte nicht geladen werden (" + response.status + ").");
  return await response.json();
}

// Fetches archive blocks by content hash in small batches. A single filter call
// with hundreds of 64-char hashes exceeds the platform's request-size limit
// (HTTP 431), so we chunk the $in array into manageable groups.
async function fetchBlocksByHashes(blocks: any, ownerId: string, hashes: string[], batchSize = 40): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  for (let i = 0; i < hashes.length; i += batchSize) {
    const batch = hashes.slice(i, i + batchSize);
    if (batch.length === 0) continue;
    const rows = await withRetry(() => blocks.filter({ owner_id: ownerId, content_hash: { $in: batch } }, "-created_date", 1000));
    for (const row of rows || []) {
      if (row?.content_hash && !result.has(row.content_hash)) result.set(row.content_hash, row);
    }
  }
  return result;
}

export async function hydrateCloudArchive(blocks: any, ownerId: string, state: any, refs: Record<string, string> | null = {}, storage: any = null): Promise<any> {
  state = await hydrateState(storage, state);
  const all = chunks(state);
  // Complete embedded saves need no archive-entity access.
  const unresolved = all.filter(c => c.data == null && !refs?.[c.id]);
  const rowByHash = unresolved.length
    ? await fetchBlocksByHashes(blocks, ownerId, unresolved.map(c => c.id))
    : new Map<string, any>();
  const items = await mapWithConcurrency(all, CONCURRENCY, async (c: any) => {
    if (c.data != null) {
      await verifyBase64(c.data, c.id);
      return c;
    }
    const row = refs?.[c.id] ? await blocks.get(refs[c.id]) : rowByHash.get(c.id);
    if (!validRecord(row, ownerId, c)) {
      throw new CloudArchiveError("Cloud-Archivblock fehlt oder Zugriff/Archivindex ist ungültig. Die Sicherung wurde nicht verändert.");
    }
    if (isFileUri(row.data)) {
      if (!storage?.createSignedUrl) throw new CloudArchiveError("Storage-Funktionen fehlen zum Laden des Archivblocks.");
      const { signed_url } = await withRetry(() => storage.createSignedUrl({ file_uri: row.data.slice(URI_PREFIX.length) }));
      const response = await fetchWithRetry(signed_url);
      if (!response.ok) throw new CloudArchiveError("Cloud-Archivblock konnte nicht geladen werden (" + response.status + ").");
      const base64 = bytesToBase64(await response.arrayBuffer());
      await verifyBase64(base64, c.id);
      return { ...c, data: base64 };
    }
    await verifyBase64(row.data, c.id);
    return { ...c, data: row.data };
  });
  return stateWithChunks(state, items);
}

export async function stageCloudArchive(blocks: any, ownerId: string, state: any, previous: any = null, previousRefs: Record<string, string> | null = {}, storage: any = null): Promise<{ state: any; archive_blocks: Record<string, string> }> {
  const all = chunks(state);
  // References can only name an unchanged chunk in the owner's previous
  // snapshot. Never accept a client-provided hash as authority to read data.
  const needsPrevious = all.some(c => c.data == null) || (!storage?.uploadPrivateFile && Object.keys(previousRefs || {}).length > 0);
  const oldState = needsPrevious ? await hydrateState(storage, previous) : null;
  const oldChunks = new Map(chunks(oldState).map(c => [c.id, c]));
  for (const c of all) {
    if (c.data != null) await verifyBase64(c.data, c.id);
    else if (!oldChunks.has(c.id) || archiveIdentity(oldChunks.get(c.id)) !== archiveIdentity(c)) {
      throw new CloudArchiveError("Cloud-Archivreferenz fehlt oder wurde verändert.");
    }
  }
  if (storage?.uploadPrivateFile) {
    // Resolve legacy reference-only clients before producing a self-contained
    // file. No archive reads are necessary for today's full client payload.
    const resolved = await mapWithConcurrency(all, CONCURRENCY, async c => {
      if (c.data != null) return c;
      const old = oldChunks.get(c.id);
      const hydrated = await hydrateCloudArchive(blocks, ownerId,
        { historyArchive: { version: 1, chunks: [old] } }, previousRefs, storage);
      return hydrated.historyArchive.chunks[0];
    });
    const complete = stateWithChunks(state, resolved);
    const file = new File([JSON.stringify(complete)], "state.json", { type: "application/json" });
    const { file_uri } = await withRetry(() => storage.uploadPrivateFile({ file }));
    if (typeof file_uri !== "string" || !file_uri.trim()) throw new CloudArchiveError("Spielstandsdatei wurde nicht bestätigt.");
    return { state: URI_PREFIX + file_uri, archive_blocks: {} };
  }
  // Legacy block storage is retained for callers without private-file storage.
  const refs: Record<string, string> = {};
  const toCreate: { chunk: any; storedData: string }[] = [];
  const reused = new Set<string>();
  for (const c of all) {
    if (typeof previousRefs?.[c.id] === "string" && oldChunks.has(c.id) && archiveIdentity(oldChunks.get(c.id)) === archiveIdentity(c)) {
      refs[c.id] = previousRefs[c.id];
      reused.add(c.id);
    }
  }
  const newChunks = all.filter((c: any) => !reused.has(c.id));
  const existingByHash = newChunks.length > 0
    ? await fetchBlocksByHashes(blocks, ownerId, newChunks.map((c: any) => c.id))
    : new Map<string, any>();
  const items: any[] = await mapWithConcurrency(all, CONCURRENCY, async (c: any) => {
    if (reused.has(c.id)) {
      if (c.data != null) await verifyBase64(c.data, c.id);
      return reference(c);
    }
    const data = c.data ?? oldChunks.get(c.id)?.data;
    await verifyBase64(data, c.id);
    const existing = existingByHash.get(c.id);
    if (existing) {
      if (!validRecord(existing, ownerId, c)) throw new CloudArchiveError("Cloud-Archivindex stimmt nicht überein.");
      if (!isFileUri(existing.data)) await verifyBase64(existing.data, c.id);
      refs[c.id] = existing.id;
      return reference(c);
    }
    toCreate.push({ chunk: c, storedData: data });
    return reference(c);
  });
  if (toCreate.length > 0) {
    const created = await withRetry(() => blocks.bulkCreate(toCreate.map(({ chunk, storedData }) => ({
      owner_id: ownerId, content_hash: chunk.id, descriptor: reference(chunk), data: storedData,
    }))));
    const createdArray = Array.isArray(created) ? created : [created];
    for (const { chunk } of toCreate) {
      const row = createdArray.find(r => validRecord(r, ownerId, chunk));
      if (!row?.id) throw new CloudArchiveError("Cloud-Archivblock wurde nicht bestätigt.");
      refs[chunk.id] = row.id;
    }
  }
  const strippedState = stateWithChunks(state, items);
  return { state: strippedState, archive_blocks: refs };
}