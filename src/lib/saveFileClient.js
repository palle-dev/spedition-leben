// A dedicated, short-lived worker keeps parsing/checksums/compression off the UI
// and cannot block or change the running simulation on an invalid import.
export function processSaveFile(command, input) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./saveFileWorker.js", import.meta.url), { type: "module" });
    const finish = (error, result) => { worker.terminate(); error ? reject(error) : resolve(result); };
    worker.onmessage = ({ data }) => finish(data.error ? Error(data.error) : null, data.result);
    worker.onerror = event => finish(Error(event.message || "Verarbeitung des Spielstands fehlgeschlagen."));
    worker.onmessageerror = () => finish(Error("Spielstand konnte nicht übertragen werden."));
    try { worker.postMessage({ command, input }); } catch (error) { finish(error); }
  });
}
