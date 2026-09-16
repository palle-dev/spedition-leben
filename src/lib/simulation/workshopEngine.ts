// Werkstatt-Engine für FERNWERK (Auftrag 27).
// Verwaltet Werkstattplätze, interne Wartungsaufträge, Arbeitsfortschritt und Automatik.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.

import {
  dayOf, formatGameTime,
  SERVICE_START_MIN, SERVICE_END_MIN,
  STRESS_MAINT_THRESHOLD, MAINT_STRESS_FACTOR,
} from "./gameRules.ts";
import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { registerAsset, bookExpense } from "./accountingEngine.ts";
import { checkSpendAuthority, recordSpend, createApprovalRequest } from "./delegationEngine.ts";

const DAY_MIN = 1440;

// ---------- Konstanten ----------
export const WORKSHOP_SLOT_PRICE = 500000;       // 5.000 €
export const INTERNAL_MAINT_PARTS = 90000;        // 900 € Teile/Material
export const INTERNAL_MAINT_WORK_MIN = 480;      // 8 Arbeitsstunden
export const AUTOMATION_DEFAULT_MAX_COST = 150000; // 1.500 €

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function inServiceHours(m) {
  const c = m % DAY_MIN;
  return c >= SERVICE_START_MIN && c < SERVICE_END_MIN;
}

function vehicleLabel(v) {
  if (!v) return "—";
  const n = parseInt(String(v.id).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? v.id : "Lkw " + String(n).padStart(2, "0");
}

// Findet einen verfügbaren Mechaniker an einem Standort.
function findAvailableMechanic(state, branchId, m) {
  const branch = (state.branches || []).find(b => b.id === branchId);
  if (!branch) return null;
  return (state.employees || []).find(e =>
    e.role === "mechanic" &&
    isActivelyEmployed(e) &&
    e.locationCity === branch.city &&
    isPersonAvailable(state, e.id, m) &&
    !isMechanicAssigned(state, e.id)
  );
}

// Prüft, ob ein Mechaniker bereits einem aktiven Auftrag zugeordnet ist.
function isMechanicAssigned(state, mechanicId) {
  return (state.workshop?.maintenanceOrders || []).some(o =>
    o.mechanicId === mechanicId &&
    ["planned", "waiting", "in_progress", "interrupted"].includes(o.status)
  );
}

// ---------- Migration ----------
export function migrateWorkshop(state) {
  if (!state.workshop) state.workshop = {};
  if (!state.workshop.slots) state.workshop.slots = [];
  if (!state.workshop.maintenanceOrders) state.workshop.maintenanceOrders = [];
  if (!state.workshop.automationProfile) {
    state.workshop.automationProfile = {
      enabled: false,
      routineThreshold: 60,
      urgentThreshold: 30,
      maxCostCents: AUTOMATION_DEFAULT_MAX_COST,
      allowExternalFallback: false,
      externalMaxCostCents: 187500,
      branchIds: [],
      vehicleIds: [],
    };
  }
  // Slots migrieren
  for (const s of state.workshop.slots) {
    if (!s.status) s.status = "free";
    if (!s.currentOrderId) s.currentOrderId = null;
  }
}

// ---------- Werkstattplatz bauen ----------
export function buildWorkshopSlot(state, { branchId }) {
  const branch = (state.branches || []).find(b => b.id === branchId);
  if (!branch) throw new Error("Standort nicht gefunden.");
  if (state.company.accountCents < WORKSHOP_SLOT_PRICE) {
    throw new Error("Firmenkonto reicht für den Werkstattbau (5.000 €) nicht aus.");
  }
  // Kauf buchen
  state.company.accountCents -= WORKSHOP_SLOT_PRICE;
  state.bookings.push({
    min: state.gameTime, cause: "Werkstattbau: " + branch.name,
    amountCents: -WORKSHOP_SLOT_PRICE, account: "company", refId: "workshop_build",
  });
  // Anlage im Anlagenverzeichnis
  const asset = registerAsset(state, {
    vehicleId: null, account: "1200",
    name: "Werkstattplatz " + branch.name,
    acquisitionCostCents: WORKSHOP_SLOT_PRICE, acquiredAtMin: state.gameTime,
  });
  // Platz anlegen
  const slot = {
    id: uid(state, "ws"), branchId, assetId: asset.id,
    status: "free", currentOrderId: null, builtAtMin: state.gameTime,
  };
  state.workshop.slots.push(slot);
  pushEvent(state, {
    type: "workshop_built", gameTime: state.gameTime, isSystem: false,
    details: { branchId, branchName: branch.name, slotId: slot.id, costCents: WORKSHOP_SLOT_PRICE },
    dedupKey: "workshop_built:" + slot.id,
  });
  return { ok: true, slotId: slot.id, assetId: asset.id };
}

// ---------- Wartungsauftrag erstellen ----------
export function createMaintenanceOrder(state, { vehicleId, branchId, type, isAutomated, mechanicId }) {
  const v = (state.vehicles || []).find(x => x.id === vehicleId);
  if (!v) throw new Error("Fahrzeug nicht gefunden.");
  if (v.status === "archived" || v.status === "sold") throw new Error("Fahrzeug nicht im aktiven Bestand.");
  // Pro Fahrzeug höchstens ein offener Auftrag derselben Art
  const existing = (state.workshop?.maintenanceOrders || []).find(o =>
    o.vehicleId === vehicleId && o.type === (type || "standard") &&
    ["planned", "waiting", "in_progress", "interrupted"].includes(o.status)
  );
  if (existing) throw new Error("Für dieses Fahrzeug liegt bereits ein offener Wartungsauftrag vor.");
  const branch = (state.branches || []).find(b => b.id === branchId);
  if (!branch) throw new Error("Standort nicht gefunden.");
  const hasWorkshop = (state.workshop?.slots || []).some(s => s.branchId === branchId);
  if (!hasWorkshop) throw new Error("An diesem Standort gibt es keinen Werkstattplatz.");

  const order = {
    id: uid(state, "wo"), vehicleId, branchId,
    type: type || "standard",
    status: "planned",
    requiredMinutes: INTERNAL_MAINT_WORK_MIN,
    completedMinutes: 0,
    slotId: null,
    mechanicId: mechanicId || null,
    estimatedPartsCostCents: null,
    actualPartsCostCents: null,
    materialConsumed: false,
    working: false,
    workSessionStart: null,
    startMin: null,
    completedAtMin: null,
    createdAtMin: state.gameTime,
    isAutomated: !!isAutomated,
    blockReason: null,
    history: [{ type: "created", atMin: state.gameTime, isAutomated: !!isAutomated }],
  };
  state.workshop.maintenanceOrders.push(order);

  pushEvent(state, {
    type: "maintenance_planned", gameTime: state.gameTime, isSystem: isAutomated,
    details: { orderId: order.id, vehicleId, branchId, branchName: branch.name, type: order.type },
    dedupKey: "maintenance_planned:" + order.id,
  });
  return { ok: true, orderId: order.id };
}

// ---------- Wartungsauftrag stornieren ----------
export function cancelMaintenanceOrder(state, { orderId }) {
  const order = (state.workshop?.maintenanceOrders || []).find(o => o.id === orderId);
  if (!order) throw new Error("Wartungsauftrag nicht gefunden.");
  if (["completed", "cancelled"].includes(order.status)) throw new Error("Auftrag bereits abgeschlossen oder storniert.");
  if (order.materialConsumed) throw new Error("Begonnene Wartung kann nicht storniert werden. Unterbrechung erforderlich.");

  // Slot freigeben
  if (order.slotId) {
    const slot = (state.workshop?.slots || []).find(s => s.id === order.slotId);
    if (slot) { slot.status = "free"; slot.currentOrderId = null; }
  }
  order.status = "cancelled";
  order.cancelledAtMin = state.gameTime;
  order.working = false;
  order.workSessionStart = null;
  order.history.push({ type: "cancelled", atMin: state.gameTime });
  return { ok: true };
}

// ---------- Mechaniker zuweisen/wechseln ----------
export function assignMechanic(state, { orderId, mechanicId }) {
  const order = (state.workshop?.maintenanceOrders || []).find(o => o.id === orderId);
  if (!order) throw new Error("Wartungsauftrag nicht gefunden.");
  if (["completed", "cancelled"].includes(order.status)) throw new Error("Auftrag abgeschlossen oder storniert.");
  const mechanic = (state.employees || []).find(e => e.id === mechanicId);
  if (!mechanic) throw new Error("Mechaniker nicht gefunden.");
  if (mechanic.role !== "mechanic") throw new Error("Diese Person ist kein Mechaniker.");
  if (!isActivelyEmployed(mechanic)) throw new Error("Dieser Mechaniker ist nicht mehr aktiv beschäftigt.");
  if (isMechanicAssigned(state, mechanicId) && order.mechanicId !== mechanicId) {
    throw new Error("Dieser Mechaniker ist bereits einem anderen Auftrag zugeordnet.");
  }
  const oldId = order.mechanicId;
  order.mechanicId = mechanicId;
  order.history.push({ type: "mechanic_assigned", atMin: state.gameTime, from: oldId, to: mechanicId });
  return { ok: true };
}

// ---------- Teilekosten berechnen ----------
function computePartsCost(state) {
  let cost = INTERNAL_MAINT_PARTS;
  const stressed = state.private.stress >= STRESS_MAINT_THRESHOLD;
  if (stressed) cost = Math.round(cost * MAINT_STRESS_FACTOR);
  return { cost, stressed };
}

// ---------- Arbeit starten ----------
function startWork(state, order, slot, mechanic, partsCost, m, log) {
  // Teile verbrauchen
  const r = bookExpense(state, {
    expenseAccount: "5300", liabilityAccount: "2120",
    amountCents: partsCost,
    text: "Wartungsteile: " + order.vehicleId,
    type: "maintenance_parts", gameTime: m,
    refId: "workshop_parts:" + order.id,
  });
  order.materialConsumed = true;
  order.actualPartsCostCents = partsCost;

  // Fahrzeug in Wartung setzen
  const v = (state.vehicles || []).find(x => x.id === order.vehicleId);
  if (v) { v.status = "maintenance"; v.maintenanceUntil = null; }

  // Platz belegen
  slot.status = "occupied";
  slot.currentOrderId = order.id;
  order.slotId = slot.id;

  // Auftrag starten
  order.status = "in_progress";
  order.working = true;
  order.workSessionStart = m;
  order.startMin = m;
  order.blockReason = null;
  order.history.push({ type: "work_started", atMin: m, mechanicId: mechanic.id, partsCostCents: partsCost });

  pushEvent(state, {
    type: "maintenance_started", gameTime: m, isSystem: order.isAutomated,
    employeeId: mechanic.id, employeeName: mechanic.name, portraitId: mechanic.portraitId,
    vehicleId: order.vehicleId,
    details: { orderId: order.id, vehicleId: order.vehicleId, vehicleLabel: vehicleLabel(v), partsCostCents: partsCost, mechanicName: mechanic.name },
    dedupKey: "maintenance_started:" + order.id,
  });
  deliverMessage(state, {
    fromId: mechanic.id, toId: "player",
    subject: "Wartung begonnen: " + vehicleLabel(v),
    body: `Ich habe die Wartung von ${vehicleLabel(v)} in der Werkstatt begonnen.\nTeile/Material: ${(partsCost / 100).toFixed(2)} €\nGeplante Arbeitszeit: ${order.requiredMinutes / 60} Stunden\nIch melde dich, wenn der Lkw fertig ist.\n\n${mechanic.name}`,
    gameTime: m, category: "operations", priority: "normal",
    linkedRefs: { type: "maintenance_order", id: order.id },
  });
  log.push({ type: "maintenance_started", order: order.id, vehicle: order.vehicleId, atMin: m });
}

// ---------- Arbeit abschließen ----------
function completeWork(state, order, m, log) {
  order.completedMinutes = order.requiredMinutes;
  order.working = false;
  order.workSessionStart = null;
  order.status = "completed";
  order.completedAtMin = m;

  // Fahrzeug aktualisieren
  const v = (state.vehicles || []).find(x => x.id === order.vehicleId);
  if (v) { v.condition = 100; v.status = "free"; v.maintenanceUntil = null; }

  // Platz freigeben
  const slot = (state.workshop?.slots || []).find(s => s.id === order.slotId);
  if (slot) { slot.status = "free"; slot.currentOrderId = null; }

  order.history.push({ type: "completed", atMin: m });
  const mechanic = (state.employees || []).find(e => e.id === order.mechanicId);
  pushEvent(state, {
    type: "maintenance_completed", gameTime: m, isSystem: false,
    employeeId: mechanic?.id, employeeName: mechanic?.name, portraitId: mechanic?.portraitId,
    vehicleId: order.vehicleId,
    details: {
      orderId: order.id, vehicleId: order.vehicleId, vehicleLabel: vehicleLabel(v),
      partsCostCents: order.actualPartsCostCents, workMinutes: order.requiredMinutes,
      condition: 100, completedAtMin: m,
      mechanicName: mechanic?.name,
    },
    dedupKey: "maintenance_completed:" + order.id,
  });
  if (mechanic) {
    deliverMessage(state, {
      fromId: mechanic.id, toId: "player",
      subject: "Wartung abgeschlossen: " + vehicleLabel(v),
      body: `${vehicleLabel(v)} ist gewartet – ${order.requiredMinutes / 60} Arbeitsstunden, ${(order.actualPartsCostCents / 100).toFixed(2)} € Material, Zustand 100, wieder verfügbar ab ${formatGameTime(m)}.\n\n${mechanic.name}`,
      gameTime: m, category: "operations", priority: "normal",
      linkedRefs: { type: "maintenance_order", id: order.id },
    });
  }
  log.push({ type: "maintenance_completed", order: order.id, vehicle: order.vehicleId, atMin: m });
}

// ---------- Werkstatt-Verarbeitung (bei jedem Ereignis) ----------
export function processWorkshop(state, m, log) {
  const orders = state.workshop?.maintenanceOrders || [];
  if (orders.length === 0) return;
  const serviceHrs = inServiceHours(m);

  // 1. Arbeit pausieren/abschließen, die nicht weiterlaufen kann
  for (const order of orders) {
    if (order.status !== "in_progress" || !order.working) continue;
    const elapsed = order.workSessionStart !== null ? (m - order.workSessionStart) : 0;
    const effective = order.completedMinutes + elapsed;

    // Abschluss prüfen
    if (effective >= order.requiredMinutes) {
      completeWork(state, order, m, log);
      continue;
    }
    // Dienstende
    if (!serviceHrs) {
      order.completedMinutes = effective;
      order.working = false;
      order.workSessionStart = null;
      order.history.push({ type: "paused", atMin: m, reason: "Dienstende" });
      continue;
    }
    // Mechaniker abwesend
    if (order.mechanicId && !isPersonAvailable(state, order.mechanicId, m)) {
      order.completedMinutes = effective;
      order.working = false;
      order.workSessionStart = null;
      order.status = "interrupted";
      order.blockReason = "Mechaniker abwesend (Krankheit/Urlaub)";
      order.history.push({ type: "interrupted", atMin: m, reason: "Mechaniker abwesend" });
      const v = (state.vehicles || []).find(x => x.id === order.vehicleId);
      pushEvent(state, {
        type: "maintenance_interrupted", gameTime: m, isSystem: true,
        vehicleId: order.vehicleId,
        details: { orderId: order.id, vehicleId: order.vehicleId, vehicleLabel: vehicleLabel(v), reason: "Mechaniker abwesend", completedMinutes: order.completedMinutes },
        dedupKey: "maintenance_interrupted:" + order.id + ":" + m,
      });
      log.push({ type: "maintenance_interrupted", order: order.id, atMin: m });
    }
  }

  // 2. Unterbrochene/arbeitslose Aufträge wieder aufnehmen
  for (const order of orders) {
    if (order.status === "interrupted" || (order.status === "in_progress" && !order.working)) {
      if (!serviceHrs) continue;
      // Mechaniker verfügbar?
      let mech = order.mechanicId ? (state.employees || []).find(e => e.id === order.mechanicId) : null;
      if (mech && !isPersonAvailable(state, mech.id, m)) {
        // Vertretung suchen
        const replacement = findAvailableMechanic(state, order.branchId, m);
        if (replacement) {
          const oldId = order.mechanicId;
          order.mechanicId = replacement.id;
          order.history.push({ type: "mechanic_changed", atMin: m, from: oldId, to: replacement.id, reason: "Vertretung bei Abwesenheit" });
          mech = replacement;
        } else {
          order.blockReason = "Kein verfügbarer Mechaniker";
          continue;
        }
      }
      if (!mech || !isPersonAvailable(state, mech.id, m)) continue;
      // Slot noch belegt?
      const slot = (state.workshop?.slots || []).find(s => s.id === order.slotId);
      if (!slot || slot.status !== "occupied" || slot.currentOrderId !== order.id) continue;
      order.status = "in_progress";
      order.working = true;
      order.workSessionStart = m;
      order.blockReason = null;
      order.history.push({ type: "resumed", atMin: m, mechanicId: mech.id });
    }
  }

  // 3. Geplante/wartende Aufträge starten
  for (const order of orders) {
    if (order.status !== "planned" && order.status !== "waiting") continue;
    if (!serviceHrs) { order.status = "planned"; order.blockReason = "Außerhalb der Dienstzeit"; continue; }

    const v = (state.vehicles || []).find(x => x.id === order.vehicleId);
    const branch = (state.branches || []).find(b => b.id === order.branchId);
    if (!v || !branch) { order.status = "waiting"; order.blockReason = "Fahrzeug/Standort nicht gefunden"; continue; }

    // Fahrzeug am Werkstattstandort?
    if (v.locationCity !== branch.city) { order.status = "waiting"; order.blockReason = "Fahrzeug nicht am Werkstattstandort (Rückfahrt erforderlich)"; continue; }
    // Fahrzeug frei?
    if (v.status !== "free") { order.status = "waiting"; order.blockReason = "Fahrzeug nicht verfügbar (" + v.status + ")"; continue; }
    // Platz frei?
    const freeSlot = (state.workshop?.slots || []).find(s => s.branchId === order.branchId && s.status === "free");
    if (!freeSlot) { order.status = "waiting"; order.blockReason = "Kein freier Werkstattplatz"; continue; }
    // Mechaniker verfügbar?
    let mech = null;
    if (order.mechanicId) {
      mech = (state.employees || []).find(e => e.id === order.mechanicId);
      if (!mech || !isActivelyEmployed(mech)) { order.mechanicId = null; mech = null; }
    }
    if (!mech) {
      mech = findAvailableMechanic(state, order.branchId, m);
      if (!mech) { order.status = "waiting"; order.blockReason = "Kein verfügbarer Mechaniker am Standort"; continue; }
      order.mechanicId = mech.id;
    }
    if (!isPersonAvailable(state, mech.id, m)) { order.status = "waiting"; order.blockReason = "Mechaniker nicht verfügbar"; continue; }
    // Finanzierung?
    const { cost, stressed } = computePartsCost(state);
    if (state.company.accountCents < cost) { order.status = "waiting"; order.blockReason = "Firmenkonto reicht für Teile nicht aus"; continue; }
    // Starten
    startWork(state, order, freeSlot, mech, cost, m, log);
  }
}

// ---------- Automatik auswerten ----------
export function evaluateWorkshopAutomation(state, m, log) {
  const profile = state.workshop?.automationProfile;
  if (!profile || !profile.enabled) return;
  if (!inServiceHours(m)) return;

  // Fahrzeuge nach Zustand sortieren (dringliche zuerst)
  const urgent = [];
  const routine = [];
  for (const v of (state.vehicles || [])) {
    if (v.status === "archived" || v.status === "sold") continue;
    const ot = v.ownership_type || "owned";
    if (ot !== "owned" && ot !== "leased") continue;
    if (v.status !== "free") continue;
    // Schwellen prüfen
    if (v.condition >= profile.routineThreshold) continue;
    // Bereits offener Auftrag?
    const hasOpen = (state.workshop?.maintenanceOrders || []).some(o =>
      o.vehicleId === v.id && o.type === "standard" &&
      ["planned", "waiting", "in_progress", "interrupted"].includes(o.status)
    );
    if (hasOpen) continue;
    // Standort mit Werkstatt?
    const branch = (state.branches || []).find(b => b.city === v.locationCity);
    if (!branch) continue;
    const hasWorkshop = (state.workshop?.slots || []).some(s => s.branchId === branch.id);
    if (!hasWorkshop) continue;
    // Filter
    if (profile.branchIds?.length > 0 && !profile.branchIds.includes(branch.id)) continue;
    if (profile.vehicleIds?.length > 0 && !profile.vehicleIds.includes(v.id)) continue;
    if (v.condition <= profile.urgentThreshold) urgent.push({ v, branch });
    else routine.push({ v, branch });
  }
  // Dringliche zuerst, dann routinemäßige
  for (const { v, branch } of [...urgent, ...routine]) {
    // Platz frei?
    const freeSlot = (state.workshop?.slots || []).find(s => s.branchId === branch.id && s.status === "free");
    if (!freeSlot) continue;
    // Mechaniker?
    const mech = findAvailableMechanic(state, branch.id, m);
    if (!mech) continue;
    // Finanzierung?
    const { cost } = computePartsCost(state);
    if (cost > profile.maxCostCents) continue;
    if (state.company.accountCents < cost) continue;
    // Auftrag erstellen und starten
    try {
      const r = createMaintenanceOrder(state, {
        vehicleId: v.id, branchId: branch.id, type: "standard", isAutomated: true,
      });
      const order = (state.workshop?.maintenanceOrders || []).find(o => o.id === r.orderId);
      if (order) startWork(state, order, freeSlot, mech, cost, m, log);
    } catch (e) {
      log.push({ type: "auto_maintenance_failed", vehicle: v.id, error: e.message, atMin: m });
    }
  }
}

// ---------- Automatik-Profil aktualisieren ----------
export function updateAutomationProfile(state, { enabled, routineThreshold, urgentThreshold, maxCostCents, allowExternalFallback, externalMaxCostCents, branchIds, vehicleIds }) {
  const p = state.workshop?.automationProfile;
  if (!p) throw new Error("Werkstatt nicht initialisiert.");
  if (enabled !== undefined) p.enabled = !!enabled;
  if (routineThreshold !== undefined) {
    const rt = Number(routineThreshold);
    if (isNaN(rt) || rt < 1 || rt > 100) throw new Error("Routinegrenze muss zwischen 1 und 100 liegen.");
    p.routineThreshold = rt;
  }
  if (urgentThreshold !== undefined) {
    const ut = Number(urgentThreshold);
    if (isNaN(ut) || ut < 1 || ut > 100) throw new Error("Dringlichkeitsgrenze muss zwischen 1 und 100 liegen.");
    p.urgentThreshold = ut;
  }
  // Reihenfolge validieren: Routine > Dringlichkeit
  if (p.routineThreshold <= p.urgentThreshold) {
    throw new Error("Routinegrenze muss oberhalb der Dringlichkeitsgrenze liegen.");
  }
  if (maxCostCents !== undefined) {
    const mc = Number(maxCostCents);
    if (isNaN(mc) || mc < INTERNAL_MAINT_PARTS) throw new Error("Kostengrenze muss mindestens 900 € betragen.");
    p.maxCostCents = mc;
  }
  if (allowExternalFallback !== undefined) p.allowExternalFallback = !!allowExternalFallback;
  if (externalMaxCostCents !== undefined) p.externalMaxCostCents = Number(externalMaxCostCents);
  if (branchIds !== undefined) p.branchIds = Array.isArray(branchIds) ? branchIds : [];
  if (vehicleIds !== undefined) p.vehicleIds = Array.isArray(vehicleIds) ? vehicleIds : [];
  return { ok: true, profile: p };
}

// ---------- Abfragefunktionen ----------
export function getWorkshopStatus(state) {
  const slots = (state.workshop?.slots || []).map(s => {
    const branch = (state.branches || []).find(b => b.id === s.branchId);
    const order = s.currentOrderId ? (state.workshop?.maintenanceOrders || []).find(o => o.id === s.currentOrderId) : null;
    const v = order ? (state.vehicles || []).find(x => x.id === order.vehicleId) : null;
    const mech = order?.mechanicId ? (state.employees || []).find(e => e.id === order.mechanicId) : null;
    return {
      id: s.id, branchId: s.branchId, branchName: branch?.name || "—", branchCity: branch?.city || "—",
      status: s.status, currentOrderId: s.currentOrderId,
      currentVehicle: v ? vehicleLabel(v) : null,
      currentMechanic: mech?.name || null,
      completedMinutes: order?.completedMinutes || 0,
      requiredMinutes: order?.requiredMinutes || 0,
      working: order?.working || false,
    };
  });
  const mechanics = (state.employees || []).filter(e => e.role === "mechanic").map(e => ({
    id: e.id, name: e.name, portraitId: e.portraitId,
    employmentStatus: e.employmentStatus, locationCity: e.locationCity,
    available: isPersonAvailable(state, e.id, state.gameTime),
    assigned: isMechanicAssigned(state, e.id),
  }));
  return {
    ok: true,
    slots,
    mechanics,
    automationProfile: state.workshop?.automationProfile,
    orders: (state.workshop?.maintenanceOrders || []).map(o => {
      const v = (state.vehicles || []).find(x => x.id === o.vehicleId);
      const branch = (state.branches || []).find(b => b.id === o.branchId);
      const mech = o.mechanicId ? (state.employees || []).find(e => e.id === o.mechanicId) : null;
      return {
        id: o.id, vehicleId: o.vehicleId, vehicleLabel: vehicleLabel(v),
        vehicleCondition: v?.condition || 0, vehicleLocation: v?.locationCity || "—",
        vehicleStatus: v?.status || "—",
        branchId: o.branchId, branchName: branch?.name || "—",
        type: o.type, status: o.status, blockReason: o.blockReason,
        completedMinutes: o.completedMinutes, requiredMinutes: o.requiredMinutes,
        working: o.working, materialConsumed: o.materialConsumed,
        partsCostCents: o.actualPartsCostCents,
        mechanicId: o.mechanicId, mechanicName: mech?.name || null,
        isAutomated: o.isAutomated,
        createdAtMin: o.createdAtMin, startMin: o.startMin, completedAtMin: o.completedAtMin,
      };
    }),
  };
}

// ---------- Ereignis-Zeiten für earliestEventAfter ----------
export function getWorkshopEventTimes(state, t, maxMin) {
  const times = [];
  const orders = state.workshop?.maintenanceOrders || [];
  const hasActive = orders.some(o =>
    ["planned", "waiting", "in_progress", "interrupted"].includes(o.status)
  );
  if (hasActive) {
    const dayStart = Math.floor(t / DAY_MIN) * DAY_MIN;
    for (let d = 0; d <= 3; d++) {
      const base = dayStart + d * DAY_MIN;
      if (base + SERVICE_START_MIN > t && base + SERVICE_START_MIN <= maxMin) times.push(base + SERVICE_START_MIN);
      if (base + SERVICE_END_MIN > t && base + SERVICE_END_MIN <= maxMin) times.push(base + SERVICE_END_MIN);
    }
  }
  // Abschlusszeiten für arbeitende Aufträge
  for (const o of orders) {
    if (o.status === "in_progress" && o.working && o.workSessionStart !== null) {
      const remaining = o.requiredMinutes - o.completedMinutes;
      if (remaining > 0) {
        const ct = o.workSessionStart + remaining;
        if (ct > t && ct <= maxMin) times.push(ct);
      }
    }
  }
  return times;
}