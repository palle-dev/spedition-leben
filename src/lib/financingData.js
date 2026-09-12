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
  if (v.ownership_type === "leased") return "Geleast";
  if (v.ownership_type === "rented") return "Gemietet";
  return "Eigen";
}