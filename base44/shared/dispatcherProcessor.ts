// Extrahiert aus simulationEngine.ts: Dispositions-Verarbeitung für Angestellte.
// Enthält processDispatcher, triggerDispatcherPlanning, processEmployees.
// Effiziente-Tourenplanung-Qualifikation: längerer Horizont (72h) und
// schnellere Reaktion (halbierte Cooldown-Zeiten) → weniger scheiternde Aufträge.

import {
  dayOf, formatGameTime,
  SERVICE_START_MIN, SERVICE_END_MIN, SERVICE_INTERVAL_MIN,
} from "./gameRules.ts";
import {
  suggestTours, confirmTour as doConfirmTour,
  futureLocation, futureDriverLocation,
} from "./tourEngine.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { onOrderAccepted, onTourConfirmed } from "./mailReports.ts";
import { hasDgDispatch, hasDispoEfficiency } from "./trainingEngine.ts";
import { processAccountant } from "./accountingEngine.ts";

// Lokale Kopie von uid (inkrementiert state.idCounter).
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Prüft, ob ein Disponent innerhalb seiner Schicht ist.
// Nachtschichten können über Mitternacht hinausgehen (startMin > endMin).
function isDispatcherOnShift(emp, gameMinute) {
  const clock = gameMinute % 1440;
  const start = emp.shiftStart ?? SERVICE_START_MIN;
  const end = emp.shiftEnd ?? SERVICE_END_MIN;
  if (start <= end) {
    return clock >= start && clock < end;
  } else {
    return clock >= start || clock < end;
  }
}

// Wird an Dienstzeitpunkten (08:00–16:00, alle 60 min) aufgerufen.
export function processEmployees(state, m, log) {
  const clock = m % 1440;
  const inServiceHours = clock >= SERVICE_START_MIN && clock < SERVICE_END_MIN;
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    if (emp.attendance !== "present") continue;
    if (emp.role === "dispatcher" || emp.role === "dispatcher_senior") {
      if (!isDispatcherOnShift(emp, m)) continue;
      processDispatcher(state, emp, m, log);
    } else if (inServiceHours && (emp.role === "accountant" || emp.role === "accountant_senior")) {
      processAccountant(state, emp, m, log);
    }
  }
}

// Disponent verarbeitet seine zugewiesenen Lkw.
// Modus A: erstellt Vorschläge für freie Fahrzeuge mit angenommenen Aufträgen.
// Modus B/C: nutzt suggestTours für flottenweite Planung mit Erholung, Rückladungen,
//   Liquiditätsprüfung und Rentabilitätsfilter. Berücksichtigt auch ruhende Fahrer
//   und zurückkehrende Fahrzeuge über earliestAvailable.
export function processDispatcher(state, emp, m, log) {
  // Firmenpool: Alle nicht verkauften, nicht vorgemerkten Fahrzeuge.
  let poolVehicles = state.vehicles.filter(v =>
    v.status !== "sold" && v.status !== "archived" && !v.markedForSale
  );
  const _bf = emp.assignedBranchId !== undefined ? emp.assignedBranchId : (emp.branchId || null);
  if (_bf) poolVehicles = poolVehicles.filter(v => v.branchId === _bf);
  const poolVehicleIds = poolVehicles.map(v => v.id);
  if (poolVehicles.length === 0) {
    if ((emp.suggestions || []).length > 0) {
      emp.suggestions = [];
      log.push({ type: "dispatcher_suggestions_cleared", employee: emp.id, atMin: m, reason: "keine Lkw im Firmenpool" });
    }
    return;
  }

  // ---------- Modus A: Vorschläge vorbereiten ----------
  if (emp.workMode === "suggestions") {
    const hasAcceptedOrders = state.orders.some(o => o.status === "angenommen");
    const hasFreeVehicles = poolVehicles.some(v => v.status === "free" || v.status === "resting");
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
      vehicleIds: poolVehicleIds, earliestStart: m, horizonMin: 2880,
      desiredEndCity: null, latestReturnMin: null, mode: state.marketPriority || "balanced", acceptNew: false,
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

  // ---------- Modus B/C: flottenweite Planung mit suggestTours ----------
  const acceptNew = emp.workMode === "autonomous";
  // Effiziente-Tourenplanung-Qualifikation: längerer Horizont (72h) und
  // schnellere Reaktion (halbierte Cooldown-Zeiten) → weniger scheiternde Aufträge.
  const efficiencyQual = hasDispoEfficiency(state, emp.id);
  const horizonMin = efficiencyQual ? 72 * 60 : 48 * 60;
  // Prüfe, ob es angenommene Aufträge gibt, die noch nicht Teil einer
  // aktiven Tour sind (verhindert unnötige Planversuche).
  const hasUnplannedAccepted = state.orders.some(o =>
    o.status === "angenommen" && o.deliveryDeadlineMin > m - 240 &&
    !state.trips.some(t => t.orderId === o.id && t.status === "in_progress") &&
    !(state.tours || []).some(t => t.status === "active" && (t.deployments || []).some(d => d.orderId === o.id && d.status !== "cancelled"))
  );
  const hasOfferedOrders = acceptNew && state.orders.some(o => o.status === "offered" && o.acceptDeadlineMin > m);
  if (!hasUnplannedAccepted && !hasOfferedOrders) {
    emp.lastIdleReason = acceptNew ? "Keine Aufträge auf dem Markt" : "Keine angenommenen Aufträge – autonomer Modus nötig";
    emp.lastIdleReasonAtMin = m;
    return;
  }

  // suggestTours berücksichtigt auch ruhende Fahrer und zurückkehrende Fahrzeuge
  const result = suggestTours(state, {
    vehicleIds: poolVehicleIds, earliestStart: m, horizonMin,
    desiredEndCity: null, latestReturnMin: null, mode: state.marketPriority || "balanced", acceptNew,
  });

  const usedVehicleIds = new Set();
  const usedOrderIds = new Set();
  let planned = 0;

  // Kapazität: Mindestens so viele Touren wie Fahrzeuge im Pool.
  const capacity = Math.max(emp.capacity || 6, poolVehicles.length);
  for (const sug of result.suggestions) {
    if (planned >= capacity) break;
    if (usedVehicleIds.has(sug.vehicleId)) continue;
    // Aufträge noch verfügbar?
    const allAvailable = sug.orderIds.every(oid => {
      if (usedOrderIds.has(oid)) return false;
      const o = state.orders.find(x => x.id === oid);
      if (!o || (o.status !== "offered" && o.status !== "angenommen")) return false;
      if ((state.tours || []).some(t => t.status === "active" && (t.deployments || []).some(d => d.orderId === oid && d.status !== "cancelled"))) return false;
      return true;
    });
    if (!allAvailable) continue;
    // Rentabilitätsprüfung: Nur positive Beiträge bei Neuaufträgen
    const newOrderIds = sug.plan.acceptedOrderIds || [];
    if (newOrderIds.length > 0 && sug.plan.totalContributionCents <= 0) continue;
    // DG-Annahmeprüfung: dispo_dg erforderlich
    if (sug.orderIds.some(oid => state.orders.find(x => x.id === oid)?.isDangerousGoods) && !hasDgDispatch(state, emp.id)) continue;

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

  // Stillstandsgründe für ungenutzte Fahrzeuge dokumentieren.
  const suggestedVehicleIds = new Set(result.suggestions.map(s => s.vehicleId));
  for (const v of poolVehicles) {
    if (usedVehicleIds.has(v.id)) { v.idleReason = null; continue; }
    if (v.status === "on_trip") { v.idleReason = "Unterwegs"; continue; }
    if (v.status === "maintenance") { v.idleReason = "Wartung bis " + formatGameTime(v.maintenanceUntil); continue; }
    let reason = "Kein geeigneter Auftrag gefunden";
    if (v.condition < 20) {
      reason = "Zustand unter 20 – Wartung erforderlich";
    } else if (suggestedVehicleIds.has(v.id)) {
      reason = "Tour-Bestätigung fehlgeschlagen";
    } else {
      const futureCity = futureLocation(state, v);
      const hasDriverAtLocation = state.drivers.some(d =>
        d.employmentStatus === "employed" &&
        d.attendance !== "released" &&
        (d.status === "free" || d.status === "resting" || d.status === "on_trip") &&
        futureDriverLocation(state, d) === futureCity
      );
      if (!hasDriverAtLocation) {
        const driverCount = state.drivers.filter(d => d.employmentStatus === "employed" && d.attendance !== "released").length;
        const freeDriverCount = state.drivers.filter(d => d.employmentStatus === "employed" && d.attendance !== "released" && d.status === "free").length;
        reason = driverCount === 0
          ? "Keine Fahrer eingestellt"
          : freeDriverCount === 0
            ? "Alle Fahrer ruhen/auf Tour (" + driverCount + " Fahrer, keine freien für " + poolVehicles.length + " Lkw)"
            : "Kein freier Fahrer am Standort " + v.locationCity + " (" + freeDriverCount + " freie Fahrer für " + poolVehicles.length + " Lkw, Cross-City-Suche eingeplant)";
      } else if (!hasUnplannedAccepted && !hasOfferedOrders) {
        reason = acceptNew ? "Keine (profitablen) Aufträge verfügbar" : "Keine angenommenen Aufträge – autonomer Modus oder manuelle Annahme nötig";
      } else {
        reason = "Kein profitabler Auftrag gefunden";
      }
    }
    v.idleReason = reason;
    v.idleReasonAtMin = m;
  }
  emp.lastDecisionMin = m;
  emp.lastPlanningResult = { atMin: m, planned, totalVehicles: poolVehicles.length, usedVehicles: usedVehicleIds.size, suggested: result.suggestions.length };
}

// Ereignisgesteuerte Dispositionsplanung: ruft processDispatcher für alle
// autonomen/disponierenden Disponenten außerhalb des regulären Diensttakts auf.
// Vermeidet Doppelverarbeitung in derselben Spielminute.
export function triggerDispatcherPlanning(state, m, log) {
  const clock = m % 1440;
  if (clock % SERVICE_INTERVAL_MIN === 0) return; // Bereits durch processEmployees abgedeckt
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    if (emp.attendance !== "present") continue;
    if (emp.role !== "dispatcher" && emp.role !== "dispatcher_senior") continue;
    if (emp.workMode !== "autonomous" && emp.workMode !== "dispatch_accepted") continue;
    if (!isDispatcherOnShift(emp, m)) continue;
    // CPU-Schutz: höchstens alle 15 Spielminuten pro Disponent.
    // Mit Effiziente-Tourenplanung-Qualifikation: 7 Min für schnellere Reaktion.
    const cooldown = hasDispoEfficiency(state, emp.id) ? 7 : 15;
    if (m - (emp.lastDecisionMin || 0) < cooldown) continue;
    processDispatcher(state, emp, m, log);
  }
}

// Prüft, ob sich die Situation seit der letzten Vorschlagserstellung geändert hat.
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