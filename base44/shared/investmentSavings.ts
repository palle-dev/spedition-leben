// Sparplan-Engine für Investment.
// Auftrag 34 – I14 (Sparpläne und Rebalancing).

import { ALL_INSTRUMENT_DEFS, getDepot, getFreeSettlement, roundQty, computeFee } from "./investmentEngine.ts";
import { postJournal } from "./accountingEngine.ts";

// Sparpläne: Regelmäßige Käufe aus bestätigter Quelle.
// - Täglicher oder wöchentlicher Rhythmus
// - Aus Verrechnungskonto (settlement)
// - Echte Gebühren und tatsächliche Orders
// - Bei unzureichenden Mitteln: Termin überspringen mit Bericht

const SAVINGS_PLANS_MAX = 20;

export function createSavingsPlan(state, p) {
  const depot = getDepot(state, p.depotId);
  if (!depot) throw new Error("Depot nicht gefunden.");
  const inst = state.investment.market.instruments[p.instrumentId];
  if (!inst) throw new Error("Instrument nicht gefunden.");

  const plan = {
    id: uid(state, "sp"),
    depotId: p.depotId,
    instrumentId: p.instrumentId,
    amountCents: p.amountCents,
    rhythm: p.rhythm, // "daily" | "weekly"
    nextExecuteMin: p.nextExecuteMin || state.gameTime + 1440,
    status: "active",
    createdAtMin: state.gameTime,
    lastExecuteMin: null,
    lastResult: null,
    skippedCount: 0,
    executedCount: 0,
  };

  depot.savingsPlans = depot.savingsPlans || [];
  if (depot.savingsPlans.length >= SAVINGS_PLANS_MAX) throw new Error("Maximale Anzahl Sparpläne erreicht.");
  depot.savingsPlans.push(plan);
  return { ok: true, plan };
}

export function cancelSavingsPlan(state, p) {
  const depot = getDepot(state, p.depotId);
  if (!depot) throw new Error("Depot nicht gefunden.");
  const plan = (depot.savingsPlans || []).find(s => s.id === p.planId);
  if (!plan) throw new Error("Sparplan nicht gefunden.");
  plan.status = "cancelled";
  plan.cancelledAtMin = state.gameTime;
  return { ok: true };
}

export function pauseSavingsPlan(state, p) {
  const depot = getDepot(state, p.depotId);
  if (!depot) throw new Error("Depot nicht gefunden.");
  const plan = (depot.savingsPlans || []).find(s => s.id === p.planId);
  if (!plan) throw new Error("Sparplan nicht gefunden.");
  plan.status = "paused";
  return { ok: true };
}

export function resumeSavingsPlan(state, p) {
  const depot = getDepot(state, p.depotId);
  if (!depot) throw new Error("Depot nicht gefunden.");
  const plan = (depot.savingsPlans || []).find(s => s.id === p.planId);
  if (!plan) throw new Error("Sparplan nicht gefunden.");
  plan.status = "active";
  return { ok: true };
}

// Sparpläne bei Tick verarbeiten
export function processSavingsPlans(state, min, log) {
  for (const depotId of ["company", "private"]) {
    const depot = getDepot(state, depotId);
    if (!depot) continue;
    const plans = depot.savingsPlans || [];
    for (const plan of plans) {
      if (plan.status !== "active") continue;
      if (plan.nextExecuteMin > min) continue;

      plan.lastExecuteMin = min;

      // Nächste Ausführung berechnen
      if (plan.rhythm === "daily") {
        plan.nextExecuteMin = min + 1440;
      } else if (plan.rhythm === "weekly") {
        plan.nextExecuteMin = min + 7 * 1440;
      }

      // Markt offen?
      const inst = state.investment.market.instruments[plan.instrumentId];
      const def = ALL_INSTRUMENT_DEFS.find(d => d.id === plan.instrumentId);
      if (!inst || !def) {
        plan.lastResult = { ok: false, reason: "Instrument nicht gefunden" };
        plan.skippedCount++;
        continue;
      }

      const isStock = def.type === "stock";
      const marketOpen = isStock ? isStockTradingHour(min) : true;
      if (!marketOpen) {
        plan.lastResult = { ok: false, reason: "Markt geschlossen" };
        plan.skippedCount++;
        log.push({ type: "investment_savingsplan_skipped", depotId, planId: plan.id, reason: "Markt geschlossen", min });
        continue;
      }

      // Freie Liquidität prüfen
      const free = getFreeSettlement(state, depotId);
      if (free < plan.amountCents) {
        plan.lastResult = { ok: false, reason: "Unzureichende Liquidität" };
        plan.skippedCount++;
        log.push({ type: "investment_savingsplan_skipped", depotId, planId: plan.id, reason: "Unzureichende Liquidität", min });
        continue;
      }

      // Kauf ausführen
      const ask = inst.currentQuote.ask;
      if (ask <= 0) {
        plan.lastResult = { ok: false, reason: "Keine gültige Quote" };
        plan.skippedCount++;
        continue;
      }

      // Menge berechnen (mit Sicherheitsmarge)
      const feeRate = isStock ? 0.001 : 0.0025;
      const safeBudget = Math.floor(plan.amountCents * 0.99);
      const qty = roundQty(safeBudget / (ask * (1 + feeRate)), def.type);
      if (qty <= 0) {
        plan.lastResult = { ok: false, reason: "Menge zu klein" };
        plan.skippedCount++;
        continue;
      }

      const grossCents = Math.round(qty * ask);
      const feeCents = computeFee(def.type, grossCents);
      const totalCost = grossCents + feeCents;

      if (totalCost > depot.settlementCents) {
        plan.lastResult = { ok: false, reason: "Unzureichende Liquidität" };
        plan.skippedCount++;
        continue;
      }

      // Fill anwenden (vereinfacht, ohne Broker-Liquiditätsprüfung für Sparplan)
      depot.settlementCents -= totalCost;
      let pos = depot.positions[plan.instrumentId];
      if (!pos) {
        pos = {
          instrumentId: plan.instrumentId, qty: 0, availableQty: 0, reservedQty: 0,
          lots: [], totalCostCents: 0, totalFeesCents: 0,
          realizedPnlCents: 0, dividendsReceivedCents: 0,
        };
        depot.positions[plan.instrumentId] = pos;
      }
      pos.lots.push({
        qty, costPerUnitCents: ask, feeCents,
        acquiredAtMin: min, totalCostCents: totalCost,
      });
      pos.qty += qty;
      pos.availableQty += qty;
      pos.totalCostCents += totalCost;
      pos.totalFeesCents += feeCents;

      // Fill aufzeichnen
      depot.fills.push({
        id: uid(state, "if"), orderId: "savings_" + plan.id, instrumentId: plan.instrumentId,
        side: "buy", qty, priceCents: ask, feeCents, min,
      });

      // Buchhaltung (nur Firma)
      if (depotId === "company") {
        const acct = def.type === "crypto" ? "1311" : "1310";
        postJournal(state, {
          text: `Sparplan-Kauf ${plan.instrumentId}: ${qty} @ ${(ask / 100).toFixed(2)} €`, type: "investment_savingsplan", gameTime: min,
          lines: [{ account: acct, debit: totalCost }, { account: "1005", credit: totalCost }],
        });
      }

      plan.executedCount++;
      plan.lastResult = { ok: true, qty, priceCents: ask, feeCents, totalCost };
      log.push({ type: "investment_savingsplan_executed", depotId, planId: plan.id, qty, priceCents: ask, feeCents, min });
    }
  }
}

function isStockTradingHour(min) {
  const day = Math.floor(min / 1440);
  const wd = day % 7;
  if (wd >= 5) return false;
  const clock = min % 1440;
  return clock >= 540 && clock < 1020;
}

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}