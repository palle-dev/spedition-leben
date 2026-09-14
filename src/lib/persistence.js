// IndexedDB-Persistenz für FERNWERK.
// Verwaltet: aktueller Spielstand, drei rotierende Autosaves, manuelle Slots,
// Export/Import mit Prüfsumme, Version und Größenprüfung.

const DB_NAME = "fernwerk";
const DB_VERSION = 1;
const STORE_KV = "kv";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbPut(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, "readwrite");
    tx.objectStore(STORE_KV).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, "readonly");
    const req = tx.objectStore(STORE_KV).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, "readwrite");
    tx.objectStore(STORE_KV).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbKeys() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, "readonly");
    const req = tx.objectStore(STORE_KV).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- Aktueller Spielstand ----

export async function saveCurrent(state) {
  await idbPut("current", { state, savedAt: Date.now() });
}

export async function loadCurrent() {
  const v = await idbGet("current");
  return v ? v.state : null;
}

// ---- Rotierende Autosaves (3 Slots) ----

export async function saveAutosave(index, state) {
  await idbPut("autosave_" + index, { state, savedAt: Date.now() });
}

export async function loadAutosave(index) {
  const v = await idbGet("autosave_" + index);
  return v ? v.state : null;
}

export async function getAutosaveMeta(index) {
  const v = await idbGet("autosave_" + index);
  return v ? { savedAt: v.savedAt } : null;
}

export async function getAllAutosaveMetas() {
  const metas = [];
  for (let i = 0; i < 3; i++) metas.push(await getAutosaveMeta(i));
  return metas;
}

// ---- Manuelle Slots ----

export async function saveManualSlot(name, state) {
  await idbPut("slot_" + name, { state, savedAt: Date.now(), name });
}

export async function loadManualSlot(name) {
  const v = await idbGet("slot_" + name);
  return v ? v.state : null;
}

export async function deleteManualSlot(name) {
  await idbDelete("slot_" + name);
}

export async function listManualSlots() {
  const keys = await idbKeys();
  const slotKeys = keys.filter(k => typeof k === "string" && k.startsWith("slot_"));
  const slots = [];
  for (const k of slotKeys) {
    const v = await idbGet(k);
    if (v) slots.push({ name: v.name || k.slice(5), savedAt: v.savedAt });
  }
  return slots.sort((a, b) => b.savedAt - a.savedAt);
}

// ---- Export / Import mit Prüfsumme, Version, Größenprüfung ----

const EXPORT_VERSION = 1;

// FNV-1a Hash — schnell und ausreichend für Korruptionsprüfung.
function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function exportSave(state) {
  const json = JSON.stringify(state);
  const cs = checksum(json);
  const size = new Blob([json]).size;
  return JSON.stringify({ version: EXPORT_VERSION, checksum: cs, size, state });
}

export function importSave(exportStr) {
  let parsed;
  try { parsed = JSON.parse(exportStr); }
  catch (e) { throw new Error("Ungültiges Save-Format — keine gültige JSON-Datei"); }
  if (!parsed || parsed.version !== EXPORT_VERSION) {
    throw new Error("Inkompatible Save-Version (erwartet " + EXPORT_VERSION + ")");
  }
  if (!parsed.state) throw new Error("Save enthält keinen Spielstand");
  const json = JSON.stringify(parsed.state);
  const cs = checksum(json);
  if (cs !== parsed.checksum) {
    throw new Error("Prüfsumme stimmt nicht überein — Save ist beschädigt");
  }
  const size = new Blob([json]).size;
  if (parsed.size != null && size !== parsed.size) {
    throw new Error("Größenprüfung fehlgeschlagen — Save ist unvollständig");
  }
  return parsed.state;
}

export { EXPORT_VERSION };