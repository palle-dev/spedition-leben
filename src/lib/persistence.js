import { packStoredProjection, unpackStoredProjection } from "./projectionStorage";
import { readRecoverySave, MAX_SAVE_BYTES, prepareLoadedState } from "./saveSafety";

// IndexedDB-Persistenz für FERNWERK.
// Verwaltet: aktueller Spielstand, drei rotierende Autosaves, manuelle Slots,
// Export/Import mit Prüfsumme, Version und Größenprüfung.
// Benutzergetrennt: alle Keys werden mit user_<userId>: prefixiert.
// Sync-Metadaten werden separat vom Spielzustand gespeichert.

import { openDB, STORE_KV } from "./saveDatabase";
import { writeHistoryBlocks } from "./historyRepository";

const snapshotMetaKey = key => "snapshot_metadata:" + key;
const snapshotMeta = record => ({ format: "snapshot-meta-v1", savedAt: record.savedAt,
  ...(record.name != null ? { name: record.name } : {}) });

async function idbSnapshotMeta(key) {
  const meta = await idbGet(snapshotMetaKey(key));
  if (meta?.format === "snapshot-meta-v1" && Number.isFinite(meta.savedAt)) return meta;
  // Older saves remain fully readable; their next write creates the sidecar.
  const record = await idbGet(key);
  return record?.state ? snapshotMeta(record) : null;
}

async function idbPut(key, value, userId = null) {
  value = await packStoredProjection(value);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, "readwrite");
    const store = tx.objectStore(STORE_KV);
    try {
      const record = value?.state && userId ? { ...value, state: writeHistoryBlocks(store, userId, value.state) } : value;
      store.put(record, key);
      if (record?.state) store.put(snapshotMeta(record), snapshotMetaKey(key));
    } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Speichern wurde abgebrochen."));
  });
}

async function idbGet(key) {
  return unpackStoredProjection(await idbGetRaw(key));
}

// Read selection metadata before inflating any large financial payload.
async function idbGetRaw(key) {
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
    tx.objectStore(STORE_KV).delete(snapshotMetaKey(key));
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
  const prepared = await packStoredProjection({ state, savedAt });
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, "readwrite");
    const store = tx.objectStore(STORE_KV);
    try {
      const target = nsPrefix(state) + "current";
      const record = { ...prepared, state: writeHistoryBlocks(store, userId, prepared.state) };
      store.put(record, fullKey(userId, target));
      // Both records commit atomically; the active selector contains no snapshot.
      store.put({ format: "active-save-reference-v1", target, savedAt,
        partyId: state.meta?.partyId ?? null }, fullKey(userId, "active_current"));
      if (syncMeta?.partyId && syncMeta.partyId === state.meta?.partyId) {
        store.put(syncMeta, fullKey(userId, "sync_meta_" + syncMeta.partyId));
      }
    } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Speichern wurde abgebrochen."));
  });
}

// Resolve selection and snapshot in ONE readonly transaction. A concurrent save
// cannot switch the selected slot between two independent database reads.
async function readActiveCurrent(userId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, "readonly"), store = tx.objectStore(STORE_KV);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("Lesen des Spielstands wurde abgebrochen."));
    const request = store.get(fullKey(userId, "active_current"));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const selection = request.result;
      if (!selection || selection.state) { resolve(selection); return; } // Legacy embedded snapshot.
      if (selection.format !== "active-save-reference-v1" ||
          !["current", "scenario_current"].includes(selection.target)) {
        reject(Error("Ungültiger Verweis auf die aktive Partie.")); return;
      }
      const target = store.get(fullKey(userId, selection.target));
      target.onerror = () => reject(target.error);
      target.onsuccess = () => {
        const record = target.result;
        if (!record?.state || record.savedAt !== selection.savedAt ||
            (record.state.meta?.partyId ?? null) !== selection.partyId) {
          reject(Error("Die aktive Sicherung fehlt oder passt nicht zur ausgewählten Partie.")); return;
        }
        resolve(record);
      };
    };
  });
}

export async function loadCurrent(userId) {
  if (!userId) return null;
  let recovery = null;
  try { recovery = readRecoverySave(userId); } catch { /* IndexedDB kann weiterhin funktionieren. */ }
  try {
    let current = await readActiveCurrent(userId);
    if (!current) {
      const candidates = await Promise.all([
        idbGetRaw(fullKey(userId, "scenario_current")), idbGetRaw(fullKey(userId, "current")),
      ]);
      current = candidates.filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
    }
    if (recovery && (!current || recovery.savedAt > (current.savedAt || 0))) return recovery.state;
    return (await unpackStoredProjection(current))?.state || null;
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
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_KV, "readwrite"), store = tx.objectStore(STORE_KV);
    const req = store.get(fullKey(userId, "active_current"));
    req.onsuccess = () => {
      const selected = req.result;
      try {
        store.delete(fullKey(userId, "scenario_current"));
        store.delete(snapshotMetaKey(fullKey(userId, "scenario_current")));
        if ((selected?.format === "active-save-reference-v1" && selected.target === "scenario_current") ||
            selected?.state?.scenario) store.delete(fullKey(userId, "active_current"));
      } catch (error) { tx.abort(); reject(error); }
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Error("Löschen wurde abgebrochen."));
  });
}

// ---- Rotierende Autosaves (3 Slots) ----

export async function saveAutosave(userId, index, state) {
  const prefix = nsPrefix(state);
  await idbPut(fullKey(userId, prefix + "autosave_" + index), { state, savedAt: Date.now() }, userId);
}

export async function loadAutosave(userId, index, isScenario) {
  const prefix = isScenario ? "scenario_" : "";
  const v = await idbGet(fullKey(userId, prefix + "autosave_" + index));
  return v ? v.state : null;
}

export async function getAutosaveMeta(userId, index, isScenario) {
  const prefix = isScenario ? "scenario_" : "";
  const v = await idbSnapshotMeta(fullKey(userId, prefix + "autosave_" + index));
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
  await idbPut(fullKey(userId, prefix + "slot_" + name), { state, savedAt: Date.now(), name }, userId);
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
    const v = await idbSnapshotMeta(k);
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
      await idbPut(fullKey(userId, oldKey), v, userId);
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
  if (state?.historyArchive?.chunks?.some(c => typeof c.data !== "string")) throw new Error("Archiv vor dem Export vollständig einbetten.");
  const json = JSON.stringify(state);
  const cs = checksum(json);
  const size = new Blob([json]).size;
  return JSON.stringify({ version: EXPORT_VERSION, checksum: cs, size, state });
}

export function importSave(exportStr) {
  if (typeof exportStr !== "string" || new Blob([exportStr]).size > MAX_SAVE_BYTES) {
    throw new Error("Die Spielstand-Datei ist zu groß (maximal 256 MB).");
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