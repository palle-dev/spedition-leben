import { retainLatestHistory } from "./historyRetention.ts";
// Führungs- und Delegations-Engine für FERNWERK.
// Zentrale Verwaltung von Befugnissen, finanziellen Grenzen, Freigaben
// und Entscheidungsgründen für alle automatisierten Mitarbeiter.
//
// Design-Prinzipien:
// - Baut auf bestehenden Automatikmodi auf (workMode, managementMode, assistantConfig)
// - Kein zweites, konkurrierendes Automatiksystem
// - Bestehende Spielstände behalten ihre Einstellungen (Migration)
// - Budget-Prüfung unmittelbar vor der Ausführung, nicht im Voraus
// - Freigaben sind keine ausgeführten Ausgaben (keine Reservierung in dieser Stufe)
// - Eindeutige Dedup-Keys verhindern wiederholte Anfragen für denselben Vorgang
// - Begründungen aus tatsächlichen Planungsdaten, keine erfundenen Gründe

import { dayOf, formatGameTime } from "./gameRules.ts";
import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";

// ---------- Konstanten ----------
const DELEGATION_VERSION = 1;
const APPROVAL_VERSION = 1;
const MAX_DECISION_LOG = 100;
const MAX_RESOLVED_APPROVALS = 50;

// Voreinstellungen — verändern erst nach bewusster Auswahl die Regeln.
// Individuelle Werte bleiben danach einstellbar.
export const PRESETS = {
  close_guidance: {
    id: "close_guidance",
    label: "Eng begleiten",
    description: "Vorschläge und wenige selbstständige Aktionen. Gut für den Start.",
    rules: {
      maxSpendPerActionCents: 10000,      // 100 €
      dailyBudgetCents: 50000,            // 500 €
      minLiquidityCents: 100000,          // 1000 € Puffer
      allowedMaintenance: ["internal_standard"],
      allowedServices: [],
      approvalMode: "stop",
      autoAcceptOrders: false,
      autoDispatch: false,
      canDispatchExternally: false,
    },
  },
  daily_relief: {
    id: "daily_relief",
    label: "Im Tagesgeschäft entlasten",
    description: "Routine innerhalb klarer Grenzen. Der Regelfall für eine etablierte Spedition.",
    rules: {
      maxSpendPerActionCents: 50000,      // 500 €
      dailyBudgetCents: 200000,           // 2000 €
      minLiquidityCents: 50000,           // 500 € Puffer
      allowedMaintenance: ["internal_standard", "external_standard"],
      allowedServices: ["cleaning", "towing"],
      approvalMode: "continue",
      autoAcceptOrders: true,
      autoDispatch: true,
      canDispatchExternally: false,
    },
  },
  autonomous_branch: {
    id: "autonomous_branch",
    label: "Filiale selbstständig führen",
    description: "Erweiterte operative Befugnisse mit verbindlichen Budgets.",
    rules: {
      maxSpendPerActionCents: 200000,     // 2000 €
      dailyBudgetCents: 500000,           // 5000 €
      minLiquidityCents: 30000,           // 300 € Puffer
      allowedMaintenance: ["internal_standard", "external_standard", "internal_urgent"],
      allowedServices: ["cleaning", "towing", "temp_staff", "rental_truck"],
      approvalMode: "continue",
      autoAcceptOrders: true,
      autoDispatch: true,
      canDispatchExternally: false,
    },
  },
};

// Rollen-Befugnisse: Was darf diese Rolle grundsätzlich?
// Eine großzügige Finanzgrenze gibt einem Fahrer NICHT die Befugnisse
// eines Filialleiters — die Rolle muss ebenfalls passen.
export const ROLE_AUTHORITY = {
  driver:              { canSpend: false, canAcceptOrders: false, canPlanTours: false, canHire: false, canBuyVehicle: false, canBookMaintenance: false },
  dispatcher:          { canSpend: false, canAcceptOrders: true,  canPlanTours: true,  canHire: false, canBuyVehicle: false, canBookMaintenance: false, canDispatchExternally: false },
  dispatcher_senior:   { canSpend: true,  canAcceptOrders: true,  canPlanTours: true,  canHire: false, canBuyVehicle: false, canBookMaintenance: false, canDispatchExternally: true },
  cleaner:             { canSpend: false, canAcceptOrders: false, canPlanTours: false, canHire: false, canBuyVehicle: false, canBookMaintenance: false },
  mechanic:            { canSpend: true,  canAcceptOrders: false, canPlanTours: false, canHire: false, canBuyVehicle: false, canBookMaintenance: true },
  accountant:          { canSpend: false, canAcceptOrders: false, canPlanTours: false, canHire: false, canBuyVehicle: false, canBookMaintenance: false },
  accountant_senior:   { canSpend: false, canAcceptOrders: false, canPlanTours: false, canHire: false, canBuyVehicle: false, canBookMaintenance: false },
  assistant:           { canSpend: true,  canAcceptOrders: true,  canPlanTours: true,  canHire: false, canBuyVehicle: false, canBookMaintenance: false, canBookTraining: true, canDispatchExternally: true },
  branch_manager:      { canSpend: true,  canAcceptOrders: true,  canPlanTours: true,  canHire: true,  canBuyVehicle: false, canBookMaintenance: true, canBuildWorkshop: false, canDispatchExternally: true },
};

// ---------- Migration ----------
export function migrateDelegation(state) {
  if (!state.delegation || state.delegation.version !== DELEGATION_VERSION) {
    // Bestehende Einstellungen übernehmen: assistantConfig, workshop automation
    // bestimmen die Startwerte, damit keine neuen Befugnisse unbemerkt entstehen.
    const existingConfig = state.assistantConfig || {};
    const existingWorkshop = state.workshop?.automationProfile || {};
    const existingAutoAccept = existingConfig.autoAcceptOrders !== false;
    const existingAutoDispatch = existingConfig.autoDispatch !== false;

    // Standard: "daily_relief" wenn Automatik bereits an, sonst "close_guidance"
    const defaultPreset = (existingAutoAccept || existingAutoDispatch) ? "daily_relief" : "close_guidance";
    const baseRules: typeof PRESETS.daily_relief.rules & {autoAcceptMarginPct?: number; trainingBudgetPerDay?: number; workshopMaxCostCents?: number} = { ...PRESETS[defaultPreset].rules };

    // Bestehende assistantConfig-Werte übernehmen, nicht überschreiben
    if (existingConfig.autoAcceptMarginPct != null) baseRules.autoAcceptMarginPct = existingConfig.autoAcceptMarginPct;
    if (existingConfig.autoAcceptMinLiquidityCents != null) baseRules.minLiquidityCents = existingConfig.autoAcceptMinLiquidityCents;
    if (existingConfig.trainingBudgetPerDay != null) baseRules.trainingBudgetPerDay = existingConfig.trainingBudgetPerDay;
    if (existingWorkshop.maxCostCents != null) baseRules.workshopMaxCostCents = existingWorkshop.maxCostCents;

    state.delegation = {
      version: DELEGATION_VERSION,
      preset: defaultPreset,
      rules: baseRules,
      branchOverrides: {},
      dailySpend: { day: dayOf(state.gameTime || 0), companyCents: 0, byBranch: {}, byEmployee: {} },
      decisionLog: [],
      stats: { autoResolved: 0, pendingApprovals: 0, blockedActions: 0, delegatedSpendCents: 0 },
    };
  }
  // Tages-Spend zurücksetzen bei Tageswechsel
  resetDailySpendIfNeeded(state);
}

function approvalActionKey(req) {
  const data = req.actionData || {};
  if (req.type === "maintenance" && data.vehicleId && data.branchId && (!data.type || data.type === "standard")) {
    return JSON.stringify(["maintenance", data.vehicleId, data.branchId, data.type || "standard"]);
  }
  if (data.type === "partner_booking") return JSON.stringify(["partner_booking", data.orderId, data.partnerId]);
  if (data.type === "site_expansion") return JSON.stringify(["site_expansion", data.branchId, data.expansionType, data.slots ?? 1]);
  if (data.vehicleId && data.driverId && Array.isArray(data.orderIds)) {
    return JSON.stringify(["tour", data.vehicleId, data.driverId, data.orderIds, data.desiredEndCity || null, data.latestReturnMin || null]);
  }
  return null;
}

function approvalFingerprint(req, key) {
  return JSON.stringify([key, req.costCents || 0, req.employeeId || null, req.urgency || "medium", req.violatedRule || ""]);
}

// Ablehnungen bleiben unabhängig von der gekürzten Anzeige-Historie erhalten.
// Erledigte/entfernte Vorgänge geben den Eintrag wieder frei.
function rejectionStillRelevant(state, req) {
  const data = req.actionData || {};
  if (req.type === "maintenance") {
    const vehicle = (state.vehicles || []).find(v => v.id === data.vehicleId);
    return !!vehicle && !["sold", "archived"].includes(vehicle.status) &&
      vehicle.condition < (state.workshop?.automationProfile?.routineThreshold ?? 60) &&
      !(state.workshop?.maintenanceOrders || []).some(o => o.vehicleId === data.vehicleId &&
        ["planned", "waiting", "in_progress", "interrupted"].includes(o.status));
  }
  if (data.type === "site_expansion") return (state.branches || []).some(b => b.id === data.branchId && b.status === "active") &&
    !(state.siteExpansion?.projects || []).some(p => p.branchId === data.branchId && p.status === "active");
  const ids = data.orderIds || [data.orderId];
  return ids.length > 0 && ids.every(id => (state.orders || []).some(o => o.id === id &&
    ["offered", "angenommen"].includes(o.status) && !o.externalTransportId && !o.reservedByTourId));
}

export function migrateApprovals(state) {
  if (!state.delegation) migrateDelegation(state);
  if (!state.approvals || state.approvals.version !== APPROVAL_VERSION) {
    state.approvals = {
      version: APPROVAL_VERSION,
      pending: [],
      resolved: [],
    };
  }
  if (!state.approvals.rejections) state.approvals.rejections = {};
  for (const [key, req] of Object.entries(state.approvals.rejections) as [string, any][]) {
    if (!rejectionStillRelevant(state, req)) delete state.approvals.rejections[key];
  }
  // Alte Zeitstempel-Keys normalisieren; unterschiedliche Beträge getrennt lassen.
  const seen = new Set();
  for (const req of state.approvals.pending) {
    if (req.status !== "pending") continue;
    const key = approvalActionKey(req);
    if (!key) continue;
    req.dedupKey = key;
    const identity = JSON.stringify([key, req.costCents]);
    if (!seen.has(identity)) { seen.add(identity); continue; }
    req.status = "superseded";
    req.resolvedAtMin = state.gameTime;
    req.supersedeReason = "Identische Freigabeanfrage bereits vorhanden";
    moveResolved(state, req);
  }
  state.delegation.stats.pendingApprovals = state.approvals.pending.filter(a => a.status === "pending").length;
}

// ---------- Tages-Reset ----------
export function resetDailySpendIfNeeded(state) {
  if (!state.delegation) migrateDelegation(state);
  const day = dayOf(state.gameTime || 0);
  if (state.delegation.dailySpend.day !== day) {
    state.delegation.dailySpend = { day, companyCents: 0, byBranch: {}, byEmployee: {} };
  }
}

// ---------- Regel-Abfrage ----------
// Liefert die wirksamen Regeln für eine Filiale (Unternehmensregel +
// eventuelle Filial-Überschreibung). Gibt auch die Quelle zurück.
export function getEffectiveRules(state, branchId) {
  if (!state.delegation) migrateDelegation(state);
  const base = state.delegation.rules;
  const override = branchId ? state.delegation.branchOverrides[branchId] : null;
  if (!override) return { rules: base, source: "company", overridden: false };
  // Merge: Filial-Override gewinnt für gesetzte Keys
  const merged = { ...base, ...override };
  return { rules: merged, source: "branch", overridden: true, overrideBranchId: branchId };
}

// Wirksames Tagesbudget: der Preset-Wert ist eine pro-Lkw-Ausgabeobergrenze,
// kein starres Unternehmenslimit. Eine feste 2000-€-Grenze (Preset "daily_relief")
// ist für eine 24-Fahrzeug-Flotte schon nach wenigen Touren erschöpft und blockiert
// jede weitere automatische Auftragsannahme. Das Budget skaliert daher mit der
// aktiven Flotte; die Mindestliquidität (minLiquidityCents) bleibt der echte Anker.
export function effectiveDailyBudgetCents(state, rules) {
  if (!state.delegation) migrateDelegation(state);
  const activeVehicles = (state.vehicles || []).filter(v =>
    v.status !== "sold" && v.status !== "archived" && !v.markedForSale
  ).length;
  return Math.round((rules?.dailyBudgetCents || 0) * Math.max(1, activeVehicles));
}

// ---------- Budget-Prüfung ----------
// Prüft unmittelbar vor der Ausführung, ob eine Ausgabe erlaubt ist.
// Gibt { allowed, reason, violatedRule } zurück.
// Prüft: Rollen-Befugnis, maxSpendPerAction, dailyBudget, minLiquidity.
export function checkSpendAuthority(state, employeeId, amountCents, opts) {
  if (!state.delegation) migrateDelegation(state);
  const emp = findEmployee(state, employeeId);
  if (!emp) return { allowed: false, reason: "Mitarbeiter nicht gefunden", violatedRule: "unknown" };

  const branchId = opts?.branchId || emp.assignedBranchId || emp.branchId || null;
  const { rules } = getEffectiveRules(state, branchId);

  // 1. Rollen-Befugnis: Darf diese Rolle überhaupt Ausgaben tätigen?
  const roleAuth = ROLE_AUTHORITY[emp.role] || ROLE_AUTHORITY.driver;
  const tourSpend = opts?.purpose === "tour" && roleAuth.canPlanTours &&
    ["autonomous", "dispatch_accepted"].includes(emp.workMode) && rules.autoDispatch !== false;
  if (opts?.purpose === "tour" && !tourSpend) return { allowed: false, reason: "Automatische Tourenplanung ist nicht freigegeben", violatedRule: "role_authority" };
  if (amountCents > 0 && !roleAuth.canSpend && !tourSpend) {
    return { allowed: false, reason: `Rolle "${emp.role}" hat keine Ausgabenbefugnis`, violatedRule: "role_authority" };
  }

  // 2. Maximale Einzelausgabe
  if (amountCents > rules.maxSpendPerActionCents) {
    return { allowed: false, reason: `Ausgabe ${(amountCents / 100).toFixed(2)} € übersteigt Limit ${(rules.maxSpendPerActionCents / 100).toFixed(2)} €`, violatedRule: "maxSpendPerAction" };
  }

  // 3. Tagesbudget (flottenskaliert — Preset-Wert gilt pro aktiven Lkw)
  resetDailySpendIfNeeded(state);
  const spentToday = state.delegation.dailySpend.companyCents;
  const dailyBudget = effectiveDailyBudgetCents(state, rules);
  if (spentToday + amountCents > dailyBudget) {
    return { allowed: false, reason: `Tagesbudget erschöpft: ${spentToday / 100} + ${amountCents / 100} > ${dailyBudget / 100} €`, violatedRule: "dailyBudget" };
  }

  // 4. Mindestliquidität nach Ausgabe
  const balance = state.company?.accountCents || 0;
  if (balance - amountCents < rules.minLiquidityCents) {
    return { allowed: false, reason: `Kontopuffer unterschritten: ${(balance - amountCents) / 100} < ${(rules.minLiquidityCents / 100)} €`, violatedRule: "minLiquidity" };
  }

  return { allowed: true, rules };
}

// Erfasst eine getätigte Ausgabe im Tagesbudget.
// Ein Unternehmensbudget-Zähler — keine doppelte Belastung.
export function recordSpend(state, employeeId, amountCents, branchId) {
  if (!state.delegation) migrateDelegation(state);
  resetDailySpendIfNeeded(state);
  const ds = state.delegation.dailySpend;
  ds.companyCents += amountCents;
  if (branchId) ds.byBranch[branchId] = (ds.byBranch[branchId] || 0) + amountCents;
  ds.byEmployee[employeeId] = (ds.byEmployee[employeeId] || 0) + amountCents;
  state.delegation.stats.delegatedSpendCents += amountCents;
}

// ---------- Freigaben ----------
// Erzeugt eine Freigabeanfrage. Dedup-Key verhindert wiederholte Anfragen
// für denselben unveränderten Vorgang.
export function createApprovalRequest(state, opts) {
  if (!state.approvals) migrateApprovals(state);
  const dedupKey = approvalActionKey(opts) || opts.dedupKey || (opts.type + ":" + (opts.actionData?.dedupId || opts.employeeId));
  // Bestehende pending-Anfrage für denselben Vorgang finden
  const existing = state.approvals.pending.find(a => a.dedupKey === dedupKey && a.status === "pending");
  if (existing) return { request: existing, isNew: false, rejected: false };
  const rejected = state.approvals.rejections?.[dedupKey];
  if (rejected?.rejectionFingerprint === approvalFingerprint(opts, dedupKey)) {
    return { request: rejected, isNew: false, rejected: true };
  }
  if (rejected) delete state.approvals.rejections[dedupKey];

  const request = {
    id: "apr_" + (state.idCounter = (state.idCounter || 100) + 1),
    dedupKey,
    employeeId: opts.employeeId,
    employeeName: opts.employeeName || findEmployee(state, opts.employeeId)?.name || "—",
    employeeRole: opts.employeeRole || findEmployee(state, opts.employeeId)?.role || "—",
    branchId: opts.branchId || null,
    branchName: opts.branchName || null,
    type: opts.type,                  // "spend" | "accept_order" | "maintenance" | "hire" | "buy_vehicle" | "build_workshop" | "other"
    title: opts.title || "Freigabe erforderlich",
    description: opts.description || "",
    reasoning: opts.reasoning || "",   // Kurze Begründung aus Planungsdaten
    costCents: opts.costCents || 0,
    impactDesc: opts.impactDesc || "",
    violatedRule: opts.violatedRule || "",
    alternatives: opts.alternatives || [],
    urgency: opts.urgency || "medium",
    deadlineMin: opts.deadlineMin ?? null,
    createdAtMin: state.gameTime,
    actionData: opts.actionData || {},
    status: "pending",
  };
  state.approvals.pending.push(request);
  state.delegation.stats.pendingApprovals = state.approvals.pending.filter(a => a.status === "pending").length;

  pushEvent(state, {
    type: "approval_requested",
    gameTime: state.gameTime, isSystem: true,
    employeeId: opts.employeeId, employeeName: request.employeeName,
    details: { title: request.title, costCents: request.costCents, violatedRule: request.violatedRule, urgency: request.urgency },
    dedupKey: "approval:" + request.id,
  });
  return { request, isNew: true, rejected: false };
}

// Freigabe einer Anfrage — prüft erneut, ob die Aktion noch möglich ist.
export function approveApproval(state, requestId, executeAction = null) {
  if (!state.approvals) migrateApprovals(state);
  const req = state.approvals.pending.find(a => a.id === requestId && a.status === "pending");
  if (!req) throw new Error("Freigabe nicht gefunden oder bereits bearbeitet.");

  // Erneute Prüfung: Hat sich der Zustand geändert?
  const recheck = recheckApproval(state, req);
  if (!recheck.stillValid) {
    req.status = "superseded";
    req.resolvedAtMin = state.gameTime;
    req.supersedeReason = recheck.reason;
    moveResolved(state, req);
    return { ok: false, superseded: true, reason: recheck.reason };
  }

  // Erst ausführen, dann als genehmigt markieren. Ein Fehler lässt die Anfrage offen.
  const execution = executeAction?.(req) || {};
  if (execution.superseded) {
    req.status = "superseded";
    req.resolvedAtMin = state.gameTime;
    req.supersedeReason = execution.reason;
    moveResolved(state, req);
    return execution;
  }
  if (execution.ok === false) throw new Error(execution.error || "Aktion konnte nicht ausgeführt werden.");
  req.status = "approved";
  req.resolvedAtMin = state.gameTime;
  moveResolved(state, req);
  return { ok: true, requestId, actionData: req.actionData, ...execution };
}

export function rejectApproval(state, requestId) {
  if (!state.approvals) migrateApprovals(state);
  const req = state.approvals.pending.find(a => a.id === requestId && a.status === "pending");
  if (!req) throw new Error("Freigabe nicht gefunden oder bereits bearbeitet.");
  req.status = "rejected";
  req.resolvedAtMin = state.gameTime;
  const key = approvalActionKey(req);
  if (key) {
    if (!state.approvals.rejections) state.approvals.rejections = {};
    state.approvals.rejections[key] = { ...req, rejectionFingerprint: approvalFingerprint(req, key) };
  }
  moveResolved(state, req);
  return { ok: true, requestId };
}

// Prüft, ob eine Freigabe noch gültig ist (Zustand hat sich nicht geändert).
function recheckApproval(state, req) {
  if (req.deadlineMin != null && state.gameTime > req.deadlineMin) return { stillValid: false, reason: "Freigabefrist abgelaufen" };
  const emp = findEmployee(state, req.employeeId);
  if (!emp || !isActivelyEmployedSafe(emp)) return { stillValid: false, reason: "Mitarbeiter nicht mehr beschäftigt" };
  if (req.costCents > 0) {
    const balance = state.company?.accountCents || 0;
    if (balance < req.costCents) return { stillValid: false, reason: "Firmenkonto reicht nicht mehr aus" };
  }
  return { stillValid: true };
}

// Abgelaufene Freigaben werden NICHT automatisch genehmigt.
// Sie werden als "expired" markiert und die Folgeaktion unterlassen.
export function expireApprovals(state) {
  if (!state.approvals) migrateApprovals(state);
  const m = state.gameTime;
  let expired = 0;
  for (const req of state.approvals.pending) {
    if (req.status !== "pending") continue;
    if (req.deadlineMin != null && m > req.deadlineMin) {
      req.status = "expired";
      req.resolvedAtMin = m;
      expired++;
      moveResolved(state, req);
    }
  }
  if (expired > 0) {
    state.delegation.stats.pendingApprovals = state.approvals.pending.filter(a => a.status === "pending").length;
  }
  return expired;
}

function moveResolved(state, req) {
  state.approvals.pending = state.approvals.pending.filter(a => a.id !== req.id);
  state.approvals.resolved.push({ id: req.id, type: req.type, title: req.title, status: req.status, employeeName: req.employeeName, costCents: req.costCents, resolvedAtMin: req.resolvedAtMin, supersedeReason: req.supersedeReason });
  if (state.approvals.resolved.length > MAX_RESOLVED_APPROVALS) state.approvals.resolved = retainLatestHistory(state, "approvals", state.approvals.resolved, MAX_RESOLVED_APPROVALS, null);
  state.delegation.stats.pendingApprovals = state.approvals.pending.filter(a => a.status === "pending").length;
}

// ---------- Entscheidungs-Log ----------
// Kompakte Erfassung getätigter Entscheidungen mit kurzem Grund.
export function logDecision(state, opts) {
  if (!state.delegation) migrateDelegation(state);
  state.delegation.decisionLog.push({
    atMin: state.gameTime,
    employeeId: opts.employeeId,
    employeeName: opts.employeeName,
    type: opts.type,
    summary: opts.summary,
    reasoning: opts.reasoning || "",
    costCents: opts.costCents || 0,
    auto: opts.auto !== false,
  });
  if (state.delegation.decisionLog.length > MAX_DECISION_LOG) {
    state.delegation.decisionLog = retainLatestHistory(state, "delegationDecisions", state.delegation.decisionLog, MAX_DECISION_LOG, null);
  }
  if (opts.auto !== false) state.delegation.stats.autoResolved++;
}

// Blockierte Aktion erfassen
export function recordBlockedAction(state, opts) {
  if (!state.delegation) migrateDelegation(state);
  state.delegation.stats.blockedActions++;
  logDecision(state, {
    employeeId: opts.employeeId,
    employeeName: opts.employeeName,
    type: "blocked",
    summary: opts.summary,
    reasoning: opts.reasoning,
    auto: false,
  });
}

// ---------- Zeitsteuerung: Anhalten bei Freigabe ----------
// Prüft, ob bei ausstehenden Freigaben angehalten werden soll.
export function shouldStopForApproval(state) {
  if (!state.delegation) migrateDelegation(state);
  if (state.delegation.rules.approvalMode !== "stop") return false;
  if (!state.approvals) migrateApprovals(state);
  return state.approvals.pending.some(a => a.status === "pending");
}

// ---------- Hilfsfunktionen ----------
function findEmployee(state, id) {
  return (state.employees || []).find(e => e.id === id)
    || (state.drivers || []).find(d => d.id === id)
    || null;
}

function isActivelyEmployedSafe(emp) {
  return emp && emp.employmentStatus === "employed";
}

// ---------- UI-Hilfsfunktionen ----------
export function getDelegationSummary(state) {
  if (!state.delegation) migrateDelegation(state);
  if (!state.approvals) migrateApprovals(state);
  resetDailySpendIfNeeded(state);
  const rules = state.delegation.rules;
  const ds = state.delegation.dailySpend;
  const pending = state.approvals.pending.filter(a => a.status === "pending");
  const recentDecisions = (state.delegation.decisionLog || []).slice(-15).reverse();
  return {
    rules,
    preset: state.delegation.preset,
    branchOverrides: state.delegation.branchOverrides,
    dailySpend: ds,
    dailyBudgetRemaining: Math.max(0, effectiveDailyBudgetCents(state, rules) - ds.companyCents),
    pendingApprovals: pending,
    pendingCount: pending.length,
    recentDecisions,
    stats: state.delegation.stats,
  };
}

// Voreinstellung anwenden — überschreibt alle Regelwerte.
export function applyPreset(state, presetId) {
  if (!state.delegation) migrateDelegation(state);
  const preset = PRESETS[presetId];
  if (!preset) throw new Error("Unbekannte Voreinstellung: " + presetId);
  state.delegation.preset = presetId;
  state.delegation.rules = { ...preset.rules };
  // Bestehende assistantConfig und workshop automation synchronisieren
  if (!state.assistantConfig) state.assistantConfig = {};
  state.assistantConfig.autoAcceptOrders = preset.rules.autoAcceptOrders;
  state.assistantConfig.autoDispatch = preset.rules.autoDispatch;
  if (!state.workshop) state.workshop = {};
  if (!state.workshop.automationProfile) state.workshop.automationProfile = {};
  state.workshop.automationProfile.maxCostCents = preset.rules.workshopMaxCostCents || state.workshop.automationProfile.maxCostCents;
  return { ok: true, preset: presetId };
}

// Einzelne Regel aktualisieren (Unternehmen oder Filiale)
export function updateRule(state, key, value, branchId) {
  if (!state.delegation) migrateDelegation(state);
  if (branchId) {
    if (!state.delegation.branchOverrides[branchId]) state.delegation.branchOverrides[branchId] = {};
    state.delegation.branchOverrides[branchId][key] = value;
  } else {
    state.delegation.rules[key] = value;
    // assistantConfig synchron halten
    if (key === "autoAcceptOrders" && state.assistantConfig) state.assistantConfig.autoAcceptOrders = value;
    if (key === "autoDispatch" && state.assistantConfig) state.assistantConfig.autoDispatch = value;
  }
  return { ok: true, key, value, branchId };
}

// Filial-Override entfernen (auf Unternehmensregel zurücksetzen)
export function clearBranchOverride(state, branchId) {
  if (!state.delegation) migrateDelegation(state);
  delete state.delegation.branchOverrides[branchId];
  return { ok: true, branchId };
}