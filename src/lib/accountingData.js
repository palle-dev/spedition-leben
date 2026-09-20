import { financialRange } from "./simulation/financialProjection.ts";
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
  const totals = financialRange(state, ACCOUNTS, fromMin, toMin).branches;
  const branches = [...(state.branches || [])];
  for (const id of Object.keys(totals)) if (!branches.some(b => b.id === id)) branches.push({ id, name: id === '__unallocated__' ? 'Nicht zugeordnet / Zentrale' : 'Früherer Standort ' + id, city: '', status: 'historical' });
  return branches.filter(b => b.status === 'active' || totals[b.id]).map(b => {
    const amounts = totals[b.id] || {};
    let revenue = 0, directCosts = 0, personnelCosts = 0, branchCosts = 0, otherCosts = 0;
    for (const [account, delta] of Object.entries(amounts)) {
      const a = ACCOUNTS[account];
      if (a?.type === 'revenue') revenue -= Number(delta);
      else if (a?.type === 'expense') {
        if (a.group === 'direct_costs') directCosts += Number(delta);
        else if (a.group === 'personnel') personnelCosts += Number(delta);
        else if (account === '5200') branchCosts += Number(delta);
        else otherCosts += Number(delta);
      }
    }
    const totalCosts = directCosts + personnelCosts + branchCosts + otherCosts;
    const profit = revenue - totalCosts;
    return { branch: b, revenue, directCosts, personnelCosts, branchCosts, otherCosts, totalCosts,
      contribution: revenue - directCosts, profit, margin: revenue > 0 ? Math.round(profit / revenue * 100) : 0,
      vehicleCount: (state.vehicles || []).filter(v => v.branchId === b.id && !['sold','archived'].includes(v.status)).length,
      driverCount: (state.drivers || []).filter(d => d.branchId === b.id && d.employmentStatus === 'employed').length,
      employeeCount: (state.employees || []).filter(e => (e.assignedBranchId || e.branchId) === b.id && e.employmentStatus === 'employed').length };
  });
}

export function getAssetRegister(state) {
  return state?.accounting?.assets || [];
}

export function getOpenItems(state) {
  return (state?.accounting?.openItems || []).filter(i => i.remainingCents > 0);
}

export function getJournal(state, filters) {
  if (state?.accounting?.journalProjection?.count) throw Error("Für das vollständige Journal bitte queryJournal verwenden.");
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