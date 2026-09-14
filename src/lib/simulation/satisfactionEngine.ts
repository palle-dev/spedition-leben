// Zufriedenheits-Engine für FERNWERK – Auftrag 30.
// Verwaltet Ursachen, Maßnahmen, Gespräche, Erholung und Kündigungsrisiken.
// Zentrale Ereignis-/Gründeverwaltung für alle Rollen.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.

import { dayOf, formatGameTime, NOTICE_PERIOD_MIN } from "./gameRules.ts";
import { isActivelyEmployed, findPerson } from "./terminationEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { settleOpenItem, book as _book } from "./accountingEngine.ts";

// ---------- Konstanten ----------
const DAY_MIN = 1440;
const CONVERSATION_DURATION_MIN = 30;
const RECOVERY_TARGET = 70;
const RECOVERY_DELTA = 3;
const CONVERSATION_BONUS = 2;
const CONVERSATION_COOLDOWN_DAYS = 7;
const BONUS_BONUS = 4;
const BONUS_COOLDOWN_DAYS = 30;
const RAISE_BONUS = 5;
const RAISE_COOLDOWN_DAYS = 30;
const RAISE_MIN_PCT = 10;
const WAGE_RECOGNITION_BONUS = 6;
const WAGE_RECOGNITION_COOLDOWN_DAYS = 30;
const LOW_SATISFACTION_THRESHOLD = 30;
const CONVERSATION_WISH_DAYS = 2;
const SELF_TERMINATION_DAYS = 5;
const RETENTION_THRESHOLD = 45;
const BAD_VEHICLE_THRESHOLD = 40;
const DIRTY_THRESHOLD = 30;
const DIRTY_DAYS_THRESHOLD = 3;
const BAD_VEHICLE_DELTA = -2;
const DIRTY_DELTA = -1;
const UNPAID_WAGE_DELTA = -6;
const VACATION_APPROVE_DELTA = 3;
const VACATION_REJECT_DELTA = -3;

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function clampSat(v) { return Math.max(0, Math.min(100, v)); }

// ---------- Migration ----------
export function migrateSatisfaction(state) {
  if (!state.satisfaction) {
    state.satisfaction = {
      causes: [],
      history: [],
      conversations: [],
      commitments: [],
      cooldowns: {},
    };
  }
  if (!state.satisfaction.causes) state.satisfaction.causes = [];
  if (!state.satisfaction.history) state.satisfaction.history = [];
  if (!state.satisfaction.conversations) state.satisfaction.conversations = [];
  if (!state.satisfaction.commitments) state.satisfaction.commitments = [];
  if (!state.satisfaction.cooldowns) state.satisfaction.cooldowns = {};

  // Personen um satisfactionHistory erweitern falls fehlt
  for (const d of (state.drivers || [])) {
    if (d.satisfaction === undefined) d.satisfaction = 70;
    if (d.consecutiveLowSatisfactionDays === undefined) d.consecutiveLowSatisfactionDays = 0;
    if (d.lastSatisfactionEffectDay === undefined) d.lastSatisfactionEffectDay = 0;
  }
  for (const e of (state.employees || [])) {
    if (e.satisfaction === undefined) e.satisfaction = 70;
    if (e.consecutiveLowSatisfactionDays === undefined) e.consecutiveLowSatisfactionDays = 0;
    if (e.lastSatisfactionEffectDay === undefined) e.lastSatisfactionEffectDay = 0;
  }
}

// ---------- Ursachen-Verwaltung ----------

// Findet oder erstellt eine aktive Ursache für eine Person.
export function findOrCreateCause(state, personId, type, label, linkedRefIds, meta) {
  let cause = state.satisfaction.causes.find(
    c => c.personId === personId && c.type === type && c.status === "active"
  );
  if (!cause) {
    cause = {
      id: uid(state, "satc"),
      personId,
      type,
      label,
      startMin: state.gameTime,
      lastEffectMin: null,
      lastEffectDelta: 0,
      status: "active",
      resolvedAtMin: null,
      linkedRefIds: linkedRefIds || [],
      meta: meta || {},
    };
    state.satisfaction.causes.push(cause);
  } else {
    // Update label and linked refs
    if (label) cause.label = label;
    if (linkedRefIds) {
      for (const id of linkedRefIds) {
        if (!cause.linkedRefIds.includes(id)) cause.linkedRefIds.push(id);
      }
    }
    if (meta) cause.meta = { ...cause.meta, ...meta };
  }
  return cause;
}

// Markiert eine Ursache als erledigt.
export function resolveCause(state, causeId, resolvedAtMin) {
  const cause = state.satisfaction.causes.find(c => c.id === causeId);
  if (!cause || cause.status !== "active") return null;
  cause.status = "resolved";
  cause.resolvedAtMin = resolvedAtMin || state.gameTime;
  return cause;
}

// Liefert alle aktiven Ursachen für eine Person.
export function getActiveCauses(state, personId) {
  return state.satisfaction.causes.filter(c => c.personId === personId && c.status === "active");
}

// Liefert alle erledigten Ursachen für eine Person (Historie).
export function getResolvedCauses(state, personId) {
  return state.satisfaction.causes
    .filter(c => c.personId === personId && c.status === "resolved")
    .sort((a, b) => (b.resolvedAtMin || 0) - (a.resolvedAtMin || 0));
}

// Liefert die Zufriedenheits-Historie für eine Person.
export function getSatisfactionHistory(state, personId) {
  return state.satisfaction.history
    .filter(h => h.personId === personId)
    .sort((a, b) => b.atMin - a.atMin);
}

// ---------- Zufriedenheitsänderung anwenden ----------

// Wendet eine Zufriedenheitsänderung an, begrenzt auf 0–100, speichert die
// tatsächliche Änderung nach Begrenzung in der Historie.
export function applySatisfactionChange(state, personId, delta, trigger, causeType, causeId) {
  const found = findPerson(state, personId);
  if (!found) return { applied: 0, newValue: 0 };
  const person = found.person;
  const oldValue = person.satisfaction ?? 70;
  const newValue = clampSat(oldValue + delta);
  const actualDelta = newValue - oldValue;
  person.satisfaction = newValue;

  // Historie speichern
  const record = {
    id: uid(state, "sh"),
    personId,
    causeId: causeId || null,
    atMin: state.gameTime,
    delta,
    actualDelta,
    oldValue,
    newValue,
    trigger: trigger || causeType || "unknown",
    causeType: causeType || null,
  };
  state.satisfaction.history.push(record);

  // Ursache aktualisieren falls causeId gegeben
  if (causeId) {
    const cause = state.satisfaction.causes.find(c => c.id === causeId);
    if (cause) {
      cause.lastEffectMin = state.gameTime;
      cause.lastEffectDelta = actualDelta;
    }
  }

  // Legacy-Array aktualisieren für Kompatibilität
  if (!person.satisfactionReasons) person.satisfactionReasons = [];
  person.satisfactionReasons.push({
    reason: trigger || causeType || "Änderung",
    atMin: state.gameTime,
    delta: actualDelta,
  });

  return { applied: actualDelta, newValue };
}

// ---------- Cooldown-Verwaltung ----------

function getCooldown(state, personId) {
  if (!state.satisfaction.cooldowns[personId]) {
    state.satisfaction.cooldowns[personId] = {
      lastBonusMin: null,
      lastRaiseMin: null,
      lastConversationMin: null,
      lastWageRecognitionMin: null,
    };
  }
  return state.satisfaction.cooldowns[personId];
}

function daysBetween(minA, minB) {
  return Math.floor(Math.abs(minA - minB) / DAY_MIN);
}

function isCooldownActive(lastMin, cooldownDays, currentMin) {
  if (!lastMin) return false;
  return daysBetween(lastMin, currentMin) < cooldownDays;
}

function nextAvailableMin(lastMin, cooldownDays) {
  if (!lastMin) return null;
  return lastMin + cooldownDays * DAY_MIN;
}

// ---------- Tägliche Zufriedenheitsregeln ----------

// Hauptfunktion: wird nach der Lohnzahlung in doDailyAccounting aufgerufen.
// Prüft alle belegten Belastungsursachen und wendet Zufriedenheitsänderungen an.
export function processDailySatisfaction(state, midnight) {
  const day = dayOf(midnight);
  const log = [];

  // 1. Unbezahlte Löhne: −6 je Person/Tag (einmal, nicht je Rechnung)
  for (const d of (state.drivers || [])) {
    if (!isActivelyEmployed(d)) continue;
    const unpaidItems = getUnpaidWageItems(state, d.id);
    if (unpaidItems.length > 0) {
      const totalCents = unpaidItems.reduce((s, o) => s + o.remainingCents, 0);
      const cause = findOrCreateCause(state, d.id, "unpaid_wage",
        `${unpaidItems.length} fällige Löhne offen: ${(totalCents / 100).toFixed(0)} €`,
        unpaidItems.map(o => o.id),
        { totalCents, count: unpaidItems.length }
      );
      // Nur einmal pro Tag
      if (cause.meta.lastEffectDay !== day) {
        const r = applySatisfactionChange(state, d.id, UNPAID_WAGE_DELTA,
          "Tagesabschluss: unbezahlter Lohn", "unpaid_wage", cause.id);
        cause.meta.lastEffectDay = day;
        log.push({ personId: d.id, type: "unpaid_wage", delta: r.applied });
      }
    }
  }
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    const unpaidItems = getUnpaidWageItems(state, emp.id);
    if (unpaidItems.length > 0) {
      const totalCents = unpaidItems.reduce((s, o) => s + o.remainingCents, 0);
      const cause = findOrCreateCause(state, emp.id, "unpaid_wage",
        `${unpaidItems.length} fällige Löhne offen: ${(totalCents / 100).toFixed(0)} €`,
        unpaidItems.map(o => o.id),
        { totalCents, count: unpaidItems.length }
      );
      if (cause.meta.lastEffectDay !== day) {
        const r = applySatisfactionChange(state, emp.id, UNPAID_WAGE_DELTA,
          "Tagesabschluss: unbezahlter Lohn", "unpaid_wage", cause.id);
        cause.meta.lastEffectDay = day;
        log.push({ personId: emp.id, type: "unpaid_wage", delta: r.applied });
      }
    }
  }

  // 2. Schlechtes Fahrzeug: −2 pro Fahrer/Tag mit Zustand unter 40
  for (const d of (state.drivers || [])) {
    if (!isActivelyEmployed(d)) continue;
    // Prüfen ob der Fahrer heute ein Fahrzeug mit Zustand < 40 genutzt hat
    const badVehicle = getBadVehicleForDriver(state, d, midnight);
    if (badVehicle) {
      const cause = findOrCreateCause(state, d.id, "bad_vehicle",
        `Fahrzeug ${badVehicle.label} im kritischen Zustand (${badVehicle.condition}/100)`,
        [badVehicle.vehicleId],
        { vehicleId: badVehicle.vehicleId, condition: badVehicle.condition }
      );
      if (cause.meta.lastEffectDay !== day) {
        const r = applySatisfactionChange(state, d.id, BAD_VEHICLE_DELTA,
          `Tagesabschluss: Fahrzeugzustand unter 40`, "bad_vehicle", cause.id);
        cause.meta.lastEffectDay = day;
        log.push({ personId: d.id, type: "bad_vehicle", delta: r.applied });
      }
    } else {
      // Kein schlechtes Fahrzeug mehr → Ursache erledigen
      const cause = state.satisfaction.causes.find(
        c => c.personId === d.id && c.type === "bad_vehicle" && c.status === "active"
      );
      if (cause) {
        resolveCause(state, cause.id, midnight);
        log.push({ personId: d.id, type: "bad_vehicle_resolved" });
      }
    }
  }

  // 3. Schmutziger Standort: −1 pro Person/Tag nach 3 Tagen unter Sauberkeit 30
  for (const b of (state.branches || [])) {
    if ((b.cleanliness ?? 100) < DIRTY_THRESHOLD) {
      b.consecutiveDirtyDays = (b.consecutiveDirtyDays || 0) + 1;
    } else {
      b.consecutiveDirtyDays = 0;
    }
    if ((b.consecutiveDirtyDays || 0) >= DIRTY_DAYS_THRESHOLD) {
      // Alle am Standort tätigen Personen
      const persons = getPersonsAtBranch(state, b.id);
      for (const p of persons) {
        if (!isActivelyEmployed(p)) continue;
        const cause = findOrCreateCause(state, p.id, "dirty_workplace",
          `Arbeitsplatz ${b.name} seit ${b.consecutiveDirtyDays} Tagen unter Sauberkeit 30`,
          [b.id],
          { branchId: b.id, consecutiveDirtyDays: b.consecutiveDirtyDays }
        );
        if (cause.meta.lastEffectDay !== day) {
          const r = applySatisfactionChange(state, p.id, DIRTY_DELTA,
            `Tagesabschluss: schmutziger Arbeitsplatz`, "dirty_workplace", cause.id);
          cause.meta.lastEffectDay = day;
          log.push({ personId: p.id, type: "dirty_workplace", delta: r.applied });
        }
      }
    } else {
      // Sauberkeit wieder ok → Ursachen erledigen
      const causes = state.satisfaction.causes.filter(
        c => c.type === "dirty_workplace" && c.status === "active" &&
          c.meta.branchId === b.id
      );
      for (const c of causes) {
        resolveCause(state, c.id, midnight);
        log.push({ personId: c.personId, type: "dirty_workplace_resolved" });
      }
    }
  }

  // 4. Ursachen für unbezahlte Löhne erledigen wenn vollständig bezahlt
  for (const personId of new Set([
    ...(state.drivers || []).map(d => d.id),
    ...(state.employees || []).map(e => e.id),
  ])) {
    const unpaidItems = getUnpaidWageItems(state, personId);
    const cause = state.satisfaction.causes.find(
      c => c.personId === personId && c.type === "unpaid_wage" && c.status === "active"
    );
    if (cause && unpaidItems.length === 0) {
      resolveCause(state, cause.id, midnight);
      // +6 Anerkennung mit 30-Tage-Abstand
      const cd = getCooldown(state, personId);
      if (!isCooldownActive(cd.lastWageRecognitionMin, WAGE_RECOGNITION_COOLDOWN_DAYS, midnight)) {
        applySatisfactionChange(state, personId, WAGE_RECOGNITION_BONUS,
          "Anerkennung: Lohnrückstand vollständig beglichen", "wages_paid", cause.id);
        cd.lastWageRecognitionMin = midnight;
        log.push({ personId, type: "wage_recognition", delta: WAGE_RECOGNITION_BONUS });
      }
    }
  }

  return log;
}

// ---------- Tägliche Erholung ----------

// Nach einem vollständig verstrichenen Spieltag ohne aktive negative Ursache
// und ohne neuen negativen Effekt: +3 bis höchstens 70.
export function processDailyRecovery(state, midnight) {
  const day = dayOf(midnight);
  const log = [];

  for (const d of (state.drivers || [])) {
    if (!isActivelyEmployed(d)) continue;
    applyRecovery(state, d, day, midnight, log);
  }
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    applyRecovery(state, emp, day, midnight, log);
  }
  return log;
}

function applyRecovery(state, person, day, midnight, log) {
  // Nur unterhalb 70
  if ((person.satisfaction ?? 70) >= RECOVERY_TARGET) return;

  // Aktive negative Ursachen prüfen
  const activeCauses = getActiveCauses(state, person.id);
  const hasNegativeCause = activeCauses.some(c =>
    ["unpaid_wage", "bad_vehicle", "dirty_workplace", "vacation_denied"].includes(c.type)
  );
  if (hasNegativeCause) return;

  // Neue negative Effekte an diesem Tag prüfen
  const todayChanges = state.satisfaction.history.filter(
    h => h.personId === person.id && h.atMin > midnight - DAY_MIN && h.atMin <= midnight
  );
  const hadNegativeEffect = todayChanges.some(h => h.actualDelta < 0);
  if (hadNegativeEffect) return;

  // An diesem Tag unbezahlt gebliebener Lohn verhindert Erholung
  const unpaidItems = getUnpaidWageItems(state, person.id);
  if (unpaidItems.length > 0) return;

  // Genehmigter Urlaub ohne offene Probleme kann als unbelasteter Tag zählen
  // (ist durch die Abwesenheit automatisch abgedeckt – keine extra Prüfung nötig)

  // Erholung anwenden, höchstens einmal pro Tag
  if (person.lastRecoveryDay === day) return;
  person.lastRecoveryDay = day;

  const oldValue = person.satisfaction ?? 70;
  const newValue = Math.min(RECOVERY_TARGET, oldValue + RECOVERY_DELTA);
  const actualDelta = newValue - oldValue;
  if (actualDelta > 0) {
    person.satisfaction = newValue;
    state.satisfaction.history.push({
      id: uid(state, "sh"),
      personId: person.id,
      causeId: null,
      atMin: midnight,
      delta: RECOVERY_DELTA,
      actualDelta,
      oldValue,
      newValue,
      trigger: "Tägliche Erholung (unbelasteter Tag)",
      causeType: "recovery",
    });
    log.push({ personId: person.id, type: "recovery", delta: actualDelta });
  }
}

// ---------- Kündigungsrisiko ----------

// Prüft aufeinanderfolgende Tage mit niedriger Zufriedenheit und löst
// Gesprächswunsch (nach 2 Tagen) oder Eigenkündigung (nach 5 Tagen) aus.
export function processTerminationWarnings(state, midnight) {
  const day = dayOf(midnight);
  const log = [];

  for (const d of (state.drivers || [])) {
    if (!isActivelyEmployed(d)) continue;
    checkTerminationRisk(state, d, day, midnight, log, "driver");
  }
  for (const emp of (state.employees || [])) {
    if (!isActivelyEmployed(emp)) continue;
    checkTerminationRisk(state, emp, day, midnight, log, "employee");
  }
  return log;
}

function checkTerminationRisk(state, person, day, midnight, log, kind) {
  const sat = person.satisfaction ?? 70;
  const wasLow = (person.lastSatisfactionEffectDay || 0) >= day - 1 &&
    (person.consecutiveLowSatisfactionDays || 0) > 0;

  if (sat < LOW_SATISFACTION_THRESHOLD) {
    // Nur fortsetzen wenn der Vortag auch niedrig war
    const prevDay = day - 1;
    const wasLowYesterday = (person.lastSatisfactionEffectDay || 0) === prevDay ||
      ((person.consecutiveLowSatisfactionDays || 0) > 0 &&
        (person.lastSatisfactionEffectDay || 0) >= prevDay - (person.consecutiveLowSatisfactionDays || 0) + 1);

    if ((person.consecutiveLowSatisfactionDays || 0) === 0 || !wasLowYesterday) {
      person.consecutiveLowSatisfactionDays = 1;
    } else {
      person.consecutiveLowSatisfactionDays = (person.consecutiveLowSatisfactionDays || 0) + 1;
    }
    person.lastSatisfactionEffectDay = day;

    const count = person.consecutiveLowSatisfactionDays;

    // Nach 2 Tagen: Gesprächswunsch per Mail
    if (count === CONVERSATION_WISH_DAYS && !person.conversationWishSent) {
      person.conversationWishSent = true;
      deliverMessage(state, {
        fromId: person.id, toId: "player",
        subject: "Gesprächswunsch: " + person.name,
        body: `${person.name} möchte ein persönliches Gespräch. Die Zufriedenheit ist seit ${count} Tagen kritisch niedrig (${sat}/100).\n\nBitte vereinbare ein Gespräch über die Personal-Seite.`,
        gameTime: midnight, category: "personnel", priority: "high",
        linkedRefs: { type: "employee", id: person.id },
        dedupKey: `conversation_wish:${person.id}:${day}`,
        quickReplies: [
          { label: "Gespräch vorbereiten", intentType: "prepare_conversation", params: { personId: person.id } },
          { label: "Personal öffnen", intentType: "open_personnel", params: {} },
        ],
      });
      log.push({ personId: person.id, type: "conversation_wish" });
    }

    // Nach 5 Tagen: Eigenkündigung ankündigen
    if (count >= SELF_TERMINATION_DAYS && person.employmentStatus === "employed") {
      const exitMin = midnight + NOTICE_PERIOD_MIN;
      person.employmentStatus = "notice_given";
      person.exitMin = exitMin;
      person.exitMode = "continue_working";
      person.noticeDeclaredAtMin = midnight;
      person.noticeDeclaredBy = "self";
      person.selfTermination = true;

      deliverMessage(state, {
        fromId: person.id, toId: "player",
        subject: "Eigenkündigung: " + person.name,
        body: `${person.name} hat nach ${count} Tagen ununterbrochen niedriger Zufriedenheit die Eigenkündigung erklärt.\n\nAustritt: ${formatGameTime(exitMin)}\nAktuelle Zufriedenheit: ${sat}/100\nBis ${RETENTION_THRESHOLD} Punkte nötig für ein Bleibegespräch.\n\nOffene Lohnansprüche beglichen und Zufriedenheit ≥ 45 vorausgesetzt, kann ein Bleibegespräch die Kündigung zurücknehmen.`,
        gameTime: midnight, category: "personnel", priority: "high",
        linkedRefs: { type: "employee", id: person.id },
        dedupKey: `self_termination:${person.id}:${day}`,
        quickReplies: [
          { label: "Bleibegespräch vorbereiten", intentType: "prepare_retention", params: { personId: person.id } },
          { label: "Personal öffnen", intentType: "open_personnel", params: {} },
        ],
      });
      log.push({ personId: person.id, type: "self_termination", exitMin });
    }
  } else {
    // Nicht mehr kritisch → Serie unterbrechen
    if ((person.consecutiveLowSatisfactionDays || 0) > 0) {
      person.consecutiveLowSatisfactionDays = 0;
      person.conversationWishSent = false;
      log.push({ personId: person.id, type: "low_satisfaction_reset" });
    }
  }
}

// ---------- Hilfsfunktionen für Ursachen-Ermittlung ----------

// Liefert alle unbezahlten Lohn-Offenen-Posten für eine Person.
export function getUnpaidWageItems(state, personId) {
  return (state.accounting?.openItems || []).filter(o =>
    o.employeeId === personId &&
    o.remainingCents > 0
  );
}

// Prüft ob ein Fahrer an diesem Tag ein Fahrzeug mit Zustand < 40 genutzt hat.
function getBadVehicleForDriver(state, driver, midnight) {
  const dayStart = midnight - DAY_MIN;
  // Abgeschlossene Trips an diesem Tag
  const trips = (state.trips || []).filter(t =>
    t.driverId === driver.id && t.status === "completed" &&
    t.endMin > dayStart && t.endMin <= midnight
  );
  for (const trip of trips) {
    const vehicle = (state.vehicles || []).find(v => v.id === trip.vehicleId);
    if (vehicle && (vehicle.condition ?? 100) < BAD_VEHICLE_THRESHOLD) {
      const n = parseInt(String(vehicle.id).replace(/[^0-9]/g, ""), 10) || 1;
      return {
        vehicleId: vehicle.id,
        label: "Lkw " + String(n).padStart(2, "0"),
        condition: vehicle.condition,
      };
    }
  }
  // Aktuell zugewiesenes Fahrzeug prüfen (wenn auf Tour)
  if (driver.status === "on_trip" && driver.tripId) {
    const trip = (state.trips || []).find(t => t.id === driver.tripId && t.status === "in_progress");
    if (trip) {
      const vehicle = (state.vehicles || []).find(v => v.id === trip.vehicleId);
      if (vehicle && (vehicle.condition ?? 100) < BAD_VEHICLE_THRESHOLD) {
        const n = parseInt(String(vehicle.id).replace(/[^0-9]/g, ""), 10) || 1;
        return {
          vehicleId: vehicle.id,
          label: "Lkw " + String(n).padStart(2, "0"),
          condition: vehicle.condition,
        };
      }
    }
  }
  return null;
}

// Liefert alle Personen an einem Standort.
function getPersonsAtBranch(state, branchId) {
  const persons = [];
  for (const d of (state.drivers || [])) {
    if (d.branchId === branchId) persons.push(d);
  }
  for (const e of (state.employees || [])) {
    if (e.branchId === branchId) persons.push(e);
  }
  return persons;
}

// ---------- Maßnahmen ----------

// A. Ausstehende Löhne begleichen
export function payPersonWages(state, personId, itemIds) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");
  if (!isActivelyEmployed(found.person)) throw new Error("Person ist nicht mehr aktiv beschäftigt.");

  const allItems = getUnpaidWageItems(state, personId);
  const items = itemIds
    ? allItems.filter(o => itemIds.includes(o.id))
    : allItems;

  if (items.length === 0) throw new Error("Keine offenen Lohnforderungen für diese Person.");

  const totalCents = items.reduce((s, o) => s + o.remainingCents, 0);
  if (state.company.accountCents <= 0) throw new Error("Firmenkonto hat keinen Saldo.");

  let paidTotal = 0;
  const paidItems = [];
  for (const item of items) {
    if (state.company.accountCents <= 0) break;
    const r = settleOpenItem(state, item.id, item.remainingCents);
    paidTotal += r.paid;
    paidItems.push({ id: item.id, paid: r.paid, remaining: r.remaining });
  }

  // Ursache wird erst erledigt wenn vollständig beglichen (in processDailySatisfaction)
  return {
    ok: true,
    personId,
    paidCents: paidTotal,
    paidItems,
    remainingOpenCents: getUnpaidWageItems(state, personId).reduce((s, o) => s + o.remainingCents, 0),
  };
}

// B. Gehalt erhöhen
export function raiseSalary(state, personId, newDailyWageCents) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");
  if (!isActivelyEmployed(found.person)) throw new Error("Person ist nicht mehr aktiv beschäftigt.");

  const person = found.person;
  const oldWage = person.costPerDayCents || 0;
  if (newDailyWageCents <= oldWage) throw new Error("Neues Gehalt muss höher als das aktuelle sein.");
  const pct = ((newDailyWageCents - oldWage) / oldWage) * 100;
  if (pct < RAISE_MIN_PCT) throw new Error(`Erhöhung muss mindestens ${RAISE_MIN_PCT}% betragen (aktuell ${pct.toFixed(1)}%).`);

  const cd = getCooldown(state, personId);
  const hasCooldown = isCooldownActive(cd.lastRaiseMin, RAISE_COOLDOWN_DAYS, state.gameTime);

  // Gehalt ändern
  person.costPerDayCents = newDailyWageCents;
  person.salaryRaisedAtMin = state.gameTime;

  // +5 nur bei erfülltem 30-Tage-Abstand
  let bonusApplied = false;
  if (!hasCooldown) {
    applySatisfactionChange(state, personId, RAISE_BONUS,
      `Gehaltserhöhung um ${pct.toFixed(0)}%`, "salary_raised", null);
    cd.lastRaiseMin = state.gameTime;
    bonusApplied = true;
  }

  // Commitment speichern
  state.satisfaction.commitments.push({
    id: uid(state, "comm"),
    personId,
    type: "salary_raise",
    description: `Gehalt von ${(oldWage / 100).toFixed(0)} € auf ${(newDailyWageCents / 100).toFixed(0)} €/Tag`,
    responsibleId: "player",
    dueMin: null,
    fulfilledAtMin: state.gameTime,
    status: "fulfilled",
    linkedRefIds: [],
    meta: { oldWage, newWage: newDailyWageCents, pct, bonusApplied },
  });

  return {
    ok: true,
    personId,
    oldDailyWageCents: oldWage,
    newDailyWageCents,
    pct,
    morePerDay: newDailyWageCents - oldWage,
    morePer30Days: (newDailyWageCents - oldWage) * 30,
    bonusApplied,
    nextBonusMin: bonusApplied ? nextAvailableMin(cd.lastRaiseMin, RAISE_COOLDOWN_DAYS) : null,
  };
}

// C. Einmalige Anerkennungsprämie
export function giveBonus(state, personId) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");
  if (!isActivelyEmployed(found.person)) throw new Error("Person ist nicht mehr aktiv beschäftigt.");

  const person = found.person;

  // Bei offenen Löhnen sperren
  const unpaidItems = getUnpaidWageItems(state, personId);
  if (unpaidItems.length > 0) {
    throw new Error("Bei offenen Lohnforderungen ist eine Prämie nicht möglich. Bitte begleiche zuerst die Löhne.");
  }

  const cd = getCooldown(state, personId);
  if (isCooldownActive(cd.lastBonusMin, BONUS_COOLDOWN_DAYS, state.gameTime)) {
    const next = nextAvailableMin(cd.lastBonusMin, BONUS_COOLDOWN_DAYS);
    throw new Error(`Prämie bereits vergeben. Nächste Möglichkeit: ${formatGameTime(next)}.`);
  }

  const bonusAmount = person.costPerDayCents || 0;
  if (bonusAmount <= 0) throw new Error("Tageslohn ist 0 – keine Prämie möglich.");
  if (state.company.accountCents < bonusAmount) {
    throw new Error(`Firmenkonto reicht für die Prämie (${(bonusAmount / 100).toFixed(0)} €) nicht aus.`);
  }

  // Firmenausgabe als Personalprämie (Konto 5140)
  // Direkte Buchung ohne neue offene Posten
  _book(state, "expense", {
    text: `Personalprämie: ${person.name}`,
    type: "personnel_bonus",
    actor: "player",
    employeeId: personId,
    expenseAccount: "5140",
    amountCents: bonusAmount,
    paidCents: bonusAmount,
    unpaidCents: 0,
  });

  // +4 Zufriedenheit
  applySatisfactionChange(state, personId, BONUS_BONUS,
    `Anerkennungsprämie (${(bonusAmount / 100).toFixed(0)} €)`, "bonus_given", null);
  cd.lastBonusMin = state.gameTime;

  return {
    ok: true,
    personId,
    bonusCents: bonusAmount,
    bonusApplied: BONUS_BONUS,
    nextBonusMin: nextAvailableMin(cd.lastBonusMin, BONUS_COOLDOWN_DAYS),
  };
}



// D. Gespräch vorbereiten (kostenlos, nur Vorschau)
export function prepareConversation(state, personId) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");

  const person = found.person;
  const activeCauses = getActiveCauses(state, personId);
  const history = getSatisfactionHistory(state, personId);
  const cd = getCooldown(state, personId);

  // Verfügbarkeit prüfen
  const available = isPersonAvailable(state, personId, state.gameTime);
  const playerBlocked = isPlayerBlockedForConversation(state);
  const driverOnTrip = found.kind === "driver" && person.status === "on_trip";

  return {
    ok: true,
    personId,
    name: person.name,
    satisfaction: person.satisfaction ?? 70,
    activeCauses: activeCauses.map(c => ({
      id: c.id,
      type: c.type,
      label: c.label,
      startMin: c.startMin,
      lastEffectMin: c.lastEffectMin,
      lastEffectDelta: c.lastEffectDelta,
    })),
    canConduct: available && !playerBlocked && !driverOnTrip,
    blockReason: !available ? "Mitarbeiter nicht verfügbar (krank/urlaub)" :
      playerBlocked ? "GF ist derzeit beschäftigt" :
      driverOnTrip ? "Fahrer ist auf Tour" : null,
    conversationCooldownActive: isCooldownActive(cd.lastConversationMin, CONVERSATION_COOLDOWN_DAYS, state.gameTime),
    nextConversationMin: nextAvailableMin(cd.lastConversationMin, CONVERSATION_COOLDOWN_DAYS),
    currentBonus: CONVERSATION_BONUS,
  };
}

// D. Gespräch durchführen (30 Spielminuten)
export function conductConversation(state, personId) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");
  if (!isActivelyEmployed(found.person)) throw new Error("Person ist nicht mehr aktiv beschäftigt.");

  const person = found.person;

  // Verfügbarkeit prüfen
  if (!isPersonAvailable(state, personId, state.gameTime)) {
    throw new Error("Mitarbeiter ist nicht verfügbar (krank oder auf Urlaub).");
  }
  if (isPlayerBlockedForConversation(state)) {
    throw new Error("Du bist derzeit beschäftigt. Bitte schließe die laufende Aktivität ab.");
  }
  if (found.kind === "driver" && person.status === "on_trip") {
    throw new Error("Fahrer ist auf Tour – Gespräch nicht während der Fahrt möglich.");
  }

  const startMin = state.gameTime;
  const endMin = startMin + CONVERSATION_DURATION_MIN;

  // Gespräch erstellen
  const conversation = {
    id: uid(state, "conv"),
    personId,
    personName: person.name,
    startMin,
    endMin,
    status: "planned",
    type: "regular",
    resultDelta: 0,
  };
  state.satisfaction.conversations.push(conversation);

  // Termin für GF-Blockierung erstellen
  const appointment = {
    id: uid(state, "ap"),
    type: "conversation",
    personId,
    conversationId: conversation.id,
    appearMin: startMin,
    decisionDeadline: startMin,
    startMin,
    endMin,
    status: "active",
    effectsApplied: false,
  };
  state.appointments.push(appointment);

  return {
    ok: true,
    conversationId: conversation.id,
    startMin,
    endMin,
  };
}

// D. Gesprächsabschluss (wird in processEventsAt aufgerufen)
export function completeConversation(state, conversationId, m) {
  const conv = state.satisfaction.conversations.find(c => c.id === conversationId);
  if (!conv || conv.status !== "planned") return null;

  conv.status = "completed";
  conv.completedAtMin = m;

  const found = findPerson(state, conv.personId);
  if (!found) return null;

  const cd = getCooldown(state, conv.personId);
  const sat = found.person.satisfaction ?? 70;

  // +2 nur bei Zufriedenheit unter 70 und 7-Tage-Abstand
  if (sat < 70 && !isCooldownActive(cd.lastConversationMin, CONVERSATION_COOLDOWN_DAYS, m)) {
    const r = applySatisfactionChange(state, conv.personId, CONVERSATION_BONUS,
      "Mitarbeitergespräch abgeschlossen", "conversation_held", null);
    conv.resultDelta = r.applied;
    cd.lastConversationMin = m;
  } else {
    conv.resultDelta = 0;
  }

  return conv;
}

// E. Bleibegespräch (Kündigung zurücknehmen)
export function prepareRetentionConversation(state, personId) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");
  const person = found.person;

  if (person.employmentStatus !== "notice_given") {
    throw new Error("Diese Person hat keine Kündigung angekündigt.");
  }
  if (!person.selfTermination) {
    throw new Error("Die Kündigung wurde vom Spieler ausgesprochen und kann nicht durch ein Bleibegespräch zurückgenommen werden.");
  }
  if (person.exitMin && state.gameTime >= person.exitMin) {
    throw new Error("Der Austritt ist bereits wirksam geworden.");
  }

  const unpaidItems = getUnpaidWageItems(state, personId);
  const sat = person.satisfaction ?? 70;
  const meetsWages = unpaidItems.length === 0;
  const meetsSatisfaction = sat >= RETENTION_THRESHOLD;

  return {
    ok: true,
    personId,
    name: person.name,
    exitMin: person.exitMin,
    satisfaction: sat,
    unpaidWages: unpaidItems.length,
    unpaidWagesCents: unpaidItems.reduce((s, o) => s + o.remainingCents, 0),
    meetsWages,
    meetsSatisfaction,
    canRetain: meetsWages && meetsSatisfaction,
    missingWages: !meetsWages,
    missingSatisfactionPoints: meetsSatisfaction ? 0 : RETENTION_THRESHOLD - sat,
  };
}

// E. Bleibegespräch durchführen (30 Spielminuten, keine doppelte Gesprächsbelohnung)
export function conductRetentionConversation(state, personId) {
  const preview = prepareRetentionConversation(state, personId);
  if (!preview.canRetain) {
    throw new Error(
      `Voraussetzungen nicht erfüllt: ` +
      (preview.missingWages ? `Offene Löhne von ${(preview.unpaidWagesCents / 100).toFixed(0)} € begleichen. ` : "") +
      (preview.missingSatisfactionPoints > 0 ? `${preview.missingSatisfactionPoints} Punkte bis ${RETENTION_THRESHOLD} fehlen. ` : "")
    );
  }

  const found = findPerson(state, personId);
  const person = found.person;

  // Normales Gespräch starten (30 Min)
  const conv = conductConversation(state, personId);
  conv.type = "retention";

  // Markiere als Bleibegespräch
  const conversation = state.satisfaction.conversations.find(c => c.id === conv.conversationId);
  if (conversation) conversation.type = "retention";

  return conv;
}

// E. Kündigung nach Bleibegespräch zurücknehmen (im Gesprächsabschluss)
export function cancelSelfTermination(state, personId, m) {
  const found = findPerson(state, personId);
  if (!found) return false;
  const person = found.person;

  if (person.employmentStatus !== "notice_given" || !person.selfTermination) return false;
  if (person.exitMin && m >= person.exitMin) return false;

  // Voraussetzungen erneut prüfen
  const unpaidItems = getUnpaidWageItems(state, personId);
  if (unpaidItems.length > 0) return false;
  if ((person.satisfaction ?? 0) < RETENTION_THRESHOLD) return false;

  person.employmentStatus = "employed";
  person.exitMin = null;
  person.exitMode = null;
  person.noticeDeclaredAtMin = null;
  person.noticeDeclaredBy = null;
  person.selfTermination = false;
  person.consecutiveLowSatisfactionDays = 0;
  person.conversationWishSent = false;

  deliverMessage(state, {
    fromId: person.id, toId: "player",
    subject: "Bleibegespräch erfolgreich: " + person.name,
    body: `${person.name} nimmt die Eigenkündigung zurück und bleibt im Unternehmen.\n\nDas Arbeitsverhältnis wird fortgesetzt.`,
    gameTime: m, category: "personnel", priority: "high",
    linkedRefs: { type: "employee", id: personId },
    dedupKey: `retention_success:${personId}:${m}`,
  });

  pushEvent(state, {
    type: "retention_success",
    gameTime: m, isSystem: true,
    personId, personName: person.name,
    details: { satisfaction: person.satisfaction },
    dedupKey: "retention_success:" + personId + ":" + m,
  });

  return true;
}

// ---------- Detail-Getter für UI ----------

export function getSatisfactionDetail(state, personId) {
  const found = findPerson(state, personId);
  if (!found) return null;
  const person = found.person;

  const activeCauses = getActiveCauses(state, personId);
  const resolvedCauses = getResolvedCauses(state, personId);
  const history = getSatisfactionHistory(state, personId);
  const unpaidItems = getUnpaidWageItems(state, personId);
  const cd = getCooldown(state, personId);

  // Veränderung in der ausgewählten Periode (z.B. 30 Tage)
  const periodStart = state.gameTime - 30 * DAY_MIN;
  const periodChanges = history.filter(h => h.atMin >= periodStart);
  const periodDelta = periodChanges.reduce((s, h) => s + h.actualDelta, 0);

  // Verlauf (max 20 Einträge)
  const trend = history.slice(0, 20).reverse();

  // Austrittsinfo
  const noticed = person.employmentStatus === "notice_given";
  const selfTermination = person.selfTermination === true;

  return {
    personId,
    name: person.name,
    kind: found.kind,
    role: found.kind === "driver" ? "driver" : person.role,
    portraitId: person.portraitId,
    satisfaction: person.satisfaction ?? 70,
    periodDelta,
    trend,
    activeCauses: activeCauses.map(c => ({
      id: c.id,
      type: c.type,
      label: c.label,
      startMin: c.startMin,
      lastEffectMin: c.lastEffectMin,
      lastEffectDelta: c.lastEffectDelta,
      linkedRefIds: c.linkedRefIds,
    })),
    resolvedCauses: resolvedCauses.slice(0, 10).map(c => ({
      id: c.id,
      type: c.type,
      label: c.label,
      startMin: c.startMin,
      resolvedAtMin: c.resolvedAtMin,
    })),
    unpaidWages: unpaidItems.map(o => ({
      id: o.id,
      remainingCents: o.remainingCents,
      cause: o.cause,
      createdAtMin: o.createdAtMin,
    })),
    unpaidWagesTotal: unpaidItems.reduce((s, o) => s + o.remainingCents, 0),
    dailyWageCents: person.costPerDayCents || 0,
    // Cooldowns
    bonusCooldownActive: isCooldownActive(cd.lastBonusMin, BONUS_COOLDOWN_DAYS, state.gameTime),
    nextBonusMin: nextAvailableMin(cd.lastBonusMin, BONUS_COOLDOWN_DAYS),
    raiseCooldownActive: isCooldownActive(cd.lastRaiseMin, RAISE_COOLDOWN_DAYS, state.gameTime),
    nextRaiseMin: nextAvailableMin(cd.lastRaiseMin, RAISE_COOLDOWN_DAYS),
    conversationCooldownActive: isCooldownActive(cd.lastConversationMin, CONVERSATION_COOLDOWN_DAYS, state.gameTime),
    nextConversationMin: nextAvailableMin(cd.lastConversationMin, CONVERSATION_COOLDOWN_DAYS),
    // Austritt
    noticed,
    selfTermination,
    exitMin: person.exitMin,
    exitDateLabel: person.exitMin ? formatGameTime(person.exitMin) : null,
    consecutiveLowSatisfactionDays: person.consecutiveLowSatisfactionDays || 0,
    canRetain: noticed && selfTermination &&
      unpaidItems.length === 0 &&
      (person.satisfaction ?? 0) >= RETENTION_THRESHOLD,
    // Maßnahmen-Verfügbarkeit
    canPayWages: unpaidItems.length > 0,
    canRaiseSalary: true,
    canGiveBonus: unpaidItems.length === 0 && !isCooldownActive(cd.lastBonusMin, BONUS_COOLDOWN_DAYS, state.gameTime),
    canConductConversation: isPersonAvailable(state, personId, state.gameTime) &&
      !isPlayerBlockedForConversation(state) &&
      !(found.kind === "driver" && person.status === "on_trip"),
  };
}

// ---------- Teamklima-Übersicht ----------

export function getTeamClimate(state) {
  const persons = [];
  for (const d of (state.drivers || [])) {
    if (!isActivelyEmployed(d)) continue;
    persons.push(buildClimateEntry(state, d, "driver"));
  }
  for (const e of (state.employees || [])) {
    if (!isActivelyEmployed(e)) continue;
    persons.push(buildClimateEntry(state, e, "employee"));
  }

  return {
    total: persons.length,
    critical: persons.filter(p => p.satisfaction < 40),
    atRisk: persons.filter(p => p.consecutiveLowSatisfactionDays >= 2),
    noticeGiven: persons.filter(p => p.noticed),
    persons,
  };
}

function buildClimateEntry(state, person, kind) {
  const activeCauses = getActiveCauses(state, person.id);
  const unpaidItems = getUnpaidWageItems(state, person.id);
  return {
    personId: person.id,
    name: person.name,
    kind,
    role: kind === "driver" ? "driver" : person.role,
    portraitId: person.portraitId,
    satisfaction: person.satisfaction ?? 70,
    consecutiveLowSatisfactionDays: person.consecutiveLowSatisfactionDays || 0,
    noticed: person.employmentStatus === "notice_given",
    selfTermination: person.selfTermination === true,
    exitMin: person.exitMin,
    activeCauseCount: activeCauses.length,
    activeCauseTypes: activeCauses.map(c => c.type),
    hasUnpaidWages: unpaidItems.length > 0,
    unpaidWagesCents: unpaidItems.reduce((s, o) => s + o.remainingCents, 0),
    hasOpenVacationRequest: (state.absences?.vacationRequests || []).some(
      r => r.personId === person.id && r.status === "pending"
    ),
  };
}

// ---------- Hilfsfunktion für GF-Blockierung ----------

function isPlayerBlockedForConversation(state) {
  return (state.appointments || []).some(a =>
    a.status === "active" && a.type !== "conversation"
  );
}

// ---------- Buchungs-Import (Circular Dependency vermeiden) ----------