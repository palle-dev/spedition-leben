// Standortausbau-Engine für FERNWERK.
// Verwaltet Bauprojekte für Stellplätze, Werkstattplätze und Aufenthaltsbereiche.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.
//
// Design-Prinzipien:
// - Zentrale, kalibrierte Spielwerte (keine realen Baupreise)
// - Ein Bauprojekt gleichzeitig pro Standort
// - Kosten werden genau einmal bei Beauftragung gebucht
// - Wirkung beginnt erst nach Fertigstellung
// - Bestehende Bereiche bleiben während des Ausbaus nutzbar
// - Migration: Bestehende Spielstände erhalten keine rückwirkenden Kosten
// - Kapazitätsprüfung bei Fahrzeugzugängen (Kauf, Leasing, Miete, Überstellung)

import { dayOf, formatGameTime, BRANCH_COST_PER_DAY } from "./gameRules.ts";
import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";
import { registerAsset, bookExpense, postJournal } from "./accountingEngine.ts";
import { checkSpendAuthority, recordSpend, createApprovalRequest } from "./delegationEngine.ts";

const DAY_MIN = 1440;

// ---------- Zentrale Konfiguration (Spielwerte) ----------
// Kalibriert an die vorhandene Spielökonomie:
// - BRANCH_COST_PER_DAY = 10.000 Cent (100 €/Tag)
// - VEHICLE_PRICE = 3.000.000 Cent (30.000 €)
// - WORKSHOP_SLOT_PRICE = 500.000 Cent (5.000 €)

export const EXPANSION_CONFIG = {
  parking: {
    label: "Stellplatz",
    costPerSlotCents: 150000,       // 1.500 € pro Stellplatz
    buildTimeMin: 2 * DAY_MIN,       // 2 Spieltage
    dailyCostPerSlotCents: 500,      // +5 €/Tag pro Stellplatz
    minSlots: 1,
    maxSlots: 10,
    description: "Erweitert die dauerhaft zugeordnete Flotte am Standort.",
  },
  workshop: {
    label: "Werkstattplatz",
    costPerSlotCents: 500000,       // 5.000 € pro Werkstattplatz (wie bestehend)
    buildTimeMin: 3 * DAY_MIN,       // 3 Spieltage
    dailyCostPerSlotCents: 1500,     // +15 €/Tag pro Werkstattplatz
    minSlots: 1,
    maxSlots: 4,
    description: "Erhöht die Zahl gleichzeitig durchführbarer Wartungen.",
  },
  breakArea: {
    label: "Aufenthaltsbereich",
    costCents: 80000,               // 800 € einmalig
    buildTimeMin: 1 * DAY_MIN,       // 1 Spieltag
    dailyCostCents: 300,             // +3 €/Tag
    workEnvironmentBonus: 3,        // Max +3 Zufriedenheitspunkte/Tag (begrenzt)
    conditionDecayPerDay: 1,         // Pflegebedarf wie Sauberkeit
    description: "Verbessert das Arbeitsumfeld am Standort (begrenzt, pflegeabhängig).",
  },
};

// Basis-Stellplätze pro Standort
export const BASE_PARKING_SLOTS = 5;
export const HQ_BASE_PARKING_SLOTS = 8;

// ---------- Migration ----------

export function migrateSiteExpansion(state) {
  if (!state.siteExpansion) state.siteExpansion = { version: 1, projects: [], reservations: [] };
  if (!state.siteExpansion.projects) state.siteExpansion.projects = [];
  if (!state.siteExpansion.reservations) state.siteExpansion.reservations = [];

  // Filialen um Ausbau-Felder erweitern
  for (const b of (state.branches || [])) {
    if (b.parkingSlotsBase === undefined) {
      // Migration: Basis-Stellplätze mindestens ausreichend für vorhandene Fahrzeuge + 2 Reserve
      const assignedVehicles = (state.vehicles || []).filter(v =>
        v.branchId === b.id && v.status !== "sold" && v.status !== "archived"
      ).length;
      b.parkingSlotsBase = Math.max(
        b.isHeadquarters ? HQ_BASE_PARKING_SLOTS : BASE_PARKING_SLOTS,
        assignedVehicles + 2
      );
    }
    if (b.parkingSlotsExpanded === undefined) b.parkingSlotsExpanded = 0;
    if (b.breakAreaLevel === undefined) b.breakAreaLevel = 0;
    if (b.breakAreaCondition === undefined) b.breakAreaCondition = 100;
    if (b.breakAreaLastMaintainedDay === undefined) b.breakAreaLastMaintainedDay = 0;
  }
}

// ---------- Hilfsfunktionen ----------

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Gesamt-Stellplätze eines Standorts (Basis + fertige Ausbauten)
export function getTotalParkingSlots(state, branchId) {
  const b = (state.branches || []).find(x => x.id === branchId);
  if (!b) return 0;
  return (b.parkingSlotsBase || BASE_PARKING_SLOTS) + (b.parkingSlotsExpanded || 0);
}

// Aktuell belegte Stellplätze (dauerhaft zugeordnete Fahrzeuge)
export function getAssignedVehicleCount(state, branchId) {
  return (state.vehicles || []).filter(v =>
    v.branchId === branchId &&
    v.status !== "sold" &&
    v.status !== "archived"
  ).length;
}

// Reservierte Stellplätze für bestätigte Zugänge (Kauf, Leasing, Miete, Überstellung)
export function getReservedSlots(state, branchId) {
  return (state.siteExpansion?.reservations || []).filter(
    r => r.branchId === branchId && r.status === "active"
  ).length;
}

// Freie Stellplätze (Gesamt - zugeordnet - reserviert)
// Ein unterwegs befindliches Fahrzeug gibt seinen Zuordnungsplatz nicht frei.
export function getFreeParkingSlots(state, branchId) {
  const total = getTotalParkingSlots(state, branchId);
  const assigned = getAssignedVehicleCount(state, branchId);
  const reserved = getReservedSlots(state, branchId);
  return total - assigned - reserved;
}

// Tatsächlich am Hof befindliche Fahrzeuge (locationCity == branch.city, nicht unterwegs)
export function getPresentVehicleCount(state, branchId) {
  const b = (state.branches || []).find(x => x.id === branchId);
  if (!b) return 0;
  return (state.vehicles || []).filter(v =>
    v.branchId === branchId &&
    v.locationCity === b.city &&
    v.status !== "on_trip" &&
    v.status !== "sold" &&
    v.status !== "archived"
  ).length;
}

// Prüft Kapazität für einen neuen Fahrzeugzugang
export function checkParkingCapacity(state, branchId, additionalCount = 1) {
  const free = getFreeParkingSlots(state, branchId);
  if (free >= additionalCount) return { ok: true, freeSlots: free };
  const total = getTotalParkingSlots(state, branchId);
  const assigned = getAssignedVehicleCount(state, branchId);
  const reserved = getReservedSlots(state, branchId);
  return {
    ok: false,
    freeSlots: free,
    totalSlots: total,
    assigned,
    reserved,
    needed: additionalCount,
    message: `Nicht genügend freie Stellplätze in ${((state.branches || []).find(b => b.id === branchId)?.name) || "Filiale"}. ` +
      `Belegt: ${assigned + reserved}/${total}, frei: ${free}, benötigt: ${additionalCount}.`,
  };
}

// Findet einen Standort mit freier Kapazität
export function findBranchWithCapacity(state, city, count = 1) {
  const branches = (state.branches || []).filter(b => b.status === "active");
  // Bevorzugt: gleiche Stadt
  let candidate = branches.find(b => b.city === city && getFreeParkingSlots(state, b.id) >= count);
  if (candidate) return candidate;
  // Sonst: nächste aktive Filiale mit Platz
  candidate = branches.find(b => getFreeParkingSlots(state, b.id) >= count);
  return candidate || null;
}

// ---------- Reservierungen ----------

// Reserviert Stellplätze für einen bestätigten Fahrzeugzugang
export function reserveParkingSlot(state, { branchId, reason, refId, count = 1 }) {
  migrateSiteExpansion(state);
  const reservation = {
    id: uid(state, "res"),
    branchId,
    reason: reason || "Fahrzeugzugang",
    refId: refId || null,
    count,
    status: "active",
    createdAtMin: state.gameTime,
  };
  state.siteExpansion.reservations.push(reservation);
  return reservation;
}

// Gibt eine Reservierung frei (bei Stornierung, Abbruch, Ankunft)
export function releaseReservation(state, refId) {
  if (!state.siteExpansion?.reservations) return;
  for (const r of state.siteExpansion.reservations) {
    if (r.refId === refId && r.status === "active") {
      r.status = "released";
      r.releasedAtMin = state.gameTime;
    }
  }
}

// ---------- Werkstattkapazität ----------

// Nutzbare Werkstattplätze (fertiggestellte Slots, nicht Bauprojekte)
export function getUsableWorkshopSlots(state, branchId) {
  return (state.workshop?.slots || []).filter(s => s.branchId === branchId).length;
}

// Freie Werkstattplätze
export function getFreeWorkshopSlots(state, branchId) {
  return (state.workshop?.slots || []).filter(s =>
    s.branchId === branchId && s.status === "free"
  ).length;
}

// Verfügbare Mechaniker an einem Standort
export function getAvailableMechanicCount(state, branchId) {
  const b = (state.branches || []).find(x => x.id === branchId);
  if (!b) return 0;
  // Importiert isActivelyEmployed und isPersonAvailable lazily um Zirkelabhängigkeiten zu vermeiden
  return (state.employees || []).filter(e =>
    e.role === "mechanic" &&
    e.employmentStatus === "employed" &&
    e.locationCity === b.city
  ).length;
}

// Tatsächlich nutzbare Werkstattkapazität (min(Slots, Mechaniker))
export function getEffectiveWorkshopCapacity(state, branchId) {
  const slots = getUsableWorkshopSlots(state, branchId);
  const mechanics = getAvailableMechanicCount(state, branchId);
  return Math.min(slots, mechanics);
}

// ---------- Aufenthaltsbereich / Arbeitsumfeld ----------

// Wirksamer Arbeitsumfeldbeitrag (begrenzt, pflegeabhängig)
// Level 0: 0, Level 1: bis zu +2, Level 2: bis zu +3
// Effekt skaliert mit Pflegezustand (condition) und Sauberkeit des Standorts.
export function getWorkEnvironmentBonus(state, branchId) {
  const b = (state.branches || []).find(x => x.id === branchId);
  if (!b || !b.breakAreaLevel || b.breakAreaLevel === 0) return 0;
  const maxBonus = b.breakAreaLevel === 2
    ? EXPANSION_CONFIG.breakArea.workEnvironmentBonus
    : Math.floor(EXPANSION_CONFIG.breakArea.workEnvironmentBonus * 0.67);
  // Skalierung mit Pflegezustand (0-100)
  const conditionFactor = Math.max(0, (b.breakAreaCondition ?? 100) / 100);
  // Skalierung mit Standortsauberkeit (sauberer Hof → besserer Aufenthaltsbereich)
  const cleanlinessFactor = Math.max(0, Math.min(1, (b.cleanliness ?? 85) / 85));
  return Math.round(maxBonus * conditionFactor * cleanlinessFactor);
}

// Täglicher Pflegeverlust des Aufenthaltsbereichs
export function processBreakAreaDecay(state, midnight) {
  for (const b of (state.branches || [])) {
    if (b.status !== "active") continue;
    if (!b.breakAreaLevel || b.breakAreaLevel === 0) continue;
    const day = dayOf(midnight);
    if (b.breakAreaLastMaintainedDay === day) continue;
    b.breakAreaCondition = Math.max(0, (b.breakAreaCondition ?? 100) - EXPANSION_CONFIG.breakArea.conditionDecayPerDay);
  }
}

// Reinigung wirkt auch auf Aufenthaltsbereich
export function applyCleaningToBreakArea(state, branchId, effectAmount) {
  const b = (state.branches || []).find(x => x.id === branchId);
  if (!b || !b.breakAreaLevel || b.breakAreaLevel === 0) return;
  b.breakAreaCondition = Math.min(100, (b.breakAreaCondition ?? 100) + Math.round(effectAmount * 0.5));
  b.breakAreaLastMaintainedDay = dayOf(state.gameTime);
}

// ---------- Bauprojekte ----------

// Aktives Bauprojekt für einen Standort
export function getActiveProject(state, branchId) {
  return (state.siteExpansion?.projects || []).find(
    p => p.branchId === branchId && p.status === "active"
  ) || null;
}

// Vorschau für einen Ausbau
export function previewExpansion(state, { branchId, type, slots = 1 }) {
  migrateSiteExpansion(state);
  const b = (state.branches || []).find(x => x.id === branchId);
  if (!b) throw new Error("Standort nicht gefunden.");
  if (b.status !== "active") throw new Error("Standort ist nicht aktiv.");

  const activeProject = getActiveProject(state, branchId);
  if (activeProject) {
    return {
      ok: false,
      error: "An diesem Standort läuft bereits ein Bauprojekt ("
        + EXPANSION_CONFIG[activeProject.type]?.label + "). "
        + "Fertigstellung: " + formatGameTime(activeProject.completionMin) + ".",
    };
  }

  const cfg = EXPANSION_CONFIG[type];
  if (!cfg) return { ok: false, error: "Unbekannter Ausbau-Typ: " + type };

  let costCents, buildTimeMin, dailyCostCents, effectDescription;

  if (type === "parking") {
    const n = Math.max(cfg.minSlots, Math.min(cfg.maxSlots, slots));
    costCents = cfg.costPerSlotCents * n;
    buildTimeMin = cfg.buildTimeMin;
    dailyCostCents = cfg.dailyCostPerSlotCents * n;
    const totalSlots = getTotalParkingSlots(state, branchId) + n;
    effectDescription = `+${n} Stellplätze (neu gesamt: ${totalSlots}). ` +
      `Ermöglicht ${n} zusätzliche dauerhaft zugeordnete Fahrzeuge.`;
  } else if (type === "workshop") {
    const n = Math.max(cfg.minSlots, Math.min(cfg.maxSlots, slots));
    costCents = cfg.costPerSlotCents * n;
    buildTimeMin = cfg.buildTimeMin;
    dailyCostCents = cfg.dailyCostPerSlotCents * n;
    const currentSlots = getUsableWorkshopSlots(state, branchId);
    const mechanics = getAvailableMechanicCount(state, branchId);
    effectDescription = `+${n} Werkstattplatz/plätze (neu gesamt: ${currentSlots + n}). ` +
      `Nutzbare Kapazität: min(Slots, Mechaniker) = min(${currentSlots + n}, ${mechanics}). ` +
      (mechanics < currentSlots + n ? `Hinweis: Es fehlen ${currentSlots + n - mechanics} Mechaniker für volle Auslastung.` : "");
  } else if (type === "breakArea") {
    if (b.breakAreaLevel >= 2) {
      return { ok: false, error: "Aufenthaltsbereich ist bereits voll ausgebaut (Stufe 2)." };
    }
    costCents = cfg.costCents;
    buildTimeMin = cfg.buildTimeMin;
    dailyCostCents = cfg.dailyCostCents;
    const newLevel = b.breakAreaLevel + 1;
    effectDescription = `Aufenthaltsbereich Stufe ${newLevel}. ` +
      `Arbeitsumfeld-Bonus: bis zu +${newLevel === 2 ? cfg.workEnvironmentBonus : Math.floor(cfg.workEnvironmentBonus * 0.67)} Zufriedenheit/Tag ` +
      `(skaliert mit Pflege und Sauberkeit).`;
  }

  return {
    ok: true,
    type,
    branchId,
    branchName: b.name,
    costCents,
    buildTimeMin,
    buildTimeDays: buildTimeMin / DAY_MIN,
    completionEstimate: state.gameTime + buildTimeMin,
    dailyCostCents,
    effectDescription,
    currentParkingSlots: getTotalParkingSlots(state, branchId),
    currentWorkshopSlots: getUsableWorkshopSlots(state, branchId),
    currentBreakAreaLevel: b.breakAreaLevel || 0,
  };
}

// Ausbau beauftragen
export function startExpansion(state, { branchId, type, slots = 1, employeeId }) {
  migrateSiteExpansion(state);
  const preview = previewExpansion(state, { branchId, type, slots });
  if (!preview.ok) throw new Error(preview.error);

  const b = (state.branches || []).find(x => x.id === branchId);
  const cfg = EXPANSION_CONFIG[type];

  // Finanzierung prüfen
  if (state.company.accountCents < preview.costCents) {
    throw new Error(`Firmenkonto reicht für den Ausbau (${(preview.costCents / 100).toLocaleString("de-DE")} €) nicht aus.`);
  }

  // Befugnisprüfung (Delegation) wenn durch Mitarbeiter beauftragt
  if (employeeId) {
    const emp = (state.employees || []).find(e => e.id === employeeId);
    if (!emp || emp.employmentStatus !== "employed") throw new Error("Mitarbeiter nicht aktiv beschäftigt.");
    if (emp) {
      const authCheck = checkSpendAuthority(state, employeeId, preview.costCents, {
        branchId: emp.assignedBranchId || emp.branchId,
      });
      if (!authCheck.allowed) {
        const approval = createApprovalRequest(state, {
          employeeId, employeeName: emp.name, employeeRole: emp.role,
          branchId: emp.assignedBranchId || emp.branchId,
          type: "spend",
          title: `Standortausbau: ${cfg.label} in ${b.name}`,
          description: `Baukosten ${(preview.costCents / 100).toFixed(2)} € für ${cfg.label} am Standort ${b.name}.`,
          reasoning: authCheck.reason,
          costCents: preview.costCents,
          violatedRule: authCheck.violatedRule,
          urgency: "medium",
          actionData: { type: "site_expansion", branchId, expansionType: type, slots, dedupId: `${branchId}:${type}:${state.gameTime}` },
        });
        return { ok: false, requiresApproval: true, approvalRejected: !!approval.rejected,
          requestId: approval.request.id, reason: authCheck.reason };
      }
      recordSpend(state, employeeId, preview.costCents, emp.assignedBranchId || emp.branchId);
    }
  }

  // Kosten buchen (Investition)
  bookExpense(state, {
    expenseAccount: "1200", // Anlagevermögen
    liabilityAccount: "1000", // Bank
    amountCents: preview.costCents,
    paidCents: preview.costCents,
    unpaidCents: 0,
    text: `Standortausbau: ${cfg.label} in ${b.name}`,
    type: "site_expansion",
    gameTime: state.gameTime,
    refId: `expansion:${branchId}:${type}`,
  });

  // Anlage im Anlagenverzeichnis registrieren
  registerAsset(state, {
    vehicleId: null,
    account: "1200",
    name: `${cfg.label} ${b.name}`,
    acquisitionCostCents: preview.costCents,
    acquiredAtMin: state.gameTime,
  });

  // Bauprojekt anlegen
  const project = {
    id: uid(state, "exp"),
    branchId,
    branchName: b.name,
    type,
    slots: type === "breakArea" ? 1 : Math.max(cfg.minSlots, Math.min(cfg.maxSlots, slots)),
    costCents: preview.costCents,
    dailyCostCents: preview.dailyCostCents,
    startedAtMin: state.gameTime,
    completionMin: state.gameTime + preview.buildTimeMin,
    status: "active",
    effectApplied: false,
  };
  state.siteExpansion.projects.push(project);

  pushEvent(state, {
    type: "expansion_started",
    gameTime: state.gameTime,
    isSystem: false,
    branchId,
    details: {
      projectId: project.id,
      branchName: b.name,
      expansionType: type,
      expansionLabel: cfg.label,
      costCents: preview.costCents,
      completionMin: project.completionMin,
      buildTimeDays: preview.buildTimeDays,
    },
    dedupKey: "expansion_started:" + project.id,
  });

  return {
    ok: true,
    projectId: project.id,
    costCents: preview.costCents,
    completionMin: project.completionMin,
    buildTimeDays: preview.buildTimeDays,
  };
}

// Bauabschluss verarbeiten (wird vom Ereignismechanismus aufgerufen)
export function processExpansionCompletion(state, m, log) {
  const projects = state.siteExpansion?.projects || [];
  for (const p of projects) {
    if (p.status !== "active") continue;
    if (p.completionMin > m) continue;
    if (p.effectApplied) continue;

    const b = (state.branches || []).find(x => x.id === p.branchId);
    if (!b) { p.status = "failed"; p.failedAtMin = m; continue; }

    // Wirkung anwenden
    if (p.type === "parking") {
      b.parkingSlotsExpanded = (b.parkingSlotsExpanded || 0) + p.slots;
    } else if (p.type === "workshop") {
      // Werkstattplätze nach Fertigstellung anlegen
      for (let i = 0; i < p.slots; i++) {
        const slot = {
          id: uid(state, "ws"),
          branchId: p.branchId,
          assetId: null,
          status: "free",
          currentOrderId: null,
          builtAtMin: m,
        };
        state.workshop.slots.push(slot);
      }
    } else if (p.type === "breakArea") {
      b.breakAreaLevel = Math.min(2, (b.breakAreaLevel || 0) + 1);
      b.breakAreaCondition = 100;
      b.breakAreaLastMaintainedDay = dayOf(m);
    }

    // Laufende Kosten erhöhen
    b.costPerDayCents = (b.costPerDayCents || BRANCH_COST_PER_DAY) + p.dailyCostCents;

    p.status = "completed";
    p.completedAtMin = m;
    p.effectApplied = true;

    const cfg = EXPANSION_CONFIG[p.type];
    pushEvent(state, {
      type: "expansion_completed",
      gameTime: m,
      isSystem: true,
      branchId: p.branchId,
      details: {
        projectId: p.id,
        branchName: b.name,
        expansionType: p.type,
        expansionLabel: cfg?.label || p.type,
        slots: p.slots,
        dailyCostCents: p.dailyCostCents,
      },
      dedupKey: "expansion_completed:" + p.id,
    });

    // Kompakte Mitteilung
    deliverMessage(state, {
      fromId: "system",
      toId: "player",
      subject: `Ausbau fertiggestellt: ${cfg?.label} in ${b.name}`,
      body: `Der Ausbau in ${b.name} wurde abgeschlossen.\n` +
        (p.type === "parking" ? `+${p.slots} Stellplatz/Stellplätze hinzugefügt.\n` : "") +
        (p.type === "workshop" ? `+${p.slots} Werkstattplatz/Plätze hinzugefügt.\n` : "") +
        (p.type === "breakArea" ? `Aufenthaltsbereich Stufe ${b.breakAreaLevel} eingerichtet.\n` : "") +
        `Zusätzliche laufende Kosten: +${(p.dailyCostCents / 100).toFixed(2)} €/Tag.`,
      gameTime: m,
      category: "operations",
      priority: "normal",
      linkedRefs: { type: "expansion", id: p.id },
      dedupKey: `expansion_msg:${p.id}`,
    });

    log.push({ type: "expansion_completed", project: p.id, branchId: p.branchId, atMin: m });
  }
}

// Ereignis-Zeiten für earliestEventAfter
export function getExpansionEventTimes(state, t, maxMin) {
  const times = [];
  for (const p of (state.siteExpansion?.projects || [])) {
    if (p.status === "active" && p.completionMin > t && p.completionMin <= maxMin) {
      times.push(p.completionMin);
    }
  }
  return times;
}

// ---------- Standort-Übersicht ----------

export function getSiteOverview(state, branchId) {
  migrateSiteExpansion(state);
  const b = (state.branches || []).find(x => x.id === branchId);
  if (!b) return null;

  const totalParking = getTotalParkingSlots(state, branchId);
  const assigned = getAssignedVehicleCount(state, branchId);
  const reserved = getReservedSlots(state, branchId);
  const present = getPresentVehicleCount(state, branchId);
  const free = totalParking - assigned - reserved;

  const workshopSlots = getUsableWorkshopSlots(state, branchId);
  const freeWorkshopSlots = getFreeWorkshopSlots(state, branchId);
  const mechanics = getAvailableMechanicCount(state, branchId);
  const effectiveWorkshopCap = getEffectiveWorkshopCapacity(state, branchId);

  const workEnvBonus = getWorkEnvironmentBonus(state, branchId);
  const activeProject = getActiveProject(state, branchId);

  // Laufende Wartungen an diesem Standort
  const activeMaintenance = (state.workshop?.maintenanceOrders || []).filter(
    o => o.branchId === branchId &&
    ["planned", "waiting", "in_progress", "interrupted"].includes(o.status)
  ).length;

  return {
    branchId,
    branchName: b.name,
    city: b.city,
    isHeadquarters: b.isHeadquarters || false,
    parking: {
      total: totalParking,
      assigned,
      reserved,
      present,
      free,
    },
    workshop: {
      slots: workshopSlots,
      freeSlots: freeWorkshopSlots,
      mechanics,
      effectiveCapacity: effectiveWorkshopCap,
      activeMaintenance,
      bottleneck: mechanics < workshopSlots ? "mechanics" : null,
    },
    breakArea: {
      level: b.breakAreaLevel || 0,
      condition: b.breakAreaCondition ?? 100,
      workEnvironmentBonus: workEnvBonus,
    },
    cleanliness: b.cleanliness ?? 85,
    dailyCostCents: b.costPerDayCents || BRANCH_COST_PER_DAY,
    activeProject: activeProject ? {
      type: activeProject.type,
      label: EXPANSION_CONFIG[activeProject.type]?.label || activeProject.type,
      startedAtMin: activeProject.startedAtMin,
      completionMin: activeProject.completionMin,
      progressPct: Math.min(100, Math.round(((state.gameTime - activeProject.startedAtMin) / (activeProject.completionMin - activeProject.startedAtMin)) * 100)),
    } : null,
  };
}