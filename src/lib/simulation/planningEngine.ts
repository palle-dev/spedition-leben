// Planungs-Engine für die Wochenplanung.
// Führt Umplanungs-Operationen durch, die die tatsächliche Simulation
// verändern — keine rein optische Verschiebung.
//
// Alle Operationen nutzen vorhandene Befehle (cancelTour, confirmTour,
// cancelMaintenanceOrder, createMaintenanceOrder) und validieren gegen
// den aktuellen Spielstand.
//
// Reine Logik — keine Auth, keine Speicherung. Wird von planningCommands
// importiert und in simulationEngine integriert.

import {
  buildTourPlan, confirmTour as doConfirmTour, cancelTour as doCancelTour,
  futureLocation, futureDriverLocation, earliestAvailable, nextReservationStart,
} from "./tourEngine.ts";
import {
  cancelMaintenanceOrder, createMaintenanceOrder,
} from "./workshopEngine.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import {
  getDistance, driveMinutes, formatGameTime,
  LOAD_MIN, UNLOAD_MIN, WORK_BUDGET_MIN, REST_MIN,
} from "./gameRules.ts";
import { isLeasingOverdueBlocked } from "./financingEngine.ts";

const DAY_MIN = 1440;

// ---------- Tour neu zuweisen ----------

// Weist eine noch nicht gestartete Tour einem anderen Fahrzeug/Fahrer zu.
// Prüft: keine Deployment hat bereits begonnen, neues Paar ist verfügbar,
// Kapazität, Qualifikationen, Standort, Fahrerzeiten.
export function reassignTour(state, { tourId, newVehicleId, newDriverId }) {
  const tour = (state.tours || []).find(t => t.id === tourId);
  if (!tour) throw new Error("Tour nicht gefunden.");
  if (tour.status !== "active" && tour.status !== "planned") {
    throw new Error("Nur aktive oder geplante Touren können neu zugewiesen werden.");
  }
  if (tour.pauseReason) throw new Error("Pausierte Touren können nicht neu zugewiesen werden.");

  // Prüfen, dass kein Deployment bereits gestartet hat
  for (const dep of (tour.deployments || [])) {
    if (dep.status === "in_progress" || dep.status === "completed") {
      throw new Error("Tour hat bereits gestartete Einsätze und kann nicht neu zugewiesen werden.");
    }
  }
  if (tour.returnDeployment && (tour.returnDeployment.status === "in_progress" || tour.returnDeployment.status === "completed")) {
    throw new Error("Tour hat bereits eine gestartete Rückfahrt.");
  }

  const newVehicle = (state.vehicles || []).find(v => v.id === newVehicleId);
  const newDriver = (state.drivers || []).find(d => d.id === newDriverId);
  if (!newVehicle) throw new Error("Fahrzeug nicht gefunden.");
  if (!newDriver) throw new Error("Fahrer nicht gefunden.");
  if (!isActivelyEmployed(newDriver)) throw new Error("Dieser Fahrer ist nicht mehr aktiv beschäftigt.");
  if (isLeasingOverdueBlocked(state, newVehicleId)) {
    throw new Error("Leasingrückstand: Neue Touren mit diesem Fahrzeug sind gesperrt.");
  }

  // Auftrags-IDs sammeln
  const orderIds = (tour.deployments || [])
    .filter(d => d.orderId && d.status !== "cancelled")
    .map(d => d.orderId);

  if (orderIds.length === 0) throw new Error("Tour hat keine aktiven Aufträge.");

  // Neue Tour planen (Validierung durch buildTourPlan)
  const plan = buildTourPlan(state, {
    vehicleId: newVehicleId,
    driverId: newDriverId,
    orderIds,
    desiredEndCity: tour.returnDeployment?.toCity || null,
    latestReturnMin: tour.latestReturnMin || null,
  });
  if (plan.error) throw new Error("Neuzuweisung nicht möglich: " + plan.error);

  // Alte Tour stornieren
  doCancelTour(state, tourId);

  // Neue Tour bestätigen
  const result = doConfirmTour(state, {
    vehicleId: newVehicleId,
    driverId: newDriverId,
    orderIds,
    desiredEndCity: tour.returnDeployment?.toCity || null,
    latestReturnMin: tour.latestReturnMin || null,
  });

  return {
    ok: true,
    oldTourId: tourId,
    newTourId: result.tourId,
    newVehicleId,
    newDriverId,
    orderIds,
    plan: {
      startMin: plan.startMin,
      endMin: plan.endMin,
      totalContributionCents: plan.totalContributionCents,
    },
  };
}

// ---------- Vorschau: Tour neu zuweisen ----------

export function previewReassignTour(state, { tourId, newVehicleId, newDriverId }) {
  const tour = (state.tours || []).find(t => t.id === tourId);
  if (!tour) return { ok: false, error: "Tour nicht gefunden." };
  if (tour.status !== "active" && tour.status !== "planned") {
    return { ok: false, error: "Nur aktive oder geplante Touren können neu zugewiesen werden." };
  }
  if (tour.pauseReason) return { ok: false, error: "Pausierte Tour." };

  for (const dep of (tour.deployments || [])) {
    if (dep.status === "in_progress" || dep.status === "completed") {
      return { ok: false, error: "Tour hat bereits gestartete Einsätze." };
    }
  }

  const newVehicle = (state.vehicles || []).find(v => v.id === newVehicleId);
  const newDriver = (state.drivers || []).find(d => d.id === newDriverId);
  if (!newVehicle) return { ok: false, error: "Fahrzeug nicht gefunden." };
  if (!newDriver) return { ok: false, error: "Fahrer nicht gefunden." };
  if (!isActivelyEmployed(newDriver)) return { ok: false, error: "Fahrer nicht aktiv beschäftigt." };
  if (isLeasingOverdueBlocked(state, newVehicleId)) {
    return { ok: false, error: "Leasingrückstand bei diesem Fahrzeug." };
  }

  const orderIds = (tour.deployments || [])
    .filter(d => d.orderId && d.status !== "cancelled")
    .map(d => d.orderId);
  if (orderIds.length === 0) return { ok: false, error: "Keine aktiven Aufträge." };

  // Plan validieren
  let plan;
  try {
    plan = buildTourPlan(state, {
      vehicleId: newVehicleId,
      driverId: newDriverId,
      orderIds,
      desiredEndCity: tour.returnDeployment?.toCity || null,
      latestReturnMin: tour.latestReturnMin || null,
    });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (plan.error) return { ok: false, error: plan.error };

  // Hindernisse prüfen
  const obstacles = checkReassignObstacles(state, tour, newVehicle, newDriver, plan);

  // Alte vs. neue Planung vergleichen
  const oldStart = tour.deployments?.[0]?.startMin || state.gameTime;
  const oldEnd = tour.returnDeployment?.endMin || tour.deployments?.[tour.deployments.length - 1]?.endMin || state.gameTime;
  const newStart = plan.startMin;
  const newEnd = plan.endMin;

  return {
    ok: true,
    canConfirm: obstacles.hard.length === 0,
    obstacles,
    comparison: {
      oldStart, oldEnd, newStart, newEnd,
      oldVehicleId: tour.vehicleId,
      oldDriverId: tour.driverId,
      newVehicleId, newDriverId,
      totalContributionCents: plan.totalContributionCents,
    },
    affectedDeployments: orderIds.length,
  };
}

function checkReassignObstacles(state, tour, newVehicle, newDriver, plan) {
  const hard = [];
  const soft = [];

  // Fahrzeugkapazität
  for (const dep of (plan.deployments || [])) {
    const order = (state.orders || []).find(o => o.id === dep.orderId);
    if (order && order.tons > newVehicle.capacityTons) {
      hard.push({
        type: "capacity",
        message: "Auftrag " + order.customer + ": " + order.tons + " t überschreitet Kapazität von " + newVehicle.capacityTons + " t.",
      });
    }
  }

  // Fahrzeugzustand
  if (newVehicle.condition < 20) {
    hard.push({
      type: "condition",
      message: "Fahrzeugzustand zu schlecht (unter 20). Wartung erforderlich.",
    });
  }

  // Fahrer-Verfügbarkeit
  if (newDriver.status === "on_trip") {
    const trip = (state.trips || []).find(t => t.driverId === newDriver.id && t.status === "in_progress");
    if (trip && trip.endMin > plan.startMin) {
      hard.push({
        type: "driver_busy",
        message: "Fahrer ist bis " + formatGameTime(trip.endMin) + " auf anderer Tour.",
      });
    }
  }
  if (newDriver.status === "resting" && newDriver.restUntil > plan.startMin) {
    soft.push({
      type: "driver_resting",
      message: "Fahrer ist bis " + formatGameTime(newDriver.restUntil) + " in Ruhe. Tour beginnt danach.",
    });
  }

  // Abwesenheiten
  if (!isPersonAvailable(state, newDriver.id, plan.startMin)) {
    hard.push({
      type: "driver_absent",
      message: "Fahrer ist zum geplanten Startzeitpunkt abwesend (Urlaub/Krankheit).",
    });
  }

  // Fahrzeug-Verfügbarkeit
  if (newVehicle.status === "on_trip") {
    const trip = (state.trips || []).find(t => t.id === newVehicle.tripId);
    if (trip && trip.endMin > plan.startMin) {
      hard.push({
        type: "vehicle_busy",
        message: "Fahrzeug ist bis " + formatGameTime(trip.endMin) + " auf anderer Tour.",
      });
    }
  }
  if (newVehicle.status === "maintenance" && newVehicle.maintenanceUntil > plan.startMin) {
    hard.push({
      type: "vehicle_maintenance",
      message: "Fahrzeug ist bis " + formatGameTime(newVehicle.maintenanceUntil) + " in Wartung.",
    });
  }

  // Standort
  const vehicleFutureCity = futureLocation(state, newVehicle);
  const driverFutureCity = futureDriverLocation(state, newDriver);
  if (vehicleFutureCity !== driverFutureCity) {
    const travelMin = driveMinutes(getDistance(driverFutureCity, vehicleFutureCity));
    soft.push({
      type: "location_mismatch",
      message: "Fahrer ist in " + driverFutureCity + ", Fahrzeug in " + vehicleFutureCity + ". Anreise: " + travelMin + " Min.",
    });
  }

  // Vorausplanung
  const nextRes = nextReservationStart(state, newVehicle, newDriver);
  if (nextRes !== null && plan.endMin > nextRes) {
    hard.push({
      type: "reservation_conflict",
      message: "Neue Tour endet nach bestehender Vorausplanung (Start: " + formatGameTime(nextRes) + ").",
    });
  }

  // Lieferfristen
  for (const dep of (plan.deployments || [])) {
    if (dep.deliveryDeadlineMin && dep.endMin > dep.deliveryDeadlineMin + 240) {
      hard.push({
        type: "deadline",
        message: "Lieferung von " + dep.customer + " überschreitet die Frist (Ankunft " + formatGameTime(dep.endMin) + ", Frist " + formatGameTime(dep.deliveryDeadlineMin) + ").",
      });
    }
  }

  return { hard, soft };
}

// ---------- Wartung verschieben ----------

// Verschiebt eine noch nicht begonnene Wartung durch Stornieren und
// Neuerstellung. Die Werkstatt-Engine verarbeitet den neuen Auftrag,
// wenn ein Slot frei wird.
export function rescheduleMaintenance(state, { orderId }) {
  const order = (state.workshop?.maintenanceOrders || []).find(o => o.id === orderId);
  if (!order) throw new Error("Wartungsauftrag nicht gefunden.");
  if (["completed", "cancelled"].includes(order.status)) {
    throw new Error("Abgeschlossene oder stornierte Wartungen können nicht verschoben werden.");
  }
  if (order.materialConsumed) {
    throw new Error("Begonnene Wartung kann nicht verschoben werden.");
  }
  if (order.status === "in_progress") {
    throw new Error("Laufende Wartung kann nicht verschoben werden.");
  }

  // Daten für Neuerstellung sichern
  const vehicleId = order.vehicleId;
  const branchId = order.branchId;
  const type = order.type;
  const mechanicId = order.mechanicId;
  const isAutomated = order.isAutomated;

  // Alten Auftrag stornieren
  cancelMaintenanceOrder(state, { orderId });

  // Neuen Auftrag erstellen
  const result = createMaintenanceOrder(state, {
    vehicleId, branchId, type, isAutomated, mechanicId,
  });

  return {
    ok: true,
    oldOrderId: orderId,
    newOrderId: result.orderId,
    message: "Wartung wurde neu eingeplant. Die Werkstatt-Engine weist sie dem nächsten freien Slot zu.",
  };
}

// ---------- Passende Ressourcen finden ----------

export function findResourcesForOrder(state, orderId) {
  const order = (state.orders || []).find(o => o.id === orderId);
  if (!order) return { ok: false, error: "Auftrag nicht gefunden." };
  if (order.status !== "offered" && order.status !== "angenommen") {
    return { ok: false, error: "Auftrag ist nicht verfügbar (Status: " + order.status + ")." };
  }

  const candidates = [];

  for (const v of (state.vehicles || [])) {
    if (v.status === "sold" || v.status === "archived") continue;
    if (v.markedForSale) continue;
    if (v.capacityTons < order.tons) continue;
    if (v.condition < 20) continue;
    if (isLeasingOverdueBlocked(state, v.id)) continue;

    for (const d of (state.drivers || [])) {
      if (!isActivelyEmployed(d)) continue;
      if (d.attendance === "released") continue;

      // Plan probieren
      let plan;
      try {
        plan = buildTourPlan(state, {
          vehicleId: v.id, driverId: d.id,
          orderIds: [orderId],
          desiredEndCity: null, latestReturnMin: null,
        });
      } catch (e) { continue; }
      if (plan.error) continue;

      // Verfügbare Zeitfenster
      const earliest = earliestAvailable(state, v, d);
      const nextRes = nextReservationStart(state, v, d);

      const obstacles = [];
      if (v.status === "maintenance" && v.maintenanceUntil > plan.startMin) {
        obstacles.push("Fahrzeug in Wartung bis " + formatGameTime(v.maintenanceUntil));
      }
      if (!isPersonAvailable(state, d.id, plan.startMin)) {
        obstacles.push("Fahrer abwesend");
      }

      candidates.push({
        vehicleId: v.id,
        vehicleLabel: v.id,
        driverId: d.id,
        driverLabel: d.name,
        startMin: plan.startMin,
        endMin: plan.endMin,
        contributionCents: plan.totalContributionCents,
        fuelCents: plan.totalFuelCents,
        tollCents: plan.totalTollCents,
        deadlineBufferMin: plan.minDeadlineBuffer,
        obstacles,
        feasible: obstacles.length === 0,
      });
    }
  }

  // Sortieren: höchster Deckungsbeitrag zuerst
  candidates.sort((a, b) => b.contributionCents - a.contributionCents);

  return {
    ok: true,
    orderId,
    order: {
      customer: order.customer,
      fromCity: order.fromCity,
      toCity: order.toCity,
      tons: order.tons,
      deliveryDeadlineMin: order.deliveryDeadlineMin,
    },
    candidates: candidates.slice(0, 15),
  };
}

// ---------- Wartungsfenster suchen ----------

export function findMaintenanceWindows(state, vehicleId) {
  const v = (state.vehicles || []).find(x => x.id === vehicleId);
  if (!v) return { ok: false, error: "Fahrzeug nicht gefunden." };

  const windows = [];
  const now = state.gameTime;
  const horizonEnd = now + 7 * DAY_MIN;

  // Verfügbare Werkstattplätze
  const slots = (state.workshop?.slots || []).filter(s => s.status === "free" || s.status === "occupied");

  // Belegungs-Intervalle des Fahrzeugs sammeln
  const busyIntervals = [];
  if (v.status === "on_trip" && v.tripId) {
    const trip = (state.trips || []).find(t => t.id === v.tripId);
    if (trip) busyIntervals.push({ start: now, end: trip.endMin, reason: "Laufende Tour" });
  }
  for (const tour of (state.tours || [])) {
    if (tour.status !== "active" && tour.status !== "planned") continue;
    if (tour.pauseReason) continue;
    if (tour.vehicleId !== v.id) continue;
    for (const dep of (tour.deployments || [])) {
      if (dep.status !== "planned") continue;
      if (dep.startMin <= now) continue;
      busyIntervals.push({ start: dep.startMin, end: dep.endMin, reason: "Geplante Tour" });
    }
    if (tour.returnDeployment && tour.returnDeployment.status === "planned") {
      busyIntervals.push({
        start: tour.returnDeployment.startMin,
        end: tour.returnDeployment.endMin,
        reason: "Rückfahrt",
      });
    }
  }
  busyIntervals.sort((a, b) => a.start - b.start);

  // Freie Fenster finden (mindestens 8h = 480 Min)
  const MIN_WINDOW = 480;
  let cursor = now;
  for (const interval of busyIntervals) {
    if (interval.start - cursor >= MIN_WINDOW) {
      windows.push({
        startMin: cursor,
        endMin: interval.start,
        durationMin: interval.start - cursor,
        reason: "Frei vor " + interval.reason,
        quality: interval.start - cursor >= 720 ? "good" : "tight",
      });
    }
    cursor = Math.max(cursor, interval.end);
  }
  // Letztes Fenster bis Horizontende
  if (horizonEnd - cursor >= MIN_WINDOW) {
    windows.push({
      startMin: cursor,
      endMin: horizonEnd,
      durationMin: horizonEnd - cursor,
      reason: "Frei bis Horizontende",
      quality: "good",
    });
  }

  // Wenn keine Fenster gefunden: ganzes Intervall ist frei
  if (windows.length === 0 && busyIntervals.length === 0) {
    windows.push({
      startMin: now,
      endMin: horizonEnd,
      durationMin: horizonEnd - now,
      reason: "Komplett frei",
      quality: "good",
    });
  }

  return {
    ok: true,
    vehicleId,
    vehicleLabel: v.id,
    condition: v.condition,
    busyIntervals,
    windows: windows.slice(0, 10),
    availableSlots: slots.length,
  };
}