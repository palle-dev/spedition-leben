import { createHistoryQueryClient } from './historyQueryClient';
const historyQueries = createHistoryQueryClient(() =>
  new Worker(new URL('./historyQueryWorker.js', import.meta.url), { type: 'module' }));
export const resetHistoryQueries = () => historyQueries.reset();
// Imports/exports use a dedicated, short-lived worker for parsing/compression
// and cannot block or change the running simulation on an invalid import.
export function processSaveFile(command, input) {
  if (command === "historyPage" || command === "journalPage") return historyQueries.execute(command, input);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./saveFileWorker.js", import.meta.url), { type: "module" });
    const finish = (error, result) => { worker.terminate(); error ? reject(error) : resolve(result); };
    worker.onmessage = ({ data }) => finish(data.error ? Error(data.error) : null, data.result);
    worker.onerror = event => finish(Error(event.message || "Verarbeitung des Spielstands fehlgeschlagen."));
    worker.onmessageerror = () => finish(Error("Spielstand konnte nicht übertragen werden."));
    try { worker.postMessage({ command, input }); } catch (error) { finish(error); }
  });
}
