// Einheitlicher Kontenplan und einheitliche Auswertungen für UI und Simulation.
import { ACCOUNTS, MONTH_MIN } from "./simulation/accountingEngine.ts";
export { ACCOUNTS, ACCOUNT_LIST, MONTH_MIN, MONTH_DAYS, accountName, accountType,
  accountGroup, isContraAccount, periodOf, periodStartMin, periodEndMin, dayOfMin,
  getAccountBalance, getPnL, getBalanceSheet, getCashFlow } from "./simulation/accountingEngine.ts";

export function getLiquidityProjection(state, days) {
  const startMin = state.gameTime;
  const endMin = startMin + days * 1440;
  const currentBalance = state.company.accountCents;
  const dailyDriverWages = state.drivers.length * 10000;
  const dailyEmployeeWages = (state.employees || []).filter(e => e.employmentStatus === "employed").reduce((s, e) => s + e.costPerDayCents, 0);
  const dailyBranchCosts = state.branches.reduce((s, b) => s + b.costPerDayCents, 0);
  const dailyWithdrawal = 10000;
  const dailyTotal = dailyDriverWages + dailyEmployeeWages + dailyBranchCosts + dailyWithdrawal;
  let expectedRevenue = 0;
  for (const trip of state.trips) { if (trip.status === "in_progress") expectedRevenue += trip.paymentCents; }
  let dueLiabilities = 0;
  for (const item of (state.accounting?.openItems || [])) {
    if (item.remainingCents > 0 && (!item.dueMin || item.dueMin <= endMin)) dueLiabilities += item.remainingCents;
  }
  return {
    currentBalance, expectedRevenue, projectedExpenses: dailyTotal * days,
    dueLiabilities, projectedBalance: currentBalance + expectedRevenue - dailyTotal * days - dueLiabilities, days,
    dailyBreakdown: { driverWages: dailyDriverWages, employeeWages: dailyEmployeeWages, branchCosts: dailyBranchCosts, withdrawal: dailyWithdrawal },
  };
}

// Filialbezogene Finanzdaten für einen Zeitraum: Umsatz, direkte Kosten,
// Personalkosten, Standortkosten und Gewinn pro aktiver Filiale.
export function getBranchFinancials(state, fromMin, toMin) {
  const billedDaysSince = start => Math.max(0, Math.floor(toMin / 1440) -
    Math.max(Math.ceil(fromMin / 1440), Math.floor((start || 0) / 1440) + 1) + 1);
  const branches = (state.branches || []).filter(b => b.status === "active");

  // Pre-build Maps für O(1) Lookups (statt O(orders × trips × vehicles))
  const tripByOrderId = new Map();
  for (const t of (state.trips || [])) {
    if (t.orderId && t.type === "loaded" && !tripByOrderId.has(t.orderId)) tripByOrderId.set(t.orderId, t);
  }
  const vehicleById = new Map();
  for (const v of (state.vehicles || [])) vehicleById.set(v.id, v);

  return branches.map(b => {
    const branchVehicles = (state.vehicles || []).filter(v => v.branchId === b.id && v.status !== "sold" && v.status !== "archived");
    const branchDrivers = (state.drivers || []).filter(d => d.branchId === b.id && d.employmentStatus === "employed");
    const branchEmployees = (state.employees || []).filter(e => (e.assignedBranchId || e.branchId) === b.id && e.employmentStatus === "employed");

    let revenue = 0;
    for (const o of (state.orders || [])) {
      if (o.status !== "geliefert" || !o.paidCents) continue;
      if (o.deliveredAtMin < fromMin || o.deliveredAtMin > toMin) continue;
      const trip = tripByOrderId.get(o.id);
      const vehicle = trip ? vehicleById.get(trip.vehicleId) : null;
      if (vehicle?.branchId === b.id) revenue += o.paidCents;
    }

    let directCosts = 0;
    for (const t of (state.trips || [])) {
      if (t.type !== "loaded" || t.endMin == null || t.endMin < fromMin || t.endMin > toMin) continue;
      const vehicle = vehicleById.get(t.vehicleId);
      if (vehicle?.branchId === b.id) directCosts += (t.fuelCents || 0) + (t.tollCents || 0);
    }

    const driverWages = branchDrivers.reduce((sum, d) => sum + (d.costPerDayCents ?? 10000) * billedDaysSince(Math.max(b.openedAtMin || 0, d.hiredAtMin ?? ((d.employedDay || 1) - 1) * 1440)), 0);
    const employeeWages = branchEmployees.reduce((sum, e) => sum + (e.costPerDayCents || 0) * billedDaysSince(Math.max(b.openedAtMin || 0, e.hiredAtMin ?? ((e.employedDay || 1) - 1) * 1440)), 0);
    const branchCosts = (b.costPerDayCents || 0) * billedDaysSince(b.openedAtMin);
    const personnelCosts = driverWages + employeeWages;
    const totalCosts = directCosts + personnelCosts + branchCosts;
    const contribution = revenue - directCosts;
    const profit = revenue - totalCosts;
    const margin = revenue > 0 ? Math.round(profit / revenue * 100) : 0;

    return {
      branch: b, revenue, directCosts, personnelCosts, branchCosts, totalCosts,
      contribution, profit, margin,
      vehicleCount: branchVehicles.length,
      driverCount: branchDrivers.length,
      employeeCount: branchEmployees.length,
    };
  });
}

export function getAssetRegister(state) {
  return state?.accounting?.assets || [];
}

export function getOpenItems(state) {
  return (state?.accounting?.openItems || []).filter(i => i.remainingCents > 0);
}

export function getJournal(state, filters) {
  if (!state?.accounting?.journal) return [];
  let journal = [...state.accounting.journal].reverse();
  if (filters) {
    if (filters.account) journal = journal.filter(e => e.lines.some(l => l.account === filters.account));
    if (filters.type) journal = journal.filter(e => e.type === filters.type);
    if (filters.fromMin !== undefined) journal = journal.filter(e => e.gameTime >= filters.fromMin);
    if (filters.toMin !== undefined) journal = journal.filter(e => e.gameTime <= filters.toMin);
    if (filters.orderId) journal = journal.filter(e => e.orderId === filters.orderId);
    if (filters.vehicleId) journal = journal.filter(e => e.vehicleId === filters.vehicleId);
    if (filters.employeeId) journal = journal.filter(e => e.employeeId === filters.employeeId);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      journal = journal.filter(e => e.text.toLowerCase().includes(s) || (e.partnerName || "").toLowerCase().includes(s) || String(e.entryNo).includes(s));
    }
  }
  return journal;
}

export function getReceipts(state, filters) {
  if (!state?.accounting?.receipts) return [];
  let receipts = [...state.accounting.receipts].reverse();
  if (filters) {
    if (filters.status) receipts = receipts.filter(r => r.status === filters.status);
    if (filters.type) receipts = receipts.filter(r => r.type === filters.type);
    if (filters.search) {
      const s = filters.search.toLowerCase();
      receipts = receipts.filter(r => r.text.toLowerCase().includes(s) || (r.partnerName || "").toLowerCase().includes(s) || String(r.receiptNo).includes(s));
    }
  }
  return receipts;
}

export function getPendingTasks(state) {
  return (state?.accounting?.taskQueue || []).filter(t => t.status === "pending");
}

export function getPeriods(state) {
  return state?.accounting?.periods || [];
}

// Kontengruppen für Auswertungen
export const ACCOUNT_GROUPS = {
  current_assets: { label: "Umlaufvermögen", type: "asset" },
  fixed_assets: { label: "Anlagevermögen", type: "asset" },
  equity: { label: "Eigenkapital", type: "equity" },
  current_liabilities: { label: "Kurzfristige Verbindlichkeiten", type: "liability" },
  long_term_liabilities: { label: "Langfristige Verbindlichkeiten", type: "liability" },
  operating_revenue: { label: "Betriebserlöse", type: "revenue" },
  other_revenue: { label: "Sonstige Erträge", type: "revenue" },
  direct_costs: { label: "Direkte Transportkosten", type: "expense" },
  personnel: { label: "Personalaufwand", type: "expense" },
  operations: { label: "Betriebskosten", type: "expense" },
  depreciation: { label: "Abschreibungen", type: "expense" },
  finance: { label: "Finanzergebnis", type: "expense" },
};