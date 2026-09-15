// Investment-Engine für FERNWERK – Auftrag 33.
// Fiktiver Markt mit Aktien und Krypto, zwei Depots (Firma/Privat),
// Orderverwaltung, FIFO-Kostenbasis, Buchhaltung, Zeitverarbeitung.
// Trennung: investmentEngine (Regeln/Zustand) · simulationEngine (Integration).

import { mulberry32 } from "./gameRules.ts";
import { postJournal } from "./accountingEngine.ts";
import { processStopOrders, placeAdvancedOrder } from "./investmentAdvancedOrders.ts";
import { processDividends, processSplits } from "./investmentCorporate.ts";
import { processStaking, stakePosition, unstakePosition, getStakingStatus } from "./investmentStaking.ts";
import { processSavingsPlans, createSavingsPlan, cancelSavingsPlan, pauseSavingsPlan, resumeSavingsPlan } from "./investmentSavings.ts";
import { recordDepotSnapshot, getPerformanceOverview } from "./investmentPerformance.ts";

// ---------- Instrumente ----------
type InstrumentDef = {
  id: string; name: string; sector: string; type: "stock" | "crypto";
  initialPriceCents: number; dividendPerShareCents: number; riskClass: "niedrig" | "mittel" | "hoch";
  stakingRate: number | null; tradeable: boolean;
};

const STOCK_DEFS: InstrumentDef[] = [
  { id: "FHL", name: "Hanse Logistik AG", sector: "Transport", type: "stock", initialPriceCents: 10000, dividendPerShareCents: 50, riskClass: "mittel", stakingRate: null, tradeable: true },
  { id: "FWS", name: "Weser Supply AG", sector: "Transport", type: "stock", initialPriceCents: 4800, dividendPerShareCents: 20, riskClass: "niedrig", stakingRate: null, tradeable: true },
  { id: "FNR", name: "Nordrail AG", sector: "Transport", type: "stock", initialPriceCents: 7200, dividendPerShareCents: 25, riskClass: "mittel", stakingRate: null, tradeable: true },
  { id: "FPP", name: "PortPoint AG", sector: "Transport", type: "stock", initialPriceCents: 3500, dividendPerShareCents: 10, riskClass: "hoch", stakingRate: null, tradeable: true },
  { id: "FBC", name: "ByteCraft AG", sector: "Technologie", type: "stock", initialPriceCents: 16000, dividendPerShareCents: 0, riskClass: "hoch", stakingRate: null, tradeable: true },
  { id: "FCL", name: "CloudLine AG", sector: "Technologie", type: "stock", initialPriceCents: 8500, dividendPerShareCents: 10, riskClass: "hoch", stakingRate: null, tradeable: true },
  { id: "FAT", name: "Atlas Systeme AG", sector: "Technologie", type: "stock", initialPriceCents: 12000, dividendPerShareCents: 30, riskClass: "mittel", stakingRate: null, tradeable: true },
  { id: "FDT", name: "DataTree AG", sector: "Technologie", type: "stock", initialPriceCents: 2800, dividendPerShareCents: 0, riskClass: "hoch", stakingRate: null, tradeable: true },
  { id: "FSW", name: "Sonnenwerk AG", sector: "Energie", type: "stock", initialPriceCents: 6200, dividendPerShareCents: 20, riskClass: "mittel", stakingRate: null, tradeable: true },
  { id: "FWW", name: "Windweite AG", sector: "Energie", type: "stock", initialPriceCents: 4400, dividendPerShareCents: 10, riskClass: "hoch", stakingRate: null, tradeable: true },
  { id: "FER", name: "Energrid AG", sector: "Energie", type: "stock", initialPriceCents: 9500, dividendPerShareCents: 45, riskClass: "niedrig", stakingRate: null, tradeable: true },
  { id: "FBS", name: "Batteriespeicher AG", sector: "Energie", type: "stock", initialPriceCents: 3800, dividendPerShareCents: 0, riskClass: "hoch", stakingRate: null, tradeable: true },
  { id: "FMS", name: "Metallstrom AG", sector: "Industrie", type: "stock", initialPriceCents: 11000, dividendPerShareCents: 40, riskClass: "mittel", stakingRate: null, tradeable: true },
  { id: "FWM", name: "Werkmotor AG", sector: "Industrie", type: "stock", initialPriceCents: 7800, dividendPerShareCents: 25, riskClass: "mittel", stakingRate: null, tradeable: true },
  { id: "FPM", name: "Präzisionsbau AG", sector: "Industrie", type: "stock", initialPriceCents: 13500, dividendPerShareCents: 60, riskClass: "niedrig", stakingRate: null, tradeable: true },
  { id: "FRT", name: "Robotertechnik AG", sector: "Industrie", type: "stock", initialPriceCents: 5800, dividendPerShareCents: 10, riskClass: "hoch", stakingRate: null, tradeable: true },
  { id: "FKH", name: "Küstenhandel AG", sector: "Konsum", type: "stock", initialPriceCents: 5600, dividendPerShareCents: 25, riskClass: "niedrig", stakingRate: null, tradeable: true },
  { id: "FAL", name: "Alltagsmarkt AG", sector: "Konsum", type: "stock", initialPriceCents: 9000, dividendPerShareCents: 45, riskClass: "niedrig", stakingRate: null, tradeable: true },
  { id: "FGR", name: "Grünraum AG", sector: "Konsum", type: "stock", initialPriceCents: 3200, dividendPerShareCents: 10, riskClass: "mittel", stakingRate: null, tradeable: true },
  { id: "FRE", name: "Reisehafen AG", sector: "Konsum", type: "stock", initialPriceCents: 2400, dividendPerShareCents: 0, riskClass: "hoch", stakingRate: null, tradeable: true },
  { id: "FMW", name: "Mediwert AG", sector: "Gesundheit", type: "stock", initialPriceCents: 14500, dividendPerShareCents: 50, riskClass: "niedrig", stakingRate: null, tradeable: true },
  { id: "FLB", name: "Laborblick AG", sector: "Gesundheit", type: "stock", initialPriceCents: 6800, dividendPerShareCents: 15, riskClass: "mittel", stakingRate: null, tradeable: true },
  { id: "FPH", name: "Pflegenetz AG", sector: "Gesundheit", type: "stock", initialPriceCents: 5200, dividendPerShareCents: 25, riskClass: "niedrig", stakingRate: null, tradeable: true },
  { id: "FBF", name: "Biofeld AG", sector: "Gesundheit", type: "stock", initialPriceCents: 1800, dividendPerShareCents: 0, riskClass: "hoch", stakingRate: null, tradeable: true },
];

const CRYPTO_DEFS: InstrumentDef[] = [
  { id: "FAUR", name: "Aurora Coin", sector: "Krypto", type: "crypto", initialPriceCents: 2400000, dividendPerShareCents: 0, riskClass: "mittel", stakingRate: null, tradeable: true },
  { id: "FNOV", name: "Nova Network", sector: "Krypto", type: "crypto", initialPriceCents: 145000, dividendPerShareCents: 0, riskClass: "mittel", stakingRate: 0.08, tradeable: true },
  { id: "FHBR", name: "Harbor Chain", sector: "Krypto", type: "crypto", initialPriceCents: 2000, dividendPerShareCents: 0, riskClass: "mittel", stakingRate: 0.12, tradeable: true },
  { id: "FQNT", name: "Quanta Token", sector: "Krypto", type: "crypto", initialPriceCents: 480, dividendPerShareCents: 0, riskClass: "hoch", stakingRate: 0.15, tradeable: true },
  { id: "FPLS", name: "Pulse Coin", sector: "Krypto", type: "crypto", initialPriceCents: 25, dividendPerShareCents: 0, riskClass: "hoch", stakingRate: 0.20, tradeable: true },
  { id: "FORB", name: "Orbit Network", sector: "Krypto", type: "crypto", initialPriceCents: 9500, dividendPerShareCents: 0, riskClass: "hoch", stakingRate: 0.10, tradeable: true },
  { id: "FLUM", name: "Lumen Ledger", sector: "Krypto", type: "crypto", initialPriceCents: 8, dividendPerShareCents: 0, riskClass: "hoch", stakingRate: 0.18, tradeable: true },
  { id: "FCDR", name: "Cedar Protocol", sector: "Krypto", type: "crypto", initialPriceCents: 1200, dividendPerShareCents: 0, riskClass: "mittel", stakingRate: 0.07, tradeable: true },
];

export const ALL_INSTRUMENT_DEFS = [...STOCK_DEFS, ...CRYPTO_DEFS];

// ---------- Konstanten ----------
const SIGMA_BY_RISK = { niedrig: 0.008, mittel: 0.020, hoch: 0.040 };
const SIGMA_CRYPTO = { mittel: 0.035, hoch: 0.070 };
const MU_BY_REGIME = { neutral: 0, positive: 0.001, negative: -0.001 };
const REGIME_INTERVAL_DAYS = 14;
const REGIME_PROBS = { neutral: 0.30, positive: 0.40, negative: 0.30 };

const STOCK_SPREAD = { bid: 0.999, ask: 1.001 };
const CRYPTO_SPREAD = { bid: 0.997, ask: 1.003 };
const STOCK_FEE_RATE = 0.001;  // 0,10 %
const STOCK_FEE_MIN_CENTS = 100;  // 1 €
const CRYPTO_FEE_RATE = 0.0025;  // 0,25 %
const CRYPTO_FEE_MIN_CENTS = 25;  // 0,25 €
const MIN_ORDER_VALUE_CENTS = 1000;  // 10 €
const STOCK_QTY_PRECISION = 0.000001;
const CRYPTO_QTY_PRECISION = 0.00000001;
const PRICE_MIN_CENTS = 0.000001;  // 0,000001 € als positive Untergrenze

const STOCK_MAX_SHARES_PER_TICK = 10000;
const CRYPTO_MAX_VALUE_CENTS_PER_TICK = 25000000;  // 250.000 €

const MARKET_PRICE_DEVIATION = { stock: 0.02, crypto: 0.05 };  // 2 % / 5 %

const HISTORY_MAX_TICKS = 168;  // 7 Tage stündlich
const ORDERS_MAX = 200;
const FILLS_MAX = 500;

// ---------- Hilfsfunktionen ----------
export function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function nextMarketRng(state) {
  const m = state.investment.market;
  const r = mulberry32(m.rngSeed >>> 0);
  const v = r();
  m.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}

function drawZ(state) {
  return nextMarketRng(state) * 2 - 1;  // [-1, 1]
}

function dayOf(min) { return Math.floor(min / 1440) + 1; }
function clockOf(min) { return (min % 1440) / 60; }
function weekdayOf(min) { return (dayOf(min) - 1) % 7; }  // 0=Mo ... 6=So

export function isStockTradingHour(min) {
  const wd = weekdayOf(min);
  if (wd >= 5) return false;  // Sa/So geschlossen
  const clock = min % 1440;
  return clock >= 540 && clock < 1020;  // 09:00–17:00 exklusiv
}

export function isCryptoTradingHour(min) {
  return true;  // rund um die Uhr
}

function isStockTickMin(min) {
  const wd = weekdayOf(min);
  if (wd >= 5) return false;
  const clock = min % 1440;
  return clock >= 540 && clock <= 960 && clock % 60 === 0;  // 09:00–16:00 volle Stunde
}

function isCryptoTickMin(min) {
  return min % 60 === 0;  // jede volle Stunde
}

function roundCents(v) { return Math.round(v); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export function roundQty(qty, type) {
  const precision = type === "crypto" ? CRYPTO_QTY_PRECISION : STOCK_QTY_PRECISION;
  return Math.floor(qty / precision) * precision;
}

export function computeFee(type, grossCents) {
  if (grossCents <= 0) return 0;
  const rate = type === "crypto" ? CRYPTO_FEE_RATE : STOCK_FEE_RATE;
  const minCents = type === "crypto" ? CRYPTO_FEE_MIN_CENTS : STOCK_FEE_MIN_CENTS;
  return Math.max(Math.round(grossCents * rate), minCents);
}

function makeQuote(mid, type, status, tickId, min) {
  const spread = type === "crypto" ? CRYPTO_SPREAD : STOCK_SPREAD;
  const bid = Math.max(1, Math.round(mid * spread.bid));
  const ask = Math.max(bid + 1, Math.round(mid * spread.ask));
  return { tickId, mid: Math.max(bid, Math.min(ask, mid)), bid, ask, status, min };
}

// ---------- Migration ----------
export function migrateInvestment(state) {
  if (!state.investment) {
    initInvestment(state);
    return;
  }
  if (!state.investment.market || !state.investment.market.instruments) {
    initInvestmentMarket(state);
  }
  if (!state.investment.depots) {
    state.investment.depots = {
      company: makeDepot(),
      private: makeDepot(),
    };
  }
  // Instrumente auf Vollständigkeit prüfen (keine Preisrücksetzung)
  const m = state.investment.market;
  for (const def of ALL_INSTRUMENT_DEFS) {
    if (!m.instruments[def.id]) {
      m.instruments[def.id] = makeInstrument(def, state);
    }
  }
}

function makeDepot() {
  return {
    settlementCents: 0,
    positions: {},
    orders: [],
    fills: [],
    transfers: [],
    realizedPnlCents: 0,
    dividendsReceivedCents: 0,
    stakingReceivedCents: 0,
    precisionRestCents: 0,
  };
}

function makeInstrument(def, state) {
  const mid = def.initialPriceCents;
  return {
    ...def,
    currentQuote: makeQuote(mid, def.type, "closed", 0, state ? state.gameTime : 480),
    priceHistory: [mid],
    firstTickMin: state ? state.gameTime : 480,
    brokerLiquidityShares: STOCK_MAX_SHARES_PER_TICK,
    brokerLiquidityCents: CRYPTO_MAX_VALUE_CENTS_PER_TICK,
  };
}

function initInvestmentMarket(state) {
  const seed = ((state.rngSeed || 1234567) ^ 0x5A5A5A) >>> 0;
  const instruments = {};
  for (const def of ALL_INSTRUMENT_DEFS) {
    instruments[def.id] = makeInstrument(def, state);
  }
  state.investment = state.investment || {};
  state.investment.market = {
    rngSeed: seed,
    regime: { current: "neutral", phaseStartDay: 1, nextChangeDay: 1 + REGIME_INTERVAL_DAYS },
    instruments,
    lastTickMin: state.gameTime,
    tickCounter: 0,
  };
  state.investment.depots = {
    company: makeDepot(),
    private: makeDepot(),
  };
}

export function initInvestment(state) {
  initInvestmentMarket(state);
}

// ---------- Regime ----------
function updateRegime(state, min) {
  const m = state.investment.market;
  const day = dayOf(min);
  if (day >= m.regime.nextChangeDay) {
    const r = nextMarketRng(state);
    let regime = "neutral";
    if (r < REGIME_PROBS.positive) regime = "positive";
    else if (r > 1 - REGIME_PROBS.negative) regime = "negative";
    m.regime = { current: regime, phaseStartDay: day, nextChangeDay: day + REGIME_INTERVAL_DAYS };
  }
}

// ---------- Kursbildung ----------
function computeLogReturn(state, inst, min) {
  const def = ALL_INSTRUMENT_DEFS.find(d => d.id === inst.id);
  const m = state.investment.market;
  const regime = m.regime.current;
  const mu = MU_BY_REGIME[regime] || 0;

  let sigma;
  if (def.type === "crypto") {
    sigma = CRYPTO_SIGMA(def.riskClass);
  } else {
    sigma = SIGMA_BY_RISK[def.riskClass] || 0.007;
  }

  const zMarkt = drawZ(state);
  const zSector = drawZ(state);
  const zInstrument = drawZ(state);

  // Normalisierung: Die gewichtete Summe aus 3 unabhängigen Ziehungen hat
  // nur ~59 % der Varianz einer einzelnen Ziehung. Der Faktor 1.702 hebt
  // die Varianz an, sodass das eingestellte Sigma der tatsächlichen
  // pro-Tick-Volatilität entspricht.
  const weighted = 1.702 * (0.40 * zMarkt + 0.25 * zSector + 0.35 * zInstrument);
  const limit = def.type === "crypto" ? 0.40 : 0.20;
  let logReturn = mu + sigma * weighted;
  logReturn = clamp(logReturn, -limit, limit);

  return logReturn;
}

function CRYPTO_SIGMA(risk) {
  return CRYPTO_DEFS.find(d => d.riskClass === risk) ? SIGMA_CRYPTO[risk] : 0.012;
}

export function processMarketTick(state, min, log) {
  const m = state.investment.market;
  if (min <= m.lastTickMin) return;
  m.tickCounter = (m.tickCounter || 0) + 1;

  updateRegime(state, min);

  const stockOpen = isStockTickMin(min);
  const cryptoOpen = isCryptoTickMin(min);

  for (const def of ALL_INSTRUMENT_DEFS) {
    const inst = m.instruments[def.id];
    if (!inst) continue;
    const isStock = def.type === "stock";
    const shouldTick = isStock ? stockOpen : cryptoOpen;
    if (!shouldTick) {
      inst.currentQuote = { ...inst.currentQuote, min, status: "closed" };
      continue;
    }
    const logReturn = computeLogReturn(state, inst, min);
    const newMid = Math.max(
      Math.round(inst.currentQuote.mid * Math.exp(logReturn)),
      1
    );
    const status = "open";
    inst.currentQuote = makeQuote(newMid, def.type, status, m.tickCounter, min);
    inst.priceHistory.push(newMid);
    if (inst.priceHistory.length > HISTORY_MAX_TICKS) {
      inst.priceHistory = inst.priceHistory.slice(-HISTORY_MAX_TICKS);
    }
    // Broker-Liquidität pro Tick zurücksetzen
    inst.brokerLiquidityShares = STOCK_MAX_SHARES_PER_TICK;
    inst.brokerLiquidityCents = CRYPTO_MAX_VALUE_CENTS_PER_TICK;
  }
  m.lastTickMin = min;

  // Stop-Orders verarbeiten (vor regulären Orders, da Stop-Auslösung neue Market-Orders erzeugt)
  processStopOrders(state, min, log);
  // Orders verarbeiten
  processExpiringOrders(state, min, log);
  processOpenOrders(state, min, log);
  // Dividenden und Splits verarbeiten
  processDividends(state, min, log);
  processSplits(state, min, log);
  // Staking-Vergütung verarbeiten
  processStaking(state, min, log);
  // Sparpläne verarbeiten
  processSavingsPlans(state, min, log);
  // Performance-Snapshot aufzeichnen
  recordDepotSnapshot(state, min);

  log.push({ type: "investment_tick", min, stockOpen, cryptoOpen });
}

export function getInvestmentEventTimes(state, t, maxMin) {
  const times: number[] = [];
  // Nächste volle Stunde für Krypto (immer)
  const nextHour = Math.floor(t / 60) * 60 + 60;
  if (nextHour <= maxMin) times.push(nextHour);
  // Aktien-Ticks nur während Handelszeiten
  if (isStockTradingHour(nextHour) && nextHour <= maxMin) {
    // schon durch nextHour abgedeckt
  }
  // Order-Ablaufzeiten
  for (const depotId of ["company", "private"]) {
    const depot = state.investment?.depots?.[depotId];
    if (!depot) continue;
    for (const o of depot.orders) {
      if (o.status === "open" || o.status === "partially_filled") {
        if (o.expireMin && o.expireMin > t && o.expireMin <= maxMin) times.push(o.expireMin);
      }
    }
    // Sparplan-Ausführungszeiten
    for (const plan of (depot.savingsPlans || [])) {
      if (plan.status === "active" && plan.nextExecuteMin > t && plan.nextExecuteMin <= maxMin) {
        times.push(plan.nextExecuteMin);
      }
    }
    // Dividenden-Zahlungszeiten
    for (const c of (depot.dividendClaims || [])) {
      if (!c.paid && c.payMin > t && c.payMin <= maxMin) times.push(c.payMin);
    }
    // Unstaking-Freigabezeiten
    for (const [instId, pos] of Object.entries(depot.positions)) {
      for (const s of (pos.staking || [])) {
        if (s.status === "unstaking" && s.releaseMin > t && s.releaseMin <= maxMin) {
          times.push(s.releaseMin);
        }
      }
    }
  }
  return times;
}

// ---------- Depot-Verwaltung ----------
export function getDepot(state, depotId) {
  return state.investment?.depots?.[depotId] || null;
}

export function depositToDepot(state, { depotId, amountCents }) {
  const depot = getDepot(state, depotId);
  if (!depot) throw new Error("Depot nicht gefunden.");
  if (amountCents <= 0) throw new Error("Betrag muss positiv sein.");
  const bank = depotId === "company" ? state.company.accountCents : state.private.accountCents;
  if (bank < amountCents) throw new Error(`${depotId === "company" ? "Firmenbank" : "Privatbank"} reicht für diese Umbuchung nicht aus.`);
  if (depotId === "company") {
    // postJournal synchronisiert Konto 1000 mit company.accountCents
    postJournal(state, {
      text: "Einzahlung Verrechnungskonto", type: "investment_transfer", gameTime: state.gameTime,
      lines: [{ account: "1005", debit: amountCents }, { account: "1000", credit: amountCents }],
    });
  } else {
    state.private.accountCents -= amountCents;
  }
  depot.settlementCents += amountCents;
  depot.transfers.push({ id: uid(state, "it"), direction: "in", amountCents, min: state.gameTime });
  if (depot.transfers.length > 100) depot.transfers = depot.transfers.slice(-100);
  return { ok: true, settlementCents: depot.settlementCents };
}

export function withdrawFromDepot(state, { depotId, amountCents }) {
  const depot = getDepot(state, depotId);
  if (!depot) throw new Error("Depot nicht gefunden.");
  if (amountCents <= 0) throw new Error("Betrag muss positiv sein.");
  const free = getFreeSettlement(state, depotId);
  if (free < amountCents) throw new Error(`Freie Depotliquidität reicht nicht aus (verfügbar: ${(free / 100).toFixed(2)} €).`);
  depot.settlementCents -= amountCents;
  if (depotId === "company") {
    // postJournal synchronisiert Konto 1000 mit company.accountCents
    postJournal(state, {
      text: "Rücküberweisung Verrechnungskonto", type: "investment_transfer", gameTime: state.gameTime,
      lines: [{ account: "1000", debit: amountCents }, { account: "1005", credit: amountCents }],
    });
  } else {
    state.private.accountCents += amountCents;
  }
  depot.transfers.push({ id: uid(state, "it"), direction: "out", amountCents, min: state.gameTime });
  if (depot.transfers.length > 100) depot.transfers = depot.transfers.slice(-100);
  return { ok: true, settlementCents: depot.settlementCents };
}

export function getFreeSettlement(state, depotId) {
  const depot = getDepot(state, depotId);
  if (!depot) return 0;
  const reserved = (depot.orders || [])
    .filter(o => o.status === "open" || o.status === "partially_filled" || o.status === "pending_stop" || o.status === "active_stop")
    .reduce((s, o) => s + (o.side === "buy" ? o.reservedCents : 0), 0);
  return depot.settlementCents - reserved;
}

// ---------- Orders ----------
export function placeOrder(state, p) {
  const depot = getDepot(state, p.depotId);
  if (!depot) throw new Error("Depot nicht gefunden.");
  const inst = state.investment.market.instruments[p.instrumentId];
  if (!inst) throw new Error("Instrument nicht gefunden.");
  if (!inst.tradeable) throw new Error("Instrument nicht handelbar.");

  const def = ALL_INSTRUMENT_DEFS.find(d => d.id === p.instrumentId);
  const isCrypto = def.type === "crypto";
  const side = p.side;  // "buy" | "sell"
  const orderType = p.orderType;  // "market" | "limit"

  // Pflichtkostensperre (I16): Neue Käufe blockiert bei offenen betrieblichen Kosten
  if (side === "buy" && p.depotId === "company" && !p.closePosition) {
    const hasOpenCompanyCosts = (state.openCosts || []).some(o => o.account === "company" && o.amountCents > 0);
    const hasOpenItems = (state.accounting?.openItems || []).some(o => o.remainingCents > 0);
    if (hasOpenCompanyCosts || hasOpenItems) {
      throw new Error("Es gibt offene betriebliche Kosten. Bitte bezahle diese zuerst, bevor du neue Investment-Käufe tätigst.");
    }
  }

  // Mengen-/Budgetvalidierung
  let qty = p.qty || null;
  let budgetCents = p.budgetCents || null;

  if (side === "buy" && budgetCents && !qty) {
    // Budget-Kauf: Menge so berechnen, dass Budget inkl. Preisabweichung und Gebühr reicht
    // 1% Sicherheitsmargen für Rundungsdifferenzen bei maxPrice (ceil) und Gebühr
    const ask = inst.currentQuote.ask;
    const feeRate = isCrypto ? CRYPTO_FEE_RATE : STOCK_FEE_RATE;
    const deviation = MARKET_PRICE_DEVIATION[def.type];
    const effectiveCostPerShare = ask * (1 + deviation) * (1 + feeRate);
    const safeBudgetCents = Math.floor(budgetCents * 0.99);
    qty = safeBudgetCents / effectiveCostPerShare;
  }
  if (!qty || qty <= 0) throw new Error("Menge muss positiv sein.");
  qty = roundQty(qty, def.type);
  if (qty <= 0) throw new Error("Menge zu klein für minimale Stückelung.");

  // Mindestorderwert prüfen
  const refPrice = side === "buy" ? inst.currentQuote.ask : inst.currentQuote.bid;
  const grossValue = Math.round(qty * refPrice);
  if (grossValue < MIN_ORDER_VALUE_CENTS && orderType === "market" && !p.closePosition) {
    throw new Error(`Mindestorderwert ${(MIN_ORDER_VALUE_CENTS / 100).toFixed(2)} € nicht erreicht.`);
  }

  // Limit-Preis
  let limitCents = p.limitCents || null;
  if (orderType === "limit") {
    if (!limitCents || limitCents <= 0) throw new Error("Limit-Preis erforderlich.");
  }

  // Reserve berechnen
  let reservedCents = 0;
  let reservedQty = 0;
  if (side === "buy") {
    const maxPrice = orderType === "limit" ? limitCents : Math.ceil(refPrice * (1 + MARKET_PRICE_DEVIATION[def.type]));
    const maxGross = Math.round(qty * maxPrice);
    const maxFee = computeFee(def.type, maxGross);
    reservedCents = maxGross + maxFee;
    const free = getFreeSettlement(state, p.depotId);
    if (free < reservedCents) throw new Error(`Freie Depotliquidität reicht nicht aus (benötigt: ${(reservedCents / 100).toFixed(2)} €, verfügbar: ${(free / 100).toFixed(2)} €).`);
  } else {
    // Verkauf: Menge aus freier Position prüfen
    const pos = depot.positions[p.instrumentId];
    const available = pos ? pos.availableQty : 0;
    if (available < qty) throw new Error(`Freie Menge reicht nicht aus (verfügbar: ${available} ${isCrypto ? "Einheiten" : "Anteile"}).`);
    reservedQty = qty;
    if (pos) pos.availableQty -= qty;
  }

  // Ablaufzeit
  let expireMin = null;
  if (p.timeInForce === "DAY") {
    expireMin = nextSessionEnd(state, def.type);
  } else if (p.timeInForce === "GTD" && p.expireMin) {
    expireMin = p.expireMin;
  }
  // GTC: kein Ablauf

  // OCO-Partner verknüpfen
  let ocoPartnerId = null;
  if (p.ocoWith) {
    const partner = depot.orders.find(o => o.id === p.ocoWith);
    if (!partner) throw new Error("OCO-Partner nicht gefunden.");
    if (partner.status !== "open" && partner.status !== "partially_filled" && partner.status !== "pending_stop") throw new Error("OCO-Partner nicht mehr offen.");
    ocoPartnerId = partner.id;
  }

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
    stopCents: null,
    trailingPercent: null,
    trailingHighCents: null,
    activatedAtMin: null,
    reservedCents,
    reservedQty,
    status: "open",
    timeInForce: p.timeInForce || "GTC",
    expireMin,
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
  if (depot.orders.length > ORDERS_MAX) depot.orders = depot.orders.slice(-ORDERS_MAX);

  // Sofortausführung versuchen, wenn Markt offen
  const fillResult = tryExecuteOrder(state, order, state.gameTime);
  return { ok: true, order, ...fillResult };
}

function nextSessionEnd(state, type) {
  if (type === "crypto") {
    const midnight = Math.floor(state.gameTime / 1440) * 1440 + 1440;
    return midnight;
  }
  // Aktien: nächste Sitzungsende (17:00) an einem Handelstag (Mo-Fr)
  const day = Math.floor(state.gameTime / 1440);
  const clock = state.gameTime % 1440;
  // Wenn heute Handelstag und Sitzung noch läuft: heute 17:00
  if (day % 7 < 5 && clock < 1020) {
    return day * 1440 + 1020;
  }
  // Sonst: nächste 17:00 an einem Handelstag (überspringt Wochenende)
  let testDay = day;
  if (clock >= 1020 || day % 7 >= 5) testDay++;
  while (testDay % 7 >= 5) testDay++;
  return testDay * 1440 + 1020;
}

export function cancelOrder(state, { orderId }) {
  for (const depotId of ["company", "private"]) {
    const depot = getDepot(state, depotId);
    if (!depot) continue;
    const o = depot.orders.find(x => x.id === orderId);
    if (!o) continue;
    if (o.status !== "open" && o.status !== "partially_filled" && o.status !== "pending_stop" && o.status !== "active_stop") throw new Error("Order kann nicht storniert werden.");
    o.status = "cancelled";
    // OCO-Partner ebenfalls stornieren
    if (o.ocoPartnerId) {
      cancelOcoPartnerLocal(state, o, state.gameTime);
    }
    // Reserve freigeben
    if (o.side === "buy") {
      // reservedCents wird durch Status-Wechsel automatisch freigegeben
      // (getFreeSettlement zählt nur open/partially_filled/pending_stop/active_stop)
    } else {
      const pos = depot.positions[o.instrumentId];
      if (pos) pos.availableQty += (o.qty - o.filledQty);
    }
    return { ok: true };
  }
  throw new Error("Order nicht gefunden.");
}

// ---------- Order-Ausführung ----------
function tryExecuteOrder(state, order, min) {
  const inst = state.investment.market.instruments[order.instrumentId];
  const def = ALL_INSTRUMENT_DEFS.find(d => d.id === order.instrumentId);
  if (!inst || !def) return { filled: false };

  const isStock = def.type === "stock";
  const marketOpen = isStock ? isStockTradingHour(min) : isCryptoTradingHour(min);
  if (!marketOpen) return { filled: false, reason: "Markt geschlossen" };

  const quote = inst.currentQuote;
  if (quote.status !== "open") return { filled: false, reason: "Keine offene Quote" };

  const remainingQty = order.qty - order.filledQty;
  if (remainingQty <= 0) return { filled: false };

  // Preisprüfung
  let execPrice;
  // Aktive Stop-Orders verhalten sich wie Market oder Limit
  const effectiveOrderType = order.status === "active_stop"
    ? (order.orderType === "stop_limit" ? "limit" : "market")
    : order.orderType;

  if (effectiveOrderType === "market") {
    execPrice = order.side === "buy" ? quote.ask : quote.bid;
    // Preisabweichungsgrenze prüfen (nur für normale Market-Orders, nicht für Stop-Auslösung)
    if (order.orderType === "market") {
      const deviation = MARKET_PRICE_DEVIATION[def.type];
      if (order.side === "buy") {
        const maxPrice = Math.ceil(quote.ask * (1 + deviation));
        if (execPrice > maxPrice) {
          order.status = "cancelled";
          order.rejectReason = "Preisabweichung überschritten";
          return { filled: false, reason: "Preisabweichung überschritten" };
        }
      }
    }
  } else if (effectiveOrderType === "limit") {
    if (order.side === "buy") {
      if (quote.ask > order.limitCents) return { filled: false, reason: "Limit nicht erreicht" };
      execPrice = Math.min(quote.ask, order.limitCents);  // zum besseren Preis
    } else {
      if (quote.bid < order.limitCents) return { filled: false, reason: "Limit nicht erreicht" };
      execPrice = Math.max(quote.bid, order.limitCents);
    }
  }

  // Broker-Liquidität prüfen
  let maxQtyByLiquidity;
  if (isStock) {
    maxQtyByLiquidity = Math.min(remainingQty, inst.brokerLiquidityShares);
  } else {
    const maxByValue = inst.brokerLiquidityCents / execPrice;
    maxQtyByLiquidity = Math.min(remainingQty, maxByValue);
  }
  const fillQty = roundQty(Math.min(remainingQty, maxQtyByLiquidity), def.type);
  if (fillQty <= 0) return { filled: false, reason: "Keine Broker-Liquidität" };

  // Ausführung
  const grossCents = Math.round(fillQty * execPrice);
  let feeCents = computeFee(def.type, grossCents);
  // Bei vollständigem Restverkauf: Gebühr auf Bruttoerlös begrenzen
  if (order.closePosition && feeCents > grossCents) feeCents = grossCents;

  // Bei Teilausführung: kumulierte Gebühr neu berechnen, nur Differenz buchen
  const prevFilledGross = order.filledGrossCents;
  const newTotalGross = prevFilledGross + grossCents;
  const newTotalFee = computeFee(def.type, newTotalGross);
  const incrementalFee = Math.max(0, newTotalFee - order.feeCents);

  // Liquidität verbrauchen
  if (isStock) {
    inst.brokerLiquidityShares -= fillQty;
  } else {
    inst.brokerLiquidityCents -= grossCents;
  }

  // Fill anwenden
  applyFill(state, order.depotId, order.instrumentId, order.side, fillQty, execPrice, incrementalFee, min);

  order.filledQty += fillQty;
  order.filledGrossCents += grossCents;
  order.feeCents = newTotalFee;

  // Reserve anpassen
  if (order.side === "buy") {
    const costForThisFill = grossCents + incrementalFee;
    order.reservedCents -= costForThisFill;
  }

  // Status aktualisieren
  if (order.filledQty >= order.qty) {
    order.status = "filled";
    // Bei OCO: Partner stornieren bei vollständiger Ausführung
    if (order.ocoPartnerId) {
      cancelOcoPartnerLocal(state, order, min);
    }
  } else {
    order.status = "partially_filled";
  }

  // Fill aufzeichnen
  const depot = getDepot(state, order.depotId);
  depot.fills.push({
    id: uid(state, "if"), orderId: order.id, instrumentId: order.instrumentId,
    side: order.side, qty: fillQty, priceCents: execPrice, feeCents: incrementalFee, min,
  });
  if (depot.fills.length > FILLS_MAX) depot.fills = depot.fills.slice(-FILLS_MAX);

  return { filled: true, fillQty, execPrice, feeCents: incrementalFee, fullyFilled: order.filledQty >= order.qty };
}

function applyFill(state, depotId, instrumentId, side, qty, priceCents, feeCents, min) {
  const depot = getDepot(state, depotId);
  const def = ALL_INSTRUMENT_DEFS.find(d => d.id === instrumentId);
  let pos = depot.positions[instrumentId];
  if (!pos) {
    pos = {
      instrumentId, qty: 0, availableQty: 0, reservedQty: 0,
      lots: [], totalCostCents: 0, totalFeesCents: 0,
      realizedPnlCents: 0, dividendsReceivedCents: 0,
    };
    depot.positions[instrumentId] = pos;
  }

  if (side === "buy") {
    // Settlement-Konto belasten
    const cost = Math.round(qty * priceCents) + feeCents;
    depot.settlementCents -= cost;
    // Lot hinzufügen
    pos.lots.push({
      qty, costPerUnitCents: priceCents, feeCents,
      acquiredAtMin: min, totalCostCents: Math.round(qty * priceCents) + feeCents,
    });
    pos.qty += qty;
    pos.availableQty += qty;
    pos.totalCostCents += Math.round(qty * priceCents) + feeCents;
    pos.totalFeesCents += feeCents;
    // Buchhaltung (nur Firma)
    if (depotId === "company") {
      const acct = def.type === "crypto" ? "1311" : "1310";
      postJournal(state, {
        text: `Kauf ${instrumentId}: ${qty} @ ${(priceCents / 100).toFixed(2)} €`, type: "investment_buy", gameTime: min,
        lines: [{ account: acct, debit: Math.round(qty * priceCents) + feeCents }, { account: "1005", credit: Math.round(qty * priceCents) + feeCents }],
      });
    }
  } else {
    // Verkauf: FIFO-Kostenbasis
    const proceeds = Math.round(qty * priceCents) - feeCents;
    depot.settlementCents += proceeds;
    let remaining = qty;
    let costBasis = 0;
    while (remaining > 0 && pos.lots.length > 0) {
      const lot = pos.lots[0];
      const sellFromLot = Math.min(remaining, lot.qty);
      const lotCost = Math.round(sellFromLot / lot.qty * lot.totalCostCents);
      costBasis += lotCost;
      lot.qty -= sellFromLot;
      lot.totalCostCents -= lotCost;
      remaining -= sellFromLot;
      if (lot.qty <= 0.0000000001) pos.lots.shift();
    }
    pos.qty -= qty;
    pos.totalCostCents -= costBasis;
    const realizedPnl = proceeds - costBasis;
    pos.realizedPnlCents += realizedPnl;
    depot.realizedPnlCents += realizedPnl;
    // Buchhaltung (nur Firma)
    if (depotId === "company") {
      const acct = def.type === "crypto" ? "1311" : "1310";
      const gainAcct = realizedPnl >= 0 ? "4300" : "5710";
      const lines = [
        { account: "1005", debit: proceeds },
        { account: acct, credit: costBasis },
      ];
      if (realizedPnl >= 0) {
        lines.push({ account: gainAcct, credit: realizedPnl });
      } else {
        lines.push({ account: gainAcct, debit: -realizedPnl });
      }
      // Gebühr im Erlös bereits enthalten (Netto)
      postJournal(state, {
        text: `Verkauf ${instrumentId}: ${qty} @ ${(priceCents / 100).toFixed(2)} €`, type: "investment_sell", gameTime: min,
        lines,
      });
    }
  }
}

// ---------- Order-Verarbeitung bei Tick ----------
function processExpiringOrders(state, min, log) {
  for (const depotId of ["company", "private"]) {
    const depot = getDepot(state, depotId);
    if (!depot) continue;
    for (const o of depot.orders) {
      if ((o.status === "open" || o.status === "partially_filled" || o.status === "pending_stop" || o.status === "active_stop") && o.expireMin && o.expireMin <= min) {
        o.status = "expired";
        // OCO-Partner ebenfalls stornieren
        if (o.ocoPartnerId) cancelOcoPartnerLocal(state, o, min);
        // Reserve freigeben
        if (o.side === "sell") {
          const pos = depot.positions[o.instrumentId];
          if (pos) pos.availableQty += (o.qty - o.filledQty);
        }
        log.push({ type: "investment_order_expired", orderId: o.id, depotId });
      }
    }
  }
}

function processOpenOrders(state, min, log) {
  for (const depotId of ["company", "private"]) {
    const depot = getDepot(state, depotId);
    if (!depot) continue;
    // Stabile Priorität: Annahmezeit + ID
    const openOrders = depot.orders
      .filter(o => o.status === "open" || o.status === "partially_filled" || o.status === "active_stop")
      .sort((a, b) => a.createdAtMin - b.createdAtMin || a.id.localeCompare(b.id));
    for (const o of openOrders) {
      const result = tryExecuteOrder(state, o, min);
      if (result.filled) {
        // Bei OCO: Partner stornieren wenn vollständig gefüllt
        if (o.filledQty >= o.qty && o.ocoPartnerId) {
          cancelOcoPartnerLocal(state, o, min);
        }
        log.push({ type: "investment_fill", orderId: o.id, depotId, ...result });
      }
    }
  }
}

function cancelOcoPartnerLocal(state, filledOrder, min) {
  for (const depotId of ["company", "private"]) {
    const depot = getDepot(state, depotId);
    if (!depot) continue;
    const partner = depot.orders.find(o => o.id === filledOrder.ocoPartnerId);
    if (!partner) continue;
    if (partner.status === "open" || partner.status === "partially_filled" || partner.status === "pending_stop" || partner.status === "active_stop") {
      partner.status = "cancelled";
      partner.cancelledByOco = filledOrder.id;
      partner.cancelledAtMin = min;
      if (partner.side === "sell") {
        const pos = depot.positions[partner.instrumentId];
        if (pos) pos.availableQty += (partner.qty - partner.filledQty);
      }
    }
  }
}

// ---------- Query-Funktionen für UI ----------
export function getInvestmentOverview(state) {
  const m = state.investment?.market;
  if (!m) return { ok: true, depots: { company: null, private: null }, market: { status: "closed" } };

  const companyDepot = summarizeDepot(state, "company");
  const privateDepot = summarizeDepot(state, "private");

  const stockOpen = isStockTradingHour(state.gameTime);
  const cryptoOpen = isCryptoTradingHour(state.gameTime);

  return {
    ok: true,
    market: { stockOpen, cryptoOpen, regime: m.regime?.current || "neutral", tickCount: m.tickCounter || 0 },
    depots: { company: companyDepot, private: privateDepot },
  };
}

function summarizeDepot(state, depotId) {
  const depot = getDepot(state, depotId);
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
      name: ALL_INSTRUMENT_DEFS.find(d => d.id === instId)?.name || instId,
      type: ALL_INSTRUMENT_DEFS.find(d => d.id === instId)?.type || "stock",
      qty: pos.qty,
      availableQty: pos.availableQty,
      costBasisCents: costBasis,
      marketValueCents: value,
      unrealizedPnlCents: unrealized,
      unrealizedPct: costBasis > 0 ? (unrealized / costBasis) * 100 : 0,
      currentMidCents: mid,
      realizedPnlCents: pos.realizedPnlCents,
    });
  }
  positions.sort((a, b) => b.marketValueCents - a.marketValueCents);

  const freeSettlement = getFreeSettlement(state, depotId);
  const totalValue = depot.settlementCents + marketValueCents;

  return {
    depotId,
    settlementCents: depot.settlementCents,
    freeSettlementCents: freeSettlement,
    marketValueCents,
    totalValueCents: totalValue,
    realizedPnlCents: depot.realizedPnlCents,
    positions,
    openOrderCount: (depot.orders || []).filter(o => o.status === "open" || o.status === "partially_filled" || o.status === "pending_stop" || o.status === "active_stop").length,
  };
}

export function getMarketOverview(state) {
  const m = state.investment?.market;
  if (!m) return { ok: true, instruments: [] };
  const stockOpen = isStockTradingHour(state.gameTime);
  const cryptoOpen = isCryptoTradingHour(state.gameTime);
  const instruments = ALL_INSTRUMENT_DEFS.map(def => {
    const inst = m.instruments[def.id];
    if (!inst) return null;
    const open = def.type === "stock" ? stockOpen : cryptoOpen;
    const prevMid = inst.priceHistory.length > 1 ? inst.priceHistory[inst.priceHistory.length - 2] : inst.priceHistory[0];
    const changePct = prevMid > 0 ? ((inst.currentQuote.mid - prevMid) / prevMid) * 100 : 0;
    return {
      id: def.id,
      name: def.name,
      sector: def.sector,
      type: def.type,
      riskClass: def.riskClass,
      midCents: inst.currentQuote.mid,
      bidCents: inst.currentQuote.bid,
      askCents: inst.currentQuote.ask,
      status: open ? "open" : "closed",
      changePct,
      dividendPerShareCents: def.dividendPerShareCents,
      stakingRate: def.stakingRate,
      priceHistory: inst.priceHistory.slice(-72),  // letzte 72 Ticks
    };
  }).filter(Boolean);
  return { ok: true, instruments, stockOpen, cryptoOpen, regime: m.regime?.current || "neutral" };
}

export function getInstrumentDetail(state, instrumentId) {
  const m = state.investment?.market;
  if (!m) return { ok: false, error: "Markt nicht initialisiert" };
  const inst = m.instruments[instrumentId];
  if (!inst) return { ok: false, error: "Instrument nicht gefunden" };
  const def = ALL_INSTRUMENT_DEFS.find(d => d.id === instrumentId);
  const open = def.type === "stock" ? isStockTradingHour(state.gameTime) : isCryptoTradingHour(state.gameTime);
  const prevMid = inst.priceHistory.length > 1 ? inst.priceHistory[inst.priceHistory.length - 2] : inst.priceHistory[0];
  const changePct = prevMid > 0 ? ((inst.currentQuote.mid - prevMid) / prevMid) * 100 : 0;
  return {
    ok: true,
    instrument: {
      ...def,
      midCents: inst.currentQuote.mid,
      bidCents: inst.currentQuote.bid,
      askCents: inst.currentQuote.ask,
      status: open ? "open" : "closed",
      changePct,
      priceHistory: inst.priceHistory.slice(-168),
      brokerLiquidityShares: inst.brokerLiquidityShares,
      brokerLiquidityCents: inst.brokerLiquidityCents,
    },
  };
}

export function getOrdersList(state, depotId) {
  const depot = getDepot(state, depotId);
  if (!depot) return { ok: true, orders: [], fills: [] };
  const orders = (depot.orders || []).slice().reverse().slice(0, 100).map(o => ({
    ...o,
    instrumentName: ALL_INSTRUMENT_DEFS.find(d => d.id === o.instrumentId)?.name || o.instrumentId,
  }));
  const fills = (depot.fills || []).slice().reverse().slice(0, 100);
  return { ok: true, orders, fills };
}

// ---------- Befehls-Handler ----------
export function handleInvestmentCommand(state, command, p) {
  switch (command) {
    case "getInvestmentStatus":
      return getInvestmentOverview(state);
    case "getInvestmentMarket":
      return getMarketOverview(state);
    case "getInvestmentInstrument":
      return getInstrumentDetail(state, p.instrumentId);
    case "getInvestmentDepot":
      return { ok: true, depot: summarizeDepot(state, p.depotId) };
    case "getInvestmentOrders":
      return getOrdersList(state, p.depotId);
    case "depositToDepot":
      return depositToDepot(state, p);
    case "withdrawFromDepot":
      return withdrawFromDepot(state, p);
    case "placeInvestmentOrder":
      return placeOrder(state, p);
    case "cancelInvestmentOrder":
      return cancelOrder(state, p);
    case "placeAdvancedOrder":
      return placeAdvancedOrder(state, p);
    case "stakePosition":
      return stakePosition(state, p);
    case "unstakePosition":
      return unstakePosition(state, p);
    case "getStakingStatus":
      return { ok: true, staking: getStakingStatus(state, p.depotId, p.instrumentId) };
    case "createSavingsPlan":
      return createSavingsPlan(state, p);
    case "cancelSavingsPlan":
      return cancelSavingsPlan(state, p);
    case "pauseSavingsPlan":
      return pauseSavingsPlan(state, p);
    case "resumeSavingsPlan":
      return resumeSavingsPlan(state, p);
    case "getInvestmentPerformance":
      return { ok: true, performance: getPerformanceOverview(state, p.depotId) };
    default:
      return null;
  }
}