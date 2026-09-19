import { dispatcherProfile, dispatcherVehicleIds, tagDispatcherTour } from "./dispatcherQuality.ts";
import { isPersonInTraining } from "./trainingEngine.ts";
// Extrahiert aus simulationEngine.ts: Dispositions-Verarbeitung für Angestellte.
// Enthält processDispatcher, triggerDispatcherPlanning, processEmployees.
// Performance-optimiert: busyOrderIds-Set, Skip-Cache, reduzierte triggerDispatcher-Häufigkeit.

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
import { applyCleaningEffect } from "./serviceEngine.ts";
import { checkSpendAuthority, recordSpend, logDecision, createApprovalRequest, ROLE_AUTHORITY } from "./delegationEngine.ts";

// Lokale Kopie von uid (inkrementiert state.idCounter).
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Erzeugt eine natürliche Begründung für eine geplante Tour.
// Nutzt nur Planungsdaten, keine Zustandsänderung.
function buildTourReasoning(state, sug, primaryOrder) {
  const plan = sug.plan || {};
  const orderCount = (sug.orderIds || []).length;
  const vehicle = state.vehicles.find(v => v.id === sug.vehicleId);
  const driver = state.drivers.find(d => d.id === sug.driverId);
  const vehicleLabel = vehicle
    ? "Lkw " + String(parseInt(String(vehicle.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0")
    : sug.vehicleId;
  const parts = [];
  if (primaryOrder) {
    parts.push(`${primaryOrder.customer}: ${primaryOrder.fromCity} → ${primaryOrder.toCity} (${primaryOrder.tons} t)`);
  } else {
    parts.push(`${orderCount} Auftrag/Aufträge`);
  }
  parts.push(`Fahrer: ${driver ? driver.name : "—"}`);
  parts.push(`Beitrag: ${(plan.totalContributionCents || 0) / 100} €`);
  parts.push(`${plan.totalKm || 0} km`);
  return `${vehicleLabel} übernimmt ${orderCount} Auftrag/Aufträge — ` + parts.join(", ");
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
  // Inkrementelle Disposition: completeTrip löst planSingleVehicle aus,
  // sobald ein Fahrzeug frei wird. Die stündliche processEmployees-Runde
  // dient nur noch als Fallback (Fahrer aus Ruhe, Marktwellen-Orders).
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    if (emp.attendance !== "present") continue;
    if (emp.role === "dispatcher" || emp.role === "dispatcher_senior") {
      if (!isDispatcherOnShift(emp, m)) continue;
      // Keine _largeAdvance-abhängige Planungsfrequenz mehr: ein 2h-Skip
      // hätte neue Marktaufträge in großen Vorläufen bis zu 2h liegen lassen,
      // während 24×60 sie innerhalb 1h aufnimmt — unterschiedliche Ergebnisse.
      // Die kontextsensitive Skip-Cache in processDispatcher verhindert
      // redundante suggestTours-Aufrufe, wenn sich die Lage nicht geändert hat.
      processDispatcher(state, emp, m, log);
    } else if (inServiceHours && (emp.role === "accountant" || emp.role === "accountant_senior")) {
      processAccountant(state, emp, m, log);
    } else if (inServiceHours && emp.role === "cleaner") {
      processCleaner(state, emp, m, log);
    }
  }
}

// Reinigungskraft reinigt ihre zugewiesene Filiale.
// Wird einmal pro Tag beim ersten Dienstzeitpunkt ausgeführt.
// Trägt capacity-Einheiten zur Tagesreinigung bei.
function processCleaner(state, emp, m, log) {
  const day = dayOf(m);
  if (emp._lastCleaningDay === day) return;
  emp._lastCleaningDay = day;

  const branchId = emp.assignedBranchId || emp.branchId;
  if (!branchId) return;
  const branch = (state.branches || []).find(b => b.id === branchId);
  if (!branch || branch.status !== "active") return;

  const units = emp.capacity || 4;
  const dayId = "d" + day;
  const result = applyCleaningEffect(state, branchId, units, dayId);

  if (result.effect > 0) {
    log.push({ type: "cleaner_worked", employee: emp.id, branch: branchId, effect: result.effect, newCleanliness: result.newCleanliness, atMin: m });
  }
}

// Disponent verarbeitet seine zugewiesenen Lkw.
// Modus A: erstellt Vorschläge für freie Fahrzeuge mit angenommenen Aufträgen.
// Modus B/C: nutzt suggestTours für flottenweite Planung.
export function processDispatcher(state, emp, m, log) {
  if (isPersonInTraining(state, emp.id, m)) return;
  const profile = dispatcherProfile(state, emp);
  const managedVehicles = dispatcherVehicleIds(state, emp.id);
  const remainingCapacity = Math.max(0, profile.capacity - managedVehicles.size);
  if (emp.isTempStaff && Number.isFinite(emp.tempReturnMin) && emp.tempReturnMin <= m) return;
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
      fastMode: state._largeAdvance === false,
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
  // Bestehende Zusagen werden auch bei Überlastung gerettet. Für neue
  // Zusagen muss Betreuungskapazität frei sein; laufende Touren bleiben bestehen.
  const acceptNew = emp.workMode === "autonomous" && remainingCapacity > 0;
  // Effiziente-Tourenplanung-Qualifikation: längerer Horizont (72h) und
  // schnellere Reaktion (halbierte Skip-Cache-Zeiten) → weniger scheiternde Aufträge.
  const efficiencyQual = hasDispoEfficiency(state, emp.id);
  const horizonMin = profile.horizonMin;
  // Build Set of order IDs already in a trip or active tour.
  // Replaces O(orders × tours × deployments) nested .some() with O(1) lookups.
  const busyOrderIds = new Set();
  for (const tr of state.trips) {
    if (tr.status === "in_progress" && tr.orderId) busyOrderIds.add(tr.orderId);
  }
  for (const tr of (state.tours || [])) {
    if (tr.status !== "active") continue;
    for (const d of (tr.deployments || [])) {
      if (d.orderId && d.status !== "cancelled") busyOrderIds.add(d.orderId);
    }
  }
  // Überfällige angenommene Aufträge bereinigen: Aufträge deren Lieferfrist
  // + 4h Gnadenfrist abgelaufen ist, werden als "failed" markiert. Ohne diese
  // Bereinigung blieben sie ewig als "angenommen" stehen, blähen die
  // unplannedCount auf (→ Skip-Cache blockiert Neuplanung) und verhindern,
  // dass freie Lkw tatsächlich eingesetzt werden. Die Bereinigung in
  // processEventsAt läuft nur bei Zeitvorläufen — hier läuft sie bei jeder
  // Dispatcher-Runde, auch ohne Zeitvorlauf.
  for (const o of state.orders) {
    if (o.status === "angenommen" && o.deliveryDeadlineMin + 240 <= m) {
      o.status = "failed";
      o.failedAtMin = m;
      log.push({ type: "order_failed", order: o.id, customer: o.customer, reason: "Lieferfrist überschritten (Dispatcher-Bereinigung)" });
    }
  }
  const hasUnplannedAccepted = state.orders.some(o => o.status === "angenommen" && !busyOrderIds.has(o.id));
  const hasOfferedOrders = acceptNew && state.orders.some(o => o.status === "offered" && o.acceptDeadlineMin > m);
  if (!hasUnplannedAccepted && !hasOfferedOrders) {
    emp.lastIdleReason = acceptNew ? "Keine Aufträge auf dem Markt" : "Keine angenommenen Aufträge – autonomer Modus nötig";
    emp.lastIdleReasonAtMin = m;
    return;
  }

  // Skip-Cache: Vermeidet redundante suggestTours-Aufrufe wenn sich die Situation
  // seit dem letzten Planungsversuch nicht geändert hat.
  // Stufe 1: Wenn 0 Touren geplant wurden und die Lage unverändert ist,
  // 30 min überspringen (früher 120 min — das war zu lang und hat
  // Aufträge aufgestaut, weil Fahrer-Rückkehr aus Ruhe nicht erfasst wurde).
  // Stufe 2: Wenn Touren geplant wurden, aber keine neuen Aufträge seitdem
  // (unplannedCount unverändert), 60min überspringen — die bestehenden
  // Vorschläge sind noch gültig.
  // WICHTIG: freeDriverCount ist Teil des Context-Keys, damit die
  // Rückkehr eines Fahrers aus der Pause den Cache sofort invalidiert.
  const unplannedCount = state.orders.filter(o => o.status === "angenommen" && !busyOrderIds.has(o.id)).length;
  const offeredCount = hasOfferedOrders ? state.orders.filter(o => o.status === "offered" && o.acceptDeadlineMin > m).length : 0;
  const freeVehicleCount = poolVehicles.filter(v => v.status === "free" || v.status === "resting").length;
  const freeDriverCount = (state.drivers || []).filter(d =>
    d.employmentStatus === "employed" && d.attendance !== "released" &&
    (d.status === "free" || d.status === "resting")
  ).length;
  const contextKey = unplannedCount + ":" + offeredCount + ":" + freeVehicleCount + ":" + freeDriverCount;
  if (emp._lastPlanContext === contextKey) {
    // Wenn 0 Touren geplant wurden, überspringen. Der Context-Key erfasst
    // alle handlungsrelevanten Änderungen (neue Aufträge, freie Fahrzeuge,
    // zurückkehrende Fahrer) — bei unverändertem Context ist suggestTours
    // garantiert ergebnislos. Während eines bulk-Vorlaufs (state._bulkAdvance)
    // wird 60 Min übersprungen statt 10 — das reduziert suggestTours-Aufrufe
    // pro Tag von ~96 auf ~24, ohne dass Touren oder Lieferungen verloren
    // gehen. Außerhalb von Vorläufen bleibt die kurze 10-Min-Schwelle.
    const skipMin = state._bulkAdvance ? 60 : (efficiencyQual ? 5 : 10);
    if (emp._lastPlanPlanned === 0 && m - (emp.lastDecisionMin || 0) < skipMin) return;
    if (emp._lastPlanPlanned > 0 && unplannedCount === 0 && m - (emp.lastDecisionMin || 0) < (efficiencyQual ? 30 : 60)) return;
  }
  emp._lastPlanContext = contextKey;

  const result = suggestTours(state, {
    vehicleIds: poolVehicleIds, earliestStart: m, horizonMin,
    minNewOrderBufferMin: profile.bufferMin, candidateOrderLimit: profile.candidateOrderLimit,
    maxSuggestions: Math.max(1, remainingCapacity),
    desiredEndCity: null, latestReturnMin: null, mode: state.marketPriority || "balanced", acceptNew,
    fastMode: state._largeAdvance === false,
  });

  const usedVehicleIds = new Set();
  const usedOrderIds = new Set();
  let planned = 0;
  const capacity = Math.max(1, remainingCapacity);
  // Pro-Fahrzeug: konkreter Grund, warum die Tour nicht bestätigt wurde.
  // Wird für präzise Stillstandsgründe in der UI ausgewertet.
  const vehicleFailReasons = new Map();

  for (const sug of result.suggestions) {
    if (planned >= capacity) break;
    if (usedVehicleIds.has(sug.vehicleId)) continue;
    const allAvailable = sug.orderIds.every(oid => {
      if (usedOrderIds.has(oid)) return false;
      if (busyOrderIds.has(oid)) return false;
      const o = state.orders.find(x => x.id === oid);
      if (!o || (o.status !== "offered" && o.status !== "angenommen")) return false;
      return true;
    });
    if (!allAvailable) {
      vehicleFailReasons.set(sug.vehicleId, "Aufträge zwischenzeitlich nicht mehr verfügbar");
      continue;
    }
    const newOrderIds = sug.plan.acceptedOrderIds || [];
    if (newOrderIds.length > 0 && sug.plan.totalContributionCents <= 0) {
      vehicleFailReasons.set(sug.vehicleId, "Tour nicht profitabel (" + ((sug.plan.totalContributionCents || 0) / 100).toFixed(0) + " € Beitrag)");
      continue;
    }
    if (sug.orderIds.some(oid => state.orders.find(x => x.id === oid)?.isDangerousGoods) && !hasDgDispatch(state, emp.id)) {
      vehicleFailReasons.set(sug.vehicleId, "Gefahrgut-Befugnis fehlt beim Disponenten");
      continue;
    }

    // Budget-Prüfung: Kraftstoff + Maut für diese Tour
    const tourFuelCents = sug.plan.totalFuelCents || 0;
    const tourTollCents = sug.plan.totalTollCents || 0;
    const tourCostCents = tourFuelCents + tourTollCents;
    const authCheck = checkSpendAuthority(state, emp.id, tourCostCents, { branchId: emp.assignedBranchId || emp.branchId });
    if (!authCheck.allowed) {
      vehicleFailReasons.set(sug.vehicleId, "Freigabe ausstehend: " + authCheck.reason);
      // Freigabe anfordern wenn Kosten über Befugnis
      if (["maxSpendPerAction", "dailyBudget", "role_authority"].includes(authCheck.violatedRule)) {
        createApprovalRequest(state, {
          employeeId: emp.id, employeeName: emp.name, employeeRole: emp.role,
          branchId: emp.assignedBranchId || emp.branchId,
          type: "spend", title: "Tour-Kosten über Befugnis",
          description: `Tour für ${sug.orderIds.length} Auftrag(e) kostet ${(tourCostCents/100).toFixed(2)} € (Kraftstoff + Maut).`,
          reasoning: authCheck.reason,
          costCents: tourCostCents, violatedRule: authCheck.violatedRule,
          urgency: "medium", deadlineMin: null,
          actionData: { type: "tour", vehicleId: sug.vehicleId, driverId: sug.driverId, orderIds: sug.orderIds,
            desiredEndCity: sug.plan.desiredEndCity || null, latestReturnMin: sug.plan.latestReturnMin || null },
        });
      }
      continue;
    }
    // Begründung aus Planungsdaten (primaryOrder wird unten definiert)
    const _primaryOrder = state.orders.find(x => x.id === sug.orderIds[0]);
    const reasoning = buildTourReasoning(state, sug, _primaryOrder);
    try {
      const r = doConfirmTour(state, {
        vehicleId: sug.vehicleId, driverId: sug.driverId, orderIds: sug.orderIds,
        desiredEndCity: sug.plan.desiredEndCity || null, latestReturnMin: sug.plan.latestReturnMin || null,
      });
      tagDispatcherTour(state, r.tourId, emp.id);
      // Ausgabe im Tagesbudget erfassen
      if (tourCostCents > 0) recordSpend(state, emp.id, tourCostCents, emp.assignedBranchId || emp.branchId);
      // Entscheidung protokollieren
      logDecision(state, {
        employeeId: emp.id, employeeName: emp.name,
        type: "tour_planned", summary: `Tour für ${sug.orderIds.length} Auftrag(e) geplant`,
        reasoning, costCents: tourCostCents,
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
      vehicleFailReasons.set(sug.vehicleId, "Tour-Bestätigung fehlgeschlagen: " + e.message);
      log.push({ type: "dispatcher_plan_failed", employee: emp.id, orders: sug.orderIds, error: e.message, atMin: m });
    }
  }

  // Stillstandsgründe für ungenutzte Fahrzeuge dokumentieren.
  const suggestedVehicleIds = new Set(result.suggestions.map(s => s.vehicleId));
  for (const v of poolVehicles) {
    if (usedVehicleIds.has(v.id)) { v.idleReason = null; continue; }
    if (v.status === "on_trip") { v.idleReason = "Unterwegs"; continue; }
    if (v.status === "maintenance") {
      v.idleReason = v.maintenanceUntil
        ? "Wartung bis " + formatGameTime(v.maintenanceUntil)
        : "In Wartung (Dienstzeiten)";
      continue;
    }
    let reason = "Kein geeigneter Auftrag gefunden";
    if (v.condition < 20) {
      reason = "Zustand unter 20 – Wartung erforderlich";
    } else if (vehicleFailReasons.has(v.id)) {
      reason = vehicleFailReasons.get(v.id);
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
        const consideredOrders = (state.orders || []).filter(o =>
          (o.status === "offered" && o.acceptDeadlineMin > m) || o.status === "angenommen"
        ).length;
        reason = "Kein profitabler Auftrag gefunden (" + consideredOrders + " geprüft)";
      }
    }
    v.idleReason = reason;
    v.idleReasonAtMin = m;
  }
  // Backlog für Assistent und UI dokumentieren
  const stillBusy = new Set(busyOrderIds);
  for (const oid of usedOrderIds) stillBusy.add(oid);
  emp.backlogCount = (state.orders || []).filter(o => o.status === "angenommen" && !stillBusy.has(o.id)).length;

  emp.lastDecisionMin = m;
  emp._lastPlanPlanned = planned;
  emp.lastPlanningResult = { atMin: m, planned, totalVehicles: poolVehicles.length, usedVehicles: usedVehicleIds.size, suggested: result.suggestions.length };
}

// Inkrementelle Disposition: Plant sofort für ein einzelnes Fahrzeug,
// das gerade frei geworden ist (Tour-Ende). Deutlich effizienter als
// die stündliche Flotten-Vollscan über processDispatcher, da nur ein
// Fahrzeug × Fahrer × Aufträge durchsucht werden.
export function planSingleVehicle(state, vehicle, m, log) {
  if (vehicle.status !== "free" || vehicle.condition < 20 || vehicle.markedForSale) return;
  if (Number.isFinite(vehicle.rentalReturnMin) && vehicle.rentalReturnMin <= m) return;
  if (vehicle.ownership_type === "sold" || vehicle.ownership_type === "archived") return;

  // Überfällige angenommene Aufträge bereinigen (siehe processDispatcher).
  for (const o of state.orders) {
    if (o.status === "angenommen" && o.deliveryDeadlineMin + 240 <= m) {
      o.status = "failed";
      o.failedAtMin = m;
      log.push({ type: "order_failed", order: o.id, customer: o.customer, reason: "Lieferfrist überschritten (planSingleVehicle-Bereinigung)" });
    }
  }

  // Finde autonomen/dispatch_accepted Disponenten für diese Filiale
  const eligibleDispatchers = (state.employees || []).filter(e => {
    if (isPersonInTraining(state, e.id, m)) return false;
    if (!isActivelyEmployed(e) || e.attendance !== "present") return false;
    if (e.isTempStaff && Number.isFinite(e.tempReturnMin) && e.tempReturnMin <= m) return false;
    if (e.role !== "dispatcher" && e.role !== "dispatcher_senior") return false;
    if (e.workMode !== "autonomous" && e.workMode !== "dispatch_accepted") return false;
    if (!isDispatcherOnShift(e, m)) return false;
    const dispBranch = e.assignedBranchId !== undefined ? e.assignedBranchId : (e.branchId || null);
    if (dispBranch && dispBranch !== vehicle.branchId) return false;
    return true;
  });
  const dispatcher = eligibleDispatchers.find(e => dispatcherVehicleIds(state, e.id).size < dispatcherProfile(state, e).capacity) || eligibleDispatchers[0];
  if (!dispatcher) return;

  const profile = dispatcherProfile(state, dispatcher);
  const remainingCapacity = Math.max(0, profile.capacity - dispatcherVehicleIds(state, dispatcher.id).size);
  const acceptNew = dispatcher.workMode === "autonomous" && remainingCapacity > 0;
  const result = suggestTours(state, {
    vehicleIds: [vehicle.id], earliestStart: m, horizonMin: profile.horizonMin,
    minNewOrderBufferMin: profile.bufferMin, candidateOrderLimit: profile.candidateOrderLimit, maxSuggestions: 1,
    desiredEndCity: null, latestReturnMin: null,
    mode: state.marketPriority || "balanced", acceptNew,
    fastMode: state._largeAdvance === false,
  });
  if (result.suggestions.length === 0) return;

  const sug = result.suggestions[0];
  const newOrderIds = sug.plan.acceptedOrderIds || [];
  if (newOrderIds.length > 0 && sug.plan.totalContributionCents <= 0) return;
  if (sug.orderIds.some(oid => state.orders.find(x => x.id === oid)?.isDangerousGoods) && !hasDgDispatch(state, dispatcher.id)) return;

  // Auftragsverfügbarkeit prüfen
  const busyOrderIds = new Set();
  for (const tr of state.trips) { if (tr.status === "in_progress" && tr.orderId) busyOrderIds.add(tr.orderId); }
  for (const tr of (state.tours || [])) {
    if (tr.status !== "active") continue;
    for (const d of (tr.deployments || [])) { if (d.orderId && d.status !== "cancelled") busyOrderIds.add(d.orderId); }
  }
  if (sug.orderIds.some(oid => busyOrderIds.has(oid))) return;

  const cost = (sug.plan.totalFuelCents || 0) + (sug.plan.totalTollCents || 0);
  if (!checkSpendAuthority(state, dispatcher.id, cost, {branchId:vehicle.branchId}).allowed) return;
  try {
    const r = doConfirmTour(state, {
      vehicleId: sug.vehicleId, driverId: sug.driverId, orderIds: sug.orderIds,
      desiredEndCity: sug.plan.desiredEndCity || null, latestReturnMin: sug.plan.latestReturnMin || null,
    });
    tagDispatcherTour(state, r.tourId, dispatcher.id);
    if (cost > 0) recordSpend(state, dispatcher.id, cost, vehicle.branchId);
    const newlyAccepted = r.acceptedOrderIds || [];
    for (const oid of sug.orderIds) {
      const o = state.orders.find(x => x.id === oid);
      if (!o) continue;
      if (newlyAccepted.includes(oid)) {
        o.acceptedById = dispatcher.id; o.acceptedByName = dispatcher.name;
        o.history = o.history || [];
        o.history.push({ type: "accepted", min: m, actor: dispatcher.id, actorName: dispatcher.name });
        onOrderAccepted(state, o, dispatcher.id, m);
      }
      o.plannedById = dispatcher.id; o.plannedByName = dispatcher.name;
    }
    const tour = r.tour || { id: r.tourId, vehicleId: sug.vehicleId, driverId: sug.driverId, orderIds: sug.orderIds, startMin: m, endMin: r.endMin };
    onTourConfirmed(state, tour, dispatcher.id, m);
    log.push({ type: "dispatcher_planned", employee: dispatcher.id, orders: sug.orderIds, vehicle: sug.vehicleId, atMin: m, contributionCents: sug.plan.totalContributionCents });
  } catch (e) {
    // skip failed tour
  }
}

// Ereignisgesteuerte Dispositionsplanung außerhalb des regulären Diensttakts.
export function triggerDispatcherPlanning(state, m, log) {
  // Während eines bulk-Vorlaufs: ereignisgesteuerte Planung überspringen.
  // Die reguläre Planung läuft ohnehin alle 60 Min über processEmployees.
  // Die 15-Min-Ticks wurden bereits in earliestEventAfter entfernt, aber
  // andere Events (Phasenabschlüsse etc.) können auf m % 15 === 0 fallen.
  if (state._bulkAdvance) return;
  const clock = m % 1440;
  if (clock % SERVICE_INTERVAL_MIN === 0) return;
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    if (emp.attendance !== "present") continue;
    if (emp.role !== "dispatcher" && emp.role !== "dispatcher_senior") continue;
    if (emp.workMode !== "autonomous" && emp.workMode !== "dispatch_accepted") continue;
    if (!isDispatcherOnShift(emp, m)) continue;
    // Keine harte Sperre mehr — die kontextsensitive Skip-Cache in processDispatcher
    // verhindert redundante suggestTours-Aufrufe, wenn sich die Lage nicht geändert hat.
    // Eine harte 30-Minuten-Sperre hat Lkw nach Tour-Ende bis zu 30 Min stillstehen lassen.
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