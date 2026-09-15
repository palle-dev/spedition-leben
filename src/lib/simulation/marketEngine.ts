// Markt-Engine für FERNWERK – Auftrag 19.
// Stündlicher, mitwachsender Auftragsmarkt mit flottenabhängigem Zielbestand,
// räumlicher Verteilung, neuer Preisformel und diversen Angebotsarten.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.

import {
  CITIES, getDistance, driveMinutes, mulberry32, dayOf, formatGameTime,
  CARGO_TYPES, CUSTOMER_PROFILES,
  MARKET_VERSION, MARKET_WAVE_INTERVAL,
  PRICE_BASE_CENTS, PRICE_PER_KM_CENTS, PRICE_PER_TON_CENTS,
  EXPRESS_FACTOR, RELATION_FACTOR_MIN, RELATION_FACTOR_MAX,
  NORMAL_ACCEPT_HOURS, EXPRESS_ACCEPT_HOURS, ADVANCE_ACCEPT_HOURS,
  NORMAL_BUFFER_HOURS, EXPRESS_BUFFER_HOURS, PAYMENT_TERMS_DAYS,
  LOAD_MIN, UNLOAD_MIN, WORK_BUDGET_MIN, DRIVE_BUDGET_MIN, BREAK_MIN, REST_MIN,
  SERVICE_START_MIN,
} from "./gameRules.ts";
import { earliestAvailable } from "./tourEngine.ts";
import {
  DG_PROFILES, makeDgOffer, computeDgFleetN,
} from "./dangerousGoodsEngine.ts";
import { pushEvent } from "./eventLog.ts";

// ---------- Hilfsfunktionen ----------

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Eigener Zufallsstrom für den Markt – unabhängig vom Haupt-RNG.
function marketRng(state) {
  const r = mulberry32(state.market.rngSeed >>> 0);
  const v = r();
  state.market.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}

function weightedPick(items, weights, rng) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Deterministester Relationenfaktor (0,90–1,10) je Relation und Spieltag.
export function relationFactor(state, fromCity, toCity) {
  const day = dayOf(state.gameTime);
  const key = fromCity + "|" + toCity + "|" + day + "|" + (state.market?.rngSeed || 0);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
  }
  const range = RELATION_FACTOR_MAX - RELATION_FACTOR_MIN;
  const factor = RELATION_FACTOR_MIN + (Math.abs(hash) % 1000) / 1000 * range;
  return Math.round(factor * 100) / 100;
}

// ---------- Planbare Flotte N ----------

// Zählt nutzbare Fahrzeug-/Fahrerpaarungen innerhalb der nächsten 72 Stunden.
// Berücksichtigt aktuelle Bindungen, Ruhezeiten und Wartung.
// Keine Doppelbelegung von Person oder Fahrzeug.
export function computePlanableFleetN(state) {
  const horizon = 72 * 60;
  const maxAvail = state.gameTime + horizon;

  const vehicles = (state.vehicles || []).filter(v =>
    v.status !== "archived" && v.condition >= 20
  );
  const drivers = (state.drivers || []).filter(d =>
    d.employmentStatus === "employed" && d.attendance !== "released"
  );

  // Greedy Matching: jedem Fahrzeug den frühest verfügbaren Fahrer am gleichen Ort zuweisen
  const usedDrivers = new Set();
  let n = 0;

  // Sortiere Fahrzeuge nach Verfügbarkeit (freie zuerst)
  const sortedVehicles = [...vehicles].sort((a, b) => {
    const aFree = a.status === "free" ? 0 : 1;
    const bFree = b.status === "free" ? 0 : 1;
    return aFree - bFree;
  });

  for (const v of sortedVehicles) {
    let bestDriver = null;
    let bestAvail = Infinity;
    for (const d of drivers) {
      if (usedDrivers.has(d.id)) continue;
      if (d.locationCity !== v.locationCity) continue;
      const avail = earliestAvailable(state, v, d);
      if (avail <= maxAvail && avail < bestAvail) {
        bestDriver = d;
        bestAvail = avail;
      }
    }
    if (bestDriver) {
      usedDrivers.add(bestDriver.id);
      n++;
    }
  }

  return n;
}

// ---------- Zielbestand und Wellenbudget ----------

export function computeTargetInventory(n) {
  return Math.max(24, 10 + 6 * n);
}

export function computeWaveBudget(n, hour) {
  const isDay = hour >= 6 && hour < 20;
  if (isDay) return Math.max(6, Math.ceil(1.5 * n));
  return Math.max(2, Math.ceil(0.5 * n));
}

// ---------- Räumliche Verteilung ----------

// Ankerstädte: Flottenstandorte, Filialen und bestätigte Lieferziele.
function computeAnchorCities(state) {
  const anchors = {};
  for (const v of state.vehicles || []) {
    if (v.status === "archived") continue;
    anchors[v.locationCity] = (anchors[v.locationCity] || 0) + 2;
  }
  for (const d of state.drivers || []) {
    if (d.employmentStatus !== "employed") continue;
    anchors[d.locationCity] = (anchors[d.locationCity] || 0) + 1;
  }
  for (const b of state.branches || []) {
    anchors[b.city] = (anchors[b.city] || 0) + 3;
  }
  // Bestätigte Lieferziele aktiver Touren
  for (const trip of state.trips || []) {
    if (trip.status !== "in_progress") continue;
    const phases = trip.phases || [];
    for (let i = phases.length - 1; i >= 0; i--) {
      if (phases[i].type === "loaded_drive" || phases[i].type === "empty_drive") {
        anchors[phases[i].toCity] = (anchors[phases[i].toCity] || 0) + 1;
        break;
      }
    }
  }
  return anchors;
}

// Wählt einen Kunden gewichtet nach Flottennähe seiner Depots.
// Basisgewicht 8 stellt sicher, dass auch Kunden abseits der Flotte
// (z. B. Süd- und Westdeutschland) regelmäßig Aufträge generieren.
// Der Anker-Bonus wird auf 6 begrenzt, damit kein einzelner Kunde
// durch Rückkopplung aktiver Touren den gesamten Markt dominiert.
function pickCustomer(state, anchors, rng) {
  const weights = CUSTOMER_PROFILES.map(c => {
    let bonus = 0;
    for (const depot of c.depots) {
      if (anchors[depot]) bonus += anchors[depot];
    }
    return 8 + Math.min(bonus, 6);
  });
  return weightedPick(CUSTOMER_PROFILES, weights, rng);
}

// Wählt ein Depot des Kunden.
function pickDepot(customer, rng) {
  if (customer.depots.length === 1) return customer.depots[0];
  return customer.depots[Math.floor(rng() * customer.depots.length)];
}

// Wählt ein Ziel gewichtet nach Flottennähe und Kundenpräferenz.
function pickDestination(state, customer, fromCity, anchors, rng) {
  // 70 % Chance: bevorzugte Relation
  if (customer.preferredRelations.length > 0 && rng() < 0.7) {
    const rel = customer.preferredRelations[Math.floor(rng() * customer.preferredRelations.length)];
    if (rel[0] === fromCity) return rel[1];
    if (rel[1] === fromCity) return rel[0];
  }
  // Sonst: gewichtet nach Ankerstädten
  const cities = CITIES.filter(c => c !== fromCity);
  const weights = cities.map(c => (anchors[c] || 0) + 1);
  return weightedPick(cities, weights, rng);
}

// ---------- Preisberechnung ----------

export function computeOfferPrice(km, tons, offerType, relFactor) {
  const grundpreis = PRICE_BASE_CENTS + PRICE_PER_KM_CENTS * km + PRICE_PER_TON_CENTS * tons;
  const urgency = offerType === "express" ? EXPRESS_FACTOR : 1.00;
  const special = 1.00; // Standard: kein Spezialfaktor
  const priceCents = Math.round(grundpreis * relFactor * urgency * special);
  return priceCents;
}

// ---------- Zeitfenster ----------

function computeTimeWindows(state, m, offerType, fromCity, toCity, km, rng) {
  const driveMin = driveMinutes(km);
  const opMin = LOAD_MIN + driveMin + UNLOAD_MIN;

  // Anfahrtsweg vom nächsten Flottenstandort zur Abholung.
  // Bei weit entfernten Abholorten (z. B. München bei Flotte in Hamburg)
  // benötigen die Zeitfenster mehr Vorlaufzeit für die Leerfahrt.
  const approachMin = computeNearestApproach(state, fromCity);

  // Ruhepausen: Bei weiten Anfahrten muss der Fahrer ggf. eine oder mehrere
  // vollständige Ruhepausen (REST_MIN) einlegen. Diese Zeit muss in der
  // Lieferfrist enthalten sein, sonst wird der Auftrag von buildTourPlan
  // als unmachbar abgelehnt.
  const totalWorkMin = approachMin + opMin;
  const workBeyond = Math.max(0, totalWorkMin - WORK_BUDGET_MIN);
  const restsNeeded = workBeyond > 0 ? Math.ceil(workBeyond / WORK_BUDGET_MIN) : 0;
  const restTime = restsNeeded * REST_MIN;

  if (offerType === "express") {
    const acceptHours = EXPRESS_ACCEPT_HOURS[0] + rng() * (EXPRESS_ACCEPT_HOURS[1] - EXPRESS_ACCEPT_HOURS[0]);
    const acceptDeadline = m + Math.round(acceptHours * 60) + approachMin;
    const earliestPickup = m + 30;
    const latestLoadStart = acceptDeadline;
    const bufferMin = Math.round((EXPRESS_BUFFER_HOURS[0] + rng() * (EXPRESS_BUFFER_HOURS[1] - EXPRESS_BUFFER_HOURS[0])) * 60);
    const deliveryDeadline = Math.max(earliestPickup, m + approachMin) + opMin + restTime + bufferMin;
    return { acceptDeadline, earliestPickup, latestLoadStart, deliveryDeadline, paymentTermsDays: 0 };
  }

  if (offerType === "advance") {
    const acceptHours = ADVANCE_ACCEPT_HOURS[0] + rng() * (ADVANCE_ACCEPT_HOURS[1] - ADVANCE_ACCEPT_HOURS[0]);
    const acceptDeadline = m + Math.round(acceptHours * 60) + approachMin;
    const nextDay = Math.floor(m / 1440) * 1440 + 1440;
    const earliestPickup = nextDay + 480 + Math.floor(rng() * 240); // 08:00–12:00
    const latestLoadStart = acceptDeadline;
    const bufferMin = Math.round((NORMAL_BUFFER_HOURS[0] + rng() * (NORMAL_BUFFER_HOURS[1] - NORMAL_BUFFER_HOURS[0])) * 60);
    const deliveryDeadline = Math.max(earliestPickup, m + approachMin) + opMin + restTime + bufferMin;
    return { acceptDeadline, earliestPickup, latestLoadStart, deliveryDeadline, paymentTermsDays: 3 };
  }

  // Normal
  const acceptHours = NORMAL_ACCEPT_HOURS[0] + rng() * (NORMAL_ACCEPT_HOURS[1] - NORMAL_ACCEPT_HOURS[0]);
  let acceptDeadline = m + Math.round(acceptHours * 60) + approachMin;
  const earliestPickup = m + 60 + Math.floor(rng() * 120); // 1–3 h
  const latestLoadStart = acceptDeadline;
  const bufferMin = Math.round((NORMAL_BUFFER_HOURS[0] + rng() * (NORMAL_BUFFER_HOURS[1] - NORMAL_BUFFER_HOURS[0])) * 60);
  const deliveryDeadline = Math.max(earliestPickup, m + approachMin) + opMin + restTime + bufferMin;

  // Außerhalb Dienstzeit: Annahmefrist bis nächsten Dienstbeginn verlängern
  const hour = (m % 1440) / 60;
  if (hour < 8 || hour >= 20) {
    const nextService = hour < 8
      ? Math.floor(m / 1440) * 1440 + SERVICE_START_MIN
      : Math.floor(m / 1440) * 1440 + 1440 + SERVICE_START_MIN;
    if (acceptDeadline < nextService) acceptDeadline = nextService;
  }

  const paymentTermsDays = PAYMENT_TERMS_DAYS[Math.floor(rng() * PAYMENT_TERMS_DAYS.length)];
  return { acceptDeadline, earliestPickup, latestLoadStart, deliveryDeadline, paymentTermsDays };
}

// Berechnet die Leerfahrzeit vom nächsten Flottenstandort zur Abholstadt.
// Flottenstandorte: Fahrzeugpositionen und aktive Filialen.
function computeNearestApproach(state, fromCity) {
  const fleetCities = new Set();
  for (const v of state.vehicles || []) {
    if (v.status !== "archived") fleetCities.add(v.locationCity);
  }
  for (const b of state.branches || []) {
    if (b.status === "active") fleetCities.add(b.city);
  }
  let nearest = 0;
  for (const city of fleetCities) {
    const min = driveMinutes(getDistance(city, fromCity));
    if (nearest === 0 || min < nearest) nearest = min;
  }
  return nearest;
}

// ---------- Machbarkeitsprüfung (begrenzte Suche) ----------

// Prüft, ob mindestens ein Fahrzeug-/Fahrerpaar den Auftrag innerhalb 24 h
// abholen und pünktlich liefern könnte. Vereinfachte Prüfung ohne vollständige
// Phasenplanung – ausreichend für die Generator-Vorauswahl.
function checkOfferFeasibility(state, offer) {
  const maxPickup = state.gameTime + 48 * 60;
  const loadedKm = getDistance(offer.fromCity, offer.toCity);
  const opMin = LOAD_MIN + driveMinutes(loadedKm) + UNLOAD_MIN;

  for (const v of state.vehicles || []) {
    if (v.status === "archived" || v.condition < 20) continue;
    if (v.capacityTons < offer.tons) continue;

    const emptyKm = getDistance(v.locationCity, offer.fromCity);
    const emptyDriveMin = driveMinutes(emptyKm);
    const totalWorkMin = emptyDriveMin + opMin;

    for (const d of state.drivers || []) {
      if (d.employmentStatus !== "employed" || d.attendance === "released") continue;
      if (d.locationCity !== v.locationCity) continue;

      const avail = earliestAvailable(state, v, d);
      if (avail > maxPickup) continue;

      // Fahrzeug reist erst leer zur Abholung, dann beginnt der Ladungsprozess.
      const arriveAtPickup = avail + emptyDriveMin;
      const pickupStart = Math.max(arriveAtPickup, offer.earliestPickupMin);
      // Lieferende = Abholung + beladene Operation (die Leerfahrt ist im
      // Lieferfrist-Zeitfenster bereits über approachMin enthalten).
      const deliveryEnd = pickupStart + opMin;

      if (deliveryEnd > offer.deliveryDeadlineMin) continue;

      // Fahrerzeit-Prüfung mit Ruhepausen: Arbeitsbudget kann durch
      // vollständige Ruhepausen (REST_MIN) mehrfach zurückgesetzt werden.
      const remainingWork = WORK_BUDGET_MIN - (d.workMinutesSinceRest || 0);
      if (totalWorkMin <= remainingWork) return true;
      const workBeyond = totalWorkMin - remainingWork;
      const restsNeeded = Math.ceil(workBeyond / WORK_BUDGET_MIN);
      // Mit n Ruhepausen: Gesamtkalenderzeit = Arbeit + n × REST_MIN.
      // Die Lieferung muss auch mit Ruhepausen rechtlich fristgerecht sein.
      const totalTimeWithRest = totalWorkMin + restsNeeded * REST_MIN;
      if (pickupStart - emptyDriveMin + totalTimeWithRest <= offer.deliveryDeadlineMin) {
        return true;
      }
    }
  }
  return false;
}

// ---------- Angebotserzeugung ----------

function makeMarketOffer(state, m) {
  const rng = () => marketRng(state);
  const anchors = computeAnchorCities(state);
  const customer = pickCustomer(state, anchors, rng);
  const fromCity = pickDepot(customer, rng);
  const toCity = pickDestination(state, customer, fromCity, anchors, rng);
  const cargo = customer.cargoTypes[Math.floor(rng() * customer.cargoTypes.length)];
  const tons = 4 + Math.floor(rng() * 9); // 4–12 t

  // Angebotsart: 60 % normal, 25 % Vorlauf, 15 % Express
  const typeRoll = rng();
  const offerType = typeRoll < 0.60 ? "normal" : typeRoll < 0.85 ? "advance" : "express";

  const km = getDistance(fromCity, toCity);
  const relFactor = relationFactor(state, fromCity, toCity);
  const paymentCents = computeOfferPrice(km, tons, offerType, relFactor);

  const tw = computeTimeWindows(state, m, offerType, fromCity, toCity, km, rng);

  const offer = {
    id: uid(state, "o"),
    customerId: customer.id,
    customer: customer.name,
    shipmentId: "S" + (state.idCounter + 1),
    fromCity, toCity, cargo, tons,
    paymentCents,
    offerType,
    relationFactor: relFactor,
    publishedAtMin: m,
    acceptDeadlineMin: tw.acceptDeadline,
    earliestPickupMin: tw.earliestPickup,
    latestLoadStartMin: tw.latestLoadStart,
    deliveryDeadlineMin: tw.deliveryDeadline,
    paymentTermsDays: tw.paymentTermsDays,
    paymentDueMin: null,
    status: "offered",
    acceptedAtMin: null, startedAtMin: null, deliveredAtMin: null, paidCents: null,
    acceptedById: null, acceptedByName: null,
    plannedById: null, plannedByName: null,
    feasible: false,
    history: [],
  };

  offer.feasible = checkOfferFeasibility(state, offer);
  return offer;
}

// ---------- Marktwelle ----------

export function generateMarketWave(state, m, log) {
  if (!state.market) migrateMarket(state);

  // 1. Abgelaufene Angebote schließen
  let expired = 0;
  for (const o of state.orders) {
    if (o.status === "offered" && o.acceptDeadlineMin <= m) {
      o.status = "expired";
      expired++;
    }
  }

  // 1b. Überfällige angenommene Aufträge als "failed" markieren.
  // Gnadenfrist: 12h nach Lieferfrist. Danach ist eine Spätlieferung
  // nicht mehr sinnvoll. Der Auftrag wird mit einer Konventionalstrafe
  // (10% der Vergütung) abgerechnet und aus dem aktiven Bestand entfernt.
  // Das verhindert, dass unzustellbare Aufträge ewig als "angenommen"
  // stehen bleiben und den Disponenten-Backlog aufblähen.
  const FAILED_GRACE_MIN = 12 * 60;
  let failed = 0;
  for (const o of state.orders) {
    if (o.status !== "angenommen") continue;
    if (o.deliveryDeadlineMin + FAILED_GRACE_MIN > m) continue;
    // Prüfen, ob der Auftrag unterwegs ist (Trip läuft noch)
    const isUnderway = (state.trips || []).some(t => t.orderId === o.id && t.status === "in_progress");
    if (isUnderway) continue;
    // Auftrag gescheitert — Konventionalstrafe 10% vom Firmenkonto
    const penalty = Math.round((o.paymentCents || 0) * 0.1);
    o.status = "failed";
    o.failedAtMin = m;
    o.failurePenaltyCents = penalty;
    if (penalty > 0) {
      if (state.company.accountCents >= penalty) {
        state.company.accountCents -= penalty;
      } else {
        const paid = state.company.accountCents;
        state.company.accountCents = 0;
        state.openCosts = state.openCosts || [];
        state.openCosts.push({
          id: "oc_" + (state.idCounter = (state.idCounter || 100) + 1),
          account: "company", cause: "Konventionalstrafe: " + o.customer,
          amountCents: penalty - paid, refId: "failed:" + o.id, createdAtMin: m,
        });
      }
      state.bookings = state.bookings || [];
      state.bookings.push({ min: m, cause: "Konventionalstrafe: " + o.customer, amountCents: -penalty, account: "company", refId: "failed:" + o.id });
    }
    state.stats = state.stats || {};
    state.stats.failedOrders = (state.stats.failedOrders || 0) + 1;
    state.stats.consecutiveTimely = 0;
    state.private = state.private || {};
    state.private.relationship = Math.max(0, (state.private.relationship || 0) - 2);
    state.private.happiness = Math.max(0, (state.private.happiness || 0) - 1);
    pushEvent(state, {
      type: "order_failed", gameTime: m, isSystem: true,
      orderIds: [o.id],
      details: {
        customer: o.customer, fromCity: o.fromCity, toCity: o.toCity,
        cargo: o.cargo, tons: o.tons, paymentCents: o.paymentCents,
        penaltyCents: penalty, deliveryDeadlineMin: o.deliveryDeadlineMin,
      },
      dedupKey: "order_failed:" + o.id,
    });
    failed++;
  }

  // 2. N, T, B berechnen
  const n = computePlanableFleetN(state);
  const t = computeTargetInventory(n);
  const hour = (m % 1440) / 60;
  const b = computeWaveBudget(n, hour);

  // 3. Offene Angebote zählen
  const o = state.orders.filter(ord => ord.status === "offered").length;

  // 4. Neue Angebote erzeugen
  const newCount = Math.min(b, Math.max(0, t - o));
  let generated = 0;
  let feasible = 0;
  for (let i = 0; i < newCount; i++) {
    const offer = makeMarketOffer(state, m);
    state.orders.push(offer);
    generated++;
    if (offer.feasible) feasible++;
  }

  // 5. Statistik aktualisieren
  state.market.stats.wavesProcessed = (state.market.stats.wavesProcessed || 0) + 1;
  state.market.stats.offersGenerated = (state.market.stats.offersGenerated || 0) + generated;
  state.market.stats.offersExpired = (state.market.stats.offersExpired || 0) + expired;
  state.market.stats.ordersFailed = (state.market.stats.ordersFailed || 0) + failed;
  state.market.stats.lastN = n;
  state.market.stats.lastT = t;
  state.market.stats.lastB = b;
  state.market.stats.lastO = state.orders.filter(ord => ord.status === "offered").length;
  state.market.stats.feasibleCount = (state.market.stats.feasibleCount || 0) + feasible;
  state.market.stats.feasibilityChecked = (state.market.stats.feasibilityChecked || 0) + generated;
  state.market.stats.lastWaveMin = m;
  state.market.nextWaveMin = m + MARKET_WAVE_INTERVAL;

  log.push({ type: "market_wave", atMin: m, n, t, b, o, generated, feasible, expired, failed });

  // ---------- Gefahrgut-Wellen (Auftrag 32) ----------
  generateDgWave(state, m, log);
}

// Gefahrgut-Angebote erzeugen, basierend auf verfügbarer Spezialflotte.
// N_P = Versandstück-Paarungen, N_T = Tank-Paarungen.
// Ziel: max(4, 4×N_P) Versandstücke, max(3, 4×N_T) Tank.
// Ohne Paarung: 2 Versandstück-Vorschauen, 1 Tank-Vorschau (Marktvorschau).
export function generateDgWave(state, m, log) {
  const { nP, nT } = computeDgFleetN(state);

  const openDg = state.orders.filter(o => o.isDangerousGoods && o.status === "offered");
  const openVs = openDg.filter(o => o.dgTransportType === "versandstueck").length;
  const openTk = openDg.filter(o => o.dgTransportType === "tank").length;

  const targetVs = nP > 0 ? Math.max(4, 4 * nP) : 2;
  const targetTk = nT > 0 ? Math.max(3, 4 * nT) : 1;

  // Begrenzte Nachfüllung pro Welle (max 2 pro Welle)
  const fillVs = Math.min(2, Math.max(0, targetVs - openVs));
  const fillTk = Math.min(1, Math.max(0, targetTk - openTk));

  const rng = () => marketRng(state);
  const vsProfiles = DG_PROFILES.filter(p => p.transportType === "versandstueck");
  const tkProfiles = DG_PROFILES.filter(p => p.transportType === "tank");

  let dgGenerated = 0;
  for (let i = 0; i < fillVs; i++) {
    const profile = vsProfiles[Math.floor(rng() * vsProfiles.length)];
    const offer = makeDgOffer(state, profile, m, rng);
    state.orders.push(offer);
    dgGenerated++;
  }
  for (let i = 0; i < fillTk; i++) {
    const profile = tkProfiles[Math.floor(rng() * tkProfiles.length)];
    const offer = makeDgOffer(state, profile, m, rng);
    state.orders.push(offer);
    dgGenerated++;
  }

  if (dgGenerated > 0) {
    log.push({ type: "dg_wave", atMin: m, nP, nT, targetVs, targetTk, openVs, openTk, dgGenerated });
  }
}

// ---------- Erstmals Befüllung ----------

export function fillInitialMarket(state) {
  if (!state.market) migrateMarket(state);
  const n = computePlanableFleetN(state);
  const t = computeTargetInventory(n);
  const openCount = state.orders.filter(o => o.status === "offered").length;
  const needed = Math.max(0, t - openCount);
  let feasible = 0;
  for (let i = 0; i < needed; i++) {
    const offer = makeMarketOffer(state, state.gameTime);
    state.orders.push(offer);
    if (offer.feasible) feasible++;
  }
  state.market.stats = state.market.stats || {};
  state.market.stats.offersGenerated = (state.market.stats.offersGenerated || 0) + needed;
  state.market.stats.lastN = n;
  state.market.stats.lastT = t;
  state.market.stats.lastO = state.orders.filter(o => o.status === "offered").length;
  state.market.stats.feasibleCount = (state.market.stats.feasibleCount || 0) + feasible;
  state.market.stats.feasibilityChecked = (state.market.stats.feasibilityChecked || 0) + needed;
}

// ---------- Markt-Statistik für UI ----------

export function getMarketStats(state) {
  if (!state.market) migrateMarket(state);
  const n = computePlanableFleetN(state);
  const t = computeTargetInventory(n);
  const openOffers = state.orders.filter(o => o.status === "offered").length;
  const hour = (state.gameTime % 1440) / 60;
  const b = computeWaveBudget(n, hour);
  const nextWave = state.market.nextWaveMin || (Math.floor(state.gameTime / 60) * 60 + 60);
  return {
    n, t, b, openOffers,
    nextWaveMin: nextWave,
    nextWaveLabel: formatGameTime(nextWave),
    stats: state.market.stats || {},
  };
}

// ---------- Migration ----------

export function migrateMarket(state) {
  if (!state.market) {
    state.market = {
      version: MARKET_VERSION,
      nextWaveMin: Math.floor((state.gameTime || 480) / 60) * 60 + 60,
      rngSeed: 7654321,
      stats: {
        wavesProcessed: 0, offersGenerated: 0, offersExpired: 0,
        lastN: 0, lastT: 0, lastB: 0, lastO: 0,
        feasibleCount: 0, feasibilityChecked: 0,
        lastWaveMin: null,
      },
      customerRelations: {},
    };
  }
  if (!state.market.stats) {
    state.market.stats = {
      wavesProcessed: 0, offersGenerated: 0, offersExpired: 0,
      lastN: 0, lastT: 0, lastB: 0, lastO: 0,
      feasibleCount: 0, feasibilityChecked: 0, lastWaveMin: null,
    };
  }
  if (!state.market.customerRelations) state.market.customerRelations = {};

  // Einmalige Befüllung bei Migration auf Version 2
  if (state.market.version < MARKET_VERSION) {
    state.market.version = MARKET_VERSION;
    // Bestehende Angebote um neue Felder ergänzen
    for (const o of state.orders || []) {
      if (!o.offerType) o.offerType = "normal";
      if (!o.customerId) o.customerId = null;
      if (!o.shipmentId) o.shipmentId = o.id;
      if (o.earliestPickupMin === undefined) o.earliestPickupMin = o.acceptDeadlineMin;
      if (o.latestLoadStartMin === undefined) o.latestLoadStartMin = o.acceptDeadlineMin;
      if (o.paymentTermsDays === undefined) o.paymentTermsDays = 0;
      if (o.paymentDueMin === undefined) o.paymentDueMin = null;
      if (o.publishedAtMin === undefined) o.publishedAtMin = o.acceptDeadlineMin - 360;
      if (o.relationFactor === undefined) o.relationFactor = 1.0;
      if (o.feasible === undefined) o.feasible = true;
    }
    // Auf Zielbestand auffüllen (einmalig)
    fillInitialMarket(state);
  }
}