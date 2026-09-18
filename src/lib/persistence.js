import { readRecoverySave, MAX_SAVE_BYTES, prepareLoadedState } from "./saveSafety";

// IndexedDB-Persistenz für FERNWERK.
// Verwaltet: aktueller Spielstand, drei rotierende Autosaves, manuelle Slots,
// Export/Import mit Prüfsumme, Version und Größenprüfung.
// Benutzergetrennt: alle Keys werden mit user_<userId>: prefixiert.
// Sync-Metadaten werden separat vom Spielzustand gespeichert.

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
    req.onerror = () => { dbPromise = null; reject(req.error); };
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
    tx.onabort = () => reject(tx.error || new Error("Speichern wurde abgebrochen."));
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
    tx.onabort = () => reject(tx.error || new Error("Speichern wurde abgebrochen."));
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

// ---- Benutzer-Präfix ----
// Alle Keys werden mit user_<userId>: prefixiert, um Spielstände
// verschiedener Benutzer zu trennen. Ohne userId (null) wird ein
// Legacy-Präfix verwendet, um unzugewiesene alte Spielstände zu erkennen.
function userPrefix(userId) {
  return userId ? "user_" + userId + ":" : "legacy:";
}

// Szenario-Präfix bleibt innerhalb des Benutzer-Präfixes.
function nsPrefix(state) {
  return state?.scenario ? "scenario_" : "";
}

function fullKey(userId, key) {
  return userPrefix(userId) + key;
}

// ---- Aktueller Spielstand ----

export async function saveCurrent(userId, state, syncMeta = null, savedAt = Date.now()) {
  if (!userId) throw new Error("Zum Speichern bitte anmelden.");
  const db = await openDB();
  const record = { state, savedAt };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, "readwrite");
    const store = tx.objectStore(STORE_KV);
    store.put(record, fullKey(userId, nsPrefix(state) + "current"));
    // Zustand und aktive Auswahl werden in derselben Transaktion geschrieben.
    store.put(record, fullKey(userId, "active_current"));
    if (syncMeta?.partyId && syncMeta.partyId === state.meta?.partyId) {
      store.put(syncMeta, fullKey(userId, "sync_meta_" + syncMeta.partyId));
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Speichern wurde abgebrochen."));
  });
}

export async function loadCurrent(userId) {
  if (!userId) return null;
  let recovery = null;
  try { recovery = readRecoverySave(userId); } catch { /* IndexedDB kann weiterhin funktionieren. */ }
  try {
    let current = await idbGet(fullKey(userId, "active_current"));
    if (!current) {
      const candidates = await Promise.all([
        idbGet(fullKey(userId, "scenario_current")), idbGet(fullKey(userId, "current")),
      ]);
      current = candidates.filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
    }
    if (recovery && (!current || recovery.savedAt > (current.savedAt || 0))) return recovery.state;
    return current?.state || null;
  } catch (error) {
    if (recovery) return recovery.state;
    throw error;
  }
}

export async function loadCurrentFree(userId) {
  const v = await idbGet(fullKey(userId, "current"));
  return v ? v.state : null;
}

export async function clearScenarioCurrent(userId) {
  await idbDelete(fullKey(userId, "scenario_current"));
}

// ---- Rotierende Autosaves (3 Slots) ----

export async function saveAutosave(userId, index, state) {
  const prefix = nsPrefix(state);
  await idbPut(fullKey(userId, prefix + "autosave_" + index), { state, savedAt: Date.now() });
}

export async function loadAutosave(userId, index, isScenario) {
  const prefix = isScenario ? "scenario_" : "";
  const v = await idbGet(fullKey(userId, prefix + "autosave_" + index));
  return v ? v.state : null;
}

export async function getAutosaveMeta(userId, index, isScenario) {
  const prefix = isScenario ? "scenario_" : "";
  const v = await idbGet(fullKey(userId, prefix + "autosave_" + index));
  return v ? { savedAt: v.savedAt } : null;
}

export async function getAllAutosaveMetas(userId, isScenario) {
  const metas = [];
  for (let i = 0; i < 3; i++) metas.push(await getAutosaveMeta(userId, i, isScenario));
  return metas;
}

export async function deleteAutosave(userId, index, isScenario) {
  const prefix = isScenario ? "scenario_" : "";
  await idbDelete(fullKey(userId, prefix + "autosave_" + index));
}

// ---- Manuelle Slots ----

export async function saveManualSlot(userId, name, state) {
  const prefix = nsPrefix(state);
  await idbPut(fullKey(userId, prefix + "slot_" + name), { state, savedAt: Date.now(), name });
}

export async function loadManualSlot(userId, name, isScenario) {
  const prefix = isScenario ? "scenario_" : "";
  const v = await idbGet(fullKey(userId, prefix + "slot_" + name));
  return v ? v.state : null;
}

export async function deleteManualSlot(userId, name, isScenario) {
  const prefix = isScenario ? "scenario_" : "";
  await idbDelete(fullKey(userId, prefix + "slot_" + name));
}

export async function listManualSlots(userId, isScenario) {
  const prefix = isScenario ? "scenario_slot_" : "slot_";
  const fullPrefix = fullKey(userId, prefix);
  const keys = await idbKeys();
  const slotKeys = keys.filter(k => typeof k === "string" && k.startsWith(fullPrefix));
  const slots = [];
  for (const k of slotKeys) {
    const v = await idbGet(k);
    if (v) slots.push({ name: v.name || k.slice(fullPrefix.length), savedAt: v.savedAt });
  }
  return slots.sort((a, b) => b.savedAt - a.savedAt);
}

// ---- Sync-Metadaten (getrennt vom Spielzustand) ----
// Speichert: partyId, cloudId, localBaseRevision, status, lastCloudSyncAt, lastError.
// Ein Upload darf Spielzeit, Zufallszustand oder Spielregeln nicht verändern —
// daher werden Sync-Metadaten vollständig separat gespeichert.

export async function getSyncMeta(userId, partyId) {
  if (!userId || !partyId) return null;
  const v = await idbGet(fullKey(userId, "sync_meta_" + partyId)) ||
    await idbGet(fullKey(userId, "sync_meta"));
  return v?.partyId === partyId ? v : null;
}

export async function setSyncMeta(userId, meta) {
  if (!userId || !meta?.partyId) return;
  await idbPut(fullKey(userId, "sync_meta_" + meta.partyId), meta);
}

export async function clearSyncMeta(userId) {
  await idbDelete(fullKey(userId, "sync_meta"));
}

// ---- Unzugewiesene alte Spielstände erkennen ----
// Alte Spielstände ohne Benutzerzuordnung dürfen nicht automatisch dem
// angemeldeten Konto zugeschrieben werden. Diese Funktion prüft, ob
// Legacy-Spielstände existieren, die bewusst übernommen werden können.

export async function hasUnassignedSaves() {
  const keys = await idbKeys();
  // Legacy-Keys: beginnen mit "legacy:" oder alten Keys ohne "user_"-Präfix
  const legacyKeys = keys.filter(k =>
    typeof k === "string" && !k.startsWith("user_") &&
    (k === "current" || k === "scenario_current" ||
     k.startsWith("autosave_") || k.startsWith("scenario_autosave_") ||
     k.startsWith("slot_") || k.startsWith("scenario_slot_"))
  );
  return legacyKeys.length > 0;
}

// Bewusste Übernahme unzugewiesener Spielstände durch den angemeldeten Benutzer.
// Kopiert alle Legacy-Keys in den Benutzer-Namespace und belässt die Originale.
export async function claimUnassignedSaves(userId) {
  if (!userId) return { claimed: 0 };
  const keys = await idbKeys();
  const legacyKeys = keys.filter(k =>
    typeof k === "string" && !k.startsWith("user_") &&
    (k === "current" || k === "scenario_current" ||
     k.startsWith("autosave_") || k.startsWith("scenario_autosave_") ||
     k.startsWith("slot_") || k.startsWith("scenario_slot_"))
  );
  let claimed = 0;
  for (const oldKey of legacyKeys) {
    const v = await idbGet(oldKey);
    if (v) {
      await idbPut(fullKey(userId, oldKey), v);
      claimed++;
    }
  }
  return { claimed };
}

// ---- Export / Import mit Prüfsumme, Version, Größenprüfung ----

const EXPORT_VERSION = 2;

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
  if (typeof exportStr !== "string" || new Blob([exportStr]).size > MAX_SAVE_BYTES) {
    throw new Error("Die Spielstand-Datei ist zu groß (maximal 50 MB).");
  }
  let parsed;
  try { parsed = JSON.parse(exportStr); }
  catch (e) { throw new Error("Ungültiges Save-Format — keine gültige JSON-Datei"); }
  if (!parsed || (parsed.version !== EXPORT_VERSION && parsed.version !== 1)) {
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
  // Import wird als eigene Partie angelegt: fremde partyId/cloudId/Benutzerzuordnung
  // werden NICHT übernommen. Der Import erhält eine neue partyId beim Speichern.
  const imported = prepareLoadedState(parsed.state);
  delete imported.meta.partyId;
  delete imported.meta.ownerId;
  delete imported.meta.owner_id;
  imported.meta.cloudId = null;
  imported.meta.importedAt = Date.now();
  return imported;
}

export { EXPORT_VERSION };