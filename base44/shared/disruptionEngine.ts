import { retainHistory } from "./historyRetention.ts";
import { pendingTourChecker } from "./tourEngine.ts";
import { dispatcherProfile } from "./dispatcherQuality.ts";
import { isPersonInTraining } from "./trainingEngine.ts";
import { addBooking } from "./accountingEngine.ts";
// Störungsmanagement-Engine für FERNWERK.
// Verwaltet betriebliche Störungen: technische Defekte, Ladeverzögerungen,
// Personalausfälle. Nutzt vorhandene Wartung, Dienstleistungen, Mietfahrzeuge,
// Personalabwesenheiten, Disposition, Mitarbeiterbefugnisse und Kundenkommunikation.
//
// Design-Prinzipien:
// - Störungen entstehen an klar definierten fachlichen Übergängen (nicht pro Zeitschritt)
// - Einmalige, reproduzierbare Zufallsentscheidungen über gespeicherten RNG
// - Dedup-Keys verhindern wiederholte Störungen für denselben Anlass
// - Keine rückwirkenden Defekte für bestehende Spielstände
// - Ressourcen-Reservierung verhindert Doppelbuchungen
// - Kosten und Zeiten über vorhandene Finanz- und Fahrerzeitmodelle
// - Delegation und Kundenkommunikation über vorhandene Systeme

import {
  dayOf, formatGameTime, mulberry32,
  MAINTENANCE_COST, MAINTENANCE_DURATION,
} from "./gameRules.ts";
import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import {
  SERVICE_PROVIDERS, BLOCK_DURATION_MIN,
} from "./serviceEngine.ts";
import { checkSpendAuthority } from "./delegationEngine.ts";
import { getEffectiveParams, applyDisruptionRate } from "./difficultyProfiles.ts";

// ---------- Zentrale Konfiguration ----------
// Wahrscheinlichkeiten und Auswirkungen — kalibriert für ausgewogenen Betrieb.
// Technische Defekte: ~1% Basis pro Tourstart, erhöht durch schlechten Zustand.
// Ladeverzögerungen: ~1,5% pro Be-/Entladevorgang.
// Personalausfälle werden aus dem vorhandenen Abwesenheitssystem abgeleitet
// (keine zusätzliche Zufalls-Krankheit).
export const DISRUPTION_CONFIG = {
  technicalDefect: {
    baseRate: 0.01,              // 1% Basischance pro Tourstart
    conditionRiskFactor: 0.002,  // +0,2% pro Zustandspunkt unter 100
    minConditionForDefect: 20,   // Unter 20 ist Fahrzeug ohnehin gesperrt
    repairDurationMin: 240,      // 4h Notfallreparatur
    repairCostCents: 30000,      // 300 € Notfallreparatur
    maxDefectsPerDay: 1,         // Max. 1 neuer Defekt pro Spieltag (Kappen)
  },
  loadingDelay: {
    baseRate: 0.015,             // 1,5% pro Be-/Entladevorgang
    minDelayMin: 30,             // Mindestverzögerung 30 Min
    maxDelayMin: 120,            // Maximalverzögerung 2h
    maxDelaysPerDay: 2,          // Max. 2 neue Verzögerungen pro Spieltag
  },
  // Auto-Auflösung durch Mitarbeiter: nur für kostenlose Optionen
  autoResolve: {
    enabled: true,
    maxCostCents: 0,              // Nur kostenlose Auto-Auflösungen
  },
};

const DAY_MIN = 1440;

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function nextRng(state) {
  const r = mulberry32(state.rngSeed >>> 0);
  const v = r();
  state.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}

function vehicleLabel(v) {
  if (!v) return "—";
  const n = parseInt(String(v.id).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? v.id : "Lkw " + String(n).padStart(2, "0");
}

function findPerson(state, id) {
  const d = (state.drivers || []).find(x => x.id === id);
  if (d) return { person: d, kind: "driver" };
  const e = (state.employees || []).find(x => x.id === id);
  if (e) return { person: e, kind: "employee" };
  return null;
}

// ---------- Migration ----------
export function migrateDisruptions(state) {
  if (!state.disruptions) {
    state.disruptions = {
      version: 1,
      items: [],
      introducedAtMin: state.gameTime || 0,
      dailyCounters: {},
    };
  }
  if (!state.disruptions.items) state.disruptions.items = [];
  if (!state.disruptions.dailyCounters) state.disruptions.dailyCounters = {};
}

// Prüft ob das tägliche Limit für neue Störungen eines Typs erreicht ist.
function canGenerateToday(state, type, m) {
  const day = dayOf(m);
  const key = type + ":" + day;
  const config = type === "technical_defect"
    ? DISRUPTION_CONFIG.technicalDefect.maxDefectsPerDay
    : DISRUPTION_CONFIG.loadingDelay.maxDelaysPerDay;
  const count = state.disruptions.dailyCounters[key] || 0;
  return count < config;
}

function recordGeneration(state, type, m) {
  const day = dayOf(m);
  const key = type + ":" + day;
  state.disruptions.dailyCounters[key] = (state.disruptions.dailyCounters[key] || 0) + 1;
}

// Prüft ob bereits eine Störung für denselben Anlass existiert (Dedup).
function hasExistingDisruption(state, dedupKey) {
  return (state.disruptions.items || []).some(
    d => d.dedupKey === dedupKey && d.status !== "completed"
  );
}

// ---------- Ersatzfahrzeug-Suche ----------
// Findet ein freies eigenes Fahrzeug, das für die betroffene Tour geeignet ist.
// Berücksichtigt: Standort, Kapazität, Zustand, Verkaufsvormerkung, Reservierung.
function findReplacementVehicle(state, tour, m) {
  const isCommitted = pendingTourChecker(state);
  const startCity = tour.startCity || (state.vehicles.find(v => v.id === tour.vehicleId) || {}).locationCity;
  const orders = (tour.deployments || [])
    .filter(d => d.orderId)
    .map(d => state.orders.find(o => o.id === d.orderId))
    .filter(Boolean);
  const maxTons = orders.length > 0 ? Math.max(...orders.map(o => o.tons)) : 12;

  const candidates = (state.vehicles || []).filter(v => {
    if (v.id === tour.vehicleId) return false;
    if (v.status !== "free") return false;
    if (v.condition < 20) return false;
    if (v.markedForSale) return false;
    if (v.ownership_type === "sold" || v.ownership_type === "archived") return false;
    if (v.capacityTons < maxTons) return false;
    if (v.locationCity !== startCity) return false; // Diese Version: nur am selben Ort
    if (isVehicleReserved(state, v.id) || isCommitted(v.id)) return false;
    return true;
  });

  candidates.sort((a, b) => {
    if (b.condition !== a.condition) return b.condition - a.condition;
    return a.id < b.id ? -1 : 1;
  });
  return candidates[0] || null;
}

function isVehicleReserved(state, vehicleId) {
  return (state.disruptions.items || []).some(d =>
    d.status !== "completed" &&
    d.reservedVehicleId === vehicleId
  );
}

function isDriverReserved(state, driverId) {
  return (state.disruptions.items || []).some(d =>
    d.status !== "completed" &&
    d.reservedDriverId === driverId
  );
}

// ---------- Ersatzfahrer-Suche ----------
function findReplacementDriver(state, tour, m) {
  const isCommitted = pendingTourChecker(state);
  const vehicle = state.vehicles.find(v => v.id === tour.vehicleId);
  const startCity = vehicle ? vehicle.locationCity : tour.startCity;

  const candidates = (state.drivers || []).filter(d => {
    if (d.id === tour.driverId) return false;
    if (!isActivelyEmployed(d)) return false;
    if (d.status !== "free") return false;
    if (d.restUntil && d.restUntil > m) return false;
    if (d.locationCity !== startCity) return false;
    if (!isPersonAvailable(state, d.id, m)) return false;
    if (isDriverReserved(state, d.id) || isCommitted(d.id)) return false;
    return true;
  });

  candidates.sort((a, b) => a.id < b.id ? -1 : 1);
  return candidates[0] || null;
}

// ---------- Optionen berechnen ----------
function computeOptions(state, disruption, m) {
  const options = [];
  const tour = disruption.tourId ? (state.tours || []).find(t => t.id === disruption.tourId) : null;
  const vehicle = disruption.vehicleId ? (state.vehicles || []).find(v => v.id === disruption.vehicleId) : null;
  const driver = disruption.driverId ? (state.drivers || []).find(d => d.id === disruption.driverId) : null;
  const affectedOrders = disruption.orderIds || [];

  if (disruption.type === "technical_defect") {
    if (tour) {
      const replacement = findReplacementVehicle(state, tour, m);
      options.push({
        id: "replace_vehicle",
        label: "Ersatzfahrzeug zuordnen",
        description: replacement
          ? vehicleLabel(replacement) + " (Zustand " + replacement.condition + ") am Standort " + replacement.locationCity + " uebernehmen."
          : "Kein geeignetes Ersatzfahrzeug am Standort verfuegbar.",
        costCents: 0,
        estimatedDurationMin: 0,
        deadlineImpactMin: 0,
        affectedOrders,
        requiresApproval: false,
        available: !!replacement,
        unavailableReason: replacement ? null : "Kein freies Fahrzeug mit ausreichender Kapazitaet am Tour-Startort.",
        isEstimate: false,
        resourceLabel: replacement ? vehicleLabel(replacement) : null,
      });
    }

    const rentalProvider = SERVICE_PROVIDERS.find(p => p.type === "rental_truck");
    if (rentalProvider && vehicle) {
      const blocks = 2;
      const rentalCost = rentalProvider.handoverCents + blocks * rentalProvider.blockRateCents;
      const available = state.company.accountCents >= rentalCost;
      options.push({
        id: "rental_truck",
        label: "Mietfahrzeug buchen",
        description: rentalProvider.name + ": " + rentalProvider.homeCity + ", " + (blocks * 24) + "h Miete. Uebergabe " + (rentalProvider.handoverCents / 100) + " EUR + " + blocks + "x" + (rentalProvider.blockRateCents / 100) + " EUR.",
        costCents: rentalCost,
        estimatedDurationMin: 60,
        deadlineImpactMin: 60,
        affectedOrders,
        requiresApproval: rentalCost > 50000,
        available,
        unavailableReason: available ? null : "Firmenkonto reicht fuer Mietfahrzeug nicht aus.",
        isEstimate: true,
      });
    }

    if (vehicle) {
      const repairCost = DISRUPTION_CONFIG.technicalDefect.repairCostCents;
      const repairDuration = DISRUPTION_CONFIG.technicalDefect.repairDurationMin;
      const available = state.company.accountCents >= repairCost;
      options.push({
        id: "emergency_repair",
        label: "Notfallreparatur durchfuehren",
        description: "Werkstatt repariert " + vehicleLabel(vehicle) + " vor Ort. Dauer ~" + (repairDuration / 60) + "h, Kosten " + (repairCost / 100).toFixed(2) + " EUR. Fahrzeug danach einsatzbereit.",
        costCents: repairCost,
        estimatedDurationMin: repairDuration,
        deadlineImpactMin: repairDuration,
        affectedOrders,
        requiresApproval: repairCost > 50000,
        available,
        unavailableReason: available ? null : "Firmenkonto reicht fuer Reparatur nicht aus.",
        isEstimate: true,
      });
    }

    if (tour) {
      const firstOrder = affectedOrders.length > 0 ? state.orders.find(o => o.id === affectedOrders[0]) : null;
      const deadlineImpact = firstOrder ? firstOrder.deliveryDeadlineMin - m : 0;
      const willMissDeadline = firstOrder && deadlineImpact < 240;
      options.push({
        id: "postpone",
        label: "Einsatz verschieben",
        description: willMissDeadline
          ? "Achtung: Lieferfrist von " + firstOrder.customer + " wird voraussichtlich verpasst (Restfrist " + Math.max(0, deadlineImpact / 60).toFixed(0) + "h)."
          : "Tour bleibt pausiert. Auftraege bleiben angenommen, Fristen laufen weiter.",
        costCents: 0,
        estimatedDurationMin: 0,
        deadlineImpactMin: 0,
        affectedOrders,
        requiresApproval: false,
        available: true,
        unavailableReason: null,
        isEstimate: false,
      });
    }

    if (tour) {
      options.push({
        id: "cancel_tour",
        label: "Tour aufloesen",
        description: "Tour wird aufgeloest. Auftraege bleiben angenommen und koennen neu disponiert werden.",
        costCents: 0,
        estimatedDurationMin: 0,
        deadlineImpactMin: 0,
        affectedOrders,
        requiresApproval: false,
        available: true,
        unavailableReason: null,
        isEstimate: false,
      });
    }
  }

  if (disruption.type === "loading_delay") {
    const trip = (state.trips || []).find(t => t.id === disruption.tripId);
    const delayMin = disruption.delayMin || 0;

    options.push({
      id: "accept_delay",
      label: "Verzoegerung akzeptieren",
      description: "Wartezeit von " + delayMin + " Min wird in die Tour eingerechnet. Folgeeinsaetze verschieben sich entsprechend.",
      costCents: 0,
      estimatedDurationMin: delayMin,
      deadlineImpactMin: delayMin,
      affectedOrders,
      requiresApproval: false,
      available: true,
      unavailableReason: null,
      isEstimate: false,
    });

    if (trip && trip.tourId) {
      const tour2 = (state.tours || []).find(t => t.id === trip.tourId);
      const futureDeps = (tour2?.deployments || []).filter(d => d.status === "planned");
      options.push({
        id: "replan_followup",
        label: "Folgeeinsaetze umplanen",
        description: futureDeps.length > 0
          ? futureDeps.length + " noch nicht gestartete Folgeeinsatz/e werden freigegeben und koennen neu disponiert werden."
          : "Keine weiteren Folgeeinsaetze in dieser Tour.",
        costCents: 0,
        estimatedDurationMin: 0,
        deadlineImpactMin: delayMin,
        affectedOrders,
        requiresApproval: false,
        available: futureDeps.length > 0,
        unavailableReason: futureDeps.length > 0 ? null : "Keine Folgeeinsaetze zum Umplanen vorhanden.",
        isEstimate: false,
      });
    }

    const firstOrder = affectedOrders.length > 0 ? state.orders.find(o => o.id === affectedOrders[0]) : null;
    options.push({
      id: "inform_customer",
      label: "Kunden informieren",
      description: firstOrder
        ? "Nachricht an " + firstOrder.customer + " ueber die Verzoegerung. Hinweis: Information allein aendert keine Lieferfrist und beseitigt keine Verspaetung."
        : "Kunden ueber Verzoegerung informieren. Information allein aendert keine Lieferfrist.",
      costCents: 0,
      estimatedDurationMin: 0,
      deadlineImpactMin: delayMin,
      affectedOrders,
      requiresApproval: false,
      available: !disruption.customerInformed,
      unavailableReason: disruption.customerInformed ? "Kunde bereits informiert." : null,
      isEstimate: false,
    });
  }

  if (disruption.type === "personnel_absence") {
    if (tour) {
      const replacement = findReplacementDriver(state, tour, m);
      options.push({
        id: "replace_driver",
        label: "Ersatzfahrer einsetzen",
        description: replacement
          ? replacement.name + " am Standort " + replacement.locationCity + " uebernimmt die Tour."
          : "Kein freier Ersatzfahrer am Standort verfuegbar.",
        costCents: 0,
        estimatedDurationMin: 0,
        deadlineImpactMin: 0,
        affectedOrders,
        requiresApproval: false,
        available: !!replacement,
        unavailableReason: replacement ? null : "Kein freier Fahrer am Tour-Startort.",
        isEstimate: false,
        resourceLabel: replacement ? replacement.name : null,
      });
    }

    const tempProvider = SERVICE_PROVIDERS.find(p => p.type === "temp_driver");
    if (tempProvider) {
      const blocks = 2;
      const tempCost = tempProvider.provisionCents + blocks * tempProvider.blockRateCents;
      const available = state.company.accountCents >= tempCost;
      options.push({
        id: "temp_staff",
        label: "Fremdfahrer anheuern",
        description: tempProvider.name + ": Provision " + (tempProvider.provisionCents / 100) + " EUR + " + blocks + "x" + (tempProvider.blockRateCents / 100) + " EUR. Verfuegbar in " + tempProvider.homeCity + ".",
        costCents: tempCost,
        estimatedDurationMin: 120,
        deadlineImpactMin: 120,
        affectedOrders,
        requiresApproval: tempCost > 50000,
        available,
        unavailableReason: available ? null : "Firmenkonto reicht fuer Fremdpersonal nicht aus.",
        isEstimate: true,
      });
    }

    if (tour) {
      options.push({
        id: "replan_tour",
        label: "Tour umplanen",
        description: "Tour wird aufgeloest. Auftraege bleiben angenommen und koennen neu disponiert werden.",
        costCents: 0,
        estimatedDurationMin: 0,
        deadlineImpactMin: 0,
        affectedOrders,
        requiresApproval: false,
        available: true,
        unavailableReason: null,
        isEstimate: false,
      });
    }

    if (tour) {
      const firstOrder = affectedOrders.length > 0 ? state.orders.find(o => o.id === affectedOrders[0]) : null;
      const deadlineImpact = firstOrder ? firstOrder.deliveryDeadlineMin - m : 0;
      const willMissDeadline = firstOrder && deadlineImpact < 240;
      options.push({
        id: "postpone",
        label: "Einsatz verschieben",
        description: willMissDeadline
          ? "Achtung: Lieferfrist von " + firstOrder.customer + " wird voraussichtlich verpasst."
          : "Tour bleibt pausiert bis Fahrer wieder verfuegbar oder neu disponiert wird.",
        costCents: 0,
        estimatedDurationMin: 0,
        deadlineImpactMin: 0,
        affectedOrders,
        requiresApproval: false,
        available: true,
        unavailableReason: null,
        isEstimate: false,
      });
    }
  }

  return options;
}

// ---------- Stoerung erstellen ----------
function createDisruption(state, opts) {
  const disruption = {
    id: uid(state, "dis"),
    type: opts.type,
    cause: opts.cause,
    createdAtMin: state.gameTime,
    status: "decision_open",
    vehicleId: opts.vehicleId || null,
    driverId: opts.driverId || null,
    tourId: opts.tourId || null,
    tripId: opts.tripId || null,
    orderIds: opts.orderIds || [],
    branchId: opts.branchId || null,
    delayMin: opts.delayMin || 0,
    dedupKey: opts.dedupKey,
    options: [],
    chosenOptionId: null,
    chosenAtMin: null,
    nextProcessMin: state.gameTime,
    appliedCostsCents: 0,
    reservedVehicleId: null,
    reservedDriverId: null,
    completedAtMin: null,
    completionSummary: null,
    actualDelayMin: 0,
    actualCostCents: 0,
    autoResolved: false,
    autoResolvedBy: null,
    customerInformed: false,
    history: [{ type: "created", atMin: state.gameTime, cause: opts.cause }],
  };
  disruption.options = computeOptions(state, disruption, state.gameTime);
  state.disruptions.items.push(disruption);
  deliverMessage(state, {
    fromId: opts.driverId || "system", toId: "player",
    subject: "Rückfrage aus dem Betrieb",
    body: opts.cause + "\n\nBitte entscheide über die Maßnahme. Dringende Einsätze erreichst du am Telefon, planbare Rückfragen im Entscheidungsbereich des Postfachs. Lieferfristen laufen mit der Spielzeit weiter.",
    gameTime: state.gameTime, category: "operations", priority: "normal",
    linkedRefs: { type: "disruption", id: disruption.id },
    dedupKey: "disruption_request:" + disruption.id,
  });

  pushEvent(state, {
    type: "disruption_created",
    gameTime: state.gameTime, isSystem: true,
    vehicleId: opts.vehicleId, driverId: opts.driverId,
    details: {
      disruptionId: disruption.id, disruptionType: opts.type, cause: opts.cause,
      orderIds: opts.orderIds, tourId: opts.tourId,
    },
    dedupKey: "disruption_created:" + disruption.id,
  });

  return disruption;
}

// ---------- A) Technischer Defekt vor Tourbeginn ----------
export function maybeGenerateTechnicalDefect(state, tour, deployment, m, log) {
  if (!canGenerateToday(state, "technical_defect", m)) return false;
  const vehicle = (state.vehicles || []).find(v => v.id === tour.vehicleId);
  if (!vehicle) return false;
  if (vehicle.status !== "free" && vehicle.status !== "resting") return false;
  if (vehicle.condition < DISRUPTION_CONFIG.technicalDefect.minConditionForDefect) return false;

  const dedupKey = "defect:" + vehicle.id + ":" + tour.id;
  if (hasExistingDisruption(state, dedupKey)) return false;

  const conditionGap = 100 - vehicle.condition;
  const baseRate = applyDisruptionRate(
    DISRUPTION_CONFIG.technicalDefect.baseRate, getEffectiveParams(state)
  );
  const probability = baseRate
    + conditionGap * DISRUPTION_CONFIG.technicalDefect.conditionRiskFactor;

  if (nextRng(state) > probability) return false;

  const affectedOrders = (tour.deployments || [])
    .filter(d => d.orderId && d.status === "planned")
    .map(d => d.orderId);

  const disruption = createDisruption(state, {
    type: "technical_defect",
    cause: "Technischer Defekt an " + vehicleLabel(vehicle) + " (Zustand " + vehicle.condition + ") vor Tourbeginn",
    vehicleId: vehicle.id,
    tourId: tour.id,
    orderIds: affectedOrders,
    branchId: vehicle.branchId,
    dedupKey,
  });

  tour.disruptionId = disruption.id;

  recordGeneration(state, "technical_defect", m);
  log.push({ type: "disruption_technical_defect", disruption: disruption.id, tour: tour.id, vehicle: vehicle.id, atMin: m });

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Stoerung: Technischer Defekt",
    body: vehicleLabel(vehicle) + " kann die geplante Tour nicht antreten.\nUrsache: Technischer Defekt (Zustand " + vehicle.condition + ").\nBetroffene Auftraege: " + affectedOrders.length + "\n\nBitte Massnahmen ergreifen: Ersatzfahrzeug, Miete, Reparatur oder Verschiebung.",
    gameTime: m, category: "operations", priority: "high",
    linkedRefs: { type: "disruption", id: disruption.id },
    dedupKey: "disruption_msg:" + disruption.id,
  });

  return true;
}

// ---------- A2) Technischer Defekt bei manuellem Transport ----------
// Wie maybeGenerateTechnicalDefect, aber für Einzeltrips (startTransport).
// Wird vor der Buchung von Kraftstoff/Maut aufgerufen — bei Defekt wird
// das Fahrzeug auf Wartung gesetzt und die Buchung verhindert.
export function maybeGenerateTechnicalDefectForTrip(state, vehicle, driver, order, m, log) {
  if (!canGenerateToday(state, "technical_defect", m)) return false;
  if (!vehicle) return false;
  if (vehicle.condition < DISRUPTION_CONFIG.technicalDefect.minConditionForDefect) return false;

  const dedupKey = "defect:" + vehicle.id + ":manual:" + (order ? order.id : m);
  if (hasExistingDisruption(state, dedupKey)) return false;

  const conditionGap = 100 - vehicle.condition;
  const baseRate = applyDisruptionRate(
    DISRUPTION_CONFIG.technicalDefect.baseRate, getEffectiveParams(state)
  );
  const probability = baseRate
    + conditionGap * DISRUPTION_CONFIG.technicalDefect.conditionRiskFactor;

  if (nextRng(state) > probability) return false;

  const disruption = createDisruption(state, {
    type: "technical_defect",
    cause: "Technischer Defekt an " + vehicleLabel(vehicle) + " (Zustand " + vehicle.condition + ") vor Transportbeginn",
    vehicleId: vehicle.id,
    orderIds: order ? [order.id] : [],
    branchId: vehicle.branchId,
    dedupKey,
  });

  vehicle.status = "maintenance";
  vehicle.maintenanceUntil = null;

  recordGeneration(state, "technical_defect", m);
  log.push({ type: "disruption_technical_defect", disruption: disruption.id, vehicle: vehicle.id, atMin: m });

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Stoerung: Technischer Defekt",
    body: vehicleLabel(vehicle) + " kann den Transport nicht antreten.\nUrsache: Technischer Defekt (Zustand " + vehicle.condition + ").\nBetroffener Auftrag: " + (order ? order.customer : "—") + "\n\nBitte Massnahmen ergreifen: Ersatzfahrzeug, Miete, Reparatur oder Verschiebung.",
    gameTime: m, category: "operations", priority: "high",
    linkedRefs: { type: "disruption", id: disruption.id },
    dedupKey: "disruption_msg:" + disruption.id,
  });

  return true;
}

// ---------- B) Verzoegerung bei Be-/Entladung ----------
export function maybeGenerateLoadingDelay(state, trip, m, log) {
  if (!canGenerateToday(state, "loading_delay", m)) return false;
  if (!trip || !trip.phases || trip.phases.length === 0) return false;

  let delayPhaseIndex = -1;
  for (let i = 0; i < trip.phases.length; i++) {
    if (trip.phases[i].type === "loading" || trip.phases[i].type === "unloading") {
      delayPhaseIndex = i;
      break;
    }
  }
  if (delayPhaseIndex < 0) return false;

  const dedupKey = "delay:" + trip.id + ":" + delayPhaseIndex;
  if (hasExistingDisruption(state, dedupKey)) return false;

  const loadingRate = applyDisruptionRate(
    DISRUPTION_CONFIG.loadingDelay.baseRate, getEffectiveParams(state)
  );
  if (nextRng(state) > loadingRate) return false;

  const delayMin = DISRUPTION_CONFIG.loadingDelay.minDelayMin
    + Math.floor(nextRng(state) * (DISRUPTION_CONFIG.loadingDelay.maxDelayMin - DISRUPTION_CONFIG.loadingDelay.minDelayMin + 1));

  const phase = trip.phases[delayPhaseIndex];
  phase.endMin += delayMin;
  phase.delayMin = delayMin;
  for (let i = delayPhaseIndex + 1; i < trip.phases.length; i++) {
    trip.phases[i].startMin += delayMin;
    trip.phases[i].endMin += delayMin;
  }
  trip.endMin += delayMin;

  const order = trip.orderId ? (state.orders || []).find(o => o.id === trip.orderId) : null;
  const affectedOrders = trip.orderId ? [trip.orderId] : [];
  const customer = order ? order.customer : "Unbekannt";
  const phaseType = phase.type === "loading" ? "Beladung" : "Entladung";

  const disruption = createDisruption(state, {
    type: "loading_delay",
    cause: phaseType + "-Verzoegerung bei " + customer + ": +" + delayMin + " Min Wartezeit",
    tripId: trip.id,
    tourId: trip.tourId || null,
    vehicleId: trip.vehicleId,
    driverId: trip.driverId,
    orderIds: affectedOrders,
    delayMin,
    dedupKey,
  });

  recordGeneration(state, "loading_delay", m);
  log.push({ type: "disruption_loading_delay", disruption: disruption.id, trip: trip.id, delayMin, atMin: m });

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Stoerung: Ladeverzoegerung",
    body: phaseType + " bei " + customer + " verzoegert um " + delayMin + " Minuten.\nBetroffene Tour endet nun " + formatGameTime(trip.endMin) + ".\n\nMoegliche Reaktionen: Akzeptieren, Folgeeinsaetze umplanen, Kunden informieren.",
    gameTime: m, category: "operations", priority: "normal",
    linkedRefs: { type: "disruption", id: disruption.id },
    dedupKey: "disruption_msg:" + disruption.id,
  });

  return true;
}

// ---------- C) Kurzfristiger Personalausfall ----------
export function generateAbsenceDisruption(state, driverId, m, log) {
  const driver = (state.drivers || []).find(d => d.id === driverId);
  if (!driver) return false;

  const affectedTours = (state.tours || []).filter(t =>
    t.status === "active" &&
    t.driverId === driverId &&
    !t.disruptionId &&
    !t.pauseReason &&
    (t.deployments || []).some(d => d.status === "planned")
  );

  if (affectedTours.length === 0) return false;

  let created = false;
  for (const tour of affectedTours) {
    const dedupKey = "absence:" + driverId + ":" + tour.id;
    if (hasExistingDisruption(state, dedupKey)) continue;

    const affectedOrders = (tour.deployments || [])
      .filter(d => d.orderId && d.status === "planned")
      .map(d => d.orderId);

    const disruption = createDisruption(state, {
      type: "personnel_absence",
      cause: "Fahrer " + driver.name + " durch Krankheit ausgefallen — geplante Tour betroffen",
      driverId: driver.id,
      tourId: tour.id,
      orderIds: affectedOrders,
      branchId: driver.branchId,
      dedupKey,
    });

    tour.disruptionId = disruption.id;
    created = true;
    log.push({ type: "disruption_personnel_absence", disruption: disruption.id, tour: tour.id, driver: driver.id, atMin: m });

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Stoerung: Fahrer ausgefallen",
      body: driver.name + " ist erkrankt und kann die geplante Tour nicht antreten.\nBetroffene Auftraege: " + affectedOrders.length + "\n\nMoegliche Reaktionen: Ersatzfahrer, Fremdpersonal, Tour umplanen oder verschieben.",
      gameTime: m, category: "operations", priority: "high",
      linkedRefs: { type: "disruption", id: disruption.id },
      dedupKey: "disruption_msg:" + disruption.id,
    });
  }
  return created;
}

// ---------- Verarbeitung ----------
export function processDisruptions(state, m, log) {
  const items = state.disruptions?.items || [];
  if (items.length === 0) return;

  for (const d of items) {
    if (d.status === "completed") continue;

    if (d.status === "decision_open") {
      if(d.type==="loading_delay" && !d.customerInformed){
        const orders=(state.orders||[]).filter(o=>d.orderIds?.includes(o.id));
        if(orders.length && orders.every(o=>o.phoneCustomerInformed))d.customerInformed=true;
        else executeOption(state,d,"inform_customer",{},m,log);
        for(const o of orders)o.phoneCustomerInformed=true;
      }
      d.options = computeOptions(state, d, m);
      if (DISRUPTION_CONFIG.autoResolve.enabled) {
        tryAutoResolve(state, d, m, log);
      }
    }

    if (d.status === "measure_running" && d.nextProcessMin && d.nextProcessMin <= m) {
      completeMeasure(state, d, m, log);
    }
  }

  const cutoff = m - 7 * DAY_MIN;
  state.disruptions.items = retainHistory(state, "disruptions", state.disruptions.items, items.filter(d =>
    d.status !== "completed" || (d.completedAtMin || 0) > cutoff
  ), null);
}

export function getRoutineDelayResolver(state,d,m){
    const employee=findResolverEmployee(state,d,m);
    const driver=(state.drivers||[]).find(p=>p.id===d.driverId && isActivelyEmployed(p) && !(p.sickUntil>m) && !["sick","vacation","released"].includes(p.attendance));
    return employee||driver;
}

function tryAutoResolve(state, d, m, log) {
  // Routine ramp delays require no management approval or expenditure.
  if(d.type==="loading_delay" && d.delayMin<=120){
    const resolver=getRoutineDelayResolver(state,d,m);
    if(resolver){
      if(!d.customerInformed)executeOption(state,d,"inform_customer",{},m,log);
      executeOption(state,d,"accept_delay",{},m,log);
      d.autoResolved=true;d.autoResolvedBy=resolver.name;
      d.history.push({type:"auto_resolved",atMin:m,by:resolver.name,option:"accept_delay"});
      log.push({type:"disruption_auto_resolved",disruption:d.id,by:resolver.name,option:"accept_delay",atMin:m});
      return;
    }
  }
  const freeOption = d.options.find(o =>
    o.available && o.costCents === 0 && !o.requiresApproval &&
    ["replace_vehicle", "replace_driver", "replan_tour", "replan_followup"].includes(o.id)
  );
  if (!freeOption) return;

  const resolver = findResolverEmployee(state, d, m);
  if (!resolver) return;

  const authCheck = checkSpendAuthority(state, resolver.id, 0, { branchId: d.branchId });
  if (!authCheck.allowed) return;

  try {
    const result = executeOption(state, d, freeOption.id, {}, m, log);
    if (result.ok) {
      d.autoResolved = true;
      d.autoResolvedBy = resolver.name;
      d.history.push({ type: "auto_resolved", atMin: m, by: resolver.name, option: freeOption.id });
      log.push({ type: "disruption_auto_resolved", disruption: d.id, by: resolver.name, option: freeOption.id, atMin: m });
    }
  } catch (e) {
    // Auto-Auflösung fehlgeschlagen — Spieler muss manuell eingreifen
  }
}

function findResolverEmployee(state, d, m) {
  const candidates = (state.employees || []).filter(e => {
    if (!isActivelyEmployed(e)) return false;
    if (e.attendance !== "present") return false;
    if (!isPersonAvailable(state, e.id, m) || isPersonInTraining(state, e.id, m)) return false;
    if (e.role === 'dispatcher' || e.role === 'dispatcher_senior') {
      if (!['autonomous','dispatch_accepted'].includes(e.workMode)) return false;
      const clock=m%1440,start=e.shiftStart??480,end=e.shiftEnd??960;
      if (!(start<=end ? clock>=start&&clock<end : clock>=start||clock<end)) return false;
    }
    if (!["dispatcher", "dispatcher_senior", "branch_manager", "assistant"].includes(e.role)) return false;
    if (d.branchId && e.assignedBranchId && e.assignedBranchId !== d.branchId) return false;
    return true;
  });
  const priority = { branch_manager: 0, dispatcher_senior: 1, dispatcher: 2, assistant: 3 };
  const rank = e => dispatcherProfile(state, e).lead ? -1 : (priority[e.role] ?? 9);
  candidates.sort((a, b) => rank(a) - rank(b));
  return candidates[0] || null;
}

// ---------- Optionsausfuehrung ----------
function executeOption(state, d, optionId, params, m, log) {
  const tour = d.tourId ? (state.tours || []).find(t => t.id === d.tourId) : null;
  const vehicle = d.vehicleId ? (state.vehicles || []).find(v => v.id === d.vehicleId) : null;
  const driver = d.driverId ? (state.drivers || []).find(dr => dr.id === d.driverId) : null;

  switch (optionId) {
    case "replace_vehicle": {
      if (!tour) throw new Error("Tour nicht gefunden.");
      const replacement = findReplacementVehicle(state, tour, m);
      if (!replacement) throw new Error("Kein Ersatzfahrzeug mehr verfuegbar.");
      if (replacement.status !== "free" || replacement.condition < 20) {
        throw new Error("Ersatzfahrzeug nicht mehr verfuegbar oder einsatzbereit.");
      }
      if (isVehicleReserved(state, replacement.id)) {
        throw new Error("Ersatzfahrzeug bereits fuer andere Stoerung reserviert.");
      }
      tour.vehicleId = replacement.id;
      d.reservedVehicleId = replacement.id;
      tour.disruptionId = null;
      d.status = "completed";
      d.completedAtMin = m;
      d.completionSummary = "Ersatzfahrzeug " + vehicleLabel(replacement) + " zugeordnet. Tour wird fortgesetzt.";
      d.actualCostCents = 0;
      d.actualDelayMin = 0;
      d.history.push({ type: "resolved", atMin: m, option: optionId, result: "replacement_assigned" });
      pushEvent(state, {
        type: "disruption_resolved", gameTime: m, isSystem: false,
        vehicleId: replacement.id,
        details: { disruptionId: d.id, option: optionId, replacementVehicleId: replacement.id },
        dedupKey: "disruption_resolved:" + d.id,
      });
      return { ok: true };
    }

    case "rental_truck": {
      const provider = SERVICE_PROVIDERS.find(p => p.type === "rental_truck");
      if (!provider) throw new Error("Kein Mietanbieter verfuegbar.");
      const blocks = 2;
      const cost = provider.handoverCents + blocks * provider.blockRateCents;
      if (state.company.accountCents < cost) throw new Error("Firmenkonto reicht nicht aus.");
      addBooking(state, m, "Mietfahrzeug: " + provider.name, -cost, "company", "disruption_rental:" + d.id);
      const rentalVehicle = {
        id: uid(state, "v_rent"), branchId: (tour ? tour.branchId : (vehicle ? vehicle.branchId : "b1")) || "b1",
        type: "Miet-Lkw", capacityTons: 12, consumptionPer100km: 30,
        bookValueCents: 0, condition: 90,
        locationCity: vehicle ? vehicle.locationCity : (tour ? tour.startCity : provider.homeCity),
        status: "free", tripId: null, maintenanceUntil: null,
        ownership_type: "rental", odometerKm: 0, acquiredAtMin: m,
        rentalReturnMin: m + blocks * BLOCK_DURATION_MIN,
      };
      state.vehicles.push(rentalVehicle);
      if (tour) {
        tour.vehicleId = rentalVehicle.id;
        tour.disruptionId = null;
      }
      d.status = "completed";
      d.completedAtMin = m;
      d.completionSummary = tour
        ? "Mietfahrzeug " + vehicleLabel(rentalVehicle) + " fuer " + (cost / 100).toFixed(2) + " EUR gebucht. Tour wird fortgesetzt."
        : "Mietfahrzeug " + vehicleLabel(rentalVehicle) + " fuer " + (cost / 100).toFixed(2) + " EUR gebucht. Bitte neuen Transport manuell starten.";
      d.actualCostCents = cost;
      d.appliedCostsCents = cost;
      d.history.push({ type: "resolved", atMin: m, option: optionId, costCents: cost });
      pushEvent(state, {
        type: "disruption_resolved", gameTime: m, isSystem: false,
        details: { disruptionId: d.id, option: optionId, rentalVehicleId: rentalVehicle.id, costCents: cost },
        dedupKey: "disruption_resolved:" + d.id,
      });
      return { ok: true, costCents: cost };
    }

    case "emergency_repair": {
      if (!vehicle) throw new Error("Fahrzeug nicht gefunden.");
      const cost = DISRUPTION_CONFIG.technicalDefect.repairCostCents;
      const duration = DISRUPTION_CONFIG.technicalDefect.repairDurationMin;
      if (state.company.accountCents < cost) throw new Error("Firmenkonto reicht nicht aus.");
      addBooking(state, m, "Notfallreparatur: " + vehicleLabel(vehicle), -cost, "company", "disruption_repair:" + d.id);
      vehicle.status = "maintenance";
      vehicle.maintenanceUntil = m + duration;
      d.status = "measure_running";
      d.nextProcessMin = m + duration;
      d.appliedCostsCents = cost;
      d.history.push({ type: "repair_started", atMin: m, costCents: cost, durationMin: duration });
      return { ok: true, costCents: cost, completionMin: m + duration };
    }

    case "postpone": {
      if (!tour) throw new Error("Tour nicht gefunden.");
      tour.disruptionId = null;
      tour.pauseReason = "Wegen Stoerung verschoben — manuelle Neudisposition erforderlich";
      d.status = "completed";
      d.completedAtMin = m;
      d.completionSummary = "Einsatz verschoben. Auftraege bleiben angenommen, Fristen laufen weiter.";
      d.history.push({ type: "resolved", atMin: m, option: optionId, result: "postponed" });
      pushEvent(state, {
        type: "disruption_resolved", gameTime: m, isSystem: false,
        details: { disruptionId: d.id, option: optionId, result: "postponed" },
        dedupKey: "disruption_resolved:" + d.id,
      });
      return { ok: true };
    }

    case "cancel_tour": {
      if (!tour) throw new Error("Tour nicht gefunden.");
      tour.status = "cancelled";
      tour.pauseReason = "Wegen Stoerung aufgeloest";
      tour.disruptionId = null;
      for (const dep of (tour.deployments || [])) {
        if (dep.status === "planned") dep.status = "cancelled";
      }
      d.status = "completed";
      d.completedAtMin = m;
      d.completionSummary = "Tour aufgeloest. Auftraege bleiben angenommen und koennen neu disponiert werden.";
      d.history.push({ type: "resolved", atMin: m, option: optionId, result: "tour_cancelled" });
      pushEvent(state, {
        type: "disruption_resolved", gameTime: m, isSystem: false,
        details: { disruptionId: d.id, option: optionId, result: "tour_cancelled" },
        dedupKey: "disruption_resolved:" + d.id,
      });
      return { ok: true };
    }

    case "accept_delay": {
      d.status = "completed";
      d.completedAtMin = m;
      d.completionSummary = "Verzoegerung von " + d.delayMin + " Min akzeptiert und in Tour eingerechnet.";
      d.actualDelayMin = d.delayMin;
      d.history.push({ type: "resolved", atMin: m, option: optionId });
      pushEvent(state, {
        type: "disruption_resolved", gameTime: m, isSystem: false,
        details: { disruptionId: d.id, option: optionId, delayMin: d.delayMin },
        dedupKey: "disruption_resolved:" + d.id,
      });
      return { ok: true };
    }

    case "replan_followup": {
      const trip = d.tripId ? (state.trips || []).find(t => t.id === d.tripId) : null;
      const tour2 = trip?.tourId ? (state.tours || []).find(t => t.id === trip.tourId) : null;
      if (tour2) {
        for (const dep of (tour2.deployments || [])) {
          if (dep.status === "planned") dep.status = "cancelled";
        }
        if (tour2.returnDeployment && tour2.returnDeployment.status === "planned") {
          tour2.returnDeployment.status = "cancelled";
        }
        const hasActive = (tour2.deployments || []).some(dep => dep.status === "active");
        if (!hasActive) {
          tour2.status = "cancelled";
          tour2.pauseReason = "Folgeeinsaetze wegen Ladeverzoegerung umgeplant";
        }
      }
      d.status = "completed";
      d.completedAtMin = m;
      d.completionSummary = "Folgeeinsaetze freigegeben. Verzoegerung von " + d.delayMin + " Min im aktuellen Trip verbleibt.";
      d.actualDelayMin = d.delayMin;
      d.history.push({ type: "resolved", atMin: m, option: optionId });
      pushEvent(state, {
        type: "disruption_resolved", gameTime: m, isSystem: false,
        details: { disruptionId: d.id, option: optionId },
        dedupKey: "disruption_resolved:" + d.id,
      });
      return { ok: true };
    }

    case "inform_customer": {
      const order = d.orderIds.length > 0 ? (state.orders || []).find(o => o.id === d.orderIds[0]) : null;
      const customer = order ? order.customer : "Kunde";
      deliverMessage(state, {
        fromId: "system", toId: "player",
        subject: "Kundeninfo: Verzoegerung bei " + customer,
        body: customer + " wurde ueber die Verzoegerung von " + d.delayMin + " Minuten informiert.\n\nHinweis: Diese Information aendert keine Lieferfrist und beseitigt keine tatsaechliche Verspaetung. Eine eventuelle Verspaetung wird nach den regulaeren Kundenbeziehungs-Regeln bewertet.",
        gameTime: m, category: "operations", priority: "normal",
        linkedRefs: { type: "disruption", id: d.id },
        dedupKey: "disruption_inform:" + d.id,
      });
      d.history.push({ type: "customer_informed", atMin: m });
      d.customerInformed = true;
      return { ok: true, informationOnly: true };
    }

    case "replace_driver": {
      if (!tour) throw new Error("Tour nicht gefunden.");
      const replacement = findReplacementDriver(state, tour, m);
      if (!replacement) throw new Error("Kein Ersatzfahrer mehr verfuegbar.");
      if (replacement.status !== "free") throw new Error("Ersatzfahrer nicht mehr frei.");
      if (isDriverReserved(state, replacement.id)) throw new Error("Ersatzfahrer bereits reserviert.");
      tour.driverId = replacement.id;
      d.reservedDriverId = replacement.id;
      tour.disruptionId = null;
      d.status = "completed";
      d.completedAtMin = m;
      d.completionSummary = "Ersatzfahrer " + replacement.name + " zugeordnet. Tour wird fortgesetzt.";
      d.history.push({ type: "resolved", atMin: m, option: optionId, result: "replacement_assigned" });
      pushEvent(state, {
        type: "disruption_resolved", gameTime: m, isSystem: false,
        driverId: replacement.id,
        details: { disruptionId: d.id, option: optionId, replacementDriverId: replacement.id },
        dedupKey: "disruption_resolved:" + d.id,
      });
      return { ok: true };
    }

    case "temp_staff": {
      if (!tour) throw new Error("Tour nicht gefunden.");
      const provider = SERVICE_PROVIDERS.find(p => p.type === "temp_driver");
      if (!provider) throw new Error("Kein Fremdpersonal-Anbieter verfuegbar.");
      const blocks = 2;
      const cost = provider.provisionCents + blocks * provider.blockRateCents;
      if (state.company.accountCents < cost) throw new Error("Firmenkonto reicht nicht aus.");
      addBooking(state, m, "Fremdfahrer: " + provider.name, -cost, "company", "disruption_temp:" + d.id);
      const tempDriver = {
        id: uid(state, "d_temp"), name: "Fremdfahrer (" + provider.name + ")",
        branchId: tour.branchId || "b1", costPerDayCents: 0,
        locationCity: (state.vehicles.find(v => v.id === tour.vehicleId) || {}).locationCity || tour.startCity,
        status: "free", restUntil: null, employedDay: dayOf(m),
        portraitId: null, satisfaction: 70, satisfactionReasons: [],
        employmentStatus: "employed", attendance: "present",
        consecutiveLowSatisfactionDays: 0, isTempStaff: true,
        tempReturnMin: m + blocks * BLOCK_DURATION_MIN,
      };
      state.drivers.push(tempDriver);
      tour.driverId = tempDriver.id;
      tour.disruptionId = null;
      d.status = "completed";
      d.completedAtMin = m;
      d.completionSummary = "Fremdfahrer " + tempDriver.name + " fuer " + (cost / 100).toFixed(2) + " EUR angeheuert. Tour wird fortgesetzt.";
      d.actualCostCents = cost;
      d.appliedCostsCents = cost;
      d.history.push({ type: "resolved", atMin: m, option: optionId, costCents: cost });
      pushEvent(state, {
        type: "disruption_resolved", gameTime: m, isSystem: false,
        details: { disruptionId: d.id, option: optionId, tempDriverId: tempDriver.id, costCents: cost },
        dedupKey: "disruption_resolved:" + d.id,
      });
      return { ok: true, costCents: cost };
    }

    case "replan_tour": {
      if (!tour) throw new Error("Tour nicht gefunden.");
      tour.status = "cancelled";
      tour.pauseReason = "Wegen Personalausfall umgeplant";
      tour.disruptionId = null;
      for (const dep of (tour.deployments || [])) {
        if (dep.status === "planned") dep.status = "cancelled";
      }
      d.status = "completed";
      d.completedAtMin = m;
      d.completionSummary = "Tour umgeplant (aufgeloest). Auftraege bleiben angenommen und koennen neu disponiert werden.";
      d.history.push({ type: "resolved", atMin: m, option: optionId, result: "tour_cancelled" });
      pushEvent(state, {
        type: "disruption_resolved", gameTime: m, isSystem: false,
        details: { disruptionId: d.id, option: optionId, result: "tour_cancelled" },
        dedupKey: "disruption_resolved:" + d.id,
      });
      return { ok: true };
    }

    default:
      throw new Error("Unbekannte Option: " + optionId);
  }
}

function completeMeasure(state, d, m, log) {
  if (d.chosenOptionId === "emergency_repair") {
    const vehicle = (state.vehicles || []).find(v => v.id === d.vehicleId);
    if (vehicle) {
      vehicle.status = "free";
      vehicle.maintenanceUntil = null;
      vehicle.condition = Math.min(100, vehicle.condition + 30);
    }
    const tour = d.tourId ? (state.tours || []).find(t => t.id === d.tourId) : null;
    if (tour) {
      tour.disruptionId = null;
    }
    d.status = "completed";
    d.completedAtMin = m;
    d.completionSummary = "Notfallreparatur abgeschlossen. " + vehicleLabel(vehicle) + " wieder einsatzbereit (Zustand " + (vehicle?.condition || "?") + ").";
    d.actualCostCents = d.appliedCostsCents;
    d.history.push({ type: "measure_completed", atMin: m, result: "repaired" });
    log.push({ type: "disruption_measure_completed", disruption: d.id, atMin: m });
    pushEvent(state, {
      type: "disruption_resolved", gameTime: m, isSystem: true,
      vehicleId: d.vehicleId,
      details: { disruptionId: d.id, option: "emergency_repair", result: "repaired", condition: vehicle?.condition },
      dedupKey: "disruption_resolved:" + d.id,
    });
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Stoerung behoben: Reparatur abgeschlossen",
      body: vehicleLabel(vehicle) + " ist nach Notfallreparatur wieder einsatzbereit.\nKosten: " + (d.appliedCostsCents / 100).toFixed(2) + " EUR\nZustand: " + (vehicle?.condition || "?") + "/100\nDie pausierte Tour kann nun fortgesetzt werden.",
      gameTime: m, category: "operations", priority: "normal",
      linkedRefs: { type: "disruption", id: d.id },
      dedupKey: "disruption_complete_msg:" + d.id,
    });
  }
}

// ---------- Aufloesung durch Spieler ----------
export function validateDisruptionResolution(state, disruptionId, optionId, params = {}) {
  const d = (state.disruptions?.items || []).find(x => x.id === disruptionId);
  // Executing a decision always recomputes from the current state.
  return validateResolution(state, d, optionId, params);
}

// Private prepared options are only used inside the read-only batch below.
function validateResolution(state, d, optionId, params, preparedOptions = null) {
  if (!d) throw new Error("Stoerung nicht gefunden.");
  if (d.status !== "decision_open") throw new Error("Stoerung ist nicht mehr offen.");
  const option = (d.options || []).find(o => o.id === optionId);
  if (!option) throw new Error("Option nicht gefunden.");
  if (!option.available) throw new Error("Option nicht verfuegbar: " + (option.unavailableReason || ""));

  const options = preparedOptions || computeOptions(state, d, state.gameTime);
  const refreshed = options.find(o => o.id === optionId);
  if (!refreshed || !refreshed.available) {
    throw new Error("Option nicht mehr verfuegbar: " + (refreshed?.unavailableReason || "Ressource nicht mehr verfuegbar."));
  }

  if(params?.phoneQuote && (params.phoneQuote.cost!==refreshed.costCents || params.phoneQuote.duration!==refreshed.estimatedDurationMin || params.phoneQuote.description!==refreshed.description)) throw new Error("Die Maßnahme hat sich geändert. Bitte den aktuellen Vorschlag erneut prüfen und bestätigen.");

  if (refreshed.costCents > 0) {
    if (state.company.accountCents < refreshed.costCents) {
      throw new Error("Firmenkonto reicht fuer diese Massnahme nicht aus.");
    }
  }

  const tour = (state.tours || []).find(t => t.id === d.tourId);
  if (["replace_vehicle","replace_driver","temp_staff","postpone","cancel_tour","replan_tour"].includes(optionId) && !tour) throw new Error("Tour nicht gefunden.");
  if (optionId === "emergency_repair" && !(state.vehicles || []).some(v => v.id === d.vehicleId)) throw new Error("Fahrzeug nicht gefunden.");
  if (optionId === "replace_vehicle") {
    const replacement = findReplacementVehicle(state, tour, state.gameTime);
    if (!replacement || replacement.status !== "free" || replacement.condition < 20 || isVehicleReserved(state, replacement.id)) throw new Error("Kein Ersatzfahrzeug mehr verfuegbar.");
  }
  if (optionId === "replace_driver") {
    const replacement = findReplacementDriver(state, tour, state.gameTime);
    if (!replacement || replacement.status !== "free" || isDriverReserved(state, replacement.id)) throw new Error("Kein Ersatzfahrer mehr verfuegbar.");
  }
  if (optionId === "rental_truck" || optionId === "temp_staff") {
    const provider = SERVICE_PROVIDERS.find(p => p.type === (optionId === "rental_truck" ? "rental_truck" : "temp_driver"));
    if (!provider) throw new Error("Kein Anbieter verfuegbar.");
    const cost = (optionId === "rental_truck" ? provider.handoverCents : provider.provisionCents) + 2 * provider.blockRateCents;
    if (state.company.accountCents < cost) throw new Error("Firmenkonto reicht nicht aus.");
  }
  if (!["replace_vehicle","rental_truck","emergency_repair","postpone","cancel_tour","accept_delay","replan_followup","inform_customer","replace_driver","temp_staff","replan_tour"].includes(optionId)) throw new Error("Unbekannte Option: " + optionId);
  return { d, refreshed, options };
}

// A phone proposal query is synchronous and read-only. Compute the full set
// once, then apply the same validation to each option. Nothing survives this call.
export function getValidatedDisruptionOptions(state, disruptionId) {
  const d = (state.disruptions?.items || []).find(x => x.id === disruptionId);
  if (!d || d.status !== "decision_open") return [];
  const options = computeOptions(state, d, state.gameTime);
  return options.filter(o => {
    if (!o.available || o.id === "inform_customer" || (o.costCents || 0) > state.company.accountCents) return false;
    try { validateResolution(state, d, o.id, {}, options); return true; }
    catch { return false; }
  });
}

export function resolveDisruption(state, disruptionId, optionId, params) {
  const { d, refreshed, options } = validateDisruptionResolution(state, disruptionId, optionId, params);
  d.options = options;
  const log = [];
  const result = executeOption(state, d, optionId, params || {}, state.gameTime, log);
  d.chosenOptionId = optionId;
  d.chosenAtMin = state.gameTime;
  deliverMessage(state, {
    fromId: "system", toId: "player", subject: "Gesprächsnotiz: " + refreshed.label,
    body: (result.informationOnly ? "Der Kunde wurde informiert. Die Lieferfrist bleibt unverändert." : d.completionSummary || "Maßnahme beauftragt: " + refreshed.label) +
      "\n\nKosten der gewählten Maßnahme: " + ((result.costCents || 0) / 100).toFixed(2) + " EUR." +
      (d.nextProcessMin && d.status === "measure_running" ? "\nDie Maßnahme läuft bis Spielminute " + d.nextProcessMin + "." : ""),
    gameTime: state.gameTime, category: "operations", priority: "normal",
    linkedRefs: { type: "disruption", id: d.id },
    dedupKey: "disruption_note:" + d.id + ":" + optionId,
  });
  return { ok: true, ...result, disruptionId, events: log };
}

// ---------- Abfragen ----------
export function getActiveDisruptions(state) {
  return (state.disruptions?.items || [])
    .filter(d => d.status !== "completed")
    .sort((a, b) => a.createdAtMin - b.createdAtMin);
}

export function getDisruptionOverview(state) {
  const items = state.disruptions?.items || [];
  const active = items.filter(d => d.status !== "completed");
  const open = active.filter(d => d.status === "decision_open");
  const running = active.filter(d => d.status === "measure_running");
  return {
    total: items.length,
    activeCount: active.length,
    openCount: open.length,
    runningCount: running.length,
    hasActive: active.length > 0,
  };
}

export function getDisruptionDetail(state, disruptionId) {
  const d = (state.disruptions?.items || []).find(x => x.id === disruptionId);
  if (!d) return null;
  const options = computeOptions(state, d, state.gameTime).filter(o=>o.id!=="inform_customer");
  const tour = d.tourId ? (state.tours || []).find(t => t.id === d.tourId) : null;
  const vehicle = d.vehicleId ? (state.vehicles || []).find(v => v.id === d.vehicleId) : null;
  const driver = d.driverId ? (state.drivers || []).find(dr => dr.id === d.driverId) : null;
  const orders = (d.orderIds || [])
    .map(id => (state.orders || []).find(o => o.id === id))
    .filter(Boolean)
    .map(o => ({
      id: o.id, customer: o.customer, fromCity: o.fromCity, toCity: o.toCity,
      cargo: o.cargo, tons: o.tons, status: o.status,
      deliveryDeadlineMin: o.deliveryDeadlineMin,
      deadlineBufferMin: o.deliveryDeadlineMin - state.gameTime,
    }));
  return {
    id: d.id,
    type: d.type,
    cause: d.cause,
    status: d.status,
    createdAtMin: d.createdAtMin,
    completedAtMin: d.completedAtMin,
    completionSummary: d.completionSummary,
    actualDelayMin: d.actualDelayMin,
    actualCostCents: d.actualCostCents,
    autoResolved: d.autoResolved,
    autoResolvedBy: d.autoResolvedBy,
    vehicleLabel: vehicle ? vehicleLabel(vehicle) : null,
    vehicleCondition: vehicle?.condition || null,
    driverName: driver?.name || null,
    tourId: d.tourId,
    orderIds: d.orderIds,
    orders,
    delayMin: d.delayMin,
    options,
    chosenOptionId: d.chosenOptionId,
    history: d.history,
    nextProcessMin: d.nextProcessMin,
  };
}

// ---------- Ereignis-Zeiten fuer earliestEventAfter ----------
export function getDisruptionEventTimes(state, t, maxMin) {
  const times = [];
  for (const d of (state.disruptions?.items || [])) {
    if (d.status === "measure_running" && d.nextProcessMin && d.nextProcessMin > t && d.nextProcessMin <= maxMin) {
      times.push(d.nextProcessMin);
    }
  }
  return times;
}

// ---------- Befehls-Handler ----------
export function handleDisruptionCommand(state, command, p) {
  switch (command) {
    case "getDisruptions":
      return { ok: true, disruptions: getActiveDisruptions(state), overview: getDisruptionOverview(state) };
    case "getDisruptionDetail":
      return { ok: true, detail: getDisruptionDetail(state, p.disruptionId) };
    case "resolveDisruption":
      return resolveDisruption(state, p.disruptionId, p.optionId, p.params);
    default:
      return null;
  }
}
