// Clientseitige Buchhaltungsdaten für FERNWERK.
// Spiegelt den Kontenplan und die Auswertungslogik aus base44/shared/accountingEngine.ts.
// Wird für die Darstellung in der Finanzen-Seite verwendet.

// Kontenplan (Spiegel von accountingEngine.ts)
export const ACCOUNTS = {
  "1000": { no: "1000", name: "Firmenbank", type: "asset", group: "current_assets" },
  "1100": { no: "1100", name: "Kundenforderungen", type: "asset", group: "current_assets" },
  "1150": { no: "1150", name: "Sonstige Forderungen", type: "asset", group: "current_assets" },
  "1200": { no: "1200", name: "Eigene Lkw", type: "asset", group: "fixed_assets" },
  "1210": { no: "1210", name: "Werkstattausstattung", type: "asset", group: "fixed_assets" },
  "1220": { no: "1220", name: "Weitere Betriebsanlagen", type: "asset", group: "fixed_assets" },
  "2000": { no: "2000", name: "Eigenkapital", type: "equity", group: "equity" },
  "2010": { no: "2010", name: "Private Entnahmen", type: "equity", group: "equity", contra: true },
  "2020": { no: "2020", name: "Private Einlagen", type: "equity", group: "equity" },
  "2100": { no: "2100", name: "Lieferantenverbindlichkeiten", type: "liability", group: "current_liabilities" },
  "2110": { no: "2110", name: "Offene Löhne", type: "liability", group: "current_liabilities" },
  "2120": { no: "2120", name: "Sonstige Verbindlichkeiten", type: "liability", group: "current_liabilities" },
  "2200": { no: "2200", name: "Darlehen", type: "liability", group: "long_term_liabilities" },
  "4000": { no: "4000", name: "Transporterlöse", type: "revenue", group: "operating_revenue" },
  "4090": { no: "4090", name: "Erlösschmälerungen", type: "revenue", group: "operating_revenue", contra: true },
  "4100": { no: "4100", name: "Versicherungsentschädigungen", type: "revenue", group: "other_revenue" },
  "4200": { no: "4200", name: "Gewinne aus Anlagenverkauf", type: "revenue", group: "other_revenue" },
  "5000": { no: "5000", name: "Kraftstoff", type: "expense", group: "direct_costs" },
  "5010": { no: "5010", name: "Maut", type: "expense", group: "direct_costs" },
  "5020": { no: "5020", name: "Fremdtransporte", type: "expense", group: "direct_costs" },
  "5100": { no: "5100", name: "Fahrerlohn", type: "expense", group: "personnel" },
  "5110": { no: "5110", name: "Disposition", type: "expense", group: "personnel" },
  "5120": { no: "5120", name: "Buchhaltung und Verwaltung", type: "expense", group: "personnel" },
  "5130": { no: "5130", name: "Reinigung und Werkstattpersonal", type: "expense", group: "personnel" },
  "5140": { no: "5140", name: "Personalgewinnung und Bereitstellung", type: "expense", group: "personnel" },
  "5200": { no: "5200", name: "Standortkosten", type: "expense", group: "operations" },
  "5210": { no: "5210", name: "Externe Reinigung und Betriebshilfen", type: "expense", group: "operations" },
  "5220": { no: "5220", name: "Miete für Fahrzeuge und Ausstattung", type: "expense", group: "operations" },
  "5300": { no: "5300", name: "Wartung und Reparatur", type: "expense", group: "operations" },
  "5310": { no: "5310", name: "Unfall-, Abschlepp- und Ladungsschäden", type: "expense", group: "operations" },
  "5400": { no: "5400", name: "Versicherungsbeiträge", type: "expense", group: "operations" },
  "5500": { no: "5500", name: "Abschreibungen", type: "expense", group: "depreciation" },
  "5510": { no: "5510", name: "Verluste aus Anlagenverkauf", type: "expense", group: "depreciation" },
  "5600": { no: "5600", name: "Zinsaufwand", type: "expense", group: "finance" },
  "5700": { no: "5700", name: "Auftragsstorno und sonstige Betriebskosten", type: "expense", group: "operations" },
};

export const ACCOUNT_LIST = Object.values(ACCOUNTS);

export const MONTH_MIN = 43200;
export const MONTH_DAYS = 30;

export function accountName(no) { return ACCOUNTS[no]?.name || no; }
export function accountType(no) { return ACCOUNTS[no]?.type || "unknown"; }
export function accountGroup(no) { return ACCOUNTS[no]?.group || "unknown"; }
export function isContraAccount(no) { return ACCOUNTS[no]?.contra || false; }

export function periodOf(min) { return Math.floor(min / MONTH_MIN) + 1; }
export function periodStartMin(p) { return (p - 1) * MONTH_MIN; }
export function periodEndMin(p) { return p * MONTH_MIN; }
export function dayOfMin(min) { return Math.floor(min / 1440) + 1; }

// ---------- Auswertungen (clientseitig aus Journal) ----------

export function getAccountBalance(state, accountNo, upToMin) {
  if (!state?.accounting?.journal) return 0;
  const cap = upToMin === undefined ? Infinity : upToMin;
  let bal = 0;
  for (const e of state.accounting.journal) {
    if (e.gameTime > cap) continue;
    for (const l of e.lines) {
      if (l.account === accountNo) bal += l.debitCents - l.creditCents;
    }
  }
  return bal;
}

export function getPnL(state, fromMin, toMin) {
  if (!state?.accounting?.journal) return { revenue: 0, expenses: 0, result: 0, lines: [] };
  const lines = [];
  let totalRev = 0, totalExp = 0;
  for (const acc of ACCOUNT_LIST.filter(a => a.type === "revenue")) {
    const bal = getAccountBalance(state, acc.no, toMin) - getAccountBalance(state, acc.no, (fromMin || 0) - 1);
    if (bal !== 0) {
      const signed = acc.contra ? bal : -bal;
      lines.push({ account: acc.no, name: acc.name, amountCents: signed, type: "revenue", contra: acc.contra });
      totalRev += signed;
    }
  }
  for (const acc of ACCOUNT_LIST.filter(a => a.type === "expense")) {
    const bal = getAccountBalance(state, acc.no, toMin) - getAccountBalance(state, acc.no, (fromMin || 0) - 1);
    if (bal !== 0) {
      lines.push({ account: acc.no, name: acc.name, amountCents: bal, type: "expense", contra: acc.contra });
      totalExp += bal;
    }
  }
  return { revenue: totalRev, expenses: totalExp, result: totalRev - totalExp, lines };
}

export function getBalanceSheet(state, atMin) {
  if (!state?.accounting?.journal) return { assets: [], liabilities: [], equity: [], total: {} };
  const cap = atMin === undefined ? Infinity : atMin;
  const assets = [], liabilities = [], equity = [];
  let totalAssets = 0, totalLiab = 0, totalEquity = 0;
  for (const acc of ACCOUNT_LIST) {
    const bal = getAccountBalance(state, acc.no, cap);
    if (bal === 0) continue;
    if (acc.type === "asset") { assets.push({ account: acc.no, name: acc.name, amountCents: bal }); totalAssets += bal; }
    else if (acc.type === "liability") { liabilities.push({ account: acc.no, name: acc.name, amountCents: -bal }); totalLiab += -bal; }
    else if (acc.type === "equity") { const signed = acc.contra ? bal : -bal; equity.push({ account: acc.no, name: acc.name, amountCents: signed, contra: acc.contra }); totalEquity += signed; }
  }
  const pnl = getPnL(state, 0, cap);
  if (pnl.result !== 0) { equity.push({ account: "PNL", name: "Periodenergebnis", amountCents: pnl.result }); totalEquity += pnl.result; }
  return { assets, liabilities, equity, total: { assets: totalAssets, liabilities: totalLiab, equity: totalEquity, balanced: totalAssets === totalLiab + totalEquity } };
}

export function getCashFlow(state, fromMin, toMin) {
  if (!state?.accounting?.journal) return { operating: 0, investing: 0, financing: 0, total: 0 };
  let operating = 0, investing = 0, financing = 0;
  for (const e of state.accounting.journal) {
    if (e.gameTime < (fromMin || 0) || e.gameTime > toMin) continue;
    for (const l of e.lines) {
      if (l.account !== "1000") continue;
      const delta = l.debitCents - l.creditCents;
      if (delta === 0) continue;
      const otherAccounts = e.lines.filter(x => x.account !== "1000").map(x => x.account);
      if (otherAccounts.some(a => ACCOUNTS[a]?.group === "fixed_assets")) investing += delta;
      else if (otherAccounts.some(a => a === "2010" || a === "2020" || a === "2200")) financing += delta;
      else operating += delta;
    }
  }
  return { operating, investing, financing, total: operating + investing + financing };
}

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
  const days = Math.max(1, Math.ceil((toMin - fromMin) / 1440));
  const branches = (state.branches || []).filter(b => b.status === "active");
  return branches.map(b => {
    const branchVehicles = (state.vehicles || []).filter(v => v.branchId === b.id && v.status !== "sold" && v.status !== "archived");
    const branchDrivers = (state.drivers || []).filter(d => d.branchId === b.id && d.employmentStatus === "employed");
    const branchEmployees = (state.employees || []).filter(e => (e.assignedBranchId || e.branchId) === b.id && e.employmentStatus === "employed");

    let revenue = 0;
    for (const o of (state.orders || [])) {
      if (o.status !== "geliefert" || !o.paidCents) continue;
      if (o.deliveredAtMin < fromMin || o.deliveredAtMin > toMin) continue;
      const trip = (state.trips || []).find(t => t.orderId === o.id && t.type === "loaded");
      const vehicle = trip ? (state.vehicles || []).find(v => v.id === trip.vehicleId) : null;
      if (vehicle?.branchId === b.id) revenue += o.paidCents;
    }

    let directCosts = 0;
    for (const t of (state.trips || [])) {
      if (t.type !== "loaded" || t.endMin == null || t.endMin < fromMin || t.endMin > toMin) continue;
      const vehicle = (state.vehicles || []).find(v => v.id === t.vehicleId);
      if (vehicle?.branchId === b.id) directCosts += (t.fuelCents || 0) + (t.tollCents || 0);
    }

    const driverWages = branchDrivers.reduce((s, d) => s + (d.costPerDayCents || 10000), 0) * days;
    const employeeWages = branchEmployees.reduce((s, e) => s + (e.costPerDayCents || 0), 0) * days;
    const branchCosts = (b.costPerDayCents || 0) * days;
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