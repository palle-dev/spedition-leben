import { EXTRA_LOCATIONS } from "./dachGeography.ts";
import { retainHistory } from "./historyRetention.ts";
// Markt-Dynamik-Engine für FERNWERK.
// Verwaltet Regionen, saisonale Nachfrage, zeitlich begrenzte Marktereignisse
// und die daraus resultierenden Nachfrage- und Preisfaktoren.
// Alle Faktoren sind zentral konfigurierbar und deterministisch reproduzierbar.

import { dayOf, mulberry32, formatGameTime } from "./gameRules.ts";
import { getOrderSegments, REGIONAL_DISTANCE_KM, EXPRESS_DEADLINE_MIN } from "./segmentEngine.ts";
import { deliverMessage } from "./mailEngine.ts";

// ---------- Regionen ----------

export const REGIONS = ["nord", "ost", "mitte", "sued", "west", "at", "ch"];

export const REGION_LABELS: Record<string, string> = {
  at: "Österreich", ch: "Schweiz",
  nord: "Nord",
  ost: "Ost",
  mitte: "Mitte",
  sued: "Süd",
  west: "West",
};

export const CITY_REGION: Record<string, string> = {
  ...Object.fromEntries(EXTRA_LOCATIONS.filter(x=>x[1]!=="DE").map(x=>[x[0],String(x[1]).toLowerCase()])),
  Schwerin:"nord", Potsdam:"ost", Mainz:"west", Wiesbaden:"west",
  Hamburg: "nord", Bremen: "nord", Kiel: "nord", Lübeck: "nord",
  Rostock: "nord", Braunschweig: "nord", Osnabrück: "nord", Bielefeld: "nord",
  Berlin: "ost", Magdeburg: "ost", Leipzig: "ost", Dresden: "ost", Erfurt: "ost",
  Hannover: "mitte", Kassel: "mitte", Münster: "mitte", Würzburg: "mitte", Mannheim: "mitte",
  München: "sued", Stuttgart: "sued", Nürnberg: "sued", Regensburg: "sued",
  Ulm: "sued", Freiburg: "sued", Saarbrücken: "sued",
  Köln: "west", Düsseldorf: "west", Frankfurt: "west", Dortmund: "west", Essen: "west",
};

export function getRegionOfCity(city: string): string {
  return CITY_REGION[city] || "mitte";
}

// ---------- Spielkalender ----------

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 360

export function gameDay(min: number): number {
  return dayOf(min);
}

export function gameMonth(min: number): number {
  const day = dayOf(min);
  const dayInYear = ((day - 1) % DAYS_PER_YEAR + DAYS_PER_YEAR) % DAYS_PER_YEAR;
  return Math.floor(dayInYear / DAYS_PER_MONTH) + 1;
}

export function gameYear(min: number): number {
  return Math.floor((dayOf(min) - 1) / DAYS_PER_YEAR) + 1;
}

export function isLastDayOfMonth(min: number): boolean {
  return dayOf(min) % DAYS_PER_MONTH === 0;
}

// ---------- Saisonale Muster ----------

// Saisonale Nachfragefaktoren pro (Monat, Region, Segment).
// Basis 1.0, saisonale Abweichungen ±0.10.
// Kombiniert mit Ereignissen bleiben die Gesamtfaktoren innerhalb [0.80, 1.25].

const SEASONAL_DEMAND_PATTERNS = [
  // Frühjahrsbelebung (Monate 3-4): Baustoffe, Bauteile, Maschinenteile steigen
  { months: [3, 4], regions: null, segments: ["standard"], delta: 0.08, desc: "Frühjahrsbelebung im Bau- und Industriesektor" },
  { months: [3, 4], regions: ["mitte", "ost"], segments: null, delta: 0.05, desc: "Frühjahrsbelebung in Mitteldeutschland" },
  // Sommerliche Verschiebung (Monate 6-7): Süd hoch, Nord leicht niedrig
  { months: [6, 7], regions: ["sued"], segments: null, delta: 0.10, desc: "Sommerliche Nachfrageverschiebung in den Süden" },
  { months: [6, 7], regions: ["nord"], segments: null, delta: -0.05, desc: "Sommerliche Nachfrageabschwächung im Norden" },
  // Herbstliche Zunahme (Monate 9-10): Handel und Industrie
  { months: [9, 10], regions: null, segments: ["standard"], delta: 0.08, desc: "Herbstliche Handelssaison" },
  { months: [9, 10], regions: ["west", "mitte"], segments: null, delta: 0.05, desc: "Herbstliche Industriebelebung im Westen" },
  // Winterliche Veränderungen (Monate 12, 1, 2): Nord niedrig, Express leicht hoch
  { months: [12, 1, 2], regions: ["nord"], segments: null, delta: -0.08, desc: "Winterliche Nachfrageabschwächung im Norden" },
  { months: [12, 1, 2], regions: null, segments: ["express"], delta: 0.05, desc: "Winterlicher Anstieg zeitkritischer Transporte" },
];

// Saisonale Preisfaktoren: Basis 1.0, Abweichungen ±0.04.
// Kombiniert mit Ereignissen bleiben die Gesamtfaktoren innerhalb [0.90, 1.15].

const SEASONAL_PRICE_PATTERNS = [
  { months: [3, 4], regions: null, segments: ["standard"], delta: 0.03, desc: "Bauseason: leicht höhere Preise" },
  { months: [6, 7], regions: ["sued"], segments: null, delta: 0.04, desc: "Südsaison: höhere Preise im Süden" },
  { months: [9, 10], regions: null, segments: null, delta: 0.02, desc: "Herbstsaison: leicht höhere Preise" },
  { months: [12, 1, 2], regions: ["nord"], segments: null, delta: -0.03, desc: "Winter: niedrigere Preise im Norden" },
];

function applyPatterns(month: number, region: string, segment: string, patterns: any[]): number {
  let factor = 1.0;
  for (const p of patterns) {
    if (!p.months.includes(month)) continue;
    if (p.regions && !p.regions.includes(region)) continue;
    if (p.segments && !p.segments.includes(segment)) continue;
    factor += p.delta;
  }
  return factor;
}

export function seasonalDemandFactor(min: number, region: string, segment: string): number {
  return applyPatterns(gameMonth(min), region, segment, SEASONAL_DEMAND_PATTERNS);
}

export function seasonalPriceFactor(min: number, region: string, segment: string): number {
  return applyPatterns(gameMonth(min), region, segment, SEASONAL_PRICE_PATTERNS);
}

// ---------- Grenzen ----------

export const DEMAND_FACTOR_MIN = 0.80;
export const DEMAND_FACTOR_MAX = 1.25;
export const PRICE_FACTOR_MIN = 0.90;
export const PRICE_FACTOR_MAX = 1.15;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ---------- Marktereignisse ----------

export const EVENT_TEMPLATES = [
  {
    id: "A",
    type: "extra_shipping",
    label: "Zusätzlicher Versandbedarf",
    desc: "Ein Kunde benötigt vorübergehend mehr Transporte auf bestehenden Relationen.",
    demandDelta: 0.15,
    priceDelta: 0.05,
    appliesTo: "customer",
  },
  {
    id: "B",
    type: "regional_spike",
    label: "Regionale Auftragsspitze",
    desc: "In einer Region steigt für ein Segment die Nachfrage für einige Tage.",
    demandDelta: 0.20,
    priceDelta: 0.08,
    appliesTo: "region_segment",
  },
  {
    id: "C",
    type: "quiet_days",
    label: "Ruhigere Geschäftstage",
    desc: "In einer Region sinkt vorübergehend die Nachfrage.",
    demandDelta: -0.15,
    priceDelta: -0.05,
    appliesTo: "region",
  },
  {
    id: "D",
    type: "express_wave",
    label: "Zeitkritische Versandwelle",
    desc: "Kunden bieten zeitweise einen höheren Anteil an Expressaufträgen an.",
    demandDelta: 0.10,
    priceDelta: 0.08,
    appliesTo: "segment_express",
  },
];

// ---------- Konfiguration ----------

export const EVENT_CONFIG = {
  minDurationDays: 2,
  maxDurationDays: 4,
  announcementLeadDays: 1, // Mindestens 1 Tag Ankündigung vor Beginn
  maxActiveEvents: 2,
  maxPerRegionSegment: 1,
  minGapDays: 7, // Mindestabstand zwischen gleichen Vorlagen in derselben Region
  generationChancePerDay: 0.35, // Wahrscheinlichkeit pro Tag, ein neues Ereignis zu prüfen
};

// ---------- Migration ----------

export function migrateMarketDynamics(state: any) {
  if (!state.marketDynamics) {
    state.marketDynamics = {
      version: 1,
      rngSeed: 0,
      events: [],
      lastDayProcessed: 0,
      eventCounter: 0,
    };
  }
  if (state.marketDynamics.version === undefined) state.marketDynamics.version = 1;
  if (!Array.isArray(state.marketDynamics.events)) state.marketDynamics.events = [];
  if (state.marketDynamics.rngSeed === undefined || state.marketDynamics.rngSeed === 0) {
    // Deterministischer Seed aus Spielzustand
    state.marketDynamics.rngSeed = ((state.rngSeed || 1) * 99991 + 7) >>> 0;
  }
  if (state.marketDynamics.lastDayProcessed === undefined) state.marketDynamics.lastDayProcessed = 0;
  if (state.marketDynamics.eventCounter === undefined) state.marketDynamics.eventCounter = 0;

  // Abgelaufene Ereignisse bereinigen (Ended > 30 Tage)
  const cutoff = (state.gameTime || 0) - 30 * 1440;
  state.marketDynamics.events = retainHistory(state, "marketEvents", state.marketDynamics.events, state.marketDynamics.events.filter((e: any) =>
    e.status === "announced" || e.status === "active" || (e.endMin || 0) > cutoff
  ), null);
}

// ---------- Zufallsstrom ----------

function dynamicsRng(state: any): number {
  const r = mulberry32(state.marketDynamics.rngSeed >>> 0);
  const v = r();
  state.marketDynamics.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}

// ---------- Ereigniserzeugung ----------

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function generateEvent(state: any, m: number): any {
  const cfg = EVENT_CONFIG;
  const rng = () => dynamicsRng(state);
  const template = pickRandom(EVENT_TEMPLATES, rng);
  const region = pickRandom(state.dach?.enabled?REGIONS:REGIONS.filter(r=>!["at","ch"].includes(r)), rng);

  let segment: string | null = null;
  let customerId: string | null = null;

  if (template.appliesTo === "region_segment" || template.appliesTo === "segment_express") {
    segment = template.appliesTo === "segment_express" ? "express" : pickRandom(
      ["regional", "express", "dangerousGoods", "standard"], rng
    );
  } else if (template.appliesTo === "customer") {
    // Einen Kunden mit Depot in der gewählten Region finden
    const candidates = (state.orders || [])
      .filter((o: any) => getRegionOfCity(o.fromCity) === region)
      .map((o: any) => o.customerId)
      .filter((id: string, i: number, arr: string[]) => arr.indexOf(id) === i)
      .slice(0, 10);
    if (candidates.length === 0) return null;
    customerId = pickRandom(candidates, rng);
  }

  // Prüfen, ob bereits ein aktives Ereignis für diese Kombination existiert
  const conflictKey = `${template.id}|${region}|${segment || ""}`;
  const hasActive = state.marketDynamics.events.some((e: any) =>
    e.status !== "ended" && e.conflictKey === conflictKey
  );
  if (hasActive) return null;

  // Mindestabstand zwischen gleichen Vorlagen in derselben Region prüfen
  const recentSame = state.marketDynamics.events.some((e: any) =>
    e.templateId === template.id &&
    e.region === region &&
    (e.endMin || 0) > m - cfg.minGapDays * 1440
  );
  if (recentSame) return null;

  // Maximal 2 gleichzeitig aktive Ereignisse
  const activeCount = state.marketDynamics.events.filter((e: any) => e.status === "active").length;
  if (activeCount >= cfg.maxActiveEvents) return null;

  const durationDays = cfg.minDurationDays + Math.floor(rng() * (cfg.maxDurationDays - cfg.minDurationDays + 1));
  const startMin = m + cfg.announcementLeadDays * 1440;
  const endMin = startMin + durationDays * 1440;

  state.marketDynamics.eventCounter++;
  const eventId = "me_" + state.marketDynamics.eventCounter;

  const event = {
    id: eventId,
    templateId: template.id,
    type: template.type,
    label: template.label,
    description: template.desc,
    region,
    segment,
    customerId,
    conflictKey,
    announceMin: m,
    startMin,
    endMin,
    demandDelta: template.demandDelta,
    priceDelta: template.priceDelta,
    status: "announced",
  };

  state.marketDynamics.events.push(event);
  return event;
}

// ---------- Tageswechsel-Verarbeitung ----------

export function processMarketDynamicsDayChange(state: any, m: number, log: any[]): void {
  migrateMarketDynamics(state);

  const day = dayOf(m);

  // Nur einmal pro Tag verarbeiten
  if (state.marketDynamics.lastDayProcessed === day) return;
  state.marketDynamics.lastDayProcessed = day;

  // 1. Status-Übergänge: announced → active, active → ended
  let transitions: any[] = [];
  for (const e of state.marketDynamics.events) {
    if (e.status === "announced" && m >= e.startMin) {
      e.status = "active";
      transitions.push({ event: e, to: "active" });
    } else if (e.status === "active" && m >= e.endMin) {
      e.status = "ended";
      transitions.push({ event: e, to: "ended" });
    }
  }

  // 2. Neue Ereignisse generieren (nur an vollen Tagen, nicht bei Mitternacht-0)
  let newEvent: any = null;
  if (day > 1) { // Nicht am ersten Spieltag
    const rng = () => dynamicsRng(state);
    if (rng() < EVENT_CONFIG.generationChancePerDay) {
      newEvent = generateEvent(state, m);
    }
  }

  if (transitions.length > 0 || newEvent) {
    log.push({
      type: "market_dynamics_day",
      atMin: m,
      transitions: transitions.map(t => ({ id: t.event.id, to: t.to, label: t.event.label })),
      newEvent: newEvent ? { id: newEvent.id, label: newEvent.label, region: newEvent.region } : null,
    });
  }

  // Postfach-Ankündigung für neue Ereignisse (mit dedupKey gegen Dupletten)
  if (newEvent) {
    const regionLabel = REGION_LABELS[newEvent.region] || newEvent.region;
    const segText = newEvent.segment ? (SEGMENT_LABELS[newEvent.segment] || newEvent.segment) : "alle Segmente";
    const startDay = dayOf(newEvent.startMin);
    const endDay = dayOf(newEvent.endMin);
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: `Marktentwicklung: ${newEvent.label}`,
      body: `${newEvent.description}\n\nRegion: ${regionLabel}\nBetroffen: ${segText}\nZeitraum: Tag ${startDay} bis Tag ${endDay}\n\nNachfrageveränderung: ${newEvent.demandDelta > 0 ? "+" : ""}${Math.round(newEvent.demandDelta * 100)}%${newEvent.priceDelta ? `, Preis: ${newEvent.priceDelta > 0 ? "+" : ""}${Math.round(newEvent.priceDelta * 100)}%` : ""}\n\nDiese Entwicklung ist bekannt. Konkrete Aufträge oder Gewinne sind nicht garantiert.`,
      gameTime: m,
      category: "system", priority: "normal",
      sourceEvent: "market_dynamics_announce",
      dedupKey: "market_dynamics:" + newEvent.id,
    });
  }
}

const SEGMENT_LABELS: Record<string, string> = {
  regional: "Regionalverkehr",
  express: "Express",
  dangerousGoods: "Gefahrgut",
  standard: "Standard",
};

// ---------- Faktor-Berechnung ----------

export function getDemandFactor(state: any, region: string, segment: string): number {
  migrateMarketDynamics(state);
  const m = state.gameTime || 0;
  let factor = seasonalDemandFactor(m, region, segment);

  // Ereignis-Modifikatoren addieren
  for (const e of state.marketDynamics.events) {
    if (e.status !== "active") continue;
    if (e.region && e.region !== region) continue;
    if (e.segment && e.segment !== segment) continue;
    factor += e.demandDelta;
  }

  return clamp(factor, DEMAND_FACTOR_MIN, DEMAND_FACTOR_MAX);
}

export function getPriceFactor(state: any, region: string, segment: string): number {
  migrateMarketDynamics(state);
  const m = state.gameTime || 0;
  let factor = seasonalPriceFactor(m, region, segment);

  for (const e of state.marketDynamics.events) {
    if (e.status !== "active") continue;
    if (e.region && e.region !== region) continue;
    if (e.segment && e.segment !== segment) continue;
    factor += e.priceDelta;
  }

  return clamp(factor, PRICE_FACTOR_MIN, PRICE_FACTOR_MAX);
}

// Faktor für einen Auftrag basierend auf seiner Abgangsregion
export function getDemandFactorForOrder(state: any, order: any): number {
  const region = getRegionOfCity(order.fromCity);
  const segments = getOrderSegments(order);
  const primarySeg = segments[0] || "standard";
  return getDemandFactor(state, region, primarySeg);
}

export function getPriceFactorForOrder(state: any, order: any): number {
  const region = getRegionOfCity(order.fromCity);
  const segments = getOrderSegments(order);
  const primarySeg = segments[0] || "standard";
  return getPriceFactor(state, region, primarySeg);
}

// ---------- Marktübersicht für UI ----------

export function getMarketOverview(state: any): any {
  migrateMarketDynamics(state);

  const overview: any = {};
  for (const region of REGIONS.filter(r=>state.dach?.enabled||!["at","ch"].includes(r))) {
    overview[region] = {
      label: REGION_LABELS[region],
      segments: {},
    };
    for (const seg of ["regional", "express", "dangerousGoods", "standard"]) {
      const demand = getDemandFactor(state, region, seg);
      const price = getPriceFactor(state, region, seg);
      overview[region].segments[seg] = {
        demandFactor: Math.round(demand * 100) / 100,
        priceFactor: Math.round(price * 100) / 100,
        demandLabel: demandLabel(demand),
        priceLabel: priceLabel(price),
      };
    }
  }

  const activeEvents = state.marketDynamics.events
    .filter((e: any) => e.status === "active")
    .map((e: any) => ({ ...e }));

  const announcedEvents = state.marketDynamics.events
    .filter((e: any) => e.status === "announced")
    .map((e: any) => ({ ...e }));

  return {
    regions: overview,
    activeEvents,
    announcedEvents,
    gameMonth: gameMonth(state.gameTime || 0),
    gameYear: gameYear(state.gameTime || 0),
    seasonLabel: seasonLabel(gameMonth(state.gameTime || 0)),
  };
}

function demandLabel(factor: number): string {
  if (factor >= 1.20) return "sehr hoch";
  if (factor >= 1.10) return "erhöht";
  if (factor >= 1.03) return "leicht erhöht";
  if (factor <= 0.85) return "sehr niedrig";
  if (factor <= 0.93) return "verringert";
  if (factor <= 0.97) return "leicht verringert";
  return "normal";
}

function priceLabel(factor: number): string {
  if (factor >= 1.10) return "erhöht";
  if (factor >= 1.04) return "leicht erhöht";
  if (factor <= 0.94) return "erleichtert";
  if (factor <= 0.97) return "leicht verringert";
  return "normal";
}

function seasonLabel(month: number): string {
  if (month >= 3 && month <= 4) return "Frühjahr";
  if (month >= 5 && month <= 7) return "Sommer";
  if (month >= 8 && month <= 10) return "Herbst";
  return "Winter";
}

// ---------- Aktualisierung bei Aktivierung (für bestehende Spielstände) ----------

// Bei Migration auf bestehenden Spielständen: Dynamik frühestens am nächsten Spieltag aktivieren.
export function shouldActivateDynamics(state: any): boolean {
  migrateMarketDynamics(state);
  // Wenn noch keine Ereignisse vorhanden und lastDayProcessed = 0,
  // beginnt die Generierung am nächsten Tageswechsel.
  return state.marketDynamics.lastDayProcessed < dayOf(state.gameTime || 0);
}