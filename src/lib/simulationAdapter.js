// Client-seitige Simulations-Ausführung.
// Die Simulations-Engine läuft direkt im Browser — keine Netzwerk-Roundtrips.
// Persistierung erfolgt ausschließlich clientseitig via IndexedDB.
//
// Hinweis: Die Engine-Dateien unter src/lib/simulation/ sind Kopien von
// base44/shared/. Bei Änderungen an der Spiellogik müssen beide Versionen
// synchron gehalten werden (erneut kopieren).

import { applyCommand, createInitialState } from "@/lib/simulation/simulationEngine";
import { generateBranchDecisions, approveBranchDecision, rejectBranchDecision, setBranchManagerMode } from "@/lib/simulation/branchManagerEngine";

// Reduziert die Zustandsgröße vor der Ausführung.
// Entfernt gesehene Events (>1 Tag alt) und kappt das Legacy-Buchungs-Array.
// Diese Daten werden für die Simulation nicht benötigt.
function slimState(state) {
  if (!state) return state;
  let slim = state;
  if (state.events && state.events.length > 80) {
    const cutoff = state.gameTime - 1440;
    const slimEvents = state.events.filter(e => !(e.seen && e.gameTime < cutoff));
    if (slimEvents.length < state.events.length) {
      slim = { ...slim, events: slimEvents };
    }
  }
  if (state.bookings && state.bookings.length > 50) {
    slim = { ...slim, bookings: state.bookings.slice(-50) };
  }
  return slim;
}

export async function executeCommand(state, command, params) {
  // Neues Spiel erstellen (kein State erforderlich)
  if (command === "newGame") {
    try {
      const init = createInitialState(params || {});
      return { state: init.state, result: { ok: true, command: "newGame" } };
    } catch (e) {
      return { error: e.message };
    }
  }

  if (!state) return { error: "state erforderlich" };

  // Geschäftsführergehalt setzen – rein clientseitig, keine Simulations-Engine nötig.
  if (command === "setOwnerSalary") {
    const amount = Math.max(0, Math.min(100000, Math.round((params || {}).dailyWithdrawalCents || 0)));
    const newState = { ...state, private: { ...state.private, dailyWithdrawalCents: amount } };
    return { state: newState, result: { ok: true, dailyWithdrawalCents: amount } };
  }

  // Filialleiter-Entscheidungen
  if (command === "approveBranchDecision") {
    try { const result = approveBranchDecision(state, (params || {}).decisionId); return { state: { ...state }, result }; }
    catch (e) { return { error: e.message }; }
  }
  if (command === "rejectBranchDecision") {
    try { const result = rejectBranchDecision(state, (params || {}).decisionId); return { state: { ...state }, result }; }
    catch (e) { return { error: e.message }; }
  }
  if (command === "setBranchManagerMode") {
    try { const result = setBranchManagerMode(state, (params || {}).employeeId, (params || {}).mode); return { state: { ...state }, result }; }
    catch (e) { return { error: e.message }; }
  }

  // serverNowMs für Zeitautomatik-Befehle ergänzen (früher serverseitig)
  const isTimeCommand = ["enableAutomation", "pauseAutomation", "syncAutomation", "getAutomationStatus"].includes(command);
  const paramsWithTime = isTimeCommand ? { ...(params || {}), serverNowMs: Date.now() } : (params || {});

  const slim = slimState(state);

  try {
    const r = applyCommand(slim, command, paramsWithTime);
    let newState = r.state;
    if (newState && command === "syncAutomation") newState = generateBranchDecisions(newState);
    return { state: newState, result: r.result };
  } catch (e) {
    return { error: e.message };
  }
}