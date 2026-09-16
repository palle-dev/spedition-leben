// Akquise- und Verhandlungs-Engine für FERNWERK.
// Gezielte Kundenansprache, begrenzte Ausschreibungen, nachvollziehbare
// Angebotskalkulation, Bewertung und Vertragsverhandlungen.
//
// Baut auf vorhandenen Kundenprofilen, Beziehungen, Rahmenverträgen und
// Kalkulationen auf. Erstellt keine zweite Vertragsverwaltung — Zuschläge
// erzeugen befristete Vertragsangebote über die vorhandene Vertragslogik.
//
// Design-Prinzipien:
// - Deterministisch: Konkurrenzangebote werden einmalig erzeugt und gespeichert
// - Idempotent: Wiederholte Aufrufe erzeugen keine zusätzlichen Angebote
// - Ereignisgesteuert: Fristen und Entscheidungen als gezielte Ereignisse
// - Eindeutige Preisquelle: paymentPerTransportCents, kein doppelter Rabatt
// - Kein Vertrauensgewinn durch Ansprache allein
// - Bestehende Verträge bleiben von neuen Verhandlungen unberührt

import {
  CUSTOMER_PROFILES, getDistance, driveMinutes,
  dayOf, formatGameTime, mulberry32,
  LOAD_MIN, UNLOAD_MIN,
} from "./gameRules.ts";
import { computeOfferPrice } from "./marketEngine.ts";
import {
  TRUST_START, STAMMKUNDE_MIN_TRANSPORTS, STAMMKUNDE_MIN_TRUST,
  CONTRACT_DURATION_DAYS, CONTRACT_DELIVERY_BUFFER_HOURS,
  getCustomerRelation, isStammkunde, generateContractOffer,
} from "./customerEngine.ts";
import { hasAdrBasic, hasAdrTank, hasDgDispatch } from "./trainingEngine.ts";
import { DG_PROFILES, getDgProfile } from "./dangerousGoodsEngine.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";

// ---------- Konstanten ----------
const ACQUISITION_VERSION = 1;
const DAY_MIN = 1440;
const OUTREACH_COOLDOWN_DAYS = 7;
const OUTREACH_COOLDOWN_MIN = OUTREACH_COOLDOWN_DAYS * DAY_MIN;
const MAX_OPEN_TENDERS = 3;
const MAX_NEGOTIATION_ROUNDS = 2;

// Ausschreibungs-Zeitplan (Minuten)
const TENDER_OFFER_DEADLINE_HOURS = 48;    // 2 Tage zur Angebotsabgabe
const TENDER_DECISION_DELAY_HOURS = 24;   // 1 Tag zwischen Frist und Entscheidung
const TENDER_PREP_DAYS = 2;                // Vorbereitungstage vor Vertragsbeginn

// Probeauftrag-Parameter
const TRIAL_ORDER_ACCEPT_HOURS = 12;
const TRIAL_ORDER_BUFFER_HOURS = 4;

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function customerById(customerId) {
  return CUSTOMER_PROFILES.find(c => c.id === customerId) || null;
}

// Schätzt die Anfahrtzeit zum Abholort (Minuten) — vereinfacht:
// 0 wenn ein Fahrzeug dort steht, sonst Fahrtzeit vom nächsten Fahrzeug.
function estimateApproachMin(state, fromCity) {
  const vehicles = (state.vehicles || []).filter(v =>
    v.status === "free" && v.condition >= 20
  );
  // Fahrzeug am Abholort?
  if (vehicles.some(v => v.locationCity === fromCity)) return 0;
  // Nächstes Fahrzeug: Anfahrtzeit schätzen
  let minApproach = Infinity;
  for (const v of vehicles) {
    if (v.locationCity === fromCity) return 0;
    const dist = getDistance(v.locationCity, fromCity);
    const approach = driveMinutes(dist);
    if (approach < minApproach) minApproach = approach;
  }
  return minApproach === Infinity ? 480 : minApproach; // max 8h Fallback
}

// Deterministischer Zufall für Akquise (unabhängig vom Haupt-RNG)
function acqRng(state) {
  if (!state.acquisition) migrateAcquisition(state);
  const r = mulberry32(state.acquisition.rngSeed >>> 0);
  const v = r();
  state.acquisition.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}

// ---------- Migration ----------
export function migrateAcquisition(state) {
  if (!state.acquisition || state.acquisition.version !== ACQUISITION_VERSION) {
    state.acquisition = {
      version: ACQUISITION_VERSION,
      outreach: {},
      tenders: [],
      rngSeed: 987654321,
    };
  }
  if (!state.acquisition.outreach) state.acquisition.outreach = {};
  if (!state.acquisition.tenders) state.acquisition.tenders = [];
  if (state.acquisition.rngSeed == null) state.acquisition.rngSeed = 987654321;
}

// ---------- Bewertungskriterien-Gewichtung nach Branche ----------
// Abgeleitet aus der Kundenbranche — keine zweite Profilverwaltung.
function getEvaluationWeights(customer) {
  const ind = customer.industry.toLowerCase();
  // Zeitkritische Branchen: Zuverlässigkeit wichtiger als Preis
  if (ind.includes("lebensmittel") || ind.includes("getränke")) {
    return { price: 0.20, reliability: 0.40, relationFit: 0.10, capacity: 0.15, relationship: 0.15 };
  }
  // Preisgetriebene Branchen
  if (ind.includes("elektronik") || ind.includes("handel")) {
    return { price: 0.40, reliability: 0.25, relationFit: 0.10, capacity: 0.10, relationship: 0.15 };
  }
  // Kapazitätskritische Branchen
  if (ind.includes("baustoffe") || ind.includes("bauteile") || ind.includes("maschinenteile")) {
    return { price: 0.25, reliability: 0.20, relationFit: 0.10, capacity: 0.35, relationship: 0.10 };
  }
  // Beziehungsorientierte Branchen
  if (ind.includes("möbel") || ind.includes("textilien")) {
    return { price: 0.25, reliability: 0.25, relationFit: 0.15, capacity: 0.10, relationship: 0.25 };
  }
  // Standard: ausgewogen
  return { price: 0.30, reliability: 0.25, relationFit: 0.15, capacity: 0.15, relationship: 0.15 };
}

// ---------- Kundenansprache ----------

// Prüft, welche Leistungen das Unternehmen für diesen Kunden anbieten kann.
export function getOutreachFeasibility(state, customerId) {
  const customer = customerById(customerId);
  if (!customer) return null;

  const relation = getCustomerRelation(state, customerId);
  const trust = relation ? relation.trust : TRUST_START;
  const stammkunde = isStammkunde(state, customerId);

  // Verfügbare Fahrzeuge und Fahrer prüfen
  const vehicles = (state.vehicles || []).filter(v =>
    v.status !== "archived" && v.status !== "sold" && v.condition >= 20
  );
  const drivers = (state.drivers || []).filter(d =>
    isActivelyEmployed(d) && d.attendance !== "released"
  );

  // Prüfe jede bevorzugte Relation auf Machbarkeit
  const relationChecks = customer.preferredRelations.map(rel => {
    const fromCity = rel[0];
    const toCity = rel[1];
    const km = getDistance(fromCity, toCity);
    const driveMin = driveMinutes(km);
    const opMin = LOAD_MIN + driveMin + UNLOAD_MIN;

    // Finde passendes Fahrzeug am Abholort oder mit Anfahrt
    const approachMin = estimateApproachMin(state, fromCity);
    const suitableVehicles = vehicles.filter(v => v.capacityTons >= 4);
    const hasVehicleAtDepot = vehicles.some(v => v.locationCity === fromCity);
    const hasDriverAtDepot = drivers.some(d => d.locationCity === fromCity);

    // Gefahrgut-Prüfung für diese Relation (nur wenn Kunde Gefahrgut-Profile hat)
    const dgRequirements = checkDgRequirements(state, customer, fromCity, toCity);

    return {
      fromCity, toCity, km, driveMin, opMin,
      approachMin,
      hasVehicleAtDepot,
      hasDriverAtDepot,
      hasSuitableVehicle: suitableVehicles.length > 0,
      dgRequirements,
      feasible: suitableVehicles.length > 0 && drivers.length > 0,
    };
  });

  // Bestehender aktiver Vertrag?
  const existingContract = (state.contracts?.contracts || []).find(c =>
    c.customerId === customerId && (c.status === "active" || c.status === "offered")
  );

  // Was kann angeboten werden?
  const canOfferTrial = relationChecks.some(r => r.feasible) && !existingContract;
  const canOfferTender = relationChecks.some(r => r.feasible) && !existingContract;
  const canOfferContract = stammkunde && !existingContract;

  // Fehlende Voraussetzungen
  const missingRequirements = [];
  if (vehicles.length === 0) missingRequirements.push("Keine geeigneten Fahrzeuge verfügbar");
  if (drivers.length === 0) missingRequirements.push("Keine aktiven Fahrer verfügbar");
  if (trust < 30) missingRequirements.push("Vertrauen zu niedrig für Geschäftskontakt");
  if (existingContract) missingRequirements.push("Bestehender Vertrag aktiv — Ansprache nicht sinnvoll");

  // Gefahrgut-Voraussetzungen prüfen
  for (const rc of relationChecks) {
    if (rc.dgRequirements.required && !rc.dgRequirements.met) {
      missingRequirements.push(`Gefahrgut-Qualifikation fehlt für ${rc.fromCity} → ${rc.toCity}`);
    }
  }

  return {
    customerId,
    customerName: customer.name,
    trust,
    stammkunde,
    relationChecks,
    canOfferTrial,
    canOfferTender,
    canOfferContract,
    existingContract,
    missingRequirements,
    hasAnyOpportunity: canOfferTrial || canOfferTender || canOfferContract,
  };
}

// Gefahrgut-Anforderungen für eine Relation prüfen
function checkDgRequirements(state, customer, fromCity, toCity) {
  // Prüfe, ob DG-Profile für diesen Kunden existieren
  const dgProfiles = DG_PROFILES.filter(p =>
    p.customer === customer.name ||
    (p.fromCity === fromCity && p.toCity === toCity)
  );

  if (dgProfiles.length === 0) {
    return { required: false, met: true, profiles: [] };
  }

  // Prüfe Qualifikationen
  const drivers = (state.drivers || []).filter(d => isActivelyEmployed(d));
  const hasAdrBasicDriver = drivers.some(d => hasAdrBasic(state, d.id));
  const hasAdrTankDriver = drivers.some(d => hasAdrTank(state, d.id));
  const hasDgDispatcher = (state.employees || []).some(e =>
    (e.role === "dispatcher" || e.role === "dispatcher_senior") &&
    hasDgDispatch(state, e.id)
  );

  const needsTank = dgProfiles.some(p => p.transportType === "tank");
  const met = hasAdrBasicDriver && (!needsTank || hasAdrTankDriver) && hasDgDispatcher;

  return { required: true, met, profiles: dgProfiles.map(p => p.id) };
}

// Ansprache initiieren — deterministisches Ergebnis
export function initiateOutreach(state, customerId) {
  migrateAcquisition(state);
  const customer = customerById(customerId);
  if (!customer) throw new Error("Kunde nicht gefunden.");

  // Bestehenden Vorgang prüfen
  const existing = state.acquisition.outreach[customerId];
  if (existing && existing.status === "active") {
    return { ok: false, reason: "Laufender Vorgang", outreach: existing };
  }
  if (existing && state.gameTime < existing.nextAllowedMin) {
    return {
      ok: false,
      reason: "Sperrfrist aktiv",
      nextAllowedMin: existing.nextAllowedMin,
      nextAllowedLabel: formatGameTime(existing.nextAllowedMin),
    };
  }

  const feasibility = getOutreachFeasibility(state, customerId);
  if (!feasibility.hasAnyOpportunity) {
    // Kein Bedarf — nachvollziehbare Rückmeldung
    const outreach = {
      customerId,
      status: "completed",
      result: "no_demand",
      resultMessage: "Aktuell besteht bei diesem Kunde kein akuter Bedarf. Die Ansprache war höflich, aber ergebnislos.",
      lastContactMin: state.gameTime,
      nextAllowedMin: state.gameTime + OUTREACH_COOLDOWN_MIN,
      processId: null,
      tenderId: null,
    };
    state.acquisition.outreach[customerId] = outreach;
    return { ok: true, outreach };
  }

  // Deterministische Auswahl des Ergebnisses basierend auf Trust und Kapazität
  // Hash aus customerId + gameTime für reproduzierbare Ergebnisse
  const hash = hashStr(customerId + ":" + Math.floor(state.gameTime / 60));
  const rng = mulberry32(hash >>> 0);
  const roll = rng();

  let result;
  let resultMessage;
  let tenderId = null;

  if (feasibility.canOfferContract && roll < 0.35) {
    // Vertragsgespräch bei erfüllten Voraussetzungen
    result = "contract_discussion";
    resultMessage = `${customer.name} ist an einem Rahmenvertrag interessiert. Ein Vertragsangebot steht bereit.`;
    // Vorhandene Vertragslogik nutzen: generateContractOffer
    try {
      const r = generateContractOffer(state, customerId);
      if (r.isNew) {
        deliverMessage(state, {
          fromId: "system", toId: "player",
          subject: "Vertragsgespräch: " + customer.name,
          body: `Durch die geschäftliche Ansprache ist ${customer.name} an einem Rahmenvertrag interessiert.\n\n` +
            `Ein Vertragsangebot steht in der Kundendetailansicht bereit.\n` +
            `Relation: ${r.contract.fromCity} → ${r.contract.toCity}\n` +
            `Vergütung: ${(r.contract.paymentPerTransportCents / 100).toFixed(2)} € pro Transport`,
          gameTime: state.gameTime, category: "operations", priority: "normal",
          linkedRefs: { type: "contract", id: r.contract.id },
          dedupKey: `outreach_contract:${r.contract.id}`,
        });
      }
    } catch (e) { /* Stammkunde-Prüfung fehlgeschlagen */ }
  } else if (feasibility.canOfferTender && roll < 0.70) {
    // Ausschreibungseinladung
    result = "tender_invitation";
    resultMessage = `${customer.name} lädt Sie zu einer verfügbaren Ausschreibung ein.`;
    tenderId = createTenderFromOutreach(state, customer, feasibility);
  } else if (feasibility.canOfferTrial) {
    // Probeauftrag
    result = "trial_order";
    resultMessage = `${customer.name} bietet einen Probeauftrag an. Er erscheint in der Auftragsliste und muss bewusst angenommen werden.`;
    createTrialOrder(state, customer, feasibility);
  } else {
    result = "no_demand";
    resultMessage = "Aktuell besteht bei diesem Kunde kein akuter Bedarf.";
  }

  const outreach = {
    customerId,
    status: "completed",
    result,
    resultMessage,
    lastContactMin: state.gameTime,
    nextAllowedMin: state.gameTime + OUTREACH_COOLDOWN_MIN,
    processId: null,
    tenderId,
  };
  state.acquisition.outreach[customerId] = outreach;

  pushEvent(state, {
    type: "outreach_completed",
    gameTime: state.gameTime, isSystem: true,
    details: { customerId, customerName: customer.name, result, tenderId },
    dedupKey: `outreach:${customerId}:${state.gameTime}`,
  });

  return { ok: true, outreach };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// Probeauftrag erstellen — reguläres Marktangebot
function createTrialOrder(state, customer, feasibility) {
  // Wähle erste machbare Relation
  const feasibleRel = feasibility.relationChecks.find(r => r.feasible);
  if (!feasibleRel) return;

  const fromCity = feasibleRel.fromCity;
  const toCity = feasibleRel.toCity;
  const km = feasibleRel.km;
  const cargo = customer.cargoTypes[0];
  const tons = Math.min(8, Math.max(4, Math.floor(4 + acqRng(state) * 5)));

  const relFactor = 1.0;
  const paymentCents = computeOfferPrice(km, tons, "normal", relFactor);

  // Zeitfenster: großzügig für Probeauftrag
  const approachMin = feasibleRel.approachMin;
  const acceptDeadline = state.gameTime + TRIAL_ORDER_ACCEPT_HOURS * 60 + approachMin;
  const earliestPickup = state.gameTime + 60;
  const driveMin = driveMinutes(km);
  const opMin = LOAD_MIN + driveMin + UNLOAD_MIN;
  const deliveryDeadline = Math.max(earliestPickup, state.gameTime + approachMin) + opMin + TRIAL_ORDER_BUFFER_HOURS * 60;

  const order = {
    id: uid(state, "o"),
    customerId: customer.id,
    customer: customer.name,
    shipmentId: "S" + (state.idCounter + 1),
    fromCity, toCity, cargo, tons,
    paymentCents,
    offerType: "normal",
    relationFactor: relFactor,
    publishedAtMin: state.gameTime,
    acceptDeadlineMin: acceptDeadline,
    earliestPickupMin: earliestPickup,
    latestLoadStartMin: acceptDeadline,
    deliveryDeadlineMin: deliveryDeadline,
    paymentTermsDays: 0,
    paymentDueMin: null,
    status: "offered",
    acceptedAtMin: null, startedAtMin: null, deliveredAtMin: null, paidCents: null,
    acceptedById: null, acceptedByName: null,
    plannedById: null, plannedByName: null,
    feasible: true,
    history: [{ type: "trial_offer", min: state.gameTime, actor: "outreach", details: { customerId: customer.id } }],
    isTrialOrder: true,
  };
  state.orders.push(order);

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Probeauftrag: " + customer.name,
    body: `Durch die Ansprache bietet ${customer.name} einen Probeauftrag an.\n\n` +
      `Relation: ${fromCity} → ${toCity}\n` +
      `Fracht: ${cargo}, ${tons} t\n` +
      `Vergütung: ${(paymentCents / 100).toFixed(2)} €\n` +
      `Annahmefrist: ${formatGameTime(acceptDeadline)}\n\n` +
      `Der Auftrag erscheint in der Auftragsliste und muss bewusst angenommen werden.`,
    gameTime: state.gameTime, category: "operations", priority: "normal",
    linkedRefs: { type: "order", id: order.id },
    dedupKey: `trial_order:${order.id}`,
  });
}

// Ausschreibung aus Ansprache erstellen
function createTenderFromOutreach(state, customer, feasibility) {
  const feasibleRels = feasibility.relationChecks.filter(r => r.feasible);
  if (feasibleRels.length === 0) return null;

  // Wähle erste machbare Relation
  const rel = feasibleRels[0];
  return createTender(state, customer, rel.fromCity, rel.toCity);
}

// ---------- Ausschreibungen ----------

// Ausschreibung erstellen
function createTender(state, customer, fromCity, toCity) {
  migrateAcquisition(state);

  // Max 3 offene Ausschreibungen
  const openTenders = state.acquisition.tenders.filter(t => t.status === "open");
  if (openTenders.length >= MAX_OPEN_TENDERS) {
    return null;
  }

  const km = getDistance(fromCity, toCity);
  const driveMin = driveMinutes(km);
  const cargo = customer.cargoTypes[0];

  // Deterministische Tonnage (mittelschwer für Ausschreibungen)
  const tons = 8 + Math.floor(acqRng(state) * 5); // 8–12 t
  const transportsPerDay = 1 + Math.floor(acqRng(state) * 2); // 1 oder 2
  const durationDays = CONTRACT_DURATION_DAYS;

  // Zeitplan
  const now = state.gameTime;
  const offerDeadlineMin = now + TENDER_OFFER_DEADLINE_HOURS * 60;
  const decisionMin = offerDeadlineMin + TENDER_DECISION_DELAY_HOURS * 60;
  const contractStartMin = (Math.floor(decisionMin / DAY_MIN) + 1 + TENDER_PREP_DAYS) * DAY_MIN;

  // Lieferfenster
  const opMin = LOAD_MIN + driveMin + UNLOAD_MIN;
  const deliveryBufferMin = CONTRACT_DELIVERY_BUFFER_HOURS * 60;

  // Gefahrgut-Prüfung
  const dgReqs = checkDgRequirements(state, customer, fromCity, toCity);
  const requiresDg = dgReqs.required;
  const dgProfileId = requiresDg && dgReqs.profiles.length > 0 ? dgReqs.profiles[0] : null;
  const dgProfile = dgProfileId ? getDgProfile(dgProfileId) : null;

  // Bewertungskriterien
  const weights = getEvaluationWeights(customer);

  // Harte Voraussetzungen
  const hardRequirements = {
    minCapacityTons: tons,
    requiresDg,
    dgTransportType: dgProfile?.transportType || null,
    deliveryWindowFeasible: true, // wird bei Bewertung geprüft
  };

  const tender = {
    id: uid(state, "tnd"),
    customerId: customer.id,
    customerName: customer.name,
    fromCity, toCity, cargo, tons,
    transportsPerDay,
    durationDays,
    driveMin, opMin, deliveryBufferMin,
    offerDeadlineMin,
    decisionMin,
    contractStartMin,
    requiresDg,
    dgProfileId,
    dgClass: dgProfile?.adrClass || null,
    hardRequirements,
    evaluationCriteria: {
      weights,
      criteriaLabels: {
        price: "Preis",
        reliability: "Zuverlässigkeit",
        relationFit: "Passung zur Relation",
        capacity: "Leistungsfähigkeit",
        relationship: "Kundenbeziehung",
      },
    },
    competitorBids: generateCompetitorBids(state, customer, tons, transportsPerDay, durationDays, km),
    playerBid: null,
    negotiation: null,
    status: "open",
    resultingContractOfferId: null,
    createdAtMin: now,
    evaluatedAtMin: null,
    awardExplanation: null,
  };

  state.acquisition.tenders.push(tender);

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Ausschreibung: " + customer.name,
    body: `${customer.name} hat eine Ausschreibung veröffentlicht.\n\n` +
      `Relation: ${fromCity} → ${toCity}\n` +
      `Fracht: ${cargo}, ${tons} t\n` +
      `Transporte pro Tag: ${transportsPerDay}\n` +
      `Laufzeit: ${durationDays} Tage\n\n` +
      `Angebotsfrist: ${formatGameTime(offerDeadlineMin)}\n` +
      `Entscheidung: ${formatGameTime(decisionMin)}\n` +
      `Geplanter Vertragsbeginn: ${formatGameTime(contractStartMin)}\n\n` +
      `Bewertungskriterien und Bedingungen finden Sie in der Ausschreibungsdetailansicht.`,
    gameTime: now, category: "operations", priority: "normal",
    linkedRefs: { type: "tender", id: tender.id },
    dedupKey: `tender_created:${tender.id}`,
  });

  pushEvent(state, {
    type: "tender_published",
    gameTime: now, isSystem: true,
    details: { tenderId: tender.id, customerId: customer.id, customerName: customer.name, fromCity, toCity },
    dedupKey: `tender_published:${tender.id}`,
  });

  return tender.id;
}

// Deterministische Konkurrenzangebote erzeugen
function generateCompetitorBids(state, customer, tons, transportsPerDay, durationDays, km) {
  // 2–3 fiktive Wettbewerber, deterministisch aus Seed
  const count = 2 + Math.floor(acqRng(state) * 2); // 2 oder 3
  const basePrice = computeOfferPrice(km, tons, "normal", 1.0);
  const competitors = [
    "Nord-Logistik GmbH",
    "Süd-Spedition Meyer",
    "West-Fracht Brandt",
    "Ost-Transport Kloth",
  ];

  const bids = [];
  for (let i = 0; i < count; i++) {
    // Preis: 90–115% des Basispreises, deterministisch
    const priceFactor = 0.90 + acqRng(state) * 0.25;
    const pricePerTransportCents = Math.round(basePrice * priceFactor);

    // Fiktive Zuverlässigkeit (70–95%)
    const reliabilityScore = 70 + Math.floor(acqRng(state) * 26);

    // Fiktive Relation-Passung (60–90%)
    const relationFitScore = 60 + Math.floor(acqRng(state) * 31);

    // Fiktive Kapazität (65–95%)
    const capacityScore = 65 + Math.floor(acqRng(state) * 31);

    bids.push({
      id: "comp_" + i,
      bidderName: competitors[i],
      pricePerTransportCents,
      reliabilityScore,
      relationFitScore,
      capacityScore,
      relationshipScore: 50, // neutral für Konkurrenz
    });
  }

  return bids;
}

// Offene Ausschreibungen abrufen
export function getOpenTenders(state) {
  migrateAcquisition(state);
  return state.acquisition.tenders
    .filter(t => t.status === "open" || t.status === "evaluating" || t.status === "awarded")
    .sort((a, b) => a.offerDeadlineMin - b.offerDeadlineMin);
}

// Ausschreibungsdetails abrufen
export function getTenderDetails(state, tenderId) {
  migrateAcquisition(state);
  const tender = state.acquisition.tenders.find(t => t.id === tenderId);
  if (!tender) return null;

  const customer = customerById(tender.customerId);
  const relation = getCustomerRelation(state, tender.customerId);

  // Spieler-Bewertung vorab berechnen (falls bereits Angebot abgegeben)
  let playerEvaluation = null;
  if (tender.playerBid) {
    playerEvaluation = evaluatePlayerBid(state, tender);
  }

  return {
    tender,
    customer,
    relation,
    playerEvaluation,
  };
}

// ---------- Angebotskalkulation ----------

// Kalkulation für ein Angebot vorab berechnen
export function calculateBidCosts(state, tender, pricePerTransportCents) {
  const km = getDistance(tender.fromCity, tender.toCity);
  const driveMin = tender.driveMin;

  // Variable Kosten: Kraftstoff + Maut (wie ContractOfferCard)
  // Standard-Verbrauch 28 L/100km, Preis 1.70 €/L
  const fuelPerTrip = Math.round(km * 28 / 100 * 170);
  const tollPerTrip = Math.round(km * 20); // 0.20 €/km
  const costPerTrip = fuelPerTrip + tollPerTrip;

  const totalTransports = tender.transportsPerDay * tender.durationDays;
  const totalRevenue = pricePerTransportCents * totalTransports;
  const totalCost = costPerTrip * totalTransports;
  const totalContribution = totalRevenue - totalCost;
  const contributionPerTrip = pricePerTransportCents - costPerTrip;

  // Kapazitätskonflikte prüfen
  const capacityConflicts = checkCapacityConflicts(state, tender);

  // Unsichere Annahmen
  const uncertainAssumptions = [];
  uncertainAssumptions.push("Leerfahrten zur Abholung nicht eingerechnet — können je nach Flottenposition variieren");
  if (tender.requiresDg) {
    uncertainAssumptions.push("Gefahrgut-Zusatzkosten (Ausrüstung, Reinigung) nicht eingerechnet");
  }
  uncertainAssumptions.push("Fahrerlöhne und Fixkosten nicht eingerechnet — nur variable Kosten");
  if (capacityConflicts.length > 0) {
    uncertainAssumptions.push("Bestehende Kapazitätskonflikte können die Ausführung erschweren");
  }

  // Warnung: Preis unter Kosten
  const belowCost = pricePerTransportCents < costPerTrip;

  return {
    pricePerTransportCents,
    costPerTrip,
    fuelPerTrip,
    tollPerTrip,
    totalTransports,
    totalRevenue,
    totalCost,
    totalContribution,
    contributionPerTrip,
    belowCost,
    capacityConflicts,
    uncertainAssumptions,
  };
}

// Kapazitätskonflikte prüfen
function checkCapacityConflicts(state, tender) {
  const conflicts = [];
  const contractStartMin = tender.contractStartMin;
  const contractEndMin = contractStartMin + tender.durationDays * DAY_MIN;

  // Bestehende aktive Verträge im gleichen Zeitraum
  for (const c of (state.contracts?.contracts || [])) {
    if (c.status !== "active") continue;
    const overlap = c.startMin < contractEndMin && c.endMin > contractStartMin;
    if (overlap) {
      conflicts.push({
        type: "contract_overlap",
        description: `Aktiver Vertrag mit ${c.customerName} (${c.fromCity} → ${c.toCity}) überschneidet sich`,
      });
    }
  }

  // Geplante Wartungen im Zeitraum
  for (const v of (state.vehicles || [])) {
    if (v.status === "maintenance" && v.maintenanceUntil > contractStartMin) {
      conflicts.push({
        type: "maintenance",
        description: `Fahrzeug ${v.id} in Wartung bis ${formatGameTime(v.maintenanceUntil)}`,
      });
    }
  }

  // Abwesenheiten im Zeitraum
  for (const s of (state.absences?.sicknesses || [])) {
    if (s.status === "active" && s.expectedEndMin > contractStartMin) {
      const person = (state.drivers || []).find(d => d.id === s.personId) ||
                     (state.employees || []).find(e => e.id === s.personId);
      if (person) {
        conflicts.push({
          type: "absence",
          description: `${person.name} bis ${formatGameTime(s.expectedEndMin)} abwesend`,
        });
      }
    }
  }

  return conflicts;
}

// Angebot abgeben
export function submitBid(state, tenderId, pricePerTransportCents) {
  migrateAcquisition(state);
  const tender = state.acquisition.tenders.find(t => t.id === tenderId);
  if (!tender) throw new Error("Ausschreibung nicht gefunden.");
  if (tender.status !== "open") throw new Error("Ausschreibung ist nicht mehr offen.");
  if (state.gameTime > tender.offerDeadlineMin) throw new Error("Angebotsfrist ist abgelaufen.");

  // Preis in Cent — eindeutige Preisquelle
  const price = Math.round(pricePerTransportCents);
  if (price <= 0) throw new Error("Angebotspreis muss positiv sein.");

  // Kalkulation speichern
  const calculation = calculateBidCosts(state, tender, price);

  tender.playerBid = {
    pricePerTransportCents: price,
    submittedAtMin: state.gameTime,
    calculatedCosts: calculation,
  };

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Angebot abgegeben: " + tender.customerName,
    body: `Ihr Angebot für die Ausschreibung von ${tender.customerName} wurde eingereicht.\n\n` +
      `Angebotspreis: ${(price / 100).toFixed(2)} € pro Transport\n` +
      `Transporte gesamt: ${calculation.totalTransports}\n` +
      `Geplanter Gesamtumsatz: ${(calculation.totalRevenue / 100).toFixed(2)} €\n` +
      `Erwarteter Deckungsbeitrag: ${(calculation.totalContribution / 100).toFixed(2)} €\n\n` +
      `Die Entscheidung wird am ${formatGameTime(tender.decisionMin)} bekannt gegeben.`,
    gameTime: state.gameTime, category: "operations", priority: "normal",
    linkedRefs: { type: "tender", id: tender.id },
    dedupKey: `bid_submitted:${tender.id}`,
  });

  return { ok: true, tender, calculation };
}

// ---------- Bewertung ----------

// Spieler-Bewertung berechnen (für Vorschau)
function evaluatePlayerBid(state, tender) {
  const bid = tender.playerBid;
  if (!bid) return null;

  const relation = getCustomerRelation(state, tender.customerId);
  const weights = tender.evaluationCriteria.weights;

  // Preis-Score: relativ zum Median der Konkurrenzangebote
  const allPrices = [...tender.competitorBids.map(b => b.pricePerTransportCents), bid.pricePerTransportCents];
  const medianPrice = allPrices.sort((a, b) => a - b)[Math.floor(allPrices.length / 2)];
  // Preis-Score: 100 = günstigster, 0 = teuerster
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const priceScore = maxPrice === minPrice ? 80 : Math.round(100 - ((bid.pricePerTransportCents - minPrice) / (maxPrice - minPrice)) * 100);

  // Zuverlässigkeit: aus tatsächlicher Historie
  let reliabilityScore;
  if (relation && relation.completedTransports > 0) {
    const rate = relation.timelyTransports / relation.completedTransports;
    reliabilityScore = Math.round(rate * 100);
  } else {
    // Kein erfundener Wert — neutrale Bewertung
    reliabilityScore = null;
  }

  // Passung zur Relation: hat das Unternehmen bereits Transporte auf dieser Relation?
  const relationFit = checkRelationFit(state, tender);
  const relationFitScore = relationFit.score;

  // Kapazität: verfügbare Fahrzeuge/Fahrer
  const capacity = checkCapacity(state, tender);
  const capacityScore = capacity.score;

  // Kundenbeziehung: Vertrauen
  const relationshipScore = relation ? relation.trust : TRUST_START;

  // Gewichtete Gesamtbewertung
  let totalScore = 0;
  let usedWeights = 0;
  totalScore += priceScore * weights.price;
  usedWeights += weights.price;
  if (reliabilityScore !== null) {
    totalScore += reliabilityScore * weights.reliability;
    usedWeights += weights.reliability;
  }
  totalScore += relationFitScore * weights.relationFit;
  usedWeights += weights.relationFit;
  totalScore += capacityScore * weights.capacity;
  usedWeights += weights.capacity;
  totalScore += relationshipScore * weights.relationship;
  usedWeights += weights.relationship;

  // Normalisierung wenn Zuverlässigkeit fehlt
  const normalizedScore = usedWeights > 0 ? Math.round(totalScore / usedWeights) : 0;

  return {
    priceScore,
    reliabilityScore,
    relationFitScore,
    capacityScore,
    relationshipScore,
    totalScore: normalizedScore,
    weights,
    hasReliabilityHistory: reliabilityScore !== null,
  };
}

// Passung zur Relation prüfen
function checkRelationFit(state, tender) {
  // Hat das Unternehmen bereits Transporte zwischen diesen Städten durchgeführt?
  const pastDeliveries = (state.orders || []).filter(o =>
    o.customerId === tender.customerId &&
    o.status === "geliefert" &&
    o.fromCity === tender.fromCity &&
    o.toCity === tender.toCity
  ).length;

  // Hat das Unternehmen Fahrzeuge in der Nähe?
  const approachMin = estimateApproachMin(state, tender.fromCity);
  const approachScore = Math.max(0, Math.round(100 - approachMin / 10));

  const score = Math.min(100, Math.round(50 + pastDeliveries * 10 + approachScore * 0.3));
  return { score, pastDeliveries, approachMin };
}

// Verfügbare Kapazität prüfen
function checkCapacity(state, tender) {
  const vehicles = (state.vehicles || []).filter(v =>
    v.status !== "archived" && v.status !== "sold" && v.condition >= 20 &&
    v.capacityTons >= tender.hardRequirements.minCapacityTons
  );
  const drivers = (state.drivers || []).filter(d =>
    isActivelyEmployed(d) && d.attendance !== "released"
  );

  // Gefahrgut-Qualifikation prüfen
  let qualifiedDrivers = drivers;
  if (tender.requiresDg) {
    qualifiedDrivers = drivers.filter(d => {
      if (tender.hardRequirements.dgTransportType === "tank") {
        return hasAdrBasic(state, d.id) && hasAdrTank(state, d.id);
      }
      return hasAdrBasic(state, d.id);
    });
  }

  const score = Math.min(100, Math.round(
    (Math.min(vehicles.length, 3) / 3 * 50) +
    (Math.min(qualifiedDrivers.length, 3) / 3 * 50)
  ));

  return {
    score,
    vehicleCount: vehicles.length,
    driverCount: qualifiedDrivers.length,
    meetsHardRequirements: vehicles.length > 0 && qualifiedDrivers.length > 0,
  };
}

// Ausschreibung auswerten — entscheidet über Zuschlag
export function evaluateTender(state, tenderId) {
  migrateAcquisition(state);
  const tender = state.acquisition.tenders.find(t => t.id === tenderId);
  if (!tender) return;
  if (tender.status !== "open") return;
  if (state.gameTime < tender.decisionMin) return;

  // Harte Voraussetzungen für Spieler prüfen
  const playerEligible = checkPlayerEligibility(state, tender);

  // Alle Angebote bewerten
  const allBids = [];

  // Spieler-Angebot
  if (tender.playerBid && playerEligible.eligible) {
    const playerEval = evaluatePlayerBid(state, tender);
    if (playerEval) {
      allBids.push({
        bidder: "player",
        bidderName: state.company?.name || "Ihr Unternehmen",
        pricePerTransportCents: tender.playerBid.pricePerTransportCents,
        totalScore: playerEval.totalScore,
        scores: playerEval,
      });
    }
  }

  // Konkurrenzangebote
  for (const comp of tender.competitorBids) {
    const compScore = calculateCompetitorScore(comp, tender.evaluationCriteria.weights);
    allBids.push({
      bidder: "competitor",
      bidderName: comp.bidderName,
      pricePerTransportCents: comp.pricePerTransportCents,
      totalScore: compScore,
      scores: {
        priceScore: comp.priceScore,
        reliabilityScore: comp.reliabilityScore,
        relationFitScore: comp.relationFitScore,
        capacityScore: comp.capacityScore,
        relationshipScore: comp.relationshipScore,
      },
    });
  }

  // Sortieren nach Gesamtbewertung (absteigend)
  allBids.sort((a, b) => b.totalScore - a.totalScore);

  const winner = allBids[0];
  const isPlayerWinner = winner && winner.bidder === "player";

  tender.status = isPlayerWinner ? "awarded" : "lost";
  tender.evaluatedAtMin = state.gameTime;

  // Erklärung für Erfolg/Misserfolg
  const explanation = buildAwardExplanation(state, tender, allBids, playerEligible);
  tender.awardExplanation = explanation;

  if (isPlayerWinner) {
    // Befristetes Vertragsangebot erstellen (kein verbindlicher Vertrag)
    createContractOfferFromTender(state, tender);
  }

  // Benachrichtigung
  const customer = customerById(tender.customerId);
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: isPlayerWinner ? "Zuschlag erhalten: " + (customer?.name || tender.customerName) : "Ausschreibung verloren: " + (customer?.name || tender.customerName),
    body: explanation,
    gameTime: state.gameTime, category: "operations", priority: isPlayerWinner ? "high" : "normal",
    linkedRefs: { type: "tender", id: tender.id },
    dedupKey: `tender_evaluated:${tender.id}`,
  });

  pushEvent(state, {
    type: "tender_evaluated",
    gameTime: state.gameTime, isSystem: true,
    details: { tenderId: tender.id, customerId: tender.customerId, won: isPlayerWinner, customerName: customer?.name || tender.customerName },
    dedupKey: `tender_evaluated:${tender.id}`,
  });
}

// Spieler-Eignung für harte Voraussetzungen prüfen
function checkPlayerEligibility(state, tender) {
  const reasons = [];

  // Fahrzeugtyp
  const vehicles = (state.vehicles || []).filter(v =>
    v.status !== "archived" && v.status !== "sold" && v.condition >= 20 &&
    v.capacityTons >= tender.hardRequirements.minCapacityTons
  );
  if (vehicles.length === 0) {
    reasons.push(`Kein Fahrzeug mit ausreichender Kapazität (${tender.hardRequirements.minCapacityTons} t)`);
  }

  // Fahrerqualifikation
  const drivers = (state.drivers || []).filter(d => isActivelyEmployed(d));
  let qualifiedDrivers = drivers;
  if (tender.requiresDg) {
    if (tender.hardRequirements.dgTransportType === "tank") {
      qualifiedDrivers = drivers.filter(d => hasAdrBasic(state, d.id) && hasAdrTank(state, d.id));
    } else {
      qualifiedDrivers = drivers.filter(d => hasAdrBasic(state, d.id));
    }
    if (qualifiedDrivers.length === 0) {
      reasons.push("Kein Fahrer mit erforderlicher Gefahrgut-Qualifikation");
    }
    // Disponent mit Gefahrgutberechtigung
    const hasDgDisp = (state.employees || []).some(e =>
      (e.role === "dispatcher" || e.role === "dispatcher_senior") &&
      hasDgDispatch(state, e.id)
    );
    if (!hasDgDisp) {
      reasons.push("Kein Disponent mit Gefahrgutberechtigung");
    }
  }

  // Lieferfenster grundsätzlich machbar?
  const capacity = checkCapacity(state, tender);
  if (!capacity.meetsHardRequirements) {
    reasons.push("Grundsätzlich keine ausreichende Kapazität verfügbar");
  }

  // Vertragszulässigkeit: bestehender Vertrag?
  const existingContract = (state.contracts?.contracts || []).find(c =>
    c.customerId === tender.customerId && c.status === "active"
  );
  if (existingContract) {
    reasons.push("Bestehender aktiver Vertrag mit diesem Kunden");
  }

  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

// Konkurrenz-Score berechnen
function calculateCompetitorScore(comp, weights) {
  const total = Math.round(
    comp.reliabilityScore * weights.reliability +
    comp.relationFitScore * weights.relationFit +
    comp.capacityScore * weights.capacity +
    comp.relationshipScore * weights.relationship +
    // Preis-Score: relativ, wird später berechnet — hier vereinfacht
    70 * weights.price // Annahme: mittlerer Preis-Score
  );
  return total;
}

// Erklärung für Zuschlag/Ablehnung
function buildAwardExplanation(state, tender, allBids, playerEligibility) {
  const customer = customerById(tender.customerId);
  const weights = tender.evaluationCriteria.weights;

  if (!tender.playerBid) {
    return `Sie haben kein Angebot abgegeben. Die Ausschreibung von ${customer?.name || tender.customerName} wurde ohne Ihre Beteiligung entschieden.`;
  }

  if (!playerEligibility.eligible) {
    return `Ihr Angebot wurde wegen nicht erfüllter Voraussetzungen nicht berücksichtigt:\n\n` +
      playerEligibility.reasons.map(r => `· ${r}`).join("\n") +
      `\n\nDie Ausschreibung wurde an einen anderen Bieter vergeben.`;
  }

  const playerBid = allBids.find(b => b.bidder === "player");
  const winner = allBids[0];
  const isWinner = winner && winner.bidder === "player";

  if (isWinner) {
    return `Sie haben die Ausschreibung von ${customer?.name || tender.customerName} gewonnen!\n\n` +
      `Ihr Angebot übertrumpfte die Konkurrenz in den gewichteten Kriterien.\n\n` +
      `Gewichtete Bewertung (höher ist besser):\n` +
      allBids.slice(0, 4).map((b, i) => {
        const marker = b.bidder === "player" ? "→ " : "   ";
        return `${marker}${i + 1}. ${b.bidderName}: ${b.totalScore} Punkte (${(b.pricePerTransportCents / 100).toFixed(2)} €/Transport)`;
      }).join("\n") +
      `\n\nEin befristetes Vertragsangebot steht zur Bestätigung bereit. ` +
      `Ein verbindlicher Vertrag entsteht erst durch bewusste Annahme.`;
  }

  // Verloren — Erklärung aus Bewertung
  const playerRank = allBids.findIndex(b => b.bidder === "player") + 1;
  return `Sie haben die Ausschreibung von ${customer?.name || tender.customerName} nicht gewonnen.\n\n` +
    `Sie belegten Platz ${playerRank} von ${allBids.length}.\n\n` +
    `Gewichtete Bewertung (höher ist besser):\n` +
    allBids.slice(0, 4).map((b, i) => {
      const marker = b.bidder === "player" ? "→ " : "   ";
      return `${marker}${i + 1}. ${b.bidderName}: ${b.totalScore} Punkte (${(b.pricePerTransportCents / 100).toFixed(2)} €/Transport)`;
    }).join("\n") +
    `\n\nDie wichtigsten Kriterien für ${customer?.name || tender.customerName}:\n` +
    Object.entries(weights).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, w]) =>
      `· ${tender.evaluationCriteria.criteriaLabels[k]}: ${Math.round(w * 100)}%`
    ).join("\n") +
    `\n\nEine Ablehnung allein verursacht keinen Vertrauensverlust. Bestehende Verträge bleiben unberührt.`;
}

// Befristetes Vertragsangebot aus Ausschreibung erstellen
function createContractOfferFromTender(state, tender) {
  if (!state.contracts) migrateContractsSafe(state);

  // Prüfen, ob bereits ein Angebot existiert
  const existing = (state.contracts?.contracts || []).find(c =>
    c.customerId === tender.customerId && (c.status === "offered" || c.status === "active")
  );
  if (existing) {
    tender.resultingContractOfferId = existing.id;
    return existing;
  }

  const customer = customerById(tender.customerId);
  const paymentPerTransportCents = tender.playerBid.pricePerTransportCents;
  // KEIN zusätzlicher Vertragsrabatt — der ausgehandelte Preis ist die Quelle
  const startMin = tender.contractStartMin;
  const endMin = startMin + tender.durationDays * DAY_MIN;

  const contract = {
    id: uid(state, "ctr"),
    customerId: tender.customerId,
    customerName: tender.customerName,
    fromCity: tender.fromCity,
    toCity: tender.toCity,
    cargo: tender.cargo,
    tons: tender.tons,
    transportsPerDay: tender.transportsPerDay,
    paymentPerTransportCents, // Eindeutige Preisquelle — kein Rabatt
    startMin,
    endMin,
    startDay: dayOf(startMin),
    endDay: dayOf(endMin),
    deliveryBufferMin: tender.deliveryBufferMin,
    driveMin: tender.driveMin,
    opMin: tender.opMin,
    requiresDg: tender.requiresDg,
    minCapacityTons: tender.hardRequirements.minCapacityTons,
    dgProfileId: tender.dgProfileId,
    status: "offered",
    offerCreatedAtMin: state.gameTime,
    acceptedAtMin: null,
    generatedCount: 0,
    deliveredCount: 0,
    timelyCount: 0,
    lateCount: 0,
    failedCount: 0,
    cancelledCount: 0,
    revenueCents: 0,
    lastDayGenerated: 0,
    orderIds: [],
    evaluatedAtMin: null,
    earlyTerminatedAtMin: null,
    fromTenderId: tender.id, // Rückverweis auf Ausschreibung
    negotiatedPrice: true, // Preis wurde verhandelt — kein automatischer Rabatt
  };

  state.contracts.contracts.push(contract);
  tender.resultingContractOfferId = contract.id;

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Vertragsangebot aus Ausschreibung: " + (customer?.name || tender.customerName),
    body: `Sie haben die Ausschreibung von ${customer?.name || tender.customerName} gewonnen.\n\n` +
      `Ein befristetes Vertragsangebot steht bereit:\n` +
      `Relation: ${contract.fromCity} → ${contract.toCity}\n` +
      `Vergütung: ${(paymentPerTransportCents / 100).toFixed(2)} € pro Transport\n` +
      `Transporte pro Tag: ${contract.transportsPerDay}\n` +
      `Laufzeit: Tag ${contract.startDay} bis Tag ${contract.endDay}\n\n` +
      `Ein verbindlicher Vertrag entsteht erst durch bewusste Annahme.\n` +
      `Prüfen Sie die Konditionen und bestätigen Sie das Angebot in der Kundendetailansicht.`,
    gameTime: state.gameTime, category: "operations", priority: "high",
    linkedRefs: { type: "contract", id: contract.id },
    dedupKey: `tender_contract_offer:${contract.id}`,
  });

  return contract;
}

function migrateContractsSafe(state) {
  if (!state.contracts) {
    state.contracts = { version: 1, contracts: [] };
  }
}

// ---------- Vertragsverhandlungen ----------

// Verhandlung starten (nur für offene Vertragsangebote aus Ausschreibungen)
export function startNegotiation(state, tenderId) {
  migrateAcquisition(state);
  const tender = state.acquisition.tenders.find(t => t.id === tenderId);
  if (!tender) throw new Error("Ausschreibung nicht gefunden.");
  if (tender.status !== "awarded") throw new Error("Verhandlung nur nach Zuschlag möglich.");
  if (!tender.resultingContractOfferId) throw new Error("Kein Vertragsangebot vorhanden.");

  if (tender.negotiation && tender.negotiation.status === "active") {
    return { ok: true, negotiation: tender.negotiation };
  }
  if (tender.negotiation && tender.negotiation.status !== "active") {
    throw new Error("Verhandlung ist bereits abgeschlossen.");
  }

  const contract = (state.contracts?.contracts || []).find(c => c.id === tender.resultingContractOfferId);
  if (!contract) throw new Error("Vertragsangebot nicht gefunden.");
  if (contract.status !== "offered") throw new Error("Vertragsangebot ist nicht mehr offen.");

  // Initiale Konditionen = aktuelles Vertragsangebot
  const initialTerms = {
    pricePerTransportCents: contract.paymentPerTransportCents,
    transportsPerDay: contract.transportsPerDay,
    startMin: contract.startMin,
    deliveryBufferMin: contract.deliveryBufferMin,
  };

  tender.negotiation = {
    rounds: [],
    currentTerms: initialTerms,
    status: "active",
    roundsUsed: 0,
    startedAtMin: state.gameTime,
    customerResponse: null, // "accept" | "counter" | "reject"
    lastActionMin: null,
  };

  return { ok: true, negotiation: tender.negotiation };
}

// Verhandlungsrunde verarbeiten
export function processNegotiationRound(state, tenderId, action, proposedTerms) {
  migrateAcquisition(state);
  const tender = state.acquisition.tenders.find(t => t.id === tenderId);
  if (!tender) throw new Error("Ausschreibung nicht gefunden.");
  if (!tender.negotiation || tender.negotiation.status !== "active") {
    throw new Error("Keine aktive Verhandlung.");
  }

  const neg = tender.negotiation;

  // Idempotenz: gleiche Aktion nicht zweimal verarbeiten
  if (neg.lastActionMin === state.gameTime && neg.customerResponse === action) {
    return { ok: true, negotiation: neg, message: "Diese Aktion wurde bereits verarbeitet." };
  }

  if (neg.roundsUsed >= MAX_NEGOTIATION_ROUNDS) {
    neg.status = "completed";
    return { ok: true, negotiation: neg, message: "Maximale Anzahl Verhandlungsrunden erreicht." };
  }

  const contract = (state.contracts?.contracts || []).find(c => c.id === tender.resultingContractOfferId);
  if (!contract || contract.status !== "offered") {
    neg.status = "failed";
    return { ok: true, negotiation: neg, message: "Vertragsangebot nicht mehr verfügbar." };
  }

  neg.roundsUsed++;
  neg.lastActionMin = state.gameTime;

  const customer = customerById(tender.customerId);
  const currentTerms = neg.currentTerms;

  if (action === "accept") {
    // Spieler akzeptiert aktuelle Konditionen
    neg.customerResponse = "accept";
    neg.status = "completed";

    // Vertragsangebot mit aktuellen Konditionen aktualisieren
    contract.paymentPerTransportCents = currentTerms.pricePerTransportCents;
    contract.transportsPerDay = currentTerms.transportsPerDay;
    contract.startMin = currentTerms.startMin;
    contract.startDay = dayOf(currentTerms.startMin);
    contract.endMin = currentTerms.startMin + tender.durationDays * DAY_MIN;
    contract.endDay = dayOf(contract.endMin);
    contract.deliveryBufferMin = currentTerms.deliveryBufferMin;

    neg.rounds.push({
      round: neg.roundsUsed,
      action: "accept",
      terms: { ...currentTerms },
      response: "accepted",
      atMin: state.gameTime,
    });

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Verhandlung abgeschlossen: " + (customer?.name || tender.customerName),
      body: `Die Verhandlung mit ${customer?.name || tender.customerName} wurde abgeschlossen.\n\n` +
        `Akzeptierte Konditionen:\n` +
        `Vergütung: ${(currentTerms.pricePerTransportCents / 100).toFixed(2)} € pro Transport\n` +
        `Transporte pro Tag: ${currentTerms.transportsPerDay}\n` +
        `Beginn: ${formatGameTime(currentTerms.startMin)}\n\n` +
        `Das Vertragsangebot steht zur bewussten Bestätigung bereit.`,
      gameTime: state.gameTime, category: "operations", priority: "normal",
      linkedRefs: { type: "tender", id: tender.id },
      dedupKey: `negotiation_accept:${tender.id}:${neg.roundsUsed}`,
    });

    return { ok: true, negotiation: neg, message: "Konditionen akzeptiert." };
  }

  if (action === "propose") {
    // Spieler macht neuen Vorschlag
    const newTerms = {
      pricePerTransportCents: Math.round(proposedTerms.pricePerTransportCents),
      transportsPerDay: proposedTerms.transportsPerDay,
      startMin: proposedTerms.startMin,
      deliveryBufferMin: proposedTerms.deliveryBufferMin,
    };

    // Kunde reagiert deterministisch
    const customerResponse = determineCustomerResponse(state, tender, customer, currentTerms, newTerms);
    neg.customerResponse = customerResponse;

    if (customerResponse === "accept") {
      // Kunde akzeptiert
      neg.currentTerms = newTerms;
      neg.status = "completed";

      contract.paymentPerTransportCents = newTerms.pricePerTransportCents;
      contract.transportsPerDay = newTerms.transportsPerDay;
      contract.startMin = newTerms.startMin;
      contract.startDay = dayOf(newTerms.startMin);
      contract.endMin = newTerms.startMin + tender.durationDays * DAY_MIN;
      contract.endDay = dayOf(contract.endMin);
      contract.deliveryBufferMin = newTerms.deliveryBufferMin;

      neg.rounds.push({
        round: neg.roundsUsed,
        action: "propose",
        proposedTerms: newTerms,
        response: "accept",
        finalTerms: { ...newTerms },
        atMin: state.gameTime,
      });

      deliverMessage(state, {
        fromId: "system", toId: "player",
        subject: "Gegenangebot akzeptiert: " + (customer?.name || tender.customerName),
        body: `${customer?.name || tender.customerName} hat Ihr Gegenangebot akzeptiert.\n\n` +
          `Akzeptierte Konditionen:\n` +
          `Vergütung: ${(newTerms.pricePerTransportCents / 100).toFixed(2)} € pro Transport\n` +
          `Transporte pro Tag: ${newTerms.transportsPerDay}\n` +
          `Beginn: ${formatGameTime(newTerms.startMin)}\n\n` +
          `Das Vertragsangebot steht zur bewussten Bestätigung bereit.`,
        gameTime: state.gameTime, category: "operations", priority: "normal",
        linkedRefs: { type: "tender", id: tender.id },
        dedupKey: `negotiation_counter_accept:${tender.id}:${neg.roundsUsed}`,
      });

      return { ok: true, negotiation: neg, message: "Gegenangebot akzeptiert." };
    }

    if (customerResponse === "counter") {
      // Kunde macht Gegenangebot
      const counterTerms = generateCounterOffer(state, tender, customer, currentTerms, newTerms);
      neg.currentTerms = counterTerms;

      neg.rounds.push({
        round: neg.roundsUsed,
        action: "propose",
        proposedTerms: newTerms,
        response: "counter",
        counterTerms: { ...counterTerms },
        atMin: state.gameTime,
      });

      // Nach 2 Runden: Verhandlung beendet
      if (neg.roundsUsed >= MAX_NEGOTIATION_ROUNDS) {
        neg.status = "completed";
        // Letztes Gegenangebot als aktuelle Konditionen speichern
        contract.paymentPerTransportCents = counterTerms.pricePerTransportCents;
        contract.transportsPerDay = counterTerms.transportsPerDay;
        contract.startMin = counterTerms.startMin;
        contract.startDay = dayOf(counterTerms.startMin);
        contract.endMin = counterTerms.startMin + tender.durationDays * DAY_MIN;
        contract.endDay = dayOf(contract.endMin);
        contract.deliveryBufferMin = counterTerms.deliveryBufferMin;

        deliverMessage(state, {
          fromId: "system", toId: "player",
          subject: "Letztes Gegenangebot: " + (customer?.name || tender.customerName),
          body: `${customer?.name || tender.customerName} hat ein letztes Gegenangebot gemacht.\n\n` +
            `Konditionen:\n` +
            `Vergütung: ${(counterTerms.pricePerTransportCents / 100).toFixed(2)} € pro Transport\n` +
            `Transporte pro Tag: ${counterTerms.transportsPerDay}\n` +
            `Beginn: ${formatGameTime(counterTerms.startMin)}\n\n` +
            `Die Verhandlung ist nach ${MAX_NEGOTIATION_ROUNDS} Runden abgeschlossen.\n` +
            `Sie können diese Konditionen akzeptieren oder das Angebot ablehnen.`,
          gameTime: state.gameTime, category: "operations", priority: "normal",
          linkedRefs: { type: "tender", id: tender.id },
          dedupKey: `negotiation_final:${tender.id}:${neg.roundsUsed}`,
        });

        return { ok: true, negotiation: neg, message: "Letztes Gegenangebot — Verhandlung abgeschlossen." };
      }

      deliverMessage(state, {
        fromId: "system", toId: "player",
        subject: "Gegenangebot: " + (customer?.name || tender.customerName),
        body: `${customer?.name || tender.customerName} hat auf Ihr Angebot reagiert.\n\n` +
          `Gegenangebot:\n` +
          `Vergütung: ${(counterTerms.pricePerTransportCents / 100).toFixed(2)} € pro Transport\n` +
          `Transporte pro Tag: ${counterTerms.transportsPerDay}\n` +
          `Beginn: ${formatGameTime(counterTerms.startMin)}\n\n` +
          `Runde ${neg.roundsUsed} von ${MAX_NEGOTIATION_ROUNDS}. Sie können akzeptieren oder ein weiteres Angebot machen.`,
        gameTime: state.gameTime, category: "operations", priority: "normal",
        linkedRefs: { type: "tender", id: tender.id },
        dedupKey: `negotiation_counter:${tender.id}:${neg.roundsUsed}`,
      });

      return { ok: true, negotiation: neg, message: "Kunde hat ein Gegenangebot gemacht.", counterTerms };
    }

    // customerResponse === "reject"
    neg.status = "failed";
    neg.rounds.push({
      round: neg.roundsUsed,
      action: "propose",
      proposedTerms: newTerms,
      response: "reject",
      atMin: state.gameTime,
    });

    // Ablehnung allein: kein massiver Vertrauensverlust
    // Bestehende Verträge bleiben unberührt

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Verhandlung gescheitert: " + (customer?.name || tender.customerName),
      body: `${customer?.name || tender.customerName} hat das Angebot abgelehnt.\n\n` +
        `Die Verhandlung ist beendet. Das Vertragsangebot verfällt.\n` +
        `Bestehende Verträge bleiben unberührt. Kein Vertrauensverlust durch die Ablehnung allein.`,
      gameTime: state.gameTime, category: "operations", priority: "normal",
      linkedRefs: { type: "tender", id: tender.id },
      dedupKey: `negotiation_reject:${tender.id}:${neg.roundsUsed}`,
    });

    // Vertragsangebot verfällt
    contract.status = "terminated";
    contract.earlyTerminatedAtMin = state.gameTime;

    return { ok: true, negotiation: neg, message: "Angebot abgelehnt — Verhandlung beendet." };
  }

  if (action === "reject") {
    // Spieler lehnt aktuelle Konditionen ab
    neg.customerResponse = "reject";
    neg.status = "failed";

    neg.rounds.push({
      round: neg.roundsUsed,
      action: "reject",
      terms: { ...currentTerms },
      response: "rejected",
      atMin: state.gameTime,
    });

    contract.status = "terminated";
    contract.earlyTerminatedAtMin = state.gameTime;

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Verhandlung abgebrochen: " + (customer?.name || tender.customerName),
      body: `Sie haben die Verhandlung mit ${customer?.name || tender.customerName} abgebrochen.\n\n` +
        `Das Vertragsangebot verfällt. Bestehende Verträge bleiben unberührt.`,
      gameTime: state.gameTime, category: "operations", priority: "normal",
      linkedRefs: { type: "tender", id: tender.id },
      dedupKey: `negotiation_player_reject:${tender.id}:${neg.roundsUsed}`,
    });

    return { ok: true, negotiation: neg, message: "Verhandlung abgebrochen." };
  }

  throw new Error("Ungültige Aktion: " + action);
}

// Kundenreaktion deterministisch bestimmen
function determineCustomerResponse(state, tender, customer, currentTerms, proposedTerms) {
  // Hash für deterministische Entscheidung
  const hash = hashStr(tender.id + ":" + state.gameTime + ":" + JSON.stringify(proposedTerms));
  const rng = mulberry32(hash >>> 0);
  const roll = rng();

  // Preisänderung: Spieler will weniger als aktuell?
  const priceDelta = proposedTerms.pricePerTransportCents - currentTerms.pricePerTransportCents;
  const priceDeltaPercent = currentTerms.pricePerTransportCents > 0
    ? priceDelta / currentTerms.pricePerTransportCents
    : 0;

  // Kunde akzeptiert eher, wenn Spieler mehr will (Kunde zahlt mehr)
  // Kunde lehnt eher, wenn Spieler weniger will (Kunde bekommt weniger)
  // Aber: extreme Forderungen werden abgelehnt

  if (priceDeltaPercent > 0.10) {
    // Spieler fordert >10% mehr — Kunde lehnt eher ab
    if (roll < 0.6) return "reject";
    if (roll < 0.85) return "counter";
    return "accept";
  }

  if (priceDeltaPercent < -0.10) {
    // Spieler will >10% weniger — Kunde freut sich, aber prüft andere Faktoren
    if (roll < 0.5) return "accept";
    return "counter";
  }

  // Moderate Änderung
  if (roll < 0.35) return "accept";
  if (roll < 0.80) return "counter";
  return "reject";
}

// Gegenangebot des Kunden generieren
function generateCounterOffer(state, tender, customer, currentTerms, proposedTerms) {
  // Kunde bewegt sich in Richtung Spieler-Vorschlag, aber nicht vollständig
  const priceMove = 0.5; // 50% in Richtung des Spieler-Vorschlags
  const newPrice = Math.round(
    currentTerms.pricePerTransportCents +
    (proposedTerms.pricePerTransportCents - currentTerms.pricePerTransportCents) * priceMove
  );

  return {
    pricePerTransportCents: newPrice,
    transportsPerDay: proposedTerms.transportsPerDay || currentTerms.transportsPerDay,
    startMin: proposedTerms.startMin || currentTerms.startMin,
    deliveryBufferMin: proposedTerms.deliveryBufferMin || currentTerms.deliveryBufferMin,
  };
}

// Verhandlungsstatus abrufen
export function getNegotiationStatus(state, tenderId) {
  migrateAcquisition(state);
  const tender = state.acquisition.tenders.find(t => t.id === tenderId);
  if (!tender || !tender.negotiation) return null;

  return {
    negotiation: tender.negotiation,
    contract: tender.resultingContractOfferId
      ? (state.contracts?.contracts || []).find(c => c.id === tender.resultingContractOfferId)
      : null,
    maxRounds: MAX_NEGOTIATION_ROUNDS,
    roundsRemaining: MAX_NEGOTIATION_ROUNDS - tender.negotiation.roundsUsed,
  };
}

// ---------- Kapazitätsprüfung bei Annahme ----------

// Erneute Kapazitätsprüfung bei verbindlicher Annahme
export function checkCapacityAtAcceptance(state, tenderId) {
  migrateAcquisition(state);
  const tender = state.acquisition.tenders.find(t => t.id === tenderId);
  if (!tender) throw new Error("Ausschreibung nicht gefunden.");
  if (!tender.resultingContractOfferId) throw new Error("Kein Vertragsangebot vorhanden.");

  const contract = (state.contracts?.contracts || []).find(c => c.id === tender.resultingContractOfferId);
  if (!contract) throw new Error("Vertrag nicht gefunden.");
  if (contract.status !== "offered") throw new Error("Vertragsangebot ist nicht mehr offen.");

  // Abgelaufenes Angebot?
  if (state.gameTime > contract.startMin) {
    return {
      canAccept: false,
      hardObstacle: true,
      reason: "Vertragsangebot ist abgelaufen — Vertragsbeginn liegt in der Vergangenheit.",
      risks: [],
    };
  }

  const risks = [];
  const hardObstacles = [];

  // Geeignete Fahrzeuge
  const vehicles = (state.vehicles || []).filter(v =>
    v.status !== "archived" && v.status !== "sold" && v.condition >= 20 &&
    v.capacityTons >= contract.minCapacityTons
  );
  if (vehicles.length === 0) {
    hardObstacles.push("Kein geeignetes Fahrzeug mit ausreichender Kapazität verfügbar");
  } else if (vehicles.length < contract.transportsPerDay) {
    risks.push(`Nur ${vehicles.length} Fahrzeug(e) für ${contract.transportsPerDay} Transporte pro Tag`);
  }

  // Fahrer
  let qualifiedDrivers = (state.drivers || []).filter(d => isActivelyEmployed(d));
  if (contract.requiresDg) {
    qualifiedDrivers = qualifiedDrivers.filter(d => {
      if (tender.hardRequirements.dgTransportType === "tank") {
        return hasAdrBasic(state, d.id) && hasAdrTank(state, d.id);
      }
      return hasAdrBasic(state, d.id);
    });
    if (qualifiedDrivers.length === 0) {
      hardObstacles.push("Kein Fahrer mit erforderlicher Gefahrgut-Qualifikation");
    }
  }
  if (qualifiedDrivers.length < contract.transportsPerDay) {
    risks.push(`Nur ${qualifiedDrivers.length} qualifizierte(r) Fahrer für ${contract.transportsPerDay} Transporte pro Tag`);
  }

  // Bestehende Verträge
  const overlappingContracts = (state.contracts?.contracts || []).filter(c =>
    c.id !== contract.id && c.status === "active" &&
    c.startMin < contract.endMin && c.endMin > contract.startMin
  );
  if (overlappingContracts.length > 0) {
    risks.push(`${overlappingContracts.length} aktive(r) Vertrag/Verträge überschneiden sich zeitlich`);
  }

  // Abwesenheiten
  const contractStart = contract.startMin;
  const absences = [];
  for (const s of (state.absences?.sicknesses || [])) {
    if (s.status === "active" && s.expectedEndMin > contractStart) {
      absences.push(s);
    }
  }
  for (const r of (state.absences?.vacationRequests || [])) {
    if (r.status === "approved" && r.endMin > contractStart) {
      absences.push(r);
    }
  }
  if (absences.length > 0) {
    risks.push(`${absences.length} bekannte Abwesenheit(en) im Vertragszeitraum`);
  }

  // Wartungen
  const maintenance = (state.vehicles || []).filter(v =>
    v.status === "maintenance" && v.maintenanceUntil > contractStart
  );
  if (maintenance.length > 0) {
    risks.push(`${maintenance.length} Fahrzeug(e) in Wartung bei Vertragsbeginn`);
  }

  // Finanzielle Voraussetzungen
  const totalTransports = contract.transportsPerDay * tender.durationDays;
  const estimatedFuelCost = Math.round(
    getDistance(contract.fromCity, contract.toCity) * 28 / 100 * 170 * totalTransports
  );
  const estimatedTollCost = Math.round(
    getDistance(contract.fromCity, contract.toCity) * 20 * totalTransports
  );
  const totalCost = estimatedFuelCost + estimatedTollCost;

  if (state.company.accountCents < totalCost) {
    risks.push(`Firmenkonto (${(state.company.accountCents / 100).toFixed(2)} €) deckt geschätzte Betriebskosten (${(totalCost / 100).toFixed(2)} €) nicht vollständig`);
  }

  // Verbleibende Vorbereitungszeit
  const prepDays = Math.floor((contract.startMin - state.gameTime) / DAY_MIN);
  if (prepDays < 1) {
    risks.push("Weniger als 1 Tag Vorbereitungszeit bis Vertragsbeginn");
  }

  return {
    canAccept: hardObstacles.length === 0,
    hardObstacles,
    risks,
    prepDays,
    estimatedCostCents: totalCost,
    vehicleCount: vehicles.length,
    driverCount: qualifiedDrivers.length,
    overlappingContracts: overlappingContracts.length,
    absences: absences.length,
  };
}

// ---------- Ereignisverarbeitung ----------

// Ausschreibungs-Ereignisse verarbeiten
export function processAcquisitionEvents(state, m, log) {
  migrateAcquisition(state);

  for (const tender of state.acquisition.tenders) {
    // Angebotsfrist abgelaufen → Status "evaluating"
    if (tender.status === "open" && m >= tender.offerDeadlineMin) {
      tender.status = "evaluating";
      log.push({ type: "tender_deadline_passed", tender: tender.id, atMin: m });
    }

    // Entscheidungszeitpunkt → Bewertung
    if ((tender.status === "open" || tender.status === "evaluating") && m >= tender.decisionMin) {
      evaluateTender(state, tender.id);
      log.push({ type: "tender_evaluated", tender: tender.id, atMin: m });
    }

    // Abgelaufene Vertragsangebote ohne Annahme
    if (tender.status === "awarded" && tender.resultingContractOfferId) {
      const contract = (state.contracts?.contracts || []).find(c => c.id === tender.resultingContractOfferId);
      if (contract && contract.status === "offered" && m > contract.startMin) {
        // Vertragsbeginn in der Vergangenheit — Angebot verfällt
        contract.status = "terminated";
        contract.earlyTerminatedAtMin = m;
        tender.status = "expired";
        log.push({ type: "tender_contract_expired", tender: tender.id, atMin: m });

        const customer = customerById(tender.customerId);
        deliverMessage(state, {
          fromId: "system", toId: "player",
          subject: "Vertragsangebot abgelaufen: " + (customer?.name || tender.customerName),
          body: `Das Vertragsangebot aus der Ausschreibung von ${customer?.name || tender.customerName} ist abgelaufen, da es nicht rechtzeitig angenommen wurde.\n\n` +
            `Bestehende Verträge bleiben unberührt.`,
          gameTime: m, category: "operations", priority: "normal",
          linkedRefs: { type: "tender", id: tender.id },
          dedupKey: `tender_expired:${tender.id}`,
        });
      }
    }
  }
}

// Ereigniszeiten für Scheduler
export function getAcquisitionEventTimes(state, t, maxMin) {
  migrateAcquisition(state);
  const times = [];
  for (const tender of state.acquisition.tenders) {
    if (tender.status === "open") {
      if (tender.offerDeadlineMin > t && tender.offerDeadlineMin <= maxMin) times.push(tender.offerDeadlineMin);
      if (tender.decisionMin > t && tender.decisionMin <= maxMin) times.push(tender.decisionMin);
    }
    if (tender.status === "evaluating") {
      if (tender.decisionMin > t && tender.decisionMin <= maxMin) times.push(tender.decisionMin);
    }
    if (tender.status === "awarded" && tender.resultingContractOfferId) {
      const contract = (state.contracts?.contracts || []).find(c => c.id === tender.resultingContractOfferId);
      if (contract && contract.status === "offered" && contract.startMin > t && contract.startMin <= maxMin) {
        times.push(contract.startMin);
      }
    }
  }
  return times;
}

// ---------- UI-Hilfsfunktionen ----------

// Übersicht für UI
export function getAcquisitionOverview(state) {
  migrateAcquisition(state);

  const openTenders = state.acquisition.tenders.filter(t => t.status === "open");
  const evaluatingTenders = state.acquisition.tenders.filter(t => t.status === "evaluating");
  const awardedTenders = state.acquisition.tenders.filter(t => t.status === "awarded");
  const activeNegotiations = state.acquisition.tenders.filter(t =>
    t.negotiation && t.negotiation.status === "active"
  );
  const pendingContractOffers = awardedTenders.filter(t => {
    if (!t.resultingContractOfferId) return false;
    const c = (state.contracts?.contracts || []).find(co => co.id === t.resultingContractOfferId);
    return c && c.status === "offered";
  });

  // Offene Ansprachen
  const openOutreach = Object.entries(state.acquisition.outreach)
    .filter(([_, o]) => o.status === "active")
    .map(([cid, o]) => ({ customerId: cid, ...o }));

  return {
    openTenders: openTenders.length,
    evaluatingTenders: evaluatingTenders.length,
    awardedTenders: awardedTenders.length,
    activeNegotiations: activeNegotiations.length,
    pendingContractOffers: pendingContractOffers.length,
    openOutreach: openOutreach.length,
    tenders: state.acquisition.tenders,
    maxOpenTenders: MAX_OPEN_TENDERS,
    maxNegotiationRounds: MAX_NEGOTIATION_ROUNDS,
  };
}

// Ansprache-Status für einzelnen Kunden
export function getOutreachStatus(state, customerId) {
  migrateAcquisition(state);
  const outreach = state.acquisition.outreach[customerId];
  if (!outreach) {
    return {
      hasOutreach: false,
      canOutreach: true,
      nextAllowedMin: null,
      nextAllowedLabel: null,
    };
  }

  const canOutreach = state.gameTime >= outreach.nextAllowedMin;
  return {
    hasOutreach: true,
    status: outreach.status,
    result: outreach.result,
    resultMessage: outreach.resultMessage,
    lastContactMin: outreach.lastContactMin,
    nextAllowedMin: outreach.nextAllowedMin,
    nextAllowedLabel: formatGameTime(outreach.nextAllowedMin),
    canOutreach,
    tenderId: outreach.tenderId,
  };
}