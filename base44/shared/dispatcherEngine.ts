// Dispositions-Engine für FERNWERK.
// Extrahiert aus simulationEngine: processDispatcher, triggerDispatcherPlanning,
// hasSituationChanged. Enthält DG-Annahmeprüfung (Auftrag 32).

import {
  dayOf, formatGameTime,
  SERVICE_START_MIN, SERVICE_END_MIN, SERVICE_INTERVAL_MIN,
} from "./gameRules.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { suggestTours, confirmTour as doConfirmTour } from "./tourEngine.ts";
import { onOrderAccepted, onTourConfirmed } from "./mailReports.ts";
import { pushEvent } from "./eventLog.ts";
import { hasDgDispatch } from "./trainingEngine.ts";

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// ---------- Angestellten-Verarbeitung ----------

export function processEmployees(state, m, log) {
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    if (emp.attendance !== "present") continue;
    if (emp.role === "dispatcher" || emp.role === "dispatcher_senior") {
      processDispatcher(state, emp, m, log);
    }
    if (emp.role === "accountant" || emp.role === "accountant_senior") {
      // processAccountant bleibt in simulationEngine (accountingEngine-Abhängigkeit)
      // wird dort aufgerufen – hier nicht duplizieren
    }
  }
}

// Disponent verarbeitet seine zugewiesenen Lkw.
function processDispatcher(state, emp, m, log) {
  const assignedVehicleIds = emp.assignedVehicleIds || [];
  const assignedVehicles = assignedVehicleIds.map(vid => state.vehicles.find(v => v.id === vid)).filter(Boolean);
  if (assignedVehicles.length === 0) {
    if ((emp.suggestions || []).length > 0) {
      emp.suggestions = [];
      log.push({ type: "dispatcher_suggestions_cleared", employee: emp.id, atMin: m, reason: "keine Lkw zugewiesen" });
    }
    return;
  }

  // ---------- Modus A: Vorschläge vorbereiten ----------
  if (emp.workMode === "suggestions") {
    const hasAcceptedOrders = state.orders.some(o => o.status === "angenommen");
    const hasFreeVehicles = assignedVehicles.some(v => v.status === "free" || v.status === "resting");
    if (!hasAcceptedOrders || !hasFreeVehicles) {
      if ((emp.suggestions || []).length > 0) {
        emp.suggestions = [];
        log.push({ type: "dispatcher_suggestions_cleared", employee: emp.id, atMin: m, reason: "keine Aufträge oder freie Fahrzeuge" });
      }
      return;
    }
    const existingValid = (emp.suggestions || []).filter(s => s.status === "pending");
    if (existingValid.length > 0) {
      if (!hasSituationChanged(state, emp, existingValid)) return;
    }
    const result = suggestTours(state, {
      vehicleIds: assignedVehicleIds, earliestStart: m, horizonMin: 2880,
      desiredEndCity: null, latestReturnMin: null, mode: "balanced", acceptNew: false,
    });
    emp.suggestions = (emp.suggestions || []).filter(s => s.status !== "pending");
    for (const s of result.suggestions) {
      const sug = {
        id: uid(state, "sug"), employeeId: emp.id, employeeName: emp.name, createdAtMin: m,
        vehicleId: s.vehicleId, driverId: s.driverId, orderIds: s.orderIds, plan: s.plan, status: "pending",
      };
      emp.suggestions.push(sug);
      log.push({ type: "dispatcher_suggestion", employee: emp.id, suggestion: sug.id, vehicle: s.vehicleId, atMin: m });
    }
    emp.lastDecisionMin = m;
    return;
  }

  // ---------- Modus B/C: flottenweite Planung ----------
  const acceptNew = emp.workMode === "autonomous";
  const hasAcceptedOrders = state.orders.some(o =>
    o.status === "angenommen" && !state.trips.some(t => t.orderId === o.id && t.status === "in_progress")
  );
  const hasOfferedOrders = acceptNew && state.orders.some(o => o.status === "offered" && o.acceptDeadlineMin > m);
  if (!hasAcceptedOrders && !hasOfferedOrders) {
    emp.lastIdleReason = "Keine Aufträge zu vergeben";
    emp.lastIdleReasonAtMin = m;
    return;
  }

  const result = suggestTours(state, {
    vehicleIds: assignedVehicleIds, earliestStart: m, horizonMin: 72 * 60,
    desiredEndCity: null, latestReturnMin: null, mode: "balanced", acceptNew,
  });

  const usedVehicleIds = new Set();
  const usedOrderIds = new Set();
  let planned = 0;
  const canDispatchDg = hasDgDispatch(state, emp.id);

  for (const sug of result.suggestions) {
    if (usedVehicleIds.has(sug.vehicleId)) continue;
    const allAvailable = sug.orderIds.every(oid => {
      if (usedOrderIds.has(oid)) return false;
      const o = state.orders.find(x => x.id === oid);
      return o && (o.status === "offered" || o.status === "angenommen");
    });
    if (!allAvailable) continue;
    const newOrderIds = sug.plan.acceptedOrderIds || [];
    if (newOrderIds.length > 0 && sug.plan.totalContributionCents <= 0) continue;
    // DG-Annahmeprüfung (Auftrag 32): dispo_dg erforderlich für autonome DG-Annahme
    const hasDgOrder = sug.orderIds.some(oid => {
      const o = state.orders.find(x => x.id === oid);
      return o && o.isDangerousGoods;
    });
    if (hasDgOrder && !canDispatchDg) continue;

    try {
      const r = doConfirmTour(state, {
        vehicleId: sug.vehicleId, driverId: sug.driverId, orderIds: sug.orderIds,
        desiredEndCity: sug.plan.desiredEndCity || null, latestReturnMin: sug.plan.latestReturnMin || null,
      });
      usedVehicleIds.add(sug.vehicleId);
      sug.orderIds.forEach(oid => usedOrderIds.add(oid));
      planned++;
      const vehicle = state.vehicles.find(v => v.id === sug.vehicleId);
      const driver = state.drivers.find(d => d.id === sug.driverId);
      const newlyAccepted = r.acceptedOrderIds || [];
      for (const oid of sug.orderIds) {
        const o = state.orders.find(x => x.id === oid);
        if (!o) continue;
        if (newlyAccepted.includes(oid)) {
          o.acceptedById = emp.id; o.acceptedByName = emp.name;
          o.history = o.history || [];
          o.history.push({ type: "accepted", min: m, actor: emp.id, actorName: emp.name });
          onOrderAccepted(state, o, emp.id, m);
          pushEvent(state, {
            type: "order_accepted_by_dispatcher",
            gameTime: m, employeeId: emp.id, employeeName: emp.name, portraitId: emp.portraitId,
            orderIds: [oid], tourId: r.tourId, vehicleId: sug.vehicleId, driverId: sug.driverId,
            details: {
              customer: o.customer, fromCity: o.fromCity, toCity: o.toCity,
              cargo: o.cargo, tons: o.tons, paymentCents: o.paymentCents,
              deliveryDeadlineMin: o.deliveryDeadlineMin,
            },
            dedupKey: "order_accepted:" + oid + ":" + emp.id,
          });
        }
        o.plannedById = emp.id; o.plannedByName = emp.name;
        o.history = o.history || [];
        o.history.push({ type: "planned", min: m, actor: emp.id, actorName: emp.name, details: { vehicleId: sug.vehicleId, driverId: sug.driverId } });
      }
      const primaryOrder = state.orders.find(x => x.id === sug.orderIds[0]);
      pushEvent(state, {
        type: "tour_planned_by_dispatcher",
        gameTime: m, employeeId: emp.id, employeeName: emp.name, portraitId: emp.portraitId,
        orderIds: sug.orderIds, tourId: r.tourId, vehicleId: sug.vehicleId, driverId: sug.driverId,
        details: {
          vehicleLabel: vehicle ? "Lkw " + String(parseInt(String(vehicle.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0") : sug.vehicleId,
          driverName: driver ? driver.name : sug.driverId,
          startMin: m, endMin: r.endMin || m,
          totalContributionCents: sug.plan.totalContributionCents,
          totalKm: sug.plan.totalKm,
          customer: primaryOrder?.customer,
          fromCity: primaryOrder?.fromCity,
          toCity: primaryOrder?.toCity,
          paymentCents: primaryOrder?.paymentCents,
        },
        dedupKey: "tour_planned:" + r.tourId + ":" + emp.id,
      });
      emp.dailyStats = emp.dailyStats || { day: dayOf(m), offersChecked: 0, ordersAccepted: 0, ordersPlanned: 0, toursStarted: 0 };
      if (emp.dailyStats.day !== dayOf(m)) emp.dailyStats = { day: dayOf(m), offersChecked: 0, ordersAccepted: 0, ordersPlanned: 0, toursStarted: 0 };
      if (acceptNew) {
        for (const oid of newlyAccepted) {
          emp.dailyStats.ordersAccepted = (emp.dailyStats.ordersAccepted || 0) + 1;
        }
      }
      emp.dailyStats.ordersPlanned = (emp.dailyStats.ordersPlanned || 0) + 1;
      emp.dailyStats.toursStarted = (emp.dailyStats.toursStarted || 0) + 1;
      const tour = r.tour || { id: r.tourId, vehicleId: sug.vehicleId, driverId: sug.driverId, orderIds: sug.orderIds, startMin: m, endMin: r.endMin };
      onTourConfirmed(state, tour, emp.id, m);
      log.push({ type: "dispatcher_planned", employee: emp.id, orders: sug.orderIds, vehicle: sug.vehicleId, atMin: m, contributionCents: sug.plan.totalContributionCents });
    } catch (e) {
      log.push({ type: "dispatcher_plan_failed", employee: emp.id, orders: sug.orderIds, error: e.message, atMin: m });
    }
  }

  for (const v of assignedVehicles) {
    if (usedVehicleIds.has(v.id)) { v.idleReason = null; continue; }
    if (v.status === "on_trip") { v.idleReason = "Unterwegs"; continue; }
    if (v.status === "maintenance") { v.idleReason = "Wartung bis " + formatGameTime(v.maintenanceUntil); continue; }
    let reason = "Kein geeigneter Auftrag gefunden";
    if (v.condition < 20) reason = "Zustand unter 20 – Wartung erforderlich";
    else if (!state.drivers.some(d => d.locationCity === v.locationCity && (d.status === "free" || d.status === "resting") && d.employmentStatus === "employed")) {
      reason = "Kein Fahrer am Standort " + v.locationCity;
    } else if (!hasAcceptedOrders && !hasOfferedOrders) {
      reason = "Keine Aufträge verfügbar";
    }
    v.idleReason = reason;
    v.idleReasonAtMin = m;
  }
  emp.lastDecisionMin = m;
  emp.lastPlanningResult = { atMin: m, planned, totalVehicles: assignedVehicles.length, usedVehicles: usedVehicleIds.size };
}

export function triggerDispatcherPlanning(state, m, log) {
  const clock = m % 1440;
  if (clock < SERVICE_START_MIN || clock > SERVICE_END_MIN) return;
  if (clock % SERVICE_INTERVAL_MIN === 0) return;
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    if (emp.attendance !== "present") continue;
    if (emp.role !== "dispatcher" && emp.role !== "dispatcher_senior") continue;
    if (emp.workMode !== "autonomous" && emp.workMode !== "dispatch_accepted") continue;
    if ((emp.assignedVehicleIds || []).length === 0) continue;
    if (emp.lastDecisionMin === m) continue;
    processDispatcher(state, emp, m, log);
  }
}

function hasSituationChanged(state, emp, existingSuggestions) {
  const acceptedOrders = state.orders.filter(o => o.status === "angenommen");
  const coveredOrderIds = new Set();
  for (const s of existingSuggestions) {
    for (const oid of s.orderIds) coveredOrderIds.add(oid);
  }
  const uncovered = acceptedOrders.filter(o => !coveredOrderIds.has(o.id));
  if (uncovered.length > 0) return true;
  for (const s of existingSuggestions) {
    const v = state.vehicles.find(x => x.id === s.vehicleId);
    if (!v || (v.status !== "free" && v.status !== "resting")) return true;
  }
  return false;
}