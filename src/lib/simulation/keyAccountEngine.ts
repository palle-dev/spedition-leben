// Großkunden-Engine für Frachtfieber.
// Premium-Kunden, die bei guter Leistung lukrative Verträge mit
// speziellen Fuhrpark-Anforderungen anbieten. Baut auf der bestehenden
// Rahmenvertrags-Logik auf — keine zweite Vertragsverwaltung.
//
// Design-Prinzipien:
// - Deterministisch: Angebote werden basierend auf Leistungsmetriken erzeugt
// - Idempotent: Wiederholte Aufrufe erzeugen keine Duplikate
// - Aufbauend: Nutzt bestehende Vertrags- und Kundenlogik
// - Spezialanforderungen fordern Fuhrpark-Flexibilität

import {
  CUSTOMER_PROFILES, CITIES, getDistance, driveMinutes,
  dayOf, formatGameTime, mulberry32,
  LOAD_MIN, UNLOAD_MIN, WORK_BUDGET_MIN, REST_MIN,
  VEHICLE_BODY_TYPES, VEHICLE_CATALOG,
} from "./gameRules.ts";
import { computeOfferPrice } from "./marketEngine.ts";
import {
  TRUST_START, STAMMKUNDE_MIN_TRANSPORTS, STAMMKUNDE_MIN_TRUST,
  CONTRACT_DURATION_DAYS, CONTRACT_DELIVERY_BUFFER_HOURS,
  getCustomerRelation, isStammkunde,
} from "./customerEngine.ts";
import { hasAdrBasic, hasAdrTank, hasDgDispatch } from "./trainingEngine.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";

// ---------- Konstanten ----------
const KEY_ACCOUNT_VERSION = 1;
const DAY_MIN = 1440;

// Großkunden-Schwellenwerte
export const KEY_ACCOUNT_MIN_TRUST = 75;
export const KEY_ACCOUNT_MIN_TIMELY_RATE = 0.85;
export const KEY_ACCOUNT_MIN_COMPLETED = 15;
export const KEY_ACCOUNT_PREMIUM_FACTOR = 1.30; // 30% Aufschlag
export const KEY_ACCOUNT_PENALTY_RATE = 0.15;  // 15% Strafe bei Fehlschlag
export const KEY_ACCOUNT_DURATION_DAYS = 14;
export const KEY_ACCOUNT_MIN_FLEET = 3;

// Großkunden-Katalog — spezielle Kunden mit hohen Anforderungen
export const KEY_ACCOUNT_PROFILES = [
  {
    id: "ka01",
    name: "Nordland Pharma GmbH",
    industry: "Pharma & Healthcare",
    contact: "Dr. Henrike Vogt",
    baseCustomerId: "c02", // Norddeutsche Feinkost als Basis (Lebensmittel-Branch)
    depots: ["Hamburg", "Bremen"],
    preferredRelations: [["Hamburg", "Bremen"], ["Bremen", "Hannover"], ["Hamburg", "Berlin"]],
    cargoTypes: ["Lebensmittel"],
    requiredBodyType: "kuehl",
    minCapacityTons: 12,
    transportsPerDay: 2,
    minFleetSize: 3,
    requiresExpress: true,
    requiresBackup: true,
    premiumFactor: 1.35,
    description: "Pharma-Logistik mit Kühlkette. Erfordert Kühlwagen, Express-Fähigkeit und Reservefahrzeuge.",
  },
  {
    id: "ka02",
    name: "Rhein-Ruhr Stahlwerke",
    industry: "Stahl & Schwerindustrie",
    contact: "Herr Bertram Kloth",
    baseCustomerId: "c09", // Nordwind Transport (Baustoffe)
    depots: ["Hannover", "Magdeburg"],
    preferredRelations: [["Hannover", "Berlin"], ["Magdeburg", "Hannover"], ["Hannover", "Hamburg"]],
    cargoTypes: ["Baustoffe", "Bauteile"],
    requiredBodyType: "kipper",
    minCapacityTons: 24,
    transportsPerDay: 2,
    minFleetSize: 4,
    requiresExpress: false,
    requiresBackup: true,
    premiumFactor: 1.25,
    description: "Schwerlast-Transporte für Stahlproduktion. Erfordert Kipper/Silo und schwere Lkw (24 t).",
  },
  {
    id: "ka03",
    name: "Ostsee-Öl Handelsgesellschaft",
    industry: "Energie & Chemie",
    contact: "Frau Marlene Sander",
    baseCustomerId: "c03", // Ostsee Frischlief (Getränke)
    depots: ["Rostock", "Kiel"],
    preferredRelations: [["Rostock", "Hamburg"], ["Kiel", "Bremen"], ["Rostock", "Berlin"]],
    cargoTypes: ["Getränke"],
    requiredBodyType: "tank",
    minCapacityTons: 12,
    transportsPerDay: 1,
    minFleetSize: 3,
    requiresExpress: false,
    requiresBackup: true,
    premiumFactor: 1.40,
    description: "Flüssigtransporte für Energie- und Chemieprodukte. Erfordert Tankwagen mit ADR-Qualifikation.",
  },
  {
    id: "ka04",
    name: "Bayern AutoLogistik",
    industry: "Automotive",
    contact: "Herr Stefan Maier",
    baseCustomerId: "c16", // Bayern Logistik
    depots: ["München", "Nürnberg"],
    preferredRelations: [["München", "Stuttgart"], ["München", "Frankfurt"], ["Nürnberg", "München"]],
    cargoTypes: ["Bauteile", "Maschinenteile"],
    requiredBodyType: null, // Standard, aber schwere Ladung
    minCapacityTons: 24,
    transportsPerDay: 2,
    minFleetSize: 4,
    requiresExpress: true,
    requiresBackup: true,
    premiumFactor: 1.30,
    description: "Just-in-Time Automobil-Logistik. Erfordert schwere Lkw, Express-Fähigkeit und hohe Zuverlässigkeit.",
  },
  {
    id: "ka05",
    name: "Hanseatische Möbel Manufaktur",
    industry: "Möbel & Einrichtung",
    contact: "Frau Christin Brandt",
    baseCustomerId: "c04", // Weser Handel (Möbel)
    depots: ["Bremen", "Hamburg"],
    preferredRelations: [["Bremen", "Hamburg"], ["Bremen", "Hannover"], ["Hamburg", "Berlin"]],
    cargoTypes: ["Möbel"],
    requiredBodyType: null,
    minCapacityTons: 12,
    transportsPerDay: 3,
    minFleetSize: 5,
    requiresExpress: false,
    requiresBackup: true,
    premiumFactor: 1.20,
    description: "Premium-Möbel-Lieferung mit hohem Volumen. Erfordert große Flotte und sorgfältige Handhabung.",
  },
];

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function kaRng(state) {
  if (!state.keyAccounts) migrateKeyAccounts(state);
  const r = mulberry32(state.keyAccounts.rngSeed >>> 0);
  const v = r();
  state.keyAccounts.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}

// ---------- Migration ----------
export function migrateKeyAccounts(state) {
  if (!state.keyAccounts || state.keyAccounts.version !== KEY_ACCOUNT_VERSION) {
    state.keyAccounts = {
      version: KEY_ACCOUNT_VERSION,
      unlockedAccounts: [],
      activeContracts: [],
      rngSeed: 5512347,
      lastCheckMin: 0,
    };
  }
  if (!state.keyAccounts.unlockedAccounts) state.keyAccounts.unlockedAccounts = [];
  if (!state.keyAccounts.activeContracts) state.keyAccounts.activeContracts = [];
  if (state.keyAccounts.rngSeed == null) state.keyAccounts.rngSeed = 5512347;
}

// ---------- Leistungsbewertung ----------
// Prüft, ob der Spieler die Voraussetzungen für einen Großkunden erfüllt.
export function evaluateKeyAccountEligibility(state, kaProfile) {
  const reasons = [];
  let eligible = true;

  // Basis-Kundenbeziehung prüfen
  const baseRelation = getCustomerRelation(state, kaProfile.baseCustomerId);
  if (!baseRelation) {
    reasons.push("Keine bestehende Kundenbeziehung als Basis");
    eligible = false;
  } else {
    if (baseRelation.trust < KEY_ACCOUNT_MIN_TRUST) {
      reasons.push(`Vertrauen zu niedrig (mindestens ${KEY_ACCOUNT_MIN_TRUST}, aktuell ${baseRelation.trust})`);
      eligible = false;
    }
    if (baseRelation.completedTransports < KEY_ACCOUNT_MIN_COMPLETED) {
      reasons.push(`Zu wenige abgeschlossene Transporte (mindestens ${KEY_ACCOUNT_MIN_COMPLETED}, aktuell ${baseRelation.completedTransports})`);
      eligible = false;
    }
    const timelyRate = baseRelation.completedTransports > 0
      ? baseRelation.timelyTransports / baseRelation.completedTransports
      : 0;
    if (timelyRate < KEY_ACCOUNT_MIN_TIMELY_RATE) {
      reasons.push(`Pünktlichkeitsrate zu niedrig (mindestens ${Math.round(KEY_ACCOUNT_MIN_TIMELY_RATE * 100)}%, aktuell ${Math.round(timelyRate * 100)}%)`);
      eligible = false;
    }
  }

  // Fuhrpark-Anforderungen prüfen
  const vehicles = (state.vehicles || []).filter(v =>
    v.status !== "archived" && v.status !== "sold" && v.condition >= 20
  );

  if (vehicles.length < kaProfile.minFleetSize) {
    reasons.push(`Flotte zu klein (mindestens ${kaProfile.minFleetSize} Fahrzeuge, aktuell ${vehicles.length})`);
    eligible = false;
  }

  // Kapazitätsanforderung
  const capableVehicles = vehicles.filter(v => v.capacityTons >= kaProfile.minCapacityTons);
  if (capableVehicles.length < 2) {
    reasons.push(`Mindestens 2 Fahrzeuge mit ${kaProfile.minCapacityTons} t Kapazität erforderlich`);
    eligible = false;
  }

  // Aufbau-Anforderung
  if (kaProfile.requiredBodyType) {
    const bodyTypeLabel = VEHICLE_BODY_TYPES[kaProfile.requiredBodyType].label;
    const matchingVehicles = vehicles.filter(v => v.bodyType === kaProfile.requiredBodyType);
    if (matchingVehicles.length < 2) {
      reasons.push(`Mindestens 2 Fahrzeuge mit Aufbau "${bodyTypeLabel}" erforderlich`);
      eligible = false;
    }
  }

  // Express-Anforderung
  if (kaProfile.requiresExpress) {
    const expressCapable = vehicles.filter(v =>
      v.capacityTons >= 12 && v.condition >= 50
    );
    if (expressCapable.length < 1) {
      reasons.push("Mindestens 1 einsatzfähiges Fahrzeug für Express-Transporte erforderlich");
      eligible = false;
    }
  }

  // Backup-Anforderung
  if (kaProfile.requiresBackup) {
    const freeVehicles = vehicles.filter(v => v.status === "free");
    if (freeVehicles.length < 1) {
      reasons.push("Mindestens 1 freies Reserve-Fahrzeug erforderlich");
      eligible = false;
    }
  }

  // Fahrer-Anforderung
  const drivers = (state.drivers || []).filter(d => isActivelyEmployed(d) && d.attendance !== "released");
  if (drivers.length < kaProfile.minFleetSize) {
    reasons.push(`Zu wenige aktive Fahrer (mindestens ${kaProfile.minFleetSize}, aktuell ${drivers.length})`);
    eligible = false;
  }

  return { eligible, reasons };
}

// ---------- Großkunden-Entsperrung ----------
// Prüft bei jedem Tageswechsel, ob neue Großkunden freigeschaltet werden.
export function checkKeyAccountUnlocks(state, m, log) {
  migrateKeyAccounts(state);
  if (state.keyAccounts.lastCheckMin && m - state.keyAccounts.lastCheckMin < DAY_MIN) return;
  state.keyAccounts.lastCheckMin = m;

  for (const ka of KEY_ACCOUNT_PROFILES) {
    // Bereits freigeschaltet?
    if (state.keyAccounts.unlockedAccounts.includes(ka.id)) continue;

    // Bereits aktiver Vertrag?
    const hasActive = state.keyAccounts.activeContracts.some(c =>
      c.kaProfileId === ka.id && (c.status === "offered" || c.status === "active")
    );
    if (hasActive) {
      state.keyAccounts.unlockedAccounts.push(ka.id);
      continue;
    }

    const eligibility = evaluateKeyAccountEligibility(state, ka);
    if (!eligibility.eligible) continue;

    // Freischaltung + Vertragsangebot erzeugen
    state.keyAccounts.unlockedAccounts.push(ka.id);
    createKeyAccountOffer(state, ka, m, log);
  }
}

// ---------- Vertragsangebot erstellen ----------
function createKeyAccountOffer(state, kaProfile, m, log) {
  // Relation auswählen (erste bevorzugte)
  const relation = kaProfile.preferredRelations[0];
  const fromCity = relation[0];
  const toCity = relation[1];
  const cargo = kaProfile.cargoTypes[0];
  const tons = kaProfile.minCapacityTons;
  const transportsPerDay = kaProfile.transportsPerDay;

  // Preisberechnung: Basispreis × Premium-Faktor
  const km = getDistance(fromCity, toCity);
  const basePrice = computeOfferPrice(km, tons, "normal", 1.0);
  const paymentPerTransportCents = Math.round(basePrice * kaProfile.premiumFactor);

  // Zeitplan
  const startMin = (Math.floor(m / DAY_MIN) + 2) * DAY_MIN; // Übernächster Tag
  const endMin = startMin + KEY_ACCOUNT_DURATION_DAYS * DAY_MIN;

  // Lieferfenster
  const driveMin = driveMinutes(km);
  const opMin = LOAD_MIN + driveMin + UNLOAD_MIN;
  const deliveryBufferMin = CONTRACT_DELIVERY_BUFFER_HOURS * 60;

  // Strafe bei Fehlschlag
  const penaltyCentsPerFailure = Math.round(paymentPerTransportCents * KEY_ACCOUNT_PENALTY_RATE);

  const contract = {
    id: uid(state, "kac"),
    kaProfileId: kaProfile.id,
    kaProfileName: kaProfile.name,
    customerId: kaProfile.baseCustomerId,
    customerName: kaProfile.name,
    contact: kaProfile.contact,
    fromCity, toCity, cargo, tons,
    transportsPerDay,
    paymentPerTransportCents,
    premiumFactor: kaProfile.premiumFactor,
    startMin,
    endMin,
    startDay: dayOf(startMin),
    endDay: dayOf(endMin),
    deliveryBufferMin,
    driveMin,
    opMin,
    requiresDg: false,
    minCapacityTons: tons,
    requiredBodyType: kaProfile.requiredBodyType,
    minFleetSize: kaProfile.minFleetSize,
    requiresExpress: kaProfile.requiresExpress,
    requiresBackup: kaProfile.requiresBackup,
    penaltyCentsPerFailure,
    volumeCommitment: transportsPerDay * KEY_ACCOUNT_DURATION_DAYS,
    status: "offered",
    offerCreatedAtMin: m,
    acceptedAtMin: null,
    generatedCount: 0,
    deliveredCount: 0,
    timelyCount: 0,
    lateCount: 0,
    failedCount: 0,
    cancelledCount: 0,
    revenueCents: 0,
    penaltyCents: 0,
    lastDayGenerated: 0,
    orderIds: [],
    evaluatedAtMin: null,
    earlyTerminatedAtMin: null,
    isKeyAccount: true,
  };

  state.keyAccounts.activeContracts.push(contract);

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Großkunden-Angebot: " + kaProfile.name,
    body: `${kaProfile.name} (${kaProfile.industry}) bietet Ihnen einen Premium-Rahmenvertrag an.\n\n` +
      `Ansprechpartner: ${kaProfile.contact}\n` +
      `Relation: ${fromCity} → ${toCity}\n` +
      `Fracht: ${cargo}, ${tons} t\n` +
      `Transporte pro Tag: ${transportsPerDay}\n` +
      `Laufzeit: Tag ${contract.startDay} bis Tag ${contract.endDay} (${KEY_ACCOUNT_DURATION_DAYS} Tage)\n\n` +
      `Vergütung: ${(paymentPerTransportCents / 100).toFixed(2)} € pro Transport (Premium: +${Math.round((kaProfile.premiumFactor - 1) * 100)}%)\n` +
      `Geplanter Gesamtumsatz: ${((paymentPerTransportCents * transportsPerDay * KEY_ACCOUNT_DURATION_DAYS) / 100).toFixed(2)} €\n\n` +
      `Spezialanforderungen:\n` +
      (kaProfile.requiredBodyType ? `· Aufbau: ${VEHICLE_BODY_TYPES[kaProfile.requiredBodyType].label}\n` : "") +
      `· Mindestflotte: ${kaProfile.minFleetSize} Fahrzeuge\n` +
      (kaProfile.requiresExpress ? "· Express-Fähigkeit erforderlich\n" : "") +
      (kaProfile.requiresBackup ? "· Reservefahrzeug erforderlich\n" : "") +
      `· Strafe bei Fehlschlag: ${(penaltyCentsPerFailure / 100).toFixed(2)} € pro Transport\n\n` +
      `Ihre bisherige Leistung hat diesen Kunden überzeugt. Das Angebot steht in der Großkunden-Übersicht bereit.`,
    gameTime: m, category: "operations", priority: "high",
    linkedRefs: { type: "key_account_contract", id: contract.id },
    dedupKey: `ka_offer:${contract.id}`,
  });

  pushEvent(state, {
    type: "key_account_offer",
    gameTime: m, isSystem: true,
    details: {
      contractId: contract.id, kaProfileId: kaProfile.id,
      kaProfileName: kaProfile.name, fromCity, toCity,
      paymentPerTransportCents, transportsPerDay,
    },
    dedupKey: `ka_offer:${contract.id}`,
  });

  log.push({ type: "key_account_offer", contract: contract.id, kaProfile: kaProfile.id, atMin: m });
}

// ---------- Vertragsannahme ----------
export function acceptKeyAccountContract(state, contractId) {
  migrateKeyAccounts(state);
  const contract = state.keyAccounts.activeContracts.find(c => c.id === contractId);
  if (!contract) throw new Error("Großkunden-Vertrag nicht gefunden.");
  if (contract.status !== "offered") throw new Error("Vertrag ist nicht mehr verfügbar.");

  // Erneute Eignungsprüfung
  const kaProfile = KEY_ACCOUNT_PROFILES.find(p => p.id === contract.kaProfileId);
  if (!kaProfile) throw new Error("Großkunden-Profil nicht gefunden.");
  const eligibility = evaluateKeyAccountEligibility(state, kaProfile);
  if (!eligibility.eligible) {
    throw new Error("Voraussetzungen nicht mehr erfüllt:\n" + eligibility.reasons.join("\n"));
  }

  contract.status = "active";
  contract.acceptedAtMin = state.gameTime;

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Großkunden-Vertrag abgeschlossen: " + contract.kaProfileName,
    body: `Der Premium-Rahmenvertrag mit ${contract.kaProfileName} wurde abgeschlossen.\n\n` +
      `Relation: ${contract.fromCity} → ${contract.toCity}\n` +
      `Vergütung: ${(contract.paymentPerTransportCents / 100).toFixed(2)} € pro Transport\n` +
      `Transporte pro Tag: ${contract.transportsPerDay}\n` +
      `Laufzeit: Tag ${contract.startDay} bis Tag ${contract.endDay}\n\n` +
      `Die vereinbarten Transporte erscheinen automatisch in der Auftragsliste.\n` +
      `Achtung: Bei Fehlschlägen fallen Strafgebühren von ${(contract.penaltyCentsPerFailure / 100).toFixed(2)} € pro Transport an.`,
    gameTime: state.gameTime, category: "operations", priority: "high",
    linkedRefs: { type: "key_account_contract", id: contract.id },
    dedupKey: `ka_accepted:${contract.id}`,
  });

  pushEvent(state, {
    type: "key_account_accepted",
    gameTime: state.gameTime, isSystem: true,
    details: { contractId: contract.id, kaProfileName: contract.kaProfileName },
    dedupKey: `ka_accepted:${contract.id}`,
  });

  return { ok: true, contract };
}

// ---------- Vorzeitige Beendigung ----------
export function terminateKeyAccountContract(state, contractId) {
  migrateKeyAccounts(state);
  const contract = state.keyAccounts.activeContracts.find(c => c.id === contractId);
  if (!contract) throw new Error("Großkunden-Vertrag nicht gefunden.");
  if (contract.status !== "active") throw new Error("Nur aktive Verträge können beendet werden.");

  contract.status = "terminated";
  contract.earlyTerminatedAtMin = state.gameTime;

  // Nicht-disponierte Aufträge stornieren
  for (const oid of contract.orderIds || []) {
    const o = state.orders.find(x => x.id === oid);
    if (!o) continue;
    if (o.status === "angenommen") {
      o.status = "storniert";
      o.deliveredAtMin = state.gameTime;
      o.history = o.history || [];
      o.history.push({ type: "ka_contract_terminated_cancelled", min: state.gameTime, reason: "Großkunden-Vertrag beendet" });
      if (o.reservedByTourId) o.reservedByTourId = null;
      contract.cancelledCount++;
    }
  }

  // Vertrauensverlust beim Basis-Kunden
  const baseRelation = getCustomerRelation(state, contract.customerId);
  if (baseRelation) {
    baseRelation.trust = clamp(baseRelation.trust - 10, 0, 100);
  }

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Großkunden-Vertrag beendet: " + contract.kaProfileName,
    body: `Der Premium-Vertrag mit ${contract.kaProfileName} wurde vorzeitig beendet.\n\n` +
      `Bereits angenommene Aufträge bleiben bestehen.\n` +
      `Das Vertrauen des Basis-Kunden wurde um 10 Punkte gemindert.\n\n` +
      `Eine vorzeitige Beendigung kann zukünftige Großkunden-Angebote erschweren.`,
    gameTime: state.gameTime, category: "operations", priority: "high",
    linkedRefs: { type: "key_account_contract", id: contract.id },
    dedupKey: `ka_terminated:${contract.id}`,
  });

  pushEvent(state, {
    type: "key_account_terminated",
    gameTime: state.gameTime, isSystem: true,
    details: { contractId: contract.id, kaProfileName: contract.kaProfileName },
    dedupKey: `ka_terminated:${contract.id}`,
  });

  return { ok: true, contract };
}

// ---------- Tägliche Auftragsgenerierung ----------
export function processKeyAccountDay(state, m, log) {
  migrateKeyAccounts(state);
  const day = dayOf(m);

  for (const contract of state.keyAccounts.activeContracts) {
    if (contract.status !== "active") continue;
    if (day < contract.startDay || day > contract.endDay) continue;
    if (contract.lastDayGenerated >= day) continue;

    for (let n = 1; n <= contract.transportsPerDay; n++) {
      const orderId = contract.id + ":d" + day + ":n" + n;
      if (state.orders.some(o => o.id === orderId)) continue;

      const dayStart = (day - 1) * DAY_MIN;
      const deliveryDeadline = dayStart + 480 + contract.opMin + contract.deliveryBufferMin;

      const order = {
        id: orderId,
        customerId: contract.customerId,
        customer: contract.kaProfileName,
        shipmentId: "KA" + orderId,
        fromCity: contract.fromCity,
        toCity: contract.toCity,
        cargo: contract.cargo,
        tons: contract.tons,
        paymentCents: contract.paymentPerTransportCents,
        offerType: "contract",
        relationFactor: 1.0,
        publishedAtMin: m,
        acceptDeadlineMin: null,
        earliestPickupMin: dayStart + 480,
        latestLoadStartMin: Math.min(dayStart + 960, deliveryDeadline - contract.opMin),
        windowVersion: 2,
        deliveryDeadlineMin: deliveryDeadline,
        paymentTermsDays: 0,
        paymentDueMin: null,
        status: "angenommen",
        acceptedAtMin: m,
        startedAtMin: null,
        deliveredAtMin: null,
        paidCents: null,
        acceptedById: "key_account",
        acceptedByName: "Großkunden-Vertrag",
        plannedById: null,
        plannedByName: null,
        feasible: true,
        history: [{ type: "ka_contract_generated", min: m, actor: "key_account", details: { contractId: contract.id, day, transportNo: n } }],
        isContractOrder: true,
        isKeyAccountOrder: true,
        keyAccountContractId: contract.id,
        contractId: contract.id,
        contractDay: day,
        contractTransportNo: n,
        requiredBodyType: contract.requiredBodyType,
        penaltyCentsPerFailure: contract.penaltyCentsPerFailure,
      };
      state.orders.push(order);
      contract.orderIds.push(orderId);
      contract.generatedCount++;
      log.push({ type: "ka_order_generated", contract: contract.id, order: orderId, day, transportNo: n, atMin: m });
    }

    contract.lastDayGenerated = day;
  }
}

// ---------- Auftragsabschluss-Tracking ----------
// Wird bei Lieferung oder Fehlschlag eines Großkunden-Auftrags aufgerufen.
export function recordKeyAccountOrderOutcome(state, order, outcome, m, paymentCents) {
  if (!order.isKeyAccountOrder) return;
  migrateKeyAccounts(state);
  const contract = state.keyAccounts.activeContracts.find(c => c.id === order.keyAccountContractId);
  if (!contract) return;

  if (outcome === "timely") {
    contract.timelyCount++;
    contract.deliveredCount++;
    if (paymentCents) contract.revenueCents += paymentCents;
  } else if (outcome === "late") {
    contract.lateCount++;
    contract.deliveredCount++;
    if (paymentCents) contract.revenueCents += paymentCents;
    // Strafe bei Verspätung (halbe Strafe)
    const penalty = Math.round(contract.penaltyCentsPerFailure * 0.5);
    contract.penaltyCents += penalty;
  } else if (outcome === "failed" || outcome === "cancelled") {
    contract.failedCount++;
    // Volle Strafe bei Fehlschlag
    contract.penaltyCents += contract.penaltyCentsPerFailure;
  }
}

// ---------- Vertragsauswertung ----------
export function evaluateKeyAccountContracts(state, m, log) {
  migrateKeyAccounts(state);

  for (const contract of state.keyAccounts.activeContracts) {
    if (contract.status !== "active" && contract.status !== "terminated") continue;
    if (m < contract.endMin) continue;
    if (contract.evaluatedAtMin !== null) continue;

    // Nicht-disponierte Aufträge als expired markieren
    for (const oid of contract.orderIds) {
      const o = state.orders.find(x => x.id === oid);
      if (!o) continue;
      if (o.status === "angenommen" && o.deliveryDeadlineMin < m) {
        o.status = "expired";
        o.deliveredAtMin = m;
        o.history = o.history || [];
        o.history.push({ type: "ka_contract_expired", min: m, reason: "Nicht disponiert vor Vertragsende" });
        contract.failedCount++;
        contract.penaltyCents += contract.penaltyCentsPerFailure;
        log.push({ type: "ka_order_expired", contract: contract.id, order: oid, atMin: m });
      }
    }

    // Prüfen, ob alle Aufträge einen Endzustand erreicht haben
    const doneStatuses = new Set(["geliefert", "failed", "storniert", "expired"]);
    const allDone = contract.orderIds.every(oid => {
      const o = state.orders.find(x => x.id === oid);
      return !o || doneStatuses.has(o.status);
    });
    if (!allDone) continue;

    contract.evaluatedAtMin = m;
    contract.status = "completed";

    const totalTransports = contract.transportsPerDay * KEY_ACCOUNT_DURATION_DAYS;
    const successRate = totalTransports > 0 ? (contract.deliveredCount / totalTransports * 100).toFixed(0) : 0;
    const netRevenue = contract.revenueCents - contract.penaltyCents;

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Großkunden-Vertrag abgeschlossen: " + contract.kaProfileName,
      body: `Der Premium-Vertrag mit ${contract.kaProfileName} wurde ausgewertet.\n\n` +
        `Vereinbarte Transporte: ${totalTransports}\n` +
        `Pünktlich geliefert: ${contract.timelyCount}\n` +
        `Verspätet geliefert: ${contract.lateCount}\n` +
        `Gescheitert: ${contract.failedCount}\n` +
        `Erfüllungsquote: ${successRate}%\n\n` +
        `Bruttoumsatz: ${(contract.revenueCents / 100).toFixed(2)} €\n` +
        `Strafgebühren: -${(contract.penaltyCents / 100).toFixed(2)} €\n` +
        `Nettoumsatz: ${(netRevenue / 100).toFixed(2)} €\n\n` +
        (Number(successRate) >= 85 ? "Hervorragende Leistung! Der Kunde wird weiterhin mit Ihnen zusammenarbeiten wollen." :
         Number(successRate) >= 70 ? "Solide Leistung. Der Kunde ist zufrieden, erwartet aber Verbesserungen." :
         "Die Leistung war unzureichend. Der Kunde wird zukünftige Angebote überdenken."),
      gameTime: m, category: "operations", priority: "high",
      linkedRefs: { type: "key_account_contract", id: contract.id },
      dedupKey: `ka_completed:${contract.id}`,
    });

    pushEvent(state, {
      type: "key_account_completed",
      gameTime: m, isSystem: true,
      details: {
        contractId: contract.id, kaProfileName: contract.kaProfileName,
        timelyCount: contract.timelyCount, lateCount: contract.lateCount,
        failedCount: contract.failedCount, revenueCents: contract.revenueCents,
        penaltyCents: contract.penaltyCents, successRate,
      },
      dedupKey: `ka_completed:${contract.id}`,
    });

    log.push({ type: "ka_contract_completed", contract: contract.id, atMin: m });
  }
}

// ---------- UI-Hilfsfunktionen ----------
export function getKeyAccountOverview(state) {
  migrateKeyAccounts(state);

  const unlocked = KEY_ACCOUNT_PROFILES.filter(ka =>
    state.keyAccounts.unlockedAccounts.includes(ka.id)
  );

  const activeContracts = state.keyAccounts.activeContracts.filter(c =>
    c.status === "active" || c.status === "offered"
  );

  const completedContracts = state.keyAccounts.activeContracts.filter(c =>
    c.status === "completed" || c.status === "terminated"
  );

  // Verfügbare (noch nicht freigeschaltete) Großkunden mit Eignungs-Check
  const available = KEY_ACCOUNT_PROFILES.filter(ka =>
    !state.keyAccounts.unlockedAccounts.includes(ka.id)
  ).map(ka => {
    const eligibility = evaluateKeyAccountEligibility(state, ka);
    return {
      id: ka.id,
      name: ka.name,
      industry: ka.industry,
      description: ka.description,
      premiumFactor: ka.premiumFactor,
      eligible: eligibility.eligible,
      missingRequirements: eligibility.reasons,
    };
  });

  return {
    unlockedCount: unlocked.length,
    activeContracts,
    completedContracts,
    availableProfiles: available,
    totalProfiles: KEY_ACCOUNT_PROFILES.length,
  };
}

export function getKeyAccountContractDetails(state, contractId) {
  migrateKeyAccounts(state);
  const contract = state.keyAccounts.activeContracts.find(c => c.id === contractId);
  if (!contract) return null;

  const kaProfile = KEY_ACCOUNT_PROFILES.find(p => p.id === contract.kaProfileId);
  const baseRelation = getCustomerRelation(state, contract.customerId);

  // Fuhrpark-Eignung erneut prüfen (nur für offene Angebote)
  let eligibility = null;
  if (contract.status === "offered" && kaProfile) {
    eligibility = evaluateKeyAccountEligibility(state, kaProfile);
  }

  return {
    contract,
    kaProfile,
    baseRelation,
    eligibility,
  };
}