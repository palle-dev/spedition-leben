// Frontend-Spiegel der Entwicklungs-Engine für FERNWERK.
// Spiegelt base44/shared/developmentEngine.ts für Darstellung.
// dayOf wird inline definiert (kein gameRules-Import im Frontend).

function dayOf(min) { return Math.floor(min / 1440) + 1; }

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
  if (state.tutorial && state.tutorial.active && !state.onboarding.active && state.onboarding.startedAtMin === null) {
    state.onboarding.active = true;
    state.onboarding.startedAtMin = state.gameTime || 480;
  }
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

export const ONBOARDING_STEPS = [
  { id: "choose_order", title: "Einen Auftrag auswählen", linkPath: "/auftraege",
    hint: "Öffne die Aufträge und nimm ein passendes Angebot an. Achte auf Strecke, Fracht, Vergütung und Lieferfrist." },
  { id: "assign_vehicle", title: "Fahrzeug und Fahrer zuordnen und Tour starten", linkPath: "/disposition",
    hint: "Wähle in der Disposition einen verfügbaren Lkw und Fahrer, prüfe die Tour und bestätige den Start. Beachte dabei die Hinweise zu Kapazität, Standort und Verfügbarkeit." },
  { id: "await_delivery", title: "Die Lieferung abwarten", linkPath: "/disposition",
    hint: "Starte unten die Live-Simulation oder nutze „+1 Std“. Ohne Zeitvorlauf bleibt die Tour stehen. Beladung, Fahrt, Pausen und Entladung laufen mit der Spielzeit weiter. Prüfe bei einem Stopp offene Freigaben und Meldungen." },
  { id: "review_delivery", title: "Die Lieferung auswerten", linkPath: "/finanzen",
    hint: "Öffne die Finanzen. Vergleiche Vergütung (Umsatz) mit Kraftstoff, Maut und Fahrerlohn. Der Deckungsbeitrag zeigt, was nach variablen Kosten übrig bleibt." },
  { id: "next_decision", title: "Eine nächste Entscheidung treffen", linkPath: "/",
    hint: "Wähle deinen nächsten Schritt: eine Rückladung, Wartung, eine weitere Tour oder die erste Delegation an einen Mitarbeiter. Du kannst die Begleitung jetzt abschließen." },
];

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

export function getOnboardingBlocker(state) {
  const step = detectOnboardingStep(state);
  if (step === "choose_order") {
    const offered = (state.orders || []).filter(o => o.status === "offered" && o.acceptDeadlineMin > state.gameTime);
    if (offered.length === 0) {
      return { step, blocked: true, reason: "Keine offenen Angebote verfügbar. Neue Aufträge erscheinen regelmäßig auf dem Markt.", alternative: "Nutze unten „+1 Std“ oder starte die Live-Simulation, um neue Angebote abzuwarten." };
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
      return { step, blocked: true, reason: "Kein freier Lkw verfügbar. Warte bis eine Tour endet oder kaufe einen weiteren Lkw.", alternative: "Prüfe in der Disposition, wann deine Fahrzeuge wieder verfügbar sind." };
    }
    if (freeDrivers.length === 0) {
      return { step, blocked: true, reason: "Kein freier Fahrer verfügbar. Warte bis ein Fahrer sich erholt hat oder stelle einen neuen Fahrer ein.", alternative: "Prüfe im Personalbereich Ruhezeiten, Abwesenheiten und Einsatzplanung." };
    }
  }
  return { step, blocked: false, reason: null, alternative: null };
}

export const DEVELOPMENT_MILESTONES = [
  { id: "dm_first_deliveries", label: "Erste Lieferungen",
    check: (s) => (s.stats?.totalDeliveries || 0) >= 1,
    progress: (s) => ({ current: Math.min(s.stats?.totalDeliveries || 0, 1), target: 1 }) },
  { id: "dm_reliable_ops", label: "Verlässlicher Betrieb",
    check: (s) => (s.stats?.totalDeliveries || 0) >= 20 || (s.stats?.consecutiveTimely || 0) >= 10,
    progress: (s) => ({ current: Math.min(s.stats?.totalDeliveries || 0, 20), target: 20 }) },
  { id: "dm_autonomous_team", label: "Eigenständiges Team",
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