// Szenario-Engine für FERNWERK.
// Erzeugt Szenario-Startzustände, wertet Ziele am Stichtag aus und
// verfolgt den Fortschritt. Nutzt die vorhandenen Spielmechaniken.
// Reine Logik – wird vom Simulations-Adapter und der UI importiert.

import { createInitialState } from "@/lib/simulation/initialStateEngine";
import { generateLoanSchedule, LOAN_INTEREST_RATE_MONTHLY } from "@/lib/simulation/financingEngine";
import { postJournal } from "@/lib/simulation/accountingEngine";
import { migrateContracts, migrateCustomerRelations, CONTRACT_DISCOUNT, CONTRACT_DURATION_DAYS, CONTRACT_DELIVERY_BUFFER_HOURS } from "@/lib/simulation/customerEngine";
import { getDistance, driveMinutes, LOAD_MIN, UNLOAD_MIN, PORTRAIT_IDS } from "@/lib/simulation/gameRules";
import { computeOfferPrice } from "@/lib/simulation/marketEngine";
import { SCENARIOS, getScenarioById, SCENARIO_VERSION } from "./scenarioCatalog";
import { setupWiederAufKurs, setupEinKundeZaehlt, setupDerBetriebLaeuft } from "./scenarioSetups";

const SCENARIO_SETUPS = {
  wieder_auf_kurs: setupWiederAufKurs,
  ein_kunde_zaehlt_auf_dich: setupEinKundeZaehlt,
  der_betrieb_laeuft_auch_ohne_dich: setupDerBetriebLaeuft,
};

// ---------- Szenario-Startzustand erzeugen ----------

export function createScenarioState(scenarioId, names) {
  const scenario = getScenarioById(scenarioId);
  if (!scenario) throw new Error("Unbekanntes Szenario: " + scenarioId);

  // Basis-Initialzustand erzeugen (nutzt die vorhandene Engine)
  const init = createInitialState({ ...names, onboarding: false });
  const state = init.state;

  // Deterministischen Zufallszustand setzen
  state.rngSeed = scenario.rngSeed;
  state.market = state.market || {};
  state.market.rngSeed = scenario.rngSeed + 1000;

  // Szenario-Metadaten im Zustand speichern (unveränderlich für diese Partie)
  const startMin = state.gameTime;
  const deadlineMin = startMin + scenario.durationDays * 1440;

  state.scenario = {
    scenarioId: scenario.id,
    version: scenario.version,
    rngSeed: scenario.rngSeed,
    startMin,
    deadlineMin,
    status: "active",
    result: null,
    // Szenario-spezifische Verfolgungsdaten
    interventions: 0,
    deliveriesDuringTimeoff: 0,
    totalDeliveries: 0,
    loansTakenDuringScenario: 0,
    vehicleSaleRevenue: 0,
    initialAccountCents: 0,
    initialLoanPrincipalCents: 0,
    timeoffStartMin: null,
    timeoffEndMin: null,
    contractId: null,
    initialTransports: 0,
    // Unveränderliche Zielbedingungen (Kopie aus der Vorlage)
    mandatoryGoals: JSON.parse(JSON.stringify(scenario.mandatoryGoals)),
    optionalGoals: JSON.parse(JSON.stringify(scenario.optionalGoals || [])),
  };

  // Szenario-spezifische Ausgangslage anwenden
  const setupFn = SCENARIO_SETUPS[scenario.id];
  if (setupFn) setupFn(state, names);

  // Anfangswerte für Auswertung sichern
  state.scenario.initialAccountCents = state.company.accountCents;
  const initialLoanTotal = (state.loans || [])
    .filter(l => l.status === "active")
    .reduce((s, l) => s + l.remainingPrincipalCents, 0);
  state.scenario.initialLoanPrincipalCents = initialLoanTotal;

  return { state };
}

// ---------- Operative Eingriffe definieren ----------

const OPERATIVE_COMMANDS = new Set([
  "acceptOrder", "cancelOrder", "clearOpenOrders",
  "startTransport", "startEmptyTrip", "maintainVehicle",
  "buyVehicle", "sellVehicle", "markForSale", "unmarkForSale", "requestSaleOffer",
  "hireDriver", "hireEmployee", "terminateEmployee", "cancelTermination",
  "setupDispatcher", "confirmDispatcherSuggestion", "dismissDispatcherSuggestion",
  "confirmTour", "cancelTour", "dispatchAllNow",
  "acceptContract", "terminateContract",
  "payOpenCosts", "payOpenItem", "takeLoan", "earlyRepayLoan",
  "leaseTruck", "returnLeasedTruck", "buyoutLeasedTruck", "earlyTerminateLease",
  "bookCleaning", "bookMaintenance", "bookTowing", "bookTempStaff",
  "bookExternalAccounting", "bookRentalTruck", "cancelService",
  "buildWorkshopSlot", "planMaintenance", "cancelMaintenance", "assignMechanic",
  "raiseSalary", "giveBonus", "prepareConversation", "conductConversation",
  "prepareRetentionConversation", "conductRetentionConversation",
  "bookCourse", "cancelCourse", "startApprenticeship", "takeoverApprentice", "releaseApprentice",
  "openBranch", "closeBranch", "renameBranch", "moveVehicle", "moveDriver",
  "assignDispatcherToBranch", "assignEmployeeToBranch",
  "postJob", "closeJobPosting",
  "approveBranchDecision", "rejectBranchDecision",
  "reportSickness", "requestVacation", "approveVacation", "rejectVacation",
  "cancelVacation", "returnEarlyFromVacation",
  "updateAutomationProfile",
]);

export function isOperativeCommand(command) {
  return OPERATIVE_COMMANDS.has(command);
}

// Eingriff zählen, wenn während der Auszeit (nur bei erfolgreicher Ausführung)
export function recordIntervention(state, command, preCommandGameTime) {
  if (!state.scenario || state.scenario.status !== "active") return;
  if (!isOperativeCommand(command)) return;
  const ts = state.scenario.timeoffStartMin;
  const te = state.scenario.timeoffEndMin;
  if (ts == null || te == null) return;
  if (preCommandGameTime >= ts && preCommandGameTime < te) {
    state.scenario.interventions = (state.scenario.interventions || 0) + 1;
  }
}

// ---------- Stichtags-Prüfung ----------

// Wird aus processEventsAt aufgerufen. Setzt ein Flag, wenn der Stichtag
// erreicht ist. Die eigentliche Auswertung erfolgt im Adapter nach dem Vorlauf.
export function checkScenarioDeadline(state, m) {
  if (!state.scenario || state.scenario.status !== "active") return;
  if (m >= state.scenario.deadlineMin && !state.scenario.pendingEvaluation) {
    state.scenario.pendingEvaluation = true;
  }
}

// ---------- Szenario auswerten ----------

export function evaluateScenario(state) {
  if (!state.scenario || state.scenario.status !== "active") return null;
  const scenario = getScenarioById(state.scenario.scenarioId);
  if (!scenario) return null;

  const m = state.gameTime;
  const goalResults = [];
  const optionalResults = [];

  // Verbindliche Ziele prüfen
  for (const goal of state.scenario.mandatoryGoals) {
    const r = evaluateGoal(state, goal);
    goalResults.push(r);
  }

  // Optionale Ziele prüfen
  for (const goal of state.scenario.optionalGoals || []) {
    const r = evaluateGoal(state, goal);
    optionalResults.push(r);
  }

  const allMandatoryMet = goalResults.every(r => r.met);

  // Finanzielle Entwicklung
  const currentLoans = (state.loans || [])
    .filter(l => l.status === "active")
    .reduce((s, l) => s + l.remainingPrincipalCents, 0);
  const newDebt = Math.max(0, currentLoans - state.scenario.initialLoanPrincipalCents);

  const result = {
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    evaluatedAtMin: m,
    success: allMandatoryMet,
    mandatoryGoals: goalResults,
    optionalGoals: optionalResults,
    metrics: {
      accountCents: state.company.accountCents,
      totalDeliveries: state.scenario.totalDeliveries || state.stats?.totalDeliveries || 0,
      newDebtCents: newDebt,
      vehicleSaleRevenueCents: state.scenario.vehicleSaleRevenue || 0,
      operativeRevenueCents: (state.stats?.totalRevenueCents || 0),
      interventions: state.scenario.interventions || 0,
      deliveriesDuringTimeoff: state.scenario.deliveriesDuringTimeoff || 0,
    },
  };

  state.scenario.status = allMandatoryMet ? "completed" : "failed";
  state.scenario.result = result;
  state.scenario.pendingEvaluation = false;
  return result;
}

function evaluateGoal(state, goal) {
  let met = false;
  let current = 0;
  let display = "";

  switch (goal.type) {
    case "liquidity": {
      current = state.company.accountCents;
      met = current >= goal.target;
      display = formatCents(current) + " / " + (goal.displayTarget || formatCents(goal.target));
      break;
    }
    case "total_deliveries": {
      current = state.scenario?.totalDeliveries || state.stats?.totalDeliveries || 0;
      met = current >= goal.target;
      display = current + " / " + goal.target;
      break;
    }
    case "no_overdue_financing": {
      const loanOverdue = (state.loans || []).filter(l => l.status === "active").reduce((s, l) => s + (l.overduePrincipalCents || 0) + (l.overdueInterestCents || 0), 0);
      const leasingOverdue = (state.leasingContracts || []).filter(c => c.status === "active" || c.status === "ending").reduce((s, c) => s + (c.overdueRatesCents || 0), 0);
      current = loanOverdue + leasingOverdue;
      met = current <= goal.target;
      display = current + " überfällig";
      break;
    }
    case "operational_vehicles": {
      current = (state.vehicles || []).filter(v => v.status !== "archived" && v.status !== "sold" && v.condition >= 20).length;
      met = current >= goal.target;
      display = current + " / " + goal.target;
      break;
    }
    case "contract_fulfillment": {
      const contract = state.scenario?.contractId
        ? (state.contracts?.contracts || []).find(c => c.id === state.scenario.contractId)
        : null;
      if (contract) {
        current = contract.timelyCount;
        met = current >= goal.target;
        display = current + " / " + (goal.totalTransports || contract.transportsPerDay * CONTRACT_DURATION_DAYS) + " pünktlich";
      } else {
        display = "Vertrag nicht gefunden";
      }
      break;
    }
    case "contract_completed": {
      const contract = state.scenario?.contractId
        ? (state.contracts?.contracts || []).find(c => c.id === state.scenario.contractId)
        : null;
      if (contract) {
        met = contract.status === "completed";
        current = met ? 1 : 0;
        display = contract.status === "completed" ? "Regulär abgeschlossen" :
                  contract.status === "terminated" ? "Vorzeitig beendet" :
                  "Status: " + contract.status;
      } else {
        display = "Vertrag nicht gefunden";
      }
      break;
    }
    case "contract_full_fulfillment": {
      const contract = state.scenario?.contractId
        ? (state.contracts?.contracts || []).find(c => c.id === state.scenario.contractId)
        : null;
      if (contract) {
        current = contract.timelyCount;
        met = current >= goal.target;
        display = current + " / " + goal.target + " pünktlich";
      }
      break;
    }
    case "timeoff_completed": {
      const appt = (state.appointments || []).find(a => a.type === "scenario_timeoff");
      if (appt) {
        met = appt.status === "done";
        current = met ? 1 : 0;
        display = appt.status === "done" ? "Abgeschlossen" : "Status: " + appt.status;
      } else {
        display = "Termin nicht gefunden";
      }
      break;
    }
    case "deliveries_during_timeoff": {
      current = state.scenario?.deliveriesDuringTimeoff || 0;
      met = current >= goal.target;
      display = current + " / " + goal.target;
      break;
    }
    case "max_interventions": {
      current = state.scenario?.interventions || 0;
      met = current <= goal.target;
      display = current + " / max. " + goal.target;
      break;
    }
    case "no_overdue_approvals": {
      const overdueApprovals = ((state.delegation?.approvals) || []).filter(a =>
        a.status === "pending" && a.deadlineMin && a.deadlineMin < state.gameTime
      );
      current = overdueApprovals.length;
      met = current === 0;
      display = current + " überfällig";
      break;
    }
    case "no_new_debt": {
      const currentLoans = (state.loans || []).filter(l => l.status === "active").reduce((s, l) => s + l.remainingPrincipalCents, 0);
      const newDebt = Math.max(0, currentLoans - state.scenario.initialLoanPrincipalCents);
      current = newDebt;
      met = newDebt === 0;
      display = newDebt > 0 ? formatCents(newDebt) + " neue Schulden" : "Keine neuen Schulden";
      break;
    }
    case "vehicle_sold": {
      const soldVehicles = (state.vehicles || []).filter(v => v.status === "sold");
      current = soldVehicles.length;
      met = current >= 1;
      display = current + " verkauft";
      break;
    }
    case "zero_interventions": {
      current = state.scenario?.interventions || 0;
      met = current === 0;
      display = current === 0 ? "Keine Eingriffe" : current + " Eingriffe";
      break;
    }
    default:
      display = "Unbekannter Zieltyp";
  }

  return { ...goal, met, current, display };
}

// ---------- Live-Fortschritt für UI ----------

export function getScenarioProgress(state) {
  if (!state.scenario || state.scenario.status !== "active") return null;
  const scenario = getScenarioById(state.scenario.scenarioId);
  if (!scenario) return null;

  const remainingMin = Math.max(0, state.scenario.deadlineMin - state.gameTime);
  const remainingDays = Math.ceil(remainingMin / 1440);

  const mandatoryGoals = state.scenario.mandatoryGoals.map(goal => evaluateGoal(state, goal));
  const optionalGoals = (state.scenario.optionalGoals || []).map(goal => evaluateGoal(state, goal));

  // Anstehende Verpflichtungen
  const obligations = [];
  // Kreditzahlungen
  for (const loan of (state.loans || [])) {
    if (loan.status !== "active") continue;
    if (loan.nextDueMin && loan.nextDueMin <= state.scenario.deadlineMin) {
      const installment = loan.schedule?.[loan.paidInstallments];
      obligations.push({
        label: "Kreditrate " + loan.id,
        atMin: loan.nextDueMin,
        amountCents: installment ? installment.totalCents : 0,
        type: "financing",
      });
    }
  }
  // Leasingraten
  for (const contract of (state.leasingContracts || [])) {
    if (contract.status !== "active") continue;
    if (contract.nextRateDueMin && contract.nextRateDueMin <= state.scenario.deadlineMin) {
      obligations.push({
        label: "Leasingrate " + contract.id,
        atMin: contract.nextRateDueMin,
        amountCents: contract.monthlyRateCents || 0,
        type: "financing",
      });
    }
  }
  // Private Auszeit
  if (state.scenario.timeoffStartMin != null) {
    const appt = (state.appointments || []).find(a => a.type === "scenario_timeoff");
    if (appt && appt.status !== "done") {
      obligations.push({
        label: "Private Auszeit",
        atMin: appt.startMin,
        type: "timeoff",
        status: appt.status,
      });
    }
  }
  // Rahmenvertrag
  if (state.scenario.contractId) {
    const contract = (state.contracts?.contracts || []).find(c => c.id === state.scenario.contractId);
    if (contract && contract.status === "active") {
      obligations.push({
        label: "Rahmenvertrag " + contract.customerName,
        atMin: contract.endMin,
        type: "contract",
        timely: contract.timelyCount,
        total: contract.transportsPerDay * CONTRACT_DURATION_DAYS,
      });
    }
  }

  // Zielrisiken erkennen
  const risks = [];
  for (const goal of mandatoryGoals) {
    if (!goal.met) {
      const remaining = goal.target - (goal.current || 0);
      if (goal.type === "liquidity" && state.company.accountCents < goal.target * 0.5) {
        risks.push("Liquidität deutlich unter Ziel: " + formatCents(state.company.accountCents));
      }
      if (goal.type === "total_deliveries" && remaining > remainingDays) {
        risks.push("Lieferziel mit verbleibenden Tagen nicht mehr erreichbar");
      }
      if (goal.type === "contract_fulfillment" && remaining > 0) {
        const contract = (state.contracts?.contracts || []).find(c => c.id === state.scenario.contractId);
        if (contract) {
          const remainingContractDays = Math.max(0, contract.endDay - Math.floor(state.gameTime / 1440) - 1);
          const remainingTransports = remainingContractDays * contract.transportsPerDay;
          if (remaining > remainingTransports) {
            risks.push("Pünktlichkeitsziel mit verbleibenden Vertragstagen nicht erreichbar");
          }
        }
      }
    }
  }

  return {
    scenarioId: scenario.id,
    title: scenario.title,
    remainingDays,
    remainingMin,
    deadlineMin: state.scenario.deadlineMin,
    mandatoryGoals,
    optionalGoals,
    obligations,
    risks,
    interventions: state.scenario.interventions || 0,
    deliveriesDuringTimeoff: state.scenario.deliveriesDuringTimeoff || 0,
    isTimeoffActive: state.scenario.timeoffStartMin != null &&
      state.gameTime >= state.scenario.timeoffStartMin &&
      state.gameTime < state.scenario.timeoffEndMin,
  };
}

// ---------- Als freies Spiel fortsetzen ----------

export function continueAsFreePlay(state) {
  if (!state.scenario) return state;
  const newState = { ...state, scenario: null };
  return newState;
}

// ---------- Hilfsfunktionen ----------

function formatCents(cents) {
  return (cents / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
}

export { SCENARIOS, SCENARIO_VERSION };