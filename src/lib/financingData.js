// Clientseitige Spiegelung der Finanzierungs-Konstanten (Auftrag 17).
// Die verbindlichen Werte liegen serverseitig in base44/shared/financingEngine.ts.

export const LOAN_INTEREST_RATE_MONTHLY = 0.0075;
export const LOAN_FEE_RATE = 0.01;
export const LOAN_MIN_CENTS = 500000;
export const LOAN_MAX_TOTAL_CENTS = 100000000;
export const LOAN_TERMS = [12, 24, 36];
export const DAY_MIN = 1440;

export const LEASING_OFFER = {
  vehicleType: "Standard-Lkw",
  capacityTons: 12,
  consumptionPer100km: 28,
  termMonths: 24,
  specialPaymentCents: 150000,
  monthlyRateCents: 80000,
  includedKm: 240000,
  mileageRatePerKmCents: 10,
  buyoutPriceCents: 1500000,
  minConditionAtReturn: 70,
  conditionPenaltyPerPointCents: 5000,
  returnLocationCity: "Hamburg",
};

export function generateLoanSchedule(principalCents, termMonths, interestRateMonthly) {
  const monthlyPrincipal = Math.floor(principalCents / termMonths);
  const schedule = [];
  let remaining = principalCents;
  for (let i = 0; i < termMonths; i++) {
    const principal = (i === termMonths - 1) ? remaining : monthlyPrincipal;
    const interest = Math.floor(remaining * interestRateMonthly);
    schedule.push({
      installment: i + 1,
      principalCents: principal,
      interestCents: interest,
      totalCents: principal + interest,
      remainingPrincipalCents: remaining - principal,
    });
    remaining -= principal;
  }
  return schedule;
}

export function totalInterest(schedule) {
  return schedule.reduce((s, r) => s + r.interestCents, 0);
}

export function ownershipLabel(v) {
  if (!v) return "—";
  if (v.status === "archived") return "Archiviert";
  if (v.status === "sold") return "Verkauft";
  if (v.ownership_type === "leased") return "Geleast";
  if (v.ownership_type === "rented") return "Gemietet";
  return "Eigen";
}

// ---------- Eigenkapital und Kreditrahmen (Auftrag 21, Spiegel von financingEngine.ts) ----------
// Verwendet den Buchwert aus dem Anlagenverzeichnis, nicht den Anschaffungswert.

export function getVehicleBookValue(state, vehicleId) {
  const asset = (state.accounting?.assets || []).find(
    a => a.vehicleId === vehicleId && a.disposedAtMin === null
  );
  if (asset) return asset.bookValueCents;
  const vehicle = (state.vehicles || []).find(v => v.id === vehicleId);
  return vehicle?.bookValueCents || 0;
}

export function computeEquity(state) {
  const bank = state.company?.accountCents || 0;
  const ownedVehicleValue = (state.vehicles || [])
    .filter(v => (v.ownership_type || "owned") === "owned" && v.status !== "archived" && v.status !== "sold")
    .reduce((s, v) => s + getVehicleBookValue(state, v.id), 0);
  const openCompanyCosts = (state.openCosts || [])
    .filter(o => o.account === "company")
    .reduce((s, o) => s + o.amountCents, 0);
  const loanDebt = (state.loans || [])
    .filter(l => l.status === "active")
    .reduce((s, l) => s + (l.remainingPrincipalCents || 0) + (l.accruedInterestCents || 0) + (l.overdueInterestCents || 0) + (l.overduePrincipalCents || 0), 0);
  return bank + ownedVehicleValue - openCompanyCosts - loanDebt;
}

export function computeCreditLimit(state) {
  const E = computeEquity(state);
  const part1 = Math.min(5000000, Math.max(0, Math.floor(E / 3)));
  const part2 = Math.floor(0.5 * Math.max(0, E - 16500000));
  const totalLimit = Math.min(LOAN_MAX_TOTAL_CENTS, Math.max(0, part1 + part2));
  const outstanding = (state.loans || [])
    .filter(l => l.status === "active")
    .reduce((s, l) => s + (l.remainingPrincipalCents || 0) + (l.overduePrincipalCents || 0), 0);
  const available = Math.max(0, totalLimit - outstanding);
  return {
    totalLimit: Math.floor(totalLimit / 100) * 100,
    available: Math.floor(available / 100) * 100,
    equity: E,
    outstanding,
  };
}