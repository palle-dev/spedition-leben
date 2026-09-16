// Entwicklungs-Engine für FERNWERK.
// Verwaltet Entwicklungsschwerpunkte, geführten Einstieg (Onboarding),
// Unternehmensmeilensteine und tägliche Auto-Entscheidungs-Statistik.
// Trennung: developmentEngine (Logik) · achievementCatalog (statische Definitionen).

import { dayOf } from "./gameRules.ts";

// ---------- Entwicklungsschwerpunkte ----------

export const DEVELOPMENT_FOCI = [
  { id: "profitable", label: "Profitabel wirtschaften",
    desc: "Umsatz, Deckungsbeitrag und Unternehmenswert im Fokus.",
    suggestedGoals: ["g_first_five", "g_deliveries_50", "g_revenue_100k", "g_company_1m"] },
  { id: "reliable", label: "Zuverlässige Kundenbeziehungen",
    desc: "Pünktlichkeit, Vertrauen und Stammkunden aufbauen.",
    suggestedGoals: ["g_reliable_ten", "g_stammkunde", "g_contract_fulfillment"] },
  { id: "autonomous_team", label: "Ein selbstständiges Team",
    desc: "Mitarbeiter entscheiden und disponieren selbstständig mit.",
    suggestedGoals: ["g_auto_delegation", "g_fleet_10"] },
  { id: "controlled_growth", label: "Kontrolliert wachsen",
    desc: "Filialen und Flotte verantwortungsvoll erweitern.",
    suggestedGoals: ["g_branch_growth", "g_fleet_10", "g_company_1m"] },
  { id: "work_life", label: "Unternehmen und Privatleben verbinden",
    desc: "Balance zwischen Betrieb und persönlichem Leben halten.",
    suggestedGoals: ["g_balance_week", "g_story_complete", "g_promises_5"] },
];

export function migrateDevelopment(state) {
  if (!state.developmentFocus) state.developmentFocus = null;
  if (!state.onboarding) {
    state.onboarding = {
      active: false, paused: false, step: null,
      startedAtMin: null, reviewedDelivery: false, completedSteps: [],
    };
  }
  if (!state.onboarding.completedSteps) state.onboarding.completedSteps = [];
  if (state.onboarding.reviewedDelivery === undefined) state.onboarding.reviewedDelivery = false;
  if (!Array.isArray(state.developmentMilestones)) state.developmentMilestones = [];
  // Altes Tutorial auf neues Onboarding migrieren (nur wenn noch aktiv)
  if (state.tutorial && state.tutorial.active && !state.onboarding.active && state.onboarding.startedAtMin === null) {
    state.onboarding.active = true;
    state.onboarding.startedAtMin = state.gameTime || 480;
  }
  // Auto-Entscheidungs-Statistik initialisieren
  if (!state.stats) state.stats = {};
  if (!Array.isArray(state.stats.autoDecisionDays)) state.stats.autoDecisionDays = [];
}

export function setDevelopmentFocus(state, focusId) {
  migrateDevelopment(state);
  const valid = DEVELOPMENT_FOCI.some(f => f.id === focusId);
  if (!valid) throw new Error("Unbekannter Schwerpunkt: " + focusId);
  state.developmentFocus = focusId;
  return { ok: true, focusId };
}

// ---------- Geführter Einstieg (Onboarding) ----------

export const ONBOARDING_STEPS = [
  { id: "choose_order", title: "Einen Auftrag auswählen", linkPath: "/auftraege",
    hint: "Oeffne die Auftraege-Seite und nimm ein passendes Angebot an. Achte auf Relation, Fracht, Verguetung und Lieferfrist." },
  { id: "assign_vehicle", title: "Fahrzeug und Fahrer zuordnen", linkPath: "/disposition",
    hint: "Oeffne die Disposition und waehle einen freien Lkw und einen freien Fahrer am selben Standort. Das System prueft Kapazitaet, Zustand und Kontostand." },
  { id: "start_tour", title: "Die Tour starten", linkPath: "/disposition",
    hint: `Bestaetige die Tour. Nutze Naechstes Ereignis oder 1 Std, um die Zeit weiterlaufen zu lassen. Fahrt, Beladung, Entladung und Pausen laufen automatisch ab.` },
  { id: "await_delivery", title: "Die Lieferung abwarten", linkPath: "/disposition",
    hint: "Die Tour laeuft durch Fahr- und Beladungsphasen. Warte, bis die Lieferung abgeschlossen ist oder beschleunige die Zeit." },
  { id: "review_delivery", title: "Die Lieferung auswerten", linkPath: "/finanzen",
    hint: "Oeffne die Finanzen. Vergleiche Verguetung (Umsatz) mit Kraftstoff, Maut und Fahrerlohn. Der Deckungsbeitrag zeigt, was nach variablen Kosten uebrig bleibt." },
  { id: "next_decision", title: "Eine naechste Entscheidung treffen", linkPath: "/",
    hint: "Waehle deinen naechsten Schritt: eine Rueckladung, Wartung, eine weitere Tour oder die erste Delegation an einen Mitarbeiter." },
];

// Erkennt den aktuellen Onboarding-Schritt aus dem Spielzustand.
// Rein zustaendsbasiert: ausserhalb der Reihenfolge ausgefuehrte Aktionen
// werden korrekt erkannt.
export function detectOnboardingStep(state) {
  const hasAccepted = (state.orders || []).some(o => o.status === "angenommen");
  const hasActiveTrip = (state.trips || []).some(t => t.status === "in_progress");
  const totalDeliveries = state.stats?.totalDeliveries || 0;
  const hasReviewed = state.onboarding?.reviewedDelivery || false;

  if (totalDeliveries >= 1 && hasReviewed) return "next_decision";
  if (totalDeliveries >= 1) return "review_delivery";
  if (hasActiveTrip) return "await_delivery";
  if (hasAccepted) return "assign_vehicle";
  return "choose_order";
}

export function startOnboarding(state) {
  migrateDevelopment(state);
  state.onboarding.active = true;
  state.onboarding.paused = false;
  state.onboarding.startedAtMin = state.gameTime;
  state.onboarding.step = detectOnboardingStep(state);
  return { ok: true, step: state.onboarding.step };
}

export function pauseOnboarding(state) {
  migrateDevelopment(state);
  state.onboarding.paused = true;
  return { ok: true };
}

export function resumeOnboarding(state) {
  migrateDevelopment(state);
  state.onboarding.paused = false;
  state.onboarding.step = detectOnboardingStep(state);
  return { ok: true, step: state.onboarding.step };
}

export function dismissOnboarding(state) {
  migrateDevelopment(state);
  state.onboarding.active = false;
  state.onboarding.paused = false;
  if (state.tutorial) state.tutorial.active = false;
  return { ok: true };
}

export function markOnboardingReviewed(state) {
  migrateDevelopment(state);
  state.onboarding.reviewedDelivery = true;
  return { ok: true };
}

// Prueft, ob ein Schritt blockiert ist, und bietet ggf. eine Ersatzhandlung an.
export function getOnboardingBlocker(state) {
  const step = detectOnboardingStep(state);
  if (step === "choose_order") {
    const offered = (state.orders || []).filter(o => o.status === "offered" && o.acceptDeadlineMin > state.gameTime);
    if (offered.length === 0) {
      return { step, blocked: true, reason: "Keine offenen Angebote verfuegbar. Neue Auftraege erscheinen regelmaessig auf dem Markt.", alternative: "Warte auf die naechste Marktaktualisierung (jede Stunde) oder ueberspringe diesen Schritt." };
    }
  }
  if (step === "assign_vehicle") {
    const accepted = (state.orders || []).filter(o => o.status === "angenommen");
    if (accepted.length === 0) {
      return { step, blocked: false, reason: "Auftrag abgelaufen oder storniert. Nimm einen neuen Auftrag an.", alternative: null, skipTo: "choose_order" };
    }
    const freeVehicles = (state.vehicles || []).filter(v => v.status === "free" && v.condition >= 20 && !v.markedForSale);
    const freeDrivers = (state.drivers || []).filter(d => d.employmentStatus === "employed" && d.attendance !== "released" && d.status === "free");
    if (freeVehicles.length === 0) {
      return { step, blocked: true, reason: "Kein freier Lkw verfuegbar. Warte bis eine Tour endet oder kaufe einen weiteren Lkw.", alternative: "Ueberspringe die Disposition und nutze die Automatik, sobald ein Disponent eingestellt ist." };
    }
    if (freeDrivers.length === 0) {
      return { step, blocked: true, reason: "Kein freier Fahrer verfuegbar. Warte bis ein Fahrer sich erholt hat oder stelle einen neuen Fahrer ein.", alternative: "Ueberspringe die Disposition und nutze die Automatik." };
    }
  }
  return { step, blocked: false, reason: null, alternative: null };
}

// ---------- Entwicklungsmeilensteine ----------

export const DEVELOPMENT_MILESTONES = [
  { id: "dm_first_deliveries", label: "Erste Lieferungen",
    check: (s) => (s.stats?.totalDeliveries || 0) >= 1,
    progress: (s) => ({ current: Math.min(s.stats?.totalDeliveries || 0, 1), target: 1 }) },
  { id: "dm_reliable_ops", label: "Verlaesslicher Betrieb",
    check: (s) => (s.stats?.totalDeliveries || 0) >= 20 || (s.stats?.consecutiveTimely || 0) >= 10,
    progress: (s) => ({ current: Math.min(s.stats?.totalDeliveries || 0, 20), target: 20 }) },
  { id: "dm_autonomous_team", label: "Eigenstaendiges Team",
    check: (s) => (s.employees || []).some(e => e.employmentStatus === "employed" && (e.role === "dispatcher" || e.role === "dispatcher_senior")),
    progress: (s) => ({ current: Math.min((s.employees || []).filter(e => e.employmentStatus === "employed" && (e.role === "dispatcher" || e.role === "dispatcher_senior")).length, 1), target: 1 }) },
  { id: "dm_multi_branch", label: "Mehrere Standorte",
    check: (s) => (s.branches || []).filter(b => b.status === "active").length >= 2,
    progress: (s) => ({ current: Math.min((s.branches || []).filter(b => b.status === "active").length, 2), target: 2 }) },
];

export function checkDevelopmentMilestones(state, min) {
  migrateDevelopment(state);
  const newlyAchieved = [];
  for (const def of DEVELOPMENT_MILESTONES) {
    let m = state.developmentMilestones.find(x => x.id === def.id);
    if (!m) {
      m = { id: def.id, label: def.label, achieved: false, achievedAtMin: null };
      state.developmentMilestones.push(m);
    }
    if (!m.achieved && def.check(state)) {
      m.achieved = true;
      m.achievedAtMin = min;
      newlyAchieved.push({ id: m.id, label: m.label });
    }
  }
  return newlyAchieved;
}

// ---------- Taegliche Auto-Entscheidungs-Statistik (fuer Ziel E) ----------

export function recordAutoDecisionDay(state, midnight) {
  migrateDevelopment(state);
  const day = dayOf(midnight);
  const dayDecisions = (state.delegation?.decisionLog || []).filter(d =>
    d.auto !== false && dayOf(d.atMin) === day && d.type !== "blocked"
  );
  const count = dayDecisions.length;
  const hadOverdue = (state.approvals?.pending || []).some(a =>
    a.status === "pending" && a.deadlineMin != null && a.deadlineMin < midnight
  );

  let entry = state.stats.autoDecisionDays.find(e => e.day === day);
  if (!entry) {
    entry = { day, count, hadOverdue };
    state.stats.autoDecisionDays.push(entry);
  } else {
    entry.count = count;
    entry.hadOverdue = hadOverdue;
  }
  if (state.stats.autoDecisionDays.length > 30) {
    state.stats.autoDecisionDays = state.stats.autoDecisionDays.slice(-30);
  }
}

export function getConsecutiveAutoDelegationDays(state) {
  const days = (state.stats?.autoDecisionDays || []).slice().sort((a, b) => a.day - b.day);
  let maxConsecutive = 0;
  let current = 0;
  let prevDay = -999;
  for (const d of days) {
    const ok = d.count >= 3 && !d.hadOverdue;
    if (ok && d.day === prevDay + 1) {
      current++;
    } else if (ok) {
      current = 1;
    } else {
      current = 0;
    }
    maxConsecutive = Math.max(maxConsecutive, current);
    prevDay = d.day;
  }
  return maxConsecutive;
}

// ---------- Hilfsfunktionen fuer Ziel-Evaluatoren ----------

export function countOperationalBranches(state) {
  const branches = (state.branches || []).filter(b => b.status === "active");
  let count = 0;
  for (const b of branches) {
    const hasVehicle = (state.vehicles || []).some(v => v.branchId === b.id && v.status !== "sold" && v.status !== "archived");
    const hasDriver = (state.drivers || []).some(d => d.branchId === b.id && d.employmentStatus === "employed");
    const hasDelivery = (b.stats?.deliveries || 0) >= 1;
    if (hasVehicle && hasDriver && hasDelivery) count++;
  }
  return count;
}

export function countFulfilledContracts(state) {
  const contracts = (state.contracts?.contracts || []).filter(c => c.status === "completed");
  let count = 0;
  for (const c of contracts) {
    const totalTransports = c.transportsPerDay * 7;
    if (totalTransports > 0 && c.timelyCount / totalTransports >= 0.9) count++;
  }
  return count;
}

export function countCompletedStories(state) {
  return (state.private?.stories?.runs || []).filter(r =>
    r.status === "completed" && r.completionType !== "cancelled" && r.completionType !== "expired"
  ).length;
}

export function countStammkunden(state) {
  const relations = Object.values(state.customerRelations?.relations || {});
  return relations.filter(r => r.completedTransports >= 5 && r.trust >= 60).length;
}