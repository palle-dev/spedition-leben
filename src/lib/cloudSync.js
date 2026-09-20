// Cloud-Synchronisations-Manager für FERNWERK.
// Nutzt die vorhandene GameState-Entity über die cloudSync-Backend-Funktion.
// Der Client ist die einzige Simulationsinstanz — die Cloud speichert bestätigte
// Snapshots mit Revisionsprüfung. Keine serverseitige Zeitautomatik.
//
// Sync-Status-Maschine:
//   idle → uploading → synced | conflict | error | offline
//
// Schutz vor Überschreiben:
//   - Atomares updateMany mit Filter auf (id, owner_id, revision) im Backend.
//   - Nur ein Upload gleichzeitig (Queue). Verspätete Antworten werden verworfen.
//   - localBaseRevision wird nur nach bestätigter Antwort aktualisiert.

import { portableHistory } from "./historyArchive";
import { base44 } from "@/api/base44Client";

// ---- Backend-Aufrufe ----

async function invokeCloudSync(payload) {
  try {
    const res = await base44.functions.invoke("cloudSync", payload);
    return res.data;
  } catch (error) {
    const status = error.response?.status || error.status;
    const data = error.response?.data || error.data;
    if (status === 409 && data?.conflict) return data;
    const failure = Object.assign(new Error(data?.error || error.message || "Cloud-Speicherung fehlgeschlagen."), { status, code: error.code });
    throw failure;
  }
}

export async function listCloudSaves() {
  return await invokeCloudSync({ command: "list" });
}

export async function loadCloudSave(stateId) {
  return await invokeCloudSync({ command: "load", stateId });
}

export async function createCloudSave(state, partyId, saveLabel, saveType) {
  return await invokeCloudSync({
    command: "create", state: await portableHistory(state), party_id: partyId,
    save_label: saveLabel, save_type: saveType,
  });
}

export async function saveCloudSave(stateId, state, expectedRevision, saveLabel, saveType) {
  return await invokeCloudSync({
    command: "save", stateId, state: await portableHistory(state), expected_revision: expectedRevision,
    save_label: saveLabel, save_type: saveType,
  });
}

export async function deleteCloudSave(stateId) {
  return await invokeCloudSync({ command: "delete", stateId });
}

// Wiederholt nur vorübergehende Fehler. Payload/Revision bleiben identisch;
// 409 und fachliche Fehler werden niemals durch Überschreiben umgangen.
export async function withCloudRetry(task, { isCurrent = () => Boolean(true), wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!isCurrent()) return { skipped: true };
    try { return await task(); }
    catch (error) {
      const transient = [429, 502, 503, 504].includes(Number(error.status)) ||
        (!error.status && (/Network|Failed to fetch|timeout/i.test(error.message || '') || ['ERR_NETWORK','ECONNABORTED'].includes(error.code)));
      if (!transient || attempt === 2) throw error;
      await wait(attempt === 0 ? 500 : 1500);
    }
  }
}

// ---- Sync-Status-Erzeugung ----

export function makeSyncMeta(partyId, cloudId, localBaseRevision, status, lastCloudSyncAt, lastError) {
  return {
    partyId,
    cloudId,            // Entity-ID des Cloud-Datensatzes (null wenn noch nicht hochgeladen)
    localBaseRevision,  // Zuletzt bestätigte Cloud-Revision
    status,             // "idle" | "uploading" | "synced" | "offline" | "conflict" | "error"
    lastCloudSyncAt,    // Timestamp der letzten bestätigten Synchronisation
    lastError,          // Letzte Fehlermeldung
  };
}

// ---- Upload-Queue (einer gleichzeitig, verspätete Antworten verworfen) ----

export class CloudSyncQueue {
  constructor() {
    this._queue = [];
    this._running = false;
    this._currentSeq = 0;
    this._acceptedSeq = 0;
  }

  // Fügt einen Upload hinzu. Wenn einer läuft, wird dieser nach Abschluss verarbeitet.
  // Gibt eine Promise zurück, die mit dem Ergebnis (oder Fehler) aufgelöst wird.
  enqueue(task) {
    return new Promise((resolve, reject) => {
      this._queue.push({ task, resolve, reject, seq: ++this._currentSeq });
      this._process();
    });
  }

  async _process() {
    if (this._running) return;
    this._running = true;
    while (this._queue.length > 0) {
      const item = this._queue.shift();
      try {
        const result = await item.task();
        // Nur akzeptieren, wenn keine neuere Anfrage bereits akzeptiert wurde.
        if (item.seq >= this._acceptedSeq) {
          this._acceptedSeq = item.seq;
          item.resolve(result);
        } else {
          // Verspätete Antwort — verworfen, neuerer Upload hat Vorrang.
          item.resolve({ stale: true, ...result });
        }
      } catch (e) {
        if (item.seq >= this._acceptedSeq) {
          this._acceptedSeq = item.seq;
          item.reject(e);
        } else {
          item.resolve({ stale: true, error: e.message });
        }
      }
    }
    this._running = false;
  }
}

// ---- UUID-Generator ----

export function generatePartyId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback für ältere Browser
  return "p_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}