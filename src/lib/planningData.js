// Planungsdaten-Schicht für die Wochenplanung.
// Reine, lesende Ableitung — verwaltet keine zweite Version von Zeiten,
// Zuweisungen oder Statuswerten. Alle Daten stammen aus dem Spielzustand.
//
// Die Funktion collectPlanningData(state, options) sammelt alle
// planungsrelevanten Ereignisse für einen Zeitraum und strukturiert
// sie nach Ressourcen-Typ (Fahrzeuge, Fahrer/Mitarbeiter, Werkstatt).

import { dayOf, clockOf, formatGameTime, getDistance, driveMinutes } from "@/lib/simulation/gameRules";
import { futureLocation, futureDriverLocation } from "@/lib/simulation/tourEngine";
import { isActivelyEmployed } from "@/lib/simulation/terminationEngine";
import { isPersonAvailable } from "@/lib/simulation/absenceEngine";

const DAY_MIN = 1440;

// ---------- Hilfsfunktionen ----------

function dayOfLocal(min) { return Math.floor(min / DAY_MIN) + 1; }
function midnightOf(min) { return Math.floor(min / DAY_MIN) * DAY_MIN; }

function vehicleLabel(v) {
  if (!v) return "—";
  const n = parseInt(String(v.id).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? v.id : "Lkw " + String(n).padStart(2, "0");
}

function driverLabel(d) {
  if (!d) return "—";
  return d.name || d.id;
}

// ---------- Block-Typen ----------
// Jeder Block hat einen type, der das Symbol und die Beschriftung bestimmt.
// Unterscheidung nicht allein über Farben — zusätzlich über Symbole.
export const BLOCK_TYPES = {
  loaded_drive:   { icon: "🚛", label: "Fahrt (beladen)", color: "lime" },
  empty_drive:    { icon: "🔄", label: "Leerfahrt", color: "cyan" },
  loading:        { icon: "📦", label: "Beladung", color: "amber" },
  unloading:      { icon: "📤", label: "Entladung", color: "amber" },
  break:          { icon: "☕", label: "Pause", color: "slate" },
  daily_rest:     { icon: "😴", label: "Ruhezeit", color: "indigo" },
  maintenance:    { icon: "🔧", label: "Wartung", color: "orange" },
  workshop:       { icon: "🏗️", label: "Werkstatt", color: "orange" },
  vacation:       { icon: "🏖️", label: "Urlaub", color: "teal" },
  sickness:       { icon: "🤒", label: "Krankheit", color: "rose" },
  training:       { icon: "🎓", label: "Weiterbildung", color: "violet" },
  mentoring:      { icon: "👥", label: "Mentoring", color: "purple" },
  travel:         { icon: "✈️", label: "Reise/Überstellung", color: "sky" },
  private:        { icon: "🏠", label: "Privater Termin", color: "coral" },
  free:           { icon: "✓", label: "Verfügbar", color: "green" },
  unplanned:      { icon: "⚠️", label: "Noch einzuplanen", color: "red" },
  expected:       { icon: "📋", label: "Erwarteter Bedarf", color: "yellow" },
};

// ---------- Hauptfunktion ----------

export function collectPlanningData(state, options) {
  const opts = options || {};
  const horizonDays = opts.horizonDays || 7;
  const now = state.gameTime;
  const horizonEnd = now + horizonDays * DAY_MIN;

  // 1. Fahrzeuge-Sicht
  const vehicles = collectVehicleBlocks(state, now, horizonEnd);

  // 2. Fahrer/Mitarbeiter-Sicht
  const personnel = collectPersonnelBlocks(state, now, horizonEnd);

  // 3. Werkstatt-Sicht
  const workshop = collectWorkshopBlocks(state, now, horizonEnd);

  // 4. Noch einzuplanen
  const unplanned = collectUnplannedOrders(state, now, horizonEnd);

  // 5. Erwarteter Bedarf (Rahmenverträge)
  const expectedDemand = collectExpectedDemand(state, now, horizonEnd);

  // 6. Private Termine
  const privateAppointments = collectPrivateAppointments(state, now, horizonEnd);

  // 7. Konflikte
  const conflicts = detectConflicts(state, now, horizonEnd);

  return {
    calculationMin: now,
    horizonDays,
    horizonStart: now,
    horizonEnd,
    vehicles,
    personnel,
    workshop,
    unplanned,
    expectedDemand,
    privateAppointments,
    conflicts,
  };
}

// ---------- Fahrzeug-Blöcke ----------

function collectVehicleBlocks(state, now, horizonEnd) {
  const rows = [];

  for (const v of (state.vehicles || [])) {
    if (v.status === "sold" || v.status === "archived") continue;
    const blocks = [];

    // 1. Laufender Trip mit Phasen
    if (v.status === "on_trip" && v.tripId) {
      const trip = (state.trips || []).find(t => t.id === v.tripId);
      if (trip && trip.phases) {
        for (const phase of trip.phases) {
          if (phase.endMin <= now) continue;
          if (phase.startMin >= horizonEnd) continue;
          blocks.push(makeBlock("trip_phase", phase.type, {
            startMin: Math.max(phase.startMin, now),
            endMin: Math.min(phase.endMin, horizonEnd),
            label: phaseLabel(phase, trip),
            sourceType: "trip",
            sourceId: trip.id + ":" + phase.type + ":" + phase.startMin,
            certainty: "running",
            linkedRef: { type: "trip", id: trip.id },
          }));
        }
      }
    }

    // 2. Geplante Tour-Deployments
    for (const tour of (state.tours || [])) {
      if (tour.status !== "active" && tour.status !== "planned") continue;
      if (tour.pauseReason) continue;
      if (tour.vehicleId !== v.id) continue;
      for (const dep of (tour.deployments || [])) {
        if (dep.status !== "planned") continue;
        if (dep.startMin <= now) continue;
        if (dep.startMin >= horizonEnd) continue;
        // Phasen des Deployments als Blöcke
        if (dep.phases) {
          for (const phase of dep.phases) {
            if (phase.endMin <= now) continue;
            if (phase.startMin >= horizonEnd) continue;
            blocks.push(makeBlock("tour_phase", phase.type, {
              startMin: Math.max(phase.startMin, now),
              endMin: Math.min(phase.endMin, horizonEnd),
              label: phaseLabel(phase, dep),
              sourceType: "tour",
              sourceId: tour.id + ":" + dep.orderId + ":" + phase.type + ":" + phase.startMin,
              certainty: "planned",
              linkedRef: { type: "tour", id: tour.id, orderId: dep.orderId },
            }));
          }
        } else {
          blocks.push(makeBlock("tour_deployment", "loaded_drive", {
            startMin: dep.startMin,
            endMin: dep.endMin,
            label: dep.customer + " → " + dep.toCity,
            sourceType: "tour",
            sourceId: tour.id + ":" + dep.orderId,
            certainty: "planned",
            linkedRef: { type: "tour", id: tour.id, orderId: dep.orderId },
          }));
        }
      }
      // Rückfahrt
      if (tour.returnDeployment && tour.returnDeployment.status === "planned") {
        const rd = tour.returnDeployment;
        if (rd.startMin > now && rd.startMin < horizonEnd) {
          if (rd.phases) {
            for (const phase of rd.phases) {
              if (phase.endMin <= now) continue;
              if (phase.startMin >= horizonEnd) continue;
              blocks.push(makeBlock("tour_phase", phase.type, {
                startMin: Math.max(phase.startMin, now),
                endMin: Math.min(phase.endMin, horizonEnd),
                label: "Rückfahrt: " + phaseLabel(phase, rd),
                sourceType: "tour",
                sourceId: tour.id + ":return:" + phase.type + ":" + phase.startMin,
                certainty: "planned",
                linkedRef: { type: "tour", id: tour.id },
              }));
            }
          }
        }
      }
    }

    // 3. Wartung (Status maintenance)
    if (v.status === "maintenance" && v.maintenanceUntil) {
      if (v.maintenanceUntil > now) {
        blocks.push(makeBlock("vehicle_maintenance", "maintenance", {
          startMin: now,
          endMin: Math.min(v.maintenanceUntil, horizonEnd),
          label: "Wartung bis " + clockOf(v.maintenanceUntil),
          sourceType: "vehicle",
          sourceId: v.id + ":maintenance",
          certainty: "running",
          linkedRef: { type: "vehicle", id: v.id },
        }));
      }
    }

    // 4. Werkstatt-Aufträge (geplante Wartung)
    for (const order of (state.workshop?.maintenanceOrders || [])) {
      if (order.vehicleId !== v.id) continue;
      if (["completed", "cancelled"].includes(order.status)) continue;
      if (order.startMin && order.startMin > now && order.startMin < horizonEnd) {
        const endMin = order.startMin + (order.requiredMinutes || 480);
        blocks.push(makeBlock("workshop_order", "workshop", {
          startMin: order.startMin,
          endMin: Math.min(endMin, horizonEnd),
          label: "Wartung: " + (order.type || "Standard"),
          sourceType: "workshop",
          sourceId: order.id,
          certainty: order.status === "in_progress" ? "running" : "planned",
          linkedRef: { type: "workshop_order", id: order.id },
        }));
      }
      // Laufende Wartung
      if (order.status === "in_progress" && order.workSessionStart) {
        blocks.push(makeBlock("workshop_order", "workshop", {
          startMin: Math.max(order.workSessionStart, now),
          endMin: horizonEnd,
          label: "Wartung laufend",
          sourceType: "workshop",
          sourceId: order.id + ":running",
          certainty: "running",
          linkedRef: { type: "workshop_order", id: order.id },
        }));
      }
    }

    // Blöcke sortieren
    blocks.sort((a, b) => a.startMin - b.startMin);

    rows.push({
      id: v.id,
      label: vehicleLabel(v),
      type: v.type || "Lkw",
      locationCity: futureLocation(state, v),
      currentCity: v.locationCity,
      status: v.status,
      condition: v.condition,
      capacityTons: v.capacityTons,
      branchId: v.branchId,
      blocks,
    });
  }

  return rows;
}

// ---------- Fahrer/Mitarbeiter-Blöcke ----------

function collectPersonnelBlocks(state, now, horizonEnd) {
  const rows = [];

  // Fahrer
  for (const d of (state.drivers || [])) {
    if (!isActivelyEmployed(d)) continue;
    const blocks = collectDriverBlocks(state, d, now, horizonEnd);
    rows.push({
      id: d.id,
      label: driverLabel(d),
      type: "Fahrer",
      role: "driver",
      locationCity: futureDriverLocation(state, d),
      currentCity: d.locationCity,
      status: d.status,
      branchId: d.branchId,
      portraitId: d.portraitId,
      blocks,
    });
  }

  // Angestellte
  for (const e of (state.employees || [])) {
    if (!isActivelyEmployed(e)) continue;
    const blocks = collectEmployeeBlocks(state, e, now, horizonEnd);
    rows.push({
      id: e.id,
      label: driverLabel(e),
      type: "Mitarbeiter",
      role: e.role,
      locationCity: e.locationCity,
      status: e.attendance || "present",
      branchId: e.branchId || e.assignedBranchId,
      portraitId: e.portraitId,
      blocks,
    });
  }

  return rows;
}

function collectDriverBlocks(state, d, now, horizonEnd) {
  const blocks = [];

  // 1. Laufender Trip mit Phasen
  if (d.status === "on_trip") {
    const trip = (state.trips || []).find(t => t.id === d.tripId || t.driverId === d.id);
    if (trip && trip.phases) {
      for (const phase of trip.phases) {
        if (phase.endMin <= now) continue;
        if (phase.startMin >= horizonEnd) continue;
        blocks.push(makeBlock("trip_phase", phase.type, {
          startMin: Math.max(phase.startMin, now),
          endMin: Math.min(phase.endMin, horizonEnd),
          label: phaseLabel(phase, trip),
          sourceType: "trip",
          sourceId: trip.id + ":" + phase.type + ":" + phase.startMin,
          certainty: "running",
          linkedRef: { type: "trip", id: trip.id },
        }));
      }
    }
  }

  // 2. Ruhezeit
  if (d.status === "resting" && d.restUntil && d.restUntil > now) {
    blocks.push(makeBlock("rest", "daily_rest", {
      startMin: now,
      endMin: Math.min(d.restUntil, horizonEnd),
      label: "Ruhe bis " + clockOf(d.restUntil),
      sourceType: "rest",
      sourceId: d.id + ":rest:" + d.restUntil,
      certainty: "running",
      linkedRef: { type: "driver", id: d.id },
    }));
  }

  // 3. Geplante Tour-Deployments
  for (const tour of (state.tours || [])) {
    if (tour.status !== "active" && tour.status !== "planned") continue;
    if (tour.pauseReason) continue;
    if (tour.driverId !== d.id) continue;
    for (const dep of (tour.deployments || [])) {
      if (dep.status !== "planned") continue;
      if (dep.startMin <= now) continue;
      if (dep.startMin >= horizonEnd) continue;
      if (dep.phases) {
        for (const phase of dep.phases) {
          if (phase.endMin <= now) continue;
          if (phase.startMin >= horizonEnd) continue;
          blocks.push(makeBlock("tour_phase", phase.type, {
            startMin: Math.max(phase.startMin, now),
            endMin: Math.min(phase.endMin, horizonEnd),
            label: phaseLabel(phase, dep),
            sourceType: "tour",
            sourceId: tour.id + ":" + dep.orderId + ":" + phase.type + ":" + phase.startMin,
            certainty: "planned",
            linkedRef: { type: "tour", id: tour.id, orderId: dep.orderId },
          }));
        }
      } else {
        blocks.push(makeBlock("tour_deployment", "loaded_drive", {
          startMin: dep.startMin,
          endMin: dep.endMin,
          label: dep.customer + " → " + dep.toCity,
          sourceType: "tour",
          sourceId: tour.id + ":" + dep.orderId,
          certainty: "planned",
          linkedRef: { type: "tour", id: tour.id, orderId: dep.orderId },
        }));
      }
    }
  }

  // 4. Abwesenheiten (Urlaub, Krankheit)
  collectAbsenceBlocks(state, d.id, now, horizonEnd, blocks);

  // 5. Weiterbildung
  collectTrainingBlocks(state, d.id, now, horizonEnd, blocks);

  // 6. Fahrer-Reisen (Überstellung)
  for (const tr of (state.driverTravels || [])) {
    if (tr.driverId !== d.id) continue;
    if (tr.status !== "in_progress") continue;
    if (tr.endMin <= now) continue;
    if (tr.startMin >= horizonEnd) continue;
    blocks.push(makeBlock("travel", "travel", {
      startMin: Math.max(tr.startMin, now),
      endMin: Math.min(tr.endMin, horizonEnd),
      label: "Reise → " + tr.toCity,
      sourceType: "travel",
      sourceId: tr.id,
      certainty: "running",
      linkedRef: { type: "travel", id: tr.id },
    }));
  }

  blocks.sort((a, b) => a.startMin - b.startMin);
  return blocks;
}

function collectEmployeeBlocks(state, e, now, horizonEnd) {
  const blocks = [];

  // Abwesenheiten
  collectAbsenceBlocks(state, e.id, now, horizonEnd, blocks);

  // Weiterbildung
  collectTrainingBlocks(state, e.id, now, horizonEnd, blocks);

  // Werkstatt-Aufträge (Mechaniker)
  if (e.role === "mechanic") {
    for (const order of (state.workshop?.maintenanceOrders || [])) {
      if (order.mechanicId !== e.id) continue;
      if (["completed", "cancelled"].includes(order.status)) continue;
      if (order.status === "in_progress" && order.workSessionStart) {
        blocks.push(makeBlock("workshop_order", "workshop", {
          startMin: Math.max(order.workSessionStart, now),
          endMin: horizonEnd,
          label: "Wartung: " + vehicleLabel({ id: order.vehicleId }),
          sourceType: "workshop",
          sourceId: order.id,
          certainty: "running",
          linkedRef: { type: "workshop_order", id: order.id },
        }));
      } else if (order.status === "planned" && order.startMin) {
        const endMin = order.startMin + (order.requiredMinutes || 480);
        blocks.push(makeBlock("workshop_order", "workshop", {
          startMin: order.startMin,
          endMin: Math.min(endMin, horizonEnd),
          label: "Wartung: " + vehicleLabel({ id: order.vehicleId }),
          sourceType: "workshop",
          sourceId: order.id,
          certainty: "planned",
          linkedRef: { type: "workshop_order", id: order.id },
        }));
      }
    }
  }

  blocks.sort((a, b) => a.startMin - b.startMin);
  return blocks;
}

// ---------- Abwesenheits-Blöcke ----------

function collectAbsenceBlocks(state, personId, now, horizonEnd, blocks) {
  // Urlaub
  for (const v of (state.absences?.vacations || [])) {
    if (v.personId !== personId) continue;
    if (v.status !== "approved" && v.status !== "active") continue;
    if (v.endMin <= now) continue;
    if (v.startMin >= horizonEnd) continue;
    blocks.push(makeBlock("vacation", "vacation", {
      startMin: Math.max(v.startMin, now),
      endMin: Math.min(v.endMin, horizonEnd),
      label: "Urlaub",
      sourceType: "vacation",
      sourceId: v.id,
      certainty: v.status === "active" ? "running" : "planned",
      linkedRef: { type: "vacation", id: v.id },
    }));
  }
  // Krankheit
  for (const s of (state.absences?.sicknesses || [])) {
    if (s.personId !== personId) continue;
    if (s.status !== "active") continue;
    if (s.endMin <= now) continue;
    if (s.startMin >= horizonEnd) continue;
    blocks.push(makeBlock("sickness", "sickness", {
      startMin: Math.max(s.startMin, now),
      endMin: Math.min(s.endMin, horizonEnd),
      label: "Krankheit",
      sourceType: "sickness",
      sourceId: s.id,
      certainty: "running",
      linkedRef: { type: "sickness", id: s.id },
    }));
  }
}

// ---------- Weiterbildungs-Blöcke ----------

function collectTrainingBlocks(state, personId, now, horizonEnd, blocks) {
  if (!state.training?.enrollments) return;
  for (const enr of state.training.enrollments) {
    if (enr.personId !== personId) continue;
    if (["cancelled", "completed"].includes(enr.status)) continue;
    for (const bs of (enr.blockStarts || [])) {
      if (bs + 480 <= now) continue;
      if (bs >= horizonEnd) continue;
      const course = state.training.courses?.find(c => c.id === enr.courseId);
      blocks.push(makeBlock("training", "training", {
        startMin: Math.max(bs, now),
        endMin: Math.min(bs + 480, horizonEnd),
        label: (course?.label || enr.courseId) + " (Block)",
        sourceType: "training",
        sourceId: enr.id + ":" + bs,
        certainty: enr.status === "reserved" ? "planned" : "running",
        linkedRef: { type: "training", id: enr.id },
      }));
    }
  }
  // Mentoring
  if (state.developmentGoals?.mentoringSessions) {
    for (const ms of state.developmentGoals.mentoringSessions) {
      if (ms.mentorId !== personId && ms.menteeId !== personId) continue;
      if (ms.status !== "scheduled") continue;
      if (ms.endMin <= now) continue;
      if (ms.startMin >= horizonEnd) continue;
      blocks.push(makeBlock("mentoring", "mentoring", {
        startMin: Math.max(ms.startMin, now),
        endMin: Math.min(ms.endMin, horizonEnd),
        label: "Mentoring",
        sourceType: "mentoring",
        sourceId: ms.id,
        certainty: "planned",
        linkedRef: { type: "mentoring", id: ms.id },
      }));
    }
  }
}

// ---------- Werkstatt-Blöcke ----------

function collectWorkshopBlocks(state, now, horizonEnd) {
  const rows = [];

  for (const slot of (state.workshop?.slots || [])) {
    const branch = (state.branches || []).find(b => b.id === slot.branchId);
    const blocks = [];

    for (const order of (state.workshop?.maintenanceOrders || [])) {
      if (order.slotId !== slot.id) continue;
      if (["completed", "cancelled"].includes(order.status)) continue;

      if (order.status === "in_progress" && order.workSessionStart) {
        blocks.push(makeBlock("workshop_order", "workshop", {
          startMin: Math.max(order.workSessionStart, now),
          endMin: horizonEnd,
          label: vehicleLabel({ id: order.vehicleId }) + " — " + (order.type || "Wartung"),
          sourceType: "workshop",
          sourceId: order.id,
          certainty: "running",
          linkedRef: { type: "workshop_order", id: order.id },
        }));
      } else if (order.status === "planned" && order.startMin) {
        const endMin = order.startMin + (order.requiredMinutes || 480);
        blocks.push(makeBlock("workshop_order", "workshop", {
          startMin: order.startMin,
          endMin: Math.min(endMin, horizonEnd),
          label: vehicleLabel({ id: order.vehicleId }) + " — " + (order.type || "Wartung"),
          sourceType: "workshop",
          sourceId: order.id,
          certainty: "planned",
          linkedRef: { type: "workshop_order", id: order.id },
        }));
      } else if (order.status === "waiting") {
        // Wartend auf Slot — als geplanter Block ohne feste Zeit
        blocks.push(makeBlock("workshop_order", "workshop", {
          startMin: now,
          endMin: now + 480,
          label: vehicleLabel({ id: order.vehicleId }) + " — wartet auf Slot",
          sourceType: "workshop",
          sourceId: order.id,
          certainty: "uncertain",
          linkedRef: { type: "workshop_order", id: order.id },
        }));
      }
    }

    blocks.sort((a, b) => a.startMin - b.startMin);

    rows.push({
      id: slot.id,
      label: "Werkstatt " + (branch?.name || slot.branchId),
      type: "Werkstattplatz",
      branchId: slot.branchId,
      status: slot.status,
      blocks,
    });
  }

  return rows;
}

// ---------- Noch einzuplanen ----------

function collectUnplannedOrders(state, now, horizonEnd) {
  const orders = [];

  // Bereits disponierte Auftrags-IDs sammeln
  const busyOrderIds = new Set();
  for (const tr of (state.trips || [])) {
    if (tr.status === "in_progress" && tr.orderId) busyOrderIds.add(tr.orderId);
  }
  for (const tour of (state.tours || [])) {
    if (tour.status !== "active" && tour.status !== "planned") continue;
    for (const dep of (tour.deployments || [])) {
      if (dep.orderId && dep.status !== "cancelled") busyOrderIds.add(dep.orderId);
    }
  }

  for (const o of (state.orders || [])) {
    if (o.status !== "angenommen") continue;
    if (busyOrderIds.has(o.id)) continue;
    if (o.deliveryDeadlineMin && o.deliveryDeadlineMin < now) continue;

    orders.push({
      id: o.id,
      customer: o.customer,
      fromCity: o.fromCity,
      toCity: o.toCity,
      cargo: o.cargo,
      tons: o.tons,
      paymentCents: o.paymentCents,
      deliveryDeadlineMin: o.deliveryDeadlineMin,
      isDangerousGoods: !!o.isDangerousGoods,
      isContractOrder: !!o.isContractOrder,
      contractId: o.contractId || null,
    });
  }

  return orders;
}

// ---------- Erwarteter Bedarf (Rahmenverträge) ----------

function collectExpectedDemand(state, now, horizonEnd) {
  const demands = [];

  if (!state.contracts?.contracts) return demands;

  for (const contract of state.contracts.contracts) {
    if (contract.status !== "active") continue;

    // Für jeden Tag im Horizont: wie viele Transporte werden erzeugt?
    const startDay = Math.max(dayOfLocal(now), contract.startDay);
    const endDay = Math.min(dayOfLocal(horizonEnd), contract.endDay);

    for (let day = startDay; day <= endDay; day++) {
      // Prüfen, ob für diesen Tag bereits Aufträge erzeugt wurden
      const dayStart = (day - 1) * DAY_MIN;
      for (let n = 1; n <= contract.transportsPerDay; n++) {
        const expectedOrderId = contract.id + ":d" + day + ":n" + n;
        const alreadyGenerated = (state.orders || []).some(o => o.id === expectedOrderId);
        if (alreadyGenerated) continue;

        demands.push({
          id: expectedOrderId,
          contractId: contract.id,
          customerName: contract.customerName,
          fromCity: contract.fromCity,
          toCity: contract.toCity,
          cargo: contract.cargo,
          tons: contract.tons,
          expectedDay: day,
          expectedStartMin: dayStart + 480,
          deliveryDeadlineMin: dayStart + contract.opMin + contract.deliveryBufferMin,
          paymentCents: contract.paymentPerTransportCents,
        });
      }
    }
  }

  return demands;
}

// ---------- Private Termine ----------

function collectPrivateAppointments(state, now, horizonEnd) {
  const appointments = [];

  for (const a of (state.appointments || [])) {
    if (["done", "missed", "declined", "cancelled"].includes(a.status)) continue;
    if (a.endMin <= now) continue;
    if (a.startMin >= horizonEnd) continue;

    appointments.push({
      id: a.id,
      type: a.type,
      text: a.text || a.type,
      startMin: Math.max(a.startMin, now),
      endMin: Math.min(a.endMin, horizonEnd),
      status: a.status,
      isPlayerBlocked: a.status === "active" && a.type !== "scenario_timeoff",
    });
  }

  return appointments;
}

// ---------- Konflikt-Erkennung ----------

function detectConflicts(state, now, horizonEnd) {
  const conflicts = [];

  // Doppelbelegung von Fahrzeugen
  for (const v of (state.vehicles || [])) {
    if (v.status === "sold" || v.status === "archived") continue;
    const intervals = [];
    // Laufende Trips
    if (v.status === "on_trip" && v.tripId) {
      const trip = (state.trips || []).find(t => t.id === v.tripId);
      if (trip) intervals.push({ start: trip.startMin, end: trip.endMin, source: "trip:" + trip.id });
    }
    // Geplante Deployments
    for (const tour of (state.tours || [])) {
      if (tour.status !== "active" && tour.status !== "planned") continue;
      if (tour.pauseReason) continue;
      if (tour.vehicleId !== v.id) continue;
      for (const dep of (tour.deployments || [])) {
        if (dep.status !== "planned") continue;
        if (dep.startMin <= now) continue;
        intervals.push({ start: dep.startMin, end: dep.endMin, source: "tour:" + tour.id });
      }
    }
    // Wartung
    if (v.status === "maintenance" && v.maintenanceUntil > now) {
      intervals.push({ start: now, end: v.maintenanceUntil, source: "maintenance:" + v.id });
    }
    // Überlappungen prüfen
    intervals.sort((a, b) => a.start - b.start);
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].start < intervals[i - 1].end) {
        conflicts.push({
          type: "vehicle_double_booking",
          resourceId: v.id,
          resourceLabel: vehicleLabel(v),
          message: vehicleLabel(v) + " ist doppelt belegt: " + intervals[i - 1].source + " und " + intervals[i].source,
          severity: "hard",
        });
      }
    }
  }

  // Doppelbelegung von Fahrern
  for (const d of (state.drivers || [])) {
    if (!isActivelyEmployed(d)) continue;
    const intervals = [];
    if (d.status === "on_trip") {
      const trip = (state.trips || []).find(t => t.driverId === d.id && t.status === "in_progress");
      if (trip) intervals.push({ start: trip.startMin, end: trip.endMin, source: "trip:" + trip.id });
    }
    for (const tour of (state.tours || [])) {
      if (tour.status !== "active" && tour.status !== "planned") continue;
      if (tour.pauseReason) continue;
      if (tour.driverId !== d.id) continue;
      for (const dep of (tour.deployments || [])) {
        if (dep.status !== "planned") continue;
        if (dep.startMin <= now) continue;
        intervals.push({ start: dep.startMin, end: dep.endMin, source: "tour:" + tour.id });
      }
    }
    // Abwesenheiten
    for (const v of (state.absences?.vacations || []) || []) {
      if (v.personId !== d.id) continue;
      if (v.status !== "approved" && v.status !== "active") continue;
      if (v.endMin <= now) continue;
      intervals.push({ start: Math.max(v.startMin, now), end: v.endMin, source: "vacation:" + v.id });
    }
    for (const s of (state.absences?.sicknesses || []) || []) {
      if (s.personId !== d.id) continue;
      if (s.status !== "active") continue;
      if (s.endMin <= now) continue;
      intervals.push({ start: Math.max(s.startMin, now), end: s.endMin, source: "sickness:" + s.id });
    }
    intervals.sort((a, b) => a.start - b.start);
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].start < intervals[i - 1].end) {
        conflicts.push({
          type: "driver_double_booking",
          resourceId: d.id,
          resourceLabel: driverLabel(d),
          message: driverLabel(d) + " hat eine Doppelbelegung: " + intervals[i - 1].source + " und " + intervals[i].source,
          severity: "hard",
        });
      }
    }
  }

  // Angenommene Aufträge mit ablaufender Frist
  for (const o of (state.orders || [])) {
    if (o.status !== "angenommen") continue;
    const hasTrip = (state.trips || []).some(t => t.orderId === o.id && t.status === "in_progress");
    const hasTour = (state.tours || []).some(t =>
      (t.status === "active" || t.status === "planned") &&
      (t.deployments || []).some(d => d.orderId === o.id && d.status !== "cancelled")
    );
    if (hasTrip || hasTour) continue;
    if (o.deliveryDeadlineMin && o.deliveryDeadlineMin < now + 480) {
      conflicts.push({
        type: "order_deadline_urgent",
        resourceId: o.id,
        resourceLabel: o.customer,
        message: "Auftrag " + o.customer + " (" + o.fromCity + " → " + o.toCity + ") muss dringend disponiert werden — Frist: " + formatGameTime(o.deliveryDeadlineMin),
        severity: "soft",
      });
    }
  }

  return conflicts;
}

// ---------- Hilfsfunktionen für Blöcke ----------

function makeBlock(category, blockType, opts) {
  const meta = BLOCK_TYPES[blockType] || BLOCK_TYPES.free;
  return {
    category,
    type: blockType,
    icon: meta.icon,
    colorClass: meta.color,
    typeLabel: meta.label,
    startMin: opts.startMin,
    endMin: opts.endMin,
    durationMin: opts.endMin - opts.startMin,
    label: opts.label || meta.label,
    sourceType: opts.sourceType,
    sourceId: opts.sourceId,
    certainty: opts.certainty || "planned",
    linkedRef: opts.linkedRef || null,
  };
}

function phaseLabel(phase, context) {
  const fromCity = phase.fromCity || context?.fromCity || "";
  const toCity = phase.toCity || context?.toCity || "";
  switch (phase.type) {
    case "empty_drive": return "Leerfahrt → " + toCity;
    case "loaded_drive": return fromCity + " → " + toCity;
    case "loading": return "Beladung " + fromCity;
    case "unloading": return "Entladung " + toCity;
    case "break": return "Fahrpause";
    case "daily_rest": return "Tagesruhe";
    default: return phase.type;
  }
}

// ---------- Formatierung ----------

export function formatPlanningTime(min) {
  if (min == null) return "—";
  return formatGameTime(min);
}

export function formatPlanningDay(min) {
  if (min == null) return "—";
  return "T" + dayOfLocal(min);
}

export function formatPlanningClock(min) {
  if (min == null) return "—";
  return clockOf(min);
}

export { dayOfLocal, midnightOf, DAY_MIN as PLANNING_DAY_MIN };