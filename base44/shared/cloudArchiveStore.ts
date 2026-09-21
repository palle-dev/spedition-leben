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

export async function hydrateCloudArchive(blocks: any, ownerId: string, state: any, refs: Record<string, string> | null = {}, storage: any = null): Promise<any> {
  const items: any[] = [];
  for (const c of chunks(state)) {
    // Legacy embedded base64 saves (pre-file-storage) pass through directly.
    if (typeof c.data === "string" && !isFileUri(c.data)) { items.push(c); continue; }
    const ref = refs?.[c.id];
    if (typeof ref !== "string" || !ref) throw new CloudArchiveError("Cloud-Archivverweis fehlt.");
    const row = await blocks.get(ref);
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
      items.push({ ...c, data: base64 });
    } else {
      await verifyBase64(row.data, c.id);
      items.push({ ...c, data: row.data });
    }
  }
  return stateWithChunks(state, items);
}

export async function stageCloudArchive(blocks: any, ownerId: string, state: any, previous: any = null, previousRefs: Record<string, string> | null = {}, storage: any = null): Promise<{ state: any; archive_blocks: Record<string, string> }> {
  const items: any[] = [], refs: Record<string, string> = {};
  const known = new Map(chunks(previous).map((c: any) => [c.id, c]));
  for (const c of chunks(state)) {
    const old = known.get(c.id);
    const same = old && archiveIdentity(old) === archiveIdentity(c);
    // Only server-owned prior references are reusable. Incoming reference maps
    // are ignored. No read or write is needed for already committed blocks.
    if (same && typeof previousRefs?.[c.id] === "string" && old.data == null) {
      if (c.data != null) await verifyBase64(c.data, c.id);
      refs[c.id] = previousRefs[c.id];
      items.push(reference(c));
      continue;
    }
    const data = c.data ?? (same ? old.data : null);
    await verifyBase64(data, c.id);
    const existing = await blocks.filter({ owner_id: ownerId, content_hash: c.id }, "-created_date", 1);
    let row = existing?.[0];
    if (row) {
      if (!validRecord(row, ownerId, c)) throw new CloudArchiveError("Cloud-Archivindex stimmt nicht überein.");
      // File-based blocks were verified at upload time; base64 blocks verify now.
      if (!isFileUri(row.data)) await verifyBase64(row.data, c.id);
    } else {
      let storedData: string;
      if (storage?.uploadPrivateFile) {
        // Upload the compressed payload as a private file to stay within
        // the entity field size limit. Store only the file_uri reference.
        const binary = atob(data);
        const blob = new Blob([Uint8Array.from(binary, (ch: number) => ch.charCodeAt(0))], { type: "application/gzip" });
        const file = new File([blob], c.id + ".gz", { type: "application/gzip" });
        const { file_uri } = await storage.uploadPrivateFile({ file });
        storedData = URI_PREFIX + file_uri;
      } else {
        // Legacy / test mode: store base64 inline.
        storedData = data;
      }
      row = await blocks.create({ owner_id: ownerId, content_hash: c.id, descriptor: reference(c), data: storedData });
      // Await durable acknowledgement BEFORE exposing this reference to CAS.
      if (!row?.id) throw new CloudArchiveError("Cloud-Archivblock wurde nicht bestätigt.");
    }
    refs[c.id] = row.id;
    items.push(reference(c));
  }
  return { state: stateWithChunks(state, items), archive_blocks: refs };
}