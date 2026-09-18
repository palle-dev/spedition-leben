// Tagesübersicht-Daten für FERNWERK.
// Berechnet die zentralen Aussagen für die Büro-Startseite aus
// vorhandenen Spieldaten — keine zweite unabhängige Aufgabenverwaltung.
// Alle Aussagen werden aus realen Zustandsfeldern abgeleitet.

import { formatGameTime, dayOf, clockOf, formatEuro } from "./gameData";
import { getOpenItems } from "./accountingData";
import { computeCreditLimit } from "./financingData";
import { vehicleDisplayName } from "./displayHelpers";
import { getGoalProgress } from "./progressEngine";
import { GOAL_TEMPLATES } from "./achievementCatalog";
import { CONTRACT_DURATION_DAYS } from "./simulation/customerEngine";
import { getScenarioProgress } from "./scenarios/scenarioEngine";

const DAY_MIN = 1440;
const HOUR_MIN = 60;

// ---------- Hilfsfunktionen ----------
function todayStart(state) { return Math.floor(state.gameTime / DAY_MIN) * DAY_MIN; }
function tomorrowStart(state) { return todayStart(state) + DAY_MIN; }
function isToday(state, min) { return min >= todayStart(state) && min < tomorrowStart(state); }
function isTomorrow(state, min) { return min >= tomorrowStart(state) && min < tomorrowStart(state) + DAY_MIN; }

function findPerson(state, id) {
  return (state.drivers || []).find(d => d.id === id) ||
    (state.employees || []).find(e => e.id === id);
}

// ---------- 1. Was braucht jetzt meine Entscheidung? ----------
// Vereinheitlichte Aufgabenliste mit Deduplizierung.
// Quellen: Freigaben, Einladungen, unzugewiesene Aufträge, offene Kosten,
// Urlaubsanträge, Kündigungen, Vertragsangebote, Szenario-Verpflichtungen.
export function getUnifiedTasks(state) {
  const now = state.gameTime;
  const tasks = [];
  const seenKeys = new Set();

  function addTask(t) {
    // Deduplizierung: gleicher Vorgang darf nicht zweimal erscheinen.
    if (seenKeys.has(t.dedupKey)) return;
    seenKeys.add(t.dedupKey);
    tasks.push(t);
  }

  // --- Freigaben (Delegation) ---
  for (const req of (state.approvals?.pending || [])) {
    if (req.status !== "pending") continue;
    const overdue = req.deadlineMin && req.deadlineMin < now;
    addTask({
      dedupKey: "approval:" + req.id,
      category: "approval",
      priority: overdue ? 95 : 80,
      title: req.title || "Freigabe erforderlich",
      source: "Mitarbeiterbefugnisse",
      person: req.employeeName || null,
      branch: req.branchName || null,
      deadlineMin: req.deadlineMin || null,
      deadlineLabel: req.deadlineMin ? formatGameTime(req.deadlineMin) : "Offen",
      overdue,
      consequence: overdue ? "Mitarbeiter kann nicht weiterarbeiten" : "Aktion wird verzögert",
      action: { label: "Freigeben", to: "/geschaeftsmodelle", command: "approveApproval", params: { requestId: req.id } },
      costCents: req.costCents || 0,
    });
  }

  // --- Einladungen / persönliche Entscheidungen ---
  for (const a of (state.appointments || [])) {
    if (a.status !== "pending" || a.appearMin > now) continue;
    if (a.decisionDeadline < now) continue;
    addTask({
      dedupKey: "invite:" + a.id,
      category: "personal",
      priority: 75,
      title: "Einladung wartet auf Antwort",
      source: "Privatleben",
      person: state.private?.partnerName || "Partner/in",
      branch: null,
      deadlineMin: a.decisionDeadline,
      deadlineLabel: "Bis " + clockOf(a.decisionDeadline) + " Uhr",
      overdue: false,
      consequence: "Beziehung leidet bei Nichtantwort",
      action: { label: "Antworten", to: "/zuhause" },
    });
  }

  // --- Unzugewiesene angenommene Aufträge ---
  const activeTripOrderIds = new Set();
  for (const t of (state.trips || [])) { if (t.status === "in_progress" && t.orderId) activeTripOrderIds.add(t.orderId); }
  const activeTourOrderIds = new Set();
  for (const t of (state.tours || [])) {
    if (t.status !== "active") continue;
    for (const d of (t.deployments || [])) { if (d.orderId && d.status !== "cancelled") activeTourOrderIds.add(d.orderId); }
  }
  for (const o of (state.orders || [])) {
    if (o.status !== "angenommen") continue;
    if (activeTripOrderIds.has(o.id) || activeTourOrderIds.has(o.id)) continue;
    const hoursLeft = Math.floor((o.deliveryDeadlineMin - now) / HOUR_MIN);
    const overdue = hoursLeft < 0;
    addTask({
      dedupKey: "unassigned:" + o.id,
      category: "dispatch",
      priority: overdue ? 85 : hoursLeft < 12 ? 70 : 50,
      title: "Auftrag nicht disponiert",
      source: "Disposition",
      person: o.customer,
      branch: null,
      deadlineMin: o.deliveryDeadlineMin,
      deadlineLabel: overdue ? "Überfällig" : `Noch ${Math.max(0, hoursLeft)} Std`,
      overdue,
      consequence: "Lieferfrist läuft — Auftrag scheitert bei Überschreitung",
      action: { label: "Disponieren", to: "/disposition" },
    });
  }

  // --- Offene betriebliche Kosten ---
  const openCompanyCosts = (state.openCosts || []).filter(o => o.account === "company" && o.amountCents > 0);
  if (openCompanyCosts.length > 0) {
    const total = openCompanyCosts.reduce((s, o) => s + o.amountCents, 0);
    addTask({
      dedupKey: "open_costs",
      category: "finance",
      priority: 90,
      title: "Offene betriebliche Kosten",
      source: "Finanzen",
      person: null,
      branch: null,
      deadlineMin: null,
      deadlineLabel: "Sobald möglich",
      overdue: false,
      consequence: "Blockiert Fahrzeugkauf und Wartung",
      action: { label: "Bezahlen", to: "/finanzen" },
      costCents: total,
    });
  }

  // --- Offene Posten (Lieferantenverbindlichkeiten) ---
  const openItems = getOpenItems(state);
  if (openItems.length > 0) {
    const total = openItems.reduce((s, o) => s + o.remainingCents, 0);
    addTask({
      dedupKey: "open_items",
      category: "finance",
      priority: 82,
      title: "Offene Posten fällig",
      source: "Finanzen",
      person: null,
      branch: null,
      deadlineMin: null,
      deadlineLabel: "Fällig",
      overdue: false,
      consequence: "Lieferantenverbindlichkeiten belasten die Liquidität",
      action: { label: "Bezahlen", to: "/finanzen" },
      costCents: total,
    });
  }

  // --- Urlaubsanträge ---
  for (const r of (state.absences?.vacationRequests || [])) {
    if (r.status !== "pending") continue;
    const person = findPerson(state, r.personId);
    addTask({
      dedupKey: "vacation:" + r.id,
      category: "personnel",
      priority: 40,
      title: "Urlaubsantrag offen",
      source: "Personal",
      person: person?.name || r.personId,
      branch: null,
      deadlineMin: r.startMin,
      deadlineLabel: formatGameTime(r.startMin),
      overdue: r.startMin < now,
      consequence: "Mitarbeiter wartet auf Antwort",
      action: { label: "Prüfen", to: "/personal" },
    });
  }

  // --- Kündigungsankündigungen ---
  for (const e of (state.employees || [])) {
    if (e.employmentStatus !== "notice_given" && !e.exitDate) continue;
    addTask({
      dedupKey: "notice:" + e.id,
      category: "personnel",
      priority: 55,
      title: "Austritt angekündigt",
      source: "Personal",
      person: e.name,
      branch: null,
      deadlineMin: e.exitDate || null,
      deadlineLabel: e.exitDate ? formatGameTime(e.exitDate) : "Bekannt geben",
      overdue: false,
      consequence: "Vertretung oder Nachfolge nötig",
      action: { label: "Personal", to: "/personal" },
    });
  }
  for (const d of (state.drivers || [])) {
    if (d.employmentStatus !== "notice_given" && !d.exitDate) continue;
    addTask({
      dedupKey: "notice_driver:" + d.id,
      category: "personnel",
      priority: 55,
      title: "Fahreraustritt angekündigt",
      source: "Personal",
      person: d.name,
      branch: null,
      deadlineMin: d.exitDate || null,
      deadlineLabel: d.exitDate ? formatGameTime(d.exitDate) : "Bekannt geben",
      overdue: false,
      consequence: "Vertretung oder Einstellung prüfen",
      action: { label: "Personal", to: "/personal" },
    });
  }

  // --- Kritische Fahrzeugzustände ---
  for (const v of (state.vehicles || [])) {
    if (v.status !== "free" || v.condition >= 30) continue;
    if (v.status === "archived" || v.status === "sold") continue;
    addTask({
      dedupKey: "critical_vehicle:" + v.id,
      category: "fleet",
      priority: 65,
      title: "Fahrzeugzustand kritisch",
      source: "Fuhrpark",
      person: vehicleDisplayName(v),
      branch: null,
      deadlineMin: null,
      deadlineLabel: "Bald",
      overdue: false,
      consequence: "Einsatzfähigkeit gefährdet",
      action: { label: "Wartung", to: "/fuhrpark" },
    });
  }

  // --- Szenario-Verpflichtungen (nur bei aktivem Szenario) ---
  if (state.scenario?.status === "active") {
    const progress = getScenarioProgress(state);
    if (progress) {
      for (const ob of progress.obligations) {
        if (ob.atMin == null || ob.atMin < now) continue;
        addTask({
          dedupKey: "scenario_obligation:" + (ob.label + ob.atMin),
          category: "scenario",
          priority: 60,
          title: ob.label,
          source: "Szenario",
          person: null,
          branch: null,
          deadlineMin: ob.atMin,
          deadlineLabel: formatGameTime(ob.atMin),
          overdue: false,
          consequence: "Szenarioziel gefährdet",
          action: { label: "Ansehen", to: "/" },
          costCents: ob.amountCents || 0,
        });
      }
    }
  }

  tasks.sort((a, b) => b.priority - a.priority);
  return tasks;
}

// ---------- 2. Welche Verpflichtungen stehen heute an? ----------
export function getTodayObligations(state) {
  const now = state.gameTime;
  const obligations = [];

  // Kreditraten
  for (const loan of (state.loans || [])) {
    if (loan.status !== "active") continue;
    if (loan.nextDueMin && isToday(state, loan.nextDueMin)) {
      const installment = loan.schedule?.[loan.paidInstallments];
      obligations.push({
        type: "Kreditrate",
        label: "Kreditrate " + loan.id,
        atMin: loan.nextDueMin,
        amountCents: installment ? installment.totalCents : 0,
      });
    }
  }

  // Leasingraten
  for (const c of (state.leasingContracts || [])) {
    if (c.status !== "active") continue;
    if (c.nextRateDueMin && isToday(state, c.nextRateDueMin)) {
      obligations.push({
        type: "Leasingrate",
        label: "Leasingrate " + c.id,
        atMin: c.nextRateDueMin,
        amountCents: c.monthlyRateCents || 0,
      });
    }
  }

  // Verträge mit Lieferungen heute
  for (const c of (state.contracts?.contracts || [])) {
    if (c.status !== "active") continue;
    const currentDay = Math.floor(now / DAY_MIN) + 1;
    if (currentDay >= c.startDay && currentDay <= c.endDay) {
      obligations.push({
        type: "Rahmenvertrag",
        label: c.customerName + " · " + c.transportsPerDay + " Transporte",
        atMin: null,
        amountCents: 0,
        detail: c.fromCity + " → " + c.toCity,
      });
    }
  }

  // Private Termine heute
  for (const a of (state.appointments || [])) {
    if (!["accepted", "active"].includes(a.status)) continue;
    if (isToday(state, a.startMin)) {
      obligations.push({
        type: "Privater Termin",
        label: a.text || "Termin",
        atMin: a.startMin,
        amountCents: 0,
      });
    }
  }

  return obligations;
}

// ---------- 3. Was erledigen meine Mitarbeiter selbstständig? ----------
export function getAutonomousActions(state) {
  const now = state.gameTime;
  const actions = [];

  // Disponenten im autonomen Modus
  for (const e of (state.employees || [])) {
    if (e.employmentStatus !== "employed") continue;
    if (e.role !== "dispatcher" && e.role !== "dispatcher_senior") continue;
    if (e.workMode !== "autonomous") continue;
    if (e.attendance !== "present") continue;
    actions.push({
      type: "Disposition",
      person: e.name,
      detail: "Nimmt Aufträge an und disponiert Touren selbstständig",
      active: true,
    });
  }

  // Assistenten der Geschäftsführung
  for (const e of (state.employees || [])) {
    if (e.employmentStatus !== "employed") continue;
    if (e.role !== "assistant") continue;
    if (e.attendance !== "present") continue;
    actions.push({
      type: "Assistenz",
      person: e.name,
      detail: "Unterstützt bei Auftragsannahme und Disposition",
      active: true,
    });
  }

  // Filialleiter im autonomen Modus
  for (const e of (state.employees || [])) {
    if (e.employmentStatus !== "employed") continue;
    if (e.role !== "branch_manager") continue;
    if (e.managementMode !== "autonomous") continue;
    actions.push({
      type: "Filialleitung",
      person: e.name,
      detail: "Entscheidet selbstständig über Filialgeschäfte",
      active: true,
    });
  }

  // Aktive Touren (Fahrer erledigen Lieferungen)
  const activeTrips = (state.trips || []).filter(t => t.status === "in_progress");
  if (activeTrips.length > 0) {
    actions.push({
      type: "Aktive Touren",
      person: activeTrips.length + " Fahrer",
      detail: activeTrips.length + " Tour(n) unterwegs — Lieferungen laufen automatisch",
      active: true,
    });
  }

  return actions;
}

// ---------- 4. Wie steht es um verfügbare Mittel und Kapazität? ----------
export function getCapacitySummary(state) {
  const bankBalance = state.company?.accountCents || 0;
  const openCompanyCosts = (state.openCosts || [])
    .filter(o => o.account === "company")
    .reduce((s, o) => s + o.amountCents, 0);
  const openItems = getOpenItems(state);
  const dueLiabilities = openItems.reduce((s, o) => s + o.remainingCents, 0);
  const credit = computeCreditLimit(state);

  const vehicles = (state.vehicles || []).filter(v => v.status !== "archived" && v.status !== "sold");
  const freeVehicles = vehicles.filter(v => v.status === "free").length;
  const onTripVehicles = vehicles.filter(v => v.status === "on_trip").length;
  const maintenanceVehicles = vehicles.filter(v => v.status === "maintenance").length;

  const drivers = (state.drivers || []).filter(d => d.employmentStatus === "employed");
  const freeDrivers = drivers.filter(d => d.status === "free").length;

  return {
    liquidity: {
      bankBalance,
      openCompanyCosts,
      dueLiabilities,
      availableCredit: credit.available,
      netAvailable: bankBalance - openCompanyCosts - dueLiabilities,
    },
    fleet: {
      total: vehicles.length,
      free: freeVehicles,
      onTrip: onTripVehicles,
      maintenance: maintenanceVehicles,
    },
    personnel: {
      totalDrivers: drivers.length,
      freeDrivers,
    },
  };
}

// ---------- 5. Welche persönlichen Termine habe ich? ----------
export function getPersonalAppointments(state) {
  const now = state.gameTime;
  const appointments = [];

  for (const a of (state.appointments || [])) {
    if (!["pending", "accepted", "active"].includes(a.status)) continue;
    if (a.endMin <= now) continue;
    appointments.push({
      id: a.id,
      type: a.type,
      text: a.text || "Termin",
      startMin: a.startMin,
      endMin: a.endMin,
      status: a.status,
      isToday: isToday(state, a.startMin),
      isTomorrow: isTomorrow(state, a.startMin),
      label: a.type === "invitation" ? "Einladung" :
             a.type === "leisure" ? "Freizeit" :
             a.type === "conversation" ? "Gespräch" :
             a.type === "scenario_timeoff" ? "Private Auszeit" : "Termin",
    });
  }

  appointments.sort((a, b) => a.startMin - b.startMin);
  return appointments;
}

// ---------- 6. Welches meiner Ziele ist als Nächstes sinnvoll erreichbar? ----------
export function getNextReachableGoal(state) {
  const goals = state.goals || [];
  if (goals.length === 0) return null;

  let bestGoal = null;
  let bestPct = -1;

  for (const g of goals) {
    const tpl = GOAL_TEMPLATES.find(t => t.id === g.templateId);
    if (!tpl) continue;
    const prog = getGoalProgress(state, g);
    if (prog.completed) continue;
    const pct = prog.target > 0 ? (prog.current / prog.target) * 100 : 0;
    // Bevorzuge Ziele, die nah an der Erfüllung sind (>50%)
    if (pct > bestPct) {
      bestPct = pct;
      bestGoal = { goal: g, template: tpl, progress: prog, pct: Math.round(pct) };
    }
  }

  return bestGoal;
}

// ---------- Zusammenfassende Tagesaussagen ----------
// Erzeugt klare, natürliche Aussagen aus Spieldaten.
export function getDailyStatements(state) {
  const tasks = getUnifiedTasks(state);
  const obligations = getTodayObligations(state);
  const autonomous = getAutonomousActions(state);
  const capacity = getCapacitySummary(state);
  const appointments = getPersonalAppointments(state);
  const nextGoal = getNextReachableGoal(state);

  const statements = [];

  // Entscheidungen
  const pendingApprovals = tasks.filter(t => t.category === "approval");
  if (pendingApprovals.length > 0) {
    statements.push({
      icon: "alert",
      text: `${pendingApprovals.length} Freigabe${pendingApprovals.length > 1 ? "n warten" : " wartet"} auf dich.`,
      priority: "high",
      link: "/geschaeftsmodelle",
    });
  }

  const unassigned = tasks.filter(t => t.category === "dispatch");
  if (unassigned.length > 0) {
    const overdue = unassigned.filter(t => t.overdue).length;
    statements.push({
      icon: "truck",
      text: overdue > 0
        ? `${overdue} ${overdue > 1 ? "angenommene Aufträge sind" : "angenommener Auftrag ist"} überfällig.`
        : `${unassigned.length} ${unassigned.length > 1 ? "angenommene Aufträge" : "angenommener Auftrag"} ${unassigned.length > 1 ? "werden" : "wird"} heute fällig.`,
      priority: "high",
      link: "/disposition",
    });
  }

  // Verpflichtungen heute
  const todayObligations = obligations.filter(o => o.atMin != null);
  if (todayObligations.length > 0) {
    const first = todayObligations[0];
    statements.push({
      icon: "calendar",
      text: `Heute steht an: ${first.label}${first.amountCents ? " (" + formatEuro(first.amountCents) + ")" : ""}.`,
      priority: "medium",
      link: "/finanzen",
    });
  }

  // Wartung morgen
  const tomorrowMaint = (state.vehicles || []).filter(v =>
    v.status === "maintenance" && v.maintenanceUntil && isTomorrow(state, v.maintenanceUntil)
  );
  if (tomorrowMaint.length > 0) {
    statements.push({
      icon: "wrench",
      text: `Ein Fahrzeug steht morgen zur Wartung an.`,
      priority: "low",
      link: "/fuhrpark",
    });
  }

  // Persönliche Termine
  const todayAppts = appointments.filter(a => a.isToday);
  if (todayAppts.length > 0) {
    const first = todayAppts[0];
    statements.push({
      icon: "heart",
      text: first.status === "pending"
        ? `Heute Abend ist eine Einladung offen — Antwort bis ${clockOf(first.startMin)} Uhr.`
        : `Heute Abend ist ein gemeinsamer Termin zugesagt.`,
      priority: "medium",
      link: "/zuhause",
    });
  }

  // Mitarbeiter-Autonomie
  if (autonomous.length > 0) {
    const dispatchers = autonomous.filter(a => a.type === "Disposition");
    if (dispatchers.length > 0) {
      statements.push({
        icon: "users",
        text: `${dispatchers.length} Disponent${dispatchers.length > 1 ? "en" : ""} erledigt${dispatchers.length > 1 ? "en" : ""} Auftragsannahme und Disposition selbstständig.`,
        priority: "low",
        link: "/personal",
      });
    }
  }

  // Nächstes Ziel
  if (nextGoal && nextGoal.pct >= 50) {
    statements.push({
      icon: "target",
      text: `Ziel „${nextGoal.template.title}" ist zu ${nextGoal.pct}% erreicht — kurz vor der Erfüllung.`,
      priority: "low",
      link: nextGoal.progress.linkPath || "/erfolge",
    });
  }

  return statements;
}