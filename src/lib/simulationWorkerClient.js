import { coldPart, freezeFinancialSnapshot, withoutCold, unpackResult } from './simulationTransport';
import { archiveStats } from './historyArchive';

export function createSimulationClient(createWorker) {
  let worker = null, generation = 0, sequence = 0, accepted = null;
  const pending = new Map(), candidates = new WeakMap();
  function reset(reason = 'Simulation wurde zurückgesetzt.') {
    generation++; accepted = null;
    const old = worker; worker = null; old?.terminate();
    for (const request of pending.values()) request.resolve({ error: reason });
    pending.clear();
  }
  function getWorker() {
    if (worker) return worker;
    const current = createWorker(); worker = current;
    current.onmessage = ({ data: packet }) => {
      if (worker !== current) return;
      const request = pending.get(packet.id); if (!request) return;
      if (packet.type === 'progress') { request.onProgress?.(packet.progress); return; }
      if (packet.needsSnapshot) {
        // Safe retry: the worker explicitly rejected BEFORE executing anything.
        if (request.retried) { finish(request, { error: 'Simulationszustand konnte nicht abgeglichen werden.' }); return; }
        request.retried = true; accepted = null;
        try { current.postMessage({ id: request.id, state: request.state, command: request.command, params: request.params }); }
        catch (e) { finish(request, { error: e.message }); }
        return;
      }
      try {
        const data = unpackResult(packet, request.source);
        if (data.state && !data.error) {
          freezeFinancialSnapshot(data.state);
          candidates.set(data, { revision: request.id, generation, cold: coldPart(data.state) });
        }
        if (request.diag) Object.assign(request.diag, {
          workerMs: performance.now() - request.started,
          workerComputeMs: packet.workerComputeMs ?? null,
          workerOtherMs: Number.isFinite(packet.workerComputeMs) ? Math.max(0, performance.now() - request.started - packet.workerComputeMs) : null,
          reusedJournalRows: packet.reusedRows || 0,
          reusedFinancialInput: request.reuseCold && !request.retried,
        });
        finish(request, data);
      } catch (e) { accepted = null; finish(request, { error: e.message }); }
    };
    current.onerror = e => { if (worker === current) reset('Simulations-Worker abgestürzt: ' + (e.message || 'Unbekannter Fehler')); };
    current.onmessageerror = () => { if (worker === current) reset('Simulationsantwort konnte nicht gelesen werden.'); };
    return current;
  }
  function finish(request, data) { pending.delete(request.id); request.resolve(data); }
  function accept(data, state) {
    const candidate = candidates.get(data), source = candidate?.cold, next = coldPart(state);
    if (!candidate || candidate.generation !== generation || candidate.revision !== sequence || !source || !next ||
        source.journal !== next.journal || source.projection !== next.projection || source.hasProjection !== next.hasProjection) return;
    freezeFinancialSnapshot(state);
    accepted = { ...next, revision: candidate.revision };
  }
  function execute(state, command, params, onProgress, diag) {
    const id = ++sequence, prepStart = performance.now();
    try { freezeFinancialSnapshot(state); } catch (e) { return Promise.resolve({ error: e.message }); }
    const source = coldPart(state);
    const reuseCold = !!(accepted && source && accepted.journal === source.journal && accepted.projection === source.projection && accepted.hasProjection === source.hasProjection);
    const baseRevision = accepted?.revision;
    // No result may be reused until storage/session guards explicitly accept it.
    accepted = null;
    const message = { id, state: reuseCold ? withoutCold(state) : state, command, params, reuseCold, baseRevision };
    if (diag) {
      diag.transportPreparationMs = performance.now() - prepStart;
      const sizeStart = performance.now();
      try { diag.stateSizeKb = Math.round((new Blob([JSON.stringify(state)]).size + archiveStats(state).compressedBytes) / 1024); diag.inputPayloadKb = Math.round(new Blob([JSON.stringify(message)]).size / 1024); } catch { /* Optional sizing must not block a command. */ }
      diag.stateSizingMs = performance.now() - sizeStart;
    }
    return new Promise(resolve => {
      const request = { id, state, source, command, params, onProgress, diag, resolve, reuseCold, retried: false, started: performance.now() };
      pending.set(id, request);
      try { getWorker().postMessage(message); }
      catch (error) { accepted = null; finish(request, { error: error.message || 'Spielzustand konnte nicht übertragen werden.' }); }
    });
  }
  return { execute, accept, reset };
}
