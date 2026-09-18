// Clientseitige Spiegelung der Finanzierungs-Konstanten (Auftrag 22).
// Die verbindlichen Werte liegen serverseitig in base44/shared/financingEngine.ts.

export const LOAN_INTEREST_RATE_MONTHLY = 0.0075;
export const LOAN_FEE_RATE = 0.01;
export const LOAN_MIN_CENTS = 500000;
export const LOAN_MAX_TOTAL_CENTS = 100000000;
export const LOAN_TERMS = [12, 24, 36];
export const DEFAULT_LOAN_TERM = 24;
export const DAY_MIN = 1440;

export const FINANCING_ACCESS_VERSION = "growth_access_v2";
export const SEVERE_OVERDUE_DAYS = 30;
export const BASE_CREDIT_LIMIT_CENTS = 10000000;       // 100.000 €
export const EQUITY_GROWTH_THRESHOLD_CENTS = 16500000;  // 165.000 €

export const LEASING_OFFERS = {
  // ---------- Regional-Lkw ----------
  regional_flex: {
    id: "regional_flex",
    label: "Regional – Flexibler Einstieg",
    vehicleType: "Regional-Lkw",
    catalogId: "regional",
    capacityTons: 8,
    consumptionPer100km: 22,
    termMonths: 24,
    specialPaymentCents: 0,
    monthlyRateCents: 55000,
    includedKm: 200000,
    mileageRatePerKmCents: 8,
    buyoutPriceCents: 900000,
    minConditionAtReturn: 70,
    conditionPenaltyPerPointCents: 4000,
    returnLocationCity: "Hamburg",
  },
  // ---------- Standard-Lkw ----------
  standard_flex: {
    id: "standard_flex",
    label: "Standard A – Flexibler Einstieg",
    vehicleType: "Standard-Lkw",
    catalogId: "standard",
    capacityTons: 12,
    consumptionPer100km: 28,
    termMonths: 24,
    specialPaymentCents: 0,
    monthlyRateCents: 90000,
    includedKm: 240000,
    mileageRatePerKmCents: 10,
    buyoutPriceCents: 1500000,
    minConditionAtReturn: 70,
    conditionPenaltyPerPointCents: 5000,
    returnLocationCity: "Hamburg",
  },
  standard: {
    id: "standard",
    label: "Standard B – Niedrigere Rate",
    vehicleType: "Standard-Lkw",
    catalogId: "standard",
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
  },
  // ---------- Schwerer Fernverkehrs-Lkw ----------
  heavy_flex: {
    id: "heavy_flex",
    label: "Schwer – Flexibler Einstieg",
    vehicleType: "Schwerer Fernverkehrs-Lkw",
    catalogId: "heavy",
    capacityTons: 24,
    consumptionPer100km: 35,
    termMonths: 24,
    specialPaymentCents: 0,
    monthlyRateCents: 140000,
    includedKm: 280000,
    mileageRatePerKmCents: 12,
    buyoutPriceCents: 2750000,
    minConditionAtReturn: 70,
    conditionPenaltyPerPointCents: 7000,
    returnLocationCity: "Hamburg",
  },
};

export const LEASING_OFFER_LIST = [
  LEASING_OFFERS.regional_flex,
  LEASING_OFFERS.standard_flex,
  LEASING_OFFERS.standard,
  LEASING_OFFERS.heavy_flex,
];

// Kompatibilität: altes Export-Objekt
export const LEASING_OFFER = LEASING_OFFERS.standard;

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
  if (v.ownership_type === "rented" || v.ownership_type === "rental") return "Gemietet";
  return "Eigen";
}

// ---------- Eigenkapital und Kreditrahmen (Auftrag 22) ----------

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
  const growthComponent = Math.floor(0.5 * Math.max(0, E - EQUITY_GROWTH_THRESHOLD_CENTS));
  const totalLimit = Math.min(LOAN_MAX_TOTAL_CENTS, BASE_CREDIT_LIMIT_CENTS + growthComponent);
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

// ---------- Schwere Rückstände (Auftrag 22) ----------

export function getSevereLeasingArrears(state) {
  const arrears = [];
  for (const contract of (state.leasingContracts || [])) {
    if (contract.status !== "active" && contract.status !== "ending") continue;
    if ((contract.overdueRatesCents || 0) > 0 && contract.overdueSinceMin) {
      const daysOverdue = Math.floor((state.gameTime - contract.overdueSinceMin) / DAY_MIN);
      if (daysOverdue >= SEVERE_OVERDUE_DAYS) {
        arrears.push({ type: /** @type {const} */ ("leasing"), contractId: contract.id, overdueCents: contract.overdueRatesCents, daysOverdue });
      }
    }
  }
  return arrears;
}

export function getSevereLoanArrears(state) {
  const arrears = [];
  for (const loan of (state.loans || [])) {
    if (loan.status !== "active") continue;
    const totalOverdue = (loan.overduePrincipalCents || 0) + (loan.overdueInterestCents || 0);
    if (totalOverdue > 0 && loan.overdueSinceMin) {
      const daysOverdue = Math.floor((state.gameTime - loan.overdueSinceMin) / DAY_MIN);
      if (daysOverdue >= SEVERE_OVERDUE_DAYS) {
        arrears.push({ type: /** @type {const} */ ("loan"), loanId: loan.id, overdueCents: totalOverdue, daysOverdue });
      }
    }
  }
  return arrears;
}

export function getSevereFinancingArrears(state) {
  return [...getSevereLeasingArrears(state), ...getSevereLoanArrears(state)];
}

// ---------- Zentrale Zulassungsprüfung (clientseitige Spiegelung) ----------

export function checkFinancingAccess(state, options) {
  const blockingReasons = [];
  const notices = [];
  const o = options || {};

  if (o.type === "leasing") {
    const offer = LEASING_OFFERS[o.offerId] || LEASING_OFFERS.standard_flex;
    const immediateCashRequired = offer.specialPaymentCents;

    const severeArrears = getSevereLeasingArrears(state);
    for (const a of severeArrears) {
      blockingReasons.push(`Schwerer Leasingrückstand: Vertrag ${a.contractId}, offen ${(a.overdueCents / 100).toFixed(0)} €, seit ${a.daysOverdue} Tagen überfällig.`);
    }
    if (immediateCashRequired > 0 && state.company.accountCents < immediateCashRequired) {
      blockingReasons.push(`Sofortzahlung ${(immediateCashRequired / 100).toFixed(0)} € nicht verfügbar (Firmenbank: ${(state.company.accountCents / 100).toFixed(0)} €).`);
    }

    const provCity = o.provisionCity || offer.returnLocationCity;
    const hasFreeDriver = (state.drivers || []).some(d =>
      d.locationCity === provCity && (d.status === "free" || d.status === "resting") && d.employmentStatus === "employed");
    if (!hasFreeDriver) {
      notices.push(`Kein freier Fahrer am Bereitstellungsort ${provCity} – Fahrzeug kann erst nach Einstellung disponiert werden.`);
    }
    notices.push("In dieser Vorschau sind noch nicht angenommene zukünftige Aufträge nicht enthalten.");

    return { allowed: blockingReasons.length === 0, blockingReasons, notices, terms: { version: FINANCING_ACCESS_VERSION, offerId: offer.id, ...offer }, immediateCashRequired };
  }

  if (o.type === "loan") {
    const amountCents = Math.floor((o.amountCents || 0) / 100) * 100;
    const termMonths = o.termMonths || DEFAULT_LOAN_TERM;
    const limit = computeCreditLimit(state);
    const severeArrears = getSevereFinancingArrears(state);
    const clearArrears = !!o.clearArrears;

    if (amountCents < LOAN_MIN_CENTS) blockingReasons.push("Mindestbetrag 5.000 €.");
    if (!LOAN_TERMS.includes(termMonths)) blockingReasons.push("Laufzeit muss 12, 24 oder 36 Monate sein.");
    if (amountCents > limit.available) {
      blockingReasons.push(`Übersteigt verfügbaren Kreditrahmen (${(limit.available / 100).toFixed(0)} €).`);
    }
    if (severeArrears.length > 0 && !clearArrears) {
      const totalArrears = severeArrears.reduce((s, a) => s + a.overdueCents, 0);
      blockingReasons.push(`Schwerer Finanzierungsrückstand (${(totalArrears / 100).toFixed(0)} €). Kredit aufnehmen und Rückstände begleichen?`);
    }

    notices.push("In dieser Vorschau sind noch nicht angenommene zukünftige Aufträge nicht enthalten.");
    if (severeArrears.length > 0 && clearArrears) {
      notices.push("Kredit wird zur Begleichung schwerer Rückstände verwendet.");
    }

    const fee = Math.round(amountCents * LOAN_FEE_RATE);
    const netPayout = amountCents - fee;
    return {
      allowed: blockingReasons.length === 0,
      blockingReasons, notices,
      terms: { version: FINANCING_ACCESS_VERSION, amountCents, termMonths, interestRate: LOAN_INTEREST_RATE_MONTHLY, feeRate: LOAN_FEE_RATE },
      immediateCashRequired: 0,
      netEffect: { gross: amountCents, fee, netPayout, bankAfter: state.company.accountCents + netPayout },
      limit, severeArrears,
    };
  }

  return { allowed: false, blockingReasons: ["Unbekannte Finanzierungsart"], notices };
}