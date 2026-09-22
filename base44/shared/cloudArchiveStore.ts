import { archiveIdentity } from "./cloudArchive.ts";

// Blocks are immutable and owner-scoped. Never delete during save/delete:
// another slot or an in-flight CAS may still refer to them.
//
// Storage strategy: large archive payloads are uploaded as private files
// via UploadPrivateFile. Only the resulting file_uri is stored in the
// GameArchiveBlock.data field (prefixed with "uri:"). This keeps every
// entity field well below the platform's maximum field size. Legacy
// blocks with inline base64 data are still supported for backward compat.
export class CloudArchiveError extends Error {}

const URI_PREFIX = "uri:";

function isFileUri(data: unknown): data is string {
  return typeof data === "string" && data.startsWith(URI_PREFIX);
}

function chunks(state: any): any[] {
  const archive = state?.historyArchive;
  if (!archive) return [];
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
  return archive.chunks;
}

async function verifyBase64(data: unknown, id: string): Promise<void> {
  if (typeof data !== "string" || !data.length) throw new CloudArchiveError("Cloud-Archivblock fehlt.");
  const binary = atob(data);
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
const CONCURRENCY = 5;
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
  const { file_uri } = await storage.uploadPrivateFile({ file });
  return URI_PREFIX + file_uri;
}
export async function hydrateState(storage: any, state: any): Promise<any> {
  if (typeof state !== "string" || !isFileUri(state)) return state;
  if (!storage?.createSignedUrl) throw new CloudArchiveError("Storage-Funktionen fehlen zum Laden des Spielstands.");
  const file_uri = state.slice(URI_PREFIX.length);
  const { signed_url } = await storage.createSignedUrl({ file_uri });
  const response = await fetch(signed_url);
  if (!response.ok) throw new CloudArchiveError("Spielstand konnte nicht geladen werden (" + response.status + ").");
  return await response.json();
}

export async function hydrateCloudArchive(blocks: any, ownerId: string, state: any, refs: Record<string, string> | null = {}, storage: any = null): Promise<any> {
  state = await hydrateState(storage, state);
  const all = chunks(state);
  // Fetch only blocks for the chunks in this state (content-addressable lookup).
  // The previous "fetch all owner blocks" approach silently dropped blocks beyond
  // the 1000-row limit, breaking loads of long games.
  const rowByHash = new Map<string, any>();
  if (all.length > 0) {
    const rows = await blocks.filter({ owner_id: ownerId, content_hash: { $in: all.map((c: any) => c.id) } }, "-created_date", 1000);
    for (const row of rows || []) rowByHash.set(row.content_hash, row);
  }
  const items = await mapWithConcurrency(all, CONCURRENCY, async (c: any) => {
    // Legacy embedded base64 saves (pre-file-storage) pass through directly.
    if (typeof c.data === "string" && !isFileUri(c.data)) return c;
    const row = rowByHash.get(c.id);
    if (!validRecord(row, ownerId, c)) throw new CloudArchiveError("Kein Zugriff auf diesen Cloud-Archivblock.");
    if (isFileUri(row.data)) {
      if (!storage?.createSignedUrl) throw new CloudArchiveError("Storage-Funktionen fehlen zum Laden des Archivblocks.");
      const file_uri = row.data.slice(URI_PREFIX.length);
      const { signed_url } = await storage.createSignedUrl({ file_uri });
      const response = await fetch(signed_url);
      if (!response.ok) throw new CloudArchiveError("Cloud-Archivblock konnte nicht geladen werden (" + response.status + ").");
      const buffer = await response.arrayBuffer();
      const base64 = bytesToBase64(buffer);
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
  const refs: Record<string, string> = {};
  const toCreate: { chunk: any; storedData: string }[] = [];
  // Reuse blocks already committed in the previous cloud record. The chunk-id
  // IS the content hash, so a matching previousRef guarantees identical content
  // — no need to hydrate the previous state (which may be a file URI) to compare.
  const reused = new Set<string>();
  for (const c of all) {
    if (typeof previousRefs?.[c.id] === "string") {
      refs[c.id] = previousRefs[c.id];
      reused.add(c.id);
    }
  }
  // Fetch existing blocks only for chunks not already reused (dedup by content hash).
  // Avoids fetching all owner blocks, which silently dropped blocks beyond the
  // 1000-row limit and broke saves of long games.
  const newChunks = all.filter((c: any) => !reused.has(c.id));
  const existingByHash = new Map<string, any>();
  if (newChunks.length > 0) {
    const rows = await blocks.filter({ owner_id: ownerId, content_hash: { $in: newChunks.map((c: any) => c.id) } }, "-created_date", 1000);
    for (const row of rows || []) {
      if (row?.content_hash && !existingByHash.has(row.content_hash)) existingByHash.set(row.content_hash, row);
    }
  }
  const items: any[] = await mapWithConcurrency(all, CONCURRENCY, async (c: any) => {
    if (reused.has(c.id)) {
      if (c.data != null) await verifyBase64(c.data, c.id);
      return reference(c);
    }
    const data = c.data;
    await verifyBase64(data, c.id);
    const existing = existingByHash.get(c.id);
    if (existing) {
      if (!validRecord(existing, ownerId, c)) throw new CloudArchiveError("Cloud-Archivindex stimmt nicht überein.");
      // File-based blocks were verified at upload time; base64 blocks verify now.
      if (!isFileUri(existing.data)) await verifyBase64(existing.data, c.id);
      refs[c.id] = existing.id;
      return reference(c);
    }
    // New block: upload file now, queue for bulk create to avoid per-chunk DB writes.
    let storedData: string;
    if (storage?.uploadPrivateFile) {
      const binary = atob(data);
      const blob = new Blob([Uint8Array.from(binary, (ch: number) => ch.charCodeAt(0))], { type: "application/gzip" });
      const file = new File([blob], c.id + ".gz", { type: "application/gzip" });
      const { file_uri } = await storage.uploadPrivateFile({ file });
      storedData = URI_PREFIX + file_uri;
    } else {
      storedData = data;
    }
    toCreate.push({ chunk: c, storedData });
    return reference(c);
  });
  // Bulk create all new blocks in ONE DB call to avoid per-chunk create rate limits.
  if (toCreate.length > 0) {
    const created = await blocks.bulkCreate(toCreate.map(({ chunk, storedData }) => ({
      owner_id: ownerId, content_hash: chunk.id, descriptor: reference(chunk), data: storedData,
    })));
    const createdArray = Array.isArray(created) ? created : [created];
    for (const row of createdArray) {
      if (!row?.id) throw new CloudArchiveError("Cloud-Archivblock wurde nicht bestätigt.");
      refs[row.content_hash] = row.id;
    }
  }
  const strippedState = stateWithChunks(state, items);
  const stateRef = await stageState(storage, strippedState);
  return { state: stateRef, archive_blocks: refs };
}