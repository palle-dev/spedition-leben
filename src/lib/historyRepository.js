import { openDB, STORE_KV } from "./saveDatabase";

function key(userId, id) {
  if (!userId) throw Error("Für den Historienzugriff bitte anmelden.");
  if (!/^[a-f0-9]{64}$/.test(id)) throw Error("Ungültige Archivkennung.");
  return `user_${userId}:history_${id}`;
}
// Must run inside the SAME transaction as the snapshot when persisting saves.
// Immutable blocks can also be staged first: an interrupted snapshot write then
// leaves only an unreferenced block, never a reference to missing data.
export function writeHistoryBlocks(store, userId, state) {
  if (!state?.historyArchive?.chunks?.length) return state;
  const chunks = state.historyArchive.chunks.map(c => {
    const { data, ...reference } = c;
    if (data != null) {
      if (!(data instanceof Blob)) throw Error("Archiv muss vor dem Speichern geprüft werden.");
      store.put({ data, rawBytes: c.rawBytes, count: c.count }, key(userId, c.id));
      reference.storedBytes = data.size;
    }
    return reference;
  });
  return { ...state, historyArchive: { ...state.historyArchive, storage: "indexeddb", chunks } };
}
export async function readHistoryBlock(userId, c) {
  if (c.data instanceof Blob) return c.data;
  const db = await openDB();
  const record = await new Promise((resolve, reject) => {
    const req = db.transaction(STORE_KV, "readonly").objectStore(STORE_KV).get(key(userId, c.id));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!(record?.data instanceof Blob) || record.rawBytes !== c.rawBytes || record.count !== c.count ||
      (c.storedBytes != null && record.data.size !== c.storedBytes)) {
    throw Error("Ein Historienblock fehlt oder ist unvollständig. Bitte die vollständige Cloud- oder Dateisicherung laden.");
  }
  return record.data;
}
export async function stageHistory(userId, state, verifyReferences = false) {
  const chunks = state?.historyArchive?.chunks || [];
  if (verifyReferences) for (const c of chunks) if (c.data == null) await readHistoryBlock(userId, c);
  if (!chunks.some(c => c.data != null)) return state;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, "readwrite");
    let compact;
    try { compact = writeHistoryBlocks(tx.objectStore(STORE_KV), userId, state); }
    catch (e) { tx.abort(); reject(e); return; }
    tx.oncomplete = () => resolve(compact);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("Historie konnte nicht sicher gespeichert werden."));
  });
}
export async function hydrateHistory(userId, state) {
  const chunks = state?.historyArchive?.chunks;
  if (!chunks?.length) return state;
  const loaded = [];
  for (const c of chunks) loaded.push({ ...c, data: await readHistoryBlock(userId, c) });
  const archive = { ...state.historyArchive, chunks: loaded };
  delete archive.storage;
  return { ...state, historyArchive: archive };
}
