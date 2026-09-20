import { compactHistory } from './historyArchive';
import { executeCommand } from './simulationAdapter';
import { setProgressHook } from './simulation/progressHook';
import { createSimulationRuntime } from './simulationWorkerRuntime';

const run = createSimulationRuntime(executeCommand, compactHistory);
// Async archive compression must not allow another command to overlap it.
let queue = Promise.resolve();
self.onmessage = ({ data: message }) => {
  queue = queue.then(async () => {
    const start = performance.now();
    setProgressHook(progress => self.postMessage({ id: message.id, type: 'progress', progress }));
    try {
      const response = await run(message);
      self.postMessage({ ...response, workerComputeMs: performance.now() - start });
    } finally { setProgressHook(null); }
  }).catch(error => {
    self.postMessage({ id: message.id, data: { error: error?.message || 'Simulationsantwort konnte nicht übertragen werden.' } });
  });
  return queue;
};
