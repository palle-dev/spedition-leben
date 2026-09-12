// Client-seitige Hilfsfunktionen für die Investment-Welt (Auftrag 33).
// Alle Berechnungen erfolgen aus dem autorisierten Spielzustand.

export function formatPrice(cents) {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function formatPricePlain(cents) {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQty(qty, type) {
  const dp = type === "crypto" ? 8 : 6;
  return qty.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: dp });
}

export function formatPct(pct) {
  const sign = pct >= 0 ? "+" : "";
  return sign + pct.toFixed(2) + " %";
}

export function formatCents(cents) {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// Marktstatus
export function getMarketStatus(state) {
  const m = state.investment?.market;
  if (!m) return { ready: false };
  const min = state.gameTime;
  const wd = (Math.floor(min / 1440)) % 7;
  const clock = min % 1440;
  const stockOpen = wd < 5 && clock >= 540 && clock < 1020;
  const cryptoOpen = true;
  return {
    ready: true,
    stockOpen,
    cryptoOpen,
    regime: m.regime?.current || "neutral",
    tickCount: m.tickCounter || 0,
  };
}

// Instrumentliste für UI
export function getInstrumentList(state) {
  const m = state.investment?.market;
  if (!m) return [];
  const status = getMarketStatus(state);
  return Object.values(m.instruments).map(inst => {
    const prevMid = inst.priceHistory.length > 1 ? inst.priceHistory[inst.priceHistory.length - 2] : inst.priceHistory[0];
    const changePct = prevMid > 0 ? ((inst.currentQuote.mid - prevMid) / prevMid) * 100 : 0;
    const open = inst.type === "stock" ? status.stockOpen : status.cryptoOpen;
    return {
      id: inst.id,
      name: inst.name,
      sector: inst.sector,
      type: inst.type,
      riskClass: inst.riskClass,
      midCents: inst.currentQuote.mid,
      bidCents: inst.currentQuote.bid,
      askCents: inst.currentQuote.ask,
      status: open ? "open" : "closed",
      changePct,
      dividendPerShareCents: inst.dividendPerShareCents || 0,
      stakingRate: inst.stakingRate,
      priceHistory: inst.priceHistory.slice(-72),
    };
  });
}

// Depot-Zusammenfassung
export function getDepotSummary(state, depotId) {
  const depot = state.investment?.depots?.[depotId];
  if (!depot) return null;
  const m = state.investment.market;
  let marketValueCents = 0;
  const positions = [];
  for (const [instId, pos] of Object.entries(depot.positions)) {
    if (pos.qty <= 0) continue;
    const inst = m.instruments[instId];
    const mid = inst?.currentQuote?.mid || 0;
    const value = Math.round(pos.qty * mid);
    marketValueCents += value;
    const costBasis = pos.totalCostCents;
    const unrealized = value - costBasis;
    positions.push({
      instrumentId: instId,
      name: inst?.name || instId,
      type: inst?.type || "stock",
      sector: inst?.sector || "",
      qty: pos.qty,
      availableQty: pos.availableQty,
      costBasisCents: costBasis,
      marketValueCents: value,
      unrealizedPnlCents: unrealized,
      unrealizedPct: costBasis > 0 ? (unrealized / costBasis) * 100 : 0,
      currentMidCents: mid,
      realizedPnlCents: pos.realizedPnlCents || 0,
    });
  }
  positions.sort((a, b) => b.marketValueCents - a.marketValueCents);

  const reservedCents = (depot.orders || [])
    .filter(o => o.status === "open" || o.status === "partially_filled" || o.status === "pending_stop" || o.status === "active_stop")
    .reduce((s, o) => s + (o.side === "buy" ? o.reservedCents : 0), 0);
  const freeSettlement = depot.settlementCents - reservedCents;
  const totalValue = depot.settlementCents + marketValueCents;

  return {
    depotId,
    settlementCents: depot.settlementCents,
    freeSettlementCents: freeSettlement,
    reservedCents,
    marketValueCents,
    totalValueCents: totalValue,
    realizedPnlCents: depot.realizedPnlCents || 0,
    positions,
    openOrderCount: (depot.orders || []).filter(o => o.status === "open" || o.status === "partially_filled" || o.status === "pending_stop" || o.status === "active_stop").length,
    transfers: (depot.transfers || []).slice(-10).reverse(),
  };
}

// Orders + Fills
export function getOrdersList(state, depotId) {
  const depot = state.investment?.depots?.[depotId];
  if (!depot) return { orders: [], fills: [] };
  const m = state.investment.market;
  const orders = (depot.orders || []).slice().reverse().slice(0, 100).map(o => {
    const inst = m.instruments[o.instrumentId];
    return {
      ...o,
      instrumentName: inst?.name || o.instrumentId,
      instrumentType: inst?.type || "stock",
    };
  });
  const fills = (depot.fills || []).slice().reverse().slice(0, 100).map(f => {
    const inst = m.instruments[f.instrumentId];
    return { ...f, instrumentName: inst?.name || f.instrumentId };
  });
  return { orders, fills };
}

// Order-Vorschau (client-seitig)
export function previewOrder(state, p) {
  const m = state.investment?.market;
  if (!m) return { ok: false, error: "Markt nicht initialisiert" };
  const inst = m.instruments[p.instrumentId];
  if (!inst) return { ok: false, error: "Instrument nicht gefunden" };

  const isCrypto = inst.type === "crypto";
  const feeRate = isCrypto ? 0.0025 : 0.001;
  const feeMin = isCrypto ? 25 : 100;

  let qty = p.qty || null;
  let execPrice;
  if (p.side === "buy") {
    execPrice = inst.currentQuote.ask;
    if (p.budgetCents && !qty) {
      const gross = p.budgetCents / (1 + feeRate);
      qty = gross / execPrice;
    }
  } else {
    execPrice = inst.currentQuote.bid;
  }
  if (!qty || qty <= 0) return { ok: false, error: "Menge erforderlich" };

  const grossCents = Math.round(qty * execPrice);
  const feeCents = Math.max(Math.round(grossCents * feeRate), feeMin);
  const netCents = p.side === "buy" ? grossCents + feeCents : grossCents - feeCents;

  return {
    ok: true,
    qty,
    execPriceCents: execPrice,
    grossCents,
    feeCents,
    netCents,
    midCents: inst.currentQuote.mid,
    bidCents: inst.currentQuote.bid,
    askCents: inst.currentQuote.ask,
    spreadCents: inst.currentQuote.ask - inst.currentQuote.bid,
  };
}