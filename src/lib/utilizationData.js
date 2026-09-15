// Auslastungs-Analyse für die Flotten-Übersichtsseite.
// Berechnet pro Fahrzeug und pro Filiale die Auslastung, Erlöse,
// Ineffizienz-Flags und konkrete Handlungsbedarfe — rein aus dem Zustand.

import { vehicleDisplayName, workModeLabel } from "./displayHelpers";
import { formatEuro } from "./gameData";

const DEFAULT_DAYS = 7;

// ---------- Pro-Fahrzeug Auslastung ----------

// Anteil der Tage (der letzten N Tage) an denen das Fahrzeug auf Tour war.
export function getVehicleUtilization(state, vehicleId, days = DEFAULT_DAYS) {
  const today = Math.floor(state.gameTime / 1440);
  const trips = (state.trips || []).filter(t => t.vehicleId === vehicleId);
  let activeDays = 0;
  for (let i = 0; i < days; i++) {
    const dayStart = (today - days + 1 + i) * 1440;
    const dayEnd = dayStart + 1440;
    const wasActive = trips.some(t =>
      t.startMin < dayEnd && (t.endMin != null ? t.endMin : t.startMin) > dayStart
    );
    if (wasActive) activeDays++;
  }
  return Math.round((activeDays / days) * 100);
}

// Erlös und Lieferungen eines Fahrzeugs in den letzten N Tagen.
export function getVehicleRevenue(state, vehicleId, days = DEFAULT_DAYS) {
  const today = Math.floor(state.gameTime / 1440);
  const cutoff = (today - days) * 1440;
  let revenue = 0;
  let deliveries = 0;
  for (const o of (state.orders || [])) {
    if (o.status !== "geliefert" || o.deliveredAtMin == null) continue;
    if (o.deliveredAtMin < cutoff) continue;
    const trip = (state.trips || []).find(t => t.orderId === o.id && t.vehicleId === vehicleId);
    if (trip) { revenue += o.paidCents || 0; deliveries++; }
  }
  return { revenue, deliveries };
}

// Vollständiges Auslastungs-Detail pro Fahrzeug mit Ineffizienz-Flags.
export function getVehicleUtilizationDetail(state, vehicle, days = DEFAULT_DAYS) {
  const v = vehicle;
  const util = getVehicleUtilization(state, v.id, days);
  const { revenue, deliveries } = getVehicleRevenue(state, v.id, days);
  const trip = v.tripId ? (state.trips || []).find(t => t.id === v.tripId) : null;
  const isEmptyTrip = trip && trip.type === "empty";
  const isFree = v.status === "free";
  const isMaintenance = v.status === "maintenance";
  const poorCondition = v.condition < 30;

  let idleMinutes = 0;
  if (isFree && v.idleReasonAtMin) {
    idleMinutes = Math.max(0, state.gameTime - v.idleReasonAtMin);
  }

  const flags = [];
  if (isFree && v.idleReason) {
    flags.push({ type: "idle", label: v.idleReason, severity: "warning" });
  }
  if (util < 30 && !isMaintenance) {
    flags.push({ type: "low_utilization", label: `Nur ${util}% Auslastung (${days} Tage)`, severity: "warning" });
  }
  if (isEmptyTrip) {
    flags.push({ type: "empty_trip", label: "Leerfahrt – kein Erlös", severity: "info" });
  }
  if (poorCondition) {
    flags.push({ type: "poor_condition", label: `Zustand ${v.condition}/100 – nicht einsatzfähig`, severity: "critical" });
  }
  if (v.markedForSale) {
    flags.push({ type: "for_sale", label: "Zum Verkauf vorgemerkt", severity: "info" });
  }

  const branch = (state.branches || []).find(b => b.id === v.branchId);

  return {
    vehicle: v,
    name: vehicleDisplayName(v),
    branchId: v.branchId,
    branchName: branch?.name || "Hauptsitz",
    status: v.status,
    utilization: util,
    revenue,
    deliveries,
    condition: v.condition,
    locationCity: v.locationCity,
    idleReason: v.idleReason || null,
    idleMinutes,
    isEmptyTrip,
    trip: trip ? { id: trip.id, endMin: trip.endMin, type: trip.type } : null,
    flags,
    isEfficient: flags.filter(f => f.severity !== "info").length === 0,
  };
}

// Alle Fahrzeuge mit Auslastungs-Detail, ineffiziente zuerst.
export function getAllVehicleUtilization(state, days = DEFAULT_DAYS) {
  const vehicles = (state.vehicles || []).filter(v => v.status !== "archived" && v.status !== "sold");
  return vehicles.map(v => getVehicleUtilizationDetail(state, v, days))
    .sort((a, b) => {
      const aBad = a.flags.filter(f => f.severity !== "info").length;
      const bBad = b.flags.filter(f => f.severity !== "info").length;
      if (aBad !== bBad) return bBad - aBad;
      return a.utilization - b.utilization;
    });
}

// ---------- Pro-Filiale Auslastung ----------

export function getBranchUtilization(state, days = DEFAULT_DAYS) {
  const branches = (state.branches || []).filter(b => b.status === "active");
  return branches.map(branch => {
    const vehicles = (state.vehicles || []).filter(v =>
      v.branchId === branch.id && v.status !== "archived" && v.status !== "sold"
    );
    const details = vehicles.map(v => getVehicleUtilizationDetail(state, v, days));
    const active = vehicles.filter(v => v.status === "on_trip").length;
    const free = vehicles.filter(v => v.status === "free").length;
    const maintenance = vehicles.filter(v => v.status === "maintenance").length;
    const avgUtil = vehicles.length > 0
      ? Math.round(details.reduce((s, d) => s + d.utilization, 0) / vehicles.length)
      : 0;
    const inefficient = details.filter(d => d.flags.filter(f => f.severity !== "info").length > 0).length;

    // Disponenten dieser Filiale
    const dispatchers = (state.employees || []).filter(e =>
      (e.role === "dispatcher" || e.role === "dispatcher_senior") &&
      e.employmentStatus === "employed" &&
      (e.assignedBranchId === branch.id || (!e.assignedBranchId && branch.id === (state.branches || [])[0]?.id))
    ).map(d => ({
      id: d.id,
      name: d.name,
      workMode: d.workMode,
      workModeLabel: workModeLabel(d.workMode).label,
      backlogCount: d.backlogCount || 0,
      lastIdleReason: d.lastIdleReason || null,
      lastPlanningAtMin: d.lastPlanningResult?.atMin || null,
      lastPlanningPlanned: d.lastPlanningResult?.planned ?? null,
    }));

    return {
      branch,
      vehicleCount: vehicles.length,
      active,
      free,
      maintenance,
      avgUtilization: avgUtil,
      inefficientCount: inefficient,
      dispatchers,
      vehicles: details.sort((a, b) => a.utilization - b.utilization),
    };
  });
}

// ---------- Gesamt-KPIs ----------

export function getFleetUtilizationKPIs(state, days = DEFAULT_DAYS) {
  const all = getAllVehicleUtilization(state, days);
  const total = all.length;
  const onTrip = all.filter(d => d.status === "on_trip").length;
  const free = all.filter(d => d.status === "free").length;
  const maintenance = all.filter(d => d.status === "maintenance").length;
  const inefficient = all.filter(d => d.flags.filter(f => f.severity !== "info").length > 0).length;
  const avgUtil = total > 0
    ? Math.round(all.reduce((s, d) => s + d.utilization, 0) / total)
    : 0;
  const totalRevenue = all.reduce((s, d) => s + d.revenue, 0);

  const unassigned = (state.orders || []).filter(o =>
    o.status === "angenommen" &&
    !(state.trips || []).some(t => t.orderId === o.id && t.status === "in_progress") &&
    !(state.tours || []).some(t => t.status === "active" && (t.deployments || []).some(dep => dep.orderId === o.id))
  );

  return {
    total,
    onTrip,
    free,
    maintenance,
    inefficient,
    avgUtilization: avgUtil,
    totalRevenue,
    unassignedOrders: unassigned.length,
    unassignedList: unassigned,
  };
}

// ---------- Handlungsbedarf ----------

export function getUtilizationActionItems(state, days = DEFAULT_DAYS) {
  const items = [];
  const all = getAllVehicleUtilization(state, days);

  // 1. Leerstehende Fahrzeuge mit Idle-Grund
  for (const d of all) {
    if (d.status !== "free" || !d.idleReason) continue;
    const idleHours = Math.floor(d.idleMinutes / 60);
    const idleStr = idleHours > 0 ? ` (seit ${idleHours} Std.)` : "";
    if (d.idleReason.includes("Kein Fahrer") || d.idleReason.includes("Keine Fahrer")) {
      items.push({
        priority: 80, kind: "no_driver", vehicleId: d.vehicle.id, vehicleName: d.name, branch: d.branchName,
        title: `${d.name} steht ohne Fahrer`,
        detail: d.idleReason + idleStr,
        action: { label: "Fahrer einstellen", to: "/personal" },
      });
    } else if (d.idleReason.includes("Zustand")) {
      items.push({
        priority: 75, kind: "condition", vehicleId: d.vehicle.id, vehicleName: d.name, branch: d.branchName,
        title: `${d.name} braucht Wartung`,
        detail: d.idleReason,
        action: { label: "Zur Werkstatt", to: "/fuhrpark" },
      });
    } else if (d.idleReason.includes("Kein Auftrag") || d.idleReason.includes("Keine angenommenen") || d.idleReason.includes("Keine (profitablen)")) {
      items.push({
        priority: 70, kind: "no_order", vehicleId: d.vehicle.id, vehicleName: d.name, branch: d.branchName,
        title: `${d.name} hat keinen Auftrag`,
        detail: d.idleReason + idleStr,
        action: { label: "Disponieren", to: "/disposition" },
      });
    } else {
      items.push({
        priority: 50, kind: "idle", vehicleId: d.vehicle.id, vehicleName: d.name, branch: d.branchName,
        title: `${d.name} ungenutzt`,
        detail: d.idleReason + idleStr,
        action: { label: "Ansehen", to: "/disposition" },
      });
    }
  }

  // 2. Geringe Auslastung (nicht schon durch Idle abgedeckt)
  for (const d of all) {
    if (d.status === "maintenance") continue;
    if (d.utilization >= 30) continue;
    if (d.flags.some(f => f.type === "idle")) continue;
    items.push({
      priority: 40, kind: "low_util", vehicleId: d.vehicle.id, vehicleName: d.name, branch: d.branchName,
      title: `${d.name} geringe Auslastung`,
      detail: `Nur ${d.utilization}% in ${days} Tagen – ${d.deliveries} Lieferung(en), ${formatEuro(d.revenue)} Umsatz.`,
      action: { label: "Disponieren", to: "/disposition" },
    });
  }

  // 3. Disponenten im Vorschlags-Modus mit Rückständen
  for (const emp of (state.employees || [])) {
    if (emp.role !== "dispatcher" && emp.role !== "dispatcher_senior") continue;
    if (emp.employmentStatus !== "employed") continue;
    if (emp.workMode === "autonomous") continue;
    if ((emp.backlogCount || 0) === 0) continue;
    const branch = (state.branches || []).find(b => b.id === emp.assignedBranchId);
    items.push({
      priority: 65, kind: "dispatcher_mode", employeeId: emp.id, employeeName: emp.name,
      branch: branch?.name || "Hauptsitz",
      title: `Disponent ${emp.name} im Vorschlags-Modus`,
      detail: `${emp.backlogCount} unzugewiesene(r) Auftrag (Aufträge) – Wechsel auf „Selbstständig" für automatische Disposition.`,
      action: { label: "Modus ändern", to: "/personal" },
    });
  }

  // 4. Kritischer Fahrzeugzustand (nicht schon durch Idle abgedeckt)
  for (const d of all) {
    if (d.condition >= 30) continue;
    if (d.flags.some(f => f.type === "idle" && d.idleReason?.includes("Zustand"))) continue;
    items.push({
      priority: 75, kind: "condition", vehicleId: d.vehicle.id, vehicleName: d.name, branch: d.branchName,
      title: `${d.name} Zustand kritisch`,
      detail: `Zustand ${d.condition}/100 – Wartung erforderlich, sonst Ausfall.`,
      action: { label: "Zur Werkstatt", to: "/fuhrpark" },
    });
  }

  items.sort((a, b) => b.priority - a.priority);
  return items;
}