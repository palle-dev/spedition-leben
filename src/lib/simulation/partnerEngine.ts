// Partner-Engine für FERNWERK.
// Verwaltet die Zusammenarbeit mit fiktiven Partner-Speditionen:
// - Angebotsanfragen (deterministisch, gecacht)
// - Beauftragung (Validierung, Buchung, Kontingent)
// - Externe Transportabwicklung über die Spielzeit
// - Stornierungen und Erstattungen
// - Statistiken und Pünktlichkeitsmessung
// - Delegation und Befugnisprüfung
//
// Design-Prinzipien:
// - Externe Vergabe = zusätzliche Erfüllungsform desselben Kundenauftrags (kein zweiter Auftrag)
// - Deterministische Preise (kein Zufall) — gespeicherte Angebote
// - Einmalige Buchung (Dedup über order.externalTransport)
// - Externe Kosten ersetzen eigene variablen Kosten (kein Kraftstoff/Maut)
// - Bestehende Fixkosten laufen weiter
// - Keine eigenen Fahrer/Fahrzeuge/Touren für externe Transporte
// - Reproduzierbare Abweichungen (konfigurierte Verspätung, nicht pro Zeitvorlauf)
// - Kundenbewertung richtet sich nach tatsächlichen Ergebnis

import {
  getDistance, driveMinutes, dayOf, formatGameTime,
  mulberry32,
} from "./gameRules.ts";
import {
  PARTNER_CATALOG, PARTNER_VERSION,
  isPartnerEligible, getPartnerById,
} from "./partnerCatalog.ts";
import {
  getOrderCharacteristics,
} from "./segmentEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";
import {
  checkSpendAuthority, recordSpend, createApprovalRequest, logDecision,
  ROLE_AUTHORITY,
} from "./delegationEngine.ts";
import { book, bookExpense, postJournal } from "./accountingEngine.ts";
import { recordOrderOutcome } from "./customerEngine.ts";

const DAY_MIN = 1440;
const OFFER_VALID_HOURS = 6; // Angebote gelten 6h

// ---------- Migration ----------
export function migratePartners(state) {
  if (!state.partners || state.partners.version !== PARTNER_VERSION) {
    state.partners = {
      version: PARTNER_VERSION,
      // Tägliche Kontingentnutzung: { "p01:3": 2 } = Partner p01 an Tag 3 hat 2 Starts
      dailyUsage: {},
      // Aktive externe Transporte
      transports: [],
      // Statistik pro Partner
      stats: {},
    };
    // Statistik für jeden Partner initialisieren
    for (const p of PARTNER_CATALOG) {
      state.partners.stats[p.id] = {
        totalTransports: 0,
        completedTransports: 0,
        timelyTransports: 0,
        lateTransports: 0,
        failedTransports: 0,
        cancelledTransports: 0,
        totalCostCents: 0,
        totalRefundCents: 0,
        lastTransportAtMin: null,
      };
    }
  }
  if (!state.partners.transports) state.partners.transports = [];
  if (!state.partners.dailyUsage) state.partners.dailyUsage = {};
  if (!state.partners.stats) state.partners.stats = {};
  // Sicherstellen, dass alle Partner einen Statistikdatensatz haben
  for (const p of PARTNER_CATALOG) {
    if (!state.partners.stats[p.id]) {
      state.partners.stats[p.id] = {
        totalTransports: 0, completedTransports: 0, timelyTransports: 0,
        lateTransports: 0, failedTransports: 0, cancelledTransports: 0,
        totalCostCents: 0, totalRefundCents: 0, lastTransportAtMin: null,
      };
    }
  }
}

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Bestimmt die Transportart eines Auftrags für die Partner-Suche.
function getOrderType(order) {
  const chars = getOrderCharacteristics(order);
  if (chars.isDangerousGoods) return "dangerousGoods";
  if (chars.isExpress) return "express";
  if (chars.isRegional) return "regional";
  return "standard";
}

// Prüft, ob ein Auftrag für externe Vergabe geeignet ist:
// - Status "angenommen" (nicht angeboten, nicht unterwegs, nicht geliefert)
// - Beladung noch nicht begonnen (kein aktiver Trip mit diesem Auftrag)
export function canBeExternallyDispatched(state, order) {
  if (!order) return false;
  if (order.status !== "angenommen") return false;
  // Kein aktiver Trip mit diesem Auftrag
  const hasActiveTrip = (state.trips || []).some(t =>
    t.orderId === order.id && t.status === "in_progress"
  );
  if (hasActiveTrip) return false;
  // Bereits extern vergeben?
  if (order.externalTransportId) return false;
  return true;
}

// Prüft, ob der Kunde/die Vertragsbedingung externe Vergabe zulässt.
// Bestandsverträge ohne Feld: Standard = erlaubt (dokumentierte kompatible Regel).
export function allowsExternalFulfillment(state, order) {
  // Prüfe aktive Verträge für diesen Kunden
  if (state.contracts && state.contracts.contracts) {
    for (const c of state.contracts.contracts) {
      if (c.status !== "active" && c.status !== "offered") continue;
      if (c.customerName !== order.customer) continue;
      // Wenn der Vertrag explizit requiresOwnFulfillment = true, ist externe Vergabe verboten
      if (c.requiresOwnFulfillment === true) return false;
    }
  }
  // Standard: externe Vergabe ist zulässig
  return true;
}

// ---------- Kontingent ----------
function dailyUsageKey(partnerId, min) {
  return partnerId + ":" + dayOf(min);
}

// Verbleibendes Kontingent für einen Partner zum Zeitpunkt min.
export function getRemainingCapacity(state, partnerId, min) {
  const partner = getPartnerById(partnerId);
  if (!partner) return 0;
  const key = dailyUsageKey(partnerId, min);
  const used = state.partners?.dailyUsage?.[key] || 0;
  return Math.max(0, partner.dailyCapacity - used);
}

function reserveCapacity(state, partnerId, min) {
  const key = dailyUsageKey(partnerId, min);
  if (!state.partners.dailyUsage[key]) state.partners.dailyUsage[key] = 0;
  state.partners.dailyUsage[key]++;
}

function releaseCapacity(state, partnerId, min) {
  const key = dailyUsageKey(partnerId, min);
  if (state.partners.dailyUsage[key]) state.partners.dailyUsage[key] = Math.max(0, state.partners.dailyUsage[key] - 1);
}

// ---------- Preisberechnung (deterministisch) ----------
function computePartnerPrice(partner, order, orderType, bookingMin) {
  const km = getDistance(order.fromCity, order.toCity);
  let price = partner.pricing.baseCents
    + partner.pricing.perKmCents * km
    + partner.pricing.perTonCents * order.tons;
  // Express-Zuschlag
  if (orderType === "express") {
    price = Math.round(price * (1 + partner.pricing.expressSurcharge));
  }
  // Gefahrgut-Zuschlag
  if (order.isDangerousGoods && partner.pricing.dgSurcharge > 0) {
    price = Math.round(price * (1 + partner.pricing.dgSurcharge));
  }
  return { priceCents: price, km };
}

// ---------- Lieferzeitberechnung ----------
function computeDeliveryTime(partner, order, startMin) {
  const km = getDistance(order.fromCity, order.toCity);
  const hours = (km / 100) * partner.timing.deliveryHoursPer100km;
  const durationMin = Math.ceil(hours * 60);
  return { startMin, deliveryMin: startMin + durationMin, durationMin };
}

// ---------- Angebotsanfrage ----------
// Erzeugt deterministische Angebote für einen Auftrag.
// Speichert Angebote auf dem Auftrag (order._partnerOffers), damit wiederholtes
// Öffnen keine neuen Preise auswürfelt. Abgelaufene Angebote werden neu generiert.
export function requestPartnerOffers(state, orderId) {
  migratePartners(state);
  const order = (state.orders || []).find(o => o.id === orderId);
  if (!order) return { ok: false, error: "Auftrag nicht gefunden." };
  if (!canBeExternallyDispatched(state, order)) {
    return { ok: false, error: "Auftrag kann nicht extern vergeben werden (Status, laufender Transport oder bereits extern vergeben)." };
  }
  if (!allowsExternalFulfillment(state, order)) {
    return { ok: false, error: "Kunde/Vertrag verlangt Eigenleistung. Externe Vergabe nicht zulässig." };
  }

  const orderType = getOrderType(order);
  const now = state.gameTime;
  const offers = [];

  for (const partner of PARTNER_CATALOG) {
    if (!isPartnerEligible(partner, order, orderType)) continue;

    const remaining = getRemainingCapacity(state, partner.id, now);
    if (remaining <= 0) continue;

    const { priceCents, km } = computePartnerPrice(partner, order, orderType, now);
    const earliestStart = now + partner.timing.minLeadMin;
    const { deliveryMin, durationMin } = computeDeliveryTime(partner, order, earliestStart);

    // Lieferfrist prüfen
    const meetsDeadline = deliveryMin <= order.deliveryDeadlineMin;
    if (!meetsDeadline) continue;

    // Deckungsbeitrag des Kundenauftrags nach Partnerpreis
    const contributionCents = order.paymentCents - priceCents;

    const offer = {
      partnerId: partner.id,
      partnerName: partner.name,
      priceCents,
      km,
      earliestStartMin: earliestStart,
      deliveryMin,
      durationMin,
      // Zahlungsbedingungen: bei Beauftragung zahlbar (v1)
      paymentTerms: "sofort",
      // Gültigkeitsdauer
      validUntilMin: now + OFFER_VALID_HOURS * 60,
      // Stornierungsbedingungen
      cancellationFreeUntilMin: earliestStart - partner.cancellation.freeUntilMin > now
        ? earliestStart - partner.cancellation.freeUntilMin
        : now,
      cancellationFeePct: partner.cancellation.feePct,
      // Verbleibender Deckungsbeitrag
      contributionCents,
      // Verbleibendes Kontingent
      remainingCapacity: remaining,
      meetsDeadline,
    };
    offers.push(offer);
  }

  // Angebote auf dem Auftrag speichern (Cache)
  order._partnerOffers = offers;
  order._partnerOffersAtMin = now;

  return { ok: true, orderId, offers };
}

// ---------- Beauftragung (Vorschau) ----------
export function previewPartnerBooking(state, { orderId, partnerId }) {
  migratePartners(state);
  const order = (state.orders || []).find(o => o.id === orderId);
  if (!order) return { ok: false, error: "Auftrag nicht gefunden." };

  // Angebot aus Cache holen
  const offers = order._partnerOffers || [];
  const offer = offers.find(o => o.partnerId === partnerId);
  if (!offer) return { ok: false, error: "Kein gespeichertes Angebot für diesen Partner. Bitte Angebote neu prüfen." };

  // Gültigkeit prüfen
  if (offer.validUntilMin < state.gameTime) {
    return { ok: false, error: "Angebot ist abgelaufen. Bitte erneut anfragen." };
  }

  // Auftrag noch vergebbar?
  if (!canBeExternallyDispatched(state, order)) {
    return { ok: false, error: "Auftrag kann nicht mehr extern vergeben werden." };
  }

  // Kontingent prüfen
  const remaining = getRemainingCapacity(state, partnerId, state.gameTime);
  if (remaining <= 0) {
    return { ok: false, error: "Partner hat kein freies Kontingent mehr." };
  }

  // Liquidität prüfen
  if (state.company.accountCents < offer.priceCents) {
    return { ok: false, error: "Firmenkonto reicht für die Partnervergütung nicht aus." };
  }

  // Deckungsbeitrag
  const contributionCents = order.paymentCents - offer.priceCents;

  return {
    ok: true,
    canConfirm: true,
    orderId,
    partnerId,
    partnerName: offer.partnerName,
    priceCents: offer.priceCents,
    customerPaymentCents: order.paymentCents,
    contributionCents,
    earliestStartMin: offer.earliestStartMin,
    deliveryMin: offer.deliveryMin,
    paymentTerms: offer.paymentTerms,
    cancellationFreeUntilMin: offer.cancellationFreeUntilMin,
    cancellationFeePct: offer.cancellationFeePct,
    remainingCapacity: remaining,
  };
}

// ---------- Beauftragung (Ausführung) ----------
// Atomare Zustandsänderung: Kontingent reservieren, Auftrag markieren,
// eigene Zuweisung lösen, Zahlung buchen, externen Ablauf anlegen.
export function bookPartnerTransport(state, { orderId, partnerId, employeeId }) {
  migratePartners(state);
  const order = (state.orders || []).find(o => o.id === orderId);
  if (!order) throw new Error("Auftrag nicht gefunden.");

  // Idempotenz: bereits extern vergeben?
  if (order.externalTransportId) {
    const existing = state.partners.transports.find(t => t.id === order.externalTransportId);
    if (existing && existing.status !== "cancelled") {
      throw new Error("Auftrag ist bereits extern vergeben.");
    }
  }

  // Vorschau-Prüfung (alle Bedingungen)
  const preview = previewPartnerBooking(state, { orderId, partnerId });
  if (!preview.ok) throw new Error(preview.error);

  // Befugnisprüfung (Delegation)
  if (employeeId) {
    const emp = (state.employees || []).find(e => e.id === employeeId)
      || (state.drivers || []).find(d => d.id === employeeId);
    if (emp) {
      // Rolle-Befugnis: darf diese Rolle überhaupt Fremdvergaben tätigen?
      const roleAuth = ROLE_AUTHORITY[emp.role] || ROLE_AUTHORITY.driver;
      if (roleAuth.canDispatchExternally === false) {
        throw new Error("Rolle \"" + emp.role + "\" hat keine Befugnis für Fremdvergaben.");
      }
      const authCheck = checkSpendAuthority(state, employeeId, preview.priceCents, {
        branchId: emp.assignedBranchId || emp.branchId,
      });
      if (!authCheck.allowed) {
        // Freigabeanfrage erstellen
        const approval = createApprovalRequest(state, {
          employeeId,
          employeeName: emp.name,
          employeeRole: emp.role,
          branchId: emp.assignedBranchId || emp.branchId,
          type: "spend",
          title: "Fremdvergabe: " + order.customer + " → " + preview.partnerName,
          description: "Partnervergütung " + (preview.priceCents / 100).toFixed(2) + " € für Transport " + order.fromCity + " → " + order.toCity,
          reasoning: authCheck.reason,
          costCents: preview.priceCents,
          violatedRule: authCheck.violatedRule,
          urgency: "medium",
          actionData: { type: "partner_booking", orderId, partnerId, dedupId: orderId + ":" + partnerId },
        });
        if (approval.isNew) {
          logDecision(state, {
            employeeId, employeeName: emp.name,
            type: "partner_blocked",
            summary: "Fremdvergabe blockiert: " + authCheck.reason,
            reasoning: authCheck.reason,
            costCents: preview.priceCents,
            auto: false,
          });
        }
        throw new Error("Fremdvergabe erfordert Freigabe: " + authCheck.reason);
      }
      // Ausgabe verbuchen
      recordSpend(state, employeeId, preview.priceCents, emp.assignedBranchId || emp.branchId);
      logDecision(state, {
        employeeId, employeeName: emp.name,
        type: "partner_booking",
        summary: "Fremdvergabe an " + preview.partnerName + ": " + order.customer,
        reasoning: "Auftrag extern vergeben",
        costCents: preview.priceCents,
        auto: false,
      });
    }
  }

  const partner = getPartnerById(partnerId);
  const offer = order._partnerOffers.find(o => o.partnerId === partnerId);

  // 1. Kontingent reservieren
  reserveCapacity(state, partnerId, state.gameTime);

  // 2. Eigene Zuweisung sauber lösen (falls eine geplante Tour existiert)
  releaseOwnAssignment(state, order);

  // 3. Zahlung genau einmal buchen (Fremdtransporte-Konto 5020)
  bookExpense(state, {
    text: "Fremdtransport: " + order.customer + " via " + partner.name,
    expenseAccount: "5020",
    amountCents: preview.priceCents,
    paidCents: preview.priceCents,
    unpaidCents: 0,
    partnerName: partner.name,
    orderId: order.id,
    gameTime: state.gameTime,
  });

  // 4. Externen Ablauf anlegen
  const transportId = uid(state, "pt");
  const transport = {
    id: transportId,
    orderId: order.id,
    partnerId: partner.id,
    partnerName: partner.name,
    status: "booked",          // booked → in_progress → completed / failed / cancelled
    bookedAtMin: state.gameTime,
    startMin: offer.earliestStartMin,
    deliveryMin: offer.deliveryMin,
    priceCents: preview.priceCents,
    customerPaymentCents: order.paymentCents,
    contributionCents: preview.contributionCents,
    cancellationFreeUntilMin: offer.cancellationFreeUntilMin,
    cancellationFeePct: offer.cancellationFeePct,
    // Verspätung (reproduzierbar, konfiguriert)
    delayMin: 0,
    actualDeliveryMin: null,
    onTime: null,
    // Abrechnung
    paidCents: preview.priceCents,
    refundCents: 0,
    // Mitarbeiter
    employeeId: employeeId || null,
    employeeName: employeeId ? ((state.employees || []).find(e => e.id === employeeId)?.name || null) : null,
  };
  state.partners.transports.push(transport);

  // 5. Auftrag als extern vergeben kennzeichnen
  order.externalTransportId = transportId;
  order.externalPartnerId = partnerId;
  order.externalPartnerName = partner.name;
  order.externalPriceCents = preview.priceCents;

  // Statistik aktualisieren
  state.partners.stats[partnerId].totalTransports++;
  state.partners.stats[partnerId].totalCostCents += preview.priceCents;
  state.partners.stats[partnerId].lastTransportAtMin = state.gameTime;

  // Ereignis
  pushEvent(state, {
    type: "partner_booking",
    gameTime: state.gameTime, isSystem: false,
    orderId: order.id,
    details: {
      partnerId, partnerName: partner.name,
      priceCents: preview.priceCents,
      contributionCents: preview.contributionCents,
      startMin: offer.earliestStartMin,
      deliveryMin: offer.deliveryMin,
    },
    dedupKey: "partner_booking:" + transportId,
  });

  return {
    ok: true,
    transportId,
    orderId: order.id,
    partnerId,
    partnerName: partner.name,
    priceCents: preview.priceCents,
    contributionCents: preview.contributionCents,
    startMin: offer.earliestStartMin,
    deliveryMin: offer.deliveryMin,
  };
}

// Löst eine bestehende eigene Zuweisung (geplante Tour) für einen Auftrag sauber.
// Nur geplante (nicht gestartete) Einsätze werden freigegeben.
function releaseOwnAssignment(state, order) {
  for (const tour of (state.tours || [])) {
    if (tour.status !== "active" && tour.status !== "planned") continue;
    for (const dep of (tour.deployments || [])) {
      if (dep.orderId === order.id && dep.status === "planned") {
        dep.status = "cancelled";
        dep.cancelReason = "extern_vergeben";
      }
    }
    // Wenn alle Einsätze storniert/abgeschlossen: Tour auflösen
    const allDone = (tour.deployments || []).every(d =>
      d.status === "cancelled" || d.status === "completed" || d.status === "skipped"
    );
    const returnDone = !tour.returnDeployment ||
      tour.returnDeployment.status === "cancelled" ||
      tour.returnDeployment.status === "completed" ||
      tour.returnDeployment.status === "skipped";
    if (allDone && returnDone && tour.status === "active") {
      tour.status = "cancelled";
      tour.pauseReason = "Aufträge extern vergeben";
    }
  }
}

// ---------- Stornierung ----------
export function cancelPartnerTransport(state, { transportId }) {
  migratePartners(state);
  const transport = state.partners.transports.find(t => t.id === transportId);
  if (!transport) throw new Error("Externer Transport nicht gefunden.");
  if (transport.status === "cancelled") throw new Error("Transport bereits storniert.");
  if (transport.status === "completed") throw new Error("Abgeschlossener Transport kann nicht storniert werden.");
  if (transport.status === "failed") throw new Error("Gescheiterter Transport kann nicht storniert werden.");

  // Stornierung nur vor Beginn zulässig
  if (transport.status === "in_progress") {
    throw new Error("Laufender externer Transport kann nicht storniert werden.");
  }

  const order = (state.orders || []).find(o => o.id === transport.orderId);

  // Stornierungsgebühr berechnen
  let refundCents = 0;
  if (state.gameTime >= transport.cancellationFreeUntilMin) {
    // Gebühr fällig
    const feeCents = Math.round(transport.priceCents * transport.cancellationFeePct / 100);
    refundCents = transport.priceCents - feeCents;
  } else {
    // Kostenlos
    refundCents = transport.priceCents;
  }

  // Erstattung genau einmal buchen — ausgeglichene Buchung:
  // Bank wird gutgeschrieben (1000 debit), Fremdtransport-Aufwand reduziert (5020 credit).
  // postJournal aktualisiert state.company.accountCents automatisch über Konto 1000.
  if (refundCents > 0) {
    postJournal(state, {
      text: "Storno-Erstattung: " + transport.partnerName,
      type: "expense_refund",
      actor: "system",
      partnerName: transport.partnerName,
      orderId: transport.orderId,
      gameTime: state.gameTime,
      lines: [
        { account: "1000", debit: refundCents },
        { account: "5020", credit: refundCents },
      ],
    });
  }

  // Kontingent freigeben
  releaseCapacity(state, transport.partnerId, transport.bookedAtMin);

  // Transport markieren
  transport.status = "cancelled";
  transport.cancelledAtMin = state.gameTime;
  transport.refundCents = refundCents;

  // Statistik
  state.partners.stats[transport.partnerId].cancelledTransports++;
  state.partners.stats[transport.partnerId].totalRefundCents += refundCents;

  // Auftrag zurücksetzen
  if (order) {
    order.externalTransportId = null;
    order.externalPartnerId = null;
    order.externalPartnerName = null;
    order.externalPriceCents = null;
    // Auftrag bleibt "angenommen" — kann neu disponiert werden
  }

  pushEvent(state, {
    type: "partner_cancelled",
    gameTime: state.gameTime, isSystem: false,
    orderId: transport.orderId,
    details: {
      transportId, partnerId: transport.partnerId,
      refundCents, priceCents: transport.priceCents,
    },
    dedupKey: "partner_cancelled:" + transportId,
  });

  return {
    ok: true,
    transportId,
    refundCents,
    feeCents: transport.priceCents - refundCents,
  };
}

// ---------- Transportabwicklung über die Spielzeit ----------
// Wird von processEventsAt aufgerufen, wenn ein externer Transport beginnt/endet.

// Gibt die nächsten Ereigniszeiten für externe Transporte zurück (für eventScheduler).
export function getPartnerTransportEventTimes(state, t, maxMin) {
  migratePartners(state);
  const times = [];
  for (const tr of state.partners.transports) {
    if (tr.status === "booked" && tr.startMin > t && tr.startMin <= maxMin) {
      times.push(tr.startMin);
    }
    if (tr.status === "in_progress" && tr.actualDeliveryMin > t && tr.actualDeliveryMin <= maxMin) {
      times.push(tr.actualDeliveryMin);
    }
  }
  return times;
}

// Verarbeitet externe Transporte zum Zeitpunkt m.
// Wird von processEventsAt in der Simulation aufgerufen.
export function processPartnerTransports(state, m, log) {
  migratePartners(state);
  for (const tr of state.partners.transports) {
    // Start
    if (tr.status === "booked" && tr.startMin <= m) {
      tr.status = "in_progress";
      tr.actualStartMin = m;
      // Verspätung deterministisch berechnen (einmalig beim Start)
      tr.delayMin = computeDeterministicDelay(state, tr);
      tr.actualDeliveryMin = m + (tr.deliveryMin - tr.startMin) + tr.delayMin;
      log.push({ type: "partner_transport_started", transport: tr.id, partner: tr.partnerName, atMin: m });
      pushEvent(state, {
        type: "partner_transport_started",
        gameTime: m, isSystem: true,
        orderId: tr.orderId,
        details: { transportId: tr.id, partnerId: tr.partnerId, partnerName: tr.partnerName, delayMin: tr.delayMin },
        dedupKey: "partner_started:" + tr.id,
      });
    }
    // Lieferung
    if (tr.status === "in_progress" && tr.actualDeliveryMin <= m) {
      completePartnerTransport(state, tr, m, log);
    }
  }
}

// Deterministische Verspätung: reproduzierbar, unabhängig von Zeitvorlauf-Aufteilung.
// Nutzt einen Seed aus transportId + partnerId — einmalig beim Start berechnet.
function computeDeterministicDelay(state, tr) {
  // Seed aus Transport-ID (stabil, nicht von Zeit abhängig)
  let seed = 0;
  for (let i = 0; i < tr.id.length; i++) seed = ((seed << 5) - seed + tr.id.charCodeAt(i)) | 0;
  const rng = mulberry32(Math.abs(seed) >>> 0);
  const r = rng();
  // 15% Chance auf Verspätung, 30-180 Min
  if (r < 0.15) {
    return 30 + Math.floor(rng() * 150);
  }
  return 0;
}

// Schließt einen externen Transport ab — nutzt die bestehende Auftragsabwicklung
// für Lieferabschluss, Fristverletzung und Kundenerlös.
function completePartnerTransport(state, tr, m, log) {
  const order = (state.orders || []).find(o => o.id === tr.orderId);
  if (!order) {
    tr.status = "failed";
    tr.failedAtMin = m;
    tr.failureReason = "Auftrag nicht gefunden";
    return;
  }

  // Idempotenz: bereits abgeschlossen?
  if (tr.status === "completed" || tr.status === "failed") return;

  tr.status = "completed";
  tr.completedAtMin = m;
  tr.actualDeliveryMin = m;
  const onTime = m <= order.deliveryDeadlineMin;
  tr.onTime = onTime;

  // Auftrag als geliefert markieren (bestehende Auftragsabwicklung)
  order.status = "geliefert";
  order.deliveredAtMin = m;
  order.deliveredExternally = true;
  order.deliveredByPartner = tr.partnerName;

  // Kundenerlös: wie bei completeTrip — pünktlich = volle Vergütung, spät = 90%
  const payment = onTime ? order.paymentCents : Math.round(order.paymentCents * 0.9);
  order.paidCents = payment;

  // Erlös buchen (sofort, kein Zahlungsziel für v1)
  book(state, "revenue_immediate", {
    customer: order.customer,
    orderId: order.id,
    paymentCents: payment,
    gameTime: m,
  });

  // KEINE eigenen variablen Kosten (Kraftstoff/Maut) — Partnerpreis wurde bei Beauftragung gezahlt.
  // Bestehende Fixkosten (Fahrerlohn, Standort) laufen weiter — keine zusätzliche Buchung.

  // Kundenbeziehung: Reputation erfassen (wie bei completeTrip)
  recordOrderOutcomeForPartner(state, order, onTime ? "timely" : "late", m, payment);

  // Statistik
  state.stats.totalDeliveries = (state.stats.totalDeliveries || 0) + 1;
  state.stats.totalRevenueCents = (state.stats.totalRevenueCents || 0) + payment;
  if (onTime) {
    state.stats.timelyDeliveries = (state.stats.timelyDeliveries || 0) + 1;
  }

  // Partner-Statistik
  state.partners.stats[tr.partnerId].completedTransports++;
  if (onTime) state.partners.stats[tr.partnerId].timelyTransports++;
  else state.partners.stats[tr.partnerId].lateTransports++;

  // Szenario
  if (state.scenario && state.scenario.status === "active") {
    state.scenario.totalDeliveries = (state.scenario.totalDeliveries || 0) + 1;
  }

  log.push({
    type: "partner_transport_completed",
    transport: tr.id, order: order.id,
    partner: tr.partnerName, onTime, paymentCents: payment,
    delayMin: tr.delayMin, atMin: m,
  });

  pushEvent(state, {
    type: "partner_transport_completed",
    gameTime: m, isSystem: true,
    orderId: order.id,
    details: {
      transportId: tr.id, partnerId: tr.partnerId, partnerName: tr.partnerName,
      onTime, paymentCents: payment, delayMin: tr.delayMin,
      contributionCents: payment - tr.priceCents,
      customer: order.customer, fromCity: order.fromCity, toCity: order.toCity,
    },
    dedupKey: "partner_completed:" + tr.id,
  });
}

// Reputation für externe Lieferung erfassen — nutzt die bestehende Kundenbeziehungs-Logik.
// Die Spedition bleibt gegenüber ihrem Kunden verantwortlich.
function recordOrderOutcomeForPartner(state, order, outcome, m, payment) {
  // Nutzt die bestehende Kundenbeziehungs-Logik (statischer Import).
  recordOrderOutcome(state, order, outcome, m, payment);
}

// ---------- Abfragen ----------
export function getPartnerOverview(state) {
  migratePartners(state);
  const partners = PARTNER_CATALOG.map(p => {
    const stats = state.partners.stats[p.id] || {};
    const activeTransports = state.partners.transports.filter(t =>
      t.partnerId === p.id && (t.status === "booked" || t.status === "in_progress")
    );
    const remainingToday = getRemainingCapacity(state, p.id, state.gameTime);
    // Pünktlichkeit: nur wenn mindestens 1 Transport
    const punctuality = stats.completedTransports > 0
      ? Math.round((stats.timelyTransports / stats.completedTransports) * 100)
      : null;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      regions: p.regions,
      transportTypes: p.transportTypes,
      maxTons: p.maxTons,
      qualifications: p.qualifications,
      dailyCapacity: p.dailyCapacity,
      remainingToday,
      activeCount: activeTransports.length,
      activeTransports: activeTransports.map(t => ({
        id: t.id, orderId: t.orderId, status: t.status,
        startMin: t.startMin, deliveryMin: t.deliveryMin,
        priceCents: t.priceCents,
      })),
      stats: {
        totalTransports: stats.totalTransports || 0,
        completedTransports: stats.completedTransports || 0,
        punctuality,
        totalCostCents: stats.totalCostCents || 0,
        totalRefundCents: stats.totalRefundCents || 0,
      },
    };
  });
  return { partners };
}

export function getActivePartnerTransports(state) {
  migratePartners(state);
  return state.partners.transports.filter(t =>
    t.status === "booked" || t.status === "in_progress"
  );
}

export function getPartnerTransportForOrder(state, orderId) {
  migratePartners(state);
  return state.partners.transports.find(t => t.orderId === orderId) || null;
}