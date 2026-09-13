// Simulations-Engine für "Spedition & Leben".
// Reine Spielregeln und Zustandsänderungen – keine Auth, keine Speicherung.
// Trennung: gameRules (statische Daten) · simulationEngine (Regeln/Zustand) · gameRepository (Speicherung via Backend-Funktion).

import {
  CITIES, getDistance, mulberry32, INVITATION_TEMPLATES,
  CARGO_TYPES, CUSTOMER_NAMES, STANDARD_TRUCK,
  dayOf, clockOf, formatGameTime, driveMinutes, fuelCents, tollCents,
  LOAD_MIN, UNLOAD_MIN, MAX_DUTY_MIN, REST_MIN, WORK_BUDGET_MIN,
  DRIVER_COST_PER_DAY, BRANCH_COST_PER_DAY, PRIVATE_WITHDRAWAL_PER_DAY, PRIVATE_LIVING_PER_DAY,
  VEHICLE_PRICE, HIRE_FEE, MAINTENANCE_COST, MAINTENANCE_DURATION,
  INVITATION_COST, STRESS_MAINT_THRESHOLD, MAINT_STRESS_FACTOR,
  PERSONNEL_ROLES, SERVICE_START_MIN, SERVICE_END_MIN, SERVICE_INTERVAL_MIN, SHIFT_TEMPLATES,
  APPLICANT_NAMES, PORTRAIT_IDS, NOTICE_PERIOD_MIN,
  computeMarketValue, computeDealerOffer,
} from "./gameRules.ts";
import {
  buildTourPlan, confirmTour as doConfirmTour, cancelTour as doCancelTour,
  processTours, onTripCompleted, findReturnLoads, suggestTours,
  futureLocation, futureDriverLocation
} from "./tourEngine.ts";
import {
  buildPhases, buildWorkSteps, buildEmptyWorkSteps,
  computeFinalCounters, resetCounters, needsRest, migrateTripPhases,
} from "./driverTimeEngine.ts";
import { checkAchievements, migrateState } from "./progressEngine.ts";
import { ACHIEVEMENTS, GOAL_TEMPLATES } from "./achievementCatalog.ts";
import {
  initAccounting, book, bookExpense, postJournal, TEMPLATES, createReceipt,
  addOpenItem, settleOpenItem, registerAsset, disposeAsset,
  calculateDepreciation, processMonthEnd, processAccountant,
  roleExpenseAccount, periodOf, periodStartMin, periodEndMin, MONTH_MIN,
  migrateAccounting, getVehicleBookValue,
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
  takeLoan, earlyRepayLoan, leaseTruck, returnLeasedTruck, buyoutLeasedTruck,
  earlyTerminateLease, processFinancingEvents, getFinancingDueEvents,
  isLeasingOverdueBlocked, computeCreditLimit, checkFinancingAccess,
} from "./financingEngine.ts";
import {
  processReportSchedules, generateDriverDeliveryReport,
  generateEmployeeIntroduction, onOrderAccepted, onTourConfirmed,
  onEmployeeHired, onMaintenanceCompleted, resetDailyStats,
} from "./mailReports.ts";
import {
  previewTermination, terminateEmployee, cancelTermination,
  processEmployeeExit, processReleaseAfterTrip, getTerminationExitEvents,
  isActivelyEmployed, findPerson,
} from "./terminationEngine.ts";
import {
  generateMarketWave, migrateMarket, fillInitialMarket, getMarketStats,
} from "./marketEngine.ts";
import {
  enableAutomation, pauseAutomation, syncToTarget, computeTargetGameMinute,
} from "./timeControlEngine.ts";
import {
  initEvents, migrateEvents, pushEvent, markEventSeen, markAllEventsSeen,
  getRecentEvents, getUnseenEventCount,
} from "./eventLog.ts";
import {
  migrateAbsences, requestVacation, approveVacation, rejectVacation,
  cancelVacation, returnEarlyFromVacation, reportSickness, maybeGenerateSickness,
  processSicknessRecovery, processVacationDayConsumption, isPersonAvailable,
  getVacationAvailable, getVacationAccount, accrueVacationDays, detectAbsenceConflicts,
  getAbsenceCalendar,
} from "./absenceEngine.ts";
import {
  migrateServices, bookCleaning, bookMaintenance, bookTowing, bookTempStaff,
  bookExternalAccounting, bookRentalTruck, cancelService, processServiceContracts,
  processDailyCleaningDecay, processTempStaffBilling, computeCleaningNeed,
  getBranchCleanliness, applyCleaningEffect, SERVICE_PROVIDERS,
} from "./serviceEngine.ts";
import {
  migrateRewards, checkRewardClaims, claimReward, claimAllRewards,
  equipCosmetic, unequipCosmetic, findVoucherForActivity, reserveVoucher,
  consumeVoucher, releaseVoucher, REWARDS, REWARD_SLOTS, SLOT_LABELS,
  getAvailableClaims, getClaimedRewards, getEquippedCosmetics, getVouchers,
} from "./rewardEngine.ts";
import {
  migratePurchases, buyPurchase, sellPurchase, startPrivateActivity,
  cancelPrivateActivity, processDailyMaintenance, updateOwnershipStats,
  PURCHASE_CATALOG, BASIC_ACTIVITIES, getActivityOptions, getActivePurchases,
  getActiveHome, checkPurchaseConditions,
} from "./purchaseEngine.ts";
import {
  migrateWorkshop, buildWorkshopSlot, createMaintenanceOrder,
  cancelMaintenanceOrder, assignMechanic, processWorkshop,
  evaluateWorkshopAutomation, updateAutomationProfile, getWorkshopStatus,
  getWorkshopEventTimes, WORKSHOP_SLOT_PRICE,
} from "./workshopEngine.ts";
import {
  migratePersonnelMarket, initStartApplicants, generatePersonnelWave,
  scheduleDemandWave, expireApplicants, isRegularWaveTime,
  getNextRegularWaveTime, postJob, closeJobPosting, fulfillPosting,
  toggleWatchlist, getPersonnelMarketStatus, computeRoleTargets,
  countAvailableByRole,
} from "./personnelMarketEngine.ts";
import {
  migrateSatisfaction, processDailySatisfaction, processDailyRecovery,
  processTerminationWarnings, getSatisfactionDetail, getTeamClimate,
  payPersonWages, raiseSalary, giveBonus, prepareConversation,
  conductConversation, completeConversation, prepareRetentionConversation,
  conductRetentionConversation, cancelSelfTermination,
} from "./satisfactionEngine.ts";
import {
  migrateTraining, COURSE_CATALOG, getCourseById,
  previewCourseBooking, bookCourse, cancelCourse,
  processCourseEvents, processApprenticeshipEvents,
  getTrainingEventTimes, getTrainingOverview, getTrainingSchedule,
  previewApprenticeship, startApprenticeship,
  takeoverApprentice, releaseApprentice,
  updateAutoRefreshConfig, getAutoRefreshConfig,
  getPersonQualifications, getAllPersonQualifications,
  hasQualification, hasEcoDrive, hasAdrBasic, hasAdrTank,
  hasMaterialEfficiency, hasMentorQualification, hasDgDispatch,
  getEffectiveCapacity, isPersonInTraining,
} from "./trainingEngine.ts";
import {
  migrateDangerousGoods, getDgProfile, getEffectiveLoadMin, getEffectiveUnloadMin,
  validateDgTransport, isTankClean, chargeDgHandlingFee, recordDgDelivery,
  processTankCleaning, getTankCleaningEventTimes,
  processEquipmentJobs, getEquipmentJobEventTimes,
  processInspectionJobs, getInspectionJobEventTimes,
  equipVehicleExternal, equipVehicleInternal,
  bookTankCleaning, buyTankTruck, inspectDgEquipmentExternal,
  getDgStatus, getDgInspectionDueVehicles,
  DG_PROFILES, TANK_TRUCK, TANK_TRUCK_LEASING, TANK_CLEANING_PROVIDERS,
  DG_EQUIP_EXTERNAL_COST_CENTS, DG_EQUIP_INTERNAL_MATERIAL_CENTS,
  DG_INSPECTION_EXTERNAL_COST_CENTS, TANK_CLEANING_COST_CENTS,
  handleDgCommand,
} from "./dangerousGoodsEngine.ts";
import {
  migrateInvestment, processMarketTick, getInvestmentEventTimes,
  handleInvestmentCommand,
} from "./investmentEngine.ts";

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
  "Werkstattbau": "1200", "Wartungsteile": "5300",
};

function addBooking(state, min, cause, amountCents, account, refId) {
  // Legacy-Array für Kompatibilität beibehalten
  state.bookings.push({ min, cause, amountCents, account, refId });
  if (state.bookings.length > 200) state.bookings = state.bookings.slice(-200);
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

// Prüft, ob ein Disponent innerhalb seiner Schicht ist (8-Stunden-Schicht).
// Nachtschichten können über Mitternacht hinausgehen (startMin > endMin).
function isDispatcherOnShift(emp, gameMinute) {
  const clock = gameMinute % 1440;
  const start = emp.shiftStart ?? SERVICE_START_MIN;
  const end = emp.shiftEnd ?? SERVICE_END_MIN;
  if (start <= end) {
    return clock >= start && clock < end;
  } else {
    return clock >= start || clock < end;
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
// createInitialState und initialOffers wurden nach initialStateEngine.ts ausgelagert.
export { createInitialState } from "./initialStateEngine.ts";

// ---------- Tagesabrechnung ----------
function payCost(state, account, amountCents, cause, refId, min, opts) {
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
    employeeId: opts?.employeeId || null,
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
// Alt-Generator entfernt – durch marketEngine.ts ersetzt (Auftrag 19).
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
  // Idempotenz-Sperre: verhindert doppelten Tagesabschluss bei Race-Conditions
  // (z.B. verworfener Sync nach Reload, der Mitternacht erneut verarbeitet).
  if (state.lastDailyAccountingMin === midnight) return [];
  const day = dayOf(midnight);
  const log = [];
  resetDailyStats(state, midnight);
  const drivers = [...state.drivers].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const d of drivers) {
    if (!isActivelyEmployed(d)) continue;
    const r = payCost(state, "company", DRIVER_COST_PER_DAY, "Fahrerlohn: " + d.name, d.id, midnight, { employeeId: d.id });
    log.push({ cause: "Fahrerlohn", driver: d.name, paid: r.paid, unpaid: r.unpaid });
  }
  for (const b of state.branches) {
    const r = payCost(state, "company", BRANCH_COST_PER_DAY, "Standort: " + b.name, b.id, midnight);
    log.push({ cause: "Standort", branch: b.name, paid: r.paid, unpaid: r.unpaid });
  }
  // Löhne für alle Angestellten (nicht fahrende Rollen) – rollenspezifische Konten
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    const causeLabel = emp.role === "dispatcher" || emp.role === "dispatcher_senior" ? "Disposition"
      : emp.role === "cleaner" || emp.role === "mechanic" ? "Reinigung und Werkstatt"
      : emp.role === "accountant" || emp.role === "accountant_senior" ? "Buchhaltung"
      : "Lohn";
    const r = payCost(state, "company", emp.costPerDayCents, causeLabel + ": " + emp.name, emp.id, midnight, { employeeId: emp.id });
    log.push({ cause: causeLabel, employee: emp.name, role: emp.role, paid: r.paid, unpaid: r.unpaid });
  }
  const w = doWithdrawal(state, midnight);
  log.push({ cause: "Private Entnahme", done: w.done, reason: w.reason });
  const l = payCost(state, "private", PRIVATE_LIVING_PER_DAY, "Lebenshaltung", "living", midnight);
  log.push({ cause: "Lebenshaltung", paid: l.paid, unpaid: l.unpaid });
  maybeGenerateInvitation(state, day, midnight);
  // Balance-Serie: Zufriedenheit >=70 und Belastung <=40 am Tagesabschluss
  if (state.private.happiness >= 70 && state.private.stress <= 40) {
    state.stats.consecutiveBalanceDays = (state.stats.consecutiveBalanceDays || 0) + 1;
  } else {
    state.stats.consecutiveBalanceDays = 0;
  }
  state.stats.lastBalanceDay = day;
  state.lastDailyAccountingMin = midnight;
  // Auftrag 30: Zufriedenheitsregeln, Erholung und Kündigungsrisiken
  processDailySatisfaction(state, midnight);
  processDailyRecovery(state, midnight);
  processTerminationWarnings(state, midnight);
  return log;
}

// ---------- Zeitverarbeitung ----------
function earliestEventAfter(state, t, maxMin) {
  let best = null;
  const cand = (m) => { if (m > t && m <= maxMin) { if (best === null || m < best) best = m; } };
  for (const trip of state.trips) {
    if (trip.status === "in_progress" && trip.currentPhase < (trip.phases || []).length) cand(trip.phases[trip.currentPhase].endMin);
  }
  for (const a of state.appointments) {
    if (a.status === "pending") cand(a.decisionDeadline);
    else if (a.status === "accepted") { cand(a.startMin); cand(a.endMin); }
    else if (a.status === "active") cand(a.endMin);
  }
  cand(Math.floor(t / 1440) * 1440 + 1440); // nächste Mitternacht
  cand(Math.floor(t / 60) * 60 + 60); // nächste Marktwelle (volle Stunde)
  cand(Math.floor(t / MONTH_MIN) * MONTH_MIN + MONTH_MIN); // nächste Monatsgrenze
  for (const o of state.orders) { if (o.status === "offered") cand(o.acceptDeadlineMin); }
  if (!state.tutorialInviteCreated) cand(720);
  for (const d of state.drivers) { if (d.status === "resting" && d.restUntil !== null) cand(d.restUntil); }
  for (const v of state.vehicles) { if (v.status === "maintenance" && v.maintenanceUntil !== null) cand(v.maintenanceUntil); }
  // Dienstzeiten für Angestellte (Buchhaltung/Reinigung tagsüber, Disponenten Schicht-basiert)
  const hasNonDriverStaff = (state.employees || []).some(e => e.employmentStatus === "employed" && e.attendance === "present" && e.role !== "driver");
  if (hasNonDriverStaff) {
    const dayStart = Math.floor(t / 1440) * 1440;
    // Buchhaltung, Reinigung etc.: feste Dienstzeiten 08:00–16:00
    for (let st = dayStart + SERVICE_START_MIN; st <= dayStart + SERVICE_END_MIN; st += SERVICE_INTERVAL_MIN) {
      cand(st);
    }
    // Disponenten: Schicht-basierte Zeiten (inkl. Nacht, 2-Tage-Abdeckung für Mitternacht-Überlauf)
    for (const emp of (state.employees || [])) {
      if (emp.role !== "dispatcher" && emp.role !== "dispatcher_senior") continue;
      if (!isActivelyEmployed(emp) || emp.attendance !== "present") continue;
      const sStart = emp.shiftStart ?? SERVICE_START_MIN;
      const sEnd = emp.shiftEnd ?? SERVICE_END_MIN;
      for (let day = 0; day <= 1; day++) {
        const base = dayStart + day * 1440;
        if (sStart <= sEnd) {
          for (let st = base + sStart; st <= base + sEnd; st += SERVICE_INTERVAL_MIN) cand(st);
        } else {
          for (let st = base + sStart; st < base + 1440; st += SERVICE_INTERVAL_MIN) cand(st);
          for (let st = base; st <= base + sEnd; st += SERVICE_INTERVAL_MIN) cand(st);
        }
      }
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
  // Staff-Task-Verarbeitungszeiten (Postfach)
  for (const task of (state.mail?.staffTasks || [])) {
    if (task.status === "pending") cand(task.earliestProcessMin);
  }
  // Finanzierungs-Fälligkeiten (Kredite, Leasing) – Auftrag 17
  for (const dueMin of getFinancingDueEvents(state, t, maxMin)) cand(dueMin);
  // Kündigungs-Austritte (Auftrag 18)
  for (const dueMin of getTerminationExitEvents(state, t, maxMin)) cand(dueMin);
  // Dienstleistungsverträge (Auftrag 25)
  for (const c of (state.serviceContracts || [])) {
    if (c.status === "planned") cand(c.startMin);
    if (c.status === "active" || c.status === "planned") cand(c.endMin);
  }
  // Krankheitsenden (Auftrag 25)
  for (const s of (state.absences?.sicknesses || [])) {
    if (s.status === "active") cand(s.expectedEndMin);
  }
  // Urlaubsbeginn und -ende (Auftrag 25)
  for (const r of (state.absences?.vacationRequests || [])) {
    if (r.status === "approved") { cand(r.startMin); cand(r.endMin); }
  }
  // Werkstatt-Ereignisse (Auftrag 27)
  for (const wt of getWorkshopEventTimes(state, t, maxMin)) cand(wt);
  // Personalmarkt-Wellen (Auftrag 29): regulär 08:00/14:00, bedarfsbezogen
  {
    const nextReg = getNextRegularWaveTime(t);
    if (nextReg <= maxMin) cand(nextReg);
    const nextDemand = state.personnelMarket?.nextDemandWaveMin;
    if (nextDemand && nextDemand > t && nextDemand <= maxMin) cand(nextDemand);
  }
  // Gespräche (Auftrag 30): Endzeit aktiver Gesprächstermine
  for (const a of (state.appointments || [])) {
    if (a.type === "conversation" && a.status === "active" && a.endMin > t && a.endMin <= maxMin) cand(a.endMin);
  }
  // Aus- und Weiterbildung (Auftrag 31): Kursblöcke, Ausbildungen, Ablauf
  for (const tm of getTrainingEventTimes(state, t, maxMin)) cand(tm);
  // Gefahrgut (Auftrag 32): Tankreinigung, Ausrüstung, Spielprüfung
  for (const tm of getTankCleaningEventTimes(state, t, maxMin)) cand(tm);
  for (const tm of getEquipmentJobEventTimes(state, t, maxMin)) cand(tm);
  for (const tm of getInspectionJobEventTimes(state, t, maxMin)) cand(tm);
  // Investment: Order-Ablaufzeiten (Auftrag 33)
  if (state.investment?.market) {
    for (const tm of getInvestmentEventTimes(state, t, maxMin)) cand(tm);
  }
  return best;
}
function completeTrip(state, trip, m, log) {
  trip.status = "completed";
  trip.endMin = m;
  const vehicle = state.vehicles.find(v => v.id === trip.vehicleId);
  const driver = state.drivers.find(d => d.id === trip.driverId);

  // Endstadt aus letzter Fahr-Phase ableiten
  let finalCity = vehicle.locationCity;
  const phases = trip.phases || [];
  for (let i = phases.length - 1; i >= 0; i--) {
    if (phases[i].type === "empty_drive" || phases[i].type === "loaded_drive") {
      finalCity = phases[i].toCity; break;
    }
  }

  vehicle.status = "free"; vehicle.tripId = null; vehicle.locationCity = finalCity;
  vehicle.condition = Math.max(0, vehicle.condition - 1);
  driver.locationCity = finalCity;

  // Fahrer-Zähler aktualisieren (neues Fahrerzeitmodell)
  if (trip.legacyMode) {
    // Alter Trip: pauschale 12h Ruhe wie bisher
    driver.status = "resting"; driver.restUntil = m + REST_MIN;
    driver.workMinutesSinceRest = 0; driver.driveMinutesSinceBreak = 0;
  } else {
    // Neues Modell: Zähler aus Phasen ableiten, Ruhe nur bei erschöpftem Budget
    const counters = computeFinalCounters(phases);
    driver.workMinutesSinceRest = counters.workMin;
    driver.driveMinutesSinceBreak = counters.driveMin;
    if (driver.workMinutesSinceRest >= WORK_BUDGET_MIN) {
      driver.status = "resting"; driver.restUntil = m + REST_MIN;
      driver.workMinutesSinceRest = 0; driver.driveMinutesSinceBreak = 0;
    } else {
      driver.status = "free"; driver.restUntil = null;
    }
  }

  if (trip.type === "empty") {
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
  // Dauerhaftes Lieferungs-Ereignis
  pushEvent(state, {
    type: "delivery_completed",
    gameTime: m, isSystem: true,
    driverId: driver.id, vehicleId: vehicle.id,
    orderIds: [order.id], tourId: trip.tourId || null,
    details: {
      customer: order.customer, fromCity: order.fromCity, toCity: order.toCity,
      cargo: order.cargo, tons: order.tons,
      onTime, paymentCents: payment,
      contributionCents: payment - trip.fuelCents - trip.tollCents,
      tripId: trip.id,
    },
    dedupKey: "delivery_completed:" + trip.id,
  });
  onTripCompleted(state, trip, m, log);
  generateDriverDeliveryReport(state, driver, trip, order, m);
  // Auftrag 32: DG-Lieferung statistisch erfassen
  if (order.isDangerousGoods) {
    recordDgDelivery(state, order, onTime, m);
    pushEvent(state, {
      type: "dg_delivery_completed",
      gameTime: m, isSystem: true,
      driverId: driver.id, vehicleId: vehicle.id,
      orderIds: [order.id],
      details: {
        customer: order.customer, fromCity: order.fromCity, toCity: order.toCity,
        dgClass: order.dgClass, dgTransportType: order.dgTransportType,
        onTime, paymentCents: payment,
      },
      dedupKey: "dg_delivery:" + trip.id,
    });
  }
}
function processEventsAt(state, m, log) {
  // Spielzeit auf Ereigniszeit aktualisieren (startDeployment nutzt state.gameTime)
  state.gameTime = m;
  // 1. Phasenabschlüsse (Fahrt, Pause, Ruhe, Laden, Entladen)
  for (const trip of state.trips) {
    if (trip.status !== "in_progress") continue;
    const phases = trip.phases || [];
    if (trip.currentPhase >= phases.length) continue;
    const phase = phases[trip.currentPhase];
    if (phase.endMin !== m) continue;
    trip.currentPhase++;
    if (phase.type === "empty_drive" || phase.type === "loaded_drive") {
      trip.drivenKm = (trip.drivenKm || 0) + (phase.distanceKm || 0);
      const _veh = state.vehicles.find(v => v.id === trip.vehicleId);
      if (_veh) _veh.odometerKm = (_veh.odometerKm || 0) + (phase.distanceKm || 0);
    }
    log.push({ type: "phase_end", trip: trip.id, phaseType: phase.type, endMin: m });
    if (trip.currentPhase >= phases.length) {
      completeTrip(state, trip, m, log);
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
        if (a.type === "conversation") {
          // Auftrag 30: Gesprächsabschluss
          completeConversation(state, a.conversationId, m);
          // Bleibegespräch: Kündigung zurücknehmen wenn Voraussetzungen erfüllt
          if (a.personId) cancelSelfTermination(state, a.personId, m);
          a.effectsApplied = true;
          log.push({ type: "conversation_completed", appointment: a.id, conversationId: a.conversationId });
        } else if (a.type === "invitation" || a.type === "invitation_ersatz") {
          state.private.relationship = clamp(state.private.relationship + 8, 0, 100);
          state.private.stress = clamp(state.private.stress - 15, 0, 100);
          state.private.happiness = clamp(state.private.happiness + 5, 0, 100);
          state.stats.promisesKept = (state.stats.promisesKept || 0) + 1;
        } else if (a.type === "leisure") {
          // Aktivitaetsspezifische Effekte aus dem Termin anwenden (Auftrag 26)
          const dStress = a.stressDelta !== undefined ? a.stressDelta : -8;
          const dHappy = a.happinessDelta !== undefined ? a.happinessDelta : 2;
          state.private.stress = clamp(state.private.stress + dStress, 0, 100);
          state.private.happiness = clamp(state.private.happiness + dHappy, 0, 100);
          if (a.contactDelta) {
            state.private.relationship = clamp(state.private.relationship + a.contactDelta, 0, 100);
          }
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
  // 3b.1 Tour-Start-Ereignisse aus Log in dauerhaftes Ereignisprotokoll übernehmen
  for (const le of log) {
    if (le.type === "tour_deployment_started" && le.atMin === m) {
      const tour = (state.tours || []).find(t => t.id === le.tour);
      const vehicle = state.vehicles.find(v => v.id === tour?.vehicleId);
      const driver = state.drivers.find(d => d.id === tour?.driverId);
      const dep = tour?.deployments?.find(d => d.id === le.deployment);
      const order = dep?.orderId ? state.orders.find(o => o.id === dep.orderId) : null;
      pushEvent(state, {
        type: "tour_started",
        gameTime: m, isSystem: true,
        tourId: le.tour, vehicleId: tour?.vehicleId, driverId: tour?.driverId,
        orderIds: dep?.orderId ? [dep.orderId] : [],
        details: {
          vehicleLabel: vehicle ? "Lkw " + String(parseInt(String(vehicle.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0") : tour?.vehicleId,
          driverName: driver?.name,
          customer: order?.customer || dep?.customer,
          fromCity: order?.fromCity || dep?.fromCity,
          toCity: order?.toCity || dep?.toCity,
          tripId: le.trip,
        },
        dedupKey: "tour_started:" + le.trip,
      });
    }
  }
  // 3b.2 Ereignisgesteuerte Dispositionsplanung (außerhalb des regulären Diensttakts)
  triggerDispatcherPlanning(state, m, log);
  // 3c. Angestellte verarbeiten (Disponenten Schicht-basiert, Buchhaltung/Reinigung tagsüber)
  if (m % SERVICE_INTERVAL_MIN === 0) {
    processEmployees(state, m, log);
  }
  // 3d. Berichte generieren und Staff-Tasks verarbeiten
  processReportSchedules(state, m, log);
  processStaffTasks(state, m, log);
  // 3e. Finanzierung (Kredite, Leasing) – Auftrag 17
  processFinancingEvents(state, m, log);
  // 3e.2 Freistellung nach Trip-Ende (Auftrag 18)
  processReleaseAfterTrip(state, m, log);
  // 3e.3 Tatsächlicher Austritt bei Fristende (Auftrag 18)
  processEmployeeExit(state, m, log);
  // 4. Tagesabrechnung (Mitternacht)
  if (m % 1440 === 0 && m > 0) {
    const dlog = doDailyAccounting(state, m);
    log.push({ type: "daily_accounting", min: m, details: dlog });
    // Auftrag 25: Krankheitsgenerator, Urlaubsverbrauch, Sauberkeitsverlust
    maybeGenerateSickness(state, m);
    processVacationDayConsumption(state, m);
    processDailyCleaningDecay(state, m);
    // Auftrag 26: Taeglicher Unterhalt fuer Anschaffungen
    processDailyMaintenance(state, m);
  }
  // Auftrag 25: Krankheitsgenesung und Dienstleistungsverarbeitung bei jedem Ereignis
  processSicknessRecovery(state, m);
  processServiceContracts(state, m, log);
  processTempStaffBilling(state, m, log);
  // Auftrag 27: Werkstatt-Verarbeitung und Automatik
  processWorkshop(state, m, log);
  evaluateWorkshopAutomation(state, m, log);
  // Auftrag 29: Personalmarkt-Wellen und Ablauf
  if (isRegularWaveTime(m)) {
    generatePersonnelWave(state, m, log, false);
  }
  if (state.personnelMarket?.nextDemandWaveMin === m) {
    generatePersonnelWave(state, m, log, true);
    state.personnelMarket.nextDemandWaveMin = null;
  }
  expireApplicants(state, m, log);
  // Auftrag 31: Aus- und Weiterbildung – Kursblöcke, Ausbildungen, Ablauf
  processCourseEvents(state, m, log);
  processApprenticeshipEvents(state, m, log);
  // Auftrag 32: Gefahrgut – Tankreinigung, Ausrüstung, Spielprüfung
  processTankCleaning(state, m, log);
  processEquipmentJobs(state, m, log);
  processInspectionJobs(state, m, log);
  // 4b. Monatswechsel (Abschreibung, Periodenabschluss)
  if (m % MONTH_MIN === 0 && m > 0) {
    calculateDepreciation(state, m);
    processMonthEnd(state, m, log);
  }
  // 5. Angebotsablauf
  for (const o of state.orders) { if (o.status === "offered" && o.acceptDeadlineMin === m) { o.status = "expired"; log.push({ type: "order_expired", order: o.id }); } }
  // 5b. Marktwelle zu jeder vollen Spielstunde (Auftrag 19)
  if (m % 60 === 0) {
    generateMarketWave(state, m, log);
    // Investment-Markt-Tick bei jeder vollen Stunde (Auftrag 33)
    if (state.investment?.market) {
      processMarketTick(state, m, log);
    }
  }
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
  // 7. Erfolgsprüfung und Belohnungsansprueche: Nur noch am Ende von
  // applyCommand (siehe unten), nicht mehr nach jedem einzelnen Ereignis.
  // Beide sind idempotent und checkAchievements ruft computeCompanyValue auf,
  // das alle Fahrzeuge/Anlagen iteriert — bei der Zeitautomatik mit vielen
  // Ereignissen pro Tick war das der CPU-Flaschenhals.
}
function advanceTo(state, targetMin, log) {
  let t = state.gameTime;
  // CPU-Schutz: begrenzt Verarbeitungsdauer und Ereignisanzahl pro Aufruf.
  // Verhindert cpu-exceeded bei sehr langen Zeit-Sprüngen oder vielen Ereignissen.
  // Bei vorzeitigem Abbruch wird gameTime auf die letzte verarbeitete Minute gesetzt;
  // der nächste Tick/Sync setzt ab dort fort.
  const startTime = Date.now();
  const CPU_BUDGET_MS = 12000; // 12 s — Puffer unter dem Plattform-Limit
  const MAX_EVENTS = 500;
  let eventCount = 0;
  let stopped = false;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (eventCount >= MAX_EVENTS || Date.now() - startTime > CPU_BUDGET_MS) { stopped = true; break; }
    const next = earliestEventAfter(state, t, targetMin);
    if (next === null) break;
    processEventsAt(state, next, log);
    t = next;
    eventCount++;
  }
  state.gameTime = stopped ? t : targetMin;
  if (stopped) log.push({ type: "advance_stopped", atMin: t, targetMin, reason: eventCount >= MAX_EVENTS ? "max_events" : "cpu_budget" });
}

// ---------- Dispositionsplanung ----------
function planTrip(state, order, vehicle, driver) {
  const workSteps = buildWorkSteps(vehicle.locationCity, order);
  const counters = {
    workMin: driver.workMinutesSinceRest || 0,
    driveMin: driver.driveMinutesSinceBreak || 0,
  };
  const result = buildPhases(workSteps, counters, state.gameTime);
  const totalKm = workSteps.reduce((s, step) => s + (step.distanceKm || 0), 0);
  return { phases: result.phases, totalKm, totalDuration: result.endMin - state.gameTime, endMin: result.endMin };
}

// ---------- Angestellten-Verarbeitung ----------
// Wird an Dienstzeitpunkten (08:00–16:00, alle 60 min) aufgerufen.
// Disponenten erstellen Vorschläge (Modus A), disponieren (Modus B/C).
// Reinigung, Werkstatt, Buchhaltung folgen in Etappe 2.
function processEmployees(state, m, log) {
  const clock = m % 1440;
  const inServiceHours = clock >= SERVICE_START_MIN && clock < SERVICE_END_MIN;
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    if (emp.attendance !== "present") continue;
    if (emp.role === "dispatcher" || emp.role === "dispatcher_senior") {
      if (!isDispatcherOnShift(emp, m)) continue;
      processDispatcher(state, emp, m, log);
    } else if (inServiceHours && (emp.role === "accountant" || emp.role === "accountant_senior")) {
      processAccountant(state, emp, m, log);
    }
  }
}

// Disponent verarbeitet seine zugewiesenen Lkw.
// Modus A: erstellt Vorschläge für freie Fahrzeuge mit angenommenen Aufträgen.
// Modus B/C: nutzt suggestTours für flottenweite Planung mit Erholung, Rückladungen,
//   Liquiditätsprüfung und Rentabilitätsfilter. Berücksichtigt auch ruhende Fahrer
//   und zurückkehrende Fahrzeuge über earliestAvailable.
function processDispatcher(state, emp, m, log) {
  // Firmenpool: Alle nicht verkauften, nicht vorgemerkten Fahrzeuge.
  // Disponenten teilen sich den Pool — verschiedene Schichten können
  // nacheinander auf dieselben Lkw zugreifen (24/7-Betrieb).
  const poolVehicles = state.vehicles.filter(v =>
    v.status !== "sold" && v.status !== "archived" && !v.markedForSale
  );
  const poolVehicleIds = poolVehicles.map(v => v.id);
  if (poolVehicles.length === 0) {
    if ((emp.suggestions || []).length > 0) {
      emp.suggestions = [];
      log.push({ type: "dispatcher_suggestions_cleared", employee: emp.id, atMin: m, reason: "keine Lkw im Firmenpool" });
    }
    return;
  }

  // ---------- Modus A: Vorschläge vorbereiten ----------
  if (emp.workMode === "suggestions") {
    const hasAcceptedOrders = state.orders.some(o => o.status === "angenommen");
    const hasFreeVehicles = poolVehicles.some(v => v.status === "free" || v.status === "resting");
    if (!hasAcceptedOrders || !hasFreeVehicles) {
      if ((emp.suggestions || []).length > 0) {
        emp.suggestions = [];
        log.push({ type: "dispatcher_suggestions_cleared", employee: emp.id, atMin: m, reason: "keine Aufträge oder freie Fahrzeuge" });
      }
      return;
    }
    const existingValid = (emp.suggestions || []).filter(s => s.status === "pending");
    if (existingValid.length > 0) {
      if (!hasSituationChanged(state, emp, existingValid)) return;
    }
    const result = suggestTours(state, {
      vehicleIds: poolVehicleIds, earliestStart: m, horizonMin: 2880,
      desiredEndCity: null, latestReturnMin: null, mode: state.marketPriority || "balanced", acceptNew: false,
    });
    emp.suggestions = (emp.suggestions || []).filter(s => s.status !== "pending");
    for (const s of result.suggestions) {
      const sug = {
        id: uid(state, "sug"), employeeId: emp.id, employeeName: emp.name, createdAtMin: m,
        vehicleId: s.vehicleId, driverId: s.driverId, orderIds: s.orderIds, plan: s.plan, status: "pending",
      };
      emp.suggestions.push(sug);
      log.push({ type: "dispatcher_suggestion", employee: emp.id, suggestion: sug.id, vehicle: s.vehicleId, atMin: m });
    }
    emp.lastDecisionMin = m;
    return;
  }

  // ---------- Modus B/C: flottenweite Planung mit suggestTours ----------
  const acceptNew = emp.workMode === "autonomous";
  // Prüfe, ob es angenommene Aufträge gibt, die noch nicht Teil einer
  // aktiven Tour sind (verhindert unnötige Planversuche).
  const hasUnplannedAccepted = state.orders.some(o =>
    o.status === "angenommen" &&
    !state.trips.some(t => t.orderId === o.id && t.status === "in_progress") &&
    !(state.tours || []).some(t => t.status === "active" && (t.deployments || []).some(d => d.orderId === o.id && d.status !== "cancelled"))
  );
  const hasOfferedOrders = acceptNew && state.orders.some(o => o.status === "offered" && o.acceptDeadlineMin > m);
  if (!hasUnplannedAccepted && !hasOfferedOrders) {
    emp.lastIdleReason = acceptNew ? "Keine Aufträge auf dem Markt" : "Keine angenommenen Aufträge – autonomer Modus nötig";
    emp.lastIdleReasonAtMin = m;
    return;
  }

  // suggestTours berücksichtigt auch ruhende Fahrer und zurückkehrende Fahrzeuge
  const result = suggestTours(state, {
    vehicleIds: poolVehicleIds, earliestStart: m, horizonMin: 48 * 60,
    desiredEndCity: null, latestReturnMin: null, mode: state.marketPriority || "balanced", acceptNew,
  });

  const usedVehicleIds = new Set();
  const usedOrderIds = new Set();
  let planned = 0;

  // Kapazität: Mindestens so viele Touren wie Fahrzeuge im Pool, damit ein
  // Disponent die gesamte Flotte in einem Zyklus verplanen kann (24/7-Betrieb).
  const capacity = Math.max(emp.capacity || 6, poolVehicles.length);
  for (const sug of result.suggestions) {
    if (planned >= capacity) break;
    if (usedVehicleIds.has(sug.vehicleId)) continue;
    // Aufträge noch verfügbar?
    const allAvailable = sug.orderIds.every(oid => {
      if (usedOrderIds.has(oid)) return false;
      const o = state.orders.find(x => x.id === oid);
      if (!o || (o.status !== "offered" && o.status !== "angenommen")) return false;
      // Prüfe, ob der Auftrag bereits Teil einer aktiven Tour ist (verhindert
      // Doppelbuchung bei Pool-Modell: mehrere Disponenten könnten denselben
      // Auftrag sehen, wenn die Tour-Deployment-Zeit in der Zukunft liegt).
      if ((state.tours || []).some(t => t.status === "active" && (t.deployments || []).some(d => d.orderId === oid && d.status !== "cancelled"))) return false;
      return true;
    });
    if (!allAvailable) continue;
    // Rentabilitätsprüfung: Nur positive Beiträge bei Neuaufträgen
    const newOrderIds = sug.plan.acceptedOrderIds || [];
    if (newOrderIds.length > 0 && sug.plan.totalContributionCents <= 0) continue;
    // DG-Annahmeprüfung (Auftrag 32): dispo_dg erforderlich
    if (sug.orderIds.some(oid => state.orders.find(x => x.id === oid)?.isDangerousGoods) && !hasDgDispatch(state, emp.id)) continue;

    try {
      const r = doConfirmTour(state, {
        vehicleId: sug.vehicleId, driverId: sug.driverId, orderIds: sug.orderIds,
        desiredEndCity: sug.plan.desiredEndCity || null, latestReturnMin: sug.plan.latestReturnMin || null,
      });
      usedVehicleIds.add(sug.vehicleId);
      sug.orderIds.forEach(oid => usedOrderIds.add(oid));
      planned++;
      const vehicle = state.vehicles.find(v => v.id === sug.vehicleId);
      const driver = state.drivers.find(d => d.id === sug.driverId);
      // Auftragsmetadaten aktualisieren und Annahme-Ereignisse erzeugen
      const newlyAccepted = r.acceptedOrderIds || [];
      for (const oid of sug.orderIds) {
        const o = state.orders.find(x => x.id === oid);
        if (!o) continue;
        // Bei neu angenommenen Aufträgen: acceptedById setzen und Mail erzeugen
        if (newlyAccepted.includes(oid)) {
          o.acceptedById = emp.id; o.acceptedByName = emp.name;
          o.history = o.history || [];
          o.history.push({ type: "accepted", min: m, actor: emp.id, actorName: emp.name });
          onOrderAccepted(state, o, emp.id, m);
          pushEvent(state, {
            type: "order_accepted_by_dispatcher",
            gameTime: m, employeeId: emp.id, employeeName: emp.name, portraitId: emp.portraitId,
            orderIds: [oid], tourId: r.tourId, vehicleId: sug.vehicleId, driverId: sug.driverId,
            details: {
              customer: o.customer, fromCity: o.fromCity, toCity: o.toCity,
              cargo: o.cargo, tons: o.tons, paymentCents: o.paymentCents,
              deliveryDeadlineMin: o.deliveryDeadlineMin,
            },
            dedupKey: "order_accepted:" + oid + ":" + emp.id,
          });
        }
        o.plannedById = emp.id; o.plannedByName = emp.name;
        o.history = o.history || [];
        o.history.push({ type: "planned", min: m, actor: emp.id, actorName: emp.name, details: { vehicleId: sug.vehicleId, driverId: sug.driverId } });
      }
      // Planungs-Ereignis erzeugen
      const primaryOrder = state.orders.find(x => x.id === sug.orderIds[0]);
      pushEvent(state, {
        type: "tour_planned_by_dispatcher",
        gameTime: m, employeeId: emp.id, employeeName: emp.name, portraitId: emp.portraitId,
        orderIds: sug.orderIds, tourId: r.tourId, vehicleId: sug.vehicleId, driverId: sug.driverId,
        details: {
          vehicleLabel: vehicle ? "Lkw " + String(parseInt(String(vehicle.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0") : sug.vehicleId,
          driverName: driver ? driver.name : sug.driverId,
          startMin: m, endMin: r.endMin || m,
          totalContributionCents: sug.plan.totalContributionCents,
          totalKm: sug.plan.totalKm,
          customer: primaryOrder?.customer,
          fromCity: primaryOrder?.fromCity,
          toCity: primaryOrder?.toCity,
          paymentCents: primaryOrder?.paymentCents,
        },
        dedupKey: "tour_planned:" + r.tourId + ":" + emp.id,
      });
      // Tagesstatistik
      emp.dailyStats = emp.dailyStats || { day: dayOf(m), offersChecked: 0, ordersAccepted: 0, ordersPlanned: 0, toursStarted: 0 };
      if (emp.dailyStats.day !== dayOf(m)) emp.dailyStats = { day: dayOf(m), offersChecked: 0, ordersAccepted: 0, ordersPlanned: 0, toursStarted: 0 };
      if (acceptNew) {
        for (const oid of newlyAccepted) {
          emp.dailyStats.ordersAccepted = (emp.dailyStats.ordersAccepted || 0) + 1;
        }
      }
      emp.dailyStats.ordersPlanned = (emp.dailyStats.ordersPlanned || 0) + 1;
      emp.dailyStats.toursStarted = (emp.dailyStats.toursStarted || 0) + 1;
      // Mail-Benachrichtigung
      const tour = r.tour || { id: r.tourId, vehicleId: sug.vehicleId, driverId: sug.driverId, orderIds: sug.orderIds, startMin: m, endMin: r.endMin };
      onTourConfirmed(state, tour, emp.id, m);
      log.push({ type: "dispatcher_planned", employee: emp.id, orders: sug.orderIds, vehicle: sug.vehicleId, atMin: m, contributionCents: sug.plan.totalContributionCents });
    } catch (e) {
      log.push({ type: "dispatcher_plan_failed", employee: emp.id, orders: sug.orderIds, error: e.message, atMin: m });
    }
  }

  // Stillstandsgründe für ungenutzte Fahrzeuge dokumentieren.
  // Unterscheidet: Unterwegs, Wartung, kein Fahrer, kein profitabler
  // Auftrag, Bestätigung fehlgeschlagen, keine Aufträge.
  const suggestedVehicleIds = new Set(result.suggestions.map(s => s.vehicleId));
  for (const v of poolVehicles) {
    if (usedVehicleIds.has(v.id)) { v.idleReason = null; continue; }
    if (v.status === "on_trip") { v.idleReason = "Unterwegs"; continue; }
    if (v.status === "maintenance") { v.idleReason = "Wartung bis " + formatGameTime(v.maintenanceUntil); continue; }
    let reason = "Kein geeigneter Auftrag gefunden";
    if (v.condition < 20) {
      reason = "Zustand unter 20 – Wartung erforderlich";
    } else if (suggestedVehicleIds.has(v.id)) {
      // Fahrzeug war in den Vorschlägen, aber Bestätigung ist fehlgeschlagen
      reason = "Tour-Bestätigung fehlgeschlagen";
    } else {
      // Fahrzeug war nicht in den Vorschlägen — Ursache ermitteln
      const futureCity = futureLocation(state, v);
      const hasDriverAtLocation = state.drivers.some(d =>
        d.employmentStatus === "employed" &&
        d.attendance !== "released" &&
        (d.status === "free" || d.status === "resting" || d.status === "on_trip") &&
        futureDriverLocation(state, d) === futureCity
      );
      if (!hasDriverAtLocation) {
        const driverCount = state.drivers.filter(d => d.employmentStatus === "employed" && d.attendance !== "released").length;
        reason = driverCount === 0
          ? "Keine Fahrer eingestellt"
          : "Kein Fahrer am Standort " + v.locationCity + " (oder Zeitversatz)";
      } else if (!hasUnplannedAccepted && !hasOfferedOrders) {
        reason = acceptNew ? "Keine (profitablen) Aufträge verfügbar" : "Keine angenommenen Aufträge – autonomer Modus oder manuelle Annahme nötig";
      } else {
        reason = "Kein profitabler Auftrag gefunden";
      }
    }
    v.idleReason = reason;
    v.idleReasonAtMin = m;
  }
  emp.lastDecisionMin = m;
  emp.lastPlanningResult = { atMin: m, planned, totalVehicles: poolVehicles.length, usedVehicles: usedVehicleIds.size, suggested: result.suggestions.length };
}

// Ereignisgesteuerte Dispositionsplanung: ruft processDispatcher für alle
// autonomen/disponierenden Disponenten außerhalb des regulären Diensttakts auf.
// Vermeidet Doppelverarbeitung in derselben Spielminute.
function triggerDispatcherPlanning(state, m, log) {
  const clock = m % 1440;
  if (clock % SERVICE_INTERVAL_MIN === 0) return; // Bereits durch processEmployees abgedeckt
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    if (emp.attendance !== "present") continue;
    if (emp.role !== "dispatcher" && emp.role !== "dispatcher_senior") continue;
    if (emp.workMode !== "autonomous" && emp.workMode !== "dispatch_accepted") continue;
    if (!isDispatcherOnShift(emp, m)) continue;
    // CPU-Schutz: höchstens alle 15 Spielminuten pro Disponent.
    if (m - (emp.lastDecisionMin || 0) < 15) continue;
    processDispatcher(state, emp, m, log);
  }
}

// Prüft, ob sich die Situation seit der letzten Vorschlagserstellung geändert hat.
function hasSituationChanged(state, emp, existingSuggestions) {
  const acceptedOrders = state.orders.filter(o => o.status === "angenommen");
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
  migrateAbsences(state);
  migrateServices(state);
  migrateRewards(state);
  migratePurchases(state);
  migrateWorkshop(state);
  migratePersonnelMarket(state);
  migrateTraining(state);
  migrateDangerousGoods(state);
  migrateInvestment(state);
  if (state.bookings && state.bookings.length > 200) state.bookings = state.bookings.slice(-200);
  // Historie begrenzen: abgeschlossene Touren, Aufträge und Termine älter als 30 Tage
  // entfernen. Hält den Zustand kompakt und beschleunigt Laden/Speichern bei langen Spielen.
  // Aktive/offene Einträge bleiben erhalten; die 30-Tage-Fenster reichen für Trends aus.
  {
    const cutoff = state.gameTime - 30 * 1440;
    if (Array.isArray(state.trips) && state.trips.length > 100) {
      state.trips = state.trips.filter(t =>
        t.status === "in_progress" || (t.endMin != null ? t.endMin : t.startMin) > cutoff
      );
    }
    if (Array.isArray(state.orders) && state.orders.length > 100) {
      state.orders = state.orders.filter(o => {
        if (o.status === "offered" || o.status === "angenommen" || o.status === "unterwegs") return true;
        const ref = o.deliveredAtMin || o.acceptDeadlineMin || o.acceptedAtMin || 0;
        return ref > cutoff;
      });
    }
    if (Array.isArray(state.appointments) && state.appointments.length > 50) {
      state.appointments = state.appointments.filter(a => {
        if (a.status === "pending" || a.status === "accepted" || a.status === "active") return true;
        return (a.endMin || 0) > cutoff;
      });
    }
  }
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

    case "setMarketPriority": {
      const valid = ["balanced", "high_margin", "low_empty"];
      if (!valid.includes(p.priority)) throw new Error("Ungültige Priorität: " + p.priority);
      state.marketPriority = p.priority;
      result = { ok: true, marketPriority: state.marketPriority };
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
      if (!isActivelyEmployed(d)) throw new Error("Dieser Fahrer ist nicht mehr aktiv beschäftigt.");
      if (d.attendance === "released") throw new Error("Dieser Fahrer wurde freigestellt und ist nicht für neue Touren verfügbar.");
      if (v.condition < 20) throw new Error("Fahrzeugzustand zu schlecht für einen Einsatz (unter 20). Wartung erforderlich.");
      if (d.restUntil !== null && d.restUntil > state.gameTime) throw new Error("Fahrer ist noch in der Erholung (bis " + formatGameTime(d.restUntil) + ").");
      if (isLeasingOverdueBlocked(state, v.id)) throw new Error("Leasingrückstand: Neue Touren mit diesem Fahrzeug sind gesperrt.");
      if (v.locationCity !== d.locationCity) throw new Error("Fahrer und Lkw befinden sich an unterschiedlichen Orten.");
      if (o.tons > v.capacityTons) throw new Error("Überladung: " + o.tons + " t überschreiten Kapazität von " + v.capacityTons + " t.");
      const plan = planTrip(state, o, v, d);
      // DG-Validierung (Auftrag 32)
      if (o.isDangerousGoods) {
        const dgCheck = validateDgTransport(state, o, v, d, plan.endMin);
        if (!dgCheck.ok) {
          throw new Error("Gefahrgut-Prüfung fehlgeschlagen: " + dgCheck.errors.map(e => e.reason).join("; "));
        }
      }
      // Kein MAX_DUTY_MIN-Ablehnungsgrund mehr — lange Aufträge sind mit Pausen/Ruhe ausführbar
      const fuel = fuelCents(plan.totalKm, v.consumptionPer100km);
      const toll = tollCents(plan.totalKm);
      const totalCost = fuel + toll;
      if (state.company.accountCents < totalCost) throw new Error("Firmenkonto reicht für Kraftstoff und Maut (" + (totalCost / 100).toFixed(2) + " €) nicht aus.");
      addBooking(state, state.gameTime, "Kraftstoff: " + o.customer, -fuel, "company", "fuel:" + o.id);
      addBooking(state, state.gameTime, "Maut: " + o.customer, -toll, "company", "toll:" + o.id);
      const trip = {
        id: uid(state, "t"), type: "loaded", orderId: o.id, vehicleId: v.id, driverId: d.id,
        phases: plan.phases, currentPhase: 0, startMin: state.gameTime, endMin: plan.endMin,
        status: "in_progress", paymentCents: o.paymentCents, fuelCents: fuel, tollCents: toll,
        totalKm: plan.totalKm, drivenKm: 0,
      };
      state.trips.push(trip);
      v.status = "on_trip"; v.tripId = trip.id;
      d.status = "on_trip";
      o.status = "unterwegs"; o.startedAtMin = state.gameTime;
      // DG-Abwicklungsgebühr beim Ladungsbeginn (Auftrag 32)
      if (o.isDangerousGoods) chargeDgHandlingFee(state, o, trip.id);
      o.plannedById = "player"; o.plannedByName = state.private.playerName;
      o.history = o.history || [];
      o.history.push({ type: "planned", min: state.gameTime, actor: "player", actorName: state.private.playerName, details: { vehicleId: v.id, driverId: d.id, startMin: state.gameTime, endMin: plan.endMin, fuelCents: fuel, tollCents: toll } });
      o.history.push({ type: "started", min: state.gameTime, actor: "player", actorName: state.private.playerName, details: { tripId: trip.id, vehicleId: v.id, driverId: d.id } });
      if (state.tutorial.active && state.tutorial.step === 1) state.tutorial.step = 2;
      result = { ok: true, tripId: trip.id, fuelCents: fuel, tollCents: toll, totalKm: plan.totalKm, endMin: plan.endMin, phases: plan.phases };
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
      const workSteps = buildEmptyWorkSteps(p.fromCity, p.toCity);
      const counters = { workMin: d.workMinutesSinceRest || 0, driveMin: d.driveMinutesSinceBreak || 0 };
      const phaseResult = buildPhases(workSteps, counters, state.gameTime);
      const dist = getDistance(p.fromCity, p.toCity);
      const fuel = fuelCents(dist, v.consumptionPer100km);
      const toll = tollCents(dist);
      if (state.company.accountCents < fuel + toll) throw new Error("Firmenkonto reicht für Kraftstoff und Maut nicht aus.");
      addBooking(state, state.gameTime, "Kraftstoff (Leerfahrt)", -fuel, "company", "emptyfuel");
      addBooking(state, state.gameTime, "Maut (Leerfahrt)", -toll, "company", "emptytoll");
      const trip = {
        id: uid(state, "t"), type: "empty", orderId: null, vehicleId: v.id, driverId: d.id,
        phases: phaseResult.phases, currentPhase: 0, startMin: state.gameTime, endMin: phaseResult.endMin,
        status: "in_progress", paymentCents: 0, fuelCents: fuel, tollCents: toll, totalKm: dist, drivenKm: 0,
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
        locationCity: "Hamburg", status: "free", tripId: null, maintenanceUntil: null,
        ownership_type: "owned", odometerKm: 0, acquiredAtMin: state.gameTime, referencePriceCents: VEHICLE_PRICE,
        markedForSale: false, saleOffer: null,
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

    // ---------- Fahrzeugverkauf (Auftrag 21) ----------

    case "previewSale": {
      const v = state.vehicles.find(x => x.id === p.vehicleId);
      if (!v) throw new Error("Fahrzeug nicht gefunden.");
      if ((v.ownership_type || "owned") !== "owned") throw new Error("Nur eigene Fahrzeuge können verkauft werden.");
      if (v.status === "archived" || v.status === "sold") throw new Error("Fahrzeug ist nicht mehr im aktiven Bestand.");
      const bookValue = getVehicleBookValue(state, v.id);
      const marketValue = computeMarketValue(v, state.gameTime);
      const dealerOffer = computeDealerOffer(v, state.gameTime);
      const gainLoss = dealerOffer - bookValue;
      const activeTrip = state.trips.find(t => t.vehicleId === v.id && t.status === "in_progress");
      const futureTours = (state.tours || []).filter(t => t.status === "active" && (t.deployments || []).some(d => d.vehicleId === v.id && d.status === "planned"));
      const assignedDispatchers = (state.employees || []).filter(e =>
        (e.assignedVehicleIds || []).includes(v.id));
      result = {
        ok: true,
        vehicleId: v.id,
        bookValueCents: bookValue,
        marketValueCents: marketValue,
        dealerOfferCents: dealerOffer,
        gainLossCents: gainLoss,
        isGain: gainLoss >= 0,
        canSellImmediately: v.status === "free" && !activeTrip,
        activeTrip: activeTrip ? { id: activeTrip.id, endMin: activeTrip.endMin } : null,
        futureTours: futureTours.map(t => ({ id: t.id, startMin: t.deployments?.[0]?.startMin })),
        assignedDispatchers: assignedDispatchers.map(e => ({ id: e.id, name: e.name })),
        markedForSale: v.markedForSale || false,
        saleOffer: v.saleOffer || null,
        locationCity: v.locationCity,
        condition: v.condition,
        odometerKm: v.odometerKm || 0,
      };
      break;
    }

    case "requestSaleOffer": {
      ensureNotBlocked(state);
      const v = state.vehicles.find(x => x.id === p.vehicleId);
      if (!v) throw new Error("Fahrzeug nicht gefunden.");
      if ((v.ownership_type || "owned") !== "owned") throw new Error("Nur eigene Fahrzeuge können verkauft werden.");
      if (v.status === "archived" || v.status === "sold") throw new Error("Fahrzeug ist nicht mehr im aktiven Bestand.");
      const dealerOffer = computeDealerOffer(v, state.gameTime);
      v.saleOffer = {
        priceCents: dealerOffer,
        validUntilMin: state.gameTime + 24 * 60,
        odometerKm: v.odometerKm || 0,
        condition: v.condition,
        gameTime: state.gameTime,
      };
      result = { ok: true, vehicleId: v.id, saleOffer: v.saleOffer };
      break;
    }

    case "markForSale": {
      ensureNotBlocked(state);
      const v = state.vehicles.find(x => x.id === p.vehicleId);
      if (!v) throw new Error("Fahrzeug nicht gefunden.");
      if ((v.ownership_type || "owned") !== "owned") throw new Error("Nur eigene Fahrzeuge können zum Verkauf vorgemerkt werden.");
      if (v.status === "archived" || v.status === "sold") throw new Error("Fahrzeug ist nicht mehr im aktiven Bestand.");
      v.markedForSale = true;
      // Aus Disponenten-Zuweisungen entfernen
      for (const emp of (state.employees || [])) {
        if (emp.assignedVehicleIds) {
          emp.assignedVehicleIds = emp.assignedVehicleIds.filter(vid => vid !== v.id);
        }
      }
      result = { ok: true, vehicleId: v.id, markedForSale: true };
      break;
    }

    case "unmarkForSale": {
      ensureNotBlocked(state);
      const v = state.vehicles.find(x => x.id === p.vehicleId);
      if (!v) throw new Error("Fahrzeug nicht gefunden.");
      v.markedForSale = false;
      result = { ok: true, vehicleId: v.id, markedForSale: false };
      break;
    }

    case "sellVehicle": {
      ensureNotBlocked(state);
      const v = state.vehicles.find(x => x.id === p.vehicleId);
      if (!v) throw new Error("Fahrzeug nicht gefunden.");
      if ((v.ownership_type || "owned") !== "owned") throw new Error("Nur eigene Fahrzeuge können verkauft werden.");
      if (v.status === "archived" || v.status === "sold") throw new Error("Fahrzeug wurde bereits verkauft oder archiviert.");
      // Fahrzeug muss frei sein (nicht auf Tour, nicht in Wartung, nicht ladend/entladend)
      if (v.status === "on_trip") throw new Error("Fahrzeug ist auf Tour. Vormerken möglich, Verkauf erst nach Tourende.");
      if (v.status === "maintenance") throw new Error("Fahrzeug ist in Wartung. Verkauf erst nach Wartungsende.");
      // Verbindliches Angebot prüfen oder neu erstellen
      let offerPrice;
      if (v.saleOffer && v.saleOffer.validUntilMin >= state.gameTime) {
        // Angebot noch gültig – eingefrorener Preis
        offerPrice = v.saleOffer.priceCents;
      } else {
        // Kein gültiges Angebot – neu berechnen
        offerPrice = computeDealerOffer(v, state.gameTime);
      }
      // Buchwert aus Anlagenverzeichnis
      const bookValue = getVehicleBookValue(state, v.id);
      // Anlagenabgang mit Abschreibung bis Abgang
      const asset = (state.accounting?.assets || []).find(a => a.vehicleId === v.id && a.disposedAtMin === null);
      if (asset) {
        disposeAsset(state, asset.id, offerPrice);
      } else {
        // Fallback: direkte Buchung ohne Anlagenverzeichnis
        const gain = offerPrice - bookValue;
        postJournal(state, {
          text: "Anlagenverkauf: " + v.id, type: "asset_disposal", gameTime: state.gameTime,
          actor: "player", vehicleId: v.id,
          lines: [
            { account: "1000", debit: offerPrice },
            { account: "1200", credit: bookValue },
            ...(gain > 0 ? [{ account: "4200", credit: gain }] : []),
            ...(gain < 0 ? [{ account: "5510", debit: -gain }] : []),
          ],
        });
      }
      // Fahrzeug als verkauft markieren (nicht löschen – Historie bleibt)
      v.status = "sold";
      v.soldAtMin = state.gameTime;
      v.salePriceCents = offerPrice;
      v.saleOffer = null;
      v.markedForSale = false;
      // Aus Disponenten-Zuweisungen entfernen
      for (const emp of (state.employees || [])) {
        if (emp.assignedVehicleIds) {
          emp.assignedVehicleIds = emp.assignedVehicleIds.filter(vid => vid !== v.id);
        }
      }
      // Zukünftige geplante Touren für dieses Fahrzeug stornieren
      for (const tour of (state.tours || [])) {
        if (tour.status !== "active") continue;
        for (const dep of (tour.deployments || [])) {
          if (dep.vehicleId === v.id && dep.status === "planned") {
            dep.status = "cancelled";
            dep.cancelReason = "vehicle_sold";
          }
        }
      }
      // Bestätigungsnachricht
      const gainLoss = offerPrice - bookValue;
      deliverMessage(state, {
        fromId: "system", toId: "player",
        subject: "Lkw verkauft",
        body: `Fahrzeug ${v.id} wurde für ${(offerPrice / 100).toFixed(2)} € an einen Händler verkauft.\nBuchwert: ${(bookValue / 100).toFixed(2)} €\n${gainLoss >= 0 ? "Gewinn" : "Verlust"}: ${Math.abs(gainLoss / 100).toFixed(2)} €\nAuszahlung an Firmenbank verbucht.`,
        gameTime: state.gameTime, category: "financing", priority: "normal",
        linkedRefs: { type: "vehicle", id: v.id }, dedupKey: `vehicle_sold:${v.id}`,
      });
      const newAchs = checkAchievements(state, state.gameTime);
      result = { ok: true, vehicleId: v.id, salePriceCents: offerPrice, bookValueCents: bookValue, gainLossCents: gainLoss, newAchievements: newAchs };
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
      // Offene Stelle erfuellen und bedarfsbezogene Welle ausloesen (Auftrag 29)
      fulfillPosting(state, "driver", app.id);
      scheduleDemandWave(state, state.gameTime);
      if (state.personnelMarket) {
        state.personnelMarket.stats.applicantsHired = (state.personnelMarket.stats.applicantsHired || 0) + 1;
      }
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
      // Offene Stelle erfuellen (Auftrag 29)
      fulfillPosting(state, role, app.id);
      // Bedarfsbezogene Welle ausloesen (Auftrag 29)
      scheduleDemandWave(state, state.gameTime);
      // Statistik
      if (state.personnelMarket) {
        state.personnelMarket.stats.applicantsHired = (state.personnelMarket.stats.applicantsHired || 0) + 1;
      }
      // Einfuehrungsnachricht an GF
      const newHire = role === "driver"
        ? state.drivers[state.drivers.length - 1]
        : (state.employees || []).find(e => e.name === app.name && e.role === role);
      if (newHire) onEmployeeHired(state, newHire, state.gameTime);
      break;
    }

    // ---------- Kündigung (Auftrag 18) ----------

    case "previewTermination": {
      const r = previewTermination(state, p.personId);
      result = r;
      break;
    }

    case "terminateEmployee": {
      ensureNotBlocked(state);
      const r = terminateEmployee(state, { personId: p.personId, mode: p.mode });
      result = r;
      break;
    }

    case "cancelTermination": {
      ensureNotBlocked(state);
      const r = cancelTermination(state, { personId: p.personId });
      result = r;
      break;
    }

    case "setupDispatcher": {
      ensureNotBlocked(state);
      const emp = (state.employees || []).find(e => e.id === p.employeeId);
      if (!emp) throw new Error("Angestellter nicht gefunden.");
      if (emp.role !== "dispatcher" && emp.role !== "dispatcher_senior") throw new Error("Diese Person ist kein Disponent.");
      // Fahrzeugzuweisung: Alle Lkw gehören dem Firmenpool. Disponenten
      // greifen automatisch auf alle verfügbaren Fahrzeuge zu (24/7-Betrieb).
      // vehicleIds wird aus Kompatibilität noch akzeptiert, aber nicht ausgewertet.
      emp.assignedVehicleIds = p.vehicleIds || [];
      if (p.workMode && ["suggestions", "dispatch_accepted", "autonomous"].includes(p.workMode)) {
        emp.workMode = p.workMode;
      }
      // Schicht zuweisen (8-Stunden-Schicht für 24/7-Betrieb)
      if (p.shiftStart != null) emp.shiftStart = p.shiftStart;
      if (p.shiftEnd != null) emp.shiftEnd = p.shiftEnd;
      // Alte Vorschläge aufräumen
      emp.suggestions = [];
      result = { ok: true, employeeId: emp.id, workMode: emp.workMode, shiftStart: emp.shiftStart ?? SERVICE_START_MIN, shiftEnd: emp.shiftEnd ?? SERVICE_END_MIN };
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
      // Abwaertskompatibel: startet einen Spaziergang ueber die neue Aktivitaets-Engine
      const r = startPrivateActivity(state, { activityType: "walk" });
      result = r;
      break;
    }

    // ---------- Private Aktivitaeten (Auftrag 26) ----------

    case "startPrivateActivity": {
      const r = startPrivateActivity(state, {
        activityType: p.activityType,
        voucherId: p.voucherId || null,
        itemId: p.itemId || null,
      });
      result = r;
      break;
    }

    case "cancelPrivateActivity": {
      const r = cancelPrivateActivity(state, { appointmentId: p.appointmentId });
      result = r;
      break;
    }

    case "getActivityOptions": {
      result = { ok: true, activities: getActivityOptions(state) };
      break;
    }

    // ---------- Belohnungen (Auftrag 26) ----------

    case "claimReward": {
      const r = claimReward(state, { rewardId: p.rewardId });
      result = r;
      break;
    }

    case "claimAllRewards": {
      const r = claimAllRewards(state);
      result = r;
      break;
    }

    case "equipCosmetic": {
      const r = equipCosmetic(state, { rewardId: p.rewardId });
      result = r;
      break;
    }

    case "unequipCosmetic": {
      const r = unequipCosmetic(state, { slot: p.slot });
      result = r;
      break;
    }

    case "getRewardCatalog": {
      result = { ok: true, rewards: REWARDS, slots: REWARD_SLOTS, slotLabels: SLOT_LABELS,
        claims: state.private?.rewards?.claims || {},
        cosmetics: state.private?.rewards?.cosmetics || {},
        vouchers: state.private?.rewards?.vouchers || [] };
      break;
    }

    // ---------- Anschaffungen (Auftrag 26) ----------

    case "buyPurchase": {
      ensureNotBlocked(state);
      const r = buyPurchase(state, { catalogId: p.catalogId });
      result = r;
      break;
    }

    case "sellPurchase": {
      ensureNotBlocked(state);
      const r = sellPurchase(state, { itemId: p.itemId });
      result = r;
      break;
    }

    case "getPurchaseCatalog": {
      result = { ok: true, catalog: PURCHASE_CATALOG, items: state.private?.purchases?.items || [],
        activeHomeId: state.private?.purchases?.activeHomeId || null };
      break;
    }

    case "previewPurchase": {
      const entry = PURCHASE_CATALOG.find(p2 => p2.id === p.catalogId);
      if (!entry) throw new Error("Unbekannter Katalogeintrag.");
      const check = checkPurchaseConditions(state, entry);
      result = { ok: true, ...check, entry };
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
      if (isLeasingOverdueBlocked(state, p.vehicleId)) throw new Error("Leasingrückstand: Neue Touren mit diesem Fahrzeug sind gesperrt.");
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

    // ---------- Finanzierung (Auftrag 17) ----------

    case "takeLoan": {
      ensureNotBlocked(state);
      const r = takeLoan(state, { amountCents: p.amountCents, termMonths: p.termMonths, clearArrears: p.clearArrears });
      result = r;
      break;
    }

    case "previewFinancing": {
      const r = checkFinancingAccess(state, { type: p.financingType, offerId: p.offerId, amountCents: p.amountCents, termMonths: p.termMonths, provisionCity: p.provisionCity, clearArrears: p.clearArrears });
      result = r;
      break;
    }

    case "earlyRepayLoan": {
      ensureNotBlocked(state);
      const r = earlyRepayLoan(state, { loanId: p.loanId, amountCents: p.amountCents });
      result = r;
      break;
    }

    case "getCreditLimit": {
      result = { ok: true, limit: computeCreditLimit(state) };
      break;
    }

    case "leaseTruck": {
      ensureNotBlocked(state);
      const r = leaseTruck(state, { provisionCity: p.provisionCity, offerId: p.offerId });
      result = r;
      break;
    }

    case "returnLeasedTruck": {
      ensureNotBlocked(state);
      const r = returnLeasedTruck(state, { contractId: p.contractId });
      result = r;
      break;
    }

    case "buyoutLeasedTruck": {
      ensureNotBlocked(state);
      const r = buyoutLeasedTruck(state, { contractId: p.contractId });
      result = r;
      break;
    }

    case "earlyTerminateLease": {
      ensureNotBlocked(state);
      const r = earlyTerminateLease(state, { contractId: p.contractId });
      result = r;
      break;
    }

    // ---------- Zeitautomatik (Auftrag 20) ----------

    case "enableAutomation": {
      const tc = enableAutomation(state, p.serverNowMs || Date.now());
      result = { ok: true, timeControl: tc };
      break;
    }

    case "pauseAutomation": {
      const r = pauseAutomation(state, p.serverNowMs || Date.now(), p.reason);
      result = { ok: true, timeControl: r.tc, targetNumerator: r.targetNumerator };
      break;
    }

    case "syncAutomation": {
      const r = syncToTarget(state, p.serverNowMs || Date.now(), advanceTo);
      result = { ok: true, timeControl: state.timeControl, events: r.log, gameTime: r.gameTime };
      break;
    }

    case "getAutomationStatus": {
      const tc = state.timeControl;
      const targetMin = computeTargetGameMinute(tc, p.serverNowMs || Date.now());
      result = { ok: true, timeControl: tc, targetGameMinute: targetMin, gameTime: state.gameTime };
      break;
    }

    // ---------- Ereignisprotokoll (Auftrag 23) ----------

    case "markEventSeen": {
      markEventSeen(state, p.eventId);
      result = { ok: true };
      break;
    }

    case "markAllEventsSeen": {
      markAllEventsSeen(state);
      result = { ok: true };
      break;
    }

    case "getRecentEvents": {
      const events = getRecentEvents(state, p.limit || 50, p.typeFilter || null);
      result = { ok: true, events, unseenCount: getUnseenEventCount(state) };
      break;
    }

    // ---------- Abwesenheiten (Auftrag 25) ----------

    case "requestVacation": {
      ensureNotBlocked(state);
      const r = requestVacation(state, p);
      result = r;
      break;
    }

    case "approveVacation": {
      ensureNotBlocked(state);
      const r = approveVacation(state, { requestId: p.requestId, conflictResolution: p.conflictResolution });
      result = r;
      break;
    }

    case "rejectVacation": {
      ensureNotBlocked(state);
      const r = rejectVacation(state, { requestId: p.requestId, reason: p.reason });
      result = r;
      break;
    }

    case "cancelVacation": {
      ensureNotBlocked(state);
      const r = cancelVacation(state, { requestId: p.requestId });
      result = r;
      break;
    }

    case "returnEarlyFromVacation": {
      ensureNotBlocked(state);
      const r = returnEarlyFromVacation(state, { requestId: p.requestId, returnMin: p.returnMin });
      result = r;
      break;
    }

    case "reportSickness": {
      ensureNotBlocked(state);
      const r = reportSickness(state, { personId: p.personId, startMin: p.startMin, expectedDurationDays: p.expectedDurationDays });
      result = r;
      break;
    }

    case "getVacationStatus": {
      const personId = p.personId;
      accrueVacationDays(state, personId, state.gameTime);
      const acct = getVacationAccount(state, personId);
      const available = getVacationAvailable(state, personId);
      const reserved = (state.absences?.vacationRequests || []).filter(r => r.personId === personId && r.status === "approved" && r.endMin > state.gameTime);
      result = { ok: true, account: acct, available, reserved };
      break;
    }

    case "getAbsenceCalendar": {
      const fromMin = p.fromMin || state.gameTime;
      const toMin = p.toMin || state.gameTime + 30 * 1440;
      const entries = getAbsenceCalendar(state, fromMin, toMin);
      result = { ok: true, entries };
      break;
    }

    // ---------- Dienstleistungen (Auftrag 25) ----------

    case "bookCleaning": {
      ensureNotBlocked(state);
      const r = bookCleaning(state, { branchId: p.branchId, units: p.units, recurring: p.recurring, recurringIntervalDays: p.recurringIntervalDays });
      addBooking(state, state.gameTime, "Reinigung: " + r.contractId, -r.costCents, "company", r.contractId);
      result = r;
      break;
    }

    case "bookMaintenance": {
      ensureNotBlocked(state);
      const r = bookMaintenance(state, { vehicleId: p.vehicleId });
      addBooking(state, state.gameTime, "Externe Wartung: " + p.vehicleId, -r.costCents, "company", r.contractId);
      result = r;
      break;
    }

    case "bookTowing": {
      ensureNotBlocked(state);
      const r = bookTowing(state, { vehicleId: p.vehicleId, targetCity: p.targetCity });
      addBooking(state, state.gameTime, "Abschleppdienst: " + p.vehicleId, -r.costCents, "company", r.contractId);
      result = r;
      break;
    }

    case "bookTempStaff": {
      ensureNotBlocked(state);
      const r = bookTempStaff(state, { type: p.type, substitutesPersonId: p.substitutesPersonId, startMin: p.startMin, blocks: p.blocks });
      addBooking(state, state.gameTime, "Fremdpersonal: " + r.contractId, -r.totalCostCents, "company", r.contractId);
      result = r;
      break;
    }

    case "bookExternalAccounting": {
      ensureNotBlocked(state);
      const r = bookExternalAccounting(state, { startMin: p.startMin });
      addBooking(state, state.gameTime, "Externe Buchhaltung: " + r.contractId, -r.costCents, "company", r.contractId);
      result = r;
      break;
    }

    case "bookRentalTruck": {
      ensureNotBlocked(state);
      const r = bookRentalTruck(state, { provisionCity: p.provisionCity, blocks: p.blocks });
      addBooking(state, state.gameTime, "Mietfahrzeug: " + r.contractId, -r.totalCostCents, "company", r.contractId);
      result = r;
      break;
    }

    case "cancelService": {
      ensureNotBlocked(state);
      const r = cancelService(state, { contractId: p.contractId });
      result = r;
      break;
    }

    case "getServiceCatalog": {
      result = { ok: true, providers: SERVICE_PROVIDERS, branches: state.branches.map(b => ({ id: b.id, name: b.name, city: b.city, cleanliness: getBranchCleanliness(state, b.id), cleaningNeed: computeCleaningNeed(state, b.id) })) };
      break;
    }

    // ---------- Werkstatt (Auftrag 27) ----------

    case "buildWorkshopSlot": {
      ensureNotBlocked(state);
      const r = buildWorkshopSlot(state, { branchId: p.branchId });
      result = r;
      break;
    }

    case "planMaintenance": {
      ensureNotBlocked(state);
      const r = createMaintenanceOrder(state, {
        vehicleId: p.vehicleId, branchId: p.branchId, type: p.type || "standard",
        isAutomated: false, mechanicId: p.mechanicId || null,
      });
      result = r;
      break;
    }

    case "cancelMaintenance": {
      ensureNotBlocked(state);
      const r = cancelMaintenanceOrder(state, { orderId: p.orderId });
      result = r;
      break;
    }

    case "assignMechanic": {
      ensureNotBlocked(state);
      const r = assignMechanic(state, { orderId: p.orderId, mechanicId: p.mechanicId });
      result = r;
      break;
    }

    case "updateAutomationProfile": {
      const r = updateAutomationProfile(state, p);
      result = r;
      break;
    }

    case "getWorkshopStatus": {
      result = getWorkshopStatus(state);
      break;
    }

    // ---------- Personalmarkt (Auftrag 29) ----------

    case "postJob": {
      ensureNotBlocked(state);
      const r = postJob(state, p);
      result = r;
      break;
    }

    case "closeJobPosting": {
      ensureNotBlocked(state);
      const r = closeJobPosting(state, p.postingId);
      result = r;
      break;
    }

    case "getPersonnelMarketStatus": {
      result = getPersonnelMarketStatus(state);
      break;
    }

    case "toggleApplicantWatchlist": {
      const r = toggleWatchlist(state, p.applicantId);
      result = r;
      break;
    }

    // ---------- Zufriedenheit (Auftrag 30) ----------

    case "getSatisfactionDetail": {
      result = getSatisfactionDetail(state, p.personId);
      break;
    }

    case "getTeamClimate": {
      result = getTeamClimate(state);
      break;
    }

    case "payPersonWages": {
      ensureNotBlocked(state);
      const r = payPersonWages(state, p.personId, p.itemIds);
      result = r;
      break;
    }

    case "raiseSalary": {
      ensureNotBlocked(state);
      const r = raiseSalary(state, p.personId, p.newDailyWageCents);
      result = r;
      break;
    }

    case "giveBonus": {
      ensureNotBlocked(state);
      const r = giveBonus(state, p.personId);
      result = r;
      break;
    }

    case "prepareConversation": {
      result = prepareConversation(state, p.personId);
      break;
    }

    case "conductConversation": {
      const r = conductConversation(state, p.personId);
      result = r;
      break;
    }

    case "prepareRetentionConversation": {
      result = prepareRetentionConversation(state, p.personId);
      break;
    }

    case "conductRetentionConversation": {
      const r = conductRetentionConversation(state, p.personId);
      result = r;
      break;
    }

    // ---------- Aus- und Weiterbildung (Auftrag 31) ----------

    case "getCourseCatalog": {
      result = { ok: true, catalog: COURSE_CATALOG };
      break;
    }

    case "previewCourseBooking": {
      result = previewCourseBooking(state, p.personId, p.courseId);
      break;
    }

    case "bookCourse": {
      ensureNotBlocked(state);
      const r = bookCourse(state, p.personId, p.courseId, { confirmPromotion: p.confirmPromotion || false });
      result = r;
      break;
    }

    case "cancelCourse": {
      ensureNotBlocked(state);
      const r = cancelCourse(state, p.enrollmentId);
      result = r;
      break;
    }

    case "getTrainingOverview": {
      result = getTrainingOverview(state);
      break;
    }

    case "getTrainingSchedule": {
      const fromMin = p.fromMin || state.gameTime;
      const toMin = p.toMin || state.gameTime + 30 * 1440;
      result = { ok: true, events: getTrainingSchedule(state, fromMin, toMin) };
      break;
    }

    case "getPersonQualifications": {
      result = { ok: true, qualifications: getPersonQualifications(state, p.personId), allQualifications: getAllPersonQualifications(state, p.personId) };
      break;
    }

    case "previewApprenticeship": {
      result = previewApprenticeship(state, p.personId, p.role);
      break;
    }

    case "startApprenticeship": {
      ensureNotBlocked(state);
      const r = startApprenticeship(state, p.personId, p.role, { takeoverAuthorized: p.takeoverAuthorized || false });
      result = r;
      break;
    }

    case "takeoverApprentice": {
      ensureNotBlocked(state);
      const r = takeoverApprentice(state, p.apprenticeshipId, state.gameTime, []);
      result = r;
      break;
    }

    case "releaseApprentice": {
      ensureNotBlocked(state);
      const r = releaseApprentice(state, p.apprenticeshipId, state.gameTime);
      result = r;
      break;
    }

    case "updateAutoRefreshConfig": {
      const r = updateAutoRefreshConfig(state, p.config);
      result = r;
      break;
    }

    case "getAutoRefreshConfig": {
      result = { ok: true, config: getAutoRefreshConfig(state) };
      break;
    }

    default: {
      const dgResult = handleDgCommand(state, command, p);
      if (dgResult !== null) { result = dgResult; break; }
      const invResult = handleInvestmentCommand(state, command, p);
      if (invResult !== null) { result = invResult; break; }
      throw new Error("Unbekannter Befehl: " + command);
    }
  }
  // processedGameMinute mit gameTime synchronisieren: manuelle Zeitfortschritte
  // (advanceTime, advanceToNextEvent, Befehle mit advanceTo) aktualisieren gameTime,
  // aber nicht processedGameMinute. Ohne Synchronisation würde enableAutomation
  // die Zeit auf den alten processedGameMinute-Wert zurücksetzen.
  if (state.timeControl && state.gameTime > (state.timeControl.processedGameMinute || 0)) {
    state.timeControl.processedGameMinute = state.gameTime;
  }
  // Erfolgsprüfung nach jedem Befehl (idempotent)
  const finalAchs = checkAchievements(state, state.gameTime);
  if (finalAchs.length && !result.newAchievements) result.newAchievements = finalAchs;
  // Belohnungsansprueche nach Erfolgsprüfung aktualisieren (Auftrag 26)
  checkRewardClaims(state);
  return { state, result };
}