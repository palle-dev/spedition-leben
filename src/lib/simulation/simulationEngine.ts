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
  VEHICLE_CATALOG, VEHICLE_CATALOG_LIST, getVehicleProfile,
} from "./gameRules.ts";
import { buildTourPlan, confirmTour as doConfirmTour, cancelTour as doCancelTour, processTours, onTripCompleted, findReturnLoads, suggestTours, futureLocation, futureDriverLocation, _clearPlanCache } from "./tourEngine.ts";
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
  deleteConversation,
  clearAllConversations,
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
  getRecentEvents, getUnseenEventCount, clearEvents, deleteEvent,
} from "./eventLog.ts";
import {
  migrateAbsences, requestVacation, approveVacation, rejectVacation,
  cancelVacation, returnEarlyFromVacation, reportSickness, maybeGenerateSickness,
  processSicknessRecovery, processVacationDayConsumption, isPersonAvailable,
  getVacationAvailable, getVacationAccount, accrueVacationDays, detectAbsenceConflicts,
  getAbsenceCalendar, maybeGenerateVacationRequest, autoApproveVacationRequests,
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
  DG_HANDLING_FEE_TANK_CENTS, DG_HANDLING_FEE_VERSANDSTUECK_CENTS,
  handleDgCommand,
} from "./dangerousGoodsEngine.ts";
import {
  migrateInvestment, processMarketTick, getInvestmentEventTimes,
  handleInvestmentCommand,
} from "./investmentEngine.ts";
import {
  migrateBranches, checkBranchRequirements, openBranch, renameBranch, closeBranch,
  moveVehicle, moveDriver, previewMoveVehicle, previewMoveDriver,
  assignDispatcherToBranch, assignEmployeeToBranch, getBranchStats, processDriverTravels,
  getDriverTravelEventTimes, creditBranchDelivery,
} from "./branchEngine.ts";
import { processEmployees, triggerDispatcherPlanning, planSingleVehicle } from "./dispatcherProcessor.ts";
import {
  migrateRelationship, getRelationshipStatus, proposeMarriage, getMarried,
  planChild, processPregnancy, getPregnancyEventTimes, processDailyRelationship,
  getGiftOptions, giveGift,
} from "./relationshipEngine.ts";
import {
  migrateDating, getDatingStatus, likeProfile, passProfile, goOnDate,
  becomePartners, breakUp, getDateEventTimes, processDates, handleDatingCommand,
} from "./datingEngine.ts";
import { cleanupHistory } from "./historyCleanup.ts";
import {
  migrateCustomerRelations, migrateContracts,
  recordOrderOutcome, processContractDay, evaluateContracts,
  notifyContractEndingSoon,
} from "./customerEngine.ts";
import { handleCustomerCommand } from "./customerCommands.ts";
import {
  migrateDelegation, migrateApprovals, resetDailySpendIfNeeded,
  expireApprovals, shouldStopForApproval,
} from "./delegationEngine.ts";
import { handleDelegationCommand } from "./delegationCommands.ts";
import { migrateStories, processStoryDeadlines, processStoryAppointments, processDailyStories, getStoryEventTimes } from "./storyEngine.ts";
import { handleStoryCommand } from "./storyCommands.ts";
import {
  setDevelopmentFocus as doSetFocus, startOnboarding, pauseOnboarding,
  resumeOnboarding, dismissOnboarding, markOnboardingReviewed, recordAutoDecisionDay,
} from "./developmentEngine.ts";
import { handleMailCommand } from "./mailCommands.ts";
import { handleDevelopmentGoalsCommand } from "./developmentGoalsCommands.ts";
import { migrateSegmentFields, getOrderSegments, getOrderCharacteristics, getPrimarySegment } from "./segmentEngine.ts";
import { migrateBusinessFocus, setBusinessFocus as doSetBusinessFocus, setBranchBusinessFocus as doSetBranchBusinessFocus, getBusinessFocus, getEffectiveFocusForBranch, getMarketWeightsForBranch, orderMatchesFocus, getFocusPriority, BUSINESS_FOCI } from "./businessFocusEngine.ts";
import { migrateSegmentStats, recordSegmentDelivery, recordTankCleaning, recordEmptyTrip, getSegmentStats } from "./segmentStatsEngine.ts";
import { migrateMarketDynamics, processMarketDynamicsDayChange, getMarketOverview } from "./marketDynamicsEngine.ts";
import {
  migrateDevelopmentGoals, processMentoringEvents, processOverduePromises,
  checkGoalFulfillment, fulfillPromiseByAction, getDevelopmentProfile,
  getDevelopmentOverview, createDevelopmentGoal, removeDevelopmentGoal,
  assignMentor, removeMentoring, getConversationCooldown, setConversationCooldown,
  createPromise, getOpenPromises, getSuggestedCourses, getAvailableMentors,
} from "./developmentGoalsEngine.ts";
import {
  migrateDisruptions, processDisruptions, generateAbsenceDisruption,
  maybeGenerateLoadingDelay, maybeGenerateTechnicalDefectForTrip, handleDisruptionCommand,
} from "./disruptionEngine.ts";
import {
  migrateUsedVehicleMarket, generateUsedVehicleOffers,
} from "./vehicleMarketEngine.ts";
import { handleVehicleMarketCommand } from "./vehicleMarketCommands.ts";

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
  // Szenario-Auszeit blockiert keine operativen Aktionen — Eingriffe werden gezählt.
  return state.appointments.some(a => a.status === "active" && a.type !== "scenario_timeoff");
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
  const amt = state.private.dailyWithdrawalCents ?? PRIVATE_WITHDRAWAL_PER_DAY; if (amt <= 0) return { done: true };
  const hasLiab = (state.accounting?.openItems || []).some(o => o.remainingCents > 0) || (state.openCosts || []).some(o => o.account === "company" && o.amountCents > 0);
  if (hasLiab) return { done: false, reason: "offene betriebliche Kosten" };
  if (state.company.accountCents < amt) return { done: false, reason: "Firma kann Entnahme nicht bezahlen" };
  addBooking(state, min, "Private Entnahme", -amt, "company", "withdrawal"); state.private.accountCents += amt;
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
      : emp.role === "assistant" || emp.role === "branch_manager" ? "Geschäftsführung" : "Lohn";
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
  recordAutoDecisionDay(state, midnight);
  state.lastDailyAccountingMin = midnight;
  // Auftrag 30: Zufriedenheitsregeln, Erholung und Kündigungsrisiken
  processDailySatisfaction(state, midnight);
  processDailyRecovery(state, midnight);
  processTerminationWarnings(state, midnight);
  processDailyRelationship(state, midnight);
  // Entwicklungsziele: Überfällige Zusagen markieren
  processOverduePromises(state, midnight);
  return log;
}

// ---------- Zeitverarbeitung ----------
import { earliestEventAfter } from "./eventScheduler.ts";
import { reportProgress } from "./progressHook.js";

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
  // Filialverschiebung: Ziel-Filiale übernehmen, wenn Trip als Überstellung markiert
  if (trip.targetBranchId) {
    vehicle.branchId = trip.targetBranchId;
    driver.branchId = trip.targetBranchId;
  }

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
      driver.freeSinceMin = m;
    }
  }

  if (trip.type === "empty") {
    onTripCompleted(state, trip, m, log);
    recordEmptyTrip(state, trip);
    log.push({ type: "emptytrip_completed", trip: trip.id, vehicle: vehicle.id, driver: driver.id, atCity: finalCity });
    planSingleVehicle(state, vehicle, m, log);
    return;
  }
  const order = state.orders.find(o => o.id === trip.orderId);
  order.status = "geliefert"; order.deliveredAtMin = m;
  const onTime = m <= order.deliveryDeadlineMin;
  const payment = onTime ? trip.paymentCents : Math.round(trip.paymentCents * 0.9);
  addBooking(state, m, "Vergütung: " + order.customer, payment, "company", order.id);
  order.paidCents = payment;
  // Kundenbeziehung: Reputation bei Lieferung erfassen (idempotent)
  recordOrderOutcome(state, order, onTime ? "timely" : "late", m, payment);
  order.history = order.history || [];
  order.history.push({ type: "delivered", min: m, actor: driver.id, actorName: driver.name, details: { onTime, paymentCents: payment } });
  state.stats.totalDeliveries++;
  // Szenario: Lieferungen zählen (gesamt und während Auszeit)
  if (state.scenario && state.scenario.status === "active") {
    state.scenario.totalDeliveries = (state.scenario.totalDeliveries || 0) + 1;
    if (state.scenario.timeoffStartMin != null && state.scenario.timeoffEndMin != null &&
        m >= state.scenario.timeoffStartMin && m < state.scenario.timeoffEndMin) {
      state.scenario.deliveriesDuringTimeoff = (state.scenario.deliveriesDuringTimeoff || 0) + 1;
    }
  }
  if (onTime) { state.stats.timelyDeliveries++; state.stats.consecutiveTimely = (state.stats.consecutiveTimely || 0) + 1; }
  else { state.stats.consecutiveTimely = 0; }
  state.stats.totalRevenueCents = (state.stats.totalRevenueCents || 0) + payment;
  creditBranchDelivery(state, vehicle, payment);
  const newAchs = checkAchievements(state, m);
  if (newAchs.length) log.push({ type: "achievements_unlocked", achievements: newAchs, atMin: m });
  if (state.tutorial.active && state.tutorial.step === 2) state.tutorial.step = 3;
  log.push({ type: "delivery", trip: trip.id, order: order.id, onTime, paymentCents: payment, branchId: vehicle.branchId });
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
  // Segment-Statistik: Lieferung erfassen
  let _dgHandlingCents = 0;
  if (order.isDangerousGoods) {
    const _dgProfile = getDgProfile(order.dgProfileId);
    if (_dgProfile) _dgHandlingCents = _dgProfile.transportType === "tank" ? DG_HANDLING_FEE_TANK_CENTS : DG_HANDLING_FEE_VERSANDSTUECK_CENTS;
  }
  recordSegmentDelivery(state, order, trip, onTime, payment, trip.fuelCents || 0, trip.tollCents || 0, 0, _dgHandlingCents);
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
  // Inkrementelle Disposition: Fahrzeug ist frei → sofort neu planen
  planSingleVehicle(state, vehicle, m, log);
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
  const _logLenBeforeTours = log.length;
  processTours(state, m, log);
  // 3b.1 Tour-Start-Ereignisse aus Log in dauerhaftes Ereignisprotokoll übernehmen
  // Nur die in diesem processTours-Aufruf neu hinzugefügten Einträge durchsuchen
  // (verhindert O(n²) bei Tausenden Log-Einträgen).
  for (let li = _logLenBeforeTours; li < log.length; li++) {
    const le = log[li];
    if (le.type === "tour_deployment_started" && le.atMin === m) {
      const tour = (state.tours || []).find(t => t.id === le.tour);
      const vehicle = state.vehicles.find(v => v.id === tour?.vehicleId);
      const driver = state.drivers.find(d => d.id === tour?.driverId);
      const dep = tour?.deployments?.find(d => d.id === le.deployment);
      const order = dep?.orderId ? state.orders.find(o => o.id === dep.orderId) : null;
      if (vehicle) le.branchId = vehicle.branchId;
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
  // Nur alle 15 Min aufrufen, nicht bei jedem Event. suggestTours ist
  // O(Fahrzeuge × Fahrer × Aufträge²) — bei jedem Event aufgerufen war das
  // der Haupt-CPU-Killer beim Tagesvorlauf. Die reguläre Planung läuft
  // ohnehin alle 60 Min (SERVICE_INTERVAL_MIN); 15 Min reichen für
  // ereignisgesteuerte Reaktion (z.B. Fahrer wird frei nach Tour-Ende).
  if (m % 15 === 0) triggerDispatcherPlanning(state, m, log);
  // 3c. Angestellte verarbeiten (Disponenten Schicht-basiert, Buchhaltung/Reinigung tagsüber)
  if (m % SERVICE_INTERVAL_MIN === 0) {
    processEmployees(state, m, log);
    if (m % 1440 === SERVICE_START_MIN) autoApproveVacationRequests(state, m);
  }
  // 3d. Berichte generieren und Staff-Tasks verarbeiten
  processReportSchedules(state, m, log);
  processStaffTasks(state, m, log);
  // 3e. Finanzierung (Kredite, Leasing) – Auftrag 17
  processFinancingEvents(state, m, log);
  // 3e.2 Freistellung nach Trip-Ende (Auftrag 18)
  processReleaseAfterTrip(state, m, log);
  // 3e.4 Fahrer-Reisen abschließen (Filialverschiebung)
  processDriverTravels(state, m, log);
  // 3e.5 Schwangerschaft / Geburt (Beziehungs-Engine)
  processPregnancy(state, m, log); processDates(state, m, log);
  // 3e.3 Tatsächlicher Austritt bei Fristende (Auftrag 18)
  processEmployeeExit(state, m, log); processStoryDeadlines(state, m, log); processStoryAppointments(state, m, log);
  // 4. Tagesabrechnung (Mitternacht)
  if (m % 1440 === 0 && m > 0) {
    const dlog = doDailyAccounting(state, m);
    log.push({ type: "daily_accounting", min: m, details: dlog });
    // Auftrag 25: Krankheitsgenerator, Urlaubsverbrauch, Sauberkeitsverlust
    maybeGenerateSickness(state, m);
    // Stoerungsmanagement: Bei neuer Krankheit Personalausfall-Stoerungen erzeugen
    for (const s of (state.absences?.sicknesses || [])) {
      if (s.status === "active") generateAbsenceDisruption(state, s.personId, m, log);
    }
    maybeGenerateVacationRequest(state, m);
    processVacationDayConsumption(state, m);
    processDailyCleaningDecay(state, m);
    // Auftrag 26: Taeglicher Unterhalt fuer Anschaffungen
    processDailyMaintenance(state, m);
    // History-Cleanup: Abgeschlossene Trips/Tours und erledigte Aufträge
    // entfernen, die älter als 7 bzw. 30 Tage sind. Verhindert unendliches
    // Wachstum von state.trips/orders/tours über lange Spiele und
    // beschleunigt earliestEventAfter (iteriert über alle Trips pro Event).
    cleanupHistory(state, m);
    processDailyStories(state, m, log);
    // Markt-Dynamik: Ereignis-Übergänge und Generierung am Tageswechsel
    processMarketDynamicsDayChange(state, m, log);
    resetDailySpendIfNeeded(state);
    expireApprovals(state);
    // Rahmenverträge: Tägliche Auftragsgenerierung, Auswertung und
    // Benachrichtigung bei bevorstehendem Vertragsende.
    processContractDay(state, m, log);
    evaluateContracts(state, m, log);
    notifyContractEndingSoon(state, m, log);
  }
  // Auftrag 25: Krankheitsgenesung – nur bei aktiven Krankmeldungen
  if ((state.absences?.sicknesses || []).length > 0) processSicknessRecovery(state, m);
  // Dienstleistungsverarbeitung – nur bei vorhandenen Verträgen
  if ((state.serviceContracts || []).length > 0) {
    processServiceContracts(state, m, log);
    processTempStaffBilling(state, m, log);
  }
  // Auftrag 27: Werkstatt-Verarbeitung und Automatik
  processWorkshop(state, m, log);
  evaluateWorkshopAutomation(state, m, log);
  // Stoerungsmanagement: Auto-Auflösung, Abschluss laufender Maßnahmen
  processDisruptions(state, m, log);
  // Gebrauchtfahrzeugmarkt: Angebote generieren/ablaufen lassen (alle 3 Tage)
  generateUsedVehicleOffers(state, m, log);
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
  // Entwicklungsziele: Mentoring-Lerntermine verarbeiten
  processMentoringEvents(state, m, log);
  // Auftrag 32: Gefahrgut – Tankreinigung, Ausrüstung, Spielprüfung
  processTankCleaning(state, m, log);
  for (const _le of log) {
    if (_le.type === "tank_cleaning_completed" && _le.atMin === m) recordTankCleaning(state, TANK_CLEANING_COST_CENTS);
  }
  processEquipmentJobs(state, m, log);
  processInspectionJobs(state, m, log);
  // 4b. Monatswechsel (Abschreibung, Periodenabschluss)
  if (m % MONTH_MIN === 0 && m > 0) {
    calculateDepreciation(state, m);
    processMonthEnd(state, m, log);
  }
  // 5. Angebotsablauf
  for (const o of state.orders) { if (o.status === "offered" && o.acceptDeadlineMin === m) { o.status = "expired"; log.push({ type: "order_expired", order: o.id }); } }
  // 5a. Angenommene Aufträge mit überschrittener Lieferfrist als "failed" markieren.
  // suggestTours/buildTourPlan lassen Aufträge bis zu 4h (LATE_GRACE_MIN = 240)
  // nach der Lieferfrist noch zu. Danach sind sie nicht mehr planbar, bleiben aber
  // sonst ewig als "angenommen" stehen — sie blähen die UI-Zahl auf, blockieren
  // den Dispatcher-Skip-Cache (unplannedCount bleibt konstant → keine Neuplanung)
  // und verhindern, dass die Disposition freie Lkw tatsächlich einsetzt.
  for (const o of state.orders) {
    if (o.status === "angenommen" && o.deliveryDeadlineMin + 240 <= m) {
      o.status = "failed";
      o.failedAtMin = m;
      recordOrderOutcome(state, o, "failed", m, 0);
      log.push({ type: "order_failed", order: o.id, customer: o.customer, reason: "Lieferfrist überschritten" });
    }
  }
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
  // 8. Szenario: Stichtags-Flag setzen (Auswertung erfolgt im Adapter)
  if (state.scenario && state.scenario.status === "active" && m >= state.scenario.deadlineMin && !state.scenario.pendingEvaluation) {
    state.scenario.pendingEvaluation = true;
  }
}
function advanceTo(state, targetMin, log, reportStart) {
  // Flag für processDispatcher: während eines Vorlaufs (reportStart definiert)
  // wird die Skip-Cache-Schwelle von 10 auf 60 Min angehoben — der Context-Key
  // erfasst alle handlungsrelevanten Änderungen, sodass 15-Min-Ticks mit
  // unverändertem Context reine Verschwendung wären.
  state._bulkAdvance = reportStart !== undefined;
  // _largeAdvance: nur für Vorläufe ≥ 120 Min (Tagesvorlauf). Steuert die
  // 2-Stunden-Skip für Disponenten — bei 1-Stunden-Schritten würden
  // Disponenten sonst bei jedem zweiten Schritt gar nicht planen.
  state._largeAdvance = reportStart !== undefined && (targetMin - state.gameTime) >= 120;
  let t = state.gameTime;
  const startTime = Date.now();
  // Der Vorlauf läuft im Web-Worker — der Haupt-Thread bleibt frei, daher gibt
  // es KEIN CPU-Zeitbudget. Alle Vorgänge müssen verarbeitet werden, sonst wäre
  // die Funktion wertlos (unvollständige Buchungen, fehlende Lieferungen).
  // MAX_EVENTS ist eine reine Sicherheitsgrenze gegen Endlosschleifen-Bugs
  // (earliestEventAfter gibt immer m > t zurück, daher ist ein Stillstand
  // ausgeschlossen — die Grenze liegt hoch genug für jede reale Flotte).
  const MAX_EVENTS = 5000000;
  let eventCount = 0;
  let lastReportMs = startTime;
  let stopped = false;
  try {
    while (true) {
      if (eventCount >= MAX_EVENTS) { stopped = true; break; }
      if (shouldStopForApproval(state)) { stopped = true; log.push({ type: "advance_stopped_approval", atMin: t, targetMin, reason: "pending_approval" }); break; }
      const next = earliestEventAfter(state, t, targetMin);
      if (next === null) break;
      processEventsAt(state, next, log);
      t = next;
      eventCount++;
      // Fortschritt nur alle 250 ms melden — nicht nach jedem Event.
      // Reduziert postMessage-Overhead massiv bei Tausenden Events.
      if (reportStart !== undefined) {
        const now = Date.now();
        if (now - lastReportMs >= 250 || t >= targetMin) {
          reportProgress(t - reportStart, targetMin - reportStart, eventCount, null);
          lastReportMs = now;
        }
      }
    }
    state.gameTime = stopped ? t : targetMin;
  } finally {
    state._bulkAdvance = false;
    state._largeAdvance = false;
  }
  if (stopped) log.push({ type: "advance_stopped", atMin: t, targetMin, reason: "max_events_safety" });
  if (reportStart !== undefined) {
    reportProgress(state.gameTime - reportStart, targetMin - reportStart, eventCount, null);
  }
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

// ---------- Befehle ----------
export function applyCommand(state, command, params) {
  _clearPlanCache(); migrateState(state);
  [migrateAbsences, migrateServices, migrateRewards, migratePurchases, migrateWorkshop, migratePersonnelMarket, migrateTraining, migrateDangerousGoods, migrateInvestment, migrateBranches, migrateRelationship, migrateDating, migrateCustomerRelations, migrateContracts, migrateDelegation, migrateApprovals, migrateStories, migrateSegmentFields, migrateBusinessFocus, migrateSegmentStats, migrateMarketDynamics, migrateDevelopmentGoals, migrateDisruptions, migrateUsedVehicleMarket].forEach(fn => fn(state));
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
        const ref = o.deliveredAtMin || o.failedAtMin || o.acceptDeadlineMin || o.acceptedAtMin || 0;
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
      recordOrderOutcome(state, o, "cancelled", state.gameTime, 0);
      state.stats.cancelledOrders = (state.stats.cancelledOrders || 0) + 1;
      result = { ok: true, feeCents: fee };
      break;
    }

    case "clearOpenOrders": {
      ensureNotBlocked(state);
      // Auftrags-IDs sammeln, die bereits disponiert sind (aktive Tour oder laufende Fahrt)
      const busyOrderIds = new Set();
      for (const tr of (state.trips || [])) {
        if (tr.status === "in_progress" && tr.orderId) busyOrderIds.add(tr.orderId);
      }
      for (const tr of (state.tours || [])) {
        if (tr.status !== "active") continue;
        for (const d of (tr.deployments || [])) {
          if (d.orderId && d.status !== "cancelled") busyOrderIds.add(d.orderId);
        }
      }
      const before = state.orders.length;
      // Lösche: offene Marktangebote (offered) und ungesplante angenommene Aufträge.
      // Behalte: unterwegs/abgeschlossen/storniert/abgelaufen + bereits disponierte Aufträge.
      state.orders = state.orders.filter(o => {
        if (o.status !== "offered" && o.status !== "angenommen") return true;
        if (o.status === "angenommen" && busyOrderIds.has(o.id)) return true;
        return false;
      });
      const removed = before - state.orders.length;
      result = { ok: true, removedCount: removed };
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
      // Störungsmanagement: Technischer Defekt vor Buchung von Kraftstoff/Maut prüfen
      if (maybeGenerateTechnicalDefectForTrip(state, v, d, o, state.gameTime, [])) {
        throw new Error("Technischer Defekt! " + v.id + " kann den Transport nicht antreten. Siehe Störungen im Büro.");
      }
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
      // Stoerungsmanagement: Ladeverzoegerung fuer manuellen Transport pruefen
      maybeGenerateLoadingDelay(state, trip, state.gameTime, []);
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
      const maintProfile = getVehicleProfile(v);
      let cost = maintProfile.maintenanceCostCents;
      const maintDuration = maintProfile.maintenanceDurationMin;
      const stressed = state.private.stress >= STRESS_MAINT_THRESHOLD;
      if (stressed) cost = Math.round(cost * MAINT_STRESS_FACTOR);
      if (state.company.accountCents < cost) throw new Error("Firmenkonto reicht für die Wartung (" + (cost / 100).toFixed(2) + " €) nicht aus.");
      addBooking(state, state.gameTime, "Wartung: " + v.id, -cost, "company", "maintain:" + v.id);
      v.status = "maintenance"; v.maintenanceUntil = state.gameTime + maintDuration;
      result = { ok: true, vehicleId: v.id, costCents: cost, stressed, until: v.maintenanceUntil };
      break;
    }

    case "buyVehicle": {
      ensureNotBlocked(state);
      if (state.openCosts.some(o => o.account === "company")) throw new Error("Es gibt offene betriebliche Kosten. Bitte bezahle diese zuerst.");
      const profile = VEHICLE_CATALOG[p.vehicleType] || VEHICLE_CATALOG.standard;
      const buyPrice = profile.priceCents;
      if (state.company.accountCents < buyPrice) throw new Error("Firmenkonto reicht für den Kauf (" + (buyPrice / 100).toFixed(0) + " €) nicht aus.");
      const buyBranch = p.branchId ? state.branches.find(b => b.id === p.branchId) : state.branches[0];
      if (!buyBranch || buyBranch.status !== "active") throw new Error("Keine aktive Filiale verfügbar.");
      addBooking(state, state.gameTime, "Fahrzeugkauf: " + profile.label, -buyPrice, "company", "buy");
      const v = { id: uid(state, "v"), branchId: buyBranch.id, type: profile.label, catalogId: profile.id,
        capacityTons: profile.capacityTons, consumptionPer100km: profile.consumptionPer100km,
        bookValueCents: buyPrice, condition: 85,
        locationCity: buyBranch.city, status: "free", tripId: null, maintenanceUntil: null,
        ownership_type: "owned", odometerKm: 0, acquiredAtMin: state.gameTime, referencePriceCents: profile.referencePriceCents,
        markedForSale: false, saleOffer: null, };
      state.vehicles.push(v);
      registerAsset(state, {
        vehicleId: v.id, account: "1200",
        name: "Lkw " + String(parseInt(String(v.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0"),
        acquisitionCostCents: buyPrice, acquiredAtMin: state.gameTime,
      });
      const newAchs = checkAchievements(state, state.gameTime);
      result = { ok: true, vehicleId: v.id, vehicleType: profile.id, priceCents: buyPrice, newAchievements: newAchs };
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
      // Szenario: Fahrzeugverkauf-Erlös verfolgen
      if (state.scenario && state.scenario.status === "active") {
        state.scenario.vehicleSaleRevenue = (state.scenario.vehicleSaleRevenue || 0) + offerPrice;
      }
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
      const hireBranch = p.branchId ? state.branches.find(b => b.id === p.branchId) : state.branches[0];
      const hireCity = hireBranch ? hireBranch.city : "Hamburg";
      const hireBranchId = hireBranch ? hireBranch.id : "b1";
      const d = { id: uid(state, "d"), name: app.name, branchId: hireBranchId, costPerDayCents: DRIVER_COST_PER_DAY, locationCity: hireCity, status: "free", restUntil: null, employedDay: dayOf(state.gameTime), portraitId: app.portraitId || null, satisfaction: 70, satisfactionReasons: [], employmentStatus: "employed", attendance: "present", consecutiveLowSatisfactionDays: 0 };
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

      const hireBranch2 = p.branchId ? state.branches.find(b => b.id === p.branchId) : state.branches[0];
      const hireCity2 = hireBranch2 ? hireBranch2.city : "Hamburg";
      const hireBranchId2 = hireBranch2 ? hireBranch2.id : "b1";
      if (role === "driver") {
        // Fahrer werden in das bestehende drivers-Array aufgenommen
        const d = {
          id: uid(state, "d"), name: app.name, branchId: hireBranchId2,
          costPerDayCents: dailyWage, locationCity: hireCity2, status: "free",
          restUntil: null, employedDay: dayOf(state.gameTime),
          portraitId: app.portraitId || null, satisfaction: 70, satisfactionReasons: [],
          employmentStatus: "employed", attendance: "present", consecutiveLowSatisfactionDays: 0,
        };
        state.drivers.push(d);
        result = { ok: true, employeeId: d.id, role: "driver" };
      } else {
        // Nicht fahrende Angestellte werden in das employees-Array aufgenommen
        const emp = {
          id: uid(state, "emp"), name: app.name, role, branchId: hireBranchId2,
          locationCity: hireCity2, employedDay: dayOf(state.gameTime),
          costPerDayCents: dailyWage, hireFeeCents: hireFee,
          satisfaction: 70, satisfactionReasons: [],
          employmentStatus: "employed", exitDate: null,
          attendance: "present", sickUntil: null, vacationUntil: null,
          vacationDaysAvailable: 3,
          activity: "idle", consecutiveLowSatisfactionDays: 0,
          assignedVehicleIds: [], workMode: (role === "dispatcher" || role === "dispatcher_senior" || role === "branch_manager") ? "autonomous" : "suggestions", managementMode: role === "branch_manager" ? "requests_approval" : undefined, assignedBranchId: (role === "dispatcher" || role === "dispatcher_senior" || role === "branch_manager" || role === "mechanic" || role === "cleaner") ? hireBranchId2 : undefined,
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
      // Filiale zuweisen (optional): Disponent disponiert nur deren Fahrzeuge
      if (p.branchId !== undefined) {
        if (p.branchId === null) {
          emp.assignedBranchId = null;
        } else {
          const b = state.branches.find(x => x.id === p.branchId);
          if (!b) throw new Error("Filiale nicht gefunden.");
          if (b.status !== "active") throw new Error("Filiale ist nicht aktiv.");
          emp.assignedBranchId = p.branchId;
          emp.locationCity = b.city;
        }
      }
      // Schicht zuweisen (8-Stunden-Schicht für 24/7-Betrieb)
      if (p.shiftStart != null) emp.shiftStart = p.shiftStart;
      if (p.shiftEnd != null) emp.shiftEnd = p.shiftEnd;
      // Alte Vorschläge aufräumen
      emp.suggestions = [];
      result = { ok: true, employeeId: emp.id, workMode: emp.workMode, shiftStart: emp.shiftStart ?? SERVICE_START_MIN, shiftEnd: emp.shiftEnd ?? SERVICE_END_MIN, assignedBranchId: emp.assignedBranchId || null };
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

    // ---------- Beziehung & Familie ----------

    case "getRelationshipStatus": {
      result = { ok: true, ...getRelationshipStatus(state) };
      break;
    }

    case "getGiftOptions": {
      result = { ok: true, gifts: getGiftOptions(state) };
      break;
    }

    case "giveGift": {
      ensureNotBlocked(state);
      const r = giveGift(state, { giftId: p.giftId });
      result = r;
      break;
    }

    case "proposeMarriage": {
      ensureNotBlocked(state);
      const r = proposeMarriage(state);
      result = r;
      break;
    }

    case "getMarried": {
      ensureNotBlocked(state);
      const r = getMarried(state);
      result = r;
      break;
    }

    case "planChild": {
      ensureNotBlocked(state);
      const r = planChild(state);
      result = r;
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
      const startMin = state.gameTime;
      const log = [];
      // Ein einzelner advanceTo-Aufruf mit ausreichend CPU-Budget (45s) schließt
      // den Vorlauf in einem Durchlauf ab. Die frühere äußere while-Schleife
      // (guard < 60) hat bei CPU-Budget-Abbrüchen bis zu 60×8s = 8 Min blockiert.
      advanceTo(state, target, log, startMin);
      // Statistik direkt aus dem vollen Log (vor Trimming) ableiten.
      // delivery-Events tragen branchId und paymentCents direkt im Log,
      // tour_deployment_started-Events tragen branchId und atMin.
      const stats = { totalDeliveries: 0, totalRevenue: 0, totalTours: 0, branches: {} };
      for (const ev of log) {
        if (ev.type === "delivery") {
          stats.totalDeliveries++;
          stats.totalRevenue += ev.paymentCents || 0;
          const bid = ev.branchId || "_haupt";
          if (!stats.branches[bid]) stats.branches[bid] = { deliveries: 0, revenue: 0, tours: 0 };
          stats.branches[bid].deliveries++;
          stats.branches[bid].revenue += ev.paymentCents || 0;
        } else if (ev.type === "tour_deployment_started") {
          stats.totalTours++;
          const bid = ev.branchId || "_haupt";
          if (!stats.branches[bid]) stats.branches[bid] = { deliveries: 0, revenue: 0, tours: 0 };
          stats.branches[bid].tours++;
        }
      }
      const MAX_LOG = 200;
      const trimmedLog = log.length > MAX_LOG ? log.slice(-MAX_LOG) : log;
      const stoppedEvent = log.find(ev => ev.type === "advance_stopped");
      result = { ok: true, events: trimmedLog, gameTime: state.gameTime, stats, stopped: !!stoppedEvent, stopReason: stoppedEvent?.reason || null };
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
      const MAX_LOG = 200;
      const trimmedLog = log.length > MAX_LOG ? log.slice(-MAX_LOG) : log;
      result = { ok: true, events: trimmedLog, gameTime: state.gameTime, target };
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

    case "setGlobalDispatchMode": {
      const mode = p.mode || "autonomous";
      if (!["suggestions", "dispatch_accepted", "autonomous"].includes(mode)) {
        throw new Error("Ungültiger Dispositions-Modus: " + mode);
      }
      let count = 0;
      for (const emp of (state.employees || [])) {
        if (emp.role !== "dispatcher" && emp.role !== "dispatcher_senior") continue;
        if (emp.employmentStatus !== "employed") continue;
        emp.workMode = mode;
        emp.suggestions = [];
        count++;
      }
      result = { ok: true, mode, dispatcherCount: count };
      break;
    }

    case "dispatchAllNow": {
      ensureNotBlocked(state);
      const freeVehicles = (state.vehicles || []).filter(v =>
        v.status === "free" && v.condition >= 20 && !v.markedForSale &&
        v.ownership_type !== "sold"
      );
      if (freeVehicles.length === 0) {
        result = { ok: true, planned: 0, ordersAccepted: 0, totalContributionCents: 0, vehiclesUsed: 0, reason: "Keine freien Fahrzeuge" };
        break;
      }
      const vehicleIds = freeVehicles.map(v => v.id);
      const r = suggestTours(state, {
        vehicleIds, earliestStart: state.gameTime, horizonMin: 2880,
        desiredEndCity: null, latestReturnMin: null,
        mode: state.marketPriority || "balanced", acceptNew: true,
      });
      const busyOrderIds = new Set();
      for (const tr of state.trips) { if (tr.status === "in_progress" && tr.orderId) busyOrderIds.add(tr.orderId); }
      for (const tr of (state.tours || [])) {
        if (tr.status !== "active") continue;
        for (const d of (tr.deployments || [])) { if (d.orderId && d.status !== "cancelled") busyOrderIds.add(d.orderId); }
      }
      const usedVehicleIds = new Set();
      const usedOrderIds = new Set();
      let planned = 0;
      let ordersAccepted = 0;
      let totalContributionCents = 0;
      for (const sug of r.suggestions) {
        if (usedVehicleIds.has(sug.vehicleId)) continue;
        const allAvailable = sug.orderIds.every(oid => {
          if (usedOrderIds.has(oid) || busyOrderIds.has(oid)) return false;
          const o = state.orders.find(x => x.id === oid);
          return o && (o.status === "offered" || o.status === "angenommen");
        });
        if (!allAvailable) continue;
        const newOrderIds = sug.plan.acceptedOrderIds || [];
        if (newOrderIds.length > 0 && sug.plan.totalContributionCents <= 0) continue;
        try {
          const cr = doConfirmTour(state, {
            vehicleId: sug.vehicleId, driverId: sug.driverId, orderIds: sug.orderIds,
            desiredEndCity: sug.plan.desiredEndCity || null, latestReturnMin: sug.plan.latestReturnMin || null,
          });
          usedVehicleIds.add(sug.vehicleId);
          sug.orderIds.forEach(oid => usedOrderIds.add(oid));
          planned++;
          ordersAccepted += (cr.acceptedOrderIds || []).length;
          totalContributionCents += sug.plan.totalContributionCents || 0;
        } catch (e) { /* skip failed tour */ }
      }
      result = { ok: true, planned, ordersAccepted, totalContributionCents, vehiclesUsed: usedVehicleIds.size, freeVehicles: freeVehicles.length };
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
      const r = leaseTruck(state, { provisionCity: p.provisionCity, offerId: p.offerId, branchId: p.branchId });
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

    case "clearEvents": {
      clearEvents(state);
      result = { ok: true };
      break;
    }

    case "deleteEvent": {
      deleteEvent(state, p.eventId);
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
      // Entwicklungsziele: Zusage "Urlaubswunsch bearbeiten" erfüllen
      const req = (state.absences?.vacationRequests || []).find(rr => rr.id === p.requestId);
      if (req) fulfillPromiseByAction(state, req.personId, "approve_vacation", { requestId: p.requestId });
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
      // Stoerungsmanagement: Personalausfall-Stoerung erzeugen bei betroffenen Touren
      if (r.ok) generateAbsenceDisruption(state, p.personId, state.gameTime, []);
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
      // Entwicklungsziele: Zusage "Gehaltsanpassung" erfüllen
      fulfillPromiseByAction(state, p.personId, "raise_salary", { newDailyWageCents: p.newDailyWageCents });
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
      // Entwicklungsziele: Zusage "Weiterbildung buchen" erfüllen
      fulfillPromiseByAction(state, p.personId, "book_course", { courseId: p.courseId });
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

    // ---------- Filialverwaltung ----------

    case "checkBranchRequirements": {
      result = checkBranchRequirements(state);
      break;
    }

    case "openBranch": {
      ensureNotBlocked(state);
      const r = openBranch(state, { city: p.city, name: p.name });
      result = r;
      break;
    }

    case "renameBranch": {
      ensureNotBlocked(state);
      const r = renameBranch(state, { branchId: p.branchId, name: p.name });
      result = r;
      break;
    }

    case "closeBranch": {
      ensureNotBlocked(state);
      const r = closeBranch(state, { branchId: p.branchId });
      result = r;
      break;
    }

    case "previewMoveVehicle": {
      result = previewMoveVehicle(state, { vehicleId: p.vehicleId, targetBranchId: p.targetBranchId });
      break;
    }

    case "moveVehicle": {
      ensureNotBlocked(state);
      const r = moveVehicle(state, { vehicleId: p.vehicleId, targetBranchId: p.targetBranchId });
      result = r;
      break;
    }

    case "previewMoveDriver": {
      result = previewMoveDriver(state, { driverId: p.driverId, targetBranchId: p.targetBranchId });
      break;
    }

    case "moveDriver": {
      ensureNotBlocked(state);
      const r = moveDriver(state, { driverId: p.driverId, targetBranchId: p.targetBranchId });
      result = r;
      break;
    }

    case "assignDispatcherToBranch":
    case "assignEmployeeToBranch": {
      ensureNotBlocked(state);
      const r = assignDispatcherToBranch(state, { employeeId: p.employeeId, branchId: p.branchId });
      result = r;
      break;
    }

    case "getBranchStats": {
      result = { ok: true, branches: getBranchStats(state) };
      break;
    }

    case "setDevelopmentFocus": {
      const r = doSetFocus(state, p.focusId);
      result = r;
      break;
    }

    case "setBusinessFocus": {
      const r = doSetBusinessFocus(state, p.focusId);
      result = r;
      break;
    }

    case "setBranchBusinessFocus": {
      const r = doSetBranchBusinessFocus(state, p.branchId, p.focusId);
      result = r;
      break;
    }

    case "getBusinessFocus": {
      result = { ok: true, ...getBusinessFocus(state) };
      break;
    }

    case "getSegmentStats": {
      result = { ok: true, ...getSegmentStats(state) };
      break;
    }

    case "getMarketOverview": {
      result = { ok: true, ...getMarketOverview(state) };
      break;
    }

    case "startOnboarding": {
      const r = startOnboarding(state);
      result = r;
      break;
    }

    case "pauseOnboarding": {
      const r = pauseOnboarding(state);
      result = r;
      break;
    }

    case "resumeOnboarding": {
      const r = resumeOnboarding(state);
      result = r;
      break;
    }

    case "dismissOnboarding": {
      const r = dismissOnboarding(state);
      result = r;
      break;
    }

    case "markOnboardingReviewed": {
      const r = markOnboardingReviewed(state);
      result = r;
      break;
    }

    default: {
      const dgResult = handleDgCommand(state, command, p);
      if (dgResult !== null) { result = dgResult; break; }
      const invResult = handleInvestmentCommand(state, command, p);
      if (invResult !== null) { result = invResult; break; }
      const datingResult = handleDatingCommand(state, command, p);
      if (datingResult !== null) { result = datingResult; break; }
      const customerResult = handleCustomerCommand(state, command, p);
      if (customerResult !== null) { result = customerResult; break; }
      const delegationResult = handleDelegationCommand(state, command, p);
      if (delegationResult !== null) { result = delegationResult; break; }
      const storyResult = handleStoryCommand(state, command, p); if (storyResult !== null) { result = storyResult; break; }
      const mailResult = handleMailCommand(state, command, p); if (mailResult !== null) { result = mailResult; break; }
      const devGoalsResult = handleDevelopmentGoalsCommand(state, command, p); if (devGoalsResult !== undefined) { result = devGoalsResult; break; }
      const disruptionResult = handleDisruptionCommand(state, command, p); if (disruptionResult !== null) { result = disruptionResult; break; }
      const vehicleMarketResult = handleVehicleMarketCommand(state, command, p); if (vehicleMarketResult !== null) { result = vehicleMarketResult; break; }
      throw new Error("Unbekannter Befehl: " + command);
    }
  }
  // processedGameMinute mit gameTime synchronisieren (manuelle Zeitfortschritte aktualisieren gameTime, aber nicht processedGameMinute).
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