// Filialleiter-Engine für FERNWERK.
// Filialleiter (branch_manager) können für Filialen eingestellt werden.
// Sie treffen selbstständig Entscheidungen im Rahmen ihrer Befugnisse
// und legen wichtige Entscheidungen dem Geschäftsführer zur Freigabe vor.

import { dayOf, HIRE_FEE, DRIVER_COST_PER_DAY } from "./gameRules.ts";

function uid(state: any, prefix: string): string {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Auto-Freigabegrenze für autonome Filialleiter (5.000 €).
const AUTONOMOUS_THRESHOLD = 500000;

// ---------- Migration ----------

export function migrateBranchManagerState(state: any) {
  if (!state.branchManagerState) {
    state.branchManagerState = { lastDecisionDay: 0 };
  }
  if (!Array.isArray(state.branchDecisions)) state.branchDecisions = [];
}

// ---------- Abfragen ----------

export function getBranchManagers(state: any): any[] {
  return (state.employees || []).filter(
    (e: any) => e.role === "branch_manager" && e.employmentStatus === "employed"
  );
}

export function getManagerForBranch(state: any, branchId: string): any | null {
  return (state.employees || []).find(
    (e: any) =>
      e.role === "branch_manager" &&
      e.assignedBranchId === branchId &&
      e.employmentStatus === "employed"
  ) || null;
}

export function getPendingDecisions(state: any): any[] {
  return (state.branchDecisions || []).filter((d: any) => d.status === "pending");
}

// ---------- Entscheidungen generieren (täglich) ----------

export function generateBranchDecisions(state: any): any {
  migrateBranchManagerState(state);
  const day = dayOf(state.gameTime);
  if (state.branchManagerState.lastDecisionDay === day) return state;
  state.branchManagerState.lastDecisionDay = day;

  const managers = getBranchManagers(state);
  for (const mgr of managers) {
    const branch = (state.branches || []).find((b: any) => b.id === mgr.assignedBranchId);
    if (!branch || branch.status !== "active") continue;

    // Max 1 offene Entscheidung pro Manager
    const hasPending = state.branchDecisions.some(
      (d: any) => d.managerId === mgr.id && d.status === "pending"
    );
    if (hasPending) continue;

    // 50 % Chance pro Tag
    if (Math.random() > 0.5) continue;

    const decision = createDecision(state, mgr, branch);
    if (!decision) continue;

    // Autonomer Modus: kleine Entscheidungen auto-freigeben
    if (mgr.managementMode === "autonomous" && decision.costCents <= AUTONOMOUS_THRESHOLD) {
      decision.status = "auto_approved";
      decision.resolvedAt = state.gameTime;
      applyDecision(state, decision);
    } else {
      state.branchDecisions.push(decision);
    }
  }

  // Alte Entscheidungen aufräumen (> 7 Tage resolved)
  const cutoff = state.gameTime - 7 * 1440;
  state.branchDecisions = state.branchDecisions.filter(
    (d: any) => d.status === "pending" || d.createdAt > cutoff
  );

  return state;
}

function createDecision(state: any, manager: any, branch: any): any | null {
  const types = ["hire_driver", "accept_order", "maintenance", "cost_optimization"];
  const type = types[Math.floor(Math.random() * types.length)];
  const id = uid(state, "bd");

  if (type === "hire_driver") {
    return {
      id, branchId: branch.id, managerId: manager.id, type,
      title: "Fahrer einstellen",
      description: `${manager.name} möchte für ${branch.name} (${branch.city}) einen weiteren Fahrer einstellen, um die Auslastung zu erhöhen.`,
      costCents: HIRE_FEE,
      benefitDesc: "+1 Fahrer, höhere Kapazität",
      createdAt: state.gameTime, status: "pending",
    };
  }
  if (type === "accept_order") {
    const revenue = 80000 + Math.floor(Math.random() * 120000);
    return {
      id, branchId: branch.id, managerId: manager.id, type,
      title: "Großauftrag annehmen",
      description: `${manager.name} hat einen lukrativen Auftrag für ${branch.name} (${branch.city}) verhandelt und bittet um Freigabe.`,
      costCents: 0,
      benefitDesc: `+${(revenue / 100).toLocaleString("de-DE")} € Umsatz`,
      revenueCents: revenue,
      createdAt: state.gameTime, status: "pending",
    };
  }
  if (type === "maintenance") {
    const cost = 15000 + Math.floor(Math.random() * 20000);
    return {
      id, branchId: branch.id, managerId: manager.id, type,
      title: "Werkstattinspektion",
      description: `${manager.name} empfiehlt eine Inspektion der Fahrzeuge in ${branch.name} (${branch.city}), um Ausfälle zu vermeiden.`,
      costCents: cost,
      benefitDesc: "Fahrzeugzustand +15 %",
      createdAt: state.gameTime, status: "pending",
    };
  }
  if (type === "cost_optimization") {
    const cost = 10000 + Math.floor(Math.random() * 15000);
    const saving = 200 + Math.floor(Math.random() * 800);
    return {
      id, branchId: branch.id, managerId: manager.id, type,
      title: "Prozessoptimierung",
      description: `${manager.name} schlägt eine Prozessoptimierung für ${branch.name} (${branch.city}) vor, die die laufenden Kosten senkt.`,
      costCents: cost,
      benefitDesc: `-${(saving / 100).toLocaleString("de-DE")} €/Tag`,
      savingPerDayCents: saving,
      createdAt: state.gameTime, status: "pending",
    };
  }
  return null;
}

// ---------- Entscheidung anwenden ----------

function applyDecision(state: any, decision: any) {
  if (decision.type === "hire_driver") {
    const branch = state.branches.find((b: any) => b.id === decision.branchId);
    if (!branch) return;
    if (state.company.accountCents < decision.costCents) return;
    state.company.accountCents -= decision.costCents;
    state.bookings = state.bookings || [];
    state.bookings.push({
      min: state.gameTime, cause: "Filialleiter: Fahrer eingestellt",
      amountCents: -decision.costCents, account: "company", refId: "bm_hire",
    });
    state.drivers.push({
      id: uid(state, "d"), name: "Fahrer " + ((state.drivers || []).length + 1),
      branchId: branch.id, costPerDayCents: DRIVER_COST_PER_DAY,
      locationCity: branch.city, status: "free", restUntil: null,
      employedDay: dayOf(state.gameTime), portraitId: null,
      satisfaction: 70, satisfactionReasons: [],
      employmentStatus: "employed", attendance: "present",
      consecutiveLowSatisfactionDays: 0,
    });
    return;
  }
  if (decision.type === "accept_order") {
    if (!decision.revenueCents) return;
    state.company.accountCents += decision.revenueCents;
    state.bookings = state.bookings || [];
    state.bookings.push({
      min: state.gameTime, cause: "Filialleiter: Großauftrag",
      amountCents: decision.revenueCents, account: "company", refId: "bm_order",
    });
    const branch = state.branches.find((b: any) => b.id === decision.branchId);
    if (branch) {
      branch.stats = branch.stats || { revenueCents: 0, deliveries: 0, expensesCents: 0 };
      branch.stats.revenueCents += decision.revenueCents;
      branch.stats.deliveries += 3;
    }
    return;
  }
  if (decision.type === "maintenance") {
    if (state.company.accountCents < decision.costCents) return;
    state.company.accountCents -= decision.costCents;
    state.bookings = state.bookings || [];
    state.bookings.push({
      min: state.gameTime, cause: "Filialleiter: Inspektion",
      amountCents: -decision.costCents, account: "company", refId: "bm_maint",
    });
    const vehicles = (state.vehicles || []).filter(
      (v: any) => v.branchId === decision.branchId && v.status !== "sold" && v.status !== "archived"
    );
    for (const v of vehicles) v.condition = Math.min(100, (v.condition || 70) + 15);
    return;
  }
  if (decision.type === "cost_optimization") {
    if (state.company.accountCents < decision.costCents) return;
    state.company.accountCents -= decision.costCents;
    state.bookings = state.bookings || [];
    state.bookings.push({
      min: state.gameTime, cause: "Filialleiter: Prozessoptimierung",
      amountCents: -decision.costCents, account: "company", refId: "bm_costopt",
    });
    const branch = state.branches.find((b: any) => b.id === decision.branchId);
    if (branch) {
      branch.costPerDayCents = Math.max(1000, (branch.costPerDayCents || 5000) - decision.savingPerDayCents);
    }
    return;
  }
}

// ---------- Befehle ----------

export function approveBranchDecision(state: any, decisionId: string) {
  migrateBranchManagerState(state);
  const decision = state.branchDecisions.find(
    (d: any) => d.id === decisionId && d.status === "pending"
  );
  if (!decision) throw new Error("Entscheidung nicht gefunden oder bereits bearbeitet.");
  decision.status = "approved";
  decision.resolvedAt = state.gameTime;
  applyDecision(state, decision);
  return { ok: true, decisionId, effect: decision.type };
}

export function rejectBranchDecision(state: any, decisionId: string) {
  migrateBranchManagerState(state);
  const decision = state.branchDecisions.find(
    (d: any) => d.id === decisionId && d.status === "pending"
  );
  if (!decision) throw new Error("Entscheidung nicht gefunden oder bereits bearbeitet.");
  decision.status = "rejected";
  decision.resolvedAt = state.gameTime;
  return { ok: true, decisionId };
}

export function setBranchManagerMode(state: any, employeeId: string, mode: string) {
  const emp = (state.employees || []).find((e: any) => e.id === employeeId);
  if (!emp) throw new Error("Angestellter nicht gefunden.");
  if (emp.role !== "branch_manager") throw new Error("Diese Person ist kein Filialleiter.");
  emp.managementMode = mode === "autonomous" ? "autonomous" : "requests_approval";
  return { ok: true, employeeId, managementMode: emp.managementMode };
}