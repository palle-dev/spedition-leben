import {branchResponsibilityAllows} from "./managementResponsibilities.ts";
import { deliverMessage } from "./mailEngine.ts";
import { nextRandom } from "./randomEngine.ts";
// Filialleiter-Engine für FERNWERK.
// Filialleiter (branch_manager) können für Filialen eingestellt werden.
// Sie treffen selbstständig Entscheidungen im Rahmen ihrer Befugnisse
// und legen wichtige Entscheidungen dem Geschäftsführer zur Freigabe vor.

import { mulberry32, dayOf, HIRE_FEE, DRIVER_COST_PER_DAY, CITIES, PORTRAIT_IDS, APPLICANT_NAMES, PERSONNEL_ROLES, VEHICLE_PRICE, STANDARD_TRUCK } from "./gameRules.ts";
import { previewCourseBooking, bookCourse, COURSE_CATALOG, hasQualification, isPersonInTraining, hasBranchManagerAdvanced } from "./trainingEngine.ts";
import { isActivelyEmployed, findPerson } from "./terminationEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { buildWorkshopSlot, WORKSHOP_SLOT_PRICE } from "./workshopEngine.ts";
import { registerAsset, addBooking } from "./accountingEngine.ts";
import { checkSpendAuthority, recordSpend, createApprovalRequest, logDecision, getEffectiveRules } from "./delegationEngine.ts";

function uid(state: any, prefix: string): string {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Auto-Freigabegrenze für autonome Filialleiter (5.000 €).
const AUTONOMOUS_THRESHOLD = 500000;

function pickDriverName(state: any): string {
  const pool = (APPLICANT_NAMES as any).driver || ["Fahrer"];
  const used = new Set([...(state.drivers || []).map((d: any) => d.name)]);
  const available = pool.filter((n: string) => !used.has(n));
  if (available.length > 0) return available[Math.floor(mulberry32((state.rngSeed ^ state.idCounter) >>> 0)() * available.length)];
  return "Fahrer " + ((state.drivers || []).length + 1);
}

function pickEmployeeName(state: any, role: string): string {
  const pool = (APPLICANT_NAMES as any)[role] || (APPLICANT_NAMES as any).dispatcher || ["Mitarbeiter"];
  const used = new Set([
    ...((state.drivers || []) as any[]).map((d: any) => d.name),
    ...((state.employees || []) as any[]).map((e: any) => e.name),
  ]);
  const available = pool.filter((n: string) => !used.has(n));
  if (available.length > 0) return available[Math.floor(mulberry32((state.rngSeed ^ state.idCounter) >>> 0)() * available.length)];
  const roleLabel = PERSONNEL_ROLES[role]?.label || role;
  return roleLabel + " " + ((state.employees || []).length + 1);
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
    if (!branch || branch.status !== "active" || !isPersonAvailable(state,mgr.id,state.gameTime) || isPersonInTraining(state,mgr.id,state.gameTime)) continue;

    // Max 1 offene Entscheidung pro Manager
    const hasPending = state.branchDecisions.some(
      (d: any) => d.managerId === mgr.id && d.status === "pending"
    );
    if (hasPending) continue;

    // Filialmanagement-Qualifikation: häufigere Entscheidungen (70% statt 50%)
    // und höhere Auto-Freigabegrenze (10.000€ statt 5.000€) → Filiale läuft autonomer.
    const advanced = hasBranchManagerAdvanced(state, mgr.id);
    const decisionChance = advanced ? 0.7 : 0.5;
    if (nextRandom(state) > decisionChance) continue;

    const decision = createDecision(state, mgr, branch);
    if (!decision) continue;

    // Autonomer Modus: kleine Entscheidungen auto-freigeben
    const autoThreshold = advanced ? AUTONOMOUS_THRESHOLD * 2 : AUTONOMOUS_THRESHOLD;
    const dayKey=Math.floor(state.gameTime/1440);
    const spent=mgr.autonomousSpendDay===dayKey?(mgr.autonomousSpentCents||0):0;
    const remaining=(mgr.autonomousDailyBudgetCents??autoThreshold)-spent;
    if (mgr.managementMode === "autonomous" && decision.costCents <= autoThreshold && decision.costCents<=remaining && state.company.accountCents>=decision.costCents && applyDecision(state, decision)) {
      decision.status = "auto_approved";
      decision.resolvedAt = state.gameTime;
      mgr.autonomousSpendDay=dayKey;mgr.autonomousSpentCents=spent+decision.costCents;
      state.branchDecisions.push(decision);
    } else {
      state.branchDecisions.push(decision);
      deliverMessage(state, {
        fromId: mgr.id, toId: "player", subject: decision.title || "Bitte um Freigabe",
        body: (decision.description || "Bitte prüfe diese Maßnahme.") + "\n\nDie Antwortmöglichkeiten findest du im Entscheidungsbereich des Postfachs.",
        gameTime: state.gameTime, category: "operations", priority: "normal",
        linkedRefs: { type: "branch_decision", id: decision.id },
        dedupKey: "branch_request:" + decision.id,
      });
    }
  }

  // Alte Entscheidungen aufräumen (> 7 Tage resolved)
  const cutoff = state.gameTime - 7 * 1440;
  state.branchDecisions = state.branchDecisions.filter(
    (d: any) => d.status === "pending" || d.createdAt > cutoff
  );

  return state;
}

// ---------- Wachstums-Erkennung ----------
// Filialleiter analysiert Filialzustand und identifiziert Lücken in
// Fuhrpark, Werkstatt und Personalbesetzung. Wachstumsentscheidungen
// haben Priorität vor zufälligen operativen Entscheidungen.
function identifyGrowthNeed(state: any, branch: any): string | null {
  const branchVehicles = (state.vehicles || []).filter(
    (v: any) => v.branchId === branch.id && v.status !== "sold" && v.status !== "archived"
  );
  const branchDrivers = (state.drivers || []).filter(
    (d: any) => d.branchId === branch.id && isActivelyEmployed(d)
  );
  const branchEmployees = (state.employees || []).filter(
    (e: any) =>
      (e.assignedBranchId === branch.id || e.branchId === branch.id) &&
      isActivelyEmployed(e) && e.role !== "branch_manager"
  );
  const workshopSlots = (state.workshop?.slots || []).filter((s: any) => s.branchId === branch.id);

  const roleCount: Record<string, number> = {};
  for (const e of branchEmployees) {
    roleCount[e.role] = (roleCount[e.role] || 0) + 1;
  }

  // 1. Werkstattplatz: Fahrzeuge vorhanden aber keine Werkstatt
  if (branchVehicles.length >= 3 && workshopSlots.length === 0) {
    return "build_workshop_slot";
  }
  // 2. Werkstatt überlastet: deutlich mehr Fahrzeuge als Werkstattplätze
  if (workshopSlots.length > 0 && branchVehicles.length > workshopSlots.length * 3) {
    return "build_workshop_slot";
  }
  // 3. Fahrzeugkauf: Auftragslage und Auslastung erfordern mehr Kapazität
  const vehiclesOnTrip = branchVehicles.filter((v: any) => v.status === "on_trip").length;
  const utilizationRate = branchVehicles.length > 0 ? vehiclesOnTrip / branchVehicles.length : 0;
  const branchCityBacklog = (state.orders || []).filter(
    (o: any) => o.status === "angenommen" && o.fromCity === branch.city
  ).length;
  const branchCityDemand = (state.orders || []).filter(
    (o: any) => (o.status === "offered" || o.status === "angenommen") && o.fromCity === branch.city
  ).length;
  if (branchVehicles.length < 6) {
    // Hohe Auslastung (>=70%) mit Auftragsrückstand (angenommen, nicht disponiert)
    if (branchVehicles.length > 0 && utilizationRate >= 0.7 && branchCityBacklog >= 1) {
      return "buy_vehicle";
    }
    // Sehr hohe Auslastung (>=85%) bei gutem Marktangebot ab Filialstadt
    if (branchVehicles.length > 0 && utilizationRate >= 0.85 && branchCityDemand >= branchVehicles.length) {
      return "buy_vehicle";
    }
    // Genug Fahrer für einen weiteren Lkw
    if (branchDrivers.length >= branchVehicles.length) {
      return "buy_vehicle";
    }
    // Starker Marktdemand bei noch kleinem Fuhrpark
    if (branchVehicles.length < 3 && branchCityDemand >= 3) {
      return "buy_vehicle";
    }
  }
  // 4a. Disponent vorhanden aber nicht autonom — bei Leerstand auf autonom umstellen
  const branchDispatchers = branchEmployees.filter(
    (e: any) => e.role === "dispatcher" || e.role === "dispatcher_senior"
  );
  const idleVehicles = branchVehicles.filter((v: any) => v.status === "free").length;
  const branchBacklog = (state.orders || []).filter(
    (o: any) => o.status === "angenommen" && o.fromCity === branch.city
  ).length;
  if (branchDispatchers.length > 0 && idleVehicles > 0 && branchBacklog > 0) {
    const hasNonAutonomous = branchDispatchers.some((d: any) => d.workMode !== "autonomous");
    if (hasNonAutonomous) {
      return "optimize_dispatch";
    }
  }
  // 4. Disponent fehlt bei ausreichend Fahrzeugen
  if (branchVehicles.length >= 2 && !roleCount.dispatcher && !roleCount.dispatcher_senior) {
    return "hire_employee:dispatcher";
  }
  // 5. Mechaniker fehlt bei vorhandener Werkstatt
  if (workshopSlots.length > 0 && !roleCount.mechanic) {
    return "hire_employee:mechanic";
  }
  // 6. Reinigungskraft fehlt bei ausreichend Fahrzeugen
  if (branchVehicles.length >= 3 && !roleCount.cleaner) {
    return "hire_employee:cleaner";
  }
  // 7. Buchhalter fehlt bei größerer Filiale
  if (branchVehicles.length >= 4 && !roleCount.accountant && !roleCount.accountant_senior) {
    return "hire_employee:accountant";
  }
  return null;
}

function createGrowthDecision(state: any, id: string, manager: any, branch: any, need: string): any | null {
  if (need === "optimize_dispatch") {
    return {
      id, branchId: branch.id, managerId: manager.id, type: "optimize_dispatch",
      title: "Disponent auf autonom umstellen",
      description: `${manager.name} empfiehlt für ${branch.name} (${branch.city}), den Disponent in den autonomen Modus zu versetzen, damit freie Lkw selbstständig verplant werden und die Auslastung steigt.`,
      costCents: 0,
      benefitDesc: "Höhere Flottenauslastung durch selbstständige Disposition",
      createdAt: state.gameTime, status: "pending",
    };
  }
  if (need === "buy_vehicle") {
    return {
      id, branchId: branch.id, managerId: manager.id, type: "buy_vehicle",
      title: "Neuen Lkw anschaffen",
      description: `${manager.name} empfiehlt für ${branch.name} (${branch.city}) einen weiteren Lkw zu kaufen, um die Auftragslage zu bewältigen.`,
      costCents: VEHICLE_PRICE,
      benefitDesc: "+1 Lkw, höhere Kapazität",
      createdAt: state.gameTime, status: "pending",
    };
  }
  if (need === "build_workshop_slot") {
    return {
      id, branchId: branch.id, managerId: manager.id, type: "build_workshop_slot",
      title: "Werkstattplatz bauen",
      description: `${manager.name} empfiehlt für ${branch.name} (${branch.city}) einen eigenen Werkstattplatz zu bauen, um Wartungskosten zu senken und Ausfälle zu minimieren.`,
      costCents: WORKSHOP_SLOT_PRICE,
      benefitDesc: "Interne Wartung möglich",
      createdAt: state.gameTime, status: "pending",
    };
  }
  if (need.startsWith("hire_employee:")) {
    const role = need.split(":")[1];
    const roleDef = PERSONNEL_ROLES[role];
    if (!roleDef) return null;
    return {
      id, branchId: branch.id, managerId: manager.id, type: "hire_employee",
      targetRole: role,
      title: `${roleDef.label} einstellen`,
      description: `${manager.name} möchte für ${branch.name} (${branch.city}) einen ${roleDef.label} einstellen, um den Filialbetrieb zu stärken.`,
      costCents: roleDef.hireFeeCents,
      benefitDesc: `+1 ${roleDef.label}, ${(roleDef.costPerDayCents / 100).toLocaleString("de-DE")} €/Tag`,
      createdAt: state.gameTime, status: "pending",
    };
  }
  return null;
}

function createDecision(state: any, manager: any, branch: any): any | null {
  const id = uid(state, "bd");

  // Wachstumsbedarf hat Priorität — Filialleiter identifiziert Lücken
  const growthNeed = identifyGrowthNeed(state, branch);
  if (growthNeed && branchResponsibilityAllows(manager,growthNeed)) {
    return createGrowthDecision(state, id, manager, branch, growthNeed);
  }

  // Kein Wachstumsbedarf — zufällige operative Entscheidung
  const types = ["hire_driver", "accept_order", "maintenance", "cost_optimization", "staff_training"].filter(type=>branchResponsibilityAllows(manager,type));
  if(!types.length)return null;
  const type = types[Math.floor(nextRandom(state) * types.length)];

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
    const revenue = 80000 + Math.floor(nextRandom(state) * 120000);
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
    const cost = 15000 + Math.floor(nextRandom(state) * 20000);
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
    const cost = 10000 + Math.floor(nextRandom(state) * 15000);
    const saving = 200 + Math.floor(nextRandom(state) * 800);
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
  if (decision.type === "optimize_dispatch") {
    const branchDispatchers = (state.employees || []).filter(
      (e: any) =>
        (e.assignedBranchId === decision.branchId || e.branchId === decision.branchId) &&
        (e.role === "dispatcher" || e.role === "dispatcher_senior") &&
        isActivelyEmployed(e)
    );
    for (const d of branchDispatchers) {
      d.workMode = "autonomous";
      d.suggestions = [];
    }
    pushEvent(state, {
      type: "branch_dispatch_optimized", gameTime: state.gameTime,
      employeeId: decision.managerId, isSystem: false,
      details: {
        branchName: (state.branches || []).find((b: any) => b.id === decision.branchId)?.name || "",
        dispatcherCount: branchDispatchers.length,
      },
      dedupKey: "branch_dispatch_opt:" + decision.id,
    });
    return true;
  }
  if (decision.type === "hire_driver") {
    const branch = state.branches.find((b: any) => b.id === decision.branchId);
    if (!branch) return false;
    if (state.company.accountCents < decision.costCents) return false;
    addBooking(state, state.gameTime, "Einstellung: Filialleiter – Fahrer", -decision.costCents, "company", "bm_hire");
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
    return true;
  }
  if (decision.type === "accept_order") {
    if (!decision.revenueCents) return false;
    const branch = state.branches.find((b: any) => b.id === decision.branchId);
    if (!branch) return false;
    // Echten Auftrag erstellen — muss disponiert und geliefert werden
    const destCities = CITIES.filter((c: string) => c !== branch.city);
    const toCity = destCities[Math.floor(nextRandom(state) * destCities.length)];
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
    return true;
  }
  if (decision.type === "maintenance") {
    if (state.company.accountCents < decision.costCents) return false;
    addBooking(state, state.gameTime, "Wartung: Filialleiter – Inspektion", -decision.costCents, "company", "bm_maint");
    const vehicles = (state.vehicles || []).filter(
      (v: any) => v.branchId === decision.branchId && v.status !== "sold" && v.status !== "archived"
    );
    for (const v of vehicles) v.condition = Math.min(100, (v.condition || 70) + 15);
    return true;
  }
  if (decision.type === "cost_optimization") {
    if (state.company.accountCents < decision.costCents) return false;
    addBooking(state, state.gameTime, "Filialleiter: Prozessoptimierung", -decision.costCents, "company", "bm_costopt");
    const branch = state.branches.find((b: any) => b.id === decision.branchId);
    if (branch) {
      branch.costPerDayCents = Math.max(1000, (branch.costPerDayCents || 5000) - decision.savingPerDayCents);
    }
    return true;
  }
  if (decision.type === "staff_training") {
    if (!decision.personId || !decision.courseId) return false;
    const found = findPerson(state, decision.personId);
    if (!found || !isActivelyEmployed(found.person)) return false;
    if (isPersonInTraining(state, decision.personId)) return false;
    const course = COURSE_CATALOG.find((c: any) => c.id === decision.courseId);
    if (!course) return false;
    if (state.company.accountCents < course.feeCents) return false;
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
      return false; // Anfrage bleibt offen, wenn die Buchung nicht möglich ist.
    }
    return true;
  }
  if (decision.type === "buy_vehicle") {
    const branch = state.branches.find((b: any) => b.id === decision.branchId);
    if (!branch) return false;
    if (state.company.accountCents < VEHICLE_PRICE) return false;
    addBooking(state, state.gameTime, "Fahrzeugkauf: Filialleiter", -VEHICLE_PRICE, "company", "bm_vehicle");
    const v = {
      id: uid(state, "v"), branchId: branch.id, type: STANDARD_TRUCK.type,
      capacityTons: 12, consumptionPer100km: 28, bookValueCents: VEHICLE_PRICE,
      condition: 85, locationCity: branch.city, status: "free", tripId: null,
      maintenanceUntil: null, ownership_type: "owned", odometerKm: 0,
      acquiredAtMin: state.gameTime, referencePriceCents: VEHICLE_PRICE,
      markedForSale: false, saleOffer: null,
    };
    state.vehicles.push(v);
    registerAsset(state, {
      vehicleId: v.id, account: "1200",
      name: "Lkw " + String(parseInt(String(v.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0"),
      acquisitionCostCents: VEHICLE_PRICE, acquiredAtMin: state.gameTime,
    });
    pushEvent(state, {
      type: "branch_vehicle_purchased", gameTime: state.gameTime,
      employeeId: decision.managerId, isSystem: false,
      details: { vehicleId: v.id, branchName: branch.name, costCents: VEHICLE_PRICE },
      dedupKey: "branch_vehicle:" + decision.id,
    });
    return true;
  }
  if (decision.type === "build_workshop_slot") {
    try {
      buildWorkshopSlot(state, { branchId: decision.branchId });
      pushEvent(state, {
        type: "branch_workshop_built", gameTime: state.gameTime,
        employeeId: decision.managerId, isSystem: false,
        details: {
          branchId: decision.branchId,
          branchName: (state.branches || []).find((b: any) => b.id === decision.branchId)?.name || "",
          costCents: WORKSHOP_SLOT_PRICE,
        },
        dedupKey: "branch_workshop:" + decision.id,
      });
    } catch (e: any) { return false; }
    return true;
  }
  if (decision.type === "hire_employee") {
    const role = decision.targetRole;
    if (!role) return false;
    const roleDef = PERSONNEL_ROLES[role];
    if (!roleDef) return false;
    const branch = state.branches.find((b: any) => b.id === decision.branchId);
    if (!branch) return false;
    if (state.company.accountCents < roleDef.hireFeeCents) return false;
    addBooking(state, state.gameTime, "Einstellung: " + roleDef.label, -roleDef.hireFeeCents, "company", "bm_hire_emp");
    const portraitIdx = (state.employees || []).length % PORTRAIT_IDS.length;
    const emp = {
      id: uid(state, "emp"), name: pickEmployeeName(state, role), role,
      branchId: branch.id, locationCity: branch.city,
      employedDay: dayOf(state.gameTime),
      costPerDayCents: roleDef.costPerDayCents, hireFeeCents: roleDef.hireFeeCents,
      satisfaction: 70, satisfactionReasons: [],
      employmentStatus: "employed", exitDate: null,
      attendance: "present", sickUntil: null, vacationUntil: null,
      vacationDaysAvailable: 3,
      activity: "idle", consecutiveLowSatisfactionDays: 0,
      assignedVehicleIds: [],
      workMode: (role === "dispatcher" || role === "dispatcher_senior") ? "autonomous" : "suggestions",
      managementMode: undefined,
      assignedBranchId: (role === "dispatcher" || role === "dispatcher_senior" || role === "mechanic" || role === "cleaner") ? branch.id : undefined,
      capacity: roleDef.capacity,
      lastDecisionMin: null, suggestions: [],
      portraitId: PORTRAIT_IDS[portraitIdx],
    };
    state.employees.push(emp);
    pushEvent(state, {
      type: "branch_employee_hired", gameTime: state.gameTime,
      employeeId: decision.managerId, isSystem: false,
      details: {
        personName: emp.name, role: roleDef.label,
        branchName: branch.name, feeCents: roleDef.hireFeeCents,
      },
      dedupKey: "branch_hire:" + decision.id,
    });
    return true;
  }
  return false;
}

// ---------- Befehle ----------

export function approveBranchDecision(state: any, decisionId: string) {
  migrateBranchManagerState(state);
  const decision = state.branchDecisions.find(
    (d: any) => d.id === decisionId && d.status === "pending"
  );
  if (!decision) throw new Error("Entscheidung nicht gefunden oder bereits bearbeitet.");
  // Vor Freigabe auf einer Kopie prüfen: fehlgeschlagene Maßnahmen bleiben offen.
  const draft = structuredClone(state);
  const draftDecision = draft.branchDecisions.find((d: any) => d.id === decisionId);
  if (!applyDecision(draft, draftDecision)) throw new Error("Die Maßnahme ist aktuell nicht ausführbar. Bitte Geldmittel, Personal und Standort prüfen.");
  draftDecision.status = "approved";
  draftDecision.resolvedAt = draft.gameTime;
  deliverMessage(draft, {
    fromId: "player", toId: decision.managerId || "system", subject: "Freigabe: " + decision.title,
    body: "Freigabe erteilt. Die Maßnahme wurde ausgeführt.",
    gameTime: draft.gameTime, category: "operations",
    linkedRefs: { type: "branch_decision", id: decisionId }, dedupKey: "branch_reply:" + decisionId,
  });
  Object.assign(state, draft);
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
  deliverMessage(state, {
    fromId: "player", toId: decision.managerId || "system", subject: "Antwort: " + decision.title,
    body: "Diese Maßnahme wurde nicht freigegeben.",
    gameTime: state.gameTime, category: "operations",
    linkedRefs: { type: "branch_decision", id: decisionId }, dedupKey: "branch_reply:" + decisionId,
  });
  return { ok: true, decisionId };
}

export function setBranchManagerMode(state: any, employeeId: string, mode: string) {
  const emp = (state.employees || []).find((e: any) => e.id === employeeId);
  if (!emp) throw new Error("Angestellter nicht gefunden.");
  if (emp.role !== "branch_manager") throw new Error("Diese Person ist kein Filialleiter.");
  emp.managementMode = mode === "autonomous" ? "autonomous" : "requests_approval";
  return { ok: true, employeeId, managementMode: emp.managementMode };
}