import type { InvestmentPosition } from "./investmentEngine.ts";
// Performance-Tracking für Investment.
// Auftrag 34 – I15 (Einzahlungen nicht als Rendite zählen).

import { getDepot } from "./investmentEngine.ts";

// Zeitgewichtete Rendite (TWR) und Depot-Historie.
// Einzahlungen/Auszahlungen verfälschen nicht die Rendite.
// Staking/Dividenden sind Ertrag, keine Einzahlung.

const HISTORY_MAX = 500;

export function recordDepotSnapshot(state, min) {
  for (const depotId of ["company", "private"]) {
    const depot = getDepot(state, depotId);
    if (!depot) continue;
    depot.history = depot.history || [];

    let marketValue = 0;
    for (const [instId, pos] of Object.entries<InvestmentPosition>(depot.positions)) {
      if (pos.qty <= 0) continue;
      const inst = state.investment.market.instruments[instId];
      const mid = inst?.currentQuote?.mid || 0;
      marketValue += Math.round(pos.qty * mid);
    }

    const totalValue = depot.settlementCents + marketValue;
    depot.history.push({
      min,
      settlementCents: depot.settlementCents,
      marketValueCents: marketValue,
      totalValueCents: totalValue,
      realizedPnlCents: depot.realizedPnlCents || 0,
      dividendsReceivedCents: depot.dividendsReceivedCents || 0,
      stakingReceivedCents: depot.stakingReceivedCents || 0,
    });

    if (depot.history.length > HISTORY_MAX) {
      depot.history = depot.history.slice(-HISTORY_MAX);
    }
  }
}

// Zeitgewichtete Rendite (TWR) berechnen
// TWR = produkt(1 + R_i) - 1, wobei R_i die Rendite zwischen zwei Cashflows ist.
export function computeTWR(depot) {
  if (!depot.history || depot.history.length < 2) return null;

  const history = depot.history;
  let twr = 1;
  let prevValue = history[0].totalValueCents;

  for (let i = 1; i < history.length; i++) {
    const h = history[i];
    // Cashflow seit letztem Snapshot
    const transfers = (depot.transfers || []).filter(t => t.min > history[i - 1].min && t.min <= h.min);
    const netFlow = transfers.reduce((s, t) => s + (t.direction === "in" ? t.amountCents : -t.amountCents), 0);

    // Rendite vor Cashflow: (Wert_vor_Cashflow - Vorperiode) / Vorperiode
    const valueBeforeFlow = h.totalValueCents - netFlow;
    if (prevValue > 0) {
      const periodReturn = (valueBeforeFlow - prevValue) / prevValue;
      twr *= (1 + periodReturn);
    }
    prevValue = h.totalValueCents;
  }

  return (twr - 1) * 100; // in Prozent
}

// Einfache Rendite seit erster Einzahlung
export function computeSimpleReturn(depot) {
  if (!depot.history || depot.history.length < 1) return null;
  const first = depot.history[0];
  const last = depot.history[depot.history.length - 1];

  const totalDeposited = (depot.transfers || []).filter(t => t.direction === "in").reduce((s, t) => s + t.amountCents, 0);
  const totalWithdrawn = (depot.transfers || []).filter(t => t.direction === "out").reduce((s, t) => s + t.amountCents, 0);
  const netInvested = totalDeposited - totalWithdrawn;

  if (netInvested <= 0) return null;

  const currentValue = last.totalValueCents;
  const totalReturn = currentValue - netInvested;
  const returnPct = (totalReturn / netInvested) * 100;

  return {
    netInvestedCents: netInvested,
    currentValueCents: currentValue,
    totalReturnCents: totalReturn,
    returnPct,
    realizedPnlCents: depot.realizedPnlCents || 0,
    dividendsReceivedCents: depot.dividendsReceivedCents || 0,
    stakingReceivedCents: depot.stakingReceivedCents || 0,
  };
}

// Unitisierte zeitgewichtete Rendite (vereinfacht)
export function computeUnitizedTWR(depot) {
  const twr = computeTWR(depot);
  if (twr === null) return null;

  const simple = computeSimpleReturn(depot);
  if (!simple) return null;

  return {
    twrPct: twr,
    simpleReturnPct: simple.returnPct,
    netInvestedCents: simple.netInvestedCents,
    currentValueCents: simple.currentValueCents,
  };
}

// Performance-Übersicht für UI
export function getPerformanceOverview(state, depotId) {
  const depot = getDepot(state, depotId);
  if (!depot) return null;

  const twr = computeTWR(depot);
  const simple = computeSimpleReturn(depot);
  const unitized = computeUnitizedTWR(depot);

  return {
    depotId,
    twrPct: twr,
    simpleReturn: simple,
    unitized,
    historyLength: (depot.history || []).length,
    transfers: (depot.transfers || []).slice(-20),
  };
}