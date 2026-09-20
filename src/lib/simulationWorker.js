// Web Worker – verlagert die Simulations-Engine auf einen separaten CPU-Kern.
// Der Haupt-Thread bleibt für UI/Rendering frei, auch bei großen Flotten.
//
// Protokoll: { id, state, command, params } → { id, data }
// data ist entweder { state, result } oder { error }.
// Während advanceTime werden Zwischenfortschritte als
// { id, type: "progress", progress } gesendet.

import { compactHistory } from "./historyArchive";
import { executeCommand } from "./simulationAdapter";
import { setProgressHook } from "./simulation/progressHook";

self.onmessage = async (e) => {
  const { id, state, command, params } = e.data;
  // Fortschritts-Callback für lange Zeitvorläufe einrichten
  setProgressHook((progress) => self.postMessage({ id, type: "progress", progress }));
  const computeStart = performance.now();
  try {
    const data = await executeCommand(state, command, params || {});
    if (data.state) {
      try { data.state = await compactHistory(data.state); }
      catch { /* Retain the full state if archival fails; never lose a completed advance. */ }
    }
    setProgressHook(null);
    self.postMessage({ id, data, workerComputeMs: performance.now() - computeStart });
  } catch (err) {
    setProgressHook(null);
    self.postMessage({ id, data: { error: (err && err.message) || "Unbekannter Fehler im Worker" } });
  }
};