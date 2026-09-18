// Erweiterte Order-Typen für Investment: Stop, Stop-Limit, Trailing-Stop, OCO.
// Auftrag 34 – I07, I08, I09.

import { ALL_INSTRUMENT_DEFS, roundQty, computeFee, getFreeSettlement, getDepot, validateInvestmentOrder, trimInvestmentOrders } from "./investmentEngine.ts";

// ---------- Stop-Order-Logik ----------
// Prüft, ob eine Stop-Schwelle ausgelöst wird.
// Sell-Stop: ausgelöst, wenn Bid <= stopCents (bei Gap: erste tatsächliche Quote)
// Buy-Stop: ausgelöst, wenn Ask >= stopCents
export function isStopTriggered(order, quote) {
  if (!order.stopCents) return false;
  if (order.side === "sell") {
    return quote.bid <= order.stopCents;
  } else {
    return quote.ask >= order.stopCents;
  }
}

// Trailing-Stop: Hochwasser-Update und Auslösung
export function updateTrailingStop(order, quote) {
  if (order.orderType !== "trailing_stop") return false;
  if (order.side !== "sell") return false;
  if (!order.trailingPercent) return false;

  let triggered = false;
  // Hochwasser aktualisieren (nur ab Aktivierung, nicht vor Aktivierungszeit)
  if (order.activatedAtMin !== null && quote.bid > (order.trailingHighCents || 0)) {
    order.trailingHighCents = quote.bid;
  }
  // Schwelle berechnen
  if (order.trailingHighCents && order.trailingHighCents > 0) {
    const threshold = Math.round(order.trailingHighCents * (1 - order.trailingPercent / 100));
    order.stopCents = threshold;
    if (quote.bid <= threshold) {
      triggered = true;
    }
  }
  return triggered;
}

// OCO: Gegenauftrag stornieren
export function cancelOcoPartner(state, order, min) {
  if (!order.ocoPartnerId) return;
  for (const depotId of ["company", "private"]) {
    const depot = getDepot(state, depotId);
    if (!depot) continue;
    const partner = depot.orders.find(o => o.id === order.ocoPartnerId);
    if (!partner) continue;
    if (partner.status === "open" || partner.status === "partially_filled") {
      partner.status = "cancelled";
      partner.cancelledByOco = order.id;
      partner.cancelledAtMin = min;
      // Reserve freigeben
      if (partner.side === "sell") {
        const pos = depot.positions[partner.instrumentId];
        if (pos) pos.availableQty += (partner.qty - partner.filledQty);
      }
      // Bei OCO buy: reservedCents wird durch Status-Wechsel automatisch freigegeben
    }
  }
}

// Stop-Order platzieren (Erweiterung von placeOrder)
export function placeAdvancedOrder(state, p) {
  const depot = getDepot(state, p.depotId);
  if (!depot) throw new Error("Depot nicht gefunden.");
  const inst = state.investment.market.instruments[p.instrumentId];
  if (!inst) throw new Error("Instrument nicht gefunden.");
  if (!inst.tradeable) throw new Error("Instrument nicht handelbar.");

  const def = ALL_INSTRUMENT_DEFS.find(d => d.id === p.instrumentId);
  const isCrypto = def.type === "crypto";
  validateInvestmentOrder(state, p, ["stop", "stop_limit", "trailing_stop"]);
  const side = p.side;
  const orderType = p.orderType; // "stop" | "stop_limit" | "trailing_stop"

  // Mengenvalidierung
  let qty = p.qty;
  if (!qty || qty <= 0) throw new Error("Menge muss positiv sein.");
  qty = roundQty(qty, def.type);
  if (qty <= 0) throw new Error("Menge zu klein für minimale Stückelung.");

  // Stop-Parameter
  let stopCents = p.stopCents || null;
  let limitCents = p.limitCents || null;
  let trailingPercent = p.trailingPercent || null;

  if (orderType === "stop" || orderType === "stop_limit") {
    if (!stopCents || stopCents <= 0) throw new Error("Stop-Preis erforderlich.");
  }
  if (orderType === "stop_limit") {
    if (!limitCents || limitCents <= 0) throw new Error("Limit-Preis erforderlich.");
  }
  if (orderType === "trailing_stop") {
    if (!trailingPercent || trailingPercent <= 0) throw new Error("Trailing-Prozentsatz erforderlich.");
    if (side !== "sell") throw new Error("Trailing-Stop nur für Verkäufe verfügbar.");
  }

  // Reserve berechnen
  let reservedCents = 0;
  let reservedQty = 0;

  if (side === "sell") {
    const pos = depot.positions[p.instrumentId];
    const available = pos ? pos.availableQty : 0;
    if (available < qty) throw new Error(`Freie Menge reicht nicht aus (verfügbar: ${available}).`);
    reservedQty = qty;
    // Reserve only after OCO and price validation.
  } else {
    // Buy stop: Reserve wie bei Market-Order
    const refPrice = inst.currentQuote.ask;
    const maxPrice = orderType === "stop_limit" ? limitCents : Math.ceil(refPrice * 1.02);
    const maxGross = Math.round(qty * maxPrice);
    const maxFee = computeFee(def.type, maxGross);
    reservedCents = maxGross + maxFee;
    if (!Number.isSafeInteger(reservedCents) || reservedCents <= 0) throw new Error("Ungültiger Reservebetrag.");
    const free = getFreeSettlement(state, p.depotId);
    if (free < reservedCents) throw new Error(`Freie Depotliquidität reicht nicht aus (benötigt: ${(reservedCents / 100).toFixed(2)} €, verfügbar: ${(free / 100).toFixed(2)} €).`);
  }

  // OCO-Partner
  let ocoPartnerId = null;
  if (p.ocoWith) {
    const partner = depot.orders.find(o => o.id === p.ocoWith);
    if (!partner) throw new Error("OCO-Partner nicht gefunden.");
    if (partner.status !== "open" && partner.status !== "partially_filled") throw new Error("OCO-Partner nicht mehr offen.");
    ocoPartnerId = partner.id;
    partner.ocoPartnerId = null; // wird unten gesetzt
  }

  if (side === "sell") depot.positions[p.instrumentId].availableQty -= qty;
  const order = {
    id: uid(state, "io"),
    depotId: p.depotId,
    instrumentId: p.instrumentId,
    side,
    orderType,
    qty,
    filledQty: 0,
    filledGrossCents: 0,
    feeCents: 0,
    limitCents,
    stopCents,
    trailingPercent,
    trailingHighCents: null,
    activatedAtMin: null,
    reservedCents,
    reservedQty,
    status: "pending_stop",
    timeInForce: p.timeInForce || "GTC",
    expireMin: p.expireMin || null,
    closePosition: p.closePosition || false,
    ocoPartnerId,
    createdAtMin: state.gameTime,
    rejectReason: null,
  };

  // OCO-Verknüpfung bidirektional
  if (ocoPartnerId) {
    const partner = depot.orders.find(o => o.id === ocoPartnerId);
    if (partner) partner.ocoPartnerId = order.id;
  }

  depot.orders.push(order);
  trimInvestmentOrders(depot);
  return { ok: true, order };
}

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Verarbeite Stop-Orders bei jedem Tick
export function processStopOrders(state, min, log) {
  for (const depotId of ["company", "private"]) {
    const depot = getDepot(state, depotId);
    if (!depot) continue;
    const stopOrders = depot.orders.filter(o =>
      (o.status === "pending_stop" || o.status === "active_stop") &&
      (o.orderType === "stop" || o.orderType === "stop_limit" || o.orderType === "trailing_stop")
    );
    for (const o of stopOrders) {
      const inst = state.investment.market.instruments[o.instrumentId];
      if (!inst) continue;
      const quote = inst.currentQuote;
      if (quote.status !== "open") continue;

      // Trailing-Stop: Hochwasser und Schwelle aktualisieren
      if (o.orderType === "trailing_stop") {
        if (o.activatedAtMin === null) {
          o.activatedAtMin = min;
          o.trailingHighCents = quote.bid;
        }
        const triggered = updateTrailingStop(o, quote);
        if (triggered) {
          // Auslösen: Market-Verkauf
          o.status = "active_stop";
          log.push({ type: "investment_stop_triggered", orderId: o.id, depotId, stopCents: o.stopCents, min });
        }
      } else {
        // Stop / Stop-Limit: Schwelle prüfen
        if (isStopTriggered(o, quote)) {
          o.status = "active_stop";
          o.activatedAtMin = min;
          log.push({ type: "investment_stop_triggered", orderId: o.id, depotId, stopCents: o.stopCents, min });
        }
      }
    }
  }
}