// Simulations-Engine für "Spedition & Leben".
// Reine Spielregeln und Zustandsänderungen – keine Auth, keine Speicherung.
// Trennung: gameRules (statische Daten) · simulationEngine (Regeln/Zustand) · gameRepository (Speicherung via Backend-Funktion).

import {
  CITIES, getDistance, mulberry32, INVITATION_TEMPLATES, DRIVER_APPLICANT_POOL,
  CARGO_TYPES, CUSTOMER_NAMES, STANDARD_TRUCK,
  dayOf, clockOf, formatGameTime, driveMinutes, fuelCents, tollCents,
  LOAD_MIN, UNLOAD_MIN, MAX_DUTY_MIN, REST_MIN,
  DRIVER_COST_PER_DAY, BRANCH_COST_PER_DAY, PRIVATE_WITHDRAWAL_PER_DAY, PRIVATE_LIVING_PER_DAY,
  VEHICLE_PRICE, HIRE_FEE, MAINTENANCE_COST, MAINTENANCE_DURATION,
  INVITATION_COST, STRESS_MAINT_THRESHOLD, MAINT_STRESS_FACTOR,
  PERSONNEL_ROLES, SERVICE_START_MIN, SERVICE_END_MIN, SERVICE_INTERVAL_MIN,
  APPLICANT_NAMES, PORTRAIT_IDS
} from "./gameRules.ts";
import {
  buildTourPlan, confirmTour as doConfirmTour, cancelTour as doCancelTour,
  processTours, onTripCompleted, findReturnLoads, suggestTours
} from "./tourEngine.ts";
import { checkAchievements, migrateState } from "./progressEngine.ts";
import { ACHIEVEMENTS, GOAL_TEMPLATES } from "./achievementCatalog.ts";
import {
  initAccounting, book, bookExpense, postJournal, TEMPLATES, createReceipt,
  addOpenItem, settleOpenItem, registerAsset, disposeAsset,
  calculateDepreciation, processMonthEnd, processAccountant,
  roleExpenseAccount, periodOf, periodStartMin, periodEndMin, MONTH_MIN,
  migrateAccounting,
} from "./accountingEngine.ts";
import {
  initMail, migrateMail, deliverMessage, getPersonInfo, getAllContacts,
  findOrCreateConversation, markMessageRead, markConversationRead,
  starMessage, archiveMessage, saveDraft, deleteDraft,
  getMailboxStats, searchConversations, getConversationMessages,
  exportCorrespondence, createStaffTask, isEmployeeAvailable,
} from "./mailEngine.ts";
import { detectIntent, processStaffTasks, getQuickReplies, getIntentByType } from "./mailIntents.ts";
import {
  processReportSchedules, generateDriverDeliveryReport,
  generateEmployeeIntroduction, onOrderAccepted, onTourConfirmed,
  onEmployeeHired, onMaintenanceCompleted, resetDailyStats,
} from "./mailReports.ts";

// ---------- Hilfsfunktionen ----------
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function uid(state, prefix) { state.idCounter = (state.idCounter || 100) + 1; return prefix + "_" + state.idCounter; }
function nextRng(state) {
  const r = mulberry32(state.rngSeed >>> 0);
  const v = r();
  state.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}
// Ursachen-Zuordnung zu Buchungskonten für die Legacy-Schnittstelle.
const CAUSE_ACCOUNT_MAP = {
  "Kraftstoff": "5000", "Maut": "5010", "Vergütung": "4000",
  "Fahrerlohn": "5100", "Standort": "5200", "Lohn": "5120",
  "Private Entnahme": "2010", "Stornogebühr": "5700",
  "Fahrzeugkauf": "1200", "Einstellung": "5140", "Wartung": "5300",
  "Kraftstoff (Leerfahrt)": "5000", "Maut (Leerfahrt)": "5010",
  "Offene Kosten bezahlt": "2120",
  "Disposition": "5110", "Reinigung und Werkstatt": "5130", "Buchhaltung": "5120",
};

function addBooking(state, min, cause, amountCents, account, refId) {
  // Legacy-Array für Kompatibilität beibehalten
  state.bookings.push({ min, cause, amountCents, account, refId });
  if (account === "private") {
    state.private.accountCents += amountCents;
    return;
  }
  // Firmenbuchung: doppelte Buchführung über Journal
  const isPositive = amountCents >= 0;
  const abs = Math.abs(amountCents);
  const causeKey = cause.split(":")[0].trim();
  const matchAcct = CAUSE_ACCOUNT_MAP[causeKey] || (isPositive ? "4000" : "5700");
  if (matchAcct === "2010") {
    postJournal(state, { text: cause, type: "withdrawal", gameTime: min,
      lines: [{ account: "2010", debit: abs }, { account: "1000", credit: abs }] });
  } else if (matchAcct === "1200") {
    postJournal(state, { text: cause, type: "vehicle_purchase", gameTime: min,
      lines: [{ account: "1200", debit: abs }, { account: "1000", credit: abs }] });
  } else if (isPositive) {
    postJournal(state, { text: cause, type: "revenue", gameTime: min,
      lines: [{ account: "1000", debit: abs }, { account: matchAcct, credit: abs }] });
  } else {
    postJournal(state, { text: cause, type: "expense", gameTime: min,
      lines: [{ account: matchAcct, debit: abs }, { account: "1000", credit: abs }] });
  }
}
function isPlayerBlocked(state) {
  return state.appointments.some(a => a.status === "active");
}
function nextBlockEnd(state) {
  let end = null;
  for (const a of state.appointments) {
    if (a.status === "active" && (end === null || a.endMin < end)) end = a.endMin;
  }
  return end;
}
function ensureNotBlocked(state) {
  if (isPlayerBlocked(state)) {
    throw new Error("Du bist derzeit mit einer privaten Aktivität beschäftigt. Operative Aktionen sind bis " + formatGameTime(nextBlockEnd(state)) + " gesperrt.");
  }
}
function checkMilestones(state, min) {
  const set = (id, cond) => {
    const m = state.milestones.find(x => x.id === id);
    if (m && !m.achieved && cond) { m.achieved = true; m.achievedAtMin = min; }
  };
  set("m1", state.stats.totalDeliveries >= 1);
  set("m2", state.stats.timelyDeliveries >= 10);
  set("m3", state.vehicles.length >= 4);
}

// ---------- Initialzustand ----------
function initialOffers(state) {
  const mk = (customer, fromCity, toCity, cargo, tons, paymentEur, acceptMin, deliveryMin) => ({
    id: uid(state, "o"), customer, fromCity, toCity, cargo, tons,
    paymentCents: paymentEur * 100, acceptDeadlineMin: acceptMin, deliveryDeadlineMin: deliveryMin,
    status: "offered", acceptedAtMin: null, startedAtMin: null, deliveredAtMin: null, paidCents: null
  });
  return [
    mk("Hanse Handelskontor", "Hamburg", "Bremen", "Stückgut", 8, 650, 600, 1080),       // Tutorial
    mk("Norddeutsche Feinkost", "Hamburg", "Hannover", "Lebensmittel", 10, 900, 720, 1320),
    mk("Ostsee Frischlief", "Hamburg", "Kiel", "Getränke", 6, 450, 660, 960),
    mk("Weser Handel", "Bremen", "Hamburg", "Möbel", 10, 700, 840, 2160),                 // Rückladung
    mk("Hauptstadt-Express", "Hamburg", "Berlin", "Elektronik", 12, 1800, 960, 2520),
    mk("Ostsee-Vertrieb", "Rostock", "Hamburg", "Textilien", 8, 1200, 1080, 2640),
    mk("Elbe-Logistik", "Hamburg", "Magdeburg", "Bauteile", 9, 1100, 900, 1920),
    mk("Schleswig-Spedition", "Lübeck", "Hamburg", "Verpackungsmaterial", 7, 600, 780, 1920)
  ];
}

export function createInitialState(names) {
  const p = names || {};
  const state = {
    gameTime: 480, // Tag 1, 08:00
    rngSeed: 1234567,
    idCounter: 100,
    company: { name: p.companyName || "Nordlicht Transport GmbH", accountCents: 7500000 },
    private: {
      playerName: p.playerName || "Spieler",
      partnerName: p.partnerName || "Mara",
      accountCents: 750000,
      stress: 30, happiness: 60, relationship: 60,
      residence: "Wohnung in Hamburg"
    },
    branches: [{ id: "b1", name: "Hauptniederlassung Hamburg", city: "Hamburg", costPerDayCents: BRANCH_COST_PER_DAY }],
    vehicles: [1, 2, 3].map(i => ({
      id: "v" + i, branchId: "b1", type: STANDARD_TRUCK.type, capacityTons: 12,
      consumptionPer100km: 28, bookValueCents: STANDARD_TRUCK.bookValueCents,
      condition: 85, locationCity: "Hamburg", status: "free", tripId: null, maintenanceUntil: null
    })),
    drivers: [
      { id: "d1", name: "Klaus Werner", branchId: "b1", costPerDayCents: DRIVER_COST_PER_DAY, locationCity: "Hamburg", status: "free", restUntil: null, employedDay: 1 },
      { id: "d2", name: "Petra Süß", branchId: "b1", costPerDayCents: DRIVER_COST_PER_DAY, locationCity: "Hamburg", status: "free", restUntil: null, employedDay: 1 },
      { id: "d3", name: "Helmut Fuchs", branchId: "b1", costPerDayCents: DRIVER_COST_PER_DAY, locationCity: "Hamburg", status: "free", restUntil: null, employedDay: 1 }
    ],
    orders: [],
    trips: [],
    tours: [],
    appointments: [],
    bookings: [],
    openCosts: [],
    milestones: [
      { id: "m1", name: "Erste Lieferung", achieved: false, achievedAtMin: null },
      { id: "m2", name: "Zehn rechtzeitige Lieferungen", achieved: false, achievedAtMin: null },
      { id: "m3", name: "Vier eigene Lkw", achieved: false, achievedAtMin: null }
    ],
    achievements: ACHIEVEMENTS.map(a => ({ id: a.id, unlocked: false, unlockedAtMin: null, seen: false })),
    xp: 0,
    goals: [],
    processedActions: {},
    tutorial: { active: true, step: 0 },
    lastDailyAccountingMin: 0,
    stats: {
      timelyDeliveries: 0, totalDeliveries: 0, consecutiveTimely: 0, cancelledOrders: 0,
      totalRevenueCents: 0, maintainedVehicleIds: [], leisureCount: 0, leisureTypes: [],
      promisesKept: 0, consecutiveBalanceDays: 0, lastBalanceDay: 0,
      hobbyCounts: {}, friendshipQualities: {}, ownershipCount: 0,
      homeFurnishingTypes: [], hasHome: false, hasCar: false,
      hasSportCar: false, hasBoat: false, hasVilla: false, tripsCompleted: 0,
    },
    employees: [],
    availableApplicants: makeInitialApplicants(),
    hiredApplicantNames: [],
    portraitAssignments: {},
    leisureUsedDay: 0,
    tutorialInviteCreated: false,
    lastInvitationTemplateId: null
  };
  // Porträts für bestehende Fahrer zuordnen
  let pIdx = 0;
  for (const d of state.drivers) {
    d.portraitId = PORTRAIT_IDS[pIdx++] || PORTRAIT_IDS[0];
    d.satisfaction = 70;
    d.satisfactionReasons = [];
    d.employmentStatus = "employed";
    d.attendance = "present";
    d.consecutiveLowSatisfactionDays = 0;
  }
  state.orders = initialOffers(state);
  // Buchhaltung initialisieren und Eröffnungsbuchung erstellen
  initAccounting(state);
  const _assetCents = state.vehicles.reduce((s, v) => s + v.bookValueCents, 0);
  book(state, "opening", {
    bankCents: state.company.accountCents,
    assetCents: _assetCents,
    liabilityCents: 0,
  });
  for (const v of state.vehicles) {
    registerAsset(state, {
      vehicleId: v.id, account: "1200",
      name: "Lkw " + String(parseInt(String(v.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0"),
      acquisitionCostCents: v.bookValueCents, acquiredAtMin: state.gameTime,
    });
  }
  // Postfach initialisieren
  initMail(state);
  return { state };
}

// Erzeugt Bewerber für alle Rollen ab Spielbeginn.
// Mindestens zwei Disponenten (180 € und 260 € Variante).
function makeInitialApplicants() {
  const apps = [];
  let idNum = 1;
  // Fahrer-Bewerber (bestehende 3) – Porträts passend zum Geschlecht
  apps.push({ id: "a" + (idNum++), name: "Greta Möller", role: "driver",
    hireFeeCents: PERSONNEL_ROLES.driver.hireFeeCents, costPerDayCents: DRIVER_COST_PER_DAY,
    capacity: 0, portraitId: "p09" });
  apps.push({ id: "a" + (idNum++), name: "Tobias Brandt", role: "driver",
    hireFeeCents: PERSONNEL_ROLES.driver.hireFeeCents, costPerDayCents: DRIVER_COST_PER_DAY,
    capacity: 0, portraitId: "p06" });
  apps.push({ id: "a" + (idNum++), name: "Stefan Kloth", role: "driver",
    hireFeeCents: PERSONNEL_ROLES.driver.hireFeeCents, costPerDayCents: DRIVER_COST_PER_DAY,
    capacity: 0, portraitId: "p10" });
  // Disponent (180 €/Tag, Kapazität 6)
  apps.push({ id: "a" + (idNum++), name: "Helena Voss", role: "dispatcher",
    hireFeeCents: PERSONNEL_ROLES.dispatcher.hireFeeCents, costPerDayCents: PERSONNEL_ROLES.dispatcher.costPerDayCents,
    capacity: 6, portraitId: "p04" });
  // Erfahrener Disponent (260 €/Tag, Kapazität 12)
  apps.push({ id: "a" + (idNum++), name: "Rüdiger Mai", role: "dispatcher_senior",
    hireFeeCents: PERSONNEL_ROLES.dispatcher_senior.hireFeeCents, costPerDayCents: PERSONNEL_ROLES.dispatcher_senior.costPerDayCents,
    capacity: 12, portraitId: "p05" });
  // Reinigungskraft
  apps.push({ id: "a" + (idNum++), name: "Tanja Hennig", role: "cleaner",
    hireFeeCents: PERSONNEL_ROLES.cleaner.hireFeeCents, costPerDayCents: PERSONNEL_ROLES.cleaner.costPerDayCents,
    capacity: 4, portraitId: "p07" });
  // Werkstattmitarbeiter
  apps.push({ id: "a" + (idNum++), name: "Manfred Brod", role: "mechanic",
    hireFeeCents: PERSONNEL_ROLES.mechanic.hireFeeCents, costPerDayCents: PERSONNEL_ROLES.mechanic.costPerDayCents,
    capacity: 1, portraitId: "p08" });
  // Buchhalter
  apps.push({ id: "a" + (idNum++), name: "Veit Karger", role: "accountant",
    hireFeeCents: PERSONNEL_ROLES.accountant.hireFeeCents, costPerDayCents: PERSONNEL_ROLES.accountant.costPerDayCents,
    capacity: 40, portraitId: "p12" });
  // Erfahrene Buchhaltungskraft
  apps.push({ id: "a" + (idNum++), name: "Christine Aal", role: "accountant_senior",
    hireFeeCents: PERSONNEL_ROLES.accountant_senior.hireFeeCents, costPerDayCents: PERSONNEL_ROLES.accountant_senior.costPerDayCents,
    capacity: 80, portraitId: "p11" });
  return apps;
}

// ---------- Tagesabrechnung ----------
function payCost(state, account, amountCents, cause, refId, min) {
  if (account === "private") {
    const bal = state.private.accountCents;
    const paid = Math.min(bal, amountCents);
    const unpaid = amountCents - paid;
    if (paid > 0) { state.private.accountCents -= paid; state.bookings.push({ min, cause, amountCents: -paid, account, refId }); }
    if (unpaid > 0) state.openCosts.push({ id: uid(state, "oc"), account, cause, amountCents: unpaid, refId, createdAtMin: min });
    return { paid, unpaid };
  }
  // Firmenkosten: doppelte Buchführung mit teilweiser Zahlung
  const causeKey = cause.split(":")[0].trim();
  const expenseAcct = CAUSE_ACCOUNT_MAP[causeKey] || "5700";
  const r = bookExpense(state, {
    expenseAccount: expenseAcct, liabilityAccount: "2120",
    amountCents, text: cause, type: causeKey.toLowerCase().replace(/\s/g, "_"),
    gameTime: min, refId,
  });
  return { paid: r.paidCents, unpaid: r.unpaidCents };
}
function doWithdrawal(state, min) {
  const hasCompanyLiabilities = (state.accounting?.openItems || []).some(o => o.remainingCents > 0) || (state.openCosts || []).some(o => o.account === "company" && o.amountCents > 0);
  if (hasCompanyLiabilities) return { done: false, reason: "offene betriebliche Kosten" };
  if (state.company.accountCents < PRIVATE_WITHDRAWAL_PER_DAY) return { done: false, reason: "Firma kann Entnahme nach Tageskosten nicht bezahlen" };
  addBooking(state, min, "Private Entnahme", -PRIVATE_WITHDRAWAL_PER_DAY, "company", "withdrawal");
  state.private.accountCents += PRIVATE_WITHDRAWAL_PER_DAY;
  return { done: true };
}
function makeOffer(state, midnight) {
  let from = CITIES[Math.floor(nextRng(state) * CITIES.length)];
  let to = CITIES[Math.floor(nextRng(state) * CITIES.length)];
  while (to === from) to = CITIES[Math.floor(nextRng(state) * CITIES.length)];
  const dist = getDistance(from, to);
  const tons = 4 + Math.floor(nextRng(state) * 9);
  const cargo = CARGO_TYPES[Math.floor(nextRng(state) * CARGO_TYPES.length)];
  const customer = CUSTOMER_NAMES[Math.floor(nextRng(state) * CUSTOMER_NAMES.length)];
  const paymentEur = Math.max(200, Math.round(dist * tons * 0.70 / 5) * 5);
  const acceptDeadline = midnight + (6 + Math.floor(nextRng(state) * 7)) * 60;
  const deliveryDeadline = acceptDeadline + (8 + Math.floor(nextRng(state) * 17)) * 60;
  return {
    id: uid(state, "o"), customer, fromCity: from, toCity: to, cargo, tons,
    paymentCents: paymentEur * 100, acceptDeadlineMin: acceptDeadline, deliveryDeadlineMin: deliveryDeadline,
    status: "offered", acceptedAtMin: null, startedAtMin: null, deliveredAtMin: null, paidCents: null
  };
}
function generateDailyOrders(state, day, midnight) {
  const n = 2 + Math.floor(nextRng(state) * 2); // 2–3 neue Angebote
  for (let k = 0; k < n; k++) state.orders.push(makeOffer(state, midnight));
  // Abgelaufene Angebote archivieren
  for (const o of state.orders) {
    if (o.status === "offered" && o.acceptDeadlineMin <= state.gameTime) o.status = "expired";
  }
  // Aktive Angebotsliste begrenzen: älteste abgelaufene entfernen
  const offered = state.orders.filter(o => o.status === "offered");
  if (offered.length > 14) {
    const expired = state.orders.filter(o => o.status === "expired");
    expired.sort((a, b) => a.acceptDeadlineMin - b.acceptDeadlineMin);
    const removeIds = new Set(expired.slice(0, expired.length).map(o => o.id));
    state.orders = state.orders.filter(o => !(o.status === "expired" && removeIds.has(o.id)) && !(o.status === "offered" && false));
  }
}
function maybeGenerateInvitation(state, day, midnight) {
  if (day <= 1) return;
  const busy = state.appointments.some(a =>
    (a.type === "invitation" && ["pending", "accepted", "active"].includes(a.status)) ||
    (a.type === "invitation_ersatz" && ["accepted", "active"].includes(a.status))
  );
  if (busy) return;
  if (nextRng(state) < 0.5) {
    let tpl;
    do { tpl = INVITATION_TEMPLATES[Math.floor(nextRng(state) * INVITATION_TEMPLATES.length)]; }
    while (tpl.id === state.lastInvitationTemplateId && INVITATION_TEMPLATES.length > 1);
    state.lastInvitationTemplateId = tpl.id;
    const appear = midnight + 720;
    const deadline = midnight + 1080;
    state.appointments.push({
      id: uid(state, "ap"), type: "invitation", templateId: tpl.id, text: tpl.text,
      appearMin: appear, decisionDeadline: deadline, startMin: deadline, endMin: midnight + 1260,
      status: "pending", costCents: INVITATION_COST, effectsApplied: false, tutorial: false
    });
  }
}
function doDailyAccounting(state, midnight) {
  const day = dayOf(midnight);
  const log = [];
  resetDailyStats(state, midnight);
  resetDailyStats(state, midnight);
  const drivers = [...state.drivers].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const d of drivers) {
    const r = payCost(state, "company", DRIVER_COST_PER_DAY, "Fahrerlohn: " + d.name, d.id, midnight);
    log.push({ cause: "Fahrerlohn", driver: d.name, paid: r.paid, unpaid: r.unpaid });
  }
  for (const b of state.branches) {
    const r = payCost(state, "company", BRANCH_COST_PER_DAY, "Standort: " + b.name, b.id, midnight);
    log.push({ cause: "Standort", branch: b.name, paid: r.paid, unpaid: r.unpaid });
  }
  // Löhne für alle Angestellten (nicht fahrende Rollen) – rollenspezifische Konten
  for (const emp of (state.employees || [])) {
    if (emp.employmentStatus !== "employed") continue;
    const causeLabel = emp.role === "dispatcher" || emp.role === "dispatcher_senior" ? "Disposition"
      : emp.role === "cleaner" || emp.role === "mechanic" ? "Reinigung und Werkstatt"
      : emp.role === "accountant" || emp.role === "accountant_senior" ? "Buchhaltung"
      : "Lohn";
    const r = payCost(state, "company", emp.costPerDayCents, causeLabel + ": " + emp.name, emp.id, midnight);
    log.push({ cause: causeLabel, employee: emp.name, role: emp.role, paid: r.paid, unpaid: r.unpaid });
  }
  const w = doWithdrawal(state, midnight);
  log.push({ cause: "Private Entnahme", done: w.done, reason: w.reason });
  const l = payCost(state, "private", PRIVATE_LIVING_PER_DAY, "Lebenshaltung", "living", midnight);
  log.push({ cause: "Lebenshaltung", paid: l.paid, unpaid: l.unpaid });
  generateDailyOrders(state, day, midnight);
  maybeGenerateInvitation(state, day, midnight);
  // Balance-Serie: Zufriedenheit >=70 und Belastung <=40 am Tagesabschluss
  if (state.private.happiness >= 70 && state.private.stress <= 40) {
    state.stats.consecutiveBalanceDays = (state.stats.consecutiveBalanceDays || 0) + 1;
  } else {
    state.stats.consecutiveBalanceDays = 0;
  }
  state.stats.lastBalanceDay = day;
  state.lastDailyAccountingMin = midnight;
  return log;
}

// ---------- Zeitverarbeitung ----------
function earliestEventAfter(state, t, maxMin) {
  let best = null;
  const cand = (m) => { if (m > t && m <= maxMin) { if (best === null || m < best) best = m; } };
  for (const trip of state.trips) {
    if (trip.status === "in_progress" && trip.currentLeg < trip.legs.length) cand(trip.legs[trip.currentLeg].endMin);
  }
  for (const a of state.appointments) {
    if (a.status === "pending") cand(a.decisionDeadline);
    else if (a.status === "accepted") { cand(a.startMin); cand(a.endMin); }
    else if (a.status === "active") cand(a.endMin);
  }
  cand(Math.floor(t / 1440) * 1440 + 1440); // nächste Mitternacht
  cand(Math.floor(t / MONTH_MIN) * MONTH_MIN + MONTH_MIN); // nächste Monatsgrenze
  for (const o of state.orders) { if (o.status === "offered") cand(o.acceptDeadlineMin); }
  if (!state.tutorialInviteCreated) cand(720);
  for (const d of state.drivers) { if (d.status === "resting" && d.restUntil !== null) cand(d.restUntil); }
  for (const v of state.vehicles) { if (v.status === "maintenance" && v.maintenanceUntil !== null) cand(v.maintenanceUntil); }
  // Dienstzeiten für Angestellte (Disponenten, Reinigung, etc.)
  const hasWorkingStaff = (state.employees || []).some(e => e.employmentStatus === "employed" && e.attendance === "present" && e.role !== "driver");
  if (hasWorkingStaff) {
    const dayStart = Math.floor(t / 1440) * 1440;
    for (let st = dayStart + SERVICE_START_MIN; st <= dayStart + SERVICE_END_MIN; st += SERVICE_INTERVAL_MIN) {
      cand(st);
    }
  }
  // Tour-Deployment-Startzeiten
  for (const tour of state.tours || []) {
    if (tour.status !== "active") continue;
    for (const dep of tour.deployments) {
      if (dep.status === "planned") cand(dep.startMin);
    }
    if (tour.returnDeployment && tour.returnDeployment.status === "planned") cand(tour.returnDeployment.startMin);
  }
  return best;
}
function completeTrip(state, trip, m, log) {
  trip.status = "completed";
  trip.endMin = m;
  const vehicle = state.vehicles.find(v => v.id === trip.vehicleId);
  const driver = state.drivers.find(d => d.id === trip.driverId);
  const finalCity = trip.legs[trip.legs.length - 1].toCity;
  vehicle.status = "free"; vehicle.tripId = null; vehicle.locationCity = finalCity;
  vehicle.condition = Math.max(0, vehicle.condition - 1);
  driver.status = "resting"; driver.restUntil = m + REST_MIN; driver.locationCity = finalCity;
  if (trip.type === "empty") {
    // Tour-Verknüpfung prüfen
    onTripCompleted(state, trip, m, log);
    log.push({ type: "emptytrip_completed", trip: trip.id, vehicle: vehicle.id, driver: driver.id, atCity: finalCity });
    return;
  }
  const order = state.orders.find(o => o.id === trip.orderId);
  order.status = "geliefert"; order.deliveredAtMin = m;
  const onTime = m <= order.deliveryDeadlineMin;
  const payment = onTime ? trip.paymentCents : Math.round(trip.paymentCents * 0.9);
  addBooking(state, m, "Vergütung: " + order.customer, payment, "company", order.id);
  order.paidCents = payment;
  order.history = order.history || [];
  order.history.push({ type: "delivered", min: m, actor: driver.id, actorName: driver.name, details: { onTime, paymentCents: payment } });
  state.stats.totalDeliveries++;
  if (onTime) { state.stats.timelyDeliveries++; state.stats.consecutiveTimely = (state.stats.consecutiveTimely || 0) + 1; }
  else { state.stats.consecutiveTimely = 0; }
  state.stats.totalRevenueCents = (state.stats.totalRevenueCents || 0) + payment;
  const newAchs = checkAchievements(state, m);
  if (newAchs.length) log.push({ type: "achievements_unlocked", achievements: newAchs, atMin: m });
  if (state.tutorial.active && state.tutorial.step === 2) state.tutorial.step = 3;
  log.push({ type: "delivery", trip: trip.id, order: order.id, onTime, paymentCents: payment });
  // Tour-Verknüpfung: Deployment als abgeschlossen markieren
  onTripCompleted(state, trip, m, log);
  // Fahrer-Lieferbericht an GF postfach
  generateDriverDeliveryReport(state, driver, trip, order, m);
}
function processEventsAt(state, m, log) {
  // 1. Lieferabschlüsse (vor Fristprüfung)
  for (const trip of state.trips) {
    if (trip.status === "in_progress" && trip.currentLeg < trip.legs.length && trip.legs[trip.currentLeg].endMin === m) {
      trip.currentLeg++;
      log.push({ type: "leg_end", trip: trip.id, legType: trip.legs[trip.currentLeg - 1].type, endMin: m });
      if (trip.currentLeg >= trip.legs.length) completeTrip(state, trip, m, log);
    }
  }
  // 2. Termine
  for (const a of state.appointments) {
    if (a.status === "pending" && a.decisionDeadline === m) {
      a.status = "missed";
      state.private.relationship = clamp(state.private.relationship - 5, 0, 100);
      log.push({ type: "invitation_missed", appointment: a.id });
    } else if (a.status === "accepted" && a.startMin === m) {
      if (a.type === "invitation_ersatz") {
        if (state.private.accountCents >= a.costCents) {
          addBooking(state, a.startMin, "Freizeitabend (Ersatztermin)", -a.costCents, "private", a.id);
          a.costApplied = true; a.status = "active";
          log.push({ type: "ersatz_started", appointment: a.id });
        } else {
          a.status = "missed";
          state.private.relationship = clamp(state.private.relationship - 5, 0, 100);
          log.push({ type: "ersatz_missed", appointment: a.id });
        }
      } else {
        a.status = "active";
        log.push({ type: "appointment_started", appointment: a.id });
      }
    } else if (a.status === "active" && a.endMin === m) {
      a.status = "done";
      if (!a.effectsApplied) {
        if (a.type === "invitation" || a.type === "invitation_ersatz") {
          state.private.relationship = clamp(state.private.relationship + 8, 0, 100);
          state.private.stress = clamp(state.private.stress - 15, 0, 100);
          state.private.happiness = clamp(state.private.happiness + 5, 0, 100);
          state.stats.promisesKept = (state.stats.promisesKept || 0) + 1;
        } else if (a.type === "leisure") {
          state.private.stress = clamp(state.private.stress - 8, 0, 100);
          state.private.happiness = clamp(state.private.happiness + 2, 0, 100);
          state.stats.leisureCount = (state.stats.leisureCount || 0) + 1;
          const st = a.subtype || "walk";
          if (!(state.stats.leisureTypes || []).includes(st)) state.stats.leisureTypes.push(st);
        }
        a.effectsApplied = true;
      }
      log.push({ type: "appointment_done", appointment: a.id });
    }
  }
  // 3. Erholung / Wartung
  for (const d of state.drivers) { if (d.status === "resting" && d.restUntil === m) { d.status = "free"; d.restUntil = null; log.push({ type: "rest_end", driver: d.id }); } }
  for (const v of state.vehicles) {
    if (v.status === "maintenance" && v.maintenanceUntil === m) {
      v.status = "free"; v.maintenanceUntil = null; v.condition = 100;
      if (!(state.stats.maintainedVehicleIds || []).includes(v.id)) state.stats.maintainedVehicleIds.push(v.id);
      log.push({ type: "maintenance_end", vehicle: v.id });
      onMaintenanceCompleted(state, v, m);
    }
  }
  // 3b. Tour-automatische Folge-Einsätze starten (nach Erholung, vor Tagesabrechnung)
  processTours(state, m, log);
  // 3c. Angestellte verarbeiten (Disponenten, Reinigung, etc.) an Dienstzeitpunkten
  if (m % 1440 >= SERVICE_START_MIN && m % 1440 <= SERVICE_END_MIN && m % SERVICE_INTERVAL_MIN === 0) {
    processEmployees(state, m, log);
  }
  // 3d. Berichte generieren und Staff-Tasks verarbeiten
  processReportSchedules(state, m, log);
  processStaffTasks(state, m, log);
  // 4. Tagesabrechnung (Mitternacht)
  if (m % 1440 === 0 && m > 0) {
    const dlog = doDailyAccounting(state, m);
    log.push({ type: "daily_accounting", min: m, details: dlog });
  }
  // 4b. Monatswechsel (Abschreibung, Periodenabschluss)
  if (m % MONTH_MIN === 0 && m > 0) {
    calculateDepreciation(state, m);
    processMonthEnd(state, m, log);
  }
  // 5. Angebotsablauf
  for (const o of state.orders) { if (o.status === "offered" && o.acceptDeadlineMin === m) { o.status = "expired"; log.push({ type: "order_expired", order: o.id }); } }
  // 6. Tutorial-Einladung erscheint
  if (m === 720 && !state.tutorialInviteCreated) {
    state.tutorialInviteCreated = true;
    const tpl = INVITATION_TEMPLATES[0];
    const ap = {
      id: uid(state, "ap"), type: "invitation", templateId: tpl.id, text: tpl.text,
      appearMin: 720, decisionDeadline: 1080, startMin: 1080, endMin: 1260,
      status: "pending", costCents: INVITATION_COST, effectsApplied: false, tutorial: true
    };
    state.appointments.push(ap);
    log.push({ type: "invitation_appeared", appointment: ap.id, text: tpl.text });
  }
  // 7. Erfolgsprüfung nach jedem Ereignis
  const newAchs = checkAchievements(state, m);
  if (newAchs.length) log.push({ type: "achievements_unlocked", achievements: newAchs, atMin: m });
}
function advanceTo(state, targetMin, log) {
  let t = state.gameTime;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = earliestEventAfter(state, t, targetMin);
    if (next === null) break;
    processEventsAt(state, next, log);
    t = next;
  }
  state.gameTime = targetMin;
}

// ---------- Dispositionsplanung ----------
function planTrip(state, order, vehicle, driver) {
  let t = state.gameTime;
  const legs = [];
  let totalKm = 0;
  if (vehicle.locationCity !== order.fromCity) {
    const d = getDistance(vehicle.locationCity, order.fromCity);
    const dur = driveMinutes(d);
    legs.push({ type: "empty", fromCity: vehicle.locationCity, toCity: order.fromCity, distanceKm: d, durationMin: dur, startMin: t, endMin: t + dur });
    t += dur; totalKm += d;
  }
  legs.push({ type: "load", fromCity: order.fromCity, toCity: order.fromCity, distanceKm: 0, durationMin: LOAD_MIN, startMin: t, endMin: t + LOAD_MIN });
  t += LOAD_MIN;
  const d = getDistance(order.fromCity, order.toCity);
  const dur = driveMinutes(d);
  legs.push({ type: "drive", fromCity: order.fromCity, toCity: order.toCity, distanceKm: d, durationMin: dur, startMin: t, endMin: t + dur });
  t += dur; totalKm += d;
  legs.push({ type: "unload", fromCity: order.toCity, toCity: order.toCity, distanceKm: 0, durationMin: UNLOAD_MIN, startMin: t, endMin: t + UNLOAD_MIN });
  t += UNLOAD_MIN;
  return { legs, totalKm, totalDuration: t - state.gameTime, endMin: t };
}

function refreshApplicants(state) {
  while (state.availableApplicants.length < 3) {
    const pool = DRIVER_APPLICANT_POOL.filter(n =>
      !state.hiredApplicantNames.some(h => h.startsWith(n + ":")) && !state.availableApplicants.some(a => a.name === n));
    if (pool.length === 0) break;
    const name = pool[Math.floor(nextRng(state) * pool.length)];
    const portraitIdx = state.idCounter % 12;
    state.availableApplicants.push({
      id: uid(state, "a"), name, role: "driver",
      hireFeeCents: PERSONNEL_ROLES.driver.hireFeeCents,
      costPerDayCents: DRIVER_COST_PER_DAY,
      capacity: 0, portraitId: PORTRAIT_IDS[portraitIdx],
    });
  }
}

// ---------- Angestellten-Verarbeitung ----------
// Wird an Dienstzeitpunkten (08:00–16:00, alle 60 min) aufgerufen.
// Disponenten erstellen Vorschläge (Modus A), disponieren (Modus B/C).
// Reinigung, Werkstatt, Buchhaltung folgen in Etappe 2.
function processEmployees(state, m, log) {
  for (const emp of (state.employees || [])) {
    if (emp.employmentStatus !== "employed") continue;
    if (emp.attendance !== "present") continue;
    if (emp.role === "dispatcher" || emp.role === "dispatcher_senior") {
      processDispatcher(state, emp, m, log);
    }
    if (emp.role === "accountant" || emp.role === "accountant_senior") {
      processAccountant(state, emp, m, log);
    }
  }
}

// Disponent verarbeitet seine zugewiesenen Lkw.
// Modus A: erstellt Vorschläge für freie Fahrzeuge mit angenommenen Aufträgen.
// Modus B: darf angenommene Aufträge verbindlich planen und starten.
// Modus C: darf zusätzlich Marktangebote annehmen (Etappe 4 – hier vorbereitet).
function processDispatcher(state, emp, m, log) {
  const assignedVehicles = (emp.assignedVehicleIds || []).map(vid => state.vehicles.find(v => v.id === vid)).filter(Boolean);
  if (assignedVehicles.length === 0) return;

  // Nur verarbeiten, wenn sich etwas geändert hat seit letzter Entscheidung
  // (Vermeide stündliche Wiederholung unveränderter Vorschläge)
  const hasAcceptedOrders = state.orders.some(o => o.status === "angenommen");
  const hasFreeVehicles = assignedVehicles.some(v => v.status === "free" || v.status === "resting");
  if (!hasAcceptedOrders || !hasFreeVehicles) {
    // Aufräumen: alte Vorschläge entfernen wenn keine Aufträge/Fahrzeuge
    if ((emp.suggestions || []).length > 0) {
      emp.suggestions = [];
      log.push({ type: "dispatcher_suggestions_cleared", employee: emp.id, atMin: m, reason: "keine Aufträge oder freie Fahrzeuge" });
    }
    return;
  }

  // Modus A: Vorschläge vorbereiten
  if (emp.workMode === "suggestions") {
    // Prüfe, ob es bereits gültige Vorschläge gibt
    const existingValid = (emp.suggestions || []).filter(s => s.status === "pending");
    if (existingValid.length > 0) {
      // Prüfe, ob sich die Situation geändert hat
      const situationChanged = hasSituationChanged(state, emp, existingValid);
      if (!situationChanged) return; // Keine neuen Vorschläge nötig
    }

    // Neue Vorschläge generieren (nur für zugewiesene Fahrzeuge)
    const result = suggestTours(state, {
      vehicleIds: emp.assignedVehicleIds,
      earliestStart: m,
      horizonMin: 2880,
      desiredEndCity: null,
      latestReturnMin: null,
      mode: "balanced",
      acceptNew: false, // Modus A: keine neuen Angebote annehmen
    });

    // Alte Vorschläge aufräumen
    emp.suggestions = (emp.suggestions || []).filter(s => s.status !== "pending");
    // Neue Vorschläge hinzufügen
    for (const s of result.suggestions) {
      const sug = {
        id: uid(state, "sug"),
        employeeId: emp.id,
        employeeName: emp.name,
        createdAtMin: m,
        vehicleId: s.vehicleId,
        driverId: s.driverId,
        orderIds: s.orderIds,
        plan: s.plan,
        status: "pending",
      };
      emp.suggestions.push(sug);
      log.push({ type: "dispatcher_suggestion", employee: emp.id, suggestion: sug.id, vehicle: s.vehicleId, atMin: m });
    }
    emp.lastDecisionMin = m;
  }

  // Modus B: angenommene Auftraege verbindlich planen
  if (emp.workMode === "dispatch_accepted" || emp.workMode === "autonomous") {
    const acceptedOrders = state.orders.filter(o =>
      o.status === "angenommen" &&
      !state.trips.some(t => t.orderId === o.id && t.status === "in_progress")
    );
    for (const order of acceptedOrders) {
      const vehicle = assignedVehicles.find(v => v.status === "free" && v.condition >= 20);
      if (!vehicle) break;
      const driver = state.drivers.find(d =>
        d.status === "free" && d.locationCity === vehicle.locationCity &&
        d.employmentStatus === "employed" && d.attendance === "present" &&
        (!d.restUntil || d.restUntil <= m)
      );
      if (!driver) continue;
      try {
        const r = doConfirmTour(state, {
          vehicleId: vehicle.id, driverId: driver.id, orderIds: [order.id],
        });
        order.plannedById = emp.id; order.plannedByName = emp.name;
        order.history = order.history || [];
        order.history.push({ type: "planned", min: m, actor: emp.id, actorName: emp.name, details: { vehicleId: vehicle.id, driverId: driver.id } });
        const tour = r.tour || { id: r.tourId, vehicleId: vehicle.id, driverId: driver.id, orderIds: [order.id], startMin: m, endMin: r.endMin };
        onTourConfirmed(state, tour, emp.id, m);
        emp.dailyStats = emp.dailyStats || { day: dayOf(m), offersChecked: 0, ordersAccepted: 0, ordersPlanned: 0, toursStarted: 0 };
        emp.dailyStats.ordersPlanned = (emp.dailyStats.ordersPlanned || 0) + 1;
        emp.dailyStats.toursStarted = (emp.dailyStats.toursStarted || 0) + 1;
        log.push({ type: "dispatcher_planned", employee: emp.id, order: order.id, vehicle: vehicle.id, atMin: m });
      } catch (e) {
        log.push({ type: "dispatcher_plan_failed", employee: emp.id, order: order.id, error: e.message, atMin: m });
      }
    }
  }

  // Modus C: Marktangebote annehmen und planen
  if (emp.workMode === "autonomous") {
    const offered = state.orders.filter(o => o.status === "offered" && o.acceptDeadlineMin > m);
    for (const order of offered.slice(0, 3)) {
      const vehicle = assignedVehicles.find(v => v.status === "free" && v.condition >= 20);
      if (!vehicle) break;
      const driver = state.drivers.find(d =>
        d.status === "free" && d.locationCity === vehicle.locationCity &&
        d.employmentStatus === "employed" && d.attendance === "present" &&
        (!d.restUntil || d.restUntil <= m)
      );
      if (!driver) continue;
      order.status = "angenommen"; order.acceptedAtMin = m;
      order.acceptedById = emp.id; order.acceptedByName = emp.name;
      order.history = order.history || [];
      order.history.push({ type: "accepted", min: m, actor: emp.id, actorName: emp.name });
      try {
        const r = doConfirmTour(state, {
          vehicleId: vehicle.id, driverId: driver.id, orderIds: [order.id],
        });
        order.plannedById = emp.id; order.plannedByName = emp.name;
        order.history.push({ type: "planned", min: m, actor: emp.id, actorName: emp.name, details: { vehicleId: vehicle.id, driverId: driver.id } });
        const tour = r.tour || { id: r.tourId, vehicleId: vehicle.id, driverId: driver.id, orderIds: [order.id], startMin: m, endMin: r.endMin };
        onOrderAccepted(state, order, emp.id, m);
        onTourConfirmed(state, tour, emp.id, m);
        emp.dailyStats = emp.dailyStats || { day: dayOf(m), offersChecked: 0, ordersAccepted: 0, ordersPlanned: 0, toursStarted: 0 };
        emp.dailyStats.ordersAccepted = (emp.dailyStats.ordersAccepted || 0) + 1;
        emp.dailyStats.ordersPlanned = (emp.dailyStats.ordersPlanned || 0) + 1;
        emp.dailyStats.toursStarted = (emp.dailyStats.toursStarted || 0) + 1;
        log.push({ type: "dispatcher_accepted", employee: emp.id, order: order.id, vehicle: vehicle.id, atMin: m });
      } catch (e) {
        order.status = "offered"; order.acceptedAtMin = null;
        order.acceptedById = null; order.acceptedByName = null;
        log.push({ type: "dispatcher_accept_failed", employee: emp.id, order: order.id, error: e.message, atMin: m });
      }
    }
  }
}

// Prüft, ob sich die Situation seit der letzten Vorschlagserstellung geändert hat.
function hasSituationChanged(state, emp, existingSuggestions) {
  const acceptedOrders = state.orders.filter(o => o.status === "angenommen");
  const assignedFree = (emp.assignedVehicleIds || []).filter(vid => {
    const v = state.vehicles.find(x => x.id === vid);
    return v && (v.status === "free" || v.status === "resting");
  });
  // Wenn es angenommene Aufträge gibt, die nicht in bestehenden Vorschlägen abgedeckt sind
  const coveredOrderIds = new Set();
  for (const s of existingSuggestions) {
    for (const oid of s.orderIds) coveredOrderIds.add(oid);
  }
  const uncovered = acceptedOrders.filter(o => !coveredOrderIds.has(o.id));
  // Wenn es neue ungedeckte angenommene Aufträge gibt oder die Vorschläge nicht mehr gültig sind
  if (uncovered.length > 0) return true;
  // Prüfe, ob bestehende Vorschläge noch gültig sind
  for (const s of existingSuggestions) {
    const v = state.vehicles.find(x => x.id === s.vehicleId);
    if (!v || (v.status !== "free" && v.status !== "resting")) return true;
  }
  return false;
}

// ---------- Task-Parameter Extraktion ----------
function extractTaskParams(body, state, conv) {
  const params = {};
  const orderMatch = body.match(/o_\d+/i);
  if (orderMatch) params.orderId = orderMatch[0];
  const tourMatch = body.match(/tour_\d+/i);
  if (tourMatch) params.tourId = tourMatch[0];
  const vehicleMatch = body.match(/v\d+/i);
  if (vehicleMatch) params.vehicleId = vehicleMatch[0];
  if (conv?.linkedRef) {
    if (conv.linkedRef.type === "order") params.orderId = conv.linkedRef.id;
    if (conv.linkedRef.type === "tour") params.tourId = conv.linkedRef.id;
    if (conv.linkedRef.type === "vehicle") params.vehicleId = conv.linkedRef.id;
  }
  return params;
}

// ---------- Befehle ----------
export function applyCommand(state, command, params) {
  migrateState(state);
  const p = params || {};
  let result;
  switch (command) {

    case "setNames": {
      if (p.companyName) state.company.name = p.companyName;
      if (p.playerName) state.private.playerName = p.playerName;
      if (p.partnerName) state.private.partnerName = p.partnerName;
      result = { ok: true };
      break;
    }

    case "acceptOrder": {
      ensureNotBlocked(state);
      const o = state.orders.find(x => x.id === p.orderId);
      if (!o) throw new Error("Auftrag nicht gefunden.");
      if (o.status !== "offered") throw new Error("Auftrag ist nicht mehr verfügbar.");
      if (o.acceptDeadlineMin <= state.gameTime) throw new Error("Die Annahmefrist ist abgelaufen.");
      o.status = "angenommen"; o.acceptedAtMin = state.gameTime;
      o.acceptedById = "player"; o.acceptedByName = state.private.playerName;
      o.history = o.history || [];
      o.history.push({ type: "accepted", min: state.gameTime, actor: "player", actorName: state.private.playerName });
      if (state.tutorial.active && state.tutorial.step === 0) state.tutorial.step = 1;
      result = { ok: true, orderId: o.id };
      break;
    }

    case "cancelOrder": {
      ensureNotBlocked(state);
      const o = state.orders.find(x => x.id === p.orderId);
      if (!o) throw new Error("Auftrag nicht gefunden.");
      if (o.status !== "angenommen") throw new Error("Nur angenommene, nicht gestartete Aufträge können storniert werden.");
      const trip = state.trips.find(t => t.orderId === o.id && t.status === "in_progress");
      if (trip) throw new Error("Laufende Fahrten können nicht storniert werden.");
      const fee = Math.round(o.paymentCents * 0.1);
      if (state.company.accountCents < fee) throw new Error("Firmenkonto reicht für die Stornogebühr nicht aus.");
      addBooking(state, state.gameTime, "Stornogebühr: " + o.customer, -fee, "company", "cancel:" + o.id);
      o.status = "storniert";
      state.stats.cancelledOrders = (state.stats.cancelledOrders || 0) + 1;
      result = { ok: true, feeCents: fee };
      break;
    }

    case "startTransport": {
      ensureNotBlocked(state);
      const o = state.orders.find(x => x.id === p.orderId);
      if (!o) throw new Error("Auftrag nicht gefunden.");
      if (o.status !== "angenommen") throw new Error("Auftrag muss zuerst angenommen werden.");
      if (state.trips.some(t => t.orderId === o.id && t.status === "in_progress")) throw new Error("Für diesen Auftrag läuft bereits eine Fahrt.");
      const v = state.vehicles.find(x => x.id === p.vehicleId);
      if (!v) throw new Error("Fahrzeug nicht gefunden.");
      const d = state.drivers.find(x => x.id === p.driverId);
      if (!d) throw new Error("Fahrer nicht gefunden.");
      if (v.status !== "free") throw new Error("Fahrzeug ist nicht frei.");
      if (d.status !== "free") throw new Error("Fahrer ist nicht frei.");
      if (v.condition < 20) throw new Error("Fahrzeugzustand zu schlecht für einen Einsatz (unter 20). Wartung erforderlich.");
      if (d.restUntil !== null && d.restUntil > state.gameTime) throw new Error("Fahrer ist noch in der Erholung (bis " + formatGameTime(d.restUntil) + ").");
      if (v.locationCity !== d.locationCity) throw new Error("Fahrer und Lkw befinden sich an unterschiedlichen Orten.");
      if (o.tons > v.capacityTons) throw new Error("Überladung: " + o.tons + " t überschreiten Kapazität von " + v.capacityTons + " t.");
      const plan = planTrip(state, o, v, d);
      if (plan.totalDuration > MAX_DUTY_MIN) {
        const h = Math.floor(plan.totalDuration / 60), mm = plan.totalDuration % 60;
        throw new Error("Einsatzdauer (" + h + " h " + mm + " min) überschreitet die 8-Stunden-Grenze.");
      }
      const fuel = fuelCents(plan.totalKm, v.consumptionPer100km);
      const toll = tollCents(plan.totalKm);
      const totalCost = fuel + toll;
      if (state.company.accountCents < totalCost) throw new Error("Firmenkonto reicht für Kraftstoff und Maut (" + (totalCost / 100).toFixed(2) + " €) nicht aus.");
      addBooking(state, state.gameTime, "Kraftstoff: " + o.customer, -fuel, "company", "fuel:" + o.id);
      addBooking(state, state.gameTime, "Maut: " + o.customer, -toll, "company", "toll:" + o.id);
      const trip = {
        id: uid(state, "t"), type: "loaded", orderId: o.id, vehicleId: v.id, driverId: d.id,
        legs: plan.legs, currentLeg: 0, startMin: state.gameTime, endMin: plan.endMin,
        status: "in_progress", paymentCents: o.paymentCents, fuelCents: fuel, tollCents: toll, totalKm: plan.totalKm
      };
      state.trips.push(trip);
      v.status = "on_trip"; v.tripId = trip.id;
      d.status = "on_trip";
      o.status = "unterwegs"; o.startedAtMin = state.gameTime;
      o.plannedById = "player"; o.plannedByName = state.private.playerName;
      o.history = o.history || [];
      o.history.push({ type: "planned", min: state.gameTime, actor: "player", actorName: state.private.playerName, details: { vehicleId: v.id, driverId: d.id, startMin: state.gameTime, endMin: plan.endMin, fuelCents: fuel, tollCents: toll } });
      o.history.push({ type: "started", min: state.gameTime, actor: "player", actorName: state.private.playerName, details: { tripId: trip.id, vehicleId: v.id, driverId: d.id } });
      if (state.tutorial.active && state.tutorial.step === 1) state.tutorial.step = 2;
      result = { ok: true, tripId: trip.id, fuelCents: fuel, tollCents: toll, totalKm: plan.totalKm, endMin: plan.endMin, legs: plan.legs };
      break;
    }

    case "startEmptyTrip": {
      ensureNotBlocked(state);
      const v = state.vehicles.find(x => x.id === p.vehicleId);
      const d = state.drivers.find(x => x.id === p.driverId);
      if (!v || !d) throw new Error("Fahrzeug oder Fahrer nicht gefunden.");
      if (v.status !== "free") throw new Error("Fahrzeug ist nicht frei.");
      if (d.status !== "free") throw new Error("Fahrer ist nicht frei.");
      if (v.condition < 20) throw new Error("Fahrzeugzustand zu schlecht für einen Einsatz.");
      if (d.restUntil !== null && d.restUntil > state.gameTime) throw new Error("Fahrer ist noch in der Erholung.");
      if (v.locationCity !== d.locationCity) throw new Error("Fahrer und Lkw befinden sich an unterschiedlichen Orten.");
      if (v.locationCity !== p.fromCity) throw new Error("Fahrzeug und Fahrer müssen am Abfahrtsort sein.");
      if (!p.fromCity || !p.toCity || p.fromCity === p.toCity) throw new Error("Start und Ziel müssen zwei verschiedene Städte sein.");
      const dist = getDistance(p.fromCity, p.toCity);
      const dur = driveMinutes(dist);
      if (dur > MAX_DUTY_MIN) throw new Error("Fahrt überschreitet die 8-Stunden-Grenze.");
      const fuel = fuelCents(dist, v.consumptionPer100km);
      const toll = tollCents(dist);
      if (state.company.accountCents < fuel + toll) throw new Error("Firmenkonto reicht für Kraftstoff und Maut nicht aus.");
      addBooking(state, state.gameTime, "Kraftstoff (Leerfahrt)", -fuel, "company", "emptyfuel");
      addBooking(state, state.gameTime, "Maut (Leerfahrt)", -toll, "company", "emptytoll");
      const trip = {
        id: uid(state, "t"), type: "empty", orderId: null, vehicleId: v.id, driverId: d.id,
        legs: [{ type: "empty_drive", fromCity: p.fromCity, toCity: p.toCity, distanceKm: dist, durationMin: dur, startMin: state.gameTime, endMin: state.gameTime + dur }],
        currentLeg: 0, startMin: state.gameTime, endMin: state.gameTime + dur,
        status: "in_progress", paymentCents: 0, fuelCents: fuel, tollCents: toll, totalKm: dist
      };
      state.trips.push(trip);
      v.status = "on_trip"; v.tripId = trip.id;
      d.status = "on_trip";
      result = { ok: true, tripId: trip.id, fuelCents: fuel, tollCents: toll, totalKm: dist, endMin: trip.endMin };
      break;
    }

    case "maintainVehicle": {
      ensureNotBlocked(state);
      const v = state.vehicles.find(x => x.id === p.vehicleId);
      if (!v) throw new Error("Fahrzeug nicht gefunden.");
      if (v.status !== "free") throw new Error("Wartung ist nur für freie Fahrzeuge möglich.");
      if (v.condition >= 100) throw new Error("Fahrzeug ist bereits in bestem Zustand.");
      let cost = MAINTENANCE_COST;
      const stressed = state.private.stress >= STRESS_MAINT_THRESHOLD;
      if (stressed) cost = Math.round(cost * MAINT_STRESS_FACTOR);
      if (state.company.accountCents < cost) throw new Error("Firmenkonto reicht für die Wartung (" + (cost / 100).toFixed(2) + " €) nicht aus.");
      addBooking(state, state.gameTime, "Wartung: " + v.id, -cost, "company", "maintain:" + v.id);
      v.status = "maintenance"; v.maintenanceUntil = state.gameTime + MAINTENANCE_DURATION;
      result = { ok: true, vehicleId: v.id, costCents: cost, stressed, until: v.maintenanceUntil };
      break;
    }

    case "buyVehicle": {
      ensureNotBlocked(state);
      if (state.openCosts.some(o => o.account === "company")) throw new Error("Es gibt offene betriebliche Kosten. Bitte bezahle diese zuerst.");
      if (state.company.accountCents < VEHICLE_PRICE) throw new Error("Firmenkonto reicht für den Lkw-Kauf (30.000 €) nicht aus.");
      addBooking(state, state.gameTime, "Fahrzeugkauf", -VEHICLE_PRICE, "company", "buy");
      const v = {
        id: uid(state, "v"), branchId: "b1", type: STANDARD_TRUCK.type, capacityTons: 12,
        consumptionPer100km: 28, bookValueCents: VEHICLE_PRICE, condition: 85,
        locationCity: "Hamburg", status: "free", tripId: null, maintenanceUntil: null
      };
      state.vehicles.push(v);
      registerAsset(state, {
        vehicleId: v.id, account: "1200",
        name: "Lkw " + String(parseInt(String(v.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0"),
        acquisitionCostCents: VEHICLE_PRICE, acquiredAtMin: state.gameTime,
      });
      const newAchs = checkAchievements(state, state.gameTime);
      result = { ok: true, vehicleId: v.id, newAchievements: newAchs };
      break;
    }

    case "hireDriver": {
      ensureNotBlocked(state);
      if (state.openCosts.some(o => o.account === "company")) throw new Error("Es gibt offene betriebliche Kosten. Bitte bezahle diese zuerst.");
      const app = state.availableApplicants.find(a => a.id === p.applicantId);
      if (!app) throw new Error("Bewerber nicht verfügbar.");
      if (state.hiredApplicantNames.includes(app.name)) throw new Error("Dieser Bewerber wurde bereits eingestellt.");
      if (state.company.accountCents < HIRE_FEE) throw new Error("Firmenkonto reicht für die Einstellungsgebühr (500 €) nicht aus.");
      addBooking(state, state.gameTime, "Einstellung: " + app.name, -HIRE_FEE, "company", "hire:" + app.name);
      const d = { id: uid(state, "d"), name: app.name, branchId: "b1", costPerDayCents: DRIVER_COST_PER_DAY, locationCity: "Hamburg", status: "free", restUntil: null, employedDay: dayOf(state.gameTime), portraitId: app.portraitId || null, satisfaction: 70, satisfactionReasons: [], employmentStatus: "employed", attendance: "present", consecutiveLowSatisfactionDays: 0 };
      state.drivers.push(d);
      state.hiredApplicantNames.push(app.name);
      state.availableApplicants = state.availableApplicants.filter(a => a.id !== app.id);
      refreshApplicants(state);
      result = { ok: true, driverId: d.id };
      break;
    }

    // ---------- Personal: allgemeine Einstellung ----------

    case "hireEmployee": {
      ensureNotBlocked(state);
      if (state.openCosts.some(o => o.account === "company")) throw new Error("Es gibt offene betriebliche Kosten. Bitte bezahle diese zuerst.");
      const app = state.availableApplicants.find(a => a.id === p.applicantId);
      if (!app) throw new Error("Bewerber nicht verfügbar.");
      if (state.hiredApplicantNames.includes(app.name + ":" + app.role)) throw new Error("Dieser Bewerber wurde bereits in dieser Rolle eingestellt.");
      const role = app.role || "driver";
      const roleDef = PERSONNEL_ROLES[role];
      if (!roleDef) throw new Error("Unbekannte Rolle: " + role);
      const hireFee = app.hireFeeCents || roleDef.hireFeeCents;
      const dailyWage = app.costPerDayCents || roleDef.costPerDayCents;
      if (state.company.accountCents < hireFee) throw new Error("Firmenkonto reicht für die Einstellungsgebühr (" + (hireFee / 100) + " €) nicht aus.");
      addBooking(state, state.gameTime, "Einstellung: " + app.name + " (" + roleDef.label + ")", -hireFee, "company", "hire:" + app.id);

      if (role === "driver") {
        // Fahrer werden in das bestehende drivers-Array aufgenommen
        const d = {
          id: uid(state, "d"), name: app.name, branchId: "b1",
          costPerDayCents: dailyWage, locationCity: "Hamburg", status: "free",
          restUntil: null, employedDay: dayOf(state.gameTime),
          portraitId: app.portraitId || null, satisfaction: 70, satisfactionReasons: [],
          employmentStatus: "employed", attendance: "present", consecutiveLowSatisfactionDays: 0,
        };
        state.drivers.push(d);
        result = { ok: true, employeeId: d.id, role: "driver" };
      } else {
        // Nicht fahrende Angestellte werden in das employees-Array aufgenommen
        const emp = {
          id: uid(state, "emp"), name: app.name, role, branchId: "b1",
          locationCity: "Hamburg", employedDay: dayOf(state.gameTime),
          costPerDayCents: dailyWage, hireFeeCents: hireFee,
          satisfaction: 70, satisfactionReasons: [],
          employmentStatus: "employed", exitDate: null,
          attendance: "present", sickUntil: null, vacationUntil: null,
          vacationDaysAvailable: 3,
          activity: "idle", consecutiveLowSatisfactionDays: 0,
          assignedVehicleIds: [], workMode: "suggestions",
          capacity: app.capacity || roleDef.capacity,
          lastDecisionMin: null, suggestions: [],
          portraitId: app.portraitId || null,
        };
        state.employees.push(emp);
        result = { ok: true, employeeId: emp.id, role };
      }
      state.hiredApplicantNames.push(app.name + ":" + app.role);
      state.availableApplicants = state.availableApplicants.filter(a => a.id !== app.id);
      refreshApplicants(state);
      // Einfuehrungsnachricht an GF
      const newHire = role === "driver"
        ? state.drivers[state.drivers.length - 1]
        : (state.employees || []).find(e => e.name === app.name && e.role === role);
      if (newHire) onEmployeeHired(state, newHire, state.gameTime);
      break;
    }

    case "setupDispatcher": {
      ensureNotBlocked(state);
      const emp = (state.employees || []).find(e => e.id === p.employeeId);
      if (!emp) throw new Error("Angestellter nicht gefunden.");
      if (emp.role !== "dispatcher" && emp.role !== "dispatcher_senior") throw new Error("Diese Person ist kein Disponent.");
      const vehicleIds = p.vehicleIds || [];
      if (vehicleIds.length > emp.capacity) throw new Error("Überlastung: " + vehicleIds.length + " Lkw überschreiten Kapazität von " + emp.capacity + ".");
      // Prüfe, dass keine Lkw bereits einem anderen Disponenten zugewiesen sind
      for (const vid of vehicleIds) {
        const v = state.vehicles.find(x => x.id === vid);
        if (!v) throw new Error("Fahrzeug nicht gefunden: " + vid);
        for (const other of (state.employees || [])) {
          if (other.id === emp.id) continue;
          if (other.role !== "dispatcher" && other.role !== "dispatcher_senior") continue;
          if ((other.assignedVehicleIds || []).includes(vid)) {
            throw new Error("Lkw " + vid + " ist bereits " + other.name + " zugewiesen.");
          }
        }
      }
      emp.assignedVehicleIds = vehicleIds;
      if (p.workMode && ["suggestions", "dispatch_accepted", "autonomous"].includes(p.workMode)) {
        emp.workMode = p.workMode;
      }
      // Alte Vorschläge aufräumen
      emp.suggestions = [];
      result = { ok: true, employeeId: emp.id, assignedVehicleIds: vehicleIds, workMode: emp.workMode };
      break;
    }

    case "confirmDispatcherSuggestion": {
      ensureNotBlocked(state);
      const emp = (state.employees || []).find(e => e.id === p.employeeId);
      if (!emp) throw new Error("Angestellter nicht gefunden.");
      const sug = (emp.suggestions || []).find(s => s.id === p.suggestionId);
      if (!sug) throw new Error("Vorschlag nicht gefunden.");
      if (sug.status !== "pending") throw new Error("Vorschlag ist nicht mehr verfügbar.");
      // Verbindlich bestätigen – nutzt die bestehende Tour-Logik
      const r = doConfirmTour(state, {
        vehicleId: sug.vehicleId,
        driverId: sug.driverId,
        orderIds: sug.orderIds,
        desiredEndCity: sug.plan.desiredEndCity || null,
        latestReturnMin: sug.plan.latestReturnMin || null,
      });
      sug.status = "confirmed";
      sug.confirmedAtMin = state.gameTime;
      result = { ok: true, ...r, suggestionId: sug.id };
      break;
    }

    case "dismissDispatcherSuggestion": {
      const emp = (state.employees || []).find(e => e.id === p.employeeId);
      if (!emp) throw new Error("Angestellter nicht gefunden.");
      const sug = (emp.suggestions || []).find(s => s.id === p.suggestionId);
      if (!sug) throw new Error("Vorschlag nicht gefunden.");
      sug.status = "dismissed";
      sug.dismissedAtMin = state.gameTime;
      result = { ok: true };
      break;
    }

    case "answerInvitation": {
      const a = state.appointments.find(x => x.id === p.appointmentId);
      if (!a) throw new Error("Termin nicht gefunden.");
      if (a.status !== "pending") throw new Error("Diese Einladung wurde bereits beantwortet.");
      if (state.gameTime < a.appearMin) throw new Error("Einladung ist noch nicht erschienen.");
      if (state.gameTime >= a.decisionDeadline) throw new Error("Die Frist für diese Einladung ist abgelaufen.");
      const choice = p.choice;
      if (choice === "accept") {
        if (state.private.accountCents < a.costCents) throw new Error("Privatkonto reicht für die Zusage nicht aus (60 € erforderlich).");
        addBooking(state, state.gameTime, "Freizeitabend zugesagt", -a.costCents, "private", a.id);
        a.status = "accepted"; a.costApplied = true;
        result = { ok: true, choice: "accept" };
      } else if (choice === "reschedule") {
        state.private.relationship = clamp(state.private.relationship - 2, 0, 100);
        a.status = "rescheduled";
        const baseMidnight = Math.floor(a.startMin / 1440) * 1440;
        const ersatzStart = baseMidnight + 1440 + 1080; // Folgetag 18:00
        const ersatz = {
          id: uid(state, "ap"), type: "invitation_ersatz", templateId: a.templateId, text: a.text,
          appearMin: ersatzStart - 360, decisionDeadline: ersatzStart, startMin: ersatzStart, endMin: ersatzStart + 180,
          status: "accepted", costCents: a.costCents, effectsApplied: false, originalId: a.id
        };
        state.appointments.push(ersatz);
        result = { ok: true, choice: "reschedule", ersatzId: ersatz.id };
      } else if (choice === "decline") {
        state.private.relationship = clamp(state.private.relationship - 8, 0, 100);
        state.private.stress = clamp(state.private.stress + 10, 0, 100);
        state.private.happiness = clamp(state.private.happiness - 3, 0, 100);
        a.status = "declined";
        result = { ok: true, choice: "decline" };
      } else throw new Error("Ungültige Wahl.");
      if (state.tutorial.active) { state.tutorial.step = 5; state.tutorial.active = false; }
      break;
    }

    case "startLeisure": {
      ensureNotBlocked(state);
      const day = dayOf(state.gameTime);
      if (state.leisureUsedDay === day) throw new Error("Du hast heute schon eine Freizeitaktivität geplant.");
      const start = state.gameTime, end = state.gameTime + 120;
      for (const a of state.appointments) {
        if (["pending", "accepted", "active"].includes(a.status) && a.startMin < end && a.endMin > start)
          throw new Error("Die Freizeitaktivität überschneidet sich mit einem Termin.");
      }
      const ap = { id: uid(state, "ap"), type: "leisure", subtype: "walk", label: "Spaziergang", startMin: start, endMin: end, status: "active", effectsApplied: false };
      state.appointments.push(ap);
      state.leisureUsedDay = day;
      result = { ok: true, appointmentId: ap.id };
      break;
    }

    case "payOpenCosts": {
      const account = p.account || "company";
      if (account === "private") {
        // Private offene Kosten direkt bezahlen
        const list = state.openCosts.filter(o => o.account === "private").sort((a, b) => a.createdAtMin - b.createdAtMin);
        let paid = 0; const paidItems = [];
        for (const o of list) {
          if (state.private.accountCents <= 0) break;
          const pay = Math.min(state.private.accountCents, o.amountCents);
          state.private.accountCents -= pay;
          o.amountCents -= pay;
          paid += pay;
          paidItems.push({ id: o.id, paid: pay, remaining: o.amountCents });
        }
        state.openCosts = state.openCosts.filter(o => o.amountCents > 0);
        result = { ok: true, paidCents: paid, paidItems, remainingOpenCents: state.openCosts.filter(o => o.account === "private").reduce((s, o) => s + o.amountCents, 0) };
        break;
      }
      // Firmen-Verbindlichkeiten über offene Posten abrechnen
      const items = (state.accounting?.openItems || []).filter(o => o.remainingCents > 0).sort((a, b) => a.createdAtMin - b.createdAtMin);
      let paid = 0; const paidItems = [];
      for (const o of items) {
        if (state.company.accountCents <= 0) break;
        const pay = Math.min(state.company.accountCents, o.remainingCents);
        const r = settleOpenItem(state, o.id, pay);
        paid += r.paid;
        paidItems.push({ id: o.id, paid: r.paid, remaining: r.remaining });
      }
      const remaining = (state.accounting?.openItems || []).filter(o => o.remainingCents > 0).reduce((s, o) => s + o.remainingCents, 0);
      result = { ok: true, paidCents: paid, paidItems, remainingOpenCents: remaining };
      break;
    }

    case "advanceTime": {
      const minutes = Math.max(0, Math.min(p.minutes || 0, 1440));
      const target = state.gameTime + minutes;
      const log = [];
      advanceTo(state, target, log);
      result = { ok: true, events: log, gameTime: state.gameTime };
      break;
    }

    case "advanceToNextEvent": {
      const pending = state.appointments.find(a => a.status === "pending" && a.appearMin <= state.gameTime);
      if (pending) {
        result = { ok: false, stopped: "decision_required", message: "Es steht eine Einladungsentscheidung offen. Bitte antworte, bevor du zum nächsten Ereignis springst.", appointment: pending.id };
        break;
      }
      const next = earliestEventAfter(state, state.gameTime, state.gameTime + 1440);
      const target = next === null ? state.gameTime + 1440 : next;
      const log = [];
      advanceTo(state, target, log);
      result = { ok: true, events: log, gameTime: state.gameTime, target };
      break;
    }

    case "setTutorialStep": {
      if (typeof p.step === "number") state.tutorial.step = p.step;
      if (p.complete) state.tutorial.active = false;
      result = { ok: true };
      break;
    }

    case "dismissTutorial": {
      state.tutorial.active = false;
      result = { ok: true };
      break;
    }

    // ---------- Tourenketten ----------

    case "planTour": {
      // Rein lesende Vorschau – keine Zustandsänderung, kein Zufall.
      const plan = buildTourPlan(state, {
        vehicleId: p.vehicleId,
        driverId: p.driverId,
        orderIds: p.orderIds || [],
        desiredEndCity: p.desiredEndCity || null,
        latestReturnMin: p.latestReturnMin || null,
      });
      if (plan.error) throw new Error(plan.error);
      result = { ok: true, plan };
      break;
    }

    case "confirmTour": {
      ensureNotBlocked(state);
      const r = doConfirmTour(state, {
        vehicleId: p.vehicleId,
        driverId: p.driverId,
        orderIds: p.orderIds || [],
        desiredEndCity: p.desiredEndCity || null,
        latestReturnMin: p.latestReturnMin || null,
      });
      result = r;
      break;
    }

    case "cancelTour": {
      ensureNotBlocked(state);
      const r = doCancelTour(state, p.tourId);
      result = r;
      break;
    }

    case "findReturnLoads": {
      // Rein lesend – keine Zustandsänderung.
      const r = findReturnLoads(state, p.primaryOrderId, p.vehicleId, p.driverId);
      if (r.error) throw new Error(r.error);
      result = { ok: true, candidates: r.candidates };
      break;
    }

    case "suggestTours": {
      // Rein lesend – keine Zustandsänderung.
      const r = suggestTours(state, {
        vehicleIds: p.vehicleIds,
        earliestStart: p.earliestStart,
        horizonMin: p.horizonMin || 2880,
        desiredEndCity: p.desiredEndCity || null,
        latestReturnMin: p.latestReturnMin || null,
        mode: p.mode || "balanced",
        acceptNew: p.acceptNew !== false,
      });
      result = { ok: true, suggestions: r.suggestions };
      break;
    }

    // ---------- Erfolge & Ziele ----------

    case "attachGoal": {
      const tpl = GOAL_TEMPLATES.find(t => t.id === p.templateId);
      if (!tpl) throw new Error("Zielvorlage nicht gefunden.");
      if ((state.goals || []).length >= 3) throw new Error("Maximal drei Ziele gleichzeitig.");
      if ((state.goals || []).some(g => g.templateId === p.templateId)) throw new Error("Ziel bereits angeheftet.");
      const goal = { id: uid(state, "g"), templateId: p.templateId, title: tpl.title, desc: tpl.desc, attachedAtMin: state.gameTime };
      state.goals.push(goal);
      result = { ok: true, goalId: goal.id };
      break;
    }

    case "removeGoal": {
      const idx = (state.goals || []).findIndex(g => g.id === p.goalId);
      if (idx < 0) throw new Error("Ziel nicht gefunden.");
      state.goals.splice(idx, 1);
      result = { ok: true };
      break;
    }

    case "markAchievementSeen": {
      const ach = (state.achievements || []).find(a => a.id === p.achievementId);
      if (ach) ach.seen = true;
      result = { ok: true };
      break;
    }

    case "markAllAchievementsSeen": {
      for (const a of (state.achievements || [])) a.seen = true;
      result = { ok: true };
      break;
    }

    // ---------- Buchhaltung: Offene Posten & Abschluss ----------

    case "payOpenItem": {
      ensureNotBlocked(state);
      const item = (state.accounting?.openItems || []).find(o => o.id === p.itemId);
      if (!item) throw new Error("Offener Posten nicht gefunden.");
      if (item.remainingCents <= 0) throw new Error("Posten bereits bezahlt.");
      const pay = Math.min(state.company.accountCents, p.amountCents || item.remainingCents);
      if (pay <= 0) throw new Error("Firmenkonto hat keinen ausreichenden Saldo.");
      const r = settleOpenItem(state, item.id, pay);
      result = { ok: true, paidCents: r.paid, remainingCents: r.remaining };
      break;
    }

    case "manualCheckReceipt": {
      ensureNotBlocked(state);
      const rec = (state.accounting?.receipts || []).find(r => r.id === p.receiptId);
      if (!rec) throw new Error("Beleg nicht gefunden.");
      if (rec.status !== "generated") throw new Error("Beleg ist bereits geprüft.");
      const dur = 5;
      const log = [];
      advanceTo(state, state.gameTime + dur, log);
      rec.status = "checked"; rec.checkedAtMin = state.gameTime; rec.checkedBy = "player";
      result = { ok: true, receiptId: rec.id, events: log };
      break;
    }

    case "manualPreparePayment": {
      ensureNotBlocked(state);
      const item = (state.accounting?.openItems || []).find(o => o.id === p.itemId);
      if (!item) throw new Error("Offener Posten nicht gefunden.");
      const dur = 10;
      const log = [];
      advanceTo(state, state.gameTime + dur, log);
      item.paymentPrepared = true;
      result = { ok: true, itemId: item.id, events: log };
      break;
    }

    case "manualClosePeriod": {
      ensureNotBlocked(state);
      const per = (state.accounting?.periods || []).find(pp => pp.id === p.periodId);
      if (!per) throw new Error("Periode nicht gefunden.");
      if (per.status === "closed") throw new Error("Periode bereits abgeschlossen.");
      const dur = 60;
      const log = [];
      advanceTo(state, state.gameTime + dur, log);
      per.status = "closed"; per.closedAtMin = state.gameTime; per.closedBy = "player";
      result = { ok: true, periodId: per.id, events: log };
      break;
    }

    case "closePeriod": {
      const per = (state.accounting?.periods || []).find(pp => pp.id === p.periodId);
      if (!per) throw new Error("Periode nicht gefunden.");
      if (per.status === "closed") throw new Error("Periode bereits abgeschlossen.");
      per.status = "closed"; per.closedAtMin = state.gameTime; per.closedBy = p.actor || "player";
      result = { ok: true, periodId: per.id };
      break;
    }

    // ---------- Postfach ----------

    case "sendMail": {
      const { conversationId, toId, subject, body, intentType } = p;
      if (!body || !body.trim()) throw new Error("Nachrichtentext darf nicht leer sein.");
      if (body.length > 10000) throw new Error("Nachricht darf maximal 10.000 Zeichen haben.");

      let conv = null;
      if (conversationId) {
        conv = (state.mail?.conversations || []).find(c => c.id === conversationId);
        if (!conv) throw new Error("Gespraech nicht gefunden.");
      }

      let recipientId = toId;
      if (conv && !recipientId) {
        recipientId = conv.participantIds.find(id => id !== "player");
      }
      if (!recipientId) throw new Error("Empfaenger erforderlich.");

      const recipient = getPersonInfo(state, recipientId);
      if (!recipient) throw new Error("Empfaenger nicht gefunden.");

      // Intent erkennen
      let intent = null;
      if (intentType) {
        intent = getIntentByType(intentType, recipient.roleKey);
      } else {
        intent = detectIntent(body, { recipientRoleKey: recipient.roleKey });
      }

      // Bei operativer Freigabe: Sperre pruefen
      if (intent && intent.requiresDecision) {
        ensureNotBlocked(state);
      }

      // Nachricht senden
      const msg = deliverMessage(state, {
        fromId: "player",
        toId: recipientId,
        subject: subject || (conv ? "Re: " + conv.subject : "Neue Nachricht"),
        body,
        gameTime: state.gameTime,
        category: conv?.category || "operations",
        priority: "normal",
        conversationId: conv?.id,
        intent,
        status: "delivered",
      });

      // Staff-Task erstellen
      if (intent && intent.createsTask) {
        createStaffTask(state, {
          employeeId: recipientId,
          conversationId: msg.conversationId,
          messageId: msg.id,
          type: intent.type,
          params: { body, conversationId: msg.conversationId, ...extractTaskParams(body, state, conv) },
          earliestProcessMin: state.gameTime + 15,
        });
      } else if (!intent && !recipient.isFormer) {
        createStaffTask(state, {
          employeeId: recipientId,
          conversationId: msg.conversationId,
          messageId: msg.id,
          type: "no_intent",
          params: { body },
          earliestProcessMin: state.gameTime + 15,
        });
      }

      result = { ok: true, messageId: msg.id, conversationId: msg.conversationId, intent };
      break;
    }

    case "saveDraft": {
      const draft = saveDraft(state, p);
      result = { ok: true, draftId: draft.id };
      break;
    }

    case "deleteDraft": {
      deleteDraft(state, p.draftId);
      result = { ok: true };
      break;
    }

    case "markMessageRead": {
      markMessageRead(state, p.messageId, p.read !== false);
      result = { ok: true };
      break;
    }

    case "markConversationRead": {
      markConversationRead(state, p.conversationId);
      result = { ok: true };
      break;
    }

    case "starMessage": {
      starMessage(state, p.messageId, p.starred !== false);
      result = { ok: true };
      break;
    }

    case "archiveMessage": {
      archiveMessage(state, p.messageId, p.archived !== false);
      result = { ok: true };
      break;
    }

    case "exportCorrespondence": {
      const data = exportCorrespondence(state);
      result = { ok: true, export: data };
      break;
    }

    default:
      throw new Error("Unbekannter Befehl: " + command);
  }
  // Erfolgsprüfung nach jedem Befehl (idempotent)
  const finalAchs = checkAchievements(state, state.gameTime);
  if (finalAchs.length && !result.newAchievements) result.newAchievements = finalAchs;
  return { state, result };
}