// Read-only worker. Session reset rejects pending work; no simulated action is retried.
export function createHistoryQueryClient(createWorker, idleMs = 60000) {
  let worker = null, scope = null, sequence = 0, timer;
  const pending = new Map();
  function reset(message = 'Spielstand wurde inzwischen gewechselt.') {
    clearTimeout(timer);
    const old = worker; worker = null; scope = null;
    if (old) old.terminate();
    for (const p of pending.values()) p.reject(Error(message));
    pending.clear();
  }
  function idle() {
    if (!pending.size) timer = setTimeout(() => reset(), idleMs);
  }
  function execute(command, input) {
    if (!['historyPage', 'journalPage'].includes(command)) return Promise.reject(Error('Unzulässige Historienabfrage.'));
    const key = JSON.stringify([input.userId, input.sessionGeneration]);
    if (scope !== key) reset();
    scope = key;
    clearTimeout(timer);
    return new Promise((resolve, reject) => {
      try {
        if (!worker) {
          const active = createWorker(); worker = active;
          active.onmessage = ({ data }) => {
            if (worker !== active) return;
            const p = pending.get(data.id); if (!p) return;
            pending.delete(data.id);
            if (data.error) p.reject(Error(data.error)); else p.resolve(data.result);
            idle();
          };
          active.onerror = event => { if (worker === active) reset(event.message || 'Historienabfrage fehlgeschlagen.'); };
          active.onmessageerror = () => { if (worker === active) reset('Historienantwort konnte nicht übertragen werden.'); };
        }
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        try { worker.postMessage({ id, command, input }); }
        catch (error) { pending.delete(id); reject(error); idle(); }
      } catch (error) { reject(error); reset('Historienabfrage konnte nicht gestartet werden.'); }
    });
  }
  return { execute, reset };
}
