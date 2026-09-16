// Client-seitige Simulations-Ausführung.
// Die Simulations-Engine läuft direkt im Browser — keine Netzwerk-Roundtrips.
// Persistierung erfolgt ausschließlich clientseitig via IndexedDB.
//
// Hinweis: Die Engine-Dateien unter src/lib/simulation/ sind Kopien von
// base44/shared/. Bei Änderungen an der Spiellogik müssen beide Versionen
// synchron gehalten werden (erneut kopieren).

import { applyCommand, createInitialState } from "@/lib/simulation/simulationEngine";
import { generateBranchDecisions, approveBranchDecision, rejectBranchDecision, setBranchManagerMode } from "@/lib/simulation/branchManagerEngine";
import { processAssistant, migrateAssistant } from "@/lib/simulation/assistantEngine";

// Reduziert die Zustandsgröße vor der Ausführung.
// Entfernt gesehene Events (>1 Tag alt), kappt das Legacy-Buchungs-Array,
// und entfernt alte abgeschlossene Trips/Tours/Aufträge die ohnehin bei
// Mitternacht aufgeräumt werden. Reduziert postMessage-Serialisierung und
// earliestEventAfter-Iterationen (O(n) pro Event) bei großen Spielständen.
const _DONE_ORDER_STATUSES = new Set(["geliefert", "storniert", "expired", "failed"]);
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
  // Alte abgeschlossene Trips/Tours entfernen (7 Tage Retention).
  // Die Simulation benötigt nur in_progress Trips und active/planned Tours.
  const tripCutoff = state.gameTime - 7 * 1440;
  if (state.trips && state.trips.length > 40) {
    const slimTrips = state.trips.filter(t =>
      t.status === "in_progress" || (t.endMin != null && t.endMin >= tripCutoff)
    );
    if (slimTrips.length < state.trips.length) {
      slim = { ...slim, trips: slimTrips };
    }
  }
  if (state.tours && state.tours.length > 40) {
    const slimTours = state.tours.filter(t =>
      t.status === "active" || t.status === "planned" ||
      (t.createdAt != null && t.createdAt >= tripCutoff)
    );
    if (slimTours.length < state.tours.length) {
      slim = { ...slim, tours: slimTours };
    }
  }
  // Alte erledigte Aufträge entfernen (30 Tage Retention, wie UI-Filter).
  const orderCutoff = state.gameTime - 30 * 1440;
  if (state.orders && state.orders.length > 60) {
    const slimOrders = state.orders.filter(o =>
      !_DONE_ORDER_STATUSES.has(o.status) ||
      (o.failedAtMin != null && o.failedAtMin >= orderCutoff) ||
      (o.deliveredAtMin != null && o.deliveredAtMin >= orderCutoff)
    );
    if (slimOrders.length < state.orders.length) {
      slim = { ...slim, orders: slimOrders };
    }
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

  let slim = slimState(state);

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
    // Assistent der Geschäftsführung: stündliche Verarbeitung.
    // Läuft bei Zeitautomatik (syncAutomation) UND manuellem Zeitvorlauf (advanceTo).
    if (newState && (command === "syncAutomation" || command === "advanceTime" || command === "advanceToNextEvent")) {
      newState = generateBranchDecisions(newState);
      if (!newState.assistantState) newState.assistantState = { lastProcessedHour: 0 };
      const lastHour = newState.assistantState.lastProcessedHour || 0;
      const currentHour = Math.floor(newState.gameTime / 60);
      if (currentHour > lastHour) {
        const assistants = (newState.employees || []).filter(e =>
          e.role === "assistant" && e.employmentStatus === "employed" && e.attendance === "present"
        );
        if (assistants.length > 0) {
          // Bei Automatik (syncAutomation): 8 Stunden Rückblick.
          // Bei manuellem Zeitvorlauf (advanceTime/advanceToNextEvent):
          // nur die aktuelle Stunde — die stündliche Disposition läuft
          // bereits in advanceTo über processEmployees. Alle Stunden
          // einzeln nachzuholen wäre der Hauptflaschenhals bei 24h-Sprüngen.
          const isAutomation = command === "syncAutomation";
          const hoursAdvanced = Math.max(0, currentHour - lastHour);
          const maxHours = isAutomation ? Math.max(8, hoursAdvanced) : 1;
          const startHour = Math.max(lastHour + 1, currentHour - maxHours + 1);
          for (let h = startHour; h <= currentHour; h++) {
            const t = h * 60;
            for (const emp of assistants) {
              try { processAssistant(newState, emp, t, []); } catch (e) { /* Fehler einzelner Assistent-Funktion ignorieren */ }
            }
          }
        }
        newState.assistantState.lastProcessedHour = currentHour;
      }
    }
    return { state: newState, result: r.result };
  } catch (e) {
    return { error: e.message };
  }
}