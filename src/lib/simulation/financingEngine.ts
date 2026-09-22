import { ELECTRIC_MODELS, electricFields } from "./electricCatalog.ts";
// Finanzierungs-Engine für FERNWERK – Auftrag 17.
// Kredite (Ratendarlehen) und Lkw-Leasing als vollständig spielbare Finanzierung.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.
// Alle Zinssätze, Gebühren und Konditionen sind fiktive Spielwerte.

import { formatGameTime, VEHICLE_BODY_TYPES, getVehicleBodyType } from "./gameRules.ts";
import { postJournal, registerAsset, getVehicleBookValue, MONTH_MIN, getCashFlow } from "./accountingEngine.ts";
import { deliverMessage } from "./mailEngine.ts";

// ---------- Konstanten ----------
export const LOAN_INTEREST_RATE_MONTHLY = 0.0075;   // 0,75 % je Spielmonat
export const LOAN_FEE_RATE = 0.01;                    // 1 % Abschlussgebühr
export const LOAN_MIN_CENTS = 500000;                 // 5.000 €
export const LOAN_MAX_TOTAL_CENTS = 100000000;        // 1.000.000 €
export const LOAN_TERMS = [12, 24, 36];
export const DAY_MIN = 1440;

export const LEASING_OFFERS = {
 ...Object.fromEntries(Object.values(ELECTRIC_MODELS).map(m=>[m.id+"_flex",{...m,id:m.id+"_flex",catalogId:m.id,vehicleType:m.label,powertrain:"electric",consumptionPer100km:0,referencePriceCents:m.priceCents,termMonths:24,specialPaymentCents:0,includedKm:240000,mileageRatePerKmCents:12,buyoutPriceCents:Math.round(m.priceCents*0.5),minConditionAtReturn:70,conditionPenaltyPerPointCents:6000,returnLocationCity:"Hamburg"}])),
  // ---------- Regional-Lkw ----------
  regional_flex: {
    id: "regional_flex",
    vehicleType: "Regional-Lkw",
    catalogId: "regional",
    capacityTons: 8,
    consumptionPer100km: 22,
    termMonths: 24,
    specialPaymentCents: 0,
    monthlyRateCents: 54000,                   // 540 €
    includedKm: 200000,
    mileageRatePerKmCents: 10,
    buyoutPriceCents: 900000,                   // 9.000 €
    minConditionAtReturn: 70,
    conditionPenaltyPerPointCents: 4000,        // 40 €/Punkt
    returnLocationCity: "Hamburg",
  },
  // ---------- Standard-Lkw ----------
  // Variante A – Flexibler Einstieg (0 € Sonderzahlung, 900 €/Monat)
  standard_flex: {
    id: "standard_flex",
    vehicleType: "Standard-Lkw",
    catalogId: "standard",
    capacityTons: 12,
    consumptionPer100km: 28,
    termMonths: 24,
    specialPaymentCents: 0,                    // 0 €
    monthlyRateCents: 90000,                   // 900 €
    includedKm: 240000,
    mileageRatePerKmCents: 10,                  // 0,10 €/km
    buyoutPriceCents: 1500000,                  // 15.000 €
    minConditionAtReturn: 70,
    conditionPenaltyPerPointCents: 5000,        // 50 €/Punkt
    returnLocationCity: "Hamburg",
  },
  // Variante B – Niedrigere laufende Rate (1.500 € Sonderzahlung, 800 €/Monat)
  standard: {
    id: "standard",
    vehicleType: "Standard-Lkw",
    catalogId: "standard",
    capacityTons: 12,
    consumptionPer100km: 28,
    termMonths: 24,
    specialPaymentCents: 150000,              // 1.500 €
    monthlyRateCents: 80000,                   // 800 €
    includedKm: 240000,
    mileageRatePerKmCents: 10,                  // 0,10 €/km
    buyoutPriceCents: 1500000,                  // 15.000 €
    minConditionAtReturn: 70,
    conditionPenaltyPerPointCents: 5000,        // 50 €/Punkt
    returnLocationCity: "Hamburg",
  },
  // ---------- Schwerer Fernverkehrs-Lkw ----------
  heavy_flex: {
    id: "heavy_flex",
    vehicleType: "Schwerer Fernverkehrs-Lkw",
    catalogId: "heavy",
    capacityTons: 24,
    consumptionPer100km: 35,
    termMonths: 24,
    specialPaymentCents: 0,
    monthlyRateCents: 140000,                  // 1.400 €
    includedKm: 280000,
    mileageRatePerKmCents: 12,                  // 0,12 €/km
    buyoutPriceCents: 2750000,                  // 27.500 €
    minConditionAtReturn: 70,
    conditionPenaltyPerPointCents: 7000,        // 70 €/Punkt
    returnLocationCity: "Hamburg",
  },
};

export const FINANCING_ACCESS_VERSION = "growth_access_v2";
export const SEVERE_OVERDUE_DAYS = 30;
export const BASE_CREDIT_LIMIT_CENTS = 10000000;    // 100.000 € Grundrahmen
export const EQUITY_GROWTH_THRESHOLD_CENTS = 16500000; // 165.000 €

export const LEASING_OVERDUE_GRACE_DAYS = 7;
export const LEASING_OVERDUE_PENALTY_CENTS = 4000;    // 40 € je 24h
export const LEASING_EARLY_TERM_RATE = 0.5;            // 50 % restlicher Raten

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// ---------- Kreditrahmen ----------
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

export function computeOperatingCashFlow30(state) {
  const histStart = Math.max(0, state.gameTime - 30 * DAY_MIN);
  const cf = getCashFlow(state, histStart, state.gameTime);
  return cf.operating;
}

export function computeCreditLimit(state) {
  const E = computeEquity(state);
  // Gesamtobergrenze = min(1M€, 100K€ + 0,5 × max(0, E - 165K€))
  // Kein E/3-Abzug, kein CF30-Abzug, keine pauschale Bonitätsreduzierung.
  const growthComponent = Math.floor(0.5 * Math.max(0, E - EQUITY_GROWTH_THRESHOLD_CENTS));
  const totalLimit = Math.min(LOAN_MAX_TOTAL_CENTS, BASE_CREDIT_LIMIT_CENTS + growthComponent);
  // Genutzter Rahmen = gesamte ausstehende Darlehenstilgung (inkl. überfälliger Tilgung genau einmal)
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

// ---------- Tilgungsplan ----------
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

// ---------- Schwere Rückstände (Auftrag 22) ----------
// Schwerer Leasingrückstand: mindestens eine fällige Rate mit offenem Rest seit 30+ Spieltagen.
export function getSevereLeasingArrears(state) {
  const arrears = [];
  for (const contract of (state.leasingContracts || [])) {
    if (contract.status !== "active" && contract.status !== "ending") continue;
    if ((contract.overdueRatesCents || 0) > 0 && contract.overdueSinceMin) {
      const daysOverdue = Math.floor((state.gameTime - contract.overdueSinceMin) / DAY_MIN);
      if (daysOverdue >= SEVERE_OVERDUE_DAYS) {
        arrears.push({
          type: "leasing" as const, contractId: contract.id,
          overdueCents: contract.overdueRatesCents,
          overdueSinceMin: contract.overdueSinceMin, daysOverdue,
        });
      }
    }
  }
  return arrears;
}

// Schwerer Kreditrückstand: fällige Rate mit offenem Rest seit 30+ Spieltagen.
export function getSevereLoanArrears(state) {
  const arrears = [];
  for (const loan of (state.loans || [])) {
    if (loan.status !== "active") continue;
    const totalOverdue = (loan.overduePrincipalCents || 0) + (loan.overdueInterestCents || 0);
    if (totalOverdue > 0 && loan.overdueSinceMin) {
      const daysOverdue = Math.floor((state.gameTime - loan.overdueSinceMin) / DAY_MIN);
      if (daysOverdue >= SEVERE_OVERDUE_DAYS) {
        arrears.push({
          type: "loan" as const, loanId: loan.id,
          overduePrincipalCents: loan.overduePrincipalCents || 0,
          overdueInterestCents: loan.overdueInterestCents || 0,
          overdueCents: totalOverdue, overdueSinceMin: loan.overdueSinceMin, daysOverdue,
        });
      }
    }
  }
  return arrears;
}

export function getSevereFinancingArrears(state) {
  return [...getSevereLeasingArrears(state), ...getSevereLoanArrears(state)];
}

// ---------- Zentrale Zulassungsprüfung (Auftrag 22) ----------
// Gibt { allowed, blockingReasons, notices, terms, immediateCashRequired, netEffect } zurück.
// blockingReasons sperren die Aktion; notices sind Hinweise, die nicht sperren.
export function checkFinancingAccess(state, options) {
  const blockingReasons = [];
  const notices = [];
  const o = options || {};

  if (o.type === "leasing") {
    const offer = LEASING_OFFERS[o.offerId] || LEASING_OFFERS.standard_flex;
    const body = VEHICLE_BODY_TYPES[o.bodyType] || VEHICLE_BODY_TYPES.planen;
    const immediateCashRequired = Math.round(offer.specialPaymentCents * body.priceMultiplier);

    // Harte Ausschlussgründe
    const severeArrears = getSevereLeasingArrears(state);
    if (severeArrears.length > 0) {
      for (const a of severeArrears) {
        blockingReasons.push(`Schwerer Leasingrückstand: Vertrag ${a.contractId}, offen ${(a.overdueCents / 100).toFixed(0)} €, seit ${a.daysOverdue} Tagen überfällig.`);
      }
    }
    if (immediateCashRequired > 0 && state.company.accountCents < immediateCashRequired) {
      blockingReasons.push(`Sofortzahlung ${(immediateCashRequired / 100).toFixed(0)} € nicht verfügbar (Firmenbank: ${(state.company.accountCents / 100).toFixed(0)} €).`);
    }

    // Hinweise (nicht sperrend)
    const provCity = o.provisionCity || offer.returnLocationCity;
    const hasFreeDriver = (state.drivers || []).some(d =>
      d.locationCity === provCity && (d.status === "free" || d.status === "resting") && d.employmentStatus === "employed");
    if (!hasFreeDriver) {
      notices.push(`Kein freier Fahrer am Bereitstellungsort ${provCity} – Fahrzeug kann erst nach Einstellung disponiert werden.`);
    }
    notices.push("In dieser Vorschau sind noch nicht angenommene zukünftige Aufträge nicht enthalten.");

    return {
      allowed: blockingReasons.length === 0,
      blockingReasons, notices,
      terms: { version: FINANCING_ACCESS_VERSION, offerId: offer.id, ...offer },
      immediateCashRequired,
    };
  }

  if (o.type === "loan") {
    const amountCents = Math.floor((o.amountCents || 0) / 100) * 100;
    const termMonths = o.termMonths || 24;
    const limit = computeCreditLimit(state);
    const severeArrears = getSevereFinancingArrears(state);
    const clearArrears = !!o.clearArrears;

    // Harte Ausschlussgründe
    if (amountCents < LOAN_MIN_CENTS) blockingReasons.push("Mindestbetrag 5.000 €.");
    if (!LOAN_TERMS.includes(termMonths)) blockingReasons.push("Laufzeit muss 12, 24 oder 36 Monate sein.");
    if (amountCents > limit.available) {
      blockingReasons.push(`Übersteigt verfügbaren Kreditrahmen (${(limit.available / 100).toFixed(0)} €).`);
    }

    // Bei schweren Rückständen: Kredit nur zur Begleichung zulässig
    if (severeArrears.length > 0 && !clearArrears) {
      const totalArrears = severeArrears.reduce((s, a) => s + a.overdueCents, 0);
      blockingReasons.push(`Schwerer Finanzierungsrückstand (${(totalArrears / 100).toFixed(0)} €). Kredit aufnehmen und Rückstände begleichen?`);
    }

    // Hinweise
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
      limit,
      severeArrears,
    };
  }

  return { allowed: false, blockingReasons: ["Unbekannte Finanzierungsart"], notices };
}

// ---------- Kredit aufnehmen ----------
export function takeLoan(state, { amountCents, termMonths, clearArrears }) {
  amountCents = Math.floor(amountCents / 100) * 100;
  termMonths = termMonths || 24;
  const access = checkFinancingAccess(state, { type: "loan", amountCents, termMonths, clearArrears });
  if (!access.allowed) throw new Error(access.blockingReasons.join(" "));

  const fee = Math.round(amountCents * LOAN_FEE_RATE);
  const netPayout = amountCents - fee;
  const schedule = generateLoanSchedule(amountCents, termMonths, LOAN_INTEREST_RATE_MONTHLY);

  // Buchung: Bank +netPayout, Finanzierungskosten +fee, Darlehen +amountCents
  postJournal(state, {
    text: "Kreditauszahlung: " + (amountCents / 100).toFixed(0) + " € Darlehen",
    type: "loan_payout", gameTime: state.gameTime, actor: "player",
    lines: [
      { account: "1000", debit: netPayout },
      { account: "5610", debit: fee },
      { account: "2200", credit: amountCents },
    ],
  });

  const loanId = uid(state, "loan");
  const loan = {
    id: loanId, principalCents: amountCents, feeCents: fee,
    interestRateMonthly: LOAN_INTEREST_RATE_MONTHLY, termMonths,
    startMin: state.gameTime, firstPaymentMin: state.gameTime + 30 * DAY_MIN,
    schedule, payments: [],
    remainingPrincipalCents: amountCents,
    accruedInterestCents: 0, interestFraction: 0, lastAccrualMin: state.gameTime,
    overduePrincipalCents: 0, overdueInterestCents: 0, overdueSinceMin: null,
    status: "active", nextDueMin: state.gameTime + 30 * DAY_MIN, paidInstallments: 0,
  };
  state.loans = state.loans || [];
  state.loans.push(loan);

  // Bei clearArrears: schwere Rückstände aus der nun erhöhten Bank begleichen
  let clearedArrears = null;
  if (clearArrears && access.severeArrears.length > 0) {
    clearedArrears = settleSevereArrears(state, access.severeArrears);
  }

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Kreditvertrag abgeschlossen",
    body: `Darlehen ${loanId} über ${(amountCents / 100).toFixed(0)} € aufgenommen.\nGebühr: ${(fee / 100).toFixed(2)} €\nAuszahlung: ${(netPayout / 100).toFixed(2)} €\nLaufzeit: ${termMonths} Monate\nMonatszins: ${(LOAN_INTEREST_RATE_MONTHLY * 100).toFixed(2)} %\nErste Rate: ${formatGameTime(loan.firstPaymentMin)}`,
    gameTime: state.gameTime, category: "financing", priority: "normal",
    linkedRefs: { type: "loan", id: loanId }, dedupKey: `loan_signed:${loanId}`,
  });

  return { ok: true, loanId, principalCents: amountCents, feeCents: fee, netPayout, schedule, clearedArrears };
}

// Begleicht schwere Rückstände aus der aktuellen Firmenbank.
// Tilgungsanteil reduziert Resttilgung; Zinsanteil gleicht Zinsforderung aus.
function settleSevereArrears(state, severeArrears) {
  const cleared = [];
  for (const a of severeArrears) {
    if (a.type === "leasing") {
      const contract = (state.leasingContracts || []).find(c => c.id === a.contractId);
      if (!contract) continue;
      const pay = Math.min(state.company.accountCents, contract.overdueRatesCents);
      if (pay <= 0) continue;
      contract.overdueRatesCents -= pay;
      postJournal(state, {
        text: "Leasingrückstand beglichen: " + contract.id,
        type: "leasing_arrears_clear", gameTime: state.gameTime, actor: "player", vehicleId: contract.vehicleId,
        lines: [{ account: "2120", debit: pay }, { account: "1000", credit: pay }],
      });
      if (contract.overdueRatesCents <= 0) contract.overdueSinceMin = null;
      cleared.push({ type: "leasing" as const, contractId: contract.id, paidCents: pay });
    } else if (a.type === "loan") {
      const loan = (state.loans || []).find(l => l.id === a.loanId);
      if (!loan) continue;
      let remaining = state.company.accountCents;
      if (remaining <= 0) continue;
      const payInterest = Math.min(remaining, loan.overdueInterestCents || 0);
      remaining -= payInterest;
      const payPrincipal = Math.min(remaining, loan.overduePrincipalCents || 0);
      remaining -= payPrincipal;
      const totalPaid = payInterest + payPrincipal;
      if (totalPaid <= 0) continue;
      loan.overdueInterestCents -= payInterest;
      loan.overduePrincipalCents -= payPrincipal;
      loan.remainingPrincipalCents -= payPrincipal;
      const lines = [];
      if (payInterest > 0) lines.push({ account: "2230", debit: payInterest });
      if (payPrincipal > 0) lines.push({ account: "2210", debit: payPrincipal });
      lines.push({ account: "1000", credit: totalPaid });
      postJournal(state, {
        text: "Kreditrückstand beglichen: " + loan.id,
        type: "loan_arrears_clear", gameTime: state.gameTime, actor: "player", lines,
      });
      if ((loan.overdueInterestCents || 0) <= 0 && (loan.overduePrincipalCents || 0) <= 0) {
        loan.overdueSinceMin = null;
      }
      cleared.push({ type: "loan" as const, loanId: loan.id, paidInterestCents: payInterest, paidPrincipalCents: payPrincipal });
    }
  }
  return cleared;
}

// ---------- Zinsabgrenzung ----------
export function accrueLoanInterest(state, loan, m) {
  const elapsed = m - loan.lastAccrualMin;
  if (elapsed <= 0 || loan.remainingPrincipalCents <= 0) { loan.lastAccrualMin = m; return 0; }
  const rawInterest = loan.remainingPrincipalCents * loan.interestRateMonthly * elapsed / MONTH_MIN;
  loan.interestFraction += rawInterest;
  const wholeCents = Math.floor(loan.interestFraction);
  if (wholeCents > 0) {
    loan.accruedInterestCents += wholeCents;
    loan.interestFraction -= wholeCents;
    postJournal(state, {
      text: "Zinsabgrenzung: Darlehen " + loan.id,
      type: "loan_interest", gameTime: m, actor: "system",
      lines: [{ account: "5600", debit: wholeCents }, { account: "2230", credit: wholeCents }],
    });
  }
  loan.lastAccrualMin = m;
  return wholeCents;
}

// ---------- Ratenzahlung ----------
export function processLoanPayment(state, loan, m, log) {
  accrueLoanInterest(state, loan, m);
  const installment = loan.schedule[loan.paidInstallments];
  if (!installment) return;
  const principalDue = installment.principalCents;
  const interestDue = loan.accruedInterestCents;
  const available = state.company.accountCents;

  let interestPaid = Math.min(available, interestDue);
  let remainingCash = available - interestPaid;
  let principalPaid = Math.min(remainingCash, principalDue);
  let remainingInterest = interestDue - interestPaid;
  let remainingPrincipal = principalDue - principalPaid;

  loan.accruedInterestCents -= interestPaid;
  loan.remainingPrincipalCents -= principalPaid;

  if (remainingInterest > 0 || remainingPrincipal > 0) {
    if (!loan.overdueSinceMin) loan.overdueSinceMin = m;
  }
  if (remainingInterest > 0) loan.overdueInterestCents = (loan.overdueInterestCents || 0) + remainingInterest;
  if (remainingPrincipal > 0) {
    loan.overduePrincipalCents = (loan.overduePrincipalCents || 0) + remainingPrincipal;
    postJournal(state, {
      text: "Umgliederung fällige Tilgung: Darlehen " + loan.id,
      type: "loan_overdue", gameTime: m, actor: "system",
      lines: [{ account: "2200", debit: remainingPrincipal }, { account: "2210", credit: remainingPrincipal }],
    });
  }

  if (interestPaid > 0 || principalPaid > 0) {
    const lines = [];
    if (interestPaid > 0) lines.push({ account: "2230", debit: interestPaid });
    if (principalPaid > 0) lines.push({ account: "2200", debit: principalPaid });
    lines.push({ account: "1000", credit: interestPaid + principalPaid });
    postJournal(state, {
      text: "Kreditrate " + (loan.paidInstallments + 1) + "/" + loan.termMonths + ": " + loan.id,
      type: "loan_payment", gameTime: m, actor: "system", lines,
    });
  }

  loan.payments.push({
    installment: loan.paidInstallments + 1, atMin: m,
    principalPaidCents: principalPaid, interestPaidCents: interestPaid,
    status: (remainingInterest > 0 || remainingPrincipal > 0) ? "partial" : "paid",
  });
  loan.paidInstallments++;

  // Überfällige Beträge vollständig beglichen → overdueSinceMin zurücksetzen
  if ((loan.overdueInterestCents || 0) <= 0 && (loan.overduePrincipalCents || 0) <= 0) {
    loan.overdueSinceMin = null;
  }
  if (loan.paidInstallments < loan.termMonths) {
    loan.nextDueMin = loan.firstPaymentMin + loan.paidInstallments * 30 * DAY_MIN;
  } else {
    if (loan.remainingPrincipalCents <= 0 && loan.accruedInterestCents <= 0
      && (loan.overduePrincipalCents || 0) <= 0 && (loan.overdueInterestCents || 0) <= 0) {
      loan.status = "paid_off"; loan.nextDueMin = null;
    } else {
      loan.nextDueMin = loan.firstPaymentMin + loan.paidInstallments * 30 * DAY_MIN;
    }
  }

  log.push({ type: "loan_payment", loan: loan.id, atMin: m, principalPaid, interestPaid, remainingPrincipal, remainingInterest });

  if (remainingInterest > 0 || remainingPrincipal > 0) {
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Kreditrate nicht vollständig beglichen",
      body: `Die Kreditrate für Darlehen ${loan.id} konnte nicht vollständig beglichen werden.\nFehlend: ${(remainingPrincipal / 100).toFixed(2)} € Tilgung, ${(remainingInterest / 100).toFixed(2)} € Zinsen.`,
      gameTime: m, category: "financing", priority: "high",
      linkedRefs: { type: "loan", id: loan.id }, dedupKey: `loan_overdue:${loan.id}:${loan.paidInstallments}`,
    });
  }
  if (loan.status === "paid_off") {
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Darlehen vollständig getilgt",
      body: `Das Darlehen ${loan.id} über ${(loan.principalCents / 100).toFixed(0)} € wurde vollständig zurückgezahlt.`,
      gameTime: m, category: "financing", priority: "normal",
      linkedRefs: { type: "loan", id: loan.id }, dedupKey: `loan_paid_off:${loan.id}`,
    });
    log.push({ type: "loan_paid_off", loan: loan.id, atMin: m });
  }
}

// ---------- Sondertilgung ----------
export function earlyRepayLoan(state, { loanId, amountCents }) {
  const loan = (state.loans || []).find(l => l.id === loanId);
  if (!loan) throw new Error("Darlehen nicht gefunden.");
  if (loan.status !== "active") throw new Error("Darlehen ist nicht aktiv.");
  accrueLoanInterest(state, loan, state.gameTime);
  const totalInterestDue = loan.accruedInterestCents + (loan.overdueInterestCents || 0);
  const totalPrincipalDue = loan.remainingPrincipalCents + (loan.overduePrincipalCents || 0);
  const maxRepay = totalInterestDue + totalPrincipalDue;
  if (amountCents > maxRepay) throw new Error("Betrag übersteigt Restschuld (" + (maxRepay / 100).toFixed(2) + " €).");
  if (amountCents <= 0) throw new Error("Betrag muss positiv sein.");
  if (state.company.accountCents < amountCents) throw new Error("Firmenkonto reicht nicht aus.");

  let payInterest = Math.min(amountCents, loan.accruedInterestCents);
  let rem = amountCents - payInterest;
  let payOverdueInterest = Math.min(rem, loan.overdueInterestCents || 0); rem -= payOverdueInterest;
  let payOverduePrincipal = Math.min(rem, loan.overduePrincipalCents || 0); rem -= payOverduePrincipal;
  let payPrincipal = Math.min(rem, loan.remainingPrincipalCents);

  loan.accruedInterestCents -= payInterest;
  loan.overdueInterestCents = (loan.overdueInterestCents || 0) - payOverdueInterest;
  loan.overduePrincipalCents = (loan.overduePrincipalCents || 0) - payOverduePrincipal;
  loan.remainingPrincipalCents -= payPrincipal;

  const lines = [];
  if (payInterest > 0) lines.push({ account: "2230", debit: payInterest });
  if (payOverdueInterest > 0) lines.push({ account: "2230", debit: payOverdueInterest });
  if (payOverduePrincipal > 0) lines.push({ account: "2210", debit: payOverduePrincipal });
  if (payPrincipal > 0) lines.push({ account: "2200", debit: payPrincipal });
  lines.push({ account: "1000", credit: amountCents });
  postJournal(state, {
    text: "Sondertilgung: Darlehen " + loan.id,
    type: "loan_early_repay", gameTime: state.gameTime, actor: "player", lines,
  });

  const fullyPaid = loan.remainingPrincipalCents <= 0 && loan.accruedInterestCents <= 0
    && (loan.overduePrincipalCents || 0) <= 0 && (loan.overdueInterestCents || 0) <= 0;
  if (fullyPaid) {
    loan.status = "paid_off"; loan.nextDueMin = null;
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Darlehen vollständig abgelöst",
      body: `Das Darlehen ${loan.id} wurde durch Sondertilgung vollständig abgelöst.`,
      gameTime: state.gameTime, category: "financing", priority: "normal",
      linkedRefs: { type: "loan", id: loan.id }, dedupKey: `loan_settled:${loan.id}`,
    });
  } else {
    // Regulären Tilgungsanteil beibehalten, Laufzeit verkürzen
    const remainingInstallments = loan.termMonths - loan.paidInstallments;
    if (remainingInstallments > 0) {
      const newMonthlyPrincipal = Math.floor(loan.remainingPrincipalCents / remainingInstallments);
      let remaining = loan.remainingPrincipalCents;
      for (let i = loan.paidInstallments; i < loan.termMonths; i++) {
        const principal = (i === loan.termMonths - 1) ? remaining : newMonthlyPrincipal;
        const interest = Math.floor(remaining * loan.interestRateMonthly);
        loan.schedule[i] = {
          installment: i + 1, principalCents: principal, interestCents: interest,
          totalCents: principal + interest, remainingPrincipalCents: remaining - principal,
        };
        remaining -= principal;
      }
    }
  }
  return { ok: true, loanId, paidCents: amountCents, remainingPrincipalCents: loan.remainingPrincipalCents, status: loan.status };
}

// ---------- Leasing ----------
export function getLeasingOffer(offerId) {
  return LEASING_OFFERS[offerId] || LEASING_OFFERS.standard_flex;
}
export function getAllLeasingOffers() {
  return [
    LEASING_OFFERS.regional_flex,
    LEASING_OFFERS.standard_flex,
    LEASING_OFFERS.standard,
    LEASING_OFFERS.heavy_flex,
    ...Object.keys(ELECTRIC_MODELS).map(id=>LEASING_OFFERS[id+"_flex"]),
  ];
}

export function leaseTruck(state, { provisionCity, offerId, branchId, bodyType }: {provisionCity?: string; offerId?: string; branchId?: string; bodyType?: string} = {}) {
  const offer = getLeasingOffer(offerId);
  const access = checkFinancingAccess(state, { type: "leasing", offerId: offer.id, provisionCity });
  if (!access.allowed) throw new Error(access.blockingReasons.join(" "));

  const body = VEHICLE_BODY_TYPES[bodyType] || VEHICLE_BODY_TYPES.planen;
  const adjSpecial = Math.round(offer.specialPaymentCents * body.priceMultiplier);
  const adjMonthly = Math.round(offer.monthlyRateCents * body.priceMultiplier);
  const adjBuyout = Math.round(offer.buyoutPriceCents * body.priceMultiplier);
  if (!provisionCity) provisionCity = offer.returnLocationCity;
  const leaseBranch = branchId ? state.branches.find(b => b.id === branchId)
    : state.branches.find(b => b.city === provisionCity) || state.branches[0];
  if (!leaseBranch || leaseBranch.status !== "active") throw new Error("Keine aktive Filiale verfügbar.");
  const startMin = state.gameTime;

  const baseRef = offer.referencePriceCents || (offer.catalogId === "regional" ? 1800000 : offer.catalogId === "heavy" ? 5500000 : 3000000);
  const vehicleId = uid(state, "v");
  const vehicle = {
    id: vehicleId, branchId: leaseBranch.id, type: offer.vehicleType,
    catalogId: offer.catalogId || "standard", bodyType: body.id,
    capacityTons: offer.capacityTons, consumptionPer100km: offer.consumptionPer100km + body.consumptionAdd,
    bookValueCents: 0, condition: 100, locationCity: provisionCity,
    status: "free", tripId: null, maintenanceUntil: null,
    ownership_type: "leased", leasingContractId: null, odometerKm: 0,
    acquiredAtMin: startMin, referencePriceCents: Math.round(baseRef * body.priceMultiplier),
    markedForSale: false, saleOffer: null,
    ...electricFields(offer, body),
  };
  state.vehicles.push(vehicle);

  const contractId = uid(state, "lease");
  const endMin = startMin + offer.termMonths * 30 * DAY_MIN;
  const contract = {
    id: contractId, vehicleId, vehicleType: offer.vehicleType,
    offerId: offer.id,
    startMin, endMin, termMonths: offer.termMonths,
    specialPaymentCents: adjSpecial, monthlyRateCents: adjMonthly,
    includedKm: offer.includedKm, mileageRatePerKmCents: offer.mileageRatePerKmCents,
    buyoutPriceCents: adjBuyout,
    returnLocationCity: offer.returnLocationCity,
    minConditionAtReturn: offer.minConditionAtReturn,
    conditionPenaltyPerPointCents: offer.conditionPenaltyPerPointCents,
    prepaidLeasingCents: adjSpecial,
    prepaidResolutionPerMonthCents: adjSpecial > 0 ? Math.floor(adjSpecial / offer.termMonths) : 0,
    payments: [], startOdometerKm: 0, status: "active",
    nextRateDueMin: startMin + 30 * DAY_MIN, paidRates: 0,
    overdueRatesCents: 0, overdueSinceMin: null,
    notification30Sent: false, notification7Sent: false,
    lastOverduePeriod: 0,
  };
  vehicle.leasingContractId = contractId;
  state.leasingContracts = state.leasingContracts || [];
  state.leasingContracts.push(contract);

  // Sonderzahlung nur bei Variante B buchen (Variante A: 0 €)
  if (adjSpecial > 0) {
    postJournal(state, {
      text: "Leasing-Sonderzahlung: " + offer.vehicleType + " (" + body.label + ")",
      type: "leasing_provision", gameTime: state.gameTime, actor: "player", vehicleId,
      lines: [{ account: "1300", debit: adjSpecial }, { account: "1000", credit: adjSpecial }],
    });
  }

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Leasingvertrag abgeschlossen",
    body: `Ein Leasingvertrag für einen ${offer.vehicleType} (${body.label}) wurde abgeschlossen.\nVertragsnummer: ${contractId}\nVariante: ${offer.id === "standard_flex" ? "A (Flexibler Einstieg)" : "B (Niedrigere Rate)"}\nSonderzahlung: ${(adjSpecial / 100).toFixed(2)} €\nMonatliche Rate: ${(adjMonthly / 100).toFixed(2)} €\nLaufzeit: ${offer.termMonths} Monate\nInklusive Kilometer: ${offer.includedKm.toLocaleString("de-DE")} km\nKaufoption: ${(adjBuyout / 100).toFixed(2)} €\nRückgabeort: ${offer.returnLocationCity}\n\nDas Fahrzeug steht ab sofort in ${provisionCity} zur Verfügung.`,
    gameTime: state.gameTime, category: "financing", priority: "normal",
    linkedRefs: { type: "leasing", id: contractId }, dedupKey: `lease_signed:${contractId}`,
  });

  return { ok: true, contractId, vehicleId, offerId: offer.id, bodyType: body.id, specialPaymentCents: adjSpecial, monthlyRateCents: adjMonthly, endMin };
}

// ---------- Leasingrate ----------
export function processLeasingRate(state, contract, m, log) {
  const rate = contract.monthlyRateCents;
  const prepaidResolve = contract.prepaidResolutionPerMonthCents;

  // 1. Vorauszahlung auflösen
  const resolveAmt = Math.min(prepaidResolve, contract.prepaidLeasingCents);
  if (resolveAmt > 0) {
    contract.prepaidLeasingCents -= resolveAmt;
    postJournal(state, {
      text: "Leasing-Vorauszahlungsauflösung: " + contract.id,
      type: "leasing_prepaid_resolve", gameTime: m, actor: "system", vehicleId: contract.vehicleId,
      lines: [{ account: "5230", debit: resolveAmt }, { account: "1300", credit: resolveAmt }],
    });
  }

  // 2. Monatliche Rate
  const available = state.company.accountCents;
  const paid = Math.min(available, rate);
  const unpaid = rate - paid;
  if (paid > 0) {
    postJournal(state, {
      text: "Leasingrate " + (contract.paidRates + 1) + ": " + contract.id,
      type: "leasing_rate", gameTime: m, actor: "system", vehicleId: contract.vehicleId,
      lines: [{ account: "5230", debit: paid }, { account: "1000", credit: paid }],
    });
  }
  if (unpaid > 0) {
    contract.overdueRatesCents = (contract.overdueRatesCents || 0) + unpaid;
    if (!contract.overdueSinceMin) contract.overdueSinceMin = m;
    postJournal(state, {
      text: "Leasingrate (offen): " + contract.id,
      type: "leasing_rate_unpaid", gameTime: m, actor: "system", vehicleId: contract.vehicleId,
      lines: [{ account: "5230", debit: unpaid }, { account: "2120", credit: unpaid }],
    });
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Leasingrate nicht vollständig beglichen",
      body: `Die Leasingrate für Vertrag ${contract.id} konnte nicht vollständig beglichen werden.\nFehlend: ${(unpaid / 100).toFixed(2)} €\nNach 7 Tagen werden neue Touren mit diesem Fahrzeug gesperrt.`,
      gameTime: m, category: "financing", priority: "high",
      linkedRefs: { type: "leasing", id: contract.id }, dedupKey: `lease_overdue:${contract.id}:${contract.paidRates}`,
    });
  }

  contract.payments.push({ type: "rate", atMin: m, amountCents: rate, paidCents: paid, unpaidCents: unpaid, status: unpaid > 0 ? "partial" : "paid" });
  contract.paidRates++;
  contract.nextRateDueMin = contract.paidRates < contract.termMonths ? contract.startMin + (contract.paidRates + 1) * 30 * DAY_MIN : null;
  log.push({ type: "leasing_rate", contract: contract.id, atMin: m, paid, unpaid });
}

// ---------- Vertragsende ----------
export function processLeasingEnd(state, contract, m, log) {
  if (contract.status !== "active") return;
  contract.status = "ending";
  log.push({ type: "leasing_ending", contract: contract.id, atMin: m });
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Leasingvertrag endet",
    body: `Der Leasingvertrag ${contract.id} hat das reguläre Ende erreicht.\nBitte wähle: Rückgabe in ${contract.returnLocationCity} oder Kaufoption (${(contract.buyoutPriceCents / 100).toFixed(2)} €).\nBis zur Rückgabe/Übernahme fällt eine Abwicklungsvergütung von 40 € je 24h an.`,
    gameTime: m, category: "financing", priority: "high",
    linkedRefs: { type: "leasing", id: contract.id }, dedupKey: `lease_ending:${contract.id}`,
  });
}

// ---------- Abwicklungsvergütung ----------
export function processLeasingOverdue(state, contract, m, log) {
  if (contract.status !== "ending") return;
  const periodsElapsed = Math.floor((m - contract.endMin) / DAY_MIN) + 1;
  const lastPeriod = contract.lastOverduePeriod || 0;
  if (periodsElapsed > lastPeriod) {
    const newPeriods = periodsElapsed - lastPeriod;
    const cost = newPeriods * LEASING_OVERDUE_PENALTY_CENTS;
    contract.lastOverduePeriod = periodsElapsed;
    const paid = Math.min(state.company.accountCents, cost);
    const unpaid = cost - paid;
    postJournal(state, {
      text: "Leasing-Abwicklungsvergütung: " + contract.id,
      type: "leasing_overdue_penalty", gameTime: m, actor: "system", vehicleId: contract.vehicleId,
      lines: [
        { account: "5230", debit: cost },
        ...(paid > 0 ? [{ account: "1000", credit: paid }] : []),
        ...(unpaid > 0 ? [{ account: "2120", credit: unpaid }] : []),
      ],
    });
    log.push({ type: "leasing_overdue_penalty", contract: contract.id, atMin: m, cost });
  }
}

// ---------- Benachrichtigungen ----------
export function processLeasingNotifications(state, contract, m, log) {
  const daysUntilEnd = Math.floor((contract.endMin - m) / DAY_MIN);
  if (daysUntilEnd <= 30 && !contract.notification30Sent) {
    contract.notification30Sent = true;
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Leasingvertrag endet in 30 Tagen",
      body: `Der Leasingvertrag ${contract.id} endet in 30 Tagen (${formatGameTime(contract.endMin)}).\nKaufoption: ${(contract.buyoutPriceCents / 100).toFixed(2)} €\nRückgabeort: ${contract.returnLocationCity}`,
      gameTime: m, category: "financing", priority: "normal",
      linkedRefs: { type: "leasing", id: contract.id }, dedupKey: `lease_notif30:${contract.id}`,
    });
    log.push({ type: "leasing_notif30", contract: contract.id, atMin: m });
  }
  if (daysUntilEnd <= 7 && !contract.notification7Sent) {
    contract.notification7Sent = true;
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Leasingvertrag endet in 7 Tagen",
      body: `Der Leasingvertrag ${contract.id} endet in 7 Tagen (${formatGameTime(contract.endMin)}).\nBitte entscheide jetzt: Rückgabe oder Kaufoption.`,
      gameTime: m, category: "financing", priority: "high",
      linkedRefs: { type: "leasing", id: contract.id }, dedupKey: `lease_notif7:${contract.id}`,
    });
    log.push({ type: "leasing_notif7", contract: contract.id, atMin: m });
  }
}

// ---------- Rückgabe ----------
export function returnLeasedTruck(state, { contractId }) {
  const contract = (state.leasingContracts || []).find(c => c.id === contractId);
  if (!contract) throw new Error("Leasingvertrag nicht gefunden.");
  if (contract.status !== "active" && contract.status !== "ending") throw new Error("Vertrag ist nicht aktiv oder endet.");
  const vehicle = state.vehicles.find(v => v.id === contract.vehicleId);
  if (!vehicle) throw new Error("Fahrzeug nicht gefunden.");
  if (vehicle.status === "on_trip") throw new Error("Fahrzeug ist noch auf Tour.");
  if (vehicle.locationCity !== contract.returnLocationCity)
    throw new Error("Fahrzeug muss am Rückgabeort (" + contract.returnLocationCity + ") sein. Aktuell: " + vehicle.locationCity);

  const drivenKm = (vehicle.odometerKm || 0) - contract.startOdometerKm;
  const excessKm = Math.max(0, drivenKm - contract.includedKm);
  const mileageCost = excessKm * contract.mileageRatePerKmCents;
  const conditionDeficit = Math.max(0, contract.minConditionAtReturn - vehicle.condition);
  const conditionCost = conditionDeficit * contract.conditionPenaltyPerPointCents;

  const bookCost = (label, type, cost) => {
    if (cost <= 0) return;
    const paid = Math.min(state.company.accountCents, cost);
    const unpaid = cost - paid;
    postJournal(state, {
      text: label + ": " + contract.id, type, gameTime: state.gameTime, actor: "player", vehicleId: vehicle.id,
      lines: [{ account: "5230", debit: cost },
        ...(paid > 0 ? [{ account: "1000", credit: paid }] : []),
        ...(unpaid > 0 ? [{ account: "2120", credit: unpaid }] : [])],
    });
  };
  bookCost("Leasing-Mehrkilometer", "leasing_mileage", mileageCost);
  bookCost("Leasing-Zustandsentschädigung", "leasing_condition", conditionCost);

  if (contract.prepaidLeasingCents > 0) {
    postJournal(state, {
      text: "Leasing-Vorauszahlungsrest abschreiben: " + contract.id,
      type: "leasing_prepaid_writeoff", gameTime: state.gameTime, actor: "system", vehicleId: vehicle.id,
      lines: [{ account: "5230", debit: contract.prepaidLeasingCents }, { account: "1300", credit: contract.prepaidLeasingCents }],
    });
    contract.prepaidLeasingCents = 0;
  }

  vehicle.status = "archived"; vehicle.archivedAtMin = state.gameTime; vehicle.archiveReason = "leasing_returned";
  contract.status = "returned"; contract.returnedAtMin = state.gameTime;
  contract.returnMileageCost = mileageCost; contract.returnConditionCost = conditionCost; contract.returnExcessKm = excessKm;

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Leasingfahrzeug zurückgegeben",
    body: `Der Leasingvertrag ${contract.id} wurde beendet.\nMehr-Kilometer: ${excessKm.toLocaleString("de-DE")} km → ${(mileageCost / 100).toFixed(2)} €\nZustandsentschädigung: ${(conditionCost / 100).toFixed(2)} €\n\nDas Fahrzeug wurde aus der Flotte genommen.`,
    gameTime: state.gameTime, category: "financing", priority: "normal",
    linkedRefs: { type: "leasing", id: contract.id }, dedupKey: `lease_returned:${contract.id}`,
  });
  return { ok: true, contractId, mileageCost, conditionCost, excessKm };
}

// ---------- Kaufoption ----------
export function buyoutLeasedTruck(state, { contractId }) {
  const contract = (state.leasingContracts || []).find(c => c.id === contractId);
  if (!contract) throw new Error("Leasingvertrag nicht gefunden.");
  if (contract.status !== "active" && contract.status !== "ending") throw new Error("Vertrag ist nicht aktiv oder endet.");
  const vehicle = state.vehicles.find(v => v.id === contract.vehicleId);
  if (!vehicle) throw new Error("Fahrzeug nicht gefunden.");

  const drivenKm = (vehicle.odometerKm || 0) - contract.startOdometerKm;
  const excessKm = Math.max(0, drivenKm - contract.includedKm);
  const mileageCost = excessKm * contract.mileageRatePerKmCents;
  const totalDue = contract.buyoutPriceCents + mileageCost;
  if (state.company.accountCents < totalDue)
    throw new Error("Firmenkonto reicht für Kaufoption (" + (totalDue / 100).toFixed(2) + " €) nicht aus.");

  postJournal(state, {
    text: "Leasing-Kaufoption: " + contract.id,
    type: "leasing_buyout", gameTime: state.gameTime, actor: "player", vehicleId: vehicle.id,
    lines: [
      { account: "1200", debit: contract.buyoutPriceCents },
      ...(mileageCost > 0 ? [{ account: "5230", debit: mileageCost }] : []),
      { account: "1000", credit: totalDue },
    ],
  });

  if (contract.prepaidLeasingCents > 0) {
    postJournal(state, {
      text: "Leasing-Vorauszahlungsrest bei Übernahme: " + contract.id,
      type: "leasing_prepaid_writeoff", gameTime: state.gameTime, actor: "system", vehicleId: vehicle.id,
      lines: [{ account: "5230", debit: contract.prepaidLeasingCents }, { account: "1300", credit: contract.prepaidLeasingCents }],
    });
    contract.prepaidLeasingCents = 0;
  }

  vehicle.ownership_type = "owned";
  vehicle.bookValueCents = contract.buyoutPriceCents;
  vehicle.leasingContractId = null;
  vehicle.referencePriceCents = vehicle.referencePriceCents || 3000000;
  // acquiredAtMin bleibt erhalten – Alter/Kilometer/Zustand gehen nicht verloren (Auftrag 21)
  if (vehicle.acquiredAtMin === undefined) vehicle.acquiredAtMin = contract.startMin;
  registerAsset(state, {
    vehicleId: vehicle.id, account: "1200",
    name: "Lkw " + String(parseInt(String(vehicle.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0"),
    acquisitionCostCents: contract.buyoutPriceCents, acquiredAtMin: state.gameTime,
  });
  contract.status = "bought"; contract.boughtAtMin = state.gameTime; contract.buyoutMileageCost = mileageCost;

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Leasingfahrzeug übernommen",
    body: `Der Leasingvertrag ${contract.id} wurde durch Kaufoption beendet.\nKaufpreis: ${(contract.buyoutPriceCents / 100).toFixed(2)} €\nMehr-Kilometer: ${excessKm.toLocaleString("de-DE")} km → ${(mileageCost / 100).toFixed(2)} €\n\nDas Fahrzeug ist jetzt Eigentum der Firma.`,
    gameTime: state.gameTime, category: "financing", priority: "normal",
    linkedRefs: { type: "leasing", id: contract.id }, dedupKey: `lease_bought:${contract.id}`,
  });
  return { ok: true, contractId, buyoutPriceCents: contract.buyoutPriceCents, mileageCost, excessKm };
}

// ---------- Vorzeitige Auflösung ----------
export function earlyTerminateLease(state, { contractId }) {
  const contract = (state.leasingContracts || []).find(c => c.id === contractId);
  if (!contract) throw new Error("Leasingvertrag nicht gefunden.");
  if (contract.status !== "active") throw new Error("Vertrag ist nicht aktiv.");
  const vehicle = state.vehicles.find(v => v.id === contract.vehicleId);
  if (!vehicle) throw new Error("Fahrzeug nicht gefunden.");
  if (vehicle.status === "on_trip") throw new Error("Fahrzeug ist auf Tour.");

  const remainingRates = contract.termMonths - contract.paidRates;
  const remainingRateCost = Math.floor(remainingRates * contract.monthlyRateCents * LEASING_EARLY_TERM_RATE);
  const overdueRates = contract.overdueRatesCents || 0;
  const drivenKm = (vehicle.odometerKm || 0) - contract.startOdometerKm;
  const excessKm = Math.max(0, drivenKm - contract.includedKm);
  const mileageCost = excessKm * contract.mileageRatePerKmCents;
  const totalCost = remainingRateCost + overdueRates + mileageCost;
  if (state.company.accountCents < totalCost)
    throw new Error("Firmenkonto reicht für vorzeitige Auflösung (" + (totalCost / 100).toFixed(2) + " €) nicht aus.");

  const paid = Math.min(state.company.accountCents, totalCost);
  const unpaid = totalCost - paid;
  postJournal(state, {
    text: "Leasing vorzeitig aufgelöst: " + contract.id,
    type: "leasing_early_terminate", gameTime: state.gameTime, actor: "player", vehicleId: vehicle.id,
    lines: [{ account: "5230", debit: totalCost },
      ...(paid > 0 ? [{ account: "1000", credit: paid }] : []),
      ...(unpaid > 0 ? [{ account: "2120", credit: unpaid }] : [])],
  });
  if (contract.prepaidLeasingCents > 0) {
    postJournal(state, {
      text: "Leasing-Vorauszahlungsrest bei Auflösung: " + contract.id,
      type: "leasing_prepaid_writeoff", gameTime: state.gameTime, actor: "system", vehicleId: vehicle.id,
      lines: [{ account: "5230", debit: contract.prepaidLeasingCents }, { account: "1300", credit: contract.prepaidLeasingCents }],
    });
    contract.prepaidLeasingCents = 0;
  }

  vehicle.status = "archived"; vehicle.archivedAtMin = state.gameTime; vehicle.archiveReason = "leasing_terminated";
  contract.status = "terminated"; contract.terminatedAtMin = state.gameTime; contract.terminationCost = totalCost;

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Leasingvertrag vorzeitig aufgelöst",
    body: `Der Leasingvertrag ${contract.id} wurde vorzeitig aufgelöst.\nAuflösungskosten: ${(totalCost / 100).toFixed(2)} €\nDas Fahrzeug wurde aus der Flotte genommen.`,
    gameTime: state.gameTime, category: "financing", priority: "normal",
    linkedRefs: { type: "leasing", id: contract.id }, dedupKey: `lease_terminated:${contract.id}`,
  });
  return { ok: true, contractId, totalCost };
}

// ---------- Tour-Sperre bei Leasingrückstand ----------
export function isLeasingOverdueBlocked(state, vehicleId) {
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  if (!vehicle || (vehicle.ownership_type || "owned") !== "leased") return false;
  const contract = (state.leasingContracts || []).find(c => c.id === vehicle.leasingContractId);
  if (!contract) return false;
  if (contract.status === "ending") return true;
  if (contract.overdueRatesCents > 0 && contract.overdueSinceMin) {
    return state.gameTime >= contract.overdueSinceMin + LEASING_OVERDUE_GRACE_DAYS * DAY_MIN;
  }
  return false;
}

// ---------- Leasing-Verbindlichkeiten nächste 90 Tage ----------
export function computeLeasingDue90(state) {
  const m = state.gameTime;
  const horizon = m + 90 * DAY_MIN;
  let total = 0;
  for (const contract of (state.leasingContracts || [])) {
    if (contract.status !== "active" && contract.status !== "ending") continue;
    for (let i = contract.paidRates; i < contract.termMonths; i++) {
      const dueMin = contract.startMin + i * 30 * DAY_MIN;
      if (dueMin > horizon) break;
      if (dueMin > m) total += contract.monthlyRateCents;
    }
    total += contract.overdueRatesCents || 0;
  }
  return total;
}

// ---------- Finanzierungs-Verbindlichkeiten nächste 90 Tage ----------
export function computeFinancingDue90(state) {
  const m = state.gameTime;
  const horizon = m + 90 * DAY_MIN;
  let total = computeLeasingDue90(state);
  for (const loan of (state.loans || [])) {
    if (loan.status !== "active") continue;
    for (let i = loan.paidInstallments; i < loan.termMonths; i++) {
      const dueMin = loan.firstPaymentMin + i * 30 * DAY_MIN;
      if (dueMin > horizon) break;
      if (dueMin > m) total += loan.schedule[i]?.totalCents || 0;
    }
    total += loan.overduePrincipalCents || 0;
    total += loan.overdueInterestCents || 0;
    total += loan.accruedInterestCents || 0;
  }
  return total;
}

// ---------- Event-Verarbeitung ----------
export function processFinancingEvents(state, m, log) {
  for (const loan of (state.loans || [])) {
    if (loan.status !== "active") continue;
    accrueLoanInterest(state, loan, m);
    if (loan.nextDueMin === m) processLoanPayment(state, loan, m, log);
  }
  for (const contract of (state.leasingContracts || [])) {
    if (contract.status === "active") {
      processLeasingNotifications(state, contract, m, log);
      if (contract.nextRateDueMin === m) processLeasingRate(state, contract, m, log);
      if (contract.endMin === m) processLeasingEnd(state, contract, m, log);
    }
    if (contract.status === "ending") processLeasingOverdue(state, contract, m, log);
  }
}

export function getFinancingDueEvents(state, t, maxMin) {
  const events = [];
  for (const loan of (state.loans || [])) {
    if (loan.status !== "active") continue;
    if (loan.nextDueMin && loan.nextDueMin > t && loan.nextDueMin <= maxMin) events.push(loan.nextDueMin);
  }
  for (const contract of (state.leasingContracts || [])) {
    if (contract.status === "active") {
      if (contract.nextRateDueMin && contract.nextRateDueMin > t && contract.nextRateDueMin <= maxMin) events.push(contract.nextRateDueMin);
      const notif30 = contract.endMin - 30 * DAY_MIN;
      if (notif30 > t && notif30 <= maxMin && !contract.notification30Sent) events.push(notif30);
      const notif7 = contract.endMin - 7 * DAY_MIN;
      if (notif7 > t && notif7 <= maxMin && !contract.notification7Sent) events.push(notif7);
      if (contract.endMin > t && contract.endMin <= maxMin) events.push(contract.endMin);
    }
    if (contract.status === "ending") {
      const nextPeriod = contract.endMin + (Math.floor((t - contract.endMin) / DAY_MIN) + 1) * DAY_MIN;
      if (nextPeriod > t && nextPeriod <= maxMin) events.push(nextPeriod);
    }
  }
  return events;
}

// ---------- Migration ----------
export function migrateFinancing(state) {
  if (!state.loans) state.loans = [];
  if (!state.leasingContracts) state.leasingContracts = [];
  for (const v of (state.vehicles || [])) {
    if (!v.ownership_type) v.ownership_type = "owned";
    if (v.odometerKm === undefined) v.odometerKm = 0;
    if (!v.leasingContractId) v.leasingContractId = null;
  }
  // Auftrag 22: overdueSinceMin für bestehende Kredite initialisieren
  for (const loan of state.loans) {
    if (loan.overdueSinceMin === undefined) {
      const hasOverdue = (loan.overduePrincipalCents || 0) > 0 || (loan.overdueInterestCents || 0) > 0;
      loan.overdueSinceMin = hasOverdue ? (loan.nextDueMin || loan.lastAccrualMin || state.gameTime) : null;
    }
  }
  // Angebot-ID für bestehende Leasingverträge ergänzen
  for (const contract of state.leasingContracts) {
    if (!contract.offerId) {
      // Alte Verträge mit Sonderzahlung → Variante B, ohne → Variante A
      contract.offerId = contract.specialPaymentCents > 0 ? "standard" : "standard_flex";
    }
  }
}