import { startCompetitionRental } from "./competitionCooperation.ts";
import { independentRival, migrateCompetition } from "./competitionCore.ts";
import { retainHistory } from "./historyRetention.ts";
import { retainLatestHistory } from "./historyRetention.ts";
// Konkurrenten-Verhaltens-Engine für Frachtfieber.
// Erweitert die KI-Rivalen der Spielwelt mit adaptivem Verhalten:
// - Preisanpassung bei Unterbietung durch den Spieler
// - Gelegentliche Fahrerabwerbung
// - Kooperationsangebote
//
// Baut auf der worldEngine auf — nutzt state.world.rivals.
// Reine Logik — keine Auth, keine Speicherung.

import { WORLD_RIVALS, WORLD_DAY } from "./worldCatalog.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { mulberry32 } from "./gameRules.ts";

// ---------- Konstanten ----------
const RIVAL_BEHAVIOR_VERSION = 1;
const DAY_MIN = 1440;

// Preisanpassung
const PRICE_ADAPTATION_INTERVAL_DAYS = 3;
const PRICE_ADAPTATION_THRESHOLD = 2; // Nach 2 verlorenen Ausschreibungen
const PRICE_ADAPTATION_STEP = 3;      // -3% pro Anpassung
const PRICE_ADAPTATION_MIN = 75;      // Minimum pricePercent
const PRICE_ADAPTATION_MAX = 120;     // Maximum pricePercent

// Fahrerabwerbung
const POACHING_CHECK_INTERVAL_DAYS = 5;
const POACHING_CHANCE = 0.25;         // 25% Chance pro Check, wenn conditions met
const POACHING_MIN_TENURE_DAYS = 5;   // Mindestens 5 Tage beschäftigt
const POACHING_TARGET_SATISFACTION_MAX = 60; // Fahrer mit Satisfaction ≤60 sind Ziele

// Kooperation
const COOPERATION_CHECK_INTERVAL_DAYS = 7;
const COOPERATION_CHANCE = 0.20;      // 20% Chance pro Check
const COOPERATION_MIN_RELATIONSHIP = 40; // Mindest-Beziehung für Kooperationsangebot

// ---------- Hilfsfunktionen ----------
function rbRng(state) {
  if (!state.rivalBehavior) migrateRivalBehavior(state);
  const r = mulberry32(state.rivalBehavior.rngSeed >>> 0);
  const v = r();
  state.rivalBehavior.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ---------- Migration ----------
export function migrateRivalBehavior(state) {
  if (!state.rivalBehavior || state.rivalBehavior.version !== RIVAL_BEHAVIOR_VERSION) {
    state.rivalBehavior = {
      version: RIVAL_BEHAVIOR_VERSION,
      lossesByRival: {},      // { rivalId: count } — verlorene Ausschreibungen
      winsByRival: {},        // { rivalId: count } — gewonnene Ausschreibungen
      lastPriceCheckMin: 0,
      lastPoachingCheckMin: 0,
      lastCooperationCheckMin: 0,
      pendingPoachingAttempts: [], // Aktive Abwerbungsversuche
      pendingCooperationOffers: [], // Aktive Kooperationsangebote
      rngSeed: 7712391,
    };
  }
  if (!state.rivalBehavior.lossesByRival) state.rivalBehavior.lossesByRival = {};
  if (!state.rivalBehavior.winsByRival) state.rivalBehavior.winsByRival = {};
  if (!state.rivalBehavior.pendingPoachingAttempts) state.rivalBehavior.pendingPoachingAttempts = [];
  if (!state.rivalBehavior.pendingCooperationOffers) state.rivalBehavior.pendingCooperationOffers = [];
  if (state.rivalBehavior.rngSeed == null) state.rivalBehavior.rngSeed = 7712391;
}

// ---------- Ausschreibungs-Tracking ----------
// Wird aufgerufen, wenn eine Ausschreibung entschieden wurde.
// winnerId: "player" oder rivalId
export function recordTenderResult(state, winnerId, loserRivalIds) {
  migrateRivalBehavior(state);

  if (winnerId === "player") {
    // Spieler hat gewonnen — Rivalen haben verloren
    for (const rid of loserRivalIds) {
      state.rivalBehavior.lossesByRival[rid] = (state.rivalBehavior.lossesByRival[rid] || 0) + 1;
    }
  } else {
    // Rivale hat gewonnen
    state.rivalBehavior.winsByRival[winnerId] = (state.rivalBehavior.winsByRival[winnerId] || 0) + 1;
  }
}

// ---------- Preisanpassung ----------
// Rivalen passen ihre Preise an, wenn sie wiederholt gegen den Spieler verlieren.
export function processRivalPriceAdaptation(state, m, log) {
  migrateRivalBehavior(state);
  if (!state.world?.active) return;

  const lastCheck = state.rivalBehavior.lastPriceCheckMin || 0;
  if (m - lastCheck < PRICE_ADAPTATION_INTERVAL_DAYS * DAY_MIN) return;
  state.rivalBehavior.lastPriceCheckMin = m;

  for (const rival of state.world.rivals.filter(independentRival)) {
    const losses = state.rivalBehavior.lossesByRival[rival.id] || 0;
    const wins = state.rivalBehavior.winsByRival[rival.id] || 0;

    // Wenn Rivale oft gegen Spieler verloren hat → Preis senken
    if (losses >= PRICE_ADAPTATION_THRESHOLD && losses > wins) {
      const oldPercent = rival.pricePercent;
      const newPercent = clamp(
        oldPercent - PRICE_ADAPTATION_STEP,
        PRICE_ADAPTATION_MIN,
        PRICE_ADAPTATION_MAX
      );

      if (newPercent !== oldPercent) {
        rival.pricePercent = newPercent;
        state.rivalBehavior.lossesByRival[rival.id] = 0; // Reset nach Anpassung

        log.push({
          type: "rival_price_adapted",
          rival: rival.id,
          oldPercent, newPercent,
          atMin: m,
        });

        pushEvent(state, {
          type: "rival_price_adaptation",
          gameTime: m, isSystem: true,
          details: {
            rivalId: rival.id, rivalName: rival.name,
            oldPercent, newPercent, reason: "underbid_by_player",
          },
          dedupKey: `rival_price:${rival.id}:${m}`,
        });
      }
    }

    // Wenn Rivale oft gewonnen hat → Preis erhöhen (selbstbewusst)
    if (wins >= PRICE_ADAPTATION_THRESHOLD && wins > losses) {
      const oldPercent = rival.pricePercent;
      const newPercent = clamp(
        oldPercent + PRICE_ADAPTATION_STEP,
        PRICE_ADAPTATION_MIN,
        PRICE_ADAPTATION_MAX
      );

      if (newPercent !== oldPercent) {
        rival.pricePercent = newPercent;
        state.rivalBehavior.winsByRival[rival.id] = 0;

        log.push({
          type: "rival_price_increased",
          rival: rival.id,
          oldPercent, newPercent,
          atMin: m,
        });
      }
    }
  }
}

// ---------- Fahrerabwerbung ----------
// Rivalen versuchen gelegentlich, unzufriedene Fahrer des Spielers abzuwerben.
export function processRivalPoaching(state, m, log) {
  migrateRivalBehavior(state);
  if (!state.world?.active) return;

  const lastCheck = state.rivalBehavior.lastPoachingCheckMin || 0;
  if (m - lastCheck < POACHING_CHECK_INTERVAL_DAYS * DAY_MIN) return;
  state.rivalBehavior.lastPoachingCheckMin = m;

  // Abgelaufene Abwerbungsversuche entfernen
  state.rivalBehavior.pendingPoachingAttempts = retainHistory(state, "poachingAttempts", state.rivalBehavior.pendingPoachingAttempts, state.rivalBehavior.pendingPoachingAttempts.filter(a =>
    a.status === "pending"
  ), null);

  if (state.rivalBehavior.pendingPoachingAttempts.length > 0) return; // Nur ein Versuch gleichzeitig

  // Kandidaten: unzufriedene, langjährig beschäftigte Fahrer
  const candidates = (state.drivers || []).filter(d => {
    if (!isActivelyEmployed(d)) return false;
    const tenureDays = Math.floor((m - (d.employedAtMin || 0)) / DAY_MIN);
    if (tenureDays < POACHING_MIN_TENURE_DAYS) return false;
    const satisfaction = d.satisfaction ?? 70;
    if (satisfaction > POACHING_TARGET_SATISFACTION_MAX) return false;
    return true;
  });

  if (candidates.length === 0) return;

  // Zufälligen Fahrer auswählen
  const roll = rbRng(state);
  if (roll > POACHING_CHANCE) return;

  const targetDriver = candidates[Math.floor(rbRng(state) * candidates.length)];
  const candidatesRivals = state.world.rivals.filter(r => independentRival(r) && !state.competition?.deals.some(d => d.rivalId === r.id && ["review", "ready"].includes(d.status)));
  if (!candidatesRivals.length) return;
  const rival = candidatesRivals[Math.floor(rbRng(state) * candidatesRivals.length)];

  // Abwerbungsversuch erstellen
  const offerCents = Math.round((targetDriver.costPerDayCents || 10000) * 1.3); // 30% mehr Lohn
  const deadline = m + 2 * DAY_MIN; // 2 Tage Zeit zu reagieren

  const attempt = {
    id: "poach_" + (++state.rivalBehavior.rngSeed % 100000),
    rivalId: rival.id,
    rivalName: rival.name,
    driverId: targetDriver.id,
    driverName: targetDriver.name,
    offerDailyWageCents: offerCents,
    deadlineMin: deadline,
    status: "pending",
    createdAtMin: m,
  };

  state.rivalBehavior.pendingPoachingAttempts.push(attempt);

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Fahrerabwerbung: " + targetDriver.name,
    body: `${rival.name} hat ${targetDriver.name} ein Angebot gemacht!\n\n` +
      `Angebotener Tageslohn: ${(offerCents / 100).toFixed(2)} € ` +
      `(aktuell: ${((targetDriver.costPerDayCents || 10000) / 100).toFixed(2)} €)\n\n` +
      `${targetDriver.name} ist unzufrieden mit der aktuellen Situation und zieht das Angebot in Betracht.\n\n` +
      `Sie haben bis ${formatGameTime(deadline)} Zeit zu reagieren:\n` +
      `· Gehalt erhöhen, um den Fahrer zu halten\n` +
      `· Ein Gespräch führen, um die Zufriedenheit zu verbessern\n` +
      `· Den Fahrer ziehen lassen\n\n` +
      `Ohne Reaktion wechselt der Fahrer zum Konkurrenten.`,
    gameTime: m, category: "operations", priority: "high",
    linkedRefs: { type: "poaching_attempt", id: attempt.id },
    dedupKey: `poaching:${attempt.id}`,
  });

  pushEvent(state, {
    type: "rival_poaching_attempt",
    gameTime: m, isSystem: true,
    details: {
      attemptId: attempt.id, rivalId: rival.id, rivalName: rival.name,
      driverId: targetDriver.id, driverName: targetDriver.name,
      offerDailyWageCents: offerCents, deadlineMin: deadline,
    },
    dedupKey: `poaching:${attempt.id}`,
  });

  log.push({ type: "rival_poaching_attempt", attempt: attempt.id, driver: targetDriver.id, rival: rival.id, atMin: m });
}

// ---------- Abwerbungs-Auflösung ----------
// Prüft abgelaufene Abwerbungsversuche und löst sie auf.
export function resolvePoachingAttempts(state, m, log) {
  migrateRivalBehavior(state);

  for (const attempt of state.rivalBehavior.pendingPoachingAttempts) {
    if (attempt.status !== "pending") continue;
    if (m < attempt.deadlineMin) continue;
    if (!independentRival(state.world?.rivals.find(r => r.id === attempt.rivalId))) { attempt.status = "cancelled"; continue; }
    if (driverCommitted(state, attempt.driverId)) continue;

    // Abgelaufen ohne Reaktion → Fahrer wechselt
    const driver = (state.drivers || []).find(d => d.id === attempt.driverId);
    if (!driver || !isActivelyEmployed(driver)) {
      attempt.status = "driver_unavailable";
      continue;
    }

    // Prüfen, ob Spieler reagiert hat (Gehaltserhöhung oder Gespräch)
    // Wenn der Fahrer jetzt zufrieden ist (satisfaction > 70), bleibt er
    const currentSatisfaction = driver.satisfaction ?? 70;
    const currentWage = driver.costPerDayCents || 10000;

    if (currentSatisfaction >= 75 && currentWage >= attempt.offerDailyWageCents * 0.9) {
      // Fahrer bleibt — Zufriedenheit und Lohn reichen
      attempt.status = "retained";
      driver.satisfactionReasons = retainHistory(state, "driverSatisfaction", driver.satisfactionReasons, [...(driver.satisfactionReasons || []), {
        reason: "Abwerbung abgewehrt: " + attempt.rivalName,
        delta: +5,
        atMin: m,
      }].slice(-20), driver.id);
      driver.satisfaction = clamp((driver.satisfaction || 70) + 5, 0, 100);

      deliverMessage(state, {
        fromId: "system", toId: "player",
        subject: "Fahrer gehalten: " + driver.name,
        body: `${driver.name} hat das Angebot von ${attempt.rivalName} abgelehnt und bleibt bei Ihnen.\n\n` +
          `Ihre Maßnahmen haben überzeugt. Die Zufriedenheit ist gestiegen.`,
        gameTime: m, category: "operations", priority: "normal",
        linkedRefs: { type: "poaching_attempt", id: attempt.id },
        dedupKey: `poaching_resolved:${attempt.id}`,
      });
    } else {
      // Fahrer wechselt zum Konkurrenten
      attempt.status = "poached";
      driver.employmentStatus = "terminated";
      driver.exitDate = m;
      driver.exitReason = "poached_by_rival";
      driver.poachedByRival = attempt.rivalName;

      // Rivale bekommt ein "Job" (Kapazität)
      const rival = state.world.rivals.find(r => r.id === attempt.rivalId);
      if (rival) {
        receivePoachedDriver(state, rival, driver);
      }

      deliverMessage(state, {
        fromId: "system", toId: "player",
        subject: "Fahrer verloren: " + driver.name,
        body: `${driver.name} hat das Angebot von ${attempt.rivalName} angenommen und verlässt Ihr Unternehmen.\n\n` +
          `Der Konkurrent hat sein Fahrerteam verstärkt. Reagieren Sie künftig schneller auf Unzufriedenheit im Team.`,
        gameTime: m, category: "operations", priority: "high",
        linkedRefs: { type: "poaching_attempt", id: attempt.id },
        dedupKey: `poaching_resolved:${attempt.id}`,
      });

      pushEvent(state, {
        type: "driver_poached",
        gameTime: m, isSystem: true,
        details: {
          driverId: driver.id, driverName: driver.name,
          rivalId: attempt.rivalId, rivalName: attempt.rivalName,
        },
        dedupKey: `driver_poached:${driver.id}`,
      });

      log.push({ type: "driver_poached", driver: driver.id, rival: attempt.rivalId, atMin: m });
    }
  }

  // Abgeschlossene Versuche aufräumen (letzte 50 behalten)
  if (state.rivalBehavior.pendingPoachingAttempts.length > 50) {
    state.rivalBehavior.pendingPoachingAttempts = retainLatestHistory(state, "poachingAttempts", state.rivalBehavior.pendingPoachingAttempts, 50, null);
  }
}

// Spieler-Reaktion auf Abwerbungsversuch
export function respondToPoachingAttempt(state, attemptId, response) {
  migrateRivalBehavior(state);
  const attempt = state.rivalBehavior.pendingPoachingAttempts.find(a => a.id === attemptId);
  if (!attempt) throw new Error("Abwerbungsversuch nicht gefunden.");
  if (state.gameTime >= attempt.deadlineMin) throw new Error("Die Antwortfrist ist abgelaufen.");
  if (!independentRival(state.world?.rivals.find(r => r.id === attempt.rivalId))) throw new Error("Der Mitbewerber ist nicht mehr unabhängig.");
  if (response === "release" && driverCommitted(state, attempt.driverId)) throw new Error("Der Fahrer muss zuerst seine laufenden und geplanten Touren abschließen.");
  if (attempt.status !== "pending") throw new Error("Abwerbungsversuch ist bereits abgeschlossen.");

  const driver = (state.drivers || []).find(d => d.id === attempt.driverId);
  if (!driver || !isActivelyEmployed(driver)) throw new Error("Fahrer nicht mehr verfügbar.");

  if (response === "raise_salary") {
    // Gehalt auf das Angebot des Konkurrenten anheben
    const newWage = attempt.offerDailyWageCents;
    driver.costPerDayCents = newWage;
    driver.satisfaction = clamp((driver.satisfaction || 70) + 15, 0, 100);
    driver.satisfactionReasons = retainHistory(state, "driverSatisfaction", driver.satisfactionReasons, [...(driver.satisfactionReasons || []), {
      reason: "Gehaltserhöhung durch Abwerbung: " + attempt.rivalName,
      delta: +15,
      atMin: state.gameTime,
    }].slice(-20), driver.id);
    attempt.status = "retained";

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Fahrer gehalten: " + driver.name,
      body: `Sie haben ${driver.name} durch eine Gehaltserhöhung auf ${(newWage / 100).toFixed(2)} €/Tag gehalten.\n\n` +
        `Die Zufriedenheit ist deutlich gestiegen.`,
      gameTime: state.gameTime, category: "operations", priority: "normal",
      linkedRefs: { type: "poaching_attempt", id: attempt.id },
      dedupKey: `poaching_response:${attempt.id}`,
    });

    return { ok: true, retained: true, newDailyWageCents: newWage };
  }

  if (response === "conversation") {
    // Gespräch führen — kostet Zeit aber kein Geld
    driver.satisfaction = clamp((driver.satisfaction || 70) + 10, 0, 100);
    driver.satisfactionReasons = retainHistory(state, "driverSatisfaction", driver.satisfactionReasons, [...(driver.satisfactionReasons || []), {
      reason: "Gespräch wegen Abwerbung: " + attempt.rivalName,
      delta: +10,
      atMin: state.gameTime,
    }].slice(-20), driver.id);
    attempt.status = "retained";

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Gespräch geführt: " + driver.name,
      body: `Sie haben mit ${driver.name} gesprochen. Das Gespräch hat die Situation entschärft.\n\n` +
        `Die Zufriedenheit ist gestiegen, aber der Fahrer behält das Angebot im Hinterkopf.`,
      gameTime: state.gameTime, category: "operations", priority: "normal",
      linkedRefs: { type: "poaching_attempt", id: attempt.id },
      dedupKey: `poaching_response:${attempt.id}`,
    });

    return { ok: true, retained: true };
  }

  if (response === "release") {
    // Fahrer ziehen lassen
    attempt.status = "released";
    driver.employmentStatus = "terminated";
    driver.exitDate = state.gameTime;
    driver.exitReason = "released_to_rival";
    driver.poachedByRival = attempt.rivalName;

    const rival = state.world.rivals.find(r => r.id === attempt.rivalId);
    if (rival) receivePoachedDriver(state, rival, driver);

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Fahrer entlassen: " + driver.name,
      body: `${driver.name} hat Ihr Unternehmen verlassen und zu ${attempt.rivalName} gewechselt.\n\n` +
        `Der Konkurrent hat sein Fahrerteam verstärkt.`,
      gameTime: state.gameTime, category: "operations", priority: "normal",
      linkedRefs: { type: "poaching_attempt", id: attempt.id },
      dedupKey: `poaching_response:${attempt.id}`,
    });

    return { ok: true, retained: false };
  }

  throw new Error("Ungültige Reaktion: " + response);
}

// ---------- Kooperationsangebote ----------
// Rivalen bieten gelegentlich Kooperationen an.
export function processRivalCooperation(state, m, log) {
  migrateRivalBehavior(state);
  if (!state.world?.active) return;

  const lastCheck = state.rivalBehavior.lastCooperationCheckMin || 0;
  if (m - lastCheck < COOPERATION_CHECK_INTERVAL_DAYS * DAY_MIN) return;
  state.rivalBehavior.lastCooperationCheckMin = m;

  // Abgelaufene Kooperationsangebote aufräumen
  state.rivalBehavior.pendingCooperationOffers = retainHistory(state, "cooperationOffers", state.rivalBehavior.pendingCooperationOffers, state.rivalBehavior.pendingCooperationOffers.filter(o =>
    o.status === "pending" && o.deadlineMin > m
  ), null);

  if (state.rivalBehavior.pendingCooperationOffers.length > 0) return;

  // Nur Rivalen mit guter Beziehung bieten Kooperation an
  const cooperativeRivals = state.world.rivals.filter(r =>
    independentRival(r) && r.relationship >= COOPERATION_MIN_RELATIONSHIP
  );
  if (cooperativeRivals.length === 0) return;

  const roll = rbRng(state);
  if (roll > COOPERATION_CHANCE) return;

  const rival = cooperativeRivals[Math.floor(rbRng(state) * cooperativeRivals.length)];

  // Kooperationsart bestimmen
  const cooperationTypes = [
    {
      id: "subcontract",
      label: "Subunternehmer-Verhältnis",
      description: `${rival.name} bietet an, Ihre Überkapazitäten als Subunternehmer zu nutzen. Sie erhalten zusätzliche Aufträge zu fairen Konditionen.`,
      benefit: "Zusätzliche Aufträge bei Überkapazität",
      cost: "Normale Transportkosten; Vergütung steht im Auftrag",
    },
    {
      id: "shared_route",
      label: "Gemeinsame Relation",
      description: `${rival.name} schlägt vor, eine gemeinsame Relation zu bedienen. Sie erhalten zusätzliche Angebote ab Ihrer Filiale in Richtung seines Standorts.`,
      benefit: "Zusätzliche Aufträge ab der eigenen Filiale",
      cost: "Normale Transportkosten; Annahme bleibt freiwillig",
    },
    {
      id: "capacity_rental",
      label: "Kapazitätsvermietung",
      description: `${rival.name} möchte gelegentlich Fahrzeuge von Ihnen mieten, wenn eigene Kapazitäten erschöpft sind.`,
      benefit: "Zusätzliche Einnahmen durch Fahrzeugvermietung",
      cost: "Fahrzeuge temporär gebunden",
    },
  ];

  const cooperationType = cooperationTypes[Math.floor(rbRng(state) * cooperationTypes.length)];
  const deadline = m + 3 * DAY_MIN;

  const offer = {
    id: "coop_" + (++state.rivalBehavior.rngSeed % 100000),
    rivalId: rival.id,
    rivalName: rival.name,
    cooperationType: cooperationType.id,
    cooperationLabel: cooperationType.label,
    description: cooperationType.description,
    benefit: cooperationType.benefit,
    cost: cooperationType.cost,
    deadlineMin: deadline,
    status: "pending",
    createdAtMin: m,
  };

  state.rivalBehavior.pendingCooperationOffers.push(offer);

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Kooperationsangebot: " + rival.name,
    body: `${rival.name} (${rival.strategy}) bietet eine Kooperation an.\n\n` +
      `Art: ${cooperationType.label}\n\n` +
      `${cooperationType.description}\n\n` +
      `Vorteil: ${cooperationType.benefit}\n` +
      `Bedingung: ${cooperationType.cost}\n\n` +
      `Sie haben bis ${formatGameTime(deadline)} Zeit, das Angebot anzunehmen oder abzulehnen.\n` +
      `Eine Kooperation verbessert die Beziehung zum Konkurrenten, kann aber langfristige Verpflichtungen mit sich bringen.`,
    gameTime: m, category: "operations", priority: "normal",
    linkedRefs: { type: "cooperation_offer", id: offer.id },
    dedupKey: `coop_offer:${offer.id}`,
  });

  pushEvent(state, {
    type: "rival_cooperation_offer",
    gameTime: m, isSystem: true,
    details: {
      offerId: offer.id, rivalId: rival.id, rivalName: rival.name,
      cooperationType: cooperationType.id, deadlineMin: deadline,
    },
    dedupKey: `coop_offer:${offer.id}`,
  });

  log.push({ type: "rival_cooperation_offer", offer: offer.id, rival: rival.id, atMin: m });
}

// Spieler-Reaktion auf Kooperationsangebot
export function respondToCooperationOffer(state, offerId, response) {
  migrateRivalBehavior(state);
  const offer = state.rivalBehavior.pendingCooperationOffers.find(o => o.id === offerId);
  if (!offer) throw new Error("Kooperationsangebot nicht gefunden.");
  if (offer.status !== "pending") throw new Error("Angebot ist bereits abgeschlossen.");
  if (state.gameTime > offer.deadlineMin) throw new Error("Angebot ist abgelaufen.");

  const rival = state.world?.rivals.find(r => r.id === offer.rivalId);
  if (!independentRival(rival)) throw new Error("Konkurrent nicht mehr verfügbar.");

  if (response === "accept") {
    offer.status = "accepted";
    // Beziehung zum Konkurrenten verbessern
    rival.relationship = clamp(rival.relationship + 15, 0, 100);

    // Kooperations-Effekt anwenden
    applyCooperationEffect(state, offer);

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Kooperation angenommen: " + rival.name,
      body: `Sie haben die Kooperation mit ${rival.name} angenommen.\n\n` +
        `Art: ${offer.cooperationLabel}\n\n` +
        `Die Beziehung zum Konkurrenten hat sich verbessert. ` +
        `Die Kooperation ist nun aktiv und wird je nach Art entsprechende Effekte haben.`,
      gameTime: state.gameTime, category: "operations", priority: "normal",
      linkedRefs: { type: "cooperation_offer", id: offer.id },
      dedupKey: `coop_response:${offer.id}`,
    });

    pushEvent(state, {
      type: "cooperation_accepted",
      gameTime: state.gameTime, isSystem: true,
      details: { offerId: offer.id, rivalId: rival.id, cooperationType: offer.cooperationType },
      dedupKey: `coop_accepted:${offer.id}`,
    });

    return { ok: true, accepted: true };
  }

  if (response === "decline") {
    offer.status = "declined";
    // Leichte Beziehungsverschlechterung
    rival.relationship = clamp(rival.relationship - 3, 0, 100);

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Kooperation abgelehnt: " + rival.name,
      body: `Sie haben das Kooperationsangebot von ${rival.name} abgelehnt.\n\n` +
        `Die Beziehung zum Konkurrenten hat sich leicht abgekühlt.`,
      gameTime: state.gameTime, category: "operations", priority: "low",
      linkedRefs: { type: "cooperation_offer", id: offer.id },
      dedupKey: `coop_response:${offer.id}`,
    });

    return { ok: true, accepted: false };
  }

  throw new Error("Ungültige Reaktion: " + response);
}

// Kooperations-Effekte anwenden
function applyCooperationEffect(state, offer) {
  // Kooperation als Flag speichern — konkrete Effekte werden in
  // processRivalCooperationEffects periodisch angewendet.
  if (!state.rivalBehavior.activeCooperations) state.rivalBehavior.activeCooperations = [];
  state.rivalBehavior.activeCooperations.push({
    offerId: offer.id,
    rivalId: offer.rivalId,
    cooperationType: offer.cooperationType,
    activatedAtMin: state.gameTime,
    durationDays: 14, // 14 Tage aktiv
    lastEffectMin: state.gameTime,
  });
}

// Periodische Kooperations-Effekte
export function processCooperationEffects(state, m, log) {
  migrateRivalBehavior(state);
  if (!state.rivalBehavior.activeCooperations) return;

  for (const coop of state.rivalBehavior.activeCooperations) {
    if (m - coop.lastEffectMin < DAY_MIN) continue;
    coop.lastEffectMin = m;

    // Ablauf prüfen
    const ageDays = Math.floor((m - coop.activatedAtMin) / DAY_MIN);
    if (ageDays >= coop.durationDays) {
      coop.status = "expired";
      continue;
    }

    const rival = state.world?.rivals.find(r => r.id === coop.rivalId);
    if (!independentRival(rival)) {
      coop.status = "rival_gone";
      continue;
    }

    // Effekte je nach Kooperationsart
    if (["subcontract", "shared_route"].includes(coop.cooperationType)) {
      // Subunternehmer: Gelegentlich zusätzliche Aufträge vom Konkurrenten
      const roll = rbRng(state);
      if (roll < 0.3) {
        // Zusätzlicher Auftrag generieren (vereinfacht)
        const cities = ["Hamburg", "Bremen", "Hannover", "Berlin", "Kiel"];
        const fromCity = coop.cooperationType === "shared_route" ? (state.branches.find(b => b.status === "active")?.city || rival.city) : cities[Math.floor(rbRng(state) * cities.length)];
        let toCity = coop.cooperationType === "shared_route" ? rival.city : cities[Math.floor(rbRng(state) * cities.length)];
        while (toCity === fromCity) toCity = cities[Math.floor(rbRng(state) * cities.length)];

        const payment = 80000 + Math.floor(rbRng(state) * 40000); // 800-1200 €
        const orderId = "coop_order_" + (++state.idCounter);
        state.orders.push({
          id: orderId,
          customerId: null,
          customer: rival.name + " (Subunternehmer)",
          shipmentId: "CO" + state.idCounter,
          fromCity, toCity,
          cargo: "Stückgut", tons: 8,
          paymentCents: payment,
          offerType: "normal",
          relationFactor: 1.0,
          publishedAtMin: m,
          acceptDeadlineMin: m + 12 * 60,
          earliestPickupMin: m + 60,
          latestLoadStartMin: m + 12 * 60,
          windowVersion: 2,
          deliveryDeadlineMin: m + 24 * 60,
          paymentTermsDays: 0,
          paymentDueMin: null,
          status: "offered",
          acceptedAtMin: null, startedAtMin: null, deliveredAtMin: null, paidCents: null,
          acceptedById: null, acceptedByName: null,
          plannedById: null, plannedByName: null,
          feasible: true,
          history: [{ type: "coop_subcontract", min: m, details: { rivalId: rival.id } }],
          isCoopOrder: true,
          coopRivalId: rival.id,
        });

        log.push({ type: "coop_subcontract_order", order: orderId, rival: rival.id, atMin: m });
      }
    }

    if (coop.cooperationType === "capacity_rental") {
      // Kapazitätsvermietung: Gelegentlich Einnahmen durch vermietete Fahrzeuge
      const roll = rbRng(state);
      if (roll < 0.2) {
        const rentalIncome = 30000 + Math.floor(rbRng(state) * 20000); // 300-500 €
        if (startCompetitionRental(state, rival, m, rentalIncome)) log.push({ type: "coop_rental_started", income: rentalIncome, rival: rival.id, atMin: m });
      }
    }
  }

  // Abgelaufene Kooperationen entfernen
  state.rivalBehavior.activeCooperations = retainHistory(state, "cooperations", state.rivalBehavior.activeCooperations, state.rivalBehavior.activeCooperations.filter(c =>
    c.status !== "expired" && c.status !== "rival_gone"
  ), null);
}

// Abgelaufene Kooperationsangebote auflösen
export function resolveCooperationOffers(state, m, log) {
  migrateRivalBehavior(state);

  for (const offer of state.rivalBehavior.pendingCooperationOffers) {
    if (offer.status !== "pending") continue;
    if (m < offer.deadlineMin) continue;

    offer.status = "expired";
    const rival = state.world?.rivals.find(r => r.id === offer.rivalId);
    if (rival) {
      rival.relationship = clamp(rival.relationship - 2, 0, 100);
    }

    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Kooperationsangebot abgelaufen: " + (rival?.name || offer.rivalName),
      body: `Das Kooperationsangebot von ${rival?.name || offer.rivalName} ist abgelaufen.\n\n` +
        `Sie haben nicht rechtzeitig reagiert. Die Beziehung hat sich minimal abgekühlt.`,
      gameTime: m, category: "operations", priority: "low",
      linkedRefs: { type: "cooperation_offer", id: offer.id },
      dedupKey: `coop_expired:${offer.id}`,
    });
  }

  // Aufräumen
  if (state.rivalBehavior.pendingCooperationOffers.length > 50) {
    state.rivalBehavior.pendingCooperationOffers = retainLatestHistory(state, "cooperationOffers", state.rivalBehavior.pendingCooperationOffers, 50, null);
  }
}

// ---------- UI-Hilfsfunktionen ----------
export function getRivalBehaviorOverview(state) {
  migrateRivalBehavior(state);

  return {
    pendingPoachingAttempts: state.rivalBehavior.pendingPoachingAttempts.filter(a => a.status === "pending"),
    pendingCooperationOffers: state.rivalBehavior.pendingCooperationOffers.filter(o => o.status === "pending"),
    activeCooperations: state.rivalBehavior.activeCooperations || [],
    rivalStats: (state.world?.rivals || []).map(r => ({
      id: r.id,
      name: r.name,
      pricePercent: r.pricePercent,
      relationship: r.relationship,
      losses: state.rivalBehavior.lossesByRival[r.id] || 0,
      wins: state.rivalBehavior.winsByRival[r.id] || 0,
    })),
  };
}

// Hilfsfunktion: formatGameTime lokal (vermeidet Circular Import)
function formatGameTime(min) {
  const day = Math.floor(min / 1440) + 1;
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return "Tag " + day + ", " + (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
}
function driverCommitted(state, id) {
  return (state.trips || []).some(t => t.driverId === id && t.status === "in_progress") || (state.tours || []).some(t => ["active", "planned"].includes(t.status) && (t.deployments || []).some(d => d.driverId === id && ["planned", "in_progress"].includes(d.status)));
}
function receivePoachedDriver(state, rival, driver) {
  migrateCompetition(state);
  if(!rival.business.staff.some(p => p.id === "poached_" + driver.id)) rival.business.staff.push({id:"poached_"+driver.id,name:driver.name,role:"driver",costPerDayCents:Math.round(driver.costPerDayCents*1.3),status:"employed",satisfaction:75,qualifications:["driver_license"]});
}
