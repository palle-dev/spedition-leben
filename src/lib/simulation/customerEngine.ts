// Kundenbeziehungs- und Rahmenvertrag-Engine für FERNWERK.
// Dauerkundenbeziehungen mit Vertrauen, Statistiken und Rahmenverträgen.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.
//
// Design-Prinzipien:
// - Inkrementelle Aktualisierung bei Ereignissen (keine Vollscans)
// - Idempotente Reputationserfassung (order._reputationApplied)
// - Deterministische Angebotserstellung (kein Zufall)
// - Versionierte Migration für alte Spielstände

import {
  CUSTOMER_PROFILES, CITIES, getDistance, driveMinutes,
  dayOf, formatGameTime,
  LOAD_MIN, UNLOAD_MIN, WORK_BUDGET_MIN, REST_MIN,
  PRICE_BASE_CENTS, PRICE_PER_KM_CENTS, PRICE_PER_TON_CENTS,
} from "./gameRules.ts";
import { computeOfferPrice } from "./marketEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";

// ---------- Konfigurierbare Regeln ----------
export const TRUST_START = 50;
export const TRUST_TIMELY_DELTA = +2;
export const TRUST_LATE_DELTA = -4;
export const TRUST_FAILED_DELTA = -6;
export const TRUST_CANCELLED_DELTA = -6;
export const STAMMKUNDE_MIN_TRANSPORTS = 5;
export const STAMMKUNDE_MIN_TRUST = 60;
export const CONTRACT_DISCOUNT = 0.05; // 5% Abschlag
export const CONTRACT_DURATION_DAYS = 7;
export const CONTRACT_TONS = 8;
export const CONTRACT_DELIVERY_BUFFER_HOURS = 8; // großzügiges Lieferfenster
export const RELATION_VERSION = 1;
export const CONTRACT_VERSION = 1;

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function customerById(customerId) {
  return CUSTOMER_PROFILES.find(c => c.id === customerId) || null;
}

// ---------- Migration ----------
export function migrateCustomerRelations(state) {
  if (!state.customerRelations || state.customerRelations.version !== RELATION_VERSION) {
    // Alte customerRelations (falls vorhanden aus market.customerRelations) übernehmen
    const oldRelations = (state.market?.customerRelations) || (state.customerRelations?.relations) || {};
    state.customerRelations = {
      version: RELATION_VERSION,
      relations: {},
    };
    // Für jeden Kundenprofil einen neutralen Beziehungsdatensatz anlegen.
    // Historische Werte werden NICHT rekonstruiert — die Statistik beginnt
    // neutral und ist ab Einführung dieses Systems erfasst.
    for (const c of CUSTOMER_PROFILES) {
      const existing = oldRelations[c.id];
      state.customerRelations.relations[c.id] = {
        customerId: c.id,
        trust: TRUST_START,
        completedTransports: 0,
        timelyTransports: 0,
        lateTransports: 0,
        failedTransports: 0,
        cancelledTransports: 0,
        revenueCents: 0,
        lastCompletedAtMin: null,
        trackingSinceMin: state.gameTime || 480,
        history: [],
        isStammkunde: false,
      };
      // Falls alte Daten vorhanden und vollständig, übernehmen.
      // Aber: wir können nicht zuverlässig rekonstruieren, daher beginnen wir neutral.
      // (Bestehende Aufträge, Konten etc. bleiben unberührt.)
    }
  }
  // Sicherstellen, dass alle Kunden einen Datensatz haben
  for (const c of CUSTOMER_PROFILES) {
    if (!state.customerRelations.relations[c.id]) {
      state.customerRelations.relations[c.id] = {
        customerId: c.id,
        trust: TRUST_START,
        completedTransports: 0,
        timelyTransports: 0,
        lateTransports: 0,
        failedTransports: 0,
        cancelledTransports: 0,
        revenueCents: 0,
        lastCompletedAtMin: null,
        trackingSinceMin: state.gameTime || 480,
        history: [],
        isStammkunde: false,
      };
    }
  }
}

export function migrateContracts(state) {
  if (!state.contracts || state.contracts.version !== CONTRACT_VERSION) {
    state.contracts = {
      version: CONTRACT_VERSION,
      contracts: [],
    };
  }
}

// ---------- Beziehungsdatensatz ----------
export function getCustomerRelation(state, customerId) {
  if (!state.customerRelations) migrateCustomerRelations(state);
  return state.customerRelations.relations[customerId] || null;
}

export function isStammkunde(state, customerId) {
  const r = getCustomerRelation(state, customerId);
  if (!r) return false;
  return r.completedTransports >= STAMMKUNDE_MIN_TRANSPORTS && r.trust >= STAMMKUNDE_MIN_TRUST;
}

export function getStammkundenList(state) {
  return CUSTOMER_PROFILES.filter(c => isStammkunde(state, c.id));
}

// Prüft und aktualisiert den Stammkunden-Status. Wird nach jeder
// Reputationänderung aufgerufen. Gibt true zurück wenn der Status
// neu erreicht wurde (für Mail-Benachrichtigung).
function checkStammkundeStatus(state, customerId) {
  const r = getCustomerRelation(state, customerId);
  if (!r) return false;
  const wasStammkunde = r.isStammkunde;
  r.isStammkunde = r.completedTransports >= STAMMKUNDE_MIN_TRANSPORTS && r.trust >= STAMMKUNDE_MIN_TRUST;
  return r.isStammkunde && !wasStammkunde;
}

// ---------- Reputationserfassung (idempotent) ----------
// Wird bei Lieferung, Fehlschlag und Stornierung aufgerufen.
// outcome: "timely" | "late" | "failed" | "cancelled"
// paymentCents: tatsächlich erzielte Vergütung (nur bei timely/late)
export function recordOrderOutcome(state, order, outcome, m, paymentCents) {
  if (!order || !order.customerId) return;
  if (order._reputationApplied) return;
  order._reputationApplied = true;

  const r = getCustomerRelation(state, order.customerId);
  if (!r) return;

  let delta = 0;
  let reason = "";

  if (outcome === "timely") {
    delta = TRUST_TIMELY_DELTA;
    reason = "Pünktliche Lieferung";
    r.timelyTransports++;
    r.completedTransports++;
    if (paymentCents) r.revenueCents += paymentCents;
    r.lastCompletedAtMin = m;
  } else if (outcome === "late") {
    delta = TRUST_LATE_DELTA;
    reason = "Verspätete Lieferung";
    r.lateTransports++;
    r.completedTransports++;
    if (paymentCents) r.revenueCents += paymentCents;
    r.lastCompletedAtMin = m;
  } else if (outcome === "failed") {
    delta = TRUST_FAILED_DELTA;
    reason = "Gescheiterter Transport";
    r.failedTransports++;
  } else if (outcome === "cancelled") {
    delta = TRUST_CANCELLED_DELTA;
    reason = "Stornierter Transport";
    r.cancelledTransports++;
  }

  r.trust = clamp(r.trust + delta, 0, 100);
  r.history = r.history || [];
  r.history.push({ min: m, type: outcome, delta, reason, orderId: order.id, trustAfter: r.trust });
  // Historie begrenzen (letzte 50 Einträge)
  if (r.history.length > 50) r.history = r.history.slice(-50);

  const becameStammkunde = checkStammkundeStatus(state, order.customerId);
  if (becameStammkunde) {
    const customer = customerById(order.customerId);
    pushEvent(state, {
      type: "stammkunde_reached",
      gameTime: m, isSystem: true,
      details: { customerId: order.customerId, customerName: customer?.name || "", trust: r.trust, completedTransports: r.completedTransports },
      dedupKey: "stammkunde:" + order.customerId,
    });
  }

  // Vertragsstatistiken aktualisieren falls Vertragsauftrag
  if (order.contractId) {
    updateContractOrderOutcome(state, order, outcome, m, paymentCents);
  }
}

// ---------- Rahmenverträge ----------
// Deterministische Angebotserstellung basierend auf Kundenprofil.
export function generateContractOffer(state, customerId) {
  if (!state.contracts) migrateContracts(state);
  if (!state.customerRelations) migrateCustomerRelations(state);

  const customer = customerById(customerId);
  if (!customer) throw new Error("Kunde nicht gefunden.");

  // Stammkunde prüfen
  if (!isStammkunde(state, customerId)) {
    throw new Error("Rahmenverträge sind nur für Stammkunden verfügbar.");
  }

  // Maximal ein vereinbarter oder aktiver Vertrag pro Kunde
  const existing = state.contracts.contracts.find(c =>
    c.customerId === customerId && (c.status === "offered" || c.status === "active")
  );
  if (existing) {
    return { contract: existing, isNew: false };
  }

  // Deterministische Auswahl: erste bevorzugte Relation
  const relation = customer.preferredRelations[0];
  if (!relation) throw new Error("Kunde hat keine bevorzugten Relationen.");
  const fromCity = relation[0];
  const toCity = relation[1];
  // Prüfen, dass fromCity ein Depot des Kunden ist
  if (!customer.depots.includes(fromCity)) {
    // Fallback: erstes Depot als fromCity, erstes preferredRelations-Ziel als toCity
    const fallbackFrom = customer.depots[0];
    const fallbackRel = customer.preferredRelations.find(r => r[0] === fallbackFrom || r[1] === fallbackFrom);
    if (fallbackRel) {
      return generateContractOfferInternal(state, customerId, customer, fallbackRel[0] === fallbackFrom ? fallbackRel : [fallbackRel[1], fallbackRel[0]]);
    }
    return generateContractOfferInternal(state, customerId, customer, [fallbackFrom, toCity]);
  }
  return generateContractOfferInternal(state, customerId, customer, relation);
}

function generateContractOfferInternal(state, customerId, customer, relation) {
  const fromCity = relation[0];
  const toCity = relation[1];
  const cargo = customer.cargoTypes[0];
  const tons = CONTRACT_TONS;

  // Deterministische Auswahl: 1 oder 2 Transporte pro Tag
  // Hash aus customerId → 0 oder 1
  let hash = 0;
  for (let i = 0; i < customerId.length; i++) hash = ((hash << 5) - hash + customerId.charCodeAt(i)) | 0;
  const transportsPerDay = (Math.abs(hash) % 2) + 1; // 1 oder 2

  // Preisberechnung: normale Preisformel, 5% Abschlag
  const km = getDistance(fromCity, toCity);
  const basePrice = computeOfferPrice(km, tons, "normal", 1.0);
  const paymentPerTransportCents = Math.round(basePrice * (1 - CONTRACT_DISCOUNT));

  // Lieferfenster: Fahrzeit + Beladung + Entladung + Puffer
  const driveMin = driveMinutes(km);
  const opMin = LOAD_MIN + driveMin + UNLOAD_MIN;
  const deliveryBufferMin = CONTRACT_DELIVERY_BUFFER_HOURS * 60;

  // Beginn: nächster Spieltag um Mitternacht
  const startMin = (Math.floor(state.gameTime / 1440) + 1) * 1440;
  const endMin = startMin + CONTRACT_DURATION_DAYS * 1440;

  // Fahrzeuganforderungen: Standard-Lkw reicht (kein Gefahrgut)
  const requiresDg = false;
  const minCapacityTons = tons;

  // Kapazitätsbedarf-Schätzung
  const totalTransports = transportsPerDay * CONTRACT_DURATION_DAYS;
  const estimatedRevenueCents = paymentPerTransportCents * totalTransports;

  const contract = {
    id: uid(state, "ctr"),
    customerId,
    customerName: customer.name,
    fromCity, toCity, cargo, tons,
    transportsPerDay,
    paymentPerTransportCents,
    startMin,
    endMin,
    startDay: dayOf(startMin),
    endDay: dayOf(endMin),
    deliveryBufferMin,
    driveMin,
    opMin,
    requiresDg,
    minCapacityTons,
    status: "offered",
    offerCreatedAtMin: state.gameTime,
    acceptedAtMin: null,
    // Statistiken (inkrementell)
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
  };

  state.contracts.contracts.push(contract);
  return { contract, isNew: true };
}

// Vertragsabschluss
export function acceptContract(state, contractId) {
  if (!state.contracts) migrateContracts(state);
  const contract = state.contracts.contracts.find(c => c.id === contractId);
  if (!contract) throw new Error("Vertrag nicht gefunden.");
  if (contract.status !== "offered") throw new Error("Vertrag ist nicht mehr verfügbar.");

  // Erneute Stammkunde-Prüfung (kann sich geändert haben)
  if (!isStammkunde(state, contract.customerId)) {
    throw new Error("Kunde ist kein Stammkunde mehr.");
  }

  // Maximal ein aktiver Vertrag pro Kunde
  const active = state.contracts.contracts.find(c =>
    c.customerId === contract.customerId && c.status === "active"
  );
  if (active) throw new Error("Kunde hat bereits einen aktiven Vertrag.");

  contract.status = "active";
  contract.acceptedAtMin = state.gameTime;

  const customer = customerById(contract.customerId);
  // Postfach: Vertragsbestätigung
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Rahmenvertrag abgeschlossen: " + (customer?.name || contract.customerName),
    body: `Der Rahmenvertrag mit ${customer?.name || contract.customerName} wurde abgeschlossen.\n\n` +
      `Relation: ${contract.fromCity} → ${contract.toCity}\n` +
      `Fracht: ${contract.cargo}, ${contract.tons} t\n` +
      `Transporte pro Tag: ${contract.transportsPerDay}\n` +
      `Vergütung pro Transport: ${(contract.paymentPerTransportCents / 100).toFixed(2)} €\n` +
      `Laufzeit: Tag ${contract.startDay} bis Tag ${contract.endDay}\n` +
      `Geplanter Gesamtumsatz: ${((contract.paymentPerTransportCents * contract.transportsPerDay * CONTRACT_DURATION_DAYS) / 100).toFixed(2)} €\n\n` +
      `Die vereinbarten Transporte erscheinen automatisch in der Auftragsliste und können disponiert werden.`,
    gameTime: state.gameTime, category: "operations", priority: "normal",
    linkedRefs: { type: "contract", id: contract.id },
    dedupKey: `contract_accepted:${contract.id}`,
  });

  pushEvent(state, {
    type: "contract_accepted",
    gameTime: state.gameTime, isSystem: true,
    details: {
      contractId: contract.id, customerId: contract.customerId,
      customerName: customer?.name || contract.customerName,
      fromCity: contract.fromCity, toCity: contract.toCity,
      paymentPerTransportCents: contract.paymentPerTransportCents,
      transportsPerDay: contract.transportsPerDay,
      startDay: contract.startDay, endDay: contract.endDay,
    },
    dedupKey: "contract_accepted:" + contract.id,
  });

  return { ok: true, contract };
}

// Vorzeitige Beendigung
export function terminateContractEarly(state, contractId) {
  if (!state.contracts) migrateContracts(state);
  const contract = state.contracts.contracts.find(c => c.id === contractId);
  if (!contract) throw new Error("Vertrag nicht gefunden.");
  if (contract.status !== "active") throw new Error("Nur aktive Verträge können beendet werden.");

  contract.status = "terminated";
  contract.earlyTerminatedAtMin = state.gameTime;

  // Einmalige Vertrauensminderung
  const r = getCustomerRelation(state, contract.customerId);
  if (r) {
    r.trust = clamp(r.trust + TRUST_CANCELLED_DELTA, 0, 100);
    r.history = r.history || [];
    r.history.push({ min: state.gameTime, type: "contract_terminated", delta: TRUST_CANCELLED_DELTA, reason: "Vorzeitige Vertragsbeendigung", contractId, trustAfter: r.trust });
    if (r.history.length > 50) r.history = r.history.slice(-50);
    checkStammkundeStatus(state, contract.customerId);
  }

  const customer = customerById(contract.customerId);
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Rahmenvertrag vorzeitig beendet: " + (customer?.name || contract.customerName),
    body: `Der Rahmenvertrag mit ${customer?.name || contract.customerName} wurde vorzeitig beendet.\n\n` +
      `Bereits angenommene Aufträge bleiben bestehen und werden weiter abgewickelt.\n` +
      `Es werden keine neuen Transporte mehr erzeugt.\n\n` +
      `Vertrauen: -${Math.abs(TRUST_CANCELLED_DELTA)} Punkte`,
    gameTime: state.gameTime, category: "operations", priority: "normal",
    linkedRefs: { type: "contract", id: contract.id },
    dedupKey: `contract_terminated:${contract.id}`,
  });

  pushEvent(state, {
    type: "contract_terminated",
    gameTime: state.gameTime, isSystem: true,
    details: { contractId: contract.id, customerId: contract.customerId, customerName: customer?.name || contract.customerName },
    dedupKey: "contract_terminated:" + contract.id,
  });

  return { ok: true, contract };
}

// ---------- Tägliche Vertragsauftragsgenerierung ----------
// Wird um Mitternacht in processEventsAt aufgerufen.
// Erzeugt die vereinbarten Transporte für den aktuellen Leistungstag.
export function processContractDay(state, m, log) {
  if (!state.contracts) migrateContracts(state);
  const day = dayOf(m);

  for (const contract of state.contracts.contracts) {
    if (contract.status !== "active") continue;
    // Nur Leistungstage innerhalb der Laufzeit
    if (day < contract.startDay || day > contract.endDay) continue;
    // Bereits für diesen Tag generiert?
    if (contract.lastDayGenerated >= day) continue;

    const customer = customerById(contract.customerId);
    if (!customer) continue;

    for (let n = 1; n <= contract.transportsPerDay; n++) {
      // Eindeutige ID: contractId + day + transportNo
      const orderId = contract.id + ":d" + day + ":n" + n;
      // Prüfen, ob bereits vorhanden (Idempotenz)
      if (state.orders.some(o => o.id === orderId)) continue;

      // Lieferfrist: Tagesbeginn + Fahrzeit + Operationen + Puffer
      const dayStart = (day - 1) * 1440;
      const deliveryDeadline = dayStart + contract.opMin + contract.deliveryBufferMin;

      const order = {
        id: orderId,
        customerId: contract.customerId,
        customer: contract.customerName,
        shipmentId: "S" + orderId,
        fromCity: contract.fromCity,
        toCity: contract.toCity,
        cargo: contract.cargo,
        tons: contract.tons,
        paymentCents: contract.paymentPerTransportCents,
        offerType: "contract",
        relationFactor: 1.0,
        publishedAtMin: m,
        acceptDeadlineMin: null, // bereits angenommen
        earliestPickupMin: dayStart + 480, // 08:00
        latestLoadStartMin: dayStart + 960, // 16:00
        deliveryDeadlineMin: deliveryDeadline,
        paymentTermsDays: 0,
        paymentDueMin: null,
        status: "angenommen",
        acceptedAtMin: m,
        startedAtMin: null,
        deliveredAtMin: null,
        paidCents: null,
        acceptedById: "contract",
        acceptedByName: "Rahmenvertrag",
        plannedById: null,
        plannedByName: null,
        feasible: true,
        history: [{ type: "contract_generated", min: m, actor: "contract", details: { contractId: contract.id, day, transportNo: n } }],
        isContractOrder: true,
        contractId: contract.id,
        contractDay: day,
        contractTransportNo: n,
      };
      state.orders.push(order);
      contract.orderIds.push(orderId);
      contract.generatedCount++;
      log.push({ type: "contract_order_generated", contract: contract.id, order: orderId, day, transportNo: n, atMin: m });
    }

    contract.lastDayGenerated = day;
  }
}

// Vertragsstatistiken bei Auftragsabschluss aktualisieren
function updateContractOrderOutcome(state, order, outcome, m, paymentCents) {
  const contract = state.contracts?.contracts.find(c => c.id === order.contractId);
  if (!contract) return;

  if (outcome === "timely") {
    contract.timelyCount++;
    contract.deliveredCount++;
    if (paymentCents) contract.revenueCents += paymentCents;
  } else if (outcome === "late") {
    contract.lateCount++;
    contract.deliveredCount++;
    if (paymentCents) contract.revenueCents += paymentCents;
  } else if (outcome === "failed") {
    contract.failedCount++;
  } else if (outcome === "cancelled") {
    contract.cancelledCount++;
  }
}

// ---------- Vertragsauswertung ----------
// Wird um Mitternacht aufgerufen. Prüft, ob Verträge abgewickelt sind.
export function evaluateContracts(state, m, log) {
  if (!state.contracts) migrateContracts(state);

  for (const contract of state.contracts.contracts) {
    if (contract.status !== "active" && contract.status !== "terminated") continue;
    // Nur nach Ablauf der Leistungszeit auswerten
    if (m < contract.endMin) continue;
    if (contract.evaluatedAtMin !== null) continue;

    // Prüfen, ob alle zugehörigen Aufträge einen Endzustand erreicht haben
    const doneStatuses = new Set(["geliefert", "failed", "storniert", "expired"]);
    const allDone = contract.orderIds.every(oid => {
      const o = state.orders.find(x => x.id === oid);
      return !o || doneStatuses.has(o.status);
    });
    if (!allDone) continue;

    // Auswertung abschließen
    contract.evaluatedAtMin = m;
    contract.status = "completed";

    const customer = customerById(contract.customerId);
    const totalTransports = contract.transportsPerDay * CONTRACT_DURATION_DAYS;
    const successRate = totalTransports > 0 ? (contract.deliveredCount / totalTransports * 100).toFixed(0) : 0;

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Rahmenvertrag abgeschlossen: " + (customer?.name || contract.customerName),
      body: `Der Rahmenvertrag mit ${customer?.name || contract.customerName} wurde ausgewertet.\n\n` +
        `Vereinbarte Transporte: ${totalTransports}\n` +
        `Pünktlich geliefert: ${contract.timelyCount}\n` +
        `Verspätet geliefert: ${contract.lateCount}\n` +
        `Gescheitert: ${contract.failedCount}\n` +
        `Storniert: ${contract.cancelledCount}\n` +
        `Erfüllungsquote: ${successRate}%\n` +
        `Umsatz: ${(contract.revenueCents / 100).toFixed(2)} €\n\n` +
        `Vertrauen nach Auswertung: ${getCustomerRelation(state, contract.customerId)?.trust || 0}/100`,
      gameTime: m, category: "operations", priority: "normal",
      linkedRefs: { type: "contract", id: contract.id },
      dedupKey: `contract_completed:${contract.id}`,
    });

    pushEvent(state, {
      type: "contract_completed",
      gameTime: m, isSystem: true,
      details: {
        contractId: contract.id, customerId: contract.customerId,
        customerName: customer?.name || contract.customerName,
        timelyCount: contract.timelyCount, lateCount: contract.lateCount,
        failedCount: contract.failedCount, cancelledCount: contract.cancelledCount,
        revenueCents: contract.revenueCents, successRate,
      },
      dedupKey: "contract_completed:" + contract.id,
    });

    log.push({ type: "contract_completed", contract: contract.id, atMin: m });
  }
}

// ---------- Benachrichtigung: Bevorstehendes Vertragsende ----------
// Wird um Mitternacht aufgerufen. Sendet einmalig eine Nachricht,
// wenn ein Vertrag am Folgetag endet.
export function notifyContractEndingSoon(state, m, log) {
  if (!state.contracts) migrateContracts(state);
  const tomorrow = m + 1440;

  for (const contract of state.contracts.contracts) {
    if (contract.status !== "active") continue;
    if (contract._endNotified) continue;
    if (contract.endMin !== tomorrow) continue;

    contract._endNotified = true;
    const customer = customerById(contract.customerId);
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Rahmenvertrag endet morgen: " + (customer?.name || contract.customerName),
      body: `Der Rahmenvertrag mit ${customer?.name || contract.customerName} endet morgen.\n\n` +
        `Noch offene Transporte werden weiter abgewickelt.\n` +
        `Nach Abschluss aller Aufträge erhalten Sie die Auswertung.`,
      gameTime: m, category: "operations", priority: "normal",
      linkedRefs: { type: "contract", id: contract.id },
      dedupKey: `contract_ending:${contract.id}`,
    });
  }
}

// ---------- UI-Hilfsfunktionen ----------
export function getCustomerSummary(state, customerId) {
  const customer = customerById(customerId);
  if (!customer) return null;
  const r = getCustomerRelation(state, customerId);
  const contracts = (state.contracts?.contracts || []).filter(c => c.customerId === customerId);
  const activeContract = contracts.find(c => c.status === "active" || c.status === "offered");
  const completedContracts = contracts.filter(c => c.status === "completed" || c.status === "terminated");

  return {
    customer,
    relation: r,
    isStammkunde: r ? r.isStammkunde : false,
    activeContract: activeContract || null,
    completedContracts,
    contractCount: contracts.length,
  };
}

export function getAllCustomerSummaries(state) {
  return CUSTOMER_PROFILES.map(c => {
    const r = getCustomerRelation(state, c.id);
    const contracts = (state.contracts?.contracts || []).filter(co => co.customerId === c.id);
    const activeContract = contracts.find(co => co.status === "active" || co.status === "offered");
    return {
      id: c.id,
      name: c.name,
      industry: c.industry,
      contact: c.contact,
      depots: c.depots,
      preferredRelations: c.preferredRelations,
      cargoTypes: c.cargoTypes,
      trust: r ? r.trust : TRUST_START,
      completedTransports: r ? r.completedTransports : 0,
      timelyTransports: r ? r.timelyTransports : 0,
      lateTransports: r ? r.lateTransports : 0,
      failedTransports: r ? r.failedTransports : 0,
      cancelledTransports: r ? r.cancelledTransports : 0,
      revenueCents: r ? r.revenueCents : 0,
      lastCompletedAtMin: r ? r.lastCompletedAtMin : null,
      isStammkunde: r ? r.isStammkunde : false,
      trackingSinceMin: r ? r.trackingSinceMin : null,
      contractStatus: activeContract ? activeContract.status : (contracts.length > 0 ? "history" : "none"),
      activeContract,
    };
  });
}

// Kapazitätsbedarf-Schätzung für ein Vertragsangebot
export function estimateContractCapacity(state, contract) {
  const totalTransports = contract.transportsPerDay * CONTRACT_DURATION_DAYS;
  const driveMin = contract.driveMin;
  const opMin = contract.opMin;
  // Grobe Schätzung: Wie viele Fahrzeug-Fahrer-Paare werden pro Tag benötigt?
  // Ein Transport dauert opMin Fahrzeit. Bei 1 Transport/Tag reicht 1 Paar.
  // Bei 2 Transporten/Tag können sie sequenziell von einem Paar erledigt werden,
  // wenn die Fahrzeit unter dem Tagesbudget liegt.
  const pairsNeededPerDay = contract.transportsPerDay;
  const totalWorkMin = totalTransports * opMin;
  return {
    totalTransports,
    pairsNeededPerDay,
    totalWorkMin,
    driveMin,
    opMin,
    estimatedRevenueCents: contract.paymentPerTransportCents * totalTransports,
  };
}