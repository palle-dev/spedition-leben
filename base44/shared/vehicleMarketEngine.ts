// Gebrauchtfahrzeugmarkt für FERNWERK.
// Erzeugt deterministisch eine kleine, gespeicherte Auswahl konkreter Gebrauchtangebote
// an definierten Spielzeitpunkten. Angebote sind stabil — Öffnen/Filtern/Neuladen
// würfelt keine neuen Angebote aus. Ein gekauftes Angebot verschwindet genau einmal
// und erzeugt genau ein eigenes Fahrzeug.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.

import {
  VEHICLE_CATALOG, VEHICLE_CATALOG_LIST, getVehicleProfile,
  computeMarketValue, computeDealerOffer, mulberry32, formatGameTime,
} from "./gameRules.ts";
import { registerAsset, addBooking } from "./accountingEngine.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";

// ---------- Konstanten ----------
export const USED_MARKET_VERSION = 1;
export const GENERATION_INTERVAL_MIN = 3 * 1440; // Alle 3 Spieltage
export const FIRST_GENERATION_MIN = 3 * 1440 + 480; // Tag 3, 08:00
export const OFFER_VALID_HOURS = 48; // Angebote gelten 48 h
export const MAX_OFFERS = 6; // Maximal gleichzeitig aktive Angebote
export const OFFERS_PER_GENERATION = [2, 3]; // 2–3 neue Angebote pro Generierung

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function marketRng(state) {
  const r = mulberry32(state.usedVehicleMarket.rngSeed >>> 0);
  const v = r();
  state.usedVehicleMarket.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}

// ---------- Angebotserzeugung ----------
// Erzeugt ein konkretes Gebrauchtangebot mit echten Fahrzeugeigenschaften.
// Die Preisbildung stellt sicher, dass der Kaufpreis über dem Händlerankaufswert
// liegt (keine Arbitrage durch sofortigen Weiterverkauf).
function makeUsedOffer(state, m) {
  const rng = () => marketRng(state);

  // Fahrzeugtyp wählen (gewichtet: regional 30 %, standard 50 %, heavy 20 %)
  const typeRoll = rng();
  let catalogId;
  if (typeRoll < 0.30) catalogId = "regional";
  else if (typeRoll < 0.80) catalogId = "standard";
  else catalogId = "heavy";
  const profile = VEHICLE_CATALOG[catalogId];

  // Alter in Spielzeit (90–365 Tage = 3–12 Spielmonate)
  const ageDays = 90 + Math.floor(rng() * 276);
  const ageMin = ageDays * 1440;
  const acquiredAtMin = m - ageMin;

  // Kilometerstand (50.000–500.000 km, korreliert mit Alter)
  const maxKm = Math.floor(ageDays * 1500); // ~1500 km/Tag max
  const odometerKm = 50000 + Math.floor(rng() * Math.max(150000, maxKm));

  // Zustand (30–78, gebraucht — deutlich abgenutzt)
  const condition = 30 + Math.floor(rng() * 49);

  // Konstruiere ein temporäres Fahrzeug-Objekt für die Marktwertberechnung
  const tempVehicle = {
    referencePriceCents: profile.referencePriceCents,
    acquiredAtMin,
    odometerKm,
    condition,
  };

  const marketValue = computeMarketValue(tempVehicle, m);
  const dealerBuyValue = computeDealerOffer(tempVehicle, m);

  // Kaufpreis: 93–99 % des Marktwerts — immer über dem Händlerankaufswert (90 %).
  // Das verhindert risikolose Arbitrage: Kaufen und sofortiger Verkauf an den
  // Handler ergibt immer einen Verlust von mindestens ~3 %.
  const askingFactor = 0.93 + rng() * 0.06; // 0,93–0,99
  let askingPriceCents = Math.round(marketValue * askingFactor);
  // Sicherheitsnetz: Kaufpreis muss mindestens 2 % über Händlerankauf liegen
  const minPrice = Math.round(dealerBuyValue * 1.02);
  if (askingPriceCents < minPrice) askingPriceCents = minPrice;

  // Bekannte notwendige Wartung: Zustand < 70 → Wartung empfohlen
  const needsMaintenance = condition < 70;
  const estimatedMaintenanceCostCents = needsMaintenance ? profile.maintenanceCostCents : 0;

  const expireMin = m + OFFER_VALID_HOURS * 60;

  const offer = {
    id: uid(state, "uvm"),
    catalogId,
    vehicleType: profile.label,
    capacityTons: profile.capacityTons,
    consumptionPer100km: profile.consumptionPer100km,
    ageMin,
    ageDays,
    odometerKm,
    condition,
    askingPriceCents,
    marketValueCents: marketValue,
    dealerBuyValueCents: dealerBuyValue,
    estimatedMaintenanceCostCents,
    needsMaintenance,
    expireMin,
    generatedAtMin: m,
    status: "available",
    purchasedByVehicleId: null,
    purchasedAtMin: null,
  };

  return offer;
}

// ---------- Generierung ----------
export function generateUsedVehicleOffers(state, m, log) {
  if (!state.usedVehicleMarket) migrateUsedVehicleMarket(state);

  const market = state.usedVehicleMarket;

  // Abgelaufene Angebote entfernen
  let expired = 0;
  for (const offer of market.offers) {
    if (offer.status === "available" && offer.expireMin <= m) {
      offer.status = "expired";
      offer.expiredAtMin = m;
      expired++;
    }
  }

  // Neue Angebote nur zum fälligen Generierungszeitpunkt
  if (m < market.nextGenerateMin) {
    if (expired > 0) log.push({ type: "used_market_expired", atMin: m, expired });
    return;
  }

  // Verfügbare Angebote zählen
  const available = market.offers.filter(o => o.status === "available").length;
  const maxNew = MAX_OFFERS - available;
  if (maxNew <= 0) {
    market.nextGenerateMin = m + GENERATION_INTERVAL_MIN;
    return;
  }

  const count = Math.min(maxNew, OFFERS_PER_GENERATION[0] + Math.floor(marketRng(state) * (OFFERS_PER_GENERATION[1] - OFFERS_PER_GENERATION[0] + 1)));
  let generated = 0;
  for (let i = 0; i < count; i++) {
    const offer = makeUsedOffer(state, m);
    market.offers.push(offer);
    generated++;
  }

  market.stats.generated = (market.stats.generated || 0) + generated;
  market.nextGenerateMin = m + GENERATION_INTERVAL_MIN;

  if (generated > 0) {
    log.push({ type: "used_market_generated", atMin: m, generated, available: available + generated });
    pushEvent(state, {
      type: "used_market_update",
      gameTime: m, isSystem: true,
      details: { newOffers: generated, totalAvailable: available + generated },
      dedupKey: "used_market:" + m,
    });
  }
  if (expired > 0) log.push({ type: "used_market_expired", atMin: m, expired });
}

// ---------- Kauf ----------
export function buyUsedVehicle(state, { offerId, branchId }) {
  if (!state.usedVehicleMarket) migrateUsedVehicleMarket(state);
  const offer = state.usedVehicleMarket.offers.find(o => o.id === offerId);
  if (!offer) throw new Error("Gebrauchtangebot nicht gefunden.");
  if (offer.status !== "available") throw new Error("Angebot ist nicht mehr verfügbar.");
  if (offer.expireMin <= state.gameTime) throw new Error("Angebot ist abgelaufen.");

  const profile = VEHICLE_CATALOG[offer.catalogId] || VEHICLE_CATALOG.standard;
  const buyPrice = offer.askingPriceCents;

  if (state.company.accountCents < buyPrice) {
    throw new Error("Firmenkonto reicht für den Kauf (" + (buyPrice / 100).toFixed(0) + " €) nicht aus.");
  }
  const buyBranch = branchId ? state.branches.find(b => b.id === branchId) : state.branches[0];
  if (!buyBranch || buyBranch.status !== "active") throw new Error("Keine aktive Filiale verfügbar.");

  // Buchung: Kaufpreis vom Firmenkonto
  addBooking(state, state.gameTime, "Gebrauchtfahrzeugkauf: " + offer.vehicleType, -buyPrice, "company", "usedbuy:" + offer.id);

  // Fahrzeug mit tatsächlichen Gebrauchtwerteigenschaften erstellen
  const vehicleId = uid(state, "v");
  const vehicle = {
    id: vehicleId, branchId: buyBranch.id, type: offer.vehicleType, catalogId: offer.catalogId,
    capacityTons: offer.capacityTons, consumptionPer100km: offer.consumptionPer100km,
    bookValueCents: buyPrice, condition: offer.condition,
    locationCity: buyBranch.city, status: "free", tripId: null, maintenanceUntil: null,
    ownership_type: "owned", odometerKm: offer.odometerKm,
    acquiredAtMin: state.gameTime, referencePriceCents: profile.referencePriceCents,
    markedForSale: false, saleOffer: null,
    usedVehicleOfferId: offer.id,
  };
  state.vehicles.push(vehicle);

  // Anlagenbuchhaltung: zum tatsächlichen Kaufpreis
  registerAsset(state, {
    vehicleId: vehicle.id, account: "1200",
    name: "Lkw " + String(parseInt(String(vehicle.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0"),
    acquisitionCostCents: buyPrice, acquiredAtMin: state.gameTime,
  });

  // Angebot als gekauft markieren (verschwindet genau einmal)
  offer.status = "purchased";
  offer.purchasedByVehicleId = vehicleId;
  offer.purchasedAtMin = state.gameTime;

  state.usedVehicleMarket.stats.purchased = (state.usedVehicleMarket.stats.purchased || 0) + 1;

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Gebrauchtfahrzeug gekauft",
    body: `Ein ${offer.vehicleType} wurde für ${(buyPrice / 100).toFixed(0)} € gekauft.\nZustand: ${offer.condition}/100 · km ${offer.odometerKm.toLocaleString("de-DE")} · Alter ${offer.ageDays} Tage\nStandort: ${buyBranch.city}${offer.needsMaintenance ? "\n\nHinweis: Eine Wartung wird empfohlen (Zustand unter 70)." : ""}`,
    gameTime: state.gameTime, category: "financing", priority: "normal",
    linkedRefs: { type: "vehicle", id: vehicleId }, dedupKey: `usedbuy:${offer.id}`,
  });

  return { ok: true, vehicleId, offerId, priceCents: buyPrice, condition: offer.condition, odometerKm: offer.odometerKm, needsMaintenance: offer.needsMaintenance };
}

// ---------- Abfrage ----------
export function getUsedVehicleMarket(state) {
  if (!state.usedVehicleMarket) migrateUsedVehicleMarket(state);
  const available = state.usedVehicleMarket.offers
    .filter(o => o.status === "available" && o.expireMin > state.gameTime)
    .sort((a, b) => a.expireMin - b.expireMin);
  return {
    offers: available,
    nextGenerateMin: state.usedVehicleMarket.nextGenerateMin,
    nextGenerateLabel: formatGameTime(state.usedVehicleMarket.nextGenerateMin),
    stats: state.usedVehicleMarket.stats || {},
  };
}

// ---------- Event-Zeiten ----------
export function getUsedMarketEventTimes(state, t, maxMin) {
  const events = [];
  if (state.usedVehicleMarket) {
    if (state.usedVehicleMarket.nextGenerateMin > t && state.usedVehicleMarket.nextGenerateMin <= maxMin) {
      events.push(state.usedVehicleMarket.nextGenerateMin);
    }
    for (const offer of state.usedVehicleMarket.offers) {
      if (offer.status === "available" && offer.expireMin > t && offer.expireMin <= maxMin) {
        events.push(offer.expireMin);
      }
    }
  }
  return events;
}

// ---------- Migration ----------
export function migrateUsedVehicleMarket(state) {
  if (!state.usedVehicleMarket) {
    state.usedVehicleMarket = {
      version: USED_MARKET_VERSION,
      offers: [],
      nextGenerateMin: Math.max(state.gameTime + 1440, FIRST_GENERATION_MIN),
      rngSeed: 9876543,
      stats: { generated: 0, purchased: 0, expired: 0 },
    };
  }
  if (!state.usedVehicleMarket.stats) {
    state.usedVehicleMarket.stats = { generated: 0, purchased: 0, expired: 0 };
  }
  // Abgelaufene Angebote bei Migration bereinigen
  for (const offer of state.usedVehicleMarket.offers) {
    if (offer.status === "available" && offer.expireMin <= state.gameTime) {
      offer.status = "expired";
      offer.expiredAtMin = state.gameTime;
    }
  }
}