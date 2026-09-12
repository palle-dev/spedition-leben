// Fortschritts-Engine für FERNWERK.
// Berechnet Unternehmensvermögen, privates Nettovermögen, XP-Stufen,
// Entwicklungsstufen, Erfolgsprüfung, Zielfortschritt und Migration.
// Trennung: achievementCatalog (statisch) · progressEngine (Berechnung).

import { ACHIEVEMENTS, XP_LEVELS, COMPANY_STAGES, GOAL_TEMPLATES } from "./achievementCatalog.ts";
import { PERSONNEL_ROLES, PORTRAIT_IDS, DRIVER_COST_PER_DAY, HIRE_FEE } from "./gameRules.ts";
import { migrateAccounting } from "./accountingEngine.ts";
import { migrateMail } from "./mailEngine.ts";
import { migrateTripPhases } from "./driverTimeEngine.ts";
import { migrateFinancing } from "./financingEngine.ts";
import { migrateTermination } from "./terminationEngine.ts";
import { migrateMarket } from "./marketEngine.ts";
import { migrateTimeControl } from "./timeControlEngine.ts";
import { migrateEvents } from "./eventLog.ts";
import { getVehicleBookValue, MONTH_MIN } from "./accountingEngine.ts";
import { VEHICLE_REFERENCE_PRICE } from "./gameRules.ts";

// --- Vermögensberechnungen ---

export function computeCompanyValue(state) {
  const vehicleValue = (state.vehicles || [])
    .filter(v => (v.ownership_type || "owned") === "owned" && v.status !== "archived" && v.status !== "sold")
    .reduce((s, v) => s + getVehicleBookValue(state, v.id), 0);
  const openCompanyCosts = (state.openCosts || []).filter(o => o.account === "company").reduce((s, o) => s + o.amountCents, 0);
  const loanDebt = (state.loans || [])
    .filter(l => l.status === "active")
    .reduce((s, l) => s + (l.remainingPrincipalCents || 0) + (l.accruedInterestCents || 0) + (l.overdueInterestCents || 0) + (l.overduePrincipalCents || 0), 0);
  return (state.company?.accountCents || 0) + vehicleValue - openCompanyCosts - loanDebt;
}

export function computePrivateNetWorth(state) {
  // Etappe 2: verkäufliche Werte privaten Eigentums addieren
  const assetValue = 0;
  const openPrivateCosts = (state.openCosts || []).filter(o => o.account === "private").reduce((s, o) => s + o.amountCents, 0);
  return (state.private?.accountCents || 0) + assetValue - openPrivateCosts;
}

// --- Stufenberechnung ---

export function getExperienceLevel(xp) {
  let current = XP_LEVELS[0];
  let next = null;
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i].minXp) {
      current = XP_LEVELS[i];
      next = XP_LEVELS[i + 1] || null;
    }
  }
  return { level: current.level, title: current.title, minXp: current.minXp, nextMinXp: next ? next.minXp : null, nextTitle: next ? next.title : null };
}

export function getDevelopmentStage(companyValueCents) {
  let stage = COMPANY_STAGES[0];
  for (const s of COMPANY_STAGES) {
    if (companyValueCents >= s.minValueCents) stage = s;
  }
  return stage;
}

// --- Stat-Wert für Ziele ---

export function getStatValue(state, key) {
  if (key === "vehicleCount") return (state.vehicles || []).filter(v => (v.ownership_type || "owned") === "owned" && v.status !== "archived").length;
  if (key === "companyValue") return computeCompanyValue(state);
  if (key === "privateNetWorth") return computePrivateNetWorth(state);
  return (state.stats && state.stats[key]) || 0;
}

// --- Zielfortschritt ---

export function getGoalProgress(state, goal) {
  const tpl = GOAL_TEMPLATES.find(t => t.id === goal.templateId);
  if (!tpl) return { current: 0, target: 1, completed: false, nextAction: "" };
  if (tpl.type === "purchase") {
    const cash = state.private?.accountCents || 0;
    const current = Math.min(cash, tpl.targetCents);
    const remaining = Math.max(0, tpl.targetCents - cash);
    return { current, target: tpl.targetCents, remaining, completed: cash >= tpl.targetCents, nextAction: tpl.nextAction };
  }
  if (tpl.type === "stat") {
    const current = getStatValue(state, tpl.statKey);
    return { current, target: tpl.target, completed: current >= tpl.target, nextAction: tpl.nextAction };
  }
  return { current: 0, target: 1, completed: false, nextAction: "" };
}

// --- Erfolgsfortschritt für Anzeige ---

export function getAchievementProgress(state, achievementId) {
  const def = ACHIEVEMENTS.find(a => a.id === achievementId);
  if (!def) return { current: 0, target: 1 };
  const computed = { companyValue: computeCompanyValue(state), privateNetWorth: computePrivateNetWorth(state) };
  return def.progress(state, computed);
}

// --- Serverseitige Erfolgsprüfung ---

export function checkAchievements(state, min) {
  const computed = { companyValue: computeCompanyValue(state), privateNetWorth: computePrivateNetWorth(state) };
  const newlyUnlocked = [];
  for (const def of ACHIEVEMENTS) {
    const existing = (state.achievements || []).find(a => a.id === def.id);
    if (!existing || existing.unlocked) continue;
    if (def.condition(state, computed)) {
      existing.unlocked = true;
      existing.unlockedAtMin = min;
      state.xp = (state.xp || 0) + def.xp;
      newlyUnlocked.push({ id: def.id, title: def.title, xp: def.xp, category: def.category });
    }
  }
  return newlyUnlocked;
}

// --- Migration alter Spielstände ---

export function migrateState(state) {
  if (!state) return state;

  // Erfolge anlegen und Alt-Meilensteine mappen
  if (!state.achievements) {
    state.achievements = ACHIEVEMENTS.map(a => ({ id: a.id, unlocked: false, unlockedAtMin: null, seen: false }));
    if (state.milestones) {
      const map = { m1: "biz_first", m2: "biz_ten_on_time", m3: "fleet_four" };
      for (const [mId, aId] of Object.entries(map)) {
        const m = state.milestones.find(x => x.id === mId);
        if (m && m.achieved) {
          const a = state.achievements.find(x => x.id === aId);
          if (a) { a.unlocked = true; a.unlockedAtMin = m.achievedAtMin; a.seen = true; }
        }
      }
    }
    // XP aus bereits freigeschalteten Erfolgen berechnen
    state.xp = state.achievements.filter(a => a.unlocked).reduce((s, a) => {
      const def = ACHIEVEMENTS.find(x => x.id === a.id);
      return s + (def ? def.xp : 0);
    }, 0);
  }

  // Ziele
  if (!state.goals) state.goals = [];

  // Statistikfelder ergänzen
  if (!state.stats) state.stats = { timelyDeliveries: 0, totalDeliveries: 0 };
  const defaultStats = {
    consecutiveTimely: 0, cancelledOrders: 0, totalRevenueCents: 0,
    maintainedVehicleIds: [], leisureCount: 0, leisureTypes: [],
    promisesKept: 0, consecutiveBalanceDays: 0, lastBalanceDay: 0,
    hobbyCounts: {}, friendshipQualities: {}, ownershipCount: 0,
    homeFurnishingTypes: [], hasHome: false, hasCar: false,
    hasSportCar: false, hasBoat: false, hasVilla: false, tripsCompleted: 0,
  };
  for (const [k, v] of Object.entries(defaultStats)) {
    if (state.stats[k] === undefined) state.stats[k] = v;
  }

  // ---------- Fahrzeug-Migration (Auftrag 21) ----------
  // acquiredAtMin und referencePriceCents für Marktwertberechnung ergänzen.
  // Startfahrzeuge ohne acquiredAtMin erhalten den Spielstart als Inbetriebnahme.
  for (const v of (state.vehicles || [])) {
    if (v.acquiredAtMin === undefined) v.acquiredAtMin = state.gameTime || 480;
    if (v.referencePriceCents === undefined) v.referencePriceCents = VEHICLE_REFERENCE_PRICE;
    if (v.markedForSale === undefined) v.markedForSale = false;
    if (v.saleOffer === undefined) v.saleOffer = null;
  }

  // ---------- Personalmodell Migration (Auftrag 11) ----------
  // employees-Array anlegen
  if (!state.employees) state.employees = [];

  // Fahrer um neue Felder erweitern (Beschäftigung, Anwesenheit, Zufriedenheit, Porträt)
  // Sowie Fahrerzeit-Modell (Regeländerung 16): workMinutesSinceRest, driveMinutesSinceBreak
  let portraitIdx = 0;
  for (const d of (state.drivers || [])) {
    if (d.satisfaction === undefined) d.satisfaction = 70;
    if (!d.satisfactionReasons) d.satisfactionReasons = [];
    if (!d.employmentStatus) d.employmentStatus = "employed";
    if (!d.attendance) d.attendance = "present";
    if (d.consecutiveLowSatisfactionDays === undefined) d.consecutiveLowSatisfactionDays = 0;
    if (!d.portraitId) d.portraitId = PORTRAIT_IDS[portraitIdx++ % PORTRAIT_IDS.length];
    // Fahrerzeit-Modell: Zähler initialisieren (alte Spielstände: vollständig erholt)
    if (d.workMinutesSinceRest === undefined) d.workMinutesSinceRest = 0;
    if (d.driveMinutesSinceBreak === undefined) d.driveMinutesSinceBreak = 0;
  }

  // ---------- Trip-Phasen Migration (Regeländerung 16) ----------
  // Alte Trips mit legs → phases, legacyMode = true
  for (const trip of (state.trips || [])) {
    migrateTripPhases(trip);
  }

  // Alte Bewerber (nur {id, name}) um Rollen-Felder erweitern
  for (const app of (state.availableApplicants || [])) {
    if (!app.role) {
      app.role = "driver";
      app.hireFeeCents = HIRE_FEE;
      app.costPerDayCents = DRIVER_COST_PER_DAY;
      app.capacity = 0;
    }
    if (!app.portraitId) {
      app.portraitId = PORTRAIT_IDS[portraitIdx++ % PORTRAIT_IDS.length];
    }
  }

  // hiredApplicantNames auf neues Format (name:role) migrieren
  if (state.hiredApplicantNames && state.hiredApplicantNames.length > 0) {
    state.hiredApplicantNames = state.hiredApplicantNames.map(n =>
      n.includes(":") ? n : n + ":driver"
    );
  }

  // Wenn noch keine Rollen-Bewerber vorhanden sind, fehlende Rollen nachfüllen
  const hasDispatcherApp = (state.availableApplicants || []).some(a => a.role === "dispatcher");
  if (!hasDispatcherApp && state.availableApplicants) {
    let idNum = (state.availableApplicants.length || 0) + 1;
    // Standard-Disponent
    state.availableApplicants.push({
      id: "a" + (idNum++), name: "Helena Voss", role: "dispatcher",
      hireFeeCents: PERSONNEL_ROLES.dispatcher.hireFeeCents,
      costPerDayCents: PERSONNEL_ROLES.dispatcher.costPerDayCents,
      capacity: 6, portraitId: PORTRAIT_IDS[portraitIdx++ % PORTRAIT_IDS.length],
    });
    // Erfahrener Disponent
    state.availableApplicants.push({
      id: "a" + (idNum++), name: "Rüdiger Mai", role: "dispatcher_senior",
      hireFeeCents: PERSONNEL_ROLES.dispatcher_senior.hireFeeCents,
      costPerDayCents: PERSONNEL_ROLES.dispatcher_senior.costPerDayCents,
      capacity: 12, portraitId: PORTRAIT_IDS[portraitIdx++ % PORTRAIT_IDS.length],
    });
  }

  if (!state.portraitAssignments) state.portraitAssignments = {};

  // ---------- Buchhaltungs-Migration (Auftrag 12) ----------
  migrateAccounting(state);

  // ---------- Postfach-Migration (Auftrag 13) ----------
  migrateMail(state);

  // ---------- Finanzierungs-Migration (Auftrag 17) ----------
  migrateFinancing(state);

  // ---------- Kündigungs-Migration (Auftrag 18) ----------
  migrateTermination(state);

  // ---------- Markt-Migration (Auftrag 19) ----------
  migrateMarket(state);

  // ---------- Zeitsteuerungs-Migration (Auftrag 20) ----------
  migrateTimeControl(state);

  // ---------- Ereignisprotokoll-Migration (Auftrag 23) ----------
  migrateEvents(state);

  return state;
}