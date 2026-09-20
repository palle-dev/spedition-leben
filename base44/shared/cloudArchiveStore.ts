import { archiveIdentity } from "./cloudArchive.ts";

// Blocks are immutable and owner-scoped. Never delete during save/delete:
// another slot or an in-flight CAS may still refer to them.
export class CloudArchiveError extends Error {}
function chunks(state) {
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
async function verify(data, id) {
  if (typeof data !== "string" || !data.length) throw new CloudArchiveError("Cloud-Archivblock fehlt.");
  const binary = atob(data);
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(binary, c => c.charCodeAt(0)));
  const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  if (actual !== id) throw new CloudArchiveError("Cloud-Archiv-Prüfsumme stimmt nicht überein.");
}
function reference(c) { const { data, ...rest } = c; return rest; }
function stateWithChunks(state, items) {
  if (!state.historyArchive) return state;
  const archive = { ...state.historyArchive, chunks: items };
  delete archive.storage;
  return { ...state, historyArchive: archive };
}
function validRecord(row, ownerId, c) {
  return row?.owner_id === ownerId && row.content_hash === c.id &&
    row.descriptor && archiveIdentity(row.descriptor) === archiveIdentity(c);
}
export async function hydrateCloudArchive(blocks, ownerId, state, refs = {}) {
  const items = [];
  for (const c of chunks(state)) {
    if (typeof c.data === "string") { items.push(c); continue; } // Legacy embedded saves.
    const ref = refs?.[c.id];
    if (typeof ref !== "string" || !ref) throw new CloudArchiveError("Cloud-Archivverweis fehlt.");
    const row = await blocks.get(ref);
    if (!validRecord(row, ownerId, c)) throw new CloudArchiveError("Kein Zugriff auf diesen Cloud-Archivblock.");
    await verify(row.data, c.id);
    items.push({ ...c, data: row.data });
  }
  return stateWithChunks(state, items);
}
export async function stageCloudArchive(blocks, ownerId, state, previous = null, previousRefs = {}) {
  const items = [], refs = {};
  const known = new Map(chunks(previous).map(c => [c.id, c]));
  for (const c of chunks(state)) {
    const old = known.get(c.id);
    const same = old && archiveIdentity(old) === archiveIdentity(c);
    // Only server-owned prior references are reusable. Incoming reference maps
    // are ignored. No read or write is needed for already committed blocks.
    if (same && typeof previousRefs?.[c.id] === "string" && old.data == null) {
      if (c.data != null) await verify(c.data, c.id);
      refs[c.id] = previousRefs[c.id];
      items.push(reference(c));
      continue;
    }
    const data = c.data ?? (same ? old.data : null);
    await verify(data, c.id);
    const existing = await blocks.filter({ owner_id: ownerId, content_hash: c.id }, "-created_date", 1);
    let row = existing?.[0];
    if (row) {
      if (!validRecord(row, ownerId, c)) throw new CloudArchiveError("Cloud-Archivindex stimmt nicht überein.");
      await verify(row.data, c.id);
    } else {
      row = await blocks.create({ owner_id: ownerId, content_hash: c.id, descriptor: reference(c), data });
      // Await durable acknowledgement BEFORE exposing this reference to CAS.
      if (!row?.id) throw new CloudArchiveError("Cloud-Archivblock wurde nicht bestätigt.");
    }
    refs[c.id] = row.id;
    items.push(reference(c));
  }
  return { state: stateWithChunks(state, items), archive_blocks: refs };
}
