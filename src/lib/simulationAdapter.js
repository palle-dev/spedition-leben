// Adapter für den Simulations-Web-Worker.
// Initialisiert den Worker mit den SDK-Credentials, verwaltet Message-IDs
// und löst Promises auf. Bietet eine saubere executeCommand-Schnittstelle
// mit Fehlerbehandlung und Timeout.

import { appParams } from "@/lib/app-params";

let worker = null;
let msgId = 0;
const pending = new Map();
let ready = false;
let workerError = null;
const readyResolvers = [];

function initWorker() {
  if (worker) return;
  worker = new Worker(new URL("../workers/simulationWorker.js", import.meta.url), { type: "module" });
  worker.postMessage({
    type: "init",
    appId: appParams.appId,
    token: appParams.token,
    functionsVersion: appParams.functionsVersion,
    appBaseUrl: appParams.appBaseUrl,
  });
  worker.onmessage = (e) => {
    const d = e.data;
    if (d.type === "ready") {
      ready = true;
      workerError = null;
      for (const r of readyResolvers) r();
      readyResolvers.length = 0;
      return;
    }
    const { id, state, result, error } = d;
    const resolve = pending.get(id);
    if (resolve) {
      pending.delete(id);
      if (error) resolve({ error });
      else resolve({ state, result });
    }
  };
  worker.onerror = (e) => {
    workerError = e.message || "unbekannt";
    ready = false;
    for (const r of readyResolvers) r();
    readyResolvers.length = 0;
    for (const [id, resolve] of pending) {
      resolve({ error: "Worker-Fehler: " + workerError });
      pending.delete(id);
    }
  };
}

function waitForReady() {
  if (ready) return Promise.resolve();
  if (workerError) return Promise.reject(new Error("Worker-Fehler: " + workerError));
  return new Promise((r) => readyResolvers.push(r));
}

export async function executeCommand(state, command, params) {
  initWorker();
  try { await waitForReady(); } catch (e) { return { error: e.message }; }
  const id = ++msgId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, state, command, params });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ error: "Zeitüberschreitung: Worker antwortet nicht" });
      }
    }, 30000);
  });
}

export function terminateWorker() {
  if (worker) { worker.terminate(); worker = null; ready = false; workerError = null; }
}