import { preserveHistory } from "./historyRetention.ts";
import { findOrder, planningOrdersFor } from "./orderLookup.ts";
// Tourenketten-Engine für FERNWERK.
// Planung, Validierung, Bestätigung und automatische Ausführung von
// Mehrfachauftrags-Ketten mit Erholung, Leerfahrten und Fristen.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.

import {
  CITIES, getDistance, driveMinutes, fuelCents, tollCents, roundCents,
  LOAD_MIN, UNLOAD_MIN, MAX_DUTY_MIN, REST_MIN, WORK_BUDGET_MIN, formatGameTime,
  checkBodyTypeCompatibility, computeBodyBonusFactor,
} from "./gameRules.ts";
import {
  buildPhases, buildWorkSteps, buildEmptyWorkSteps,
  computeFinalCounters, resetCounters, needsRest,
} from "./driverTimeEngine.ts";
import {
  getDgProfile, getEffectiveLoadMin, getEffectiveUnloadMin,
  validateDgTransport, isTankClean, chargeDgHandlingFee,
} from "./dangerousGoodsEngine.ts";
import { maybeGenerateTechnicalDefect, maybeGenerateLoadingDelay } from "./disruptionEngine.ts";
import { addBooking } from "./accountingEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { isPersonInTraining, BLOCK_MIN as TRAINING_BLOCK_MIN, REST_AFTER_BLOCK_MIN } from "./trainingEngine.ts";

// ---------- Hilfsfunktionen ----------

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Planungs-Cache: wird zu Beginn von suggestTours und applyCommand geleert.
// Reduziert redundante earliestAvailable/futureLocation/nextReservationStart
// Aufrufe innerhalb einer suggestTours-Suche (dieselben Fahrzeug/Fahrer-Paare
// liefern identische Ergebnisse, da der Zustand sich nicht ändert).
let _planCache = new Map();
type PlanningResources = { vehicles: Map<any, any>, drivers: Map<any, any>, tours: any[], trips: Map<any, any>, driverTrips: Map<any, any>, committed: Set<any> };
const validationResources = new WeakMap<object, PlanningResources>();
function planningResources(state): PlanningResources {
  const trips = new Map(), driverTrips = new Map();
  for (const trip of state.trips || []) {
    if (!trips.has(trip.id)) trips.set(trip.id, trip);
    if (trip.status === "in_progress" && !driverTrips.has(trip.driverId)) driverTrips.set(trip.driverId, trip);
  }
  const tours = (state.tours || []).filter(t => t.status === "active" || t.status === "planned");
  const committed = new Set();
  for (const tour of tours) if (hasPendingDeployment(tour)) {
    committed.add(tour.vehicleId); committed.add(tour.driverId);
  }
  return { vehicles: new Map(state.vehicles.map(v => [v.id, v])),
    drivers: new Map(state.drivers.map(d => [d.id, d])), trips, driverTrips,
    tours, committed };
}
function hasPendingDeployment(tour) {
  return (tour.deployments || []).some(d => d.status === "planned") || tour.returnDeployment?.status === "planned";
}
// A promised follow-up reserves both people and vehicle, including waiting
// and rest before departure. Do not steal either resource for another route.
export function hasPendingTour(state, resourceId) {
  const context = validationResources.get(state);
  if (context) return context.committed.has(resourceId);
  return (state.tours || []).some(t => (t.status === "active" || t.status === "planned") &&
    (t.vehicleId === resourceId || t.driverId === resourceId) && hasPendingDeployment(t));
}
function planningTours(state) { return validationResources.get(state)?.tours || state.tours || []; }
function tripById(state, id) { const context = validationResources.get(state); return context ? context.trips.get(id) : state.trips.find(t => t.id === id); }
function driverTrip(state, id) { const context = validationResources.get(state); return context ? context.driverTrips.get(id) : state.trips.find(t => t.driverId === id && t.status === "in_progress"); }

export function _clearPlanCache() { _planCache.clear(); }
function _cached(key, fn) {
  if (_planCache.has(key)) return _planCache.get(key);
  const v = fn();
  _planCache.set(key, v);
  return v;
}

// Lookup-Maps für O(1) Zugriff auf Fahrzeuge, Fahrer und Aufträge.
// Werden von suggestTours einmal pro Aufruf aufgebaut (buildLookupMaps) und
// von buildTourPlan genutzt, wenn verfügbar. Eliminiert O(n) .find()-Aufrufe
// bei 192K+ buildTourPlan-Aufrufen pro Tagesvorlauf.
function _vehicleById(state, id) {
  if (validationResources.has(state)) return validationResources.get(state)!.vehicles.get(id);
  if (state._vehicleMap) return state._vehicleMap.get(id);
  return state.vehicles.find(v => v.id === id);
}
function _driverById(state, id) {
  if (validationResources.has(state)) return validationResources.get(state)!.drivers.get(id);
  if (state._driverMap) return state._driverMap.get(id);
  return state.drivers.find(d => d.id === id);
}
function _orderById(state, id) {
  if (state._orderMap) return state._orderMap.get(id);
  return findOrder(state, id);
}

// Prüft, ob ein Fahrer/Fahrzeug-Paar für ein gegebenes Intervall frei ist.
// Berücksichtigt bestehende Trips, Touren und Erholung.
export function isResourceFree(state, resource, fromMin, toMin) {
  if (resource.status === "on_trip" || resource.status === "maintenance") return false;
  if (resource.status === "resting" && resource.restUntil !== null && resource.restUntil > fromMin) return false;
  // Prüfe Vorausplanungen: Eine geplanter Einsatz blockiert das Intervall,
  // wenn die neue Nutzung [fromMin, toMin] bis zum Einsatz-Start reicht.
  // Pausierte Touren blockieren nicht.
  for (const tour of planningTours(state)) {
    if (tour.status !== "active" && tour.status !== "planned") continue;
    if (tour.pauseReason) continue;
    if (tour.vehicleId !== resource.id && tour.driverId !== resource.id) continue;
    for (const dep of (tour.deployments || [])) {
      if (dep.status !== "planned") continue;
      if (dep.startMin <= state.gameTime) continue; // Vergangenheit
      if (toMin > dep.startMin) return false; // Neue Nutzung überschneidet sich
    }
  }
  return true;
}

// Frühester verfügbarer Zeitpunkt für ein Fahrzeug/Fahrer-Paar.
// Gibt die aktuelle Spielzeit zurück, wenn Fahrzeug/Fahrer frei sind.
// Vorausplanungen (Touren mit geplanten Einsätzen in der Zukunft) blockieren
// NICHT die Verfügbarkeit — stattdessen prüft buildTourPlan über
// nextReservationStart, ob eine neue Tour vor der Vorausplanung endet.
export function earliestAvailable(state, vehicle, driver) {
  let t = state.gameTime;
  if (vehicle.status === "on_trip") {
    const trip = tripById(state, vehicle.tripId);
    if (trip) t = Math.max(t, trip.endMin);
  }
  if (vehicle.status === "maintenance" && vehicle.maintenanceUntil) {
    t = Math.max(t, vehicle.maintenanceUntil);
  }
  if (driver.status === "resting" && driver.restUntil) {
    t = Math.max(t, driver.restUntil);
  }
  if (driver.status === "on_trip") {
    const trip = driverTrip(state, driver.id);
    if (trip) t = Math.max(t, trip.endMin);
  }
  return t;
}

// Nächste Vorausplanung: frühester Start eines geplanten Einsatzes in einer
// aktiven Tour für dieses Fahrzeug/diesen Fahrer. Eine neue Tour muss vor
// diesem Zeitpunkt enden, sonst überschneidet sie sich mit der Vorausplanung.
// Gibt null zurück, wenn keine Vorausplanung existiert.
export function nextReservationStart(state, vehicle, driver) {
  let earliest = null;
  for (const tour of planningTours(state)) {
    if (tour.status !== "active" && tour.status !== "planned") continue;
    if (tour.pauseReason) continue;
    if (tour.vehicleId !== vehicle.id && tour.driverId !== driver.id) continue;
    for (const dep of (tour.deployments || [])) {
      if (dep.status !== "planned") continue;
      if (dep.startMin <= state.gameTime) continue; // Bereits in der Vergangenheit
      if (earliest === null || dep.startMin < earliest) earliest = dep.startMin;
    }
  }
  return earliest;
}

// Ermittelt den Ort nach Abschluss der laufenden Fahrt. Noch nicht
// gestartete Folgeeinsätze reservieren Ressourcen, ersetzen aber keinen Ort. Für 24/7-Vorausplanung: wenn ein Lkw auf Tour ist,
// ist vehicle.locationCity noch die Startstadt — wir brauchen aber
// die Stadt, an der das Fahrzeug nach Tourende steht.
export function futureLocation(state, vehicle) {
  // 1. Aktiver Trip: Endstadt aus Phasen ableiten
  if (vehicle.status === "on_trip" && vehicle.tripId) {
    const trip = tripById(state, vehicle.tripId);
    if (trip && trip.phases) {
      for (let i = trip.phases.length - 1; i >= 0; i--) {
        const p = trip.phases[i];
        if (p.type === "empty_drive" || p.type === "loaded_drive") return p.toCity;
      }
    }
  }
  // A future reservation is not a completed movement.

  return vehicle.locationCity;
}

// Ermittelt die zukünftige Stadt eines Fahrers nach Abschluss aller
// laufenden Touren. Entspricht futureLocation für Fahrzeuge.
export function futureDriverLocation(state, driver) {
  if (driver.status === "on_trip") {
    const trip = driverTrip(state, driver.id);
    if (trip && trip.phases) {
      for (let i = trip.phases.length - 1; i >= 0; i--) {
        const p = trip.phases[i];
        if (p.type === "empty_drive" || p.type === "loaded_drive") return p.toCity;
      }
    }
  }

  return driver.locationCity;
}

// ---------- Deployment-Planung ----------

// Plant einen einzelnen Einsatz mit phasenbasierter Fahrerzeitplanung.
// Zerlegt Leerfahrt → Laden → Fahren → Entladen in Abschnitte mit Pausen/Ruhe.
// counters: {workMin, driveMin} — aktuelle Fahrerzähler (werden fortgeschrieben).
export function buildDeployment(state, order, vehicle, startCity, earliestStart, counters) {
  // DG: erweiterte Lade-/Entladezeiten verwenden (Auftrag 32)
  const workSteps = buildWorkSteps(startCity, order);
  if (order.isDangerousGoods) {
    const loadMin = getEffectiveLoadMin(order);
    const unloadMin = getEffectiveUnloadMin(order);
    for (const s of workSteps) {
      if (s.type === "loading") s.durationMin = loadMin;
      if (s.type === "unloading") s.durationMin = unloadMin;
    }
  }
  const result = buildPhases(workSteps, counters || { workMin: 0, driveMin: 0 }, earliestStart);

  const totalKm = workSteps.reduce((s, step) => s + (step.distanceKm || 0), 0);
  const emptyKm = startCity !== order.fromCity ? getDistance(startCity, order.fromCity) : 0;
  const loadedKm = getDistance(order.fromCity, order.toCity);
  const fuel = fuelCents(totalKm, vehicle.consumptionPer100km);
  const toll = tollCents(totalKm);

  // Aufbau-Bonus: passender Spezial-Lkw erhält höhere Vergütung.
  const bodyBonusFactor = computeBodyBonusFactor(order, vehicle);
  const adjustedPayment = Math.round(order.paymentCents * bodyBonusFactor);

  return {
    orderId: order.id,
    orderStatus: order.status,
    customer: order.customer,
    cargo: order.cargo,
    tons: order.tons,
    fromCity: order.fromCity,
    toCity: order.toCity,
    emptyFromCity: startCity !== order.fromCity ? startCity : null,
    phases: result.phases,
    emptyKm,
    loadedKm,
    totalKm,
    durationMin: result.endMin - earliestStart,
    startMin: earliestStart,
    endMin: result.endMin,
    finalWorkMin: result.finalWorkMin,
    finalDriveMin: result.finalDriveMin,
    fuelCents: fuel,
    tollCents: toll,
    variableCostCents: fuel + toll,
    paymentCents: adjustedPayment,
    bodyBonusFactor,
    contributionCents: adjustedPayment - fuel - toll,
    deliveryDeadlineMin: order.deliveryDeadlineMin,
    deadlineBufferMin: order.deliveryDeadlineMin - result.endMin,
  };
}

// Plant eine Leerfahrt als eigenen Einsatz mit phasenbasierter Fahrerzeitplanung.
export function buildEmptyDeployment(state, fromCity, toCity, vehicle, earliestStart, counters) {
  const workSteps = buildEmptyWorkSteps(fromCity, toCity);
  const result = buildPhases(workSteps, counters || { workMin: 0, driveMin: 0 }, earliestStart);
  const d = getDistance(fromCity, toCity);
  const fuel = fuelCents(d, vehicle.consumptionPer100km);
  const toll = tollCents(d);
  return {
    orderId: null,
    orderStatus: null,
    customer: "Leerfahrt",
    cargo: null,
    tons: 0,
    fromCity,
    toCity,
    emptyFromCity: fromCity,
    phases: result.phases,
    emptyKm: d,
    loadedKm: 0,
    totalKm: d,
    durationMin: result.endMin - earliestStart,
    startMin: earliestStart,
    endMin: result.endMin,
    finalWorkMin: result.finalWorkMin,
    finalDriveMin: result.finalDriveMin,
    fuelCents: fuel,
    tollCents: toll,
    variableCostCents: fuel + toll,
    paymentCents: 0,
    contributionCents: -(fuel + toll),
    deliveryDeadlineMin: null,
    deadlineBufferMin: null,
  };
}

// Nur während einer unveränderlichen Tourensuche zwischenspeichern.
function planningDriverCounters(state, driver) {
  const calculate = () => {
    // Vorschauen ändern den Zustand nicht. Nur dokumentierte Ruhe setzt
    // Zähler zurück; fehlendes freeSinceMin ist kein Nachweis für 12h Ruhe.
    const rested = driver.status === "resting" || (driver.status === "free" &&
      driver.freeSinceMin != null && state.gameTime - driver.freeSinceMin >= REST_MIN);
    let initCounters = { workMin: rested ? 0 : (driver.workMinutesSinceRest || 0),
      driveMin: rested ? 0 : (driver.driveMinutesSinceBreak || 0) };
    if (driver.status === "on_trip") {
      const trip = driverTrip(state, driver.id);
      if (trip) initCounters = computeFinalCounters(trip.phases || [], trip.initialCounters || initCounters);
    }

    return initCounters;
  };
  return state._driverMap ? _cached("counters:" + driver.id, calculate) : calculate();
}

// ---------- Tourenplanung ----------

// Plant eine komplette Tourenkette aus geordneten Auftrags-IDs.
// deployments: Array von { orderId } in Ausführungsreihenfolge.
// Optional: emptyDeployments (Leerfahrten) zwischen Aufträgen.
export function buildTourPlan(state, opts) {
  const { vehicleId, driverId, orderIds, desiredEndCity, latestReturnMin, minStartTime } = opts;
  const vehicle = _vehicleById(state, vehicleId);
  const driver = _driverById(state, driverId);
  if (!vehicle || !driver) return { ok: false as const, error: "Fahrzeug oder Fahrer nicht gefunden." };
  if (hasPendingTour(state, vehicleId) || hasPendingTour(state, driverId)) {
    return { ok: false as const, error: "Fahrzeug oder Fahrer ist bereits für einen zugesagten Folgeeinsatz reserviert." };
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0 || new Set(orderIds).size !== orderIds.length) {
    return { ok: false as const, error: "Eine Tour benötigt eindeutige Aufträge." };
  }

  // Prüfe Grundvoraussetzungen
  // Für Vorausplanung: Wenn Fahrzeug/Fahrer auf Tour sind, vergleiche
  // die zukünftigen Städte (wo sie nach Tourende stehen), nicht die
  // aktuellen locationCity-Werte (die noch die Startstadt zeigen).
  const vehicleFutureCity = _cached("futV:" + vehicleId, () => futureLocation(state, vehicle));
  const driverFutureCity = _cached("futD:" + driverId, () => futureDriverLocation(state, driver));
  // Fahrer-Repositionierung: Wenn Fahrer und Lkw an verschiedenen Orten sind,
  // reist der Fahrer per Bahn/Bus zum Fahrzeug. Das kostet Zeit (driveMinutes),
  // aber keinen Kraftstoff/Maut. Dadurch können stillstehende Lkw an entfernten
  // Orten von freien Fahrern vom Hauptsitz genutzt werden.
  let driverTravelMin = 0;
  if (vehicleFutureCity !== driverFutureCity) {
    return { ok: false as const, error: "Fahrer und Lkw sind an verschiedenen Orten. Bitte zuerst eine Fahrerreise planen." };
  }

  const _calcStart = _cached("ea:" + vehicleId + "|" + driverId, () => earliestAvailable(state, vehicle, driver)) + driverTravelMin;
  const earliestStart = minStartTime ? Math.max(_calcStart, minStartTime) : _calcStart;
  let currentCity = vehicleFutureCity;
  let t = earliestStart;
  const deployments = [];
  const acceptedOrderIds = [];
  let totalKm = 0, emptyKm = 0, loadedKm = 0;
  let totalFuel = 0, totalToll = 0, totalPayment = 0;
  let minBuffer = Infinity;

  // Fahrerzähler über alle Einsätze hinweg fortführen
  // Planungslogik als lokale Funktion: erlaubt Neu-Planung mit
  // Ruhe-voraus-Strategie, wenn die erste Planung eine Ruhezeit mitten in
  // der Tour erfordert (was alle Lieferfristen sprengt).
  function _tryPlan(planStart, initCounters) {
    let currentCity = vehicleFutureCity;
    let t = planStart;
    const deployments = [];
    const acceptedOrderIds = [];
    let totalKm = 0, emptyKm = 0, loadedKm = 0;
    let totalFuel = 0, totalToll = 0, totalPayment = 0;
    let minBuffer = Infinity;
    let counters = { ...initCounters };

    for (const orderId of orderIds) {
      const order = _orderById(state, orderId);
      if (!order) return { ok: false as const, error: "Auftrag nicht gefunden: " + orderId };
      if (order.status !== "offered" && order.status !== "angenommen") {
        return { ok: false as const, error: "Auftrag " + order.customer + " ist nicht verfügbar (Status: " + order.status + ")." };
      }
      if (order.tons > vehicle.capacityTons) {
        return { ok: false as const, error: "Überladung: " + order.tons + " t überschreiten Kapazität von " + vehicle.capacityTons + " t." };
      }
      // Aufbau-Kompatibilität: strikte Frachtarten erfordern passenden Aufbau.
      const bodyCheck = checkBodyTypeCompatibility(order, vehicle);
      if (!bodyCheck.ok) return { ok: false as const, error: bodyCheck.error };
      const dep = buildDeployment(state, order, vehicle, currentCity, t, counters);
      if (order.windowVersion >= 2 && dep.phases.find(p => p.type === "loading")?.startMin > order.latestLoadStartMin) {
        return { ok: false as const, error: "Ladefenster von " + order.customer + " wird überschritten." };
      }
      // Spätlieferung-Toleranz: 4h Gnadenfrist. completeTrip zahlt 90% bei
      // Spätlieferung — buildTourPlan soll daher leichte Überschreitungen
      // zulassen, damit der Disponent knappe Aufträge noch retten kann,
      // statt sie aufzugeben (was zu überfälligen Aufträgen führt).
      const LATE_GRACE_MIN = 240;
      if (dep.endMin > order.deliveryDeadlineMin + LATE_GRACE_MIN) {
        return { ok: false as const, error: "Lieferung von " + order.customer + " würde die Lieferfrist überschreiten (Ankunft " + formatGameTime(dep.endMin) + ", Frist " + formatGameTime(order.deliveryDeadlineMin) + ")." };
      }
      if (order.status === "offered" && order.acceptDeadlineMin <= state.gameTime) {
        return { ok: false as const, error: "Annahmefrist für " + order.customer + " ist abgelaufen." };
      }
      if (order.status === "offered") acceptedOrderIds.push(orderId);
      deployments.push(dep);
      totalKm += dep.totalKm; emptyKm += dep.emptyKm; loadedKm += dep.loadedKm;
      totalFuel += dep.fuelCents; totalToll += dep.tollCents; totalPayment += dep.paymentCents;
      if (dep.deadlineBufferMin !== null && dep.deadlineBufferMin < minBuffer) minBuffer = dep.deadlineBufferMin;
      currentCity = order.toCity;
      counters = { workMin: dep.finalWorkMin, driveMin: dep.finalDriveMin };
      t = dep.endMin;
    }

    let returnDeployment = null;
    if (desiredEndCity && currentCity !== desiredEndCity) {
      const dep = buildEmptyDeployment(state, currentCity, desiredEndCity, vehicle, t, counters);
      returnDeployment = dep;
      totalKm += dep.totalKm; emptyKm += dep.emptyKm;
      totalFuel += dep.fuelCents; totalToll += dep.tollCents;
      counters = { workMin: dep.finalWorkMin, driveMin: dep.finalDriveMin };
      t = dep.endMin;
    }

    const lastDeliveryEnd = deployments.length > 0 ? deployments[deployments.length - 1].endMin : planStart;
    const tourEndMin = returnDeployment ? returnDeployment.endMin : lastDeliveryEnd;
    if ((Number.isFinite(vehicle.rentalReturnMin) && tourEndMin > vehicle.rentalReturnMin) ||
        (driver.isTempStaff && Number.isFinite(driver.tempReturnMin) && tourEndMin > driver.tempReturnMin)) {
      return { ok: false as const, error: "Tour endet nach Ablauf der Miete oder Personalvertretung." };
    }
    let driverFreeMin = t;
    if (counters.workMin >= WORK_BUDGET_MIN) driverFreeMin = t + REST_MIN;
    if (latestReturnMin && tourEndMin > latestReturnMin) {
      return { ok: false as const, error: "Tour endet zu spät (" + formatGameTime(tourEndMin) + "), späteste Rückkehr " + formatGameTime(latestReturnMin) + "." };
    }
    // Konfliktprüfung mit Vorausplanung: Die neue Tour muss enden (inkl.
    // evtl. Ruhezeit), bevor die nächste geplante Einsatz-Reservierung
    // beginnt. Verhindert Doppelbuchung bei 24/7-Vorausplanung.
    const reservationStart = _cached("nrs:" + vehicleId + "|" + driverId, () => nextReservationStart(state, vehicle, driver));
    if (reservationStart !== null && driverFreeMin > reservationStart) {
      return { ok: false as const, error: "Tour überschneidet sich mit Vorausplanung (Tour endet " + formatGameTime(driverFreeMin) + ", nächste Reservierung startet " + formatGameTime(reservationStart) + ")." };
    }
    const liquidityCheck = checkTourLiquidity(state, deployments, returnDeployment, planStart);
    if (!liquidityCheck.ok) return { ok: false as const, error: "Liquidität reicht nicht: " + liquidityCheck.reason };
    const hasMidTourRest = deployments.some(d => (d.phases || []).some(p => p.type === "daily_rest"));
    return {
      ok: true as const, hasMidTourRest,
      deployments, returnDeployment, acceptedOrderIds,
      totalKm, emptyKm, loadedKm,
      totalFuelCents: totalFuel, totalTollCents: totalToll,
      totalVariableCostCents: totalFuel + totalToll,
      totalPaymentCents: totalPayment,
      totalContributionCents: totalPayment - totalFuel - totalToll,
      earliestStartMin: planStart,
      lastDeliveryEndMin: lastDeliveryEnd,
      tourEndMin, driverFreeMin,
      minDeadlineBufferMin: minBuffer === Infinity ? null : minBuffer,
      reservedUntil: driverFreeMin,
    };
  }

  const initCounters = planningDriverCounters(state, driver);

  // Erster Versuch: mit aktuellen Fahrer-Zählern planen.
  let planResult = _tryPlan(earliestStart, initCounters);

  // Ruhe-voraus-Strategie: Wenn der Fahrer bereits Arbeitszeit angesammelt hat,
  // kann die erste Planung entweder (a) eine mid-tour-Ruhe einbauen (was alle
  // Lieferfristen sprengt) oder (b) direkt an einer Frist scheitern, weil die
  // mid-tour-Ruhe die Ankunft zu spät macht. In beiden Fällen: Fahrer ruht
  // zuerst (720 Min), dann startet die Tour mit frischen Zählern. Advance-
  // Aufträge mit späteren Lieferfristen können so noch pünktlich geliefert werden.
  const needsRestFirst = initCounters.workMin > 0 && (
    planResult.error || (planResult.ok && planResult.hasMidTourRest)
  );
  if (needsRestFirst) {
    const restFirstResult = _tryPlan(earliestStart + REST_MIN, { workMin: 0, driveMin: 0 });
    if (restFirstResult.ok) planResult = restFirstResult;
  }

  if (!planResult.ok) return { ok: false as const, error: planResult.error };

  // planResult gehört ausschließlich diesem Aufruf. Direkt ergänzen statt
  // für jeden Suchkandidaten ein großes zweites Objekt anzulegen.
  return Object.assign(planResult, {
    ok: true as const,
    vehicleId, driverId,
    startCity: vehicle.locationCity,
    desiredEndCity: desiredEndCity || null,
    latestReturnMin: latestReturnMin || null,
    driverTravelMin,
    driverTravelFromCity: driverTravelMin > 0 ? driverFutureCity : null,
  });
}

// Simuliert den Firmenkontoverlauf für eine Tour.
// Prüft, ob zu jedem Kostenzeitpunkt genug Geld vorhanden ist.
export function checkTourLiquidity(state, deployments, returnDeployment, startMin) {
  let balance = state.company.accountCents;
  // Abzieh: bekannte offene Kosten
  const openCompany = state.openCosts.filter(o => o.account === "company").reduce((s, o) => s + o.amountCents, 0);
  balance -= openCompany;

  // Sammle alle Zeitpunkte chronologisch
  const events = [];
  for (const dep of deployments) {
    events.push({ min: dep.startMin, type: "cost", amount: dep.fuelCents + dep.tollCents, label: "Einsatz " + (dep.customer || "Leer") });
    events.push({ min: dep.endMin, type: "income", amount: dep.paymentCents, label: "Vergütung " + (dep.customer || "") });
  }
  if (returnDeployment) {
    events.push({ min: returnDeployment.startMin, type: "cost", amount: returnDeployment.fuelCents + returnDeployment.tollCents, label: "Rückkehr" });
  }
  // Bekannte zukünftige Tageskosten (vereinfacht: pro Tag bis Tour-Ende)
  const tourEnd = returnDeployment ? returnDeployment.endMin : (deployments.length > 0 ? deployments[deployments.length - 1].endMin : startMin);
  const startDay = Math.floor(startMin / 1440);
  const endDay = Math.floor(tourEnd / 1440);
  const dailyCosts = (state.drivers.length * 10000 + state.branches.length * 10000); // Fahrerlohn + Standort
  for (let day = startDay; day <= endDay; day++) {
    const midnight = day * 1440;
    if (midnight > startMin && midnight <= tourEnd) {
      events.push({ min: midnight, type: "cost", amount: dailyCosts, label: "Tageskosten" });
    }
  }
  events.sort((a, b) => a.min - b.min || (a.type === "cost" ? -1 : 1));

  for (const ev of events) {
    if (ev.type === "cost") {
      balance -= ev.amount;
      if (balance < 0) {
        return { ok: false, reason: "Firmenkonto wird bei '" + ev.label + "' (" + formatGameTime(ev.min) + ") negativ (" + (balance / 100).toFixed(2) + " €)." };
      }
    } else {
      balance += ev.amount;
    }
  }
  return { ok: true, finalBalance: balance };
}

// Reservierungen auch in alten Spielständen ohne reservedByTourId erkennen.
export function getOrderReservation(state, orderId, excludingTourId = null) {
  return (state.tours || []).find(t => t.id !== excludingTourId && ["active", "planned"].includes(t.status) &&
    (t.deployments || []).some(d => d.orderId === orderId && ["planned", "active"].includes(d.status)));
}

// Known absences must not interrupt a promised trip halfway through.
export function isDriverAvailableForTour(state, driver, fromMin, toMin) {
  if (driver.attendance === "released" || !isPersonAvailable(state, driver.id, fromMin) ||
      isPersonInTraining(state, driver.id, fromMin)) return false;
  const overlaps = (start, end) => start < toMin && end > fromMin;
  if ((state.absences?.sicknesses || []).some(s => s.personId === driver.id && s.status === "active" && overlaps(s.startMin, s.expectedEndMin))) return false;
  if ((state.absences?.vacationRequests || []).some(v => v.personId === driver.id && v.status === "approved" && overlaps(v.startMin, v.endMin))) return false;
  for (const e of state.training?.enrollments || []) {
    if (e.personId !== driver.id || !["reserved", "in_progress"].includes(e.status)) continue;
    if ((e.blockStarts || []).some(start => overlaps(start, start + TRAINING_BLOCK_MIN + REST_AFTER_BLOCK_MIN))) return false;
  }
  for (const a of state.training?.apprenticeships || []) {
    if (a.personId === driver.id && ["theory", "practice"].includes(a.status) &&
        a.currentBlockStart != null && overlaps(a.currentBlockStart, a.currentBlockStart + TRAINING_BLOCK_MIN + REST_AFTER_BLOCK_MIN)) return false;
  }
  return true;
}

// ---------- Bestätigung (atomar) ----------

export function validateTourConfirmation(state, params) {
  const { vehicleId, driverId, orderIds, desiredEndCity, latestReturnMin, minStartTime } = params;

  // Plan-Cache löschen: suggestTours bevölkert den Cache, aber zwischen
  // suggestTours und confirmTour ändert sich der Zustand (andere Touren werden
  // bestätigt, Fahrzeuge wechseln den Status). Stale Cache-Werte für
  // futureLocation/earliestAvailable/nextReservationStart können die
  // Bestätigung fälschlich fehlschlagen lassen ("Tour-Bestätigung fehlgeschlagen").
  _clearPlanCache();

  // 1. Plane die Tour (Validierung)
  const plan = buildTourPlan(state, { vehicleId, driverId, orderIds, desiredEndCity, latestReturnMin, minStartTime });
  return validateBuiltTour(state, params, plan);
}

// Only for synchronous, read-only proposal searches. Never confirm or mutate
// the state inside this callback; real confirmation always rebuilds its plan.
export function withTourValidation<T>(state, action: (validate: (params: any) => any) => T): T {
  const previousCache = _planCache;
  const previousResources = validationResources.get(state);
  _planCache = new Map();
  validationResources.set(state, planningResources(state));
  try {
    return action(params => {
      const plan = buildTourPlan(state, params);
      // An infeasible candidate is expected, not an exception.
      if (!plan.ok) return null;
      try { return validateBuiltTour(state, params, plan); } catch { return null; }
    });
  } finally {
    _planCache = previousCache;
    if (previousResources) validationResources.set(state, previousResources);
    else validationResources.delete(state);
  }
}

function validateBuiltTour(state, params, plan) {
  const { vehicleId, driverId, orderIds } = params;
  if (plan.error) throw new Error(plan.error);
  if (!("earliestStartMin" in plan)) throw new Error("Tourplanung unvollständig.");

  const vehicle = _vehicleById(state, vehicleId);
  const driver = _driverById(state, driverId);
  if (!isDriverAvailableForTour(state, driver, plan.earliestStartMin, plan.driverFreeMin)) {
    throw new Error("Fahrer ist zum geplanten Start nicht verfügbar.");
  }

  // 2. Prüfe Ressourcen-Verfügbarkeit erneut
  // Für 24/7-Vorausplanung: Erlaube auch on_trip, wenn die neue Tour
  // erst nach der aktuellen startet (plan.earliestStartMin > state.gameTime).
  // earliestAvailable berücksichtigt aktuelle Touren und Reservierungen.
  const earliestAvail = earliestAvailable(state, vehicle, driver);
  if (vehicle.status === "on_trip") {
    if (plan.earliestStartMin <= state.gameTime) {
      throw new Error("Fahrzeug ist auf Tour und kann nicht sofort disponiert werden. Tourende: " + formatGameTime(earliestAvail) + ".");
    }
  } else if (vehicle.status !== "free" && vehicle.status !== "resting") {
    throw new Error("Fahrzeug ist nicht frei (Status: " + vehicle.status + ").");
  }
  if (driver.status === "on_trip") {
    if (plan.earliestStartMin <= state.gameTime) {
      throw new Error("Fahrer ist auf Tour und kann nicht sofort disponiert werden. Tourende: " + formatGameTime(earliestAvail) + ".");
    }
  } else if (driver.status !== "free" && driver.status !== "resting") {
    throw new Error("Fahrer ist nicht frei (Status: " + driver.status + ").");
  }
  if (vehicle.condition < 20) {
    throw new Error("Fahrzeugzustand zu schlecht für einen Einsatz (unter 20). Wartung erforderlich.");
  }

  // 3. Reservierungsprüfung: Kein Auftrag darf bereits von einer anderen
  //    aktiven Tour reserviert sein (Paket 1: verhindert Doppelbuchung
  //    bei manueller und automatischer Disposition).
  for (const orderId of orderIds) {
    const o = _orderById(state, orderId);
    if (!o) continue;
    if (getOrderReservation(state, orderId)) throw new Error("Auftrag ist bereits für eine andere Tour reserviert.");
    if (o.reservedByTourId) {
      const otherTour = (state.tours || []).find(t => t.id === o.reservedByTourId);
      if (otherTour && otherTour.status === "active" && !otherTour.pauseReason) {
        throw new Error("Auftrag " + o.customer + " ist bereits von einer anderen Tour reserviert.");
      }

    }
  }

  // 3a. Nimm alle noch nicht angenommenen Aufträge an
  for (const orderId of plan.acceptedOrderIds) {
    const o = _orderById(state, orderId);
    if (!o) throw new Error("Auftrag nicht gefunden: " + orderId);
    if (o.status !== "offered") throw new Error("Auftrag " + o.customer + " ist nicht mehr verfügbar.");
    if (o.acceptDeadlineMin <= state.gameTime) throw new Error("Annahmefrist für " + o.customer + " ist abgelaufen.");

  }

  // 3a. DG-Validierung für alle Aufträge der Tour (Auftrag 32)
  const tourEndMin = plan.tourEndMin;
  for (const orderId of orderIds) {
    const o = _orderById(state, orderId);
    if (!o || !o.isDangerousGoods) continue;
    const dgCheck = validateDgTransport(state, o, vehicle, driver, tourEndMin);
    if (!dgCheck.ok) {
      const reasons = dgCheck.errors.map(e => e.reason).join("; ");
      throw new Error("Gefahrgut-Prüfung fehlgeschlagen: " + reasons);
    }
  }

  return { plan, vehicle, driver };
}

export function confirmTour(state, params) {
  const { vehicleId, driverId, orderIds, desiredEndCity, latestReturnMin } = params;
  const { plan, vehicle, driver } = validateTourConfirmation(state, params);
  // Confirmation records the beginning of observed idle time in old saves.
  // In particular, a planned rest-first departure must really get its 12h.
  if (driver.status === "free" && driver.freeSinceMin == null) driver.freeSinceMin = state.gameTime;
  for (const orderId of plan.acceptedOrderIds) {
    const order = state.orders.find(o => o.id === orderId);
    order.status = "angenommen";
    order.acceptedAtMin = state.gameTime;
  }

  // 4. Erstelle die Tourenkette
  const tourId = uid(state, "tour");
  const tour = {
    id: tourId,
    vehicleId,
    driverId,
    status: "active",
    createdAt: state.gameTime,
    confirmedAt: state.gameTime,
    startCity: vehicle.locationCity,
    desiredEndCity: desiredEndCity || null,
    latestReturnMin: latestReturnMin || null,
    deployments: plan.deployments.map((dep, i) => ({
      ...dep,
      id: "dep_" + (i + 1),
      status: "planned",
      actualStartMin: null,
      actualEndMin: null,
      tripId: null,
    })),
    returnDeployment: plan.returnDeployment ? {
      ...plan.returnDeployment,
      id: "dep_return",
      status: "planned",
      actualStartMin: null,
      actualEndMin: null,
      tripId: null,
    } : null,
    totalKm: plan.totalKm,
    emptyKm: plan.emptyKm,
    loadedKm: plan.loadedKm,
    totalContributionCents: plan.totalContributionCents,
    reservedUntil: plan.reservedUntil,
    currentDepIndex: 0,
    pauseReason: null,
  };
  state.tours = state.tours || [];
  state.tours.push(tour);

  // 4a. Aufträge für diese Tour reservieren (Paket 1)
  for (const orderId of orderIds) {
    const o = _orderById(state, orderId);
    if (o) o.reservedByTourId = tourId;
  }

  // 5. Starte den ersten Einsatz – sofort oder geplant für die Zukunft
  const firstDep = tour.deployments[0];
  let firstTripId = null;
  if (firstDep.startMin <= state.gameTime) {
    const startResult = startDeployment(state, tour, firstDep, 0);
    firstDep.tripId = startResult.tripId;
    firstDep.status = "active";
    firstDep.actualStartMin = state.gameTime;
    tour.currentDepIndex = 0;
    firstTripId = startResult.tripId;
  } else {
    firstDep.status = "planned";
    tour.currentDepIndex = 0;
  }

  return {
    ok: true,
    tourId,
    acceptedOrderIds: plan.acceptedOrderIds,
    firstTripId,
    totalContributionCents: plan.totalContributionCents,
    totalKm: plan.totalKm,
    emptyKm: plan.emptyKm,
    driverFreeMin: plan.driverFreeMin,
  };
}

// Startet einen einzelnen Einsatz innerhalb einer Tour.
// Nutzt die vorausberechneten Phasen aus buildDeployment, ggf. zeitlich verschoben.
function startDeployment(state, tour, dep, depIndex) {
  const vehicle = state.vehicles.find(v => v.id === tour.vehicleId);
  const driver = state.drivers.find(d => d.id === tour.driverId);
  if (!vehicle || !driver) throw new Error("Fahrzeug oder Fahrer nicht gefunden.");

  // Beim tatsächlichen Start aktuelle Zähler benutzen; die Vorausplanung
  // kann durch vorherige Fahrten oder Wartezeiten überholt sein.
  const initialCounters = planningDriverCounters(state, driver);
  driver.workMinutesSinceRest = initialCounters.workMin;
  driver.driveMinutesSinceBreak = initialCounters.driveMin;
  const order = dep.orderId ? state.orders.find(o => o.id === dep.orderId) : null;
  const fresh = order
    ? buildDeployment(state, order, vehicle, vehicle.locationCity, state.gameTime, initialCounters)
    : buildEmptyDeployment(state, vehicle.locationCity, dep.toCity, vehicle, state.gameTime, initialCounters);
  Object.assign(dep, fresh);

  // Phasen aus dem Deployment übernehmen, bei zeitlicher Abweichung verschieben
  const timeShift = state.gameTime - dep.startMin;
  const phases = dep.phases.map(p => ({
    ...p,
    startMin: p.startMin + timeShift,
    endMin: p.endMin + timeShift,
  }));

  const tripId = uid(state, "t");
  const trip = {
    id: tripId,
    branchId: vehicle.branchId,
    type: dep.orderId ? "loaded" : "empty",
    orderId: dep.orderId,
    tourId: tour.id,
    vehicleId: vehicle.id,
    driverId: driver.id,
    phases,
    initialCounters,
    currentPhase: 0,
    startMin: state.gameTime,
    endMin: phases.length > 0 ? phases[phases.length - 1].endMin : state.gameTime,
    status: "in_progress",
    paymentCents: dep.paymentCents,
    fuelCents: dep.fuelCents,
    tollCents: dep.tollCents,
    totalKm: dep.totalKm,
    drivenKm: 0,
    depIndex,
  };

  // Kraftstoff und Maut einmal beim Start buchen (nicht pro Pause-Block)
  addBooking(state, state.gameTime, "Kraftstoff: " + (dep.customer || "Leerfahrt"), -dep.fuelCents, "company", "fuel:" + tripId, { branchId: vehicle.branchId, vehicleId: vehicle.id, orderId: dep.orderId });
  addBooking(state, state.gameTime, "Maut: " + (dep.customer || "Leerfahrt"), -dep.tollCents, "company", "toll:" + tripId, { branchId: vehicle.branchId, vehicleId: vehicle.id, orderId: dep.orderId });

  // DG-Abwicklungsgebühr beim tatsächlichen Ladungsbeginn (Auftrag 32)
  if (dep.orderId) {
    const order = state.orders.find(o => o.id === dep.orderId);
    if (order && order.isDangerousGoods) {
      chargeDgHandlingFee(state, order, tripId);
    }
  }

  state.trips.push(trip);
  vehicle.status = "on_trip";
  vehicle.tripId = tripId;
  driver.status = "on_trip";

  if (dep.orderId) {
    const order = state.orders.find(o => o.id === dep.orderId);
    if (order) {
      order.status = "unterwegs";
      order.startedAtMin = state.gameTime;
      order.reservedByTourId = null; // Reservierung aufheben, Auftrag ist unterwegs
    }
  }

  return { tripId };
}

// addBooking wird aus accountingEngine.ts importiert (Paket 2: zentrale Buchungsroutine).

// ---------- Tour-Auflösung ----------

export function cancelTour(state, tourId) {
  const tour = (state.tours || []).find(t => t.id === tourId);
  if (!tour) throw new Error("Tour nicht gefunden.");
  if (tour.status === "completed") throw new Error("Tour ist bereits abgeschlossen.");
  if (tour.status === "cancelled") throw new Error("Tour ist bereits aufgelöst.");
  const freedCount = tour.deployments.filter(d => d.status === "planned").length;
  for (const dep of [...tour.deployments, tour.returnDeployment].filter(Boolean)) {
    if (dep.status !== "planned") continue;
    const order = state.orders.find(o => o.id === dep.orderId);
    if (order?.reservedByTourId === tour.id) order.reservedByTourId = null;
    dep.status = "cancelled";
  }

  // Aktiver Einsatz läuft weiter – nur zukünftige Einsätze freigeben
  const activeDep = tour.deployments.find(d => d.status === "active");
  if (activeDep) {
    // Aktiver Trip läuft weiter, aber Tour wird als aufgelöst markiert
    // Nach Abschluss des aktiven Trips wird keine weitere Deployment gestartet
    tour.status = "cancelled";
    tour.pauseReason = "Vom Spieler aufgelöst";
    // Fahrzeug/Fahrer werden nach Abschluss des aktiven Trips normal freigegeben
    return { ok: true, activeTripContinues: true, freedFutureDeployments: freedCount };
  }

  // Kein aktiver Einsatz: sofort freigeben
  tour.status = "cancelled";
  tour.pauseReason = "Vom Spieler aufgelöst";

  // Reservierungen für geplante (nicht gestartete) Aufträge freigeben (Paket 1)
  for (const dep of tour.deployments) {
    if (dep.orderId && dep.status === "planned") {
      const order = state.orders.find(o => o.id === dep.orderId);
      if (order && order.reservedByTourId === tourId) {
        order.reservedByTourId = null;
      }
    }
  }

  return { ok: true, freedFutureDeployments: freedCount };
}

// Terminal deployments do not imply a stopped trip in inconsistent old saves.
function runningTourTrips(state) {
  const tours = new Set(), trips = new Set();
  for (const t of state.trips || []) if (t.status === "in_progress") {
    trips.add(t.id); if (t.tourId) tours.add(t.tourId);
  }
  return { tours, trips };
}
function finishTourIfDone(state, tour, m, log, running, recover = false) {
  if (tour.status !== "active" || tour.disruptionId) return false;
  const deps = [...(tour.deployments || []), tour.returnDeployment].filter(Boolean);
  if (!deps.length || !deps.every(d => d.status === "completed" || d.status === "skipped") ||
      running.tours.has(tour.id) || deps.some(d => d.tripId && running.trips.has(d.tripId))) return false;
  if (recover) preserveHistory(state, "tourLifecycleVersions", [tour]);
  tour.status = "completed";
  tour.completedAtMin = m;
  log.push({ type: "tour_completed", tour: tour.id });
  return true;
}

// ---------- Automatische Ausführung ----------

// Wird bei jedem Ereignis-Zeitpunkt aufgerufen.
// Prüft, ob eine Tour zum nächsten Einsatz starten kann.
export function processTours(state, m, log) {
  _clearPlanCache();
  // Natürliche Ruhe-Rücksetzung: Ein Fahrer, der 12+ Stunden frei war,
  // hat sich von selbst ausgeruht. Seine Arbeitszeit-Zähler werden
  // zurückgesetzt, damit er für neue Touren voll verfügbar ist.
  // Verhindert, dass Fahrer mit hohem workMin dauerhaft unbrauchbar werden.
  // Performance: Nur bei vollen Stunden prüfen (statt bei jedem Event),
  // da die Ruhe-Rücksetzung stundenbasiert ist (12h Schwelle).
  if (m % 60 === 0) {
    for (const d of state.drivers || []) {
      if (d.status !== "free") continue;
      if (d.freeSinceMin == null) d.freeSinceMin = m;
      if (m - d.freeSinceMin >= REST_MIN) {
        d.workMinutesSinceRest = 0;
        d.driveMinutesSinceBreak = 0;
        d.freeSinceMin = m;
      }
    }
  }

  const runningIndex = runningTourTrips(state);

  // Cleanup: Pausierte und verwaiste Touren abbrechen.
  // Pausierte Touren (z.B. "Fahrzeug nicht am erwarteten Ort") können nicht
  // starten und blockieren über reservedUntil Fahrzeuge/Fahrer. Verwaiste
  // Touren (alle Einsätze geplant + Startzeit weit in der Vergangenheit)
  // sind ebenfalls nicht mehr ausführbar. Beide werden abgebrochen, um
  // Ressourcen freizugeben.
  for (const tour of state.tours || []) {
    if (tour.status !== "active") continue;
    if (finishTourIfDone(state, tour, m, log, runningIndex, true)) continue;
    // Pausing a chain must not cancel deployments whose trips still run.
    if (runningIndex.tours.has(tour.id) || [...(tour.deployments || []), tour.returnDeployment]
        .some(d => d?.tripId && runningIndex.trips.has(d.tripId))) continue;
    let shouldCancel = false;
    let cancelReason = null;
    if (tour.pauseReason) {
      shouldCancel = true;
      cancelReason = "Pausiert: " + tour.pauseReason;
    } else {
      const deps = tour.deployments || [];
      const allPlanned = deps.length > 0 && deps.every(d => d.status === "planned");
      const allPast = deps.every(d => d.startMin < m - 720);
      if (allPlanned && allPast) {
        shouldCancel = true;
        cancelReason = "Einsätze in der Vergangenheit nicht gestartet";
      }
    }
    if (shouldCancel) {
      tour.status = "cancelled";
      tour.cancelReason = cancelReason;
      for (const dep of (tour.deployments || [])) {
        if (dep.orderId && dep.status === "planned") {
          const order = state.orders.find(o => o.id === dep.orderId);
          if (order && order.status === "unterwegs") order.status = "angenommen";
          if (order && order.reservedByTourId === tour.id) order.reservedByTourId = null;
        }
        dep.status = "cancelled";
        dep.cancelReason = "tour_cancelled_stale";
      }
      log.push({ type: "tour_cancelled_stale", tour: tour.id, reason: cancelReason });
    }
  }

  for (const tour of state.tours || []) {
    if (tour.status !== "active") continue;
    if (tour.pauseReason) continue;
    // Tour durch Stoerung blockiert — nicht starten, aber auch nicht aufloesen
    if (tour.disruptionId) continue;

    // Finde den nächsten geplanten Einsatz
    const nextDep = findNextDeployment(tour);
    if (!nextDep) continue;

    // Prüfe, ob der Startzeitpunkt erreicht ist
    if (nextDep.dep.startMin > m) continue;

    // Prüfe, ob das aktuelle Deployment (falls aktiv) abgeschlossen ist
    const activeDep = tour.deployments.find(d => d.status === "active") || (tour.returnDeployment && tour.returnDeployment.status === "active" ? tour.returnDeployment : null);
    if (activeDep) continue; // Noch beschäftigt

    // Prüfe Ressourcen-Verfügbarkeit
    const vehicle = state.vehicles.find(v => v.id === tour.vehicleId);
    const driver = state.drivers.find(d => d.id === tour.driverId);
    if (!vehicle || !driver) {
      tour.pauseReason = "Fahrzeug oder Fahrer nicht mehr verfügbar";
      log.push({ type: "tour_paused", tour: tour.id, reason: tour.pauseReason });
      continue;
    }

    // Fahrzeug muss frei sein (vorheriger Einsatz abgeschlossen + Erholung vorbei)
    if (vehicle.status !== "free" && vehicle.status !== "resting") continue;
    if (driver.status !== "free" && driver.status !== "resting") continue;
    if (Number.isFinite(vehicle.rentalReturnMin) && vehicle.rentalReturnMin <= m) continue;
    if (driver.restUntil && driver.restUntil > m) continue;
    if (!isPersonAvailable(state, driver.id, m) || driver.attendance === "released" || isPersonInTraining(state, driver.id, m)) continue;
    if (driver.locationCity !== vehicle.locationCity) {
      tour.pauseReason = "Fahrer und Fahrzeug sind nicht am selben Ort.";
      continue;
    }
    if (nextDep.dep.orderId) {
      const order = state.orders.find(o => o.id === nextDep.dep.orderId);
      const running = state.trips.some(t => t.orderId === nextDep.dep.orderId && t.status === "in_progress") || !!getOrderReservation(state, nextDep.dep.orderId, tour.id);
      if (!order || order.status !== "angenommen" || running ||
          (order.reservedByTourId && order.reservedByTourId !== tour.id)) {
        nextDep.dep.status = "skipped";
        if (order?.reservedByTourId === tour.id) order.reservedByTourId = null;
        finishTourIfDone(state, tour, m, log, runningIndex);
        continue;
      }
    }

    // Fahrzeugzustand prüfen
    if (vehicle.condition < 20) {
      tour.pauseReason = "Fahrzeugzustand zu schlecht (< 20). Wartung erforderlich.";
      log.push({ type: "tour_paused", tour: tour.id, reason: tour.pauseReason });
      continue;
    }

    // Liquidität prüfen
    const fuelToll = nextDep.dep.fuelCents + nextDep.dep.tollCents;
    if (state.company.accountCents < fuelToll) {
      tour.pauseReason = "Firmenkonto reicht für Kraftstoff und Maut (" + (fuelToll / 100).toFixed(2) + " €) nicht. Kostet: " + (fuelToll / 100).toFixed(2) + " €.";
      log.push({ type: "tour_paused", tour: tour.id, reason: tour.pauseReason });
      continue;
    }

    // Ort-Konsistenz prüfen (erste Phase gibt den Startort an)
    const firstPhase = nextDep.dep.phases.find(p => p.fromCity);
    if (firstPhase && vehicle.locationCity !== firstPhase.fromCity) {
      tour.pauseReason = "Fahrzeug ist nicht am erwarteten Ort (" + firstPhase.fromCity + ", aktuell " + vehicle.locationCity + ").";
      log.push({ type: "tour_paused", tour: tour.id, reason: tour.pauseReason });
      continue;
    }

    if (nextDep.dep.orderId) {
      const order = state.orders.find(o => o.id === nextDep.dep.orderId);
      const fresh = buildDeployment(state, order, vehicle, vehicle.locationCity, m, planningDriverCounters(state, driver));
      if (order.tons > vehicle.capacityTons || !checkBodyTypeCompatibility(order, vehicle).ok ||
          (order.windowVersion >= 2 && fresh.phases.find(p => p.type === "loading")?.startMin > order.latestLoadStartMin) ||
          (order.isDangerousGoods && !validateDgTransport(state, order, vehicle, driver, fresh.endMin).ok)) {
        tour.pauseReason = "Auftrag ist mit den aktuellen Ressourcen oder Ladezeiten nicht mehr ausführbar.";
        continue;
      }
    }

    // Stoerungsmanagement: Technischen Defekt vor Tourbeginn pruefen
    if (maybeGenerateTechnicalDefect(state, tour, nextDep.dep, m, log)) {
      // Defekt aufgetreten — Tour blockiert, Einsatz nicht starten
      log.push({ type: "tour_blocked_defect", tour: tour.id, atMin: m });
      continue;
    }

    // Starte den Einsatz
    const startResult = startDeployment(state, tour, nextDep.dep, nextDep.index);
    nextDep.dep.tripId = startResult.tripId;
    nextDep.dep.status = "active";
    nextDep.dep.actualStartMin = m;
    tour.currentDepIndex = nextDep.index;
    log.push({ type: "tour_deployment_started", tour: tour.id, deployment: nextDep.dep.id, trip: startResult.tripId, customer: nextDep.dep.customer, atMin: m, branchId: vehicle.branchId });

    // Stoerungsmanagement: Ladeverzoegerung fuer den neuen Trip pruefen
    const newTrip = state.trips.find(t => t.id === startResult.tripId);
    if (newTrip) maybeGenerateLoadingDelay(state, newTrip, m, log);
  }
}

// Findet den nächsten zu startenden Einsatz einer Tour.
function findNextDeployment(tour) {
  for (let i = 0; i < tour.deployments.length; i++) {
    const dep = tour.deployments[i];
    if (dep.status === "planned") return { dep, index: i };
  }
  if (tour.returnDeployment && tour.returnDeployment.status === "planned") {
    return { dep: tour.returnDeployment, index: tour.deployments.length };
  }
  return null;
}

// Wird aufgerufen, wenn ein Trip abgeschlossen wird.
// Verknüpft den Abschluss mit der Tour und plant Erholung.
export function onTripCompleted(state, trip, m, log) {
  if (!trip.tourId) return false;
  const tour = (state.tours || []).find(t => t.id === trip.tourId);
  if (!tour) return false;

  // Finde das zugehörige Deployment
  let dep = null;
  for (const d of tour.deployments) {
    if (d.tripId === trip.id) { dep = d; break; }
  }
  if (!dep && tour.returnDeployment && tour.returnDeployment.tripId === trip.id) {
    dep = tour.returnDeployment;
  }
  if (!dep) return false;

  if (dep.status === "completed") return true;
  dep.status = "completed";
  dep.actualEndMin = m;

  finishTourIfDone(state, tour, m, log, runningTourTrips(state));

  return true;
}

// ---------- Rückladungs-Suche ----------

// Findet passende Rückladungen am Zielort eines Hinauftrags.
// Gibt Kandidaten mit Machbarkeitsprüfung zurück.
export function findReturnLoads(state, primaryOrderId, vehicleId, driverId) {
  const order = state.orders.find(o => o.id === primaryOrderId);
  if (!order) return { error: "Auftrag nicht gefunden." };
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);
  if (!vehicle || !driver) return { error: "Fahrzeug/Fahrer nicht gefunden." };

  const destCity = order.toCity;
  const candidates = [];

  // 1. Direkte Rückladungen ab Zielort
  for (const o of state.orders) {
    if (o.id === primaryOrderId) continue;
    if (o.status !== "offered" && o.status !== "angenommen") continue;
    if (o.fromCity !== destCity) continue;
    if (o.tons > vehicle.capacityTons) continue;
    if (!checkBodyTypeCompatibility(o, vehicle).ok) continue;

    const plan = buildTourPlan(state, {
      vehicleId, driverId,
      orderIds: [primaryOrderId, o.id],
      desiredEndCity: null,
      latestReturnMin: null,
    });
    if (plan.ok) {
      candidates.push({
        order: o,
        type: "direct_return",
        plan,
        description: "Direkte Rückladung " + o.fromCity + " → " + o.toCity + " (" + o.customer + ")",
      });
    } else {
      candidates.push({
        order: o,
        type: "direct_return",
        plan: null,
        error: plan.error,
        description: o.fromCity + " → " + o.toCity + " (" + o.customer + ") – nicht ausführbar",
      });
    }
  }

  // 2. Rückladungen mit Leerfahrt zum Abholort
  for (const o of state.orders) {
    if (o.id === primaryOrderId) continue;
    if (o.status !== "offered" && o.status !== "angenommen") continue;
    if (o.fromCity === destCity) continue; // schon als direkte Rückladung erfasst
    if (o.toCity !== order.fromCity && o.toCity !== "Hamburg") continue; // nur sinnvolle Ziele
    if (o.tons > vehicle.capacityTons) continue;
    if (!checkBodyTypeCompatibility(o, vehicle).ok) continue;

    // Tour mit Leerfahrt: Hin → Leerfahrt → Rück
    // Wir testen: Hin + Rück (mit automatischer Leerfahrt vom Tour-Endort zum Abholort)
    const plan = buildTourPlan(state, {
      vehicleId, driverId,
      orderIds: [primaryOrderId, o.id],
      desiredEndCity: null,
      latestReturnMin: null,
    });
    if (plan.ok) {
      candidates.push({
        order: o,
        type: "empty_then_return",
        plan,
        description: "Leerfahrt " + destCity + " → " + o.fromCity + ", dann " + o.fromCity + " → " + o.toCity + " (" + o.customer + ")",
      });
    }
  }

  return { candidates: candidates.sort((a, b) => {
    if (!a.plan && !b.plan) return 0;
    if (!a.plan) return 1;
    if (!b.plan) return -1;
    return (b.plan.totalContributionCents || 0) - (a.plan.totalContributionCents || 0);
  })};
}

// ---------- Assistent: Flotten-Verplanung ----------

// Findet Vorschläge für freie Fahrzeuge.
// mode: "balanced" | "high_margin" | "low_empty"
export function suggestTours(state, opts) {
  _clearPlanCache();
  const { vehicleIds, earliestStart, horizonMin, desiredEndCity, latestReturnMin, mode, acceptNew, restrictOrderIds, fastMode, minNewOrderBufferMin = 0, candidateOrderLimit = 12, maxSuggestions = Infinity } = opts;
  const restrictSet = restrictOrderIds ? new Set(restrictOrderIds) : null;
  if (maxSuggestions <= 0) return { suggestions: [] };
  const reliable = plan => plan.ok && plan.deployments.every(d => d.orderStatus !== "offered" || d.deadlineBufferMin >= minNewOrderBufferMin);
  const suggestions = [];

  // Lookup-Maps aufbauen: O(1) Zugriff für buildTourPlan statt O(n) .find().
  // Bei 192K buildTourPlan-Aufrufen mit 320 Aufträgen spart das ~46M Iterationen.
  const resources = planningResources(state);
  state._vehicleMap = resources.vehicles;
  state._driverMap = resources.drivers;
  const planningOrders = planningOrdersFor(state).filter(o => o.status === "angenommen" || (acceptNew && o.status === "offered"));
  state._orderMap = new Map(planningOrders.map(o => [o.id, o]));
  const previousResources = validationResources.get(state);
  validationResources.set(state, resources);

  try {
  const startMin = earliestStart || state.gameTime;
  const maxMin = startMin + (horizonMin || 48 * 60);
  const availabilitySensitive = new Set();
  for (const item of [...(state.absences?.sicknesses || []), ...(state.absences?.vacationRequests || []), ...(state.training?.enrollments || []), ...(state.training?.apprenticeships || [])]) availabilitySensitive.add(item.personId);
  const usedDriverIds = new Set();
  const usedOrderIds = new Set();

  // Performance: Active-tour-Auftrags-IDs einmal pro suggestTours-Aufruf
  // vorberechnen (statt pro Fahrzeug pro Auftrag). Eliminiert O(vehicles ×
  // orders × tours × deployments) und ersetzt es durch O(tours × deployments)
  // + O(1) Lookups.
  const activeTourOrderIds = new Set();
  for (const t of (state.tours || [])) {
    if (t.status !== "active") continue;
    for (const d of (t.deployments || [])) {
      if (d.orderId && d.status !== "cancelled") activeTourOrderIds.add(d.orderId);
    }
  }

  // Freie/ruhende Lkw zuerst, dann on_trip-Rückkehrer. Der Early-Exit unten
  // stoppt sobald alle Aufträge verplant sind — on_trip-Lkw werden nur
  // erreicht, wenn die freien Lkw nicht ausreichen. Das ermöglicht
  // Vorausplanung für Rückkehrer an Filialen, statt Aufträge aufzustauen.
  const allCandidateVehicles = (vehicleIds || state.vehicles.map(v => v.id))
    .map(vid => resources.vehicles.get(vid))
    .filter(v => v && (v.status === "free" || v.status === "resting" || v.status === "on_trip"));
  const effectiveVehicleIds = allCandidateVehicles
    .sort((a, b) => {
      const aFree = a.status === "free" || a.status === "resting" ? 0 : 1;
      const bFree = b.status === "free" || b.status === "resting" ? 0 : 1;
      return aFree - bFree;
    })
    .map(v => v.id);

  // Performance: Gesamtzahl verfügbarer Aufträge zählen für Early-Exit.
  // Wenn alle Aufträge verplant sind, müssen keine weiteren Fahrzeuge
  // geprüft werden — das spart bei 100 Fahrzeugen mit 10 Aufträgen 90%
  // der buildTourPlan-Aufrufe.
  const availableOrders = planningOrders.filter(o =>
    (o.status === "angenommen" || (acceptNew && o.status === "offered")) &&
    o.deliveryDeadlineMin > startMin - 240 &&
    !activeTourOrderIds.has(o.id) &&
    !o.reservedByTourId &&
    (!restrictSet || restrictSet.has(o.id))
  );
  const totalAvailableOrders = availableOrders.length;
  // These inputs do not change during this read-only suggestion call. Preserve
  // stable deadline ordering; only assignment and vehicle suitability vary.
  const acceptedPool = availableOrders.filter(o => o.status === "angenommen")
    .sort((a, b) => a.deliveryDeadlineMin - b.deliveryDeadlineMin);
  const offeredPool = acceptNew ? availableOrders.filter(o => o.status === "offered" &&
    o.acceptDeadlineMin > startMin && o.deliveryDeadlineMin > startMin) : [];

  const eligibleDrivers = state.drivers.filter(d => d.employmentStatus === "employed" &&
    !resources.committed.has(d.id) && ["free", "resting", "on_trip"].includes(d.status));
  const driverCities = new Map(eligibleDrivers.map(d => [d.id, _cached("futD:" + d.id, () => futureDriverLocation(state, d))]));

  // Early-Exit reicht als Performance-Optimierung: sobald alle Aufträge
  // verplant sind, wird abgebrochen. Ein festes Fahrzeug-Limit würde
  // Fahrzeuge an entfernten Standorten überspringen, wenn die ersten N
  // Lkw alle am Hauptsitz stehen — das würde Filial-Disposition brechen.
  for (let vi = 0; vi < effectiveVehicleIds.length; vi++) {
    const vehicleId = effectiveVehicleIds[vi];
    const vehicle = resources.vehicles.get(vehicleId);
    if (!vehicle) continue;
    if (vehicle.status !== "free" && vehicle.status !== "resting" && vehicle.status !== "on_trip") continue;
    if (hasPendingTour(state, vehicle.id)) continue;
    if (vehicle.status === "on_trip" && vehicle.condition < 20) continue;
    if (vehicle.status !== "on_trip" && vehicle.condition < 20) continue;

    // Zukünftige Stadt nach Abschluss aller laufenden Touren
    const vehicleFutureCity = _cached("futV:" + vehicleId, () => futureLocation(state, vehicle));
    const vehicleAvail = _cached("ea:" + vehicleId + "|null", () => earliestAvailable(state, vehicle, { id: null }));

    // Finde alle passenden Fahrer am gleichen Ort (auch ruhende oder auf Tour,
    // wenn die zukünftige Stadt übereinstimmt). Probiere mehrere Fahrer, da
    // verschiedene Fahrer unterschiedliche Arbeitszeit-Zähler haben — der
    // erste Fahrer könnte erschöpft sein, während ein anderer noch Kapazität hat.
    const sameCityDrivers = eligibleDrivers.filter(d => {
      if (d.employmentStatus !== "employed") return false;
      if (usedDriverIds.has(d.id) || hasPendingTour(state, d.id)) return false;
      if (d.status !== "free" && d.status !== "resting" && d.status !== "on_trip") return false;
      const driverFutureCity = driverCities.get(d.id);
      if (driverFutureCity !== vehicleFutureCity) return false;
      if (d.status === "on_trip" || vehicle.status === "on_trip") {
        const driverAvail = _cached("eaD:" + d.id, () => earliestAvailable(state, { id: null }, d));
        if (Math.abs(driverAvail - vehicleAvail) > 120) return false;
      }
      return true;
    });
    // Fahrer-Repositionierung: Wenn nicht genug Fahrer am gleichen Ort sind,
    // suche freie Fahrer an anderen Orten. Diese reisen per Bahn/Bus zum
    // Fahrzeug (buildTourPlan addiert die Reisezeit). Dadurch können Lkw
    // an entfernten Orten von freien Fahrern vom Hauptsitz genutzt werden.
    const crossCityDrivers = sameCityDrivers.length < 4 ? eligibleDrivers.filter(d => {
      if (d.employmentStatus !== "employed") return false;
      if (usedDriverIds.has(d.id) || hasPendingTour(state, d.id)) return false;
      if (d.status !== "free") return false; // Nur freie Fahrer für Cross-City
      const driverFutureCity = driverCities.get(d.id);
      if (driverFutureCity === vehicleFutureCity) return false; // bereits in sameCityDrivers
      return true;
    }) : [];
    // Fahrer nach Arbeitszeit sortieren (frischeste zuerst): Ein Fahrer mit
    // hohem workMin braucht evtl. Ruhe (720 Min), was die Tour-Vorschau sprengt.
    // Ohne Sortierung werden zufällig die ersten Fahrer aus dem Array probiert
    // — oft erschöpfte Fahrer, deren Pläne an der Frist scheitern, während der
    // frischeste Fahrer (workMin 0) am Ende des Arrays übersprungen wird.
    const sameCitySorted = [...sameCityDrivers].sort((a, b) => (a.workMinutesSinceRest || 0) - (b.workMinutesSinceRest || 0));
    const crossCitySorted = [...crossCityDrivers].sort((a, b) => (a.workMinutesSinceRest || 0) - (b.workMinutesSinceRest || 0));
    const candidateDrivers = [...sameCitySorted, ...crossCitySorted];
    // CPU-Schutz: höchstens 4 Fahrer pro Fahrzeug probieren.
    // Konstanter Wert (unabhängig von fastMode), damit die gewählte
    // Zeitsteuerung (1×1440 vs 24×60 vs 96×15) die fachlichen Ergebnisse
    // der Tourensuche nicht verändert.
    const maxDrivers = 4;
    if (candidateDrivers.length > maxDrivers) candidateDrivers.length = maxDrivers;
    if (candidateDrivers.length === 0) continue;

    // 1. Bereits angenommene, unzugewiesene Aufträge (nicht bereits zugewiesen,
    //    nicht bereits Teil einer aktiven Tour — verhindert Doppelbuchung im Pool-Modell)
    //    Lieferfrist muss noch in der Zukunft liegen (sonst ist der Auftrag unrealisierbar).
    // 1. Bereits angenommene, unzugewiesene Aufträge (nicht bereits zugewiesen,
    //    nicht bereits Teil einer aktiven Tour — verhindert Doppelbuchung im Pool-Modell)
    //    Spätlieferung-Toleranz: Aufträge bis zu 4h nach der Frist werden noch
    //    geplant (completeTrip zahlt 90% Vergütung bei Spätlieferung).
    //    Sortiert nach Dringlichkeit (knappste Frist zuerst), damit bei
    //    Truncation auf 12 Aufträge die eiligsten nicht verloren gehen.
    const suitable = o => !usedOrderIds.has(o.id) && o.tons <= vehicle.capacityTons &&
      checkBodyTypeCompatibility(o, vehicle).ok;
    const acceptedOrders = acceptedPool.filter(suitable);
    const offeredOrders = offeredPool.filter(suitable);

    const allOrders = [...acceptedOrders, ...offeredOrders];
    // CPU-Schutz: die Doppel-Tour-Suche ist O(n²). Bei vielen Aufträgen
    // wird die Liste begrenzt, damit die kombinatorische Explosion (und damit
    // CPU-Timeouts) vermieden wird.
    // Sortierung nach Beitrag pro km (balanced-Modus): bevorzugt profitable
    // Aufträge mit kurzen Distanzen, die tatsächlich realisierbar sind.
    // Reine Vergütungs-Sortierung bevorzugt Express-Aufträge mit hohen Preisen
    // aber unrealisierbar kurzen Lieferfristen, die dann alle durch buildTourPlan
    // abgelehnt werden und die machbaren Advance-Aufträge verdrängen.
    // CPU-Schutz: die Doppel-Tour-Suche ist O(n²). Bei vielen Aufträgen
    // wird die Liste begrenzt, damit die kombinatorische Explosion vermieden wird.
    // Konstanter Wert (unabhängig von fastMode) — siehe maxDrivers-Kommentar.
    const orderLimit = Math.max(12, Math.min(24, candidateOrderLimit));
    if (allOrders.length > orderLimit) {
      const vehicleCity = vehicleFutureCity;
      const scored = allOrders.map(o => {
        const emptyKm = getDistance(vehicleCity, o.fromCity);
        const loadedKm = getDistance(o.fromCity, o.toCity);
        const totalKm = (emptyKm + loadedKm) || 1;
        return { o, score: (o.paymentCents || 0) / totalKm };
      });
      scored.sort((a, b) => {
        const aAccepted = a.o.status === "angenommen", bAccepted = b.o.status === "angenommen";
        if (aAccepted !== bAccepted) return aAccepted ? -1 : 1;
        if (aAccepted && a.o.deliveryDeadlineMin !== b.o.deliveryDeadlineMin) return a.o.deliveryDeadlineMin - b.o.deliveryDeadlineMin;
        return b.score - a.score;
      });
      allOrders.length = 0;
      for (const s of scored.slice(0, orderLimit)) allOrders.push(s.o);
    }

    // Probiere jeden Kandidaten-Fahrer und wähle den mit dem besten Plan.
    // Bei Neuaufträgen (offered) werden nur profitable Pläne berücksichtigt.
    let bestPlan = null;
    let bestOrders = null;
    let bestDriver = null;

    // Gleiche Planungsbedingungen liefern dieselbe Bewertung. Bei Gleichstand
    // gewinnt bereits bisher der erste Fahrer (< 0); spätere identische
    // Kandidaten können deshalb ohne Auswahländerung entfallen.
    // Alle fahrerabhängigen Eingaben von buildTourPlan sind enthalten.
    // Connection candidates depend on this vehicle's order pool, not its driver.
    const chainMap = new Map();
    for (const o of allOrders) {
      if (!chainMap.has(o.fromCity)) chainMap.set(o.fromCity, []);
      chainMap.get(o.fromCity).push(o);
    }
    const seenDriverConditions = new Set();
    for (const driver of candidateDrivers) {
      // buildTourPlan always rejects different future locations. Avoid all
      // single/double-order attempts for this provably infeasible pair.
      if (_cached("futD:" + driver.id, () => futureDriverLocation(state, driver)) !== vehicleFutureCity) continue;
      const counters = planningDriverCounters(state, driver);
      const conditions = JSON.stringify([
        availabilitySensitive.has(driver.id) || driver.trainingUntil || driver.attendance === "released" ? driver.id : null,
        driver.employmentStatus,
        _cached("futD:" + driver.id, () => futureDriverLocation(state, driver)),
        _cached("ea:" + vehicleId + "|" + driver.id, () => earliestAvailable(state, vehicle, driver)),
        _cached("nrs:" + vehicleId + "|" + driver.id, () => nextReservationStart(state, vehicle, driver)),
        counters.workMin, counters.driveMin,
        driver.isTempStaff && Number.isFinite(driver.tempReturnMin) ? driver.tempReturnMin : null,
      ]);
      if (seenDriverConditions.has(conditions)) continue;
      seenDriverConditions.add(conditions);
      let driverBestPlan = null;
      let driverBestOrders = null;

      // Einzel-Touren
      for (const o of allOrders) {
        const plan = buildTourPlan(state, {
          vehicleId, driverId: driver.id,
          orderIds: [o.id],
          desiredEndCity, latestReturnMin,
        });
        if (plan.ok && reliable(plan) && plan.tourEndMin <= maxMin && isDriverAvailableForTour(state, driver, plan.earliestStartMin, plan.driverFreeMin)) {
          const isNew = o.status === "offered";
          if (isNew && plan.totalContributionCents <= 0) continue;
          if (!driverBestPlan || comparePlans(plan, driverBestPlan, mode) < 0) {
            driverBestPlan = plan;
            driverBestOrders = [o.id];
          }
        }
      }

      // Doppel-Touren (Hin + Rück) — Ketten-Map für O(n·k) statt O(n²)
      for (const o1 of allOrders) {
        const chainable = chainMap.get(o1.toCity) || [];
        for (const o2 of chainable) {
          if (o1.id === o2.id) continue;
          const plan = buildTourPlan(state, {
            vehicleId, driverId: driver.id,
            orderIds: [o1.id, o2.id],
            desiredEndCity, latestReturnMin,
          });
          if (plan.ok && reliable(plan) && plan.tourEndMin <= maxMin && isDriverAvailableForTour(state, driver, plan.earliestStartMin, plan.driverFreeMin)) {
            const hasNew = o1.status === "offered" || o2.status === "offered";
            if (hasNew && plan.totalContributionCents <= 0) continue;
            if (!driverBestPlan || comparePlans(plan, driverBestPlan, mode) < 0) {
              driverBestPlan = plan;
              driverBestOrders = [o1.id, o2.id];
            }
          }
        }
      }

      if (driverBestPlan && (!bestPlan || comparePlans(driverBestPlan, bestPlan, mode) < 0)) {
        bestPlan = driverBestPlan;
        bestOrders = driverBestOrders;
        bestDriver = driver;
      }
    }

    if (bestPlan) {
      usedDriverIds.add(bestDriver.id);
      bestOrders.forEach(oid => usedOrderIds.add(oid));
      suggestions.push({
        vehicleId,
        driverId: bestDriver.id,
        vehicle, driver: bestDriver,
        orderIds: bestOrders,
        plan: bestPlan,
        mode,
      });
    }

    // Performance: Early-Exit wenn alle verfügbaren Aufträge verplant sind.
    // Bei 100 Fahrzeugen und 10 Aufträgen spart das 90% der buildTourPlan-Aufrufe.
    if (usedOrderIds.size >= totalAvailableOrders || suggestions.length >= maxSuggestions) break;
  }

  return { suggestions };
  } finally {
    if (previousResources) validationResources.set(state, previousResources);
    else validationResources.delete(state);
    state._vehicleMap = null;
    state._driverMap = null;
    state._orderMap = null;
  }
}

function comparePlans(a, b, mode) {
  const accepted = p => p.deployments.filter(d => d.orderStatus === "angenommen").length;
  const commitments = accepted(b) - accepted(a);
  if (commitments) return commitments;
  const late = p => p.deployments.reduce((sum, d) => sum + Math.max(0, -d.deadlineBufferMin), 0);
  const delay = late(a) - late(b);
  if (delay) return delay;
  if (mode === "high_margin") return (b.totalContributionCents || 0) - (a.totalContributionCents || 0);
  if (mode === "low_empty") {
    // Erst Auftragsabdeckung (mehr Aufträge = besser), dann weniger Leer-km
    const aOrders = a.deployments.length;
    const bOrders = b.deployments.length;
    if (aOrders !== bOrders) return bOrders - aOrders;
    return (a.emptyKm || 0) - (b.emptyKm || 0);
  }
  // balanced: Beitrag pro km, dann Puffer
  const aScore = (a.totalContributionCents || 0) / Math.max(1, a.totalKm || 1);
  const bScore = (b.totalContributionCents || 0) / Math.max(1, b.totalKm || 1);
  if (Math.abs(aScore - bScore) > 0.01) return bScore - aScore;
  return (b.minDeadlineBufferMin || 0) - (a.minDeadlineBufferMin || 0);
}
