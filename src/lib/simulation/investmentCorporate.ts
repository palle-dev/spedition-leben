// Dividenden und Splits für Investment.
// Auftrag 34 – I11 (Dividenden), I12 (Splits).

import { ALL_INSTRUMENT_DEFS, getDepot, uid } from "./investmentEngine.ts";
import { postJournal } from "./accountingEngine.ts";

// ---------- Dividenden ----------
// Dividenden-Verarbeitung: Ex-Dividende, Anspruch, Zahlung.
// Dividende wird bei Ex-Datum gebucht: Kursbereinigung und Anspruch-Entstehung.
// Zahlung erfolgt 2 Spieltage später.

export function processDividends(state, min, log) {
  const m = state.investment?.market;
  if (!m) return;

  for (const def of ALL_INSTRUMENT_DEFS) {
    if (def.type !== "stock") continue;
    if (def.dividendPerShareCents <= 0) continue;

    const inst = m.instruments[def.id];
    if (!inst) continue;

    // Dividenden-Kalender: alle 60 Tage
    const divIntervalDays = 60;
    const divIntervalMin = divIntervalDays * 1440;
    const lastDivMin = inst.lastDividendMin || 0;
    if (lastDivMin === 0) {
      inst.lastDividendMin = min;
      continue;
    }
    if (min - lastDivMin < divIntervalMin) continue;

    // Ex-Dividende-Tag
    inst.lastDividendMin = min;
    // Dividenden-Boost: Verdoppelt die effektive Ausschüttung gegenüber
    // der Definition, damit Dividendenaktien als passive Einkommensquelle
    // spürbar werden (2–4 % p.a. statt 1–2 %).
    const divPerShare = def.dividendPerShareCents * 2;

    // Kursbereinigung: Mid um Dividende senken
    const oldMid = inst.currentQuote.mid;
    const newMid = Math.max(1, oldMid - divPerShare);
    inst.currentQuote = {
      ...inst.currentQuote,
      mid: newMid,
      bid: Math.max(1, Math.round(newMid * 0.999)),
      ask: Math.max(2, Math.round(newMid * 1.001)),
      min,
      status: inst.currentQuote.status,
    };
    inst.priceHistory.push(newMid);

    // Dividenden-Anspruch für berechtigte Positionen (vor Ex)
    for (const depotId of ["company", "private"]) {
      const depot = getDepot(state, depotId);
      if (!depot) continue;
      const pos = depot.positions[def.id];
      if (!pos || pos.qty <= 0) continue;

      const claimCents = Math.round(pos.qty * divPerShare);
      if (claimCents <= 0) continue;

      // Anspruch als Forderung verbuchen
      pos.dividendsReceivedCents = (pos.dividendsReceivedCents || 0) + claimCents;
      depot.dividendsReceivedCents = (depot.dividendsReceivedCents || 0) + claimCents;

      // Dividenden-Forderung mit Zahlungstermin (2 Spieltage später)
      depot.dividendClaims = depot.dividendClaims || [];
      depot.dividendClaims.push({
        id: uid(state, "dc"),
        instrumentId: def.id,
        amountCents: claimCents,
        exMin: min,
        payMin: min + 2 * 1440,
        paid: false,
        qtyAtEx: pos.qty,
      });

      // Buchhaltung (nur Firma): Dividenden-Forderung
      if (depotId === "company") {
        postJournal(state, {
          text: `Dividendenanspruch ${def.id}: ${claimCents / 100} €`, type: "dividend_claim", gameTime: min,
          lines: [
            { account: "1160", debit: claimCents },
            { account: "4301", credit: claimCents },
          ],
        });
      }

      log.push({ type: "investment_dividend_ex", depotId, instrumentId: def.id, claimCents, qty: pos.qty, min });
    }

    log.push({ type: "investment_dividend_adjusted", instrumentId: def.id, oldMid, newMid, min });
  }

  // Dividenden-Zahlungen verarbeiten (2 Spieltage nach Ex)
  for (const depotId of ["company", "private"]) {
    const depot = getDepot(state, depotId);
    if (!depot) continue;
    const claims = depot.dividendClaims || [];
    for (const c of claims) {
      if (!c.paid && c.payMin <= min) {
        c.paid = true;
        c.paidAtMin = min;
        depot.settlementCents += c.amountCents;

        // Buchhaltung (nur Firma): Forderung zu Cash
        if (depotId === "company") {
          postJournal(state, {
            text: `Dividendenzahlung ${c.instrumentId}: ${c.amountCents / 100} €`, type: "dividend_payment", gameTime: min,
            lines: [
              { account: "1005", debit: c.amountCents },
              { account: "1160", credit: c.amountCents },
            ],
          });
        }

        log.push({ type: "investment_dividend_paid", depotId, instrumentId: c.instrumentId, amountCents: c.amountCents, min });
      }
    }
  }
}

// ---------- Splits ----------
// Split-Verarbeitung: Mengen- und Preisanpassung, offene Orders anpassen.
// Split 2:1: Menge verdoppeln, Preis halbieren, Limit/Stop anpassen.

export function processSplits(state, min, log) {
  const m = state.investment?.market;
  if (!m) return;

  // Splits sind seltene Ereignisse: alle ~200 Tage mit geringer Wahrscheinlichkeit
  for (const def of ALL_INSTRUMENT_DEFS) {
    if (def.type !== "stock") continue;
    const inst = m.instruments[def.id];
    if (!inst) continue;

    const lastSplitMin = inst.lastSplitMin || 0;
    if (lastSplitMin > 0 && min - lastSplitMin < 200 * 1440) continue;

    // Nur bei hohem Kurs (> 200 €) mit geringer Wahrscheinlichkeit
    if (inst.currentQuote.mid < 20000) continue;

    // Deterministische Entscheidung basierend auf Markt-RNG
    const r = mulberry32(m.rngSeed ^ (def.id.charCodeAt(0) * 1000 + Math.floor(min / 1440)))();
    m.rngSeed = (Math.floor(mulberry32(m.rngSeed ^ (r * 1000))() * 4294967296)) >>> 0;
    if (r > 0.02) continue; // 2% Chance

    inst.lastSplitMin = min;
    const ratio = 2; // 2:1 Split
    const oldMid = inst.currentQuote.mid;
    const newMid = Math.max(1, Math.round(oldMid / ratio));

    // Quote anpassen
    inst.currentQuote = {
      ...inst.currentQuote,
      mid: newMid,
      bid: Math.max(1, Math.round(newMid * 0.999)),
      ask: Math.max(2, Math.round(newMid * 1.001)),
      min,
      status: inst.currentQuote.status,
    };
    inst.priceHistory.push(newMid);

    // Positionen in beiden Depots anpassen
    for (const depotId of ["company", "private"]) {
      const depot = getDepot(state, depotId);
      if (!depot) continue;
      const pos = depot.positions[def.id];
      if (!pos || pos.qty <= 0) continue;

      const oldQty = pos.qty;
      pos.qty = roundQtySplit(pos.qty * ratio, def.type);
      pos.availableQty = roundQtySplit(pos.availableQty * ratio, def.type);

      // Kostenbasis bleibt gleich, aber Kosten pro Anteil halbiert sich
      // totalCostCents bleibt unverändert

      // Lots anpassen
      for (const lot of pos.lots) {
        lot.qty = roundQtySplit(lot.qty * ratio, def.type);
        lot.costPerUnitCents = Math.round(lot.costPerUnitCents / ratio);
      }

      log.push({ type: "investment_split", depotId, instrumentId: def.id, ratio, oldQty, newQty: pos.qty, min });
    }

    // Offene Orders anpassen
    for (const depotId of ["company", "private"]) {
      const depot = getDepot(state, depotId);
      if (!depot) continue;
      for (const o of depot.orders) {
        if (o.instrumentId !== def.id) continue;
        if (o.status !== "open" && o.status !== "partially_filled" && o.status !== "pending_stop" && o.status !== "active_stop") continue;

        const oldQty = o.qty;
        o.qty = roundQtySplit(o.qty * ratio, def.type);
        o.filledQty = roundQtySplit(o.filledQty * ratio, def.type);

        if (o.limitCents) o.limitCents = Math.round(o.limitCents / ratio);
        if (o.stopCents) o.stopCents = Math.round(o.stopCents / ratio);
        if (o.trailingHighCents) o.trailingHighCents = Math.round(o.trailingHighCents / ratio);

        log.push({ type: "investment_split_order", depotId, orderId: o.id, oldQty, newQty: o.qty, min });
      }
    }

    log.push({ type: "investment_split_market", instrumentId: def.id, ratio, oldMid, newMid, min });
  }
}

function roundQtySplit(qty, type) {
  const precision = type === "crypto" ? 0.00000001 : 0.000001;
  return Math.round(qty / precision) * precision;
}

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}