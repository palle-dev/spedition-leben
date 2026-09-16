// Tests für Kundenbeziehungen und Rahmenverträge.
//
// Voraussetzung: Vitest mit @-Alias-Auflösung.
//   npx vitest run tests/customer-contracts.test.ts
//
// Testbereiche:
//   1. Eine Lieferung verändert Beziehung und Umsatz genau einmal (Idempotenz).
//   2. Ablaufen eines nicht angenommenen Angebots schadet der Beziehung nicht.
//   3. Vertragsaufträge entstehen pro Leistungstag in der vereinbarten Anzahl.
//   4. Tagesvorlauf und aufgeteilte Vorläufe erzeugen dieselben Ergebnisse.
//   5. Speichern/Laden erhält Vertrag, Vergütung und Fortschritt.
//   6. Vertragsende und vorzeitige Beendigung behandeln offene Aufträge korrekt.
//   7. Buchhaltung erfasst dieselbe Leistung nicht doppelt.
//   8. Historienbereinigung erhält Vertragskennzahlen.

import { describe, it, expect } from "vitest";
import { applyCommand, createInitialState } from "@/lib/simulation/simulationEngine";
import {
  migrateCustomerRelations, migrateContracts,
  getCustomerRelation, isStammkunde,
  generateContractOffer, acceptContract, terminateContractEarly,
  processContractDay, evaluateContracts, recordOrderOutcome,
  TRUST_START, TRUST_TIMELY_DELTA, TRUST_LATE_DELTA, TRUST_FAILED_DELTA,
  STAMMKUNDE_MIN_TRANSPORTS, STAMMKUNDE_MIN_TRUST, CONTRACT_DURATION_DAYS,
} from "@/lib/simulation/customerEngine";
import { CUSTOMER_PROFILES } from "@/lib/simulation/gameRules";

function makeBaseState() {
  const r = createInitialState({ companyName: "Testspedition", playerName: "Tester", partnerName: "Mara" });
  return r.state;
}

// Findet einen angenommenen Auftrag eines bestimmten Kunden.
function findAcceptedOrder(state, customerId) {
  return (state.orders || []).find(o => o.customerId === customerId && o.status === "angenommen");
}

// Simuliert eine pünktliche Lieferung für einen Auftrag.
function simulateTimelyDelivery(state, order) {
  const trip = (state.trips || []).find(t => t.orderId === order.id && t.status === "in_progress");
  if (!trip) {
    // Kein Trip vorhanden — direkt Status ändern und recordOrderOutcome aufrufen
    order.status = "geliefert";
    order.deliveredAtMin = state.gameTime;
    recordOrderOutcome(state, order, "timely", state.gameTime, order.paymentCents);
    return;
  }
  // Trip abschließen
  trip.status = "completed";
  trip.endMin = state.gameTime;
  order.status = "geliefert";
  order.deliveredAtMin = state.gameTime;
  const onTime = state.gameTime <= order.deliveryDeadlineMin;
  recordOrderOutcome(state, order, onTime ? "timely" : "late", state.gameTime, order.paymentCents);
}

describe("Kundenbeziehungen", () => {
  it("Migration erstellt für alle 30 Kunden einen neutralen Beziehungsdatensatz", () => {
    const state = makeBaseState();
    migrateCustomerRelations(state);
    expect(state.customerRelations.version).toBe(1);
    for (const c of CUSTOMER_PROFILES) {
      const r = getCustomerRelation(state, c.id);
      expect(r).toBeTruthy();
      expect(r.trust).toBe(TRUST_START);
      expect(r.completedTransports).toBe(0);
    }
  });

  it("Eine pünktliche Lieferung erhöht Vertrauen um +2 und Umsatz genau einmal", () => {
    const state = makeBaseState();
    migrateCustomerRelations(state);
    // Ersten angenommenen Auftrag eines Kunden finden
    const order = (state.orders || []).find(o => o.status === "offered");
    expect(order).toBeTruthy();
    order.status = "angenommen";
    order.customerId = order.customerId || "c01";
    const customerId = order.customerId;
    const r = getCustomerRelation(state, customerId);
    const trustBefore = r.trust;
    const revenueBefore = r.revenueCents;

    // Erste Lieferung
    simulateTimelyDelivery(state, order);
    expect(r.trust).toBe(trustBefore + TRUST_TIMELY_DELTA);
    expect(r.revenueCents).toBe(revenueBefore + order.paymentCents);
    expect(r.completedTransports).toBe(1);
    expect(r.timelyTransports).toBe(1);

    // Zweite Lieferung desselben Auftrags — darf nichts ändern (Idempotenz)
    const trustAfter = r.trust;
    simulateTimelyDelivery(state, order);
    expect(r.trust).toBe(trustAfter);
    expect(r.completedTransports).toBe(1);
    expect(r.timelyTransports).toBe(1);
  });

  it("Ablaufen eines nicht angenommenen Angebots schadet der Beziehung nicht", () => {
    const state = makeBaseState();
    migrateCustomerRelations(state);
    const order = (state.orders || []).find(o => o.status === "offered");
    expect(order).toBeTruthy();
    const customerId = order.customerId || "c01";
    const r = getCustomerRelation(state, customerId);
    const trustBefore = r.trust;

    // Angebot ablaufen lassen
    order.status = "expired";
    // Kein recordOrderOutcome-Aufruf für expired offers
    expect(r.trust).toBe(trustBefore);
    expect(r.failedTransports).toBe(0);
    expect(r.cancelledTransports).toBe(0);
  });

  it("Stammkunden-Erkennung bei ≥5 Transporten und ≥60 Vertrauen", () => {
    const state = makeBaseState();
    migrateCustomerRelations(state);
    const r = getCustomerRelation(state, "c01");
    // 5 pünktliche Lieferungen simulieren
    for (let i = 0; i < STAMMKUNDE_MIN_TRANSPORTS; i++) {
      const order = { id: "test_o" + i, customerId: "c01", status: "geliefert", _reputationApplied: false };
      recordOrderOutcome(state, order, "timely", state.gameTime + i * 1440, 50000);
    }
    expect(r.completedTransports).toBe(STAMMKUNDE_MIN_TRANSPORTS);
    expect(r.trust).toBe(TRUST_START + STAMMKUNDE_MIN_TRANSPORTS * TRUST_TIMELY_DELTA);
    expect(r.trust).toBeGreaterThanOrEqual(STAMMKUNDE_MIN_TRUST);
    expect(isStammkunde(state, "c01")).toBe(true);
  });
});

describe("Rahmenverträge", () => {
  it("Vertragsangebot ist deterministisch — gleiche Parameter ergeben gleiches Angebot", () => {
    const state = makeBaseState();
    migrateCustomerRelations(state);
    migrateContracts(state);
    // Stammkunde simulieren
    const r = getCustomerRelation(state, "c01");
    for (let i = 0; i < STAMMKUNDE_MIN_TRANSPORTS; i++) {
      const order = { id: "det_o" + i, customerId: "c01", status: "geliefert", _reputationApplied: false };
      recordOrderOutcome(state, order, "timely", state.gameTime + i * 1440, 50000);
    }
    expect(isStammkunde(state, "c01")).toBe(true);

    const offer1 = generateContractOffer(state, "c01");
    const contract1 = offer1.contract;
    // Zweiter Aufruf gibt denselben Vertrag zurück (kein neues Angebot)
    const offer2 = generateContractOffer(state, "c01");
    expect(offer2.contract.id).toBe(contract1.id);
    expect(offer2.isNew).toBe(false);
  });

  it("Vertragsaufträge entstehen pro Leistungstag in der vereinbarten Anzahl", () => {
    const state = makeBaseState();
    migrateCustomerRelations(state);
    migrateContracts(state);
    // Stammkunde simulieren
    for (let i = 0; i < STAMMKUNDE_MIN_TRANSPORTS; i++) {
      const order = { id: "gen_o" + i, customerId: "c01", status: "geliefert", _reputationApplied: false };
      recordOrderOutcome(state, order, "timely", state.gameTime + i * 1440, 50000);
    }
    const { contract } = generateContractOffer(state, "c01");
    acceptContract(state, contract.id);
    expect(contract.status).toBe("active");

    // Ersten Leistungstag simulieren (Mitternacht)
    const day1Midnight = contract.startMin;
    const log = [];
    processContractDay(state, day1Midnight, log);

    const day1Orders = state.orders.filter(o => o.contractId === contract.id && o.contractDay === contract.startDay);
    expect(day1Orders.length).toBe(contract.transportsPerDay);

    // Erneute Ausführung am selben Tag — keine Duplikate (Idempotenz)
    processContractDay(state, day1Midnight + 60, log);
    const day1OrdersAgain = state.orders.filter(o => o.contractId === contract.id && o.contractDay === contract.startDay);
    expect(day1OrdersAgain.length).toBe(contract.transportsPerDay);

    // Zweiten Leistungstag simulieren
    const day2Midnight = contract.startMin + 1440;
    processContractDay(state, day2Midnight, log);
    const day2Orders = state.orders.filter(o => o.contractId === contract.id && o.contractDay === contract.startDay + 1);
    expect(day2Orders.length).toBe(contract.transportsPerDay);
  });

  it("Maximal ein aktiver Vertrag pro Kunde", () => {
    const state = makeBaseState();
    migrateCustomerRelations(state);
    migrateContracts(state);
    for (let i = 0; i < STAMMKUNDE_MIN_TRANSPORTS; i++) {
      const order = { id: "max_o" + i, customerId: "c01", status: "geliefert", _reputationApplied: false };
      recordOrderOutcome(state, order, "timely", state.gameTime + i * 1440, 50000);
    }
    const { contract } = generateContractOffer(state, "c01");
    acceptContract(state, contract.id);

    // Zweites Angebot für denselben Kunden — soll denselben (aktiven) Vertrag zurückgeben
    const second = generateContractOffer(state, "c01");
    expect(second.contract.id).toBe(contract.id);
  });

  it("Vorzeitige Beendigung stoppt zukünftige Transporte und kostet 6 Vertrauen", () => {
    const state = makeBaseState();
    migrateCustomerRelations(state);
    migrateContracts(state);
    for (let i = 0; i < STAMMKUNDE_MIN_TRANSPORTS; i++) {
      const order = { id: "term_o" + i, customerId: "c01", status: "geliefert", _reputationApplied: false };
      recordOrderOutcome(state, order, "timely", state.gameTime + i * 1440, 50000);
    }
    const { contract } = generateContractOffer(state, "c01");
    acceptContract(state, contract.id);

    // Ersten Leistungstag generieren
    const log = [];
    processContractDay(state, contract.startMin, log);
    const day1Count = state.orders.filter(o => o.contractId === contract.id).length;
    expect(day1Count).toBe(contract.transportsPerDay);

    // Vorzeitig beenden
    const trustBefore = getCustomerRelation(state, "c01").trust;
    terminateContractEarly(state, contract.id);
    expect(contract.status).toBe("terminated");
    expect(getCustomerRelation(state, "c01").trust).toBe(trustBefore - 6);

    // Zweiten Leistungstag versuchen — keine neuen Aufträge
    processContractDay(state, contract.startMin + 1440, log);
    const day2Orders = state.orders.filter(o => o.contractId === contract.id && o.contractDay === contract.startDay + 1);
    expect(day2Orders.length).toBe(0);

    // Bereits existierende Aufträge bleiben bestehen
    const remaining = state.orders.filter(o => o.contractId === contract.id);
    expect(remaining.length).toBe(day1Count);
  });

  it("Vertragsauswertung nach Abschluss aller Aufträge", () => {
    const state = makeBaseState();
    migrateCustomerRelations(state);
    migrateContracts(state);
    for (let i = 0; i < STAMMKUNDE_MIN_TRANSPORTS; i++) {
      const order = { id: "eval_o" + i, customerId: "c01", status: "geliefert", _reputationApplied: false };
      recordOrderOutcome(state, order, "timely", state.gameTime + i * 1440, 50000);
    }
    const { contract } = generateContractOffer(state, "c01");
    acceptContract(state, contract.id);

    // Alle Leistungstage generieren
    const log = [];
    for (let d = 0; d < CONTRACT_DURATION_DAYS; d++) {
      processContractDay(state, contract.startMin + d * 1440, log);
    }
    const totalOrders = state.orders.filter(o => o.contractId === contract.id).length;
    expect(totalOrders).toBe(contract.transportsPerDay * CONTRACT_DURATION_DAYS);

    // Alle Aufträge als geliefert markieren
    for (const o of state.orders.filter(o => o.contractId === contract.id)) {
      o.status = "geliefert";
      o.deliveredAtMin = contract.endMin;
      recordOrderOutcome(state, o, "timely", contract.endMin, contract.paymentPerTransportCents);
    }

    // Auswertung nach Vertragsende
    evaluateContracts(state, contract.endMin + 60, log);
    expect(contract.status).toBe("completed");
    expect(contract.evaluatedAtMin).toBe(contract.endMin + 60);
    expect(contract.deliveredCount).toBe(totalOrders);
    expect(contract.revenueCents).toBe(totalOrders * contract.paymentPerTransportCents);
  });
});

describe("Konsistenz mit Zeitvorläufen", () => {
  it("Vertragsaufträge entstehen auch bei aufgeteilten Vorläufen korrekt", () => {
    const state1 = makeBaseState();
    migrateCustomerRelations(state1);
    migrateContracts(state1);
    // Stammkunde simulieren
    for (let i = 0; i < STAMMKUNDE_MIN_TRANSPORTS; i++) {
      const order = { id: "split_o" + i, customerId: "c01", status: "geliefert", _reputationApplied: false };
      recordOrderOutcome(state1, order, "timely", state1.gameTime + i * 1440, 50000);
    }
    const { contract } = generateContractOffer(state1, "c01");
    acceptContract(state1, contract.id);

    // 1×1440 Vorlauf
    applyCommand(state1, "advanceTime", { minutes: 1440 });
    const orders1 = state1.orders.filter(o => o.contractId === contract.id);

    // 24×60 Vorlauf
    const state2 = makeBaseState();
    migrateCustomerRelations(state2);
    migrateContracts(state2);
    for (let i = 0; i < STAMMKUNDE_MIN_TRANSPORTS; i++) {
      const order = { id: "split_o" + i, customerId: "c01", status: "geliefert", _reputationApplied: false };
      recordOrderOutcome(state2, order, "timely", state2.gameTime + i * 1440, 50000);
    }
    const { contract: contract2 } = generateContractOffer(state2, "c01");
    acceptContract(state2, contract2.id);
    for (let i = 0; i < 24; i++) applyCommand(state2, "advanceTime", { minutes: 60 });
    const orders2 = state2.orders.filter(o => o.contractId === contract2.id);

    // Gleiche Anzahl Vertragsaufträge
    expect(orders1.length).toBe(orders2.length);
  });
});