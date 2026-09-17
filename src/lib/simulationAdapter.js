// Client-seitige Simulations-Ausführung.
// Die Simulations-Engine läuft direkt im Browser — keine Netzwerk-Roundtrips.
// Persistierung erfolgt ausschließlich clientseitig via IndexedDB.
//
// Hinweis: Die Engine-Dateien unter src/lib/simulation/ sind Kopien von
// base44/shared/. Bei Änderungen an der Spiellogik müssen beide Versionen
// synchron gehalten werden (erneut kopieren).

import { applyCommand, createInitialState } from "@/lib/simulation/simulationEngine";
import { approveBranchDecision, rejectBranchDecision, setBranchManagerMode } from "@/lib/simulation/branchManagerEngine";
import { migrateAssistant } from "@/lib/simulation/assistantEngine";
import { createScenarioState, evaluateScenario, continueAsFreePlay, recordIntervention, isOperativeCommand } from "@/lib/scenarios/scenarioEngine";
import { migrateAcquisition } from "@/lib/simulation/acquisitionEngine";
import { migrateDifficulty } from "@/lib/simulation/difficultyProfiles";
import { migrateHelpSettings } from "@/lib/simulation/helpSettings";

// Der Worker erhält einen vollständigen Zustand; Bereinigung folgt der Spielzeit.

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

  // Neues Szenario-Spiel erstellen
  if (command === "newScenarioGame") {
    try {
      const init = createScenarioState(params?.scenarioId, params?.names || {});
      return { state: init.state, result: { ok: true, command: "newScenarioGame" } };
    } catch (e) {
      return { error: e.message };
    }
  }

  // Szenario als freies Spiel fortsetzen
  if (command === "continueScenarioAsFreePlay") {
    if (!state) return { error: "state erforderlich" };
    const newState = continueAsFreePlay(state);
    return { state: newState, result: { ok: true, command: "continueScenarioAsFreePlay" } };
  }

  // Szenario auswerten (vom Adapter nach Zeitvorlauf aufgerufen)
  if (command === "evaluateScenarioNow") {
    if (!state) return { error: "state erforderlich" };
    const result = evaluateScenario(state);
    return { state, result: { ok: true, evaluation: result } };
  }

  if (!state) return { error: "state erforderlich" };

  // Geschäftsführergehalt setzen – rein clientseitig, keine Simulations-Engine nötig.
  if (command === "setOwnerSalary") {
    const amount = Math.max(0, Math.round((params || {}).dailyWithdrawalCents || 0));
    const newState = { ...state, private: { ...state.private, dailyWithdrawalCents: amount } };
    return { state: newState, result: { ok: true, dailyWithdrawalCents: amount } };
  }

  // Assistenten-Konfiguration aktualisieren – rein clientseitig.
  // migrateAssistant stellt sicher, dass alle Default-Keys existieren,
  // damit der Merge keine Defaults verliert.
  if (command === "setAssistantConfig") {
    migrateAssistant(state);
    const updates = (params || {}).config || {};
    const current = state.assistantConfig || {};
    const newState = { ...state, assistantConfig: { ...current, ...updates } };
    return { state: newState, result: { ok: true } };
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

  // Akquise-State migrieren vor Ausführung
  migrateAcquisition(state);
  // Schwierigkeitsprofil und Hilfestellungen migrieren (ältere Spielstände)
  migrateDifficulty(state);
  migrateHelpSettings(state);

  const slim = state;
  const preCommandGameTime = state.gameTime;

  // Hinweis: Ein früherer Pre-Dispatch (dispatchAllNow vor advanceTime ≥ 1440)
  // wurde entfernt. Er veränderte den Zustand VOR dem Vorlauf und damit die
  // fachlichen Ergebnisse: 1×1440 hätte eine Vordisposition erhalten, die
  // 24×60 nicht erhält — unterschiedliche Touren, unterschiedlicher Umsatz.
  // Die inkrementelle Disposition (planSingleVehicle bei Tour-Ende) und die
  // kontextsensitive Skip-Cache in processDispatcher übernehmen die Planung
  // während des Vorlaufs ohne Ergebnisveränderung.

  try {
    const r = applyCommand(slim, command, paramsWithTime);
    let newState = r.state;
    // Hilfs-Maps und Transient-Flags entfernen — sie dürfen nicht persistiert
    // oder an die Oberfläche übertragen werden. try/finally in suggestTours
    // und advanceTo sorgt bereits für Cleanup im Normalfall; dies ist ein
    // Safety-Net für Fehlerpfade.
    if (newState) {
      delete newState._vehicleMap;
      delete newState._driverMap;
      delete newState._orderMap;
      delete newState._bulkAdvance;
      delete newState._largeAdvance;
    }
    // Szenario: operative Eingriffe während der Auszeit zählen.
    // Nur bei erfolgreicher Ausführung (applyCommand hat nicht geworfen).
    // preCommandGameTime aus dem Original-State (vor slimming).
    if (newState && newState.scenario && newState.scenario.status === "active") {
      const preTime = preCommandGameTime || 0;
      recordIntervention(newState, command, preTime);
    }
    // Szenario: Stichtags-Auswertung nach Zeitvorlauf.
    // processEventsAt setzt pendingEvaluation, wenn der Stichtag erreicht ist.
    // Die Auswertung erfolgt hier nach allen Ereignissen dieses Zeitpunkts.
    if (newState && newState.scenario && newState.scenario.pendingEvaluation) {
      evaluateScenario(newState);
    }
    return { state: newState, result: r.result };
  } catch (e) {
    return { error: e.message };
  }
}