// Liquiditätsvorschau-Engine für FERNWERK.
// Reine, lesende Berechnung — verändert keinen Spielzustand, verbraucht
// keinen Zufall, führt keine Buchungen aus. Erzeugt eine Tages-Projektion
// der Kontostände für Firmen- und Privatkonto über 7 oder 30 Spieltage.
//
// Drei Ansichten:
// A) Bekannte Zahlungen — bestehende Verpflichtungen mit bekanntem Termin
// B) Erwarteter Verlauf — + erwartete Erlöse/Kosten aus angenommenen Aufträgen
// C) Vorsichtige Planung — + vom Spieler einstellbare Annahmen
//
// Zahlungsregeln (aus simulationEngine/accountingEngine/financingEngine abgeleitet):
// - Transporterlöse: sofort bei Lieferung verbucht (Konto 1000), kein Zahlungsziel
// - Kraftstoff/Maut: bei Transportstart bezahlt, nicht bei Lieferung
// - Löhne, Standortkosten, private Entnahme, Lebenshaltung: täglich um Mitternacht
// - Kreditraten: alle 30 Spieltage (firstPaymentMin + i × 30 × 1440)
// - Leasingraten: alle 30 Spieltage (startMin + i × 30 × 1440)
// - Offene Posten: haben optionales dueMin, können teilbezahlt sein
// - Abschreibung: KEINE Kontobewegung, nicht in Liquiditätskurve

import {
  DRIVER_COST_PER_DAY, BRANCH_COST_PER_DAY,
  PRIVATE_WITHDRAWAL_PER_DAY, PRIVATE_LIVING_PER_DAY,
  HIRE_FEE, BRANCH_OPEN_FEE,
  VEHICLE_CATALOG, getDistance,
} from "./gameRules.ts";
import { LEASING_OFFERS } from "./financingEngine.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";

const DAY_MIN = 1440;

// ---------- Hilfsfunktionen ----------
function dayOf(min) { return Math.floor(min / DAY_MIN) + 1; }
function midnightOf(day) { return (day - 1) * DAY_MIN; }

// Sammelt alle Personen, die täglich Lohn beziehen.
// Fahrer und Angestellte werden separat ausgewertet, da sie in
// unterschiedlichen Arrays liegen (drivers vs. employees).
function getDailyPersonnelCostCents(state) {
  let total = 0;
  for (const d of (state.drivers || [])) {
    if (!isActivelyEmployed(d)) continue;
    total += d.costPerDayCents || DRIVER_COST_PER_DAY;
  }
  for (const e of (state.employees || [])) {
    if (!isActivelyEmployed(e)) continue;
    total += e.costPerDayCents || 0;
  }
  return total;
}

function getDailyBranchCostCents(state) {
  let total = 0;
  for (const b of (state.branches || [])) {
    if (b.status !== "active") continue;
    total += BRANCH_COST_PER_DAY;
  }
  return total;
}

// ---------- Prognose-Position ----------
// Jede Position ist eindeutig einer Quelle zugeordnet, um
// Doppelzählungen zu vermeiden (sourceId ist eindeutig).
//
// account: "company" | "private"
// direction: "in" | "out"
// view: "known" | "expected" | "conservative"
// sourceType: Identifikation der Quelldaten
// sourceId: Eindeutige ID innerhalb der Quelle
// certainty: "certain" | "expected" | "assumed"
// min: Spielminute der erwarteten Zahlung (null = ohne festen Termin)
// amountCents: Betrag in Cent (immer positiv; Richtung über direction)
// label: Anzeigename
// linkedRef: { type, id } — Verknüpfung zur verursachenden Entität

function makePosition(account, direction, view, sourceType, sourceId, min, amountCents, label, certainty, linkedRef) {
  return {
    account, direction, view, sourceType, sourceId,
    min, amountCents, label,
    certainty: certainty || (view === "known" ? "certain" : view === "expected" ? "expected" : "assumed"),
    linkedRef: linkedRef || null,
  };
}

// ---------- Bekannte Zahlungen (Ansicht A) ----------

// Offene Posten mit Restbetrag > 0.
// Forderungen (1100, 1150) sind Einzahlungen, Verbindlichkeiten (2100, 2110, 2120, 2200, 2210, 2230) Auszahlungen.
// Posten ohne dueMin haben keinen festen Termin — sie werden als "fällig sofort" markiert.
function collectOpenItems(state, horizonMin) {
  const positions = [];
  const items = (state.accounting?.openItems || []).filter(i => i.remainingCents > 0);
  for (const item of items) {
    const isReceivable = item.account === "1100" || item.account === "1150";
    const direction = isReceivable ? "in" : "out";
    const min = item.dueMin || null;
    // Nur Positionen innerhalb des Horizonts aufnehmen (oder ohne Termin)
    if (min !== null && min > horizonMin) continue;
    positions.push(makePosition(
      "company", direction, "known",
      "openItem", item.id,
      min, item.remainingCents,
      item.cause || (isReceivable ? "Forderung" : "Verbindlichkeit"),
      "certain",
      { type: "openItem", id: item.id, account: item.account },
    ));
  }
  return positions;
}

// Kreditraten: für jeden aktiven Kredit, jede unbezahlte Rate.
// Die Rate fällt am firstPaymentMin + i × 30 × 1440 an.
// Der Betrag umfasst Tilgung + Zins (aus dem Tilgungsplan).
// Hinweis: Zinsen accrue kontinuierlich, aber die Rate ist der
// geplante Gesamtbetrag — das ist die bekannte Verbindlichkeit.
function collectLoanPayments(state, horizonMin) {
  const positions = [];
  for (const loan of (state.loans || [])) {
    if (loan.status !== "active") continue;
    // Überfällige Beträge: sofort fällig
    const overdue = (loan.overduePrincipalCents || 0) + (loan.overdueInterestCents || 0);
    if (overdue > 0) {
      positions.push(makePosition(
        "company", "out", "known",
        "loanOverdue", loan.id,
        state.gameTime, overdue,
        "Überfällige Kreditrate: " + loan.id,
        "certain",
        { type: "loan", id: loan.id },
      ));
    }
    // Geplante Raten
    for (let i = loan.paidInstallments; i < loan.termMonths; i++) {
      const dueMin = loan.firstPaymentMin + i * 30 * DAY_MIN;
      if (dueMin <= state.gameTime) continue; // bereits fällig gewesen
      if (dueMin > horizonMin) break;
      const installment = loan.schedule?.[i];
      if (!installment) continue;
      positions.push(makePosition(
        "company", "out", "known",
        "loanRate", loan.id + ":r" + i,
        dueMin, installment.totalCents,
        "Kreditrate " + (i + 1) + "/" + loan.termMonths + ": " + loan.id,
        "certain",
        { type: "loan", id: loan.id, installment: i + 1 },
      ));
    }
  }
  return positions;
}

// Leasingraten: für jeden aktiven Vertrag, jede unbezahlte Rate.
// Die Rate fällt am startMin + i × 30 × 1440 an.
function collectLeasingPayments(state, horizonMin) {
  const positions = [];
  for (const contract of (state.leasingContracts || [])) {
    if (contract.status !== "active" && contract.status !== "ending") continue;
    // Überfällige Beträge: sofort fällig
    if (contract.overdueRatesCents > 0) {
      positions.push(makePosition(
        "company", "out", "known",
        "leasingOverdue", contract.id,
        state.gameTime, contract.overdueRatesCents,
        "Überfällige Leasingrate: " + contract.id,
        "certain",
        { type: "leasing", id: contract.id },
      ));
    }
    // Geplante Raten
    for (let i = contract.paidRates; i < contract.termMonths; i++) {
      const dueMin = contract.startMin + i * 30 * DAY_MIN;
      if (dueMin <= state.gameTime) continue;
      if (dueMin > horizonMin) break;
      positions.push(makePosition(
        "company", "out", "known",
        "leasingRate", contract.id + ":r" + i,
        dueMin, contract.monthlyRateCents,
        "Leasingrate " + (i + 1) + "/" + contract.termMonths + ": " + contract.id,
        "certain",
        { type: "leasing", id: contract.id, installment: i + 1 },
      ));
    }
  }
  return positions;
}

// Laufende Transporte: Erlös bei Lieferung bekannt (Kraftstoff/Maut bereits bezahlt).
// Diese sind "known" weil der Transport bereits läuft — der Erlös ist vertraglich
// vereinbart, die Lieferung findet statt (außer bei Störungen, die nicht vorhersehbar sind).
function collectInProgressTrips(state, horizonMin) {
  const positions = [];
  for (const trip of (state.trips || [])) {
    if (trip.status !== "in_progress") continue;
    if (trip.type === "empty") continue; // Leerfahrten haben keinen Erlös
    if (trip.endMin > horizonMin) continue;
    const order = (state.orders || []).find(o => o.id === trip.orderId);
    if (!order) continue;
    // Erlös: vollen Betrag bei pünktlicher Lieferung, 90% bei verspäteter
    // Da wir nicht wissen ob pünktlich, nehmen wir den vollen Betrag (known)
    // — die Lieferung ist bereits unterwegs, die Vergütung steht fest.
    positions.push(makePosition(
      "company", "in", "known",
      "tripRevenue", trip.id,
      trip.endMin, trip.paymentCents,
      "Transporterlös: " + order.customer,
      "certain",
      { type: "trip", id: trip.id, orderId: order.id },
    ));
  }
  return positions;
}

// Geplante Wartungsaufträge (Werkstatt): bekannte Kosten bei Abschluss.
// Interne Wartung: Teilekosten (INTERNAL_MAINT_PARTS) + Mechanikerzeit.
// Externe Wartung: priceCents des Anbieters.
function collectPlannedMaintenance(state, horizonMin) {
  const positions = [];
  const orders = state.workshop?.maintenanceOrders || [];
  for (const order of orders) {
    if (order.status !== "planned" && order.status !== "waiting" && order.status !== "in_progress") continue;
    // Geschätzte Kosten: bei extern 150000, bei intern 90000 (Teile)
    const isExternal = order.type === "external";
    const costCents = isExternal ? 150000 : 90000;
    // Zeitpunkt: bei geplanten Aufträgen die geplante Startzeit,
    // bei laufenden die voraussichtliche Fertigstellung.
    let min = order.plannedStartMin || order.startedAtMin || state.gameTime;
    if (order.status === "in_progress") {
      min = order.estimatedEndMin || (min + 480);
    }
    if (min > horizonMin) continue;
    positions.push(makePosition(
      "company", "out", "known",
      "maintenance", order.id,
      min, costCents,
      "Wartungsauftrag: " + (order.vehicleId || "?"),
      "certain",
      { type: "maintenanceOrder", id: order.id },
    ));
  }
  return positions;
}

// Tägliche wiederkehrende Kosten (Mitternacht):
// - Fahrerlöhne, Angestelltenlöhne, Standortkosten
// - Private Entnahme (Firma → Privat)
// - Lebenshaltung (Privat → extern)
// Diese sind "known" weil sie jeden Tag um Mitternacht anfallen.
function collectDailyRecurring(state, horizonMin) {
  const positions = [];
  const personnelCost = getDailyPersonnelCostCents(state);
  const branchCost = getDailyBranchCostCents(state);
  const withdrawal = state.private?.dailyWithdrawalCents ?? PRIVATE_WITHDRAWAL_PER_DAY;
  const living = PRIVATE_LIVING_PER_DAY;

  const startDay = dayOf(state.gameTime);
  const endDay = dayOf(horizonMin);
  for (let day = startDay; day <= endDay; day++) {
    const midnight = midnightOf(day);
    if (midnight <= state.gameTime) continue; // heutige Mitternacht bereits passiert
    if (midnight > horizonMin) break;
    if (personnelCost > 0) {
      positions.push(makePosition(
        "company", "out", "known",
        "dailyPersonnel", "day" + day,
        midnight, personnelCost,
        "Personal: Löhne Tag " + day,
        "certain",
        { type: "dailyCost", subtype: "personnel", day },
      ));
    }
    if (branchCost > 0) {
      positions.push(makePosition(
        "company", "out", "known",
        "dailyBranch", "day" + day,
        midnight, branchCost,
        "Standortkosten Tag " + day,
        "certain",
        { type: "dailyCost", subtype: "branch", day },
      ));
    }
    // Private Entnahme: Firma raus, Privat rein
    if (withdrawal > 0) {
      positions.push(makePosition(
        "company", "out", "known",
        "dailyWithdrawalOut", "day" + day,
        midnight, withdrawal,
        "Private Entnahme Tag " + day,
        "certain",
        { type: "dailyCost", subtype: "withdrawal", day },
      ));
      positions.push(makePosition(
        "private", "in", "known",
        "dailyWithdrawalIn", "day" + day,
        midnight, withdrawal,
        "Private Entnahme Tag " + day,
        "certain",
        { type: "dailyCost", subtype: "withdrawal", day },
      ));
    }
    // Lebenshaltung: Privat raus
    if (living > 0) {
      positions.push(makePosition(
        "private", "out", "known",
        "dailyLiving", "day" + day,
        midnight, living,
        "Lebenshaltung Tag " + day,
        "certain",
        { type: "dailyCost", subtype: "living", day },
      ));
    }
  }
  return positions;
}

// ---------- Erwartete Zahlungen (Ansicht B, ergänzt A) ----------

// Angenommene, noch nicht gestartete Aufträge: erwarteter Erlös bei Lieferung.
// Die Lieferung hängt davon ab, dass der Auftrag disponiert wird —
// daher ist dies "expected", nicht "certain".
// Wir schätzen den Lieferzeitpunkt als earliestPickupMin + Fahrzeit + Operationen.
function collectAcceptedOrders(state, horizonMin) {
  const positions = [];
  for (const order of (state.orders || [])) {
    if (order.status !== "angenommen") continue;
    // Bereits auf einer Tour? Dann als known behandeln (wird von collectInProgressTrips erfasst)
    const onTour = (state.tours || []).some(t =>
      t.status === "active" && (t.deployments || []).some(d => d.orderId === order.id && d.status !== "cancelled")
    );
    const inTrip = (state.trips || []).some(t => t.orderId === order.id && t.status === "in_progress");
    if (onTour || inTrip) continue;
    // Geschätzter Lieferzeitpunkt: earliestPickupMin + Fahrzeit + Beladung + Entladung
    const km = getDistance(order.fromCity, order.toCity);
    const driveMin = Math.ceil(km / 60 * 60); // AVG_SPEED = 60
    const earliestDelivery = (order.earliestPickupMin || state.gameTime) + 60 + driveMin + 60;
    if (earliestDelivery > horizonMin) continue;
    positions.push(makePosition(
      "company", "in", "expected",
      "acceptedOrder", order.id,
      earliestDelivery, order.paymentCents,
      "Erwarteter Erlös: " + order.customer,
      "expected",
      { type: "order", id: order.id },
    ));
  }
  return positions;
}

// Vertragsaufträge: erwartete Erlöse aus aktiven Rahmenverträgen.
// Für jeden aktiven Vertrag, für jeden Tag im Horizont innerhalb der Laufzeit:
// transportsPerDay × paymentPerTransportCents.
// WICHTIG: Vertragsaufträge werden zu regulären Aufträgen (status "angenommen")
// und sind daher in collectAcceptedOrders enthalten, sobald sie generiert wurden.
// Um Doppelzählung zu vermeiden, schätzen wir hier NUR die Aufträge, die
// während des Horizonts NEU generiert werden und noch nicht als order existieren.
function collectContractOrders(state, horizonMin) {
  const positions = [];
  if (!state.contracts) return positions;
  for (const contract of state.contracts.contracts) {
    if (contract.status !== "active") continue;
    const startDay = Math.max(dayOf(state.gameTime), contract.startDay);
    const endDay = Math.min(dayOf(horizonMin), contract.endDay);
    for (let day = startDay; day <= endDay; day++) {
      // Prüfen, ob für diesen Tag bereits Aufträge generiert wurden
      // (lastDayGenerated >= day bedeutet bereits generiert)
      if (contract.lastDayGenerated >= day) continue;
      for (let n = 1; n <= contract.transportsPerDay; n++) {
        // Geschätzter Lieferzeitpunkt: Tagesbeginn + 08:00 + Fahrzeit + Op
        const dayStart = (day - 1) * DAY_MIN;
        const km = getDistance(contract.fromCity, contract.toCity);
        const driveMin = Math.ceil(km / 60 * 60);
        const estDelivery = dayStart + 480 + 60 + driveMin + 60;
        if (estDelivery > horizonMin) continue;
        positions.push(makePosition(
          "company", "in", "expected",
          "contractOrder", contract.id + ":d" + day + ":n" + n,
          estDelivery, contract.paymentPerTransportCents,
          "Vertragserlös: " + contract.customerName,
          "expected",
          { type: "contract", id: contract.id, day, transportNo: n },
        ));
      }
    }
  }
  return positions;
}

// ---------- Hauptfunktion: Prognose berechnen ----------

// Berechnet die Liquiditätsvorschau für den angegebenen Horizont.
// horizonDays: 7 oder 30
// view: "known" | "expected" | "conservative"
// assumptions: { revenueDelayDays, costMultiplier, revenueHaircut } (für conservative)
// decision: optionaler Entscheidungs-Override für Vergleich (siehe unten)
//
// Rückgabe: {
//   calculationMin, horizonDays, view,
//   company: { startBalance, endBalance, minBalance, minBalanceDay, positions },
//   private: { startBalance, endBalance, minBalance, minBalanceDay, positions },
//   days: [{ day, midnightMin, companyIn, companyOut, companyEndBalance, privateIn, privateOut, privateEndBalance, positions }],
//   allPositions: [...],
//   warnings: [...],
// }
export function computeLiquidityForecast(state, options) {
  const opts = options || {};
  const horizonDays = opts.horizonDays || 7;
  const view = opts.view || "known";
  const assumptions = opts.assumptions || {};
  const decision = opts.decision || null;

  const calcMin = state.gameTime;
  const horizonMin = calcMin + horizonDays * DAY_MIN;

  // Positionen sammeln
  let positions = [];
  // Ansicht A: Bekannte Zahlungen
  positions.push(...collectOpenItems(state, horizonMin));
  positions.push(...collectLoanPayments(state, horizonMin));
  positions.push(...collectLeasingPayments(state, horizonMin));
  positions.push(...collectInProgressTrips(state, horizonMin));
  positions.push(...collectPlannedMaintenance(state, horizonMin));
  positions.push(...collectDailyRecurring(state, horizonMin));

  // Ansicht B: Erwarteter Verlauf (ergänzt A)
  if (view === "expected" || view === "conservative") {
    positions.push(...collectAcceptedOrders(state, horizonMin));
    positions.push(...collectContractOrders(state, horizonMin));
  }

  // Ansicht C: Vorsichtige Planung — Annahmen anwenden
  if (view === "conservative") {
    const revenueDelay = assumptions.revenueDelayDays || 0;
    const costMultiplier = assumptions.costMultiplier || 1.0;
    const revenueHaircut = assumptions.revenueHaircut || 0;
    for (const p of positions) {
      if (p.view === "expected" && p.direction === "in") {
        // Erlös später ansetzen
        if (revenueDelay > 0 && p.min !== null) {
          p.min = p.min + revenueDelay * DAY_MIN;
          if (p.min > horizonMin) p.min = horizonMin;
        }
        // Erlös kürzen
        if (revenueHaircut > 0) {
          p.amountCents = Math.round(p.amountCents * (1 - revenueHaircut));
        }
        p.certainty = "assumed";
        p.view = "conservative";
      }
      if (p.view === "expected" && p.direction === "out") {
        // Kosten erhöhen
        if (costMultiplier !== 1.0) {
          p.amountCents = Math.round(p.amountCents * costMultiplier);
        }
        p.certainty = "assumed";
        p.view = "conservative";
      }
    }
  }

  // Entscheidungs-Override anwenden (für Vergleich)
  if (decision) {
    positions = applyDecisionOverride(state, positions, decision, horizonMin);
  }

  // Positionen ohne Termin: als "sofort fällig" am Berechnungszeitpunkt ansetzen
  for (const p of positions) {
    if (p.min === null) p.min = calcMin;
  }

  // Außerhalb des Horizonts liegende Positionen herausfiltern
  positions = positions.filter(p => p.min >= calcMin && p.min <= horizonMin);

  // Entscheidungs-Override: zusätzliche Positionen hinzufügen
  if (decision) {
    positions.push(...getDecisionPositions(state, decision, calcMin, horizonMin));
  }

  // Tagesweise aggregieren
  const startDay = dayOf(calcMin);
  const endDay = dayOf(horizonMin);
  const days = [];
  let companyBalance = state.company?.accountCents || 0;
  let privateBalance = state.private?.accountCents || 0;
  let companyMinBalance = companyBalance;
  let companyMinBalanceDay = startDay;
  let privateMinBalance = privateBalance;
  let privateMinBalanceDay = startDay;

  for (let day = startDay; day <= endDay; day++) {
    const dayStart = day === startDay ? calcMin : midnightOf(day);
    const dayEnd = day === endDay ? horizonMin : midnightOf(day + 1);
    // Positionen dieses Tages (innerhalb der Tagesgrenzen)
    const dayPositions = positions.filter(p => p.min >= dayStart && p.min < dayEnd);
    let companyIn = 0, companyOut = 0, privateIn = 0, privateOut = 0;
    for (const p of dayPositions) {
      if (p.account === "company") {
        if (p.direction === "in") companyIn += p.amountCents;
        else companyOut += p.amountCents;
      } else {
        if (p.direction === "in") privateIn += p.amountCents;
        else privateOut += p.amountCents;
      }
    }
    companyBalance += companyIn - companyOut;
    privateBalance += privateIn - privateOut;
    if (companyBalance < companyMinBalance) {
      companyMinBalance = companyBalance;
      companyMinBalanceDay = day;
    }
    if (privateBalance < privateMinBalance) {
      privateMinBalance = privateBalance;
      privateMinBalanceDay = day;
    }
    days.push({
      day, dayStartMin: dayStart, dayEndMin: dayEnd,
      companyIn, companyOut, companyEndBalance: companyBalance,
      privateIn, privateOut, privateEndBalance: privateBalance,
      positions: dayPositions,
    });
  }

  // Warnungen: Tage mit unterschrittenem Mindestpuffer
  const warnings = [];
  const minBuffer = opts.minBufferCents ?? 0;
  for (const d of days) {
    if (d.companyEndBalance < minBuffer) {
      warnings.push({
        type: "company_below_buffer",
        day: d.day,
        balance: d.companyEndBalance,
        message: `Firmenkonto an Tag ${d.day} unter Mindestpuffer: ${(d.companyEndBalance / 100).toFixed(2)} €`,
      });
    }
    if (d.privateEndBalance < 0) {
      warnings.push({
        type: "private_negative",
        day: d.day,
        balance: d.privateEndBalance,
        message: `Privatkonto an Tag ${d.day} negativ: ${(d.privateEndBalance / 100).toFixed(2)} €`,
      });
    }
  }

  return {
    calculationMin: calcMin,
    horizonDays,
    view,
    assumptions: view === "conservative" ? assumptions : null,
    company: {
      startBalance: state.company?.accountCents || 0,
      endBalance: companyBalance,
      minBalance: companyMinBalance,
      minBalanceDay: companyMinBalanceDay,
    },
    private: {
      startBalance: state.private?.accountCents || 0,
      endBalance: privateBalance,
      minBalance: privateMinBalance,
      minBalanceDay: privateMinBalanceDay,
    },
    days,
    allPositions: positions,
    warnings,
  };
}

// ---------- Entscheidungs-Vergleich ----------

// Entscheidungs-Definition für den Vergleich.
// type: "buyVehicle" | "leaseVehicle" | "hireEmployee" | "openBranch"
// params: typspezifische Parameter
//
// Der Vergleich führt keine Aktion aus — er berechnet nur die
// zusätzlichen Zahlungen, die aus der Entscheidung resultieren würden.

export function getDecisionImpact(state, decision) {
  if (!decision) return null;
  const d = decision;
  if (d.type === "buyVehicle") return getBuyVehicleImpact(state, d);
  if (d.type === "leaseVehicle") return getLeaseVehicleImpact(state, d);
  if (d.type === "hireEmployee") return getHireEmployeeImpact(state, d);
  if (d.type === "openBranch") return getOpenBranchImpact(state, d);
  return null;
}

function getBuyVehicleImpact(state, d) {
  const profile = VEHICLE_CATALOG[d.vehicleType] || VEHICLE_CATALOG.standard;
  const priceCents = profile.priceCents;
  return {
    type: "buyVehicle",
    label: "Lkw kaufen: " + profile.label,
    immediateCashRequired: priceCents,
    additionalDailyCostCents: 0,
    additionalMonthlyCostCents: 0,
    positions: [
      makePosition("company", "out", "known", "decisionBuy", d.id || "buy",
        state.gameTime, priceCents, "Fahrzeugkauf: " + profile.label, "assumed",
        { type: "vehiclePurchase", vehicleType: d.vehicleType }),
    ],
    notes: [
      "Sofortige Auszahlung beim Kauf.",
      "Keine zusätzlichen laufenden Kosten durch den Kauf selbst.",
      "Wartungs- und Betriebskosten entstehen nur bei Einsatz.",
      "Mehr Kapazität erzeugt nicht automatisch zusätzliche Umsätze.",
    ],
    uncertainAssumptions: [
      "Zusätzliche Erlöse nur aus konkret zugeordneten Aufträgen.",
    ],
  };
}

function getLeaseVehicleImpact(state, d) {
  const offer = LEASING_OFFERS[d.offerId] || LEASING_OFFERS.standard_flex;
  const specialPayment = offer.specialPaymentCents;
  const monthlyRate = offer.monthlyRateCents;
  return {
    type: "leaseVehicle",
    label: "Lkw leasen: " + offer.vehicleType + " (" + offer.id + ")",
    immediateCashRequired: specialPayment,
    additionalDailyCostCents: 0,
    additionalMonthlyCostCents: monthlyRate,
    positions: [
      ...(specialPayment > 0 ? [makePosition("company", "out", "known", "decisionLeaseSpecial", d.id || "lease",
        state.gameTime, specialPayment, "Leasing-Sonderzahlung: " + offer.id, "assumed",
        { type: "leasing", offerId: d.offerId })] : []),
      // Erste Rate in 30 Tagen
      makePosition("company", "out", "known", "decisionLeaseRate1", d.id || "lease",
        state.gameTime + 30 * DAY_MIN, monthlyRate, "Leasingrate Monat 1: " + offer.id, "assumed",
        { type: "leasing", offerId: d.offerId, installment: 1 }),
    ],
    notes: [
      "Sonderzahlung sofort bei Vertragsabschluss.",
      `Monatliche Rate: ${(monthlyRate / 100).toFixed(0)} € alle 30 Spieltage.`,
      `Laufzeit: ${offer.termMonths} Monate.`,
      `Kaufpreis am Ende: ${(offer.buyoutPriceCents / 100).toFixed(0)} € (optional).`,
      "Mehr Kapazität erzeugt nicht automatisch zusätzliche Umsätze.",
    ],
    uncertainAssumptions: [
      "Zusätzliche Erlöse nur aus konkret zugeordneten Aufträgen.",
      "Kilometerabhängige Zusatzkosten bei Überschreitung des Inklusiv-Kontingents.",
    ],
  };
}

function getHireEmployeeImpact(state, d) {
  // Geschätzte Einstellungsgebühr und Tageslohn
  const hireFee = HIRE_FEE;
  // Wenn ein Bewerber angegeben ist, dessen Tageslohn verwenden
  let dailyWage = 10000; // Standard-Fahrer
  if (d.applicantId) {
    const app = (state.availableApplicants || []).find(a => a.id === d.applicantId);
    if (app) {
      dailyWage = app.costPerDayCents || dailyWage;
    }
  }
  return {
    type: "hireEmployee",
    label: "Mitarbeiter einstellen" + (d.applicantId ? "" : " (geschätzt)"),
    immediateCashRequired: hireFee,
    additionalDailyCostCents: dailyWage,
    additionalMonthlyCostCents: dailyWage * 30,
    positions: [
      makePosition("company", "out", "known", "decisionHireFee", d.id || "hire",
        state.gameTime, hireFee, "Einstellungsgebühr", "assumed",
        { type: "hire", applicantId: d.applicantId }),
      // Täglicher Lohn ab nächster Mitternacht
      makePosition("company", "out", "known", "decisionHireWage", d.id || "hire",
        midnightOf(dayOf(state.gameTime) + 1), dailyWage, "Täglicher Lohn (neuer MA)", "assumed",
        { type: "hire", applicantId: d.applicantId }),
    ],
    notes: [
      `Einstellungsgebühr: ${(hireFee / 100).toFixed(0)} € sofort.`,
      `Täglicher Lohn: ${(dailyWage / 100).toFixed(0)} € ab erstem Arbeitstag.`,
      "Mehr Personal erzeugt nicht automatisch zusätzliche Umsätze.",
    ],
    uncertainAssumptions: [
      "Zusätzliche Erlöse nur aus konkret zugeordneten Aufträgen.",
      "Einarbeitungszeit kann die Produktivität vorübergehend mindern.",
    ],
  };
}

function getOpenBranchImpact(state, d) {
  const openFee = BRANCH_OPEN_FEE;
  const dailyCost = BRANCH_COST_PER_DAY;
  return {
    type: "openBranch",
    label: "Filiale eröffnen: " + (d.city || "neuer Standort"),
    immediateCashRequired: openFee,
    additionalDailyCostCents: dailyCost,
    additionalMonthlyCostCents: dailyCost * 30,
    positions: [
      makePosition("company", "out", "known", "decisionBranchOpen", d.id || "branch",
        state.gameTime, openFee, "Filialeröffnung: " + (d.city || "?"), "assumed",
        { type: "branch", city: d.city }),
      makePosition("company", "out", "known", "decisionBranchDaily", d.id || "branch",
        midnightOf(dayOf(state.gameTime) + 1), dailyCost, "Standortkosten (neue Filiale)", "assumed",
        { type: "branch", city: d.city }),
    ],
    notes: [
      `Eröffnungsgebühr: ${(openFee / 100).toFixed(0)} € sofort.`,
      `Tägliche Standortkosten: ${(dailyCost / 100).toFixed(0)} €.`,
      "Eine neue Filiale erweitert den Aktionsradius, erzeugt aber keine direkten Umsätze.",
    ],
    uncertainAssumptions: [
      "Zusätzliche Erlöse nur aus neuen Aufträgen im Einzugsgebiet.",
      "Personal für die neue Filiale muss zusätzlich eingestellt werden.",
    ],
  };
}

// Wendet den Entscheidungs-Override auf die Prognose an.
// Entfernt keine bestehenden Positionen, fügt nur neue hinzu.
function applyDecisionOverride(state, positions, decision, horizonMin) {
  // Positionen aus der Entscheidung werden in getDecisionPositions erzeugt
  // und in computeLiquidityForecast hinzugefügt. Hier ist nichts zu tun.
  return positions;
}

// Erzeugt Positionen aus einer Entscheidung für die Prognose.
function getDecisionPositions(state, decision, calcMin, horizonMin) {
  const impact = getDecisionImpact(state, decision);
  if (!impact) return [];
  // Positionen auf den Horizont begrenzen
  return impact.positions.filter(p => p.min >= calcMin && p.min <= horizonMin);
}

// ---------- Hinweise für Büro ----------

// Erzeugt konkrete, gebündelte Hinweise auf prognostizierte Engpässe.
// Verwendet die "expected" Ansicht als Standard für Hinweise.
export function computeForecastHints(state, options) {
  const opts = options || {};
  const horizonDays = opts.horizonDays || 7;
  const minBufferCents = opts.minBufferCents ?? 20000; // 200 € Mindestpuffer

  const forecast = computeLiquidityForecast(state, {
    horizonDays,
    view: "expected",
    minBufferCents,
  });

  const hints = [];
  if (forecast.warnings.length === 0) return hints;

  // Erste Warnung pro Typ (Bündelung)
  const seenTypes = new Set();
  for (const w of forecast.warnings) {
    if (seenTypes.has(w.type)) continue;
    seenTypes.add(w.type);
    if (w.type === "company_below_buffer") {
      hints.push({
        severity: "warning",
        title: "Liquiditätsengpass vorhersehbar",
        message: `Nach den bekannten und erwarteten Zahlungen wird dein Firmenkontopuffer an Tag ${w.day} unterschritten (${(w.balance / 100).toFixed(2)} €).`,
        day: w.day,
        view: "expected",
        action: { label: "Liquiditätsvorschau öffnen", to: "/finanzen" },
      });
    }
    if (w.type === "private_negative") {
      hints.push({
        severity: "warning",
        title: "Privatkonto negativ",
        message: `Dein Privatkonto wird an Tag ${w.day} negativ (${(w.balance / 100).toFixed(2)} €). Lebenshaltungskosten können nicht beglichen werden.`,
        day: w.day,
        view: "expected",
        action: { label: "Liquiditätsvorschau öffnen", to: "/finanzen" },
      });
    }
  }
  return hints;
}

// ---------- Zusammenfassung der Zahlungsregeln ----------
// Exportiert als Dokumentation für UI und Tests.
export const PAYMENT_RULES = {
  transportRevenue: "Sofort bei Lieferung verbucht (Konto 1000), kein Zahlungsziel",
  fuelToll: "Bei Transportstart bezahlt, nicht bei Lieferung",
  dailyCosts: "Löhne, Standortkosten, private Entnahme, Lebenshaltung täglich um Mitternacht",
  loanPayments: "Alle 30 Spieltage (firstPaymentMin + i × 30 × 1440), Tilgung + Zins",
  leasingPayments: "Alle 30 Spieltage (startMin + i × 30 × 1440)",
  openItems: "Optionales dueMin, teilbezahlt möglich, Forderungen = Einzahlung, Verbindlichkeiten = Auszahlung",
  depreciation: "KEINE Kontobewegung, nicht in Liquiditätskurve",
  privateWithdrawal: "Firma → Privat (Auszahlung Firma, Einzahlung Privat)",
  contractOrders: "Werden zu regulären Aufträgen, Erlös bei Lieferung",
  maintenance: "Sofort bei Auftragserteilung bezahlt",
  vehiclePurchase: "Sofort beim Kauf bezahlt",
  hireFee: "Sofort bei Einstellung bezahlt",
  branchOpening: "Sofort bei Eröffnung bezahlt",
};