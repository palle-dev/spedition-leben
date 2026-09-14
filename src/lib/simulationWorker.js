// Web Worker – verlagert die Simulations-Engine auf einen separaten CPU-Kern.
// Der Haupt-Thread bleibt für UI/Rendering frei, auch bei großen Flotten.
//
// Protokoll: { id, state, command, params } → { id, data }
// data ist entweder { state, result } oder { error }.

import { executeCommand } from "./simulationAdapter";

self.onmessage = async (e) => {
  const { id, state, command, params } = e.data;
  try {
    const data = await executeCommand(state, command, params || {});
    self.postMessage({ id, data });
  } catch (err) {
    self.postMessage({ id, data: { error: err.message } });
  }
};