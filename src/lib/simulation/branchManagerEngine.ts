// Filialleiter-Engine für FERNWERK.
// Filialleiter (branch_manager) können für Filialen eingestellt werden.
// Sie treffen selbstständig Entscheidungen im Rahmen ihrer Befugnisse
// und legen wichtige Entscheidungen dem Geschäftsführer zur Freigabe vor.

import { dayOf, HIRE_FEE, DRIVER_COST_PER_DAY, CITIES, PORTRAIT_IDS, APPLICANT_NAMES } from "./gameRules.ts";
import { previewCourseBooking, bookCourse, COURSE_CATALOG, hasQualification, isPersonInTraining } from "./trainingEngine.ts";
import { isActivelyEmployed, findPerson } from "./terminationEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { pushEvent } from "./eventLog.ts";

function uid(state: any, prefix: string): string {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Auto-Freigabegrenze für autonome Filialleiter (5.000 €).
const AUTONOMOUS_THRESHOLD = 500000;

function pickDriverName(state: any): string {
  const pool = APPLICANT_NAMES.driver || ["Fahrer"];
  const used = new Set([...(state.drivers || []).map((d: any) => d.name)]);
  const available = pool.filter((n: string) => !used.has(n));
  if (available.length > 0) return available[Math.floor(Math.random() * available.length)];
  return "Fahrer " + ((state.drivers || []).length + 1);
}

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
  const types = ["hire_driver", "accept_order", "maintenance", "cost_optimization", "staff_training"];
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
  if (type === "staff_training") {
    const candidate = findTrainingCandidate(state, branch);
    if (!candidate) return null;
    return {
      id, branchId: branch.id, managerId: manager.id, type,
      title: "Mitarbeiter schulen",
      description: `${manager.name} empfiehlt, ${candidate.personName} (${candidate.roleLabel}) in ${branch.name} (${branch.city}) für den Kurs "${candidate.courseLabel}" anzumelden.`,
      costCents: candidate.feeCents,
      benefitDesc: candidate.effectDesc,
      personId: candidate.personId,
      courseId: candidate.courseId,
      createdAt: state.gameTime, status: "pending",
    };
  }
  return null;
}

// Findet eine schulungsfähige Person und einen passenden Kurs für eine Filiale.
function findTrainingCandidate(state: any, branch: any): any | null {
  const persons: any[] = [];
  for (const d of (state.drivers || [])) {
    if (isActivelyEmployed(d) && d.branchId === branch.id) {
      persons.push({ id: d.id, role: "driver", name: d.name });
    }
  }
  for (const e of (state.employees || [])) {
    if (!isActivelyEmployed(e)) continue;
    const branchMatch = e.assignedBranchId === branch.id || e.branchId === branch.id;
    if (!branchMatch) continue;
    if (e.role === "branch_manager") continue;
    persons.push({ id: e.id, role: e.role, name: e.name });
  }

  for (const p of persons) {
    if (isPersonInTraining(state, p.id)) continue;
    if (!isPersonAvailable(state, p.id, state.gameTime)) continue;

    for (const course of COURSE_CATALOG) {
      if (course.isPromotion) continue;
      if (course.effect && hasQualification(state, p.id, course.effect)) continue;
      const targetRoles = [course.targetRole];
      if (course.targetRoleSenior) targetRoles.push(course.targetRoleSenior);
      if (!targetRoles.includes(p.role)) continue;

      const preview = previewCourseBooking(state, p.id, course.id);
      if (!preview.ok) continue;

      const roleLabel = p.role === "driver" ? "Fahrer" : PERSONNEL_ROLE_LABELS[p.role] || p.role;
      return {
        personId: p.id,
        personName: p.name,
        roleLabel,
        courseId: course.id,
        courseLabel: course.label,
        feeCents: course.feeCents,
        effectDesc: course.effectDesc || "Neue Qualifikation",
      };
    }
  }
  return null;
}

const PERSONNEL_ROLE_LABELS: Record<string, string> = {
  dispatcher: "Disponent",
  dispatcher_senior: "Erf. Disponent",
  cleaner: "Reinigung",
  mechanic: "Werkstatt",
  accountant: "Buchhaltung",
  accountant_senior: "Erf. Buchhaltung",
  assistant: "Assistent",
};

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
    const portraitIdx = (state.drivers || []).length % PORTRAIT_IDS.length;
    state.drivers.push({
      id: uid(state, "d"), name: pickDriverName(state),
      branchId: branch.id, costPerDayCents: DRIVER_COST_PER_DAY,
      locationCity: branch.city, status: "free", restUntil: null,
      employedDay: dayOf(state.gameTime), portraitId: PORTRAIT_IDS[portraitIdx],
      satisfaction: 70, satisfactionReasons: [],
      employmentStatus: "employed", attendance: "present",
      consecutiveLowSatisfactionDays: 0,
      workMinutesSinceRest: 0, driveMinutesSinceBreak: 0,
    });
    return;
  }
  if (decision.type === "accept_order") {
    if (!decision.revenueCents) return;
    const branch = state.branches.find((b: any) => b.id === decision.branchId);
    if (!branch) return;
    // Echten Auftrag erstellen — muss disponiert und geliefert werden
    const destCities = CITIES.filter((c: string) => c !== branch.city);
    const toCity = destCities[Math.floor(Math.random() * destCities.length)];
    const orderId = uid(state, "o");
    state.orders = state.orders || [];
    state.orders.push({
      id: orderId,
      customer: "Filialleiter-Akquise (" + branch.city + ")",
      fromCity: branch.city,
      toCity,
      cargo: "Sonderfracht",
      tons: 12,
      paymentCents: decision.revenueCents,
      status: "angenommen",
      acceptedAtMin: state.gameTime,
      acceptedById: decision.managerId,
      acceptedByName: (state.employees || []).find((e: any) => e.id === decision.managerId)?.name || "Filialleiter",
      acceptDeadlineMin: state.gameTime + 1440,
      deliveryDeadlineMin: state.gameTime + 2880,
      history: [{ type: "accepted", min: state.gameTime, actor: decision.managerId, auto: true }],
    });
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
  if (decision.type === "staff_training") {
    if (!decision.personId || !decision.courseId) return;
    const found = findPerson(state, decision.personId);
    if (!found || !isActivelyEmployed(found.person)) return;
    if (isPersonInTraining(state, decision.personId)) return;
    const course = COURSE_CATALOG.find((c: any) => c.id === decision.courseId);
    if (!course) return;
    if (state.company.accountCents < course.feeCents) return;
    try {
      bookCourse(state, decision.personId, decision.courseId, {});
      pushEvent(state, {
        type: "branch_training_booked",
        gameTime: state.gameTime,
        employeeId: decision.managerId,
        personId: decision.personId,
        details: {
          personName: found.person.name,
          courseLabel: course.label,
          feeCents: course.feeCents,
          branchName: (state.branches || []).find((b: any) => b.id === decision.branchId)?.name || "",
        },
        dedupKey: "branch_training:" + decision.id,
      });
    } catch (e: any) {
      // Buchung fehlgeschlagen – still überspringen
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