// Aggregations- und Ableitungslogik für die Büro-Zentralansicht (Auftrag 28).
// Alle Aggregationen berechnen sich aus dem vollständigen autorisierten Bestand,
// niemals aus einer Teilmenge gerendelter Karten.

import { formatGameTime, dayOf, clockOf, PERSONNEL_ROLES, formatEuro } from "./gameData";
import { getPnL, getOpenItems, getAccountBalance } from "./accountingData";
import { computeCreditLimit, computeEquity, getVehicleBookValue } from "./financingData";
import { computeCompanyValue, getDevelopmentStage, getExperienceLevel } from "./progressEngine";
import { vehicleDisplayName } from "./displayHelpers";

// ---------- Zeitraum-Definitionen ----------
export const PERIODS = [
  { id: "today", label: "Heute", days: 1 },
  { id: "week", label: "7 Tage", days: 7 },
  { id: "month", label: "30 Tage", days: 30 },
];

export function periodRange(state, periodId) {
  const p = PERIODS.find(x => x.id === periodId) || PERIODS[0];
  const endMin = state.gameTime;
  const startMin = Math.max(0, Math.floor(state.gameTime / 1440) * 1440 - (p.days - 1) * 1440);
  return { ...p, startMin, endMin };
}

// ---------- Firmenliquidität ----------
export function getLiquidity(state) {
  const bankBalance = state.company?.accountCents || 0;
  const openCompanyCosts = (state.openCosts || [])
    .filter(o => o.account === "company")
    .reduce((s, o) => s + o.amountCents, 0);
  const openItems = getOpenItems(state);
  const dueLiabilities = openItems.reduce((s, o) => s + o.remainingCents, 0);
  const creditLimit = computeCreditLimit(state);
  return {
    bankBalance,
    openCompanyCosts,
    dueLiabilities,
    availableCredit: creditLimit.available,
    netAvailable: bankBalance - openCompanyCosts - dueLiabilities,
  };
}

// ---------- Operatives Ergebnis ----------
export function getOperationalResult(state, periodId) {
  const range = periodRange(state, periodId);
  const pnl = getPnL(state, range.startMin, range.endMin);
  // Cashflow als Fallback, wenn GuV noch keine Daten hat
  return {
    revenue: pnl.revenue,
    expenses: pnl.expenses,
    result: pnl.result,
    hasData: pnl.lines.length > 0,
    period: range,
  };
}

// ---------- Auftragsbestand ----------
export function getOrderStats(state) {
  const orders = state.orders || [];
  const trips = state.trips || [];
  const tours = state.tours || [];

  const offered = orders.filter(o => o.status === "offered");
  const accepted = orders.filter(o => o.status === "angenommen");
  // Verbindlich geplant: Auftrag hat eine bestätigte Tour oder einen gestarteten Trip
  const planned = orders.filter(o =>
    o.status === "unterwegs" ||
    tours.some(t => t.status === "active" && (t.deployments || []).some(d => d.orderId === o.id))
  );
  const active = orders.filter(o =>
    trips.some(t => t.orderId === o.id && t.status === "in_progress")
  );
  const delivered = orders.filter(o => o.status === "geliefert");

  // Unzugewiesene angenommene Aufträge (kein Trip, keine Tour)
  const unassigned = accepted.filter(o =>
    !trips.some(t => t.orderId === o.id && t.status === "in_progress") &&
    !tours.some(t => t.status === "active" && (t.deployments || []).some(d => d.orderId === o.id))
  );

  return {
    offered: offered.length,
    accepted: accepted.length,
    unassigned: unassigned.length,
    planned: planned.length,
    active: active.length,
    delivered: delivered.length,
    total: orders.length,
    unassignedList: unassigned,
  };
}

// ---------- Flottenstatistik ----------
export function getFleetStats(state) {
  const vehicles = (state.vehicles || []).filter(v => v.status !== "archived" && v.status !== "sold");

  // Primäre Betriebszustandsverteilung (eindeutig – jedes Fahrzeug in genau einer Kategorie)
  const byStatus = { free: 0, on_trip: 0, maintenance: 0 };
  for (const v of vehicles) {
    if (v.status === "free") byStatus.free++;
    else if (v.status === "on_trip") byStatus.on_trip++;
    else if (v.status === "maintenance") byStatus.maintenance++;
  }

  // Eigentumsdimension (überlagert, nicht addiert zur Fahrzeugzahl)
  const byOwnership = { owned: 0, leased: 0, rented: 0 };
  for (const v of vehicles) {
    const type = v.ownership_type || "owned";
    byOwnership[type] = (byOwnership[type] || 0) + 1;
  }

  // Wartungsbedürftige Fahrzeuge (Zustand < 60, frei, nicht bereits in Wartung)
  const needsMaintenance = vehicles.filter(v =>
    v.status === "free" && v.condition < 60
  ).length;

  // Kritischer Zustand (< 30)
  const criticalCondition = vehicles.filter(v =>
    v.status === "free" && v.condition < 30
  ).length;

  return {
    total: vehicles.length,
    byStatus,
    byOwnership,
    needsMaintenance,
    criticalCondition,
  };
}

// ---------- Personalstatistik ----------
export function getPersonnelStats(state) {
  const drivers = (state.drivers || []).filter(d => d.employmentStatus === "employed");
  const employees = (state.employees || []).filter(e => e.employmentStatus === "employed");

  // Alle Beschäftigten mit Rolle
  const allStaff = [
    ...drivers.map(d => ({ ...d, role: "driver" })),
    ...employees,
  ];

  const byRole = {};
  for (const p of allStaff) {
    byRole[p.role] = (byRole[p.role] || 0) + 1;
  }

  // Verfügbarkeit
  const present = allStaff.filter(p => p.attendance === "present").length;
  const onTrip = drivers.filter(d => d.status === "on_trip").length;
  const resting = drivers.filter(d => d.status === "resting").length;
  const sick = allStaff.filter(p => p.attendance === "sick").length;
  const vacation = allStaff.filter(p => p.attendance === "vacation").length;

  // Kritische Zufriedenheit
  const criticalSatisfaction = allStaff.filter(p => (p.satisfaction || 70) < 40).length;

  // Angekündigte Austritte
  const noticeGiven = (state.employees || []).filter(e =>
    e.employmentStatus === "notice_given" || e.exitDate
  ).length;
  const driverNotice = drivers.filter(d =>
    d.employmentStatus === "notice_given" || d.exitDate
  ).length;

  // Bewerber verfügbar
  const applicants = (state.availableApplicants || []).length;

  return {
    total: allStaff.length,
    byRole,
    present,
    onTrip,
    resting,
    sick,
    vacation,
    criticalSatisfaction,
    noticeGiven: noticeGiven + driverNotice,
    applicants,
  };
}

// ---------- Dringende Entscheidungen ----------
export function getDecisions(state) {
  const decisions = [];
  const now = state.gameTime;

  // 1. Offene Firmenkosten
  const openCompanyCosts = (state.openCosts || []).filter(o => o.account === "company" && o.amountCents > 0);
  if (openCompanyCosts.length > 0) {
    const total = openCompanyCosts.reduce((s, o) => s + o.amountCents, 0);
    decisions.push({
      id: "open_costs",
      priority: 90,
      title: "Offene betriebliche Kosten",
      resource: `${openCompanyCosts.length} Posten`,
      detail: `${(total / 100).toFixed(0)} € offen – blockiert Fahrzeugkauf und Wartung.`,
      deadline: "Sobald möglich",
      action: { label: "Bezahlen", to: "/finanzen" },
    });
  }

  // 2. Offene Posten (Lieferantenverbindlichkeiten)
  const openItems = getOpenItems(state);
  if (openItems.length > 0) {
    const total = openItems.reduce((s, o) => s + o.remainingCents, 0);
    decisions.push({
      id: "open_items",
      priority: 85,
      title: "Offene Posten fällig",
      resource: `${openItems.length} Rechnung(en)`,
      detail: `${(total / 100).toFixed(0)} € offen bei Lieferanten.`,
      deadline: "Fällig",
      action: { label: "Bezahlen", to: "/finanzen" },
    });
  }

  // 3. Unzugewiesene angenommene Aufträge mit nahender Frist
  const unassigned = (state.orders || []).filter(o =>
    o.status === "angenommen" &&
    !(state.trips || []).some(t => t.orderId === o.id && t.status === "in_progress") &&
    !(state.tours || []).some(t => t.status === "active" && (t.deployments || []).some(d => d.orderId === o.id))
  );
  for (const o of unassigned) {
    const hoursLeft = Math.floor((o.deliveryDeadlineMin - now) / 60);
    const priority = hoursLeft < 12 ? 80 : hoursLeft < 24 ? 60 : 40;
    decisions.push({
      id: "unassigned_" + o.id,
      priority,
      title: "Auftrag nicht disponiert",
      resource: o.customer,
      detail: `${o.fromCity} → ${o.toCity}, ${o.tons} t · Frist ${formatGameTime(o.deliveryDeadlineMin)}.`,
      deadline: hoursLeft < 0 ? "Überfällig!" : `Noch ${hoursLeft < 0 ? 0 : hoursLeft} Std.`,
      action: { label: "Disponieren", to: "/disposition" },
    });
  }

  // 4. Angebote mit ablaufender Frist
  const expiringOffers = (state.orders || []).filter(o =>
    o.status === "offered" && (o.acceptDeadlineMin - now) < 240
  );
  for (const o of expiringOffers) {
    const hoursLeft = Math.floor((o.acceptDeadlineMin - now) / 60);
    decisions.push({
      id: "offer_expiring_" + o.id,
      priority: 50,
      title: "Angebot läuft ab",
      resource: o.customer,
      detail: `${o.fromCity} → ${o.toCity}, ${formatEuro(o.paymentCents)} · Noch ${hoursLeft < 0 ? 0 : hoursLeft} Std.`,
      deadline: formatGameTime(o.acceptDeadlineMin),
      action: { label: "Ansehen", to: "/auftraege" },
    });
  }

  // 5. Mitarbeiter mit angekündigter Kündigung
  const noticeEmployees = (state.employees || []).filter(e =>
    e.employmentStatus === "notice_given" || e.exitDate
  );
  for (const e of noticeEmployees) {
    decisions.push({
      id: "notice_" + e.id,
      priority: 55,
      title: "Austritt angekündigt",
      resource: e.name,
      detail: `Rolle: ${PERSONNEL_ROLES[e.role]?.label || e.role}. Vertretung oder Nachfolge prüfen.`,
      deadline: e.exitDate ? formatGameTime(e.exitDate) : "Bekannt geben",
      action: { label: "Personal", to: "/personal" },
    });
  }

  // 6. Fahrer mit angekündigter Kündigung
  const noticeDrivers = (state.drivers || []).filter(d =>
    d.employmentStatus === "notice_given" || d.exitDate
  );
  for (const d of noticeDrivers) {
    decisions.push({
      id: "notice_driver_" + d.id,
      priority: 55,
      title: "Fahreraustritt angekündigt",
      resource: d.name,
      detail: "Vertretung oder Einstellung prüfen.",
      deadline: d.exitDate ? formatGameTime(d.exitDate) : "Bekannt geben",
      action: { label: "Personal", to: "/personal" },
    });
  }

  // 7. Kritische Fahrzeugzustände
  const criticalVehicles = (state.vehicles || []).filter(v =>
    v.status === "free" && v.condition < 30 && v.status !== "archived" && v.status !== "sold"
  );
  for (const v of criticalVehicles) {
    decisions.push({
      id: "critical_vehicle_" + v.id,
      priority: 70,
      title: "Fahrzeugzustand kritisch",
      resource: vehicleDisplayName(v),
      detail: `Zustand ${v.condition}/100 – Einsatzfähigkeit gefährdet.`,
      deadline: "Bald",
      action: { label: "Werkstatt", to: "/fuhrpark" },
    });
  }

  // 8. Wartungsaufträge ohne Mechaniker
  const workshopOrders = (state.workshop?.maintenanceOrders || []).filter(o =>
    ["planned", "waiting", "interrupted"].includes(o.status)
  );
  for (const o of workshopOrders) {
    if (!o.mechanicId && o.status === "waiting") {
      const v = (state.vehicles || []).find(x => x.id === o.vehicleId);
      decisions.push({
        id: "workshop_no_mech_" + o.id,
        priority: 45,
        title: "Wartung ohne Mechaniker",
        resource: v ? vehicleDisplayName(v) : "Fahrzeug",
        detail: "Kein Mechaniker zugewiesen – Arbeit blockiert.",
        deadline: "Bei Gelegenheit",
        action: { label: "Werkstatt", to: "/fuhrpark" },
      });
    }
  }

  // 9. Urlaub ohne bestätigte Abdeckung
  const pendingVacations = (state.absences?.vacationRequests || []).filter(r =>
    r.status === "pending"
  );
  for (const r of pendingVacations) {
    const person = findPerson(state, r.personId);
    decisions.push({
      id: "vacation_pending_" + r.id,
      priority: 35,
      title: "Urlaubsantrag offen",
      resource: person?.name || r.personId,
      detail: `Urlaub beantragt – Abdeckung prüfen und genehmigen.`,
      deadline: formatGameTime(r.startMin),
      action: { label: "Personal", to: "/personal" },
    });
  }

  // 10. Einladung offen
  const invite = (state.appointments || []).find(a =>
    a.status === "pending" && a.appearMin <= now
  );
  if (invite) {
    decisions.push({
      id: "invite_" + invite.id,
      priority: 75,
      title: "Einladung wartet auf Antwort",
      resource: state.private?.partnerName || "Partner/in",
      detail: invite.text?.slice(0, 80) || "Einladung",
      deadline: `Bis ${clockOf(invite.decisionDeadline)} Uhr`,
      action: { label: "Antworten", to: "/zuhause" },
    });
  }

  // Nach Priorität sortieren
  decisions.sort((a, b) => b.priority - a.priority);
  return decisions;
}

function findPerson(state, personId) {
  return (state.drivers || []).find(d => d.id === personId) ||
    (state.employees || []).find(e => e.id === personId);
}

// ---------- Mitarbeiteraktivität ----------
export function getTeamActivity(state, limit = 20) {
  const events = (state.events || []).slice().reverse();
  // Nur Ereignisse mit Mitarbeiterbezug
  const activityTypes = [
    "order_accepted_by_dispatcher",
    "tour_planned_by_dispatcher",
    "tour_started",
    "delivery_completed",
    "reward_available",
    "reward_claimed",
    "purchase_completed",
    "purchase_sold",
    "private_activity_started",
  ];
  const filtered = events.filter(e =>
    activityTypes.includes(e.type) && (e.employeeName || e.employeeId || !e.isSystem)
  );
  return filtered.slice(0, limit);
}

// ---------- Flottenfilter ----------
export function filterVehicles(state, filters) {
  let vehicles = (state.vehicles || []).filter(v => v.status !== "archived" && v.status !== "sold");

  if (filters.search) {
    const s = filters.search.toLowerCase();
    vehicles = vehicles.filter(v => {
      const name = vehicleDisplayName(v).toLowerCase();
      const driver = getVehicleDriver(state, v);
      const driverName = (driver?.name || "").toLowerCase();
      const city = (v.locationCity || "").toLowerCase();
      const order = getVehicleOrder(state, v);
      const customer = (order?.customer || "").toLowerCase();
      return name.includes(s) || driverName.includes(s) || city.includes(s) || customer.includes(s);
    });
  }

  if (filters.city && filters.city !== "all") {
    vehicles = vehicles.filter(v => v.locationCity === filters.city);
  }

  if (filters.status && filters.status !== "all") {
    vehicles = vehicles.filter(v => v.status === filters.status);
  }

  if (filters.ownership && filters.ownership !== "all") {
    vehicles = vehicles.filter(v => (v.ownership_type || "owned") === filters.ownership);
  }

  if (filters.maintenance === "needs") {
    vehicles = vehicles.filter(v => v.status === "free" && v.condition < 60);
  } else if (filters.maintenance === "critical") {
    vehicles = vehicles.filter(v => v.status === "free" && v.condition < 30);
  }

  return vehicles;
}

export function getVehicleDriver(state, v) {
  if (!v.tripId) return null;
  const trip = (state.trips || []).find(t => t.id === v.tripId);
  if (!trip) return null;
  return (state.drivers || []).find(d => d.id === trip.driverId);
}

export function getVehicleOrder(state, v) {
  if (!v.tripId) return null;
  const trip = (state.trips || []).find(t => t.id === v.tripId);
  if (!trip) return null;
  return (state.orders || []).find(o => o.id === trip.orderId);
}

export function getVehicleNextEvent(state, v) {
  if (v.status === "on_trip" && v.tripId) {
    const trip = (state.trips || []).find(t => t.id === v.tripId);
    if (trip && trip.status === "in_progress") {
      const phases = trip.phases || [];
      const idx = trip.currentPhase || 0;
      if (idx < phases.length) {
        return { min: phases[idx].endMin, label: phaseLabel(phases[idx]) };
      }
    }
  }
  if (v.status === "maintenance" && v.maintenanceUntil) {
    return { min: v.maintenanceUntil, label: "Wartung Ende" };
  }
  return null;
}

function phaseLabel(phase) {
  const labels = {
    empty_drive: "Leerfahrt", loading: "Laden", loaded_drive: "Fahrt",
    break: "Pause", daily_rest: "Ruhe", unloading: "Entladen",
    empty: "Leerfahrt", load: "Laden", drive: "Fahrt", unload: "Entladen",
  };
  return labels[phase.type] || phase.type;
}

// ---------- Wachstum ----------
export function getGrowthInfo(state) {
  const companyValue = computeCompanyValue(state);
  const stage = getDevelopmentStage(companyValue);
  const xp = state.xp || 0;
  const level = getExperienceLevel(xp);
  const unlockedAchievements = (state.achievements || []).filter(a => a.unlocked).length;
  const goals = state.goals || [];
  return { companyValue, stage, level, unlockedAchievements, totalAchievements: (state.achievements || []).length, goals };
}

// ---------- Privatleben-Vorschau ----------
export function getPrivatePreview(state) {
  const now = state.gameTime;
  const nextAppointment = (state.appointments || [])
    .filter(a => ["pending", "accepted", "active"].includes(a.status) && a.endMin > now)
    .sort((a, b) => a.startMin - b.startMin)[0];

  const claimableRewards = getClaimableRewards(state);

  return {
    stress: state.private?.stress || 0,
    happiness: state.private?.happiness || 0,
    relationship: state.private?.relationship || 0,
    privateAccount: state.private?.accountCents || 0,
    nextAppointment,
    claimableRewards: claimableRewards.length,
  };
}

function getClaimableRewards(state) {
  const claims = state.private?.rewards?.claims || {};
  return Object.values(claims).filter(c => c.status === "available");
}

// ---------- Tagesbericht ----------
export function getDailyReport(state) {
  const todayStart = Math.floor(state.gameTime / 1440) * 1440;
  const deliveries = (state.orders || []).filter(o =>
    o.status === "geliefert" && o.deliveredAtMin >= todayStart
  );
  const revenue = deliveries.reduce((s, o) => s + (o.paidCents || 0), 0);

  return {
    deliveries: deliveries.length,
    revenue,
    onTime: deliveries.filter(o => o.deliveredAtMin <= o.deliveryDeadlineMin).length,
  };
}

// ---------- Trends (30 Tage) ----------

// Täglicher Umsatz aus gelieferten Aufträgen der letzten `days` Tage.
export function getRevenueTrend(state, days = 30) {
  const today = Math.floor(state.gameTime / 1440);
  const buckets = new Array(days).fill(0);
  for (const o of (state.orders || [])) {
    if (o.status === "geliefert" && o.deliveredAtMin != null && o.paidCents) {
      const dayIdx = Math.floor(o.deliveredAtMin / 1440);
      const offset = dayIdx - (today - days + 1);
      if (offset >= 0 && offset < days) buckets[offset] += o.paidCents;
    }
  }
  return buckets.map((cents, i) => {
    const day = today - days + 1 + i;
    return { day: day + 1, label: "T" + (day + 1), cents };
  });
}

// ---------- Trends pro Filiale ----------

const BRANCH_CHART_COLORS = [
  "hsl(var(--lime))",
  "hsl(var(--coral))",
  "hsl(var(--invest-cyan))",
  "hsl(var(--invest-purple))",
  "hsl(43 74% 66%)",
  "hsl(27 87% 67%)",
];

// Täglicher Umsatz pro Filiale (gestapelt). Jeder Tag hat ein Feld pro Filiale + total.
export function getRevenueTrendByBranch(state, days = 30) {
  const today = Math.floor(state.gameTime / 1440);
  const branches = (state.branches || []).filter(b => b.status === "active");
  const branchKeys = branches.map((b, i) => ({
    id: b.id, name: b.name, key: "b_" + b.id, color: BRANCH_CHART_COLORS[i % BRANCH_CHART_COLORS.length],
  }));

  const data = new Array(days).fill(0).map((_, i) => {
    const day = today - days + 1 + i;
    const obj = { day: day + 1, label: "T" + (day + 1), total: 0 };
    for (const bk of branchKeys) obj[bk.key] = 0;
    return obj;
  });

  for (const o of (state.orders || [])) {
    if (o.status !== "geliefert" || o.deliveredAtMin == null || !o.paidCents) continue;
    const dayIdx = Math.floor(o.deliveredAtMin / 1440);
    const offset = dayIdx - (today - days + 1);
    if (offset < 0 || offset >= days) continue;
    const trip = (state.trips || []).find(t => t.orderId === o.id && t.type === "loaded");
    const vehicle = trip ? (state.vehicles || []).find(v => v.id === trip.vehicleId) : null;
    const branchId = vehicle?.branchId || branches[0]?.id;
    const bk = branchKeys.find(bk => bk.id === branchId);
    if (bk) {
      data[offset][bk.key] += o.paidCents;
      data[offset].total += o.paidCents;
    }
  }

  return { data, branches: branchKeys };
}

// Tägliche Flottenauslastung pro Filiale. Jeder Tag hat ein Prozent-Feld pro Filiale.
export function getFleetUtilizationTrendByBranch(state, days = 30) {
  const today = Math.floor(state.gameTime / 1440);
  const trips = state.trips || [];
  const branches = (state.branches || []).filter(b => b.status === "active");
  const branchKeys = branches.map((b, i) => ({
    id: b.id, name: b.name, key: "b_" + b.id, color: BRANCH_CHART_COLORS[i % BRANCH_CHART_COLORS.length],
  }));

  const data = [];
  for (let i = 0; i < days; i++) {
    const dayStart = (today - days + 1 + i) * 1440;
    const dayEnd = dayStart + 1440;
    const day = today - days + 1 + i;
    const obj = { day: day + 1, label: "T" + (day + 1) };
    for (const bk of branchKeys) {
      const branchVehicles = (state.vehicles || []).filter(v =>
        v.branchId === bk.id && v.status !== "archived" &&
        (v.acquiredAtMin == null || v.acquiredAtMin <= dayEnd) &&
        (v.soldAtMin == null || v.soldAtMin > dayStart)
      );
      let total = branchVehicles.length;
      let active = 0;
      for (const v of branchVehicles) {
        if (trips.some(t => t.vehicleId === v.id && t.startMin < dayEnd && (t.endMin != null ? t.endMin : t.startMin) > dayStart)) active++;
      }
      obj[bk.key] = total > 0 ? Math.round((active / total) * 100) : 0;
      obj[bk.key + "_active"] = active;
      obj[bk.key + "_total"] = total;
    }
    data.push(obj);
  }

  return { data, branches: branchKeys };
}

// Tägliche Flottenauslastung: Anteil der Fahrzeuge auf Tour am gesamten Flottenbestand.
export function getFleetUtilizationTrend(state, days = 30) {
  const today = Math.floor(state.gameTime / 1440);
  const trips = state.trips || [];
  const vehicles = state.vehicles || [];
  const out = [];
  for (let i = 0; i < days; i++) {
    const dayStart = (today - days + 1 + i) * 1440;
    const dayEnd = dayStart + 1440;
    let total = 0;
    let active = 0;
    for (const v of vehicles) {
      if (v.status === "archived") continue;
      const acquired = v.acquiredAtMin != null ? v.acquiredAtMin : 0;
      if (acquired > dayEnd) continue;
      if (v.soldAtMin != null && v.soldAtMin <= dayStart) continue;
      total++;
      const onTrip = trips.some(t =>
        t.vehicleId === v.id &&
        t.startMin < dayEnd &&
        (t.endMin != null ? t.endMin : t.startMin) > dayStart
      );
      if (onTrip) active++;
    }
    const day = today - days + 1 + i;
    out.push({
      day: day + 1,
      label: "T" + (day + 1),
      percent: total > 0 ? Math.round((active / total) * 100) : 0,
      active,
      total,
    });
  }
  return out;
}