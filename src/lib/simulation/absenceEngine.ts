// Abwesenheits-Engine für FERNWERK (Auftrag 25).
// Verwaltet Urlaubskonten, Urlaubsanträge, Krankmeldungen und den gemeinsamen Verfügbarkeitskalender.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.

import {
  dayOf, formatGameTime, mulberry32, PERSONNEL_ROLES,
  SERVICE_START_MIN, SERVICE_END_MIN,
} from "./gameRules.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";

// ---------- Konstanten ----------
export const VACATION_START_DAYS = 3;
export const VACATION_ACCRUAL_INTERVAL_DAYS = 10; // alle 10 Beschäftigungstage +1 Tag
export const VACATION_MAX_UNUSED = 20; // inkl. reservierter Tage
export const SICKNESS_BASE_RATE = 0.02; // 2 % pro gesundem Mitarbeiter/Spieltag
export const SICKNESS_MIN_DURATION = 1; // Spieltage
export const SICKNESS_MAX_DURATION = 3; // Spieltage
export const SICKNESS_COOLDOWN_DAYS = 5; // Abstand nach Genesung
export const SICKNESS_INTRO_PROTECTION_DAYS = 3; // Erste Tage nach Einstellung geschützt
export const VACATION_REQUEST_RATE = 0.015; // 1,5 % Chance/Tag bei verfügbaren Tagen
export const VACATION_REQUEST_COOLDOWN_DAYS = 14; // Mindestabstand nach letztem Urlaub
export const VACATION_REQUEST_MIN_DAYS = 3; // Mindest verfügbare Tage für Antrag
export const VACATION_REQUEST_MIN_OFFSET = 5; // Frühester Start in Tagen
export const VACATION_REQUEST_MAX_OFFSET = 14; // Spätester Start in Tagen
export const VACATION_REQUEST_MIN_DURATION = 3; // Mindestdauer
export const VACATION_REQUEST_MAX_DURATION = 7; // Maximaldauer

const DAY_MIN = 1440;

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function nextRng(state) {
  const r = mulberry32(state.rngSeed >>> 0);
  const v = r();
  state.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}

function dayStart(min) { return Math.floor(min / DAY_MIN) * DAY_MIN; }

function getAllPersons(state) {
  const drivers = (state.drivers || []).map(d => ({ ...d, _kind: "driver", _person: d }));
  const employees = (state.employees || []).map(e => ({ ...e, _kind: "employee", _person: e }));
  return [...drivers, ...employees];
}

function findPerson(state, personId) {
  const d = (state.drivers || []).find(x => x.id === personId);
  if (d) return { person: d, kind: "driver" };
  const e = (state.employees || []).find(x => x.id === personId);
  if (e) return { person: e, kind: "employee" };
  return null;
}

// ---------- Urlaubskonto ----------

export function getVacationAccount(state, personId) {
  const found = findPerson(state, personId);
  if (!found) return null;
  const p = found.person;
  if (!p.vacationAccount) {
    // Migration: nur beim ersten Mal Starttage vergeben, nicht bei Reload
    p.vacationAccount = {
      totalEarned: VACATION_START_DAYS,
      daysUsed: 0,
      accrualHistory: [], // {day, earned} – belegte historische Zuwächse
    };
  }
  return p.vacationAccount;
}

// Erwerb zusätzlicher Urlaubstage: alle 10 vollständig verstrichene Beschäftigungstage +1.
// Krankheit und bezahlter Urlaub stoppen den Beschäftigungszeitraum nicht (vereinfacht).
// Nach wirksamem Austritt kein neuer Erwerb.
export function accrueVacationDays(state, personId, atMin) {
  const found = findPerson(state, personId);
  if (!found) return 0;
  const p = found.person;
  if (!isActivelyEmployed(p)) return 0;
  if (!p.vacationAccount) getVacationAccount(state, personId);
  const acct = p.vacationAccount;
  const employedDay = p.employedDay || 1;
  const currentDay = dayOf(atMin);
  const elapsedDays = currentDay - employedDay + 1;
  const accrualPoints = Math.floor(elapsedDays / VACATION_ACCRUAL_INTERVAL_DAYS);
  // Bereits vergebene Zuwächse zählen
  const alreadyAccrued = (acct.accrualHistory || []).length;
  let newDays = 0;
  if (accrualPoints > alreadyAccrued) {
    newDays = accrualPoints - alreadyAccrued;
    for (let i = alreadyAccrued; i < accrualPoints; i++) {
      acct.accrualHistory.push({ day: employedDay + (i + 1) * VACATION_ACCRUAL_INTERVAL_DAYS, earned: 1 });
      acct.totalEarned += 1;
    }
    // Cap: maximal 20 ungenutzte Tage (inkl. reserviert)
    capVacationAccount(acct);
  }
  return newDays;
}

function capVacationAccount(acct) {
  const unused = acct.totalEarned - acct.daysUsed;
  if (unused > VACATION_MAX_UNUSED) {
    acct.totalEarned = acct.daysUsed + VACATION_MAX_UNUSED;
  }
}

// Freie Tage = total - used - reserved
export function getVacationAvailable(state, personId) {
  const acct = getVacationAccount(state, personId);
  if (!acct) return 0;
  const reserved = getReservedVacationDays(state, personId);
  return Math.max(0, acct.totalEarned - acct.daysUsed - reserved);
}

// Reservierte Tage = genehmigte künftige/laufende Urlaubstage
export function getReservedVacationDays(state, personId) {
  const requests = (state.absences?.vacationRequests || []).filter(r =>
    r.personId === personId && r.status === "approved" && r.endMin > state.gameTime
  );
  let total = 0;
  for (const r of requests) {
    total += r.days;
  }
  return total;
}

// ---------- Urlaubsantrag ----------

export function requestVacation(state, { personId, startMin, endMin, reason }) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Mitarbeiter nicht gefunden.");
  if (!isActivelyEmployed(found.person)) throw new Error("Nur aktiv beschäftigte Mitarbeiter können Urlaub beantragen.");
  
  const sMin = dayStart(startMin);
  const eMin = dayStart(endMin) + DAY_MIN; // Ende exklusiv, Folgetag-Mitternacht
  if (eMin <= sMin) throw new Error("Ende muss nach Beginn liegen.");
  if (sMin < dayStart(state.gameTime)) throw new Error("Urlaub kann nicht in die Vergangenheit gebucht werden.");
  
  const days = Math.round((eMin - sMin) / DAY_MIN);
  if (days < 1) throw new Error("Mindestens ein Urlaubstag erforderlich.");
  
  // Verfügbarkeit prüfen
  accrueVacationDays(state, personId, state.gameTime);
  const available = getVacationAvailable(state, personId);
  if (days > available) {
    throw new Error(`Nicht genügend Urlaubstage verfügbar: ${days} benötigt, ${available} frei.`);
  }
  
  // Überlappende Genehmigungen prüfen
  const existing = (state.absences?.vacationRequests || []).filter(r =>
    r.personId === personId && r.status === "approved" && r.startMin < eMin && r.endMin > sMin
  );
  if (existing.length > 0) throw new Error("Es existiert bereits ein genehmigter Urlaub in diesem Zeitraum.");
  
  // Konflikte prüfen
  const conflicts = detectAbsenceConflicts(state, personId, sMin, eMin);
  
  state.absences = state.absences || {};
  state.absences.vacationRequests = state.absences.vacationRequests || [];
  
  const request = {
    id: uid(state, "vr"),
    personId, personKind: found.kind, personName: found.person.name,
    startMin: sMin, endMin: eMin, days, reason: reason || "",
    status: "pending", createdAtMin: state.gameTime,
    approvedAtMin: null, approvedBy: null, conflictResolution: null,
    conflicts,
  };
  state.absences.vacationRequests.push(request);
  
  pushEvent(state, {
    type: "vacation_requested",
    gameTime: state.gameTime, isSystem: false,
    personId, personName: found.person.name, portraitId: found.person.portraitId,
    details: { startMin: sMin, endMin: eMin, days, reason: reason || "", conflicts },
    dedupKey: "vacation_requested:" + request.id,
  });
  
  deliverMessage(state, {
    fromId: personId, toId: "player",
    subject: "Urlaubsantrag: " + found.person.name,
    body: `${found.person.name} beantragt Urlaub vom ${formatGameTime(sMin)} bis ${formatGameTime(eMin - 1)} (${days} Tag(e)).${reason ? "\nGrund: " + reason : ""}${conflicts.length > 0 ? "\n\nKonflikte erkannt:\n" + conflicts.map(c => "• " + c.description).join("\n") : "\nKeine Konflikte erkannt."}`,
    gameTime: state.gameTime, category: "personnel", priority: "normal",
    linkedRefs: { type: "vacation_request", id: request.id }, dedupKey: "vacation_request_msg:" + request.id,
  });
  
  return { ok: true, requestId: request.id, days, available: getVacationAvailable(state, personId), conflicts };
}

export function approveVacation(state, { requestId, conflictResolution }) {
  const req = (state.absences?.vacationRequests || []).find(r => r.id === requestId);
  if (!req) throw new Error("Antrag nicht gefunden.");
  if (req.status !== "pending") throw new Error("Antrag ist bereits bearbeitet.");
  
  req.status = "approved";
  req.approvedAtMin = state.gameTime;
  req.approvedBy = "player";
  req.conflictResolution = conflictResolution || "accepted";
  
  // Zufriedenheit +3 pro Anliegen (nur bei Genehmigung)
  const found = findPerson(state, req.personId);
  if (found && found.person.satisfaction !== undefined) {
    found.person.satisfaction = Math.min(100, (found.person.satisfaction || 70) + 3);
    found.person.satisfactionReasons = found.person.satisfactionReasons || [];
    found.person.satisfactionReasons.push({ reason: "Urlaub genehmigt", atMin: state.gameTime });
  }
  
  pushEvent(state, {
    type: "vacation_approved",
    gameTime: state.gameTime, isSystem: false,
    personId: req.personId, personName: req.personName, portraitId: found?.person?.portraitId,
    details: { startMin: req.startMin, endMin: req.endMin, days: req.days, conflictResolution: req.conflictResolution },
    dedupKey: "vacation_approved:" + requestId,
  });
  
  deliverMessage(state, {
    fromId: "player", toId: req.personId,
    subject: "Urlaub genehmigt",
    body: `Dein Urlaub vom ${formatGameTime(req.startMin)} bis ${formatGameTime(req.endMin - 1)} (${req.days} Tag(e)) wurde genehmigt.`,
    gameTime: state.gameTime, category: "personnel", priority: "normal",
    dedupKey: "vacation_approved_msg:" + requestId,
  });
  
  return { ok: true, requestId };
}

export function rejectVacation(state, { requestId, reason }) {
  const req = (state.absences?.vacationRequests || []).find(r => r.id === requestId);
  if (!req) throw new Error("Antrag nicht gefunden.");
  if (req.status !== "pending") throw new Error("Antrag ist bereits bearbeitet.");
  
  req.status = "rejected";
  req.rejectedAtMin = state.gameTime;
  req.rejectReason = reason || "";
  
  // Begrenzte Wirkung wiederholter Ablehnung mit stabiler Anliegen-ID
  const found = findPerson(state, req.personId);
  if (found && found.person.satisfaction !== undefined && !req.satisfactionApplied) {
    found.person.satisfaction = Math.max(0, (found.person.satisfaction || 70) - 3);
    found.person.satisfactionReasons = found.person.satisfactionReasons || [];
    found.person.satisfactionReasons.push({ reason: "Urlaub abgelehnt", atMin: state.gameTime });
    req.satisfactionApplied = true;
  }
  
  pushEvent(state, {
    type: "vacation_rejected",
    gameTime: state.gameTime, isSystem: false,
    personId: req.personId, personName: req.personName, portraitId: found?.person?.portraitId,
    details: { reason: reason || "" },
    dedupKey: "vacation_rejected:" + requestId,
  });
  
  deliverMessage(state, {
    fromId: "player", toId: req.personId,
    subject: "Urlaubsantrag abgelehnt",
    body: `Dein Urlaubsantrag vom ${formatGameTime(req.startMin)} bis ${formatGameTime(req.endMin - 1)} wurde abgelehnt.${reason ? "\nGrund: " + reason : ""}`,
    gameTime: state.gameTime, category: "personnel", priority: "normal",
    dedupKey: "vacation_rejected_msg:" + requestId,
  });
  
  return { ok: true, requestId };
}

// Stornierung vor Beginn: gibt nur reservierte Tage frei
export function cancelVacation(state, { requestId }) {
  const req = (state.absences?.vacationRequests || []).find(r => r.id === requestId);
  if (!req) throw new Error("Antrag nicht gefunden.");
  if (req.status !== "approved") throw new Error("Nur genehmigter Urlaub kann storniert werden.");
  if (req.endMin <= state.gameTime) throw new Error("Abgeschlossener Urlaub kann nicht storniert werden.");
  
  // Wenn bereits begonnen: nur verbleibende Tage freigeben (frühere Rückkehr)
  const alreadyConsumed = req.consumedDays || 0;
  req.status = "cancelled";
  req.cancelledAtMin = state.gameTime;
  // Reservierung wird durch getReservedVacationDays automatisch freigegeben (Status != approved)
  
  pushEvent(state, {
    type: "vacation_cancelled",
    gameTime: state.gameTime, isSystem: false,
    personId: req.personId, personName: req.personName,
    details: { alreadyConsumed, wasStarted: req.startMin <= state.gameTime },
    dedupKey: "vacation_cancelled:" + requestId,
  });
  
  return { ok: true, requestId, freedDays: req.days - alreadyConsumed };
}

// Vorzeitige Rückkehr ab nächster Spielmitternacht
export function returnEarlyFromVacation(state, { requestId, returnMin }) {
  const req = (state.absences?.vacationRequests || []).find(r => r.id === requestId);
  if (!req) throw new Error("Antrag nicht gefunden.");
  if (req.status !== "approved") throw new Error("Nur genehmigter Urlaub erlaubt Rückkehr.");
  if (state.gameTime < req.startMin) throw new Error("Urlaub hat noch nicht begonnen – bitte stornieren.");
  if (state.gameTime >= req.endMin) throw new Error("Urlaub ist bereits beendet.");
  
  const rMin = dayStart(returnMin || state.gameTime) + DAY_MIN; // ab nächster Mitternacht
  if (rMin >= req.endMin) throw new Error("Rückkehrzeitpunkt liegt nach Urlaubsende.");
  
  const originalEnd = req.endMin;
  const consumedDays = Math.round((rMin - req.startMin) / DAY_MIN);
  const freedDays = req.days - consumedDays;
  req.endMin = rMin;
  req.days = consumedDays;
  req.earlyReturnAtMin = state.gameTime;
  
  pushEvent(state, {
    type: "vacation_early_return",
    gameTime: state.gameTime, isSystem: false,
    personId: req.personId, personName: req.personName,
    details: { newEndMin: rMin, freedDays, originalEnd },
    dedupKey: "vacation_early_return:" + requestId,
  });
  
  return { ok: true, requestId, freedDays, newEndMin: rMin };
}

// ---------- Krankheit ----------

export function reportSickness(state, { personId, startMin, expectedDurationDays }) {
  const found = findPerson(state, personId);
  if (!found) throw new Error("Mitarbeiter nicht gefunden.");
  if (!isActivelyEmployed(found.person)) throw new Error("Nur aktiv beschäftigte Mitarbeiter können krankgemeldet werden.");
  
  // Bestehende Krankheit prüfen
  const existing = (state.absences?.sicknesses || []).find(s =>
    s.personId === personId && s.status === "active"
  );
  if (existing) throw new Error("Mitarbeiter ist bereits krankgemeldet.");
  
  const sMin = startMin || state.gameTime;
  const dur = Math.max(SICKNESS_MIN_DURATION, Math.min(SICKNESS_MAX_DURATION, expectedDurationDays || SICKNESS_MAX_DURATION));
  const eMin = dayStart(sMin) + dur * DAY_MIN;
  
  state.absences = state.absences || {};
  state.absences.sicknesses = state.absences.sicknesses || [];
  
  const sickness = {
    id: uid(state, "sk"),
    personId, personKind: found.kind, personName: found.person.name,
    startMin: sMin, expectedEndMin: eMin, actualEndMin: null,
    status: "active", createdAtMin: state.gameTime,
  };
  state.absences.sicknesses.push(sickness);
  
  // Anwesenheit auf "sick" setzen
  found.person.attendance = "sick";
  found.person.sickUntil = eMin;
  
  pushEvent(state, {
    type: "sickness_reported",
    gameTime: state.gameTime, isSystem: false,
    personId, personName: found.person.name, portraitId: found.person.portraitId,
    details: { startMin: sMin, expectedEndMin: eMin, durationDays: dur },
    dedupKey: "sickness_reported:" + sickness.id,
  });
  
  deliverMessage(state, {
    fromId: personId, toId: "player",
    subject: "Krankmeldung: " + found.person.name,
    body: `${found.person.name} ist ab ${formatGameTime(sMin)} krankgeschrieben. Voraussichtliche Genesung: ${formatGameTime(eMin)}.`,
    gameTime: state.gameTime, category: "personnel", priority: "high",
    linkedRefs: { type: "sickness", id: sickness.id }, dedupKey: "sickness_msg:" + sickness.id,
  });
  
  return { ok: true, sicknessId: sickness.id };
}

// Krankheitsgenerator: 0,25 % je gesundem Mitarbeiter/Spieltag
export function maybeGenerateSickness(state, midnight) {
  if (midnight % DAY_MIN !== 0) return;
  state.absences = state.absences || {};
  state.absences.sicknesses = state.absences.sicknesses || [];
  
  const persons = getAllPersons(state);
  for (const p of persons) {
    if (!isActivelyEmployed(p._person)) continue;
    // Einführungsschutz
    const employedDay = p._person.employedDay || 1;
    const currentDay = dayOf(midnight);
    if (currentDay - employedDay < SICKNESS_INTRO_PROTECTION_DAYS) continue;
    // Cooldown nach Genesung
    const lastSickness = state.absences.sicknesses
      .filter(s => s.personId === p._person.id && s.status === "recovered")
      .sort((a, b) => (b.actualEndMin || 0) - (a.actualEndMin || 0))[0];
    if (lastSickness) {
      const cooldownEnd = (lastSickness.actualEndMin || 0) + SICKNESS_COOLDOWN_DAYS * DAY_MIN;
      if (midnight < cooldownEnd) continue;
    }
    // Bereits krank?
    if (state.absences.sicknesses.some(s => s.personId === p._person.id && s.status === "active")) continue;
    // Bereits auf Urlaub?
    const onVacation = (state.absences.vacationRequests || []).some(r =>
      r.personId === p._person.id && r.status === "approved" && r.startMin <= midnight && r.endMin > midnight
    );
    // Würfeln
    if (nextRng(state) < SICKNESS_BASE_RATE) {
      const dur = SICKNESS_MIN_DURATION + Math.floor(nextRng(state) * (SICKNESS_MAX_DURATION - SICKNESS_MIN_DURATION + 1));
      const eMin = midnight + dur * DAY_MIN;
      const sickness = {
        id: uid(state, "sk"), personId: p._person.id, personKind: p._kind, personName: p._person.name,
        startMin: midnight, expectedEndMin: eMin, actualEndMin: null,
        status: "active", createdAtMin: midnight, autoGenerated: true,
      };
      state.absences.sicknesses.push(sickness);
      p._person.attendance = "sick";
      p._person.sickUntil = eMin;
      
      pushEvent(state, {
        type: "sickness_reported",
        gameTime: midnight, isSystem: true,
        personId: p._person.id, personName: p._person.name, portraitId: p._person.portraitId,
        details: { startMin: midnight, expectedEndMin: eMin, durationDays: dur, autoGenerated: true },
        dedupKey: "sickness_auto:" + sickness.id,
      });
    }
  }
}

// Krankheitsverarbeitung: Genesung am Ende der Krankheit
export function processSicknessRecovery(state, m) {
  state.absences = state.absences || {};
  state.absences.sicknesses = state.absences.sicknesses || [];
  
  for (const s of state.absences.sicknesses) {
    if (s.status !== "active") continue;
    if (s.expectedEndMin <= m) {
      s.status = "recovered";
      s.actualEndMin = s.expectedEndMin;
      const found = findPerson(state, s.personId);
      if (found) {
        found.person.attendance = "present";
        found.person.sickUntil = null;
      }
      pushEvent(state, {
        type: "sickness_recovered",
        gameTime: m, isSystem: true,
        personId: s.personId, personName: s.personName,
        details: { endMin: s.expectedEndMin },
        dedupKey: "sickness_recovered:" + s.id,
      });
    }
  }
}

// ---------- Konflikt-Erkennung ----------

export function detectAbsenceConflicts(state, personId, startMin, endMin) {
  const conflicts = [];
  const found = findPerson(state, personId);
  if (!found) return conflicts;
  const p = found.person;
  
  // Aktive Tour/Fahrt für Fahrer
  if (found.kind === "driver") {
    const activeTrip = (state.trips || []).find(t =>
      t.driverId === personId && t.status === "in_progress" &&
      t.endMin > startMin && t.startMin < endMin
    );
    if (activeTrip) {
      conflicts.push({
        type: "active_trip",
        severity: "hard",
        description: `Aktive Tour bis ${formatGameTime(activeTrip.endMin)} – Fahrer kann nicht mitten aus Ladung entfernt werden.`,
        tripId: activeTrip.id,
      });
    }
    // Ruhezeit
    if (p.restUntil && p.restUntil > startMin) {
      conflicts.push({
        type: "rest_period",
        severity: "soft",
        description: `Ruhezeit bis ${formatGameTime(p.restUntil)} – beginnt nach Erholung.`,
      });
    }
  }
  
  // Disponent: zugewiesene Lkw
  if (found.kind === "employee" && (p.role === "dispatcher" || p.role === "dispatcher_senior")) {
    const assignedVehicles = p.assignedVehicleIds || [];
    if (assignedVehicles.length > 0) {
      // Prüfen ob andere Disponenten übernehmen könnten
      const otherDispatchers = (state.employees || []).filter(e =>
        e.id !== personId && (e.role === "dispatcher" || e.role === "dispatcher_senior") &&
        isActivelyEmployed(e) && e.attendance === "present"
      );
      const unassigned = assignedVehicles.filter(vid =>
        !otherDispatchers.some(d => (d.assignedVehicleIds || []).includes(vid))
      );
      if (unassigned.length > 0) {
        conflicts.push({
          type: "unassigned_vehicles",
          severity: "soft",
          description: `${unassigned.length} Lkw ohne Betreuung während Abwesenheit – GF muss Lücke übernehmen.`,
          vehicleIds: unassigned,
        });
      }
    }
  }
  
  // Reinigung: offene Aufgaben
  if (found.kind === "employee" && p.role === "cleaner") {
    conflicts.push({
      type: "cleaning_capacity",
      severity: "soft",
      description: "Reinigungskapazität reduziert – Standortreinigung eventuell verzögert.",
    });
  }
  
  // Buchhaltung: offene Prüfungen
  if (found.kind === "employee" && (p.role === "accountant" || p.role === "accountant_senior")) {
    const openReceipts = (state.accounting?.receipts || []).filter(r => r.status === "generated").length;
    if (openReceipts > 0) {
      conflicts.push({
        type: "accounting_backlog",
        severity: "soft",
        description: `${openReceipts} ungeprüfte Belege – Buchhaltung verzögert sich.`,
      });
    }
  }
  
  return conflicts;
}

// ---------- Kalender ----------

// Sammelt alle Abwesenheitsintervalle für die Kalenderansicht
export function getAbsenceCalendar(state, fromMin, toMin) {
  const entries = [];
  state.absences = state.absences || {};
  
  // Genehmigter Urlaub
  for (const r of (state.absences.vacationRequests || [])) {
    if (r.status !== "approved") continue;
    if (r.endMin <= fromMin || r.startMin >= toMin) continue;
    entries.push({
      type: "vacation", personId: r.personId, personName: r.personName,
      startMin: r.startMin, endMin: r.endMin, status: r.status,
      label: "Urlaub", color: "lime",
    });
  }
  
  // Krankheit
  for (const s of (state.absences.sicknesses || [])) {
    if (s.status !== "active" && s.status !== "recovered") continue;
    if (s.expectedEndMin <= fromMin || s.startMin >= toMin) continue;
    entries.push({
      type: "sickness", personId: s.personId, personName: s.personName,
      startMin: s.startMin, endMin: s.status === "recovered" ? (s.actualEndMin || s.expectedEndMin) : s.expectedEndMin,
      status: s.status,
      label: "Krankheit", color: "coral",
    });
  }
  
  // Freistellung / Austritt (aus terminationEngine)
  for (const d of (state.drivers || [])) {
    if (d.employmentStatus === "notice_given" && d.exitMin) {
      if (d.exitMin > fromMin && d.exitMin < toMin) {
        entries.push({
          type: "termination", personId: d.id, personName: d.name,
          startMin: d.exitMode === "garden_leave" ? state.gameTime : d.exitMin,
          endMin: d.exitMin, status: "notice_given",
          label: "Austritt", color: "amber",
        });
      }
    }
    // Fahrer-Ruhezeit (read-only Sperre)
    if (d.restUntil && d.restUntil > state.gameTime) {
      if (d.restUntil > fromMin && state.gameTime < toMin) {
        entries.push({
          type: "driver_rest", personId: d.id, personName: d.name,
          startMin: Math.max(state.gameTime, fromMin), endMin: d.restUntil,
          status: "resting", label: "Ruhezeit", color: "sky", readOnly: true,
        });
      }
    }
  }
  for (const e of (state.employees || [])) {
    if (e.employmentStatus === "notice_given" && e.exitMin) {
      if (e.exitMin > fromMin && e.exitMin < toMin) {
        entries.push({
          type: "termination", personId: e.id, personName: e.name,
          startMin: e.exitMode === "garden_leave" ? state.gameTime : e.exitMin,
          endMin: e.exitMin, status: "notice_given",
          label: "Austritt", color: "amber",
        });
      }
    }
  }
  
  // Externe Vertretung (aus serviceEngine)
  for (const c of (state.serviceContracts || [])) {
    if (c.type !== "temp_dispatcher" && c.type !== "temp_driver") continue;
    if (c.status !== "planned" && c.status !== "active") continue;
    if (c.endMin <= fromMin || c.startMin >= toMin) continue;
    entries.push({
      type: "substitution", personId: c.substitutesPersonId, personName: c.providerName,
      startMin: c.startMin, endMin: c.endMin, status: c.status,
      label: "Vertretung (" + c.providerName + ")", color: "violet", isExternal: true,
    });
  }
  
  return entries;
}

// ---------- Tagesverarbeitung ----------

// Urlaubstag-Verbrauch beim Abschluss des Spieltags
export function processVacationDayConsumption(state, midnight) {
  if (midnight % DAY_MIN !== 0) return;
  state.absences = state.absences || {};
  state.absences.vacationRequests = state.absences.vacationRequests || [];
  
  const dayStartMin = midnight - DAY_MIN; // der abgeschlossene Tag
  const dayEndMin = midnight;
  
  for (const req of state.absences.vacationRequests) {
    if (req.status !== "approved") continue;
    // Liegt der abgeschlossene Tag im Urlaubsintervall?
    if (req.startMin >= dayEndMin || req.endMin <= dayStartMin) continue;
    
    // Prüfen ob ganzer Tag krank war
    const sickness = (state.absences.sicknesses || []).find(s =>
      s.personId === req.personId && s.status === "active" &&
      s.startMin <= dayStartMin && s.expectedEndMin >= dayEndMin
    );
    
    req.consumedDays = req.consumedDays || 0;
    
    if (sickness) {
      // Ganzer Urlaubstag krank → nicht verbrauchen, Reservierung freigeben
      req.sickDays = (req.sickDays || 0) + 1;
      // Kein Verbrauch
    } else {
      // Normaler Verbrauch
      req.consumedDays += 1;
      const acct = getVacationAccount(state, req.personId);
      if (acct) {
        acct.daysUsed += 1;
      }
    }
    
    // Urlaub beendet?
    if (req.endMin <= dayEndMin) {
      req.status = "completed";
      req.completedAtMin = midnight;
      pushEvent(state, {
        type: "vacation_completed",
        gameTime: midnight, isSystem: true,
        personId: req.personId, personName: req.personName,
        details: { consumedDays: req.consumedDays, sickDays: req.sickDays || 0 },
        dedupKey: "vacation_completed:" + req.id,
      });
    }
  }
}

// ---------- Verfügbarkeitsprüfung ----------

// Prüft, ob eine Person zum Zeitpunkt m verfügbar ist (nicht abwesend)
export function isPersonAvailable(state, personId, m) {
  const found = findPerson(state, personId);
  if (!found) return false;
  if (!isActivelyEmployed(found.person)) return false;
  
  state.absences = state.absences || {};
  
  // Krankheit
  const sick = (state.absences.sicknesses || []).find(s =>
    s.personId === personId && s.status === "active" && s.startMin <= m && s.expectedEndMin > m
  );
  if (sick) return false;
  
  // Urlaub
  const vacation = (state.absences.vacationRequests || []).find(r =>
    r.personId === personId && r.status === "approved" && r.startMin <= m && r.endMin > m
  );
  if (vacation) return false;
  
  // Fahrer-Ruhezeit
  if (found.kind === "driver" && found.person.restUntil && found.person.restUntil > m) return false;
  
  return true;
}

// ---------- Auto-Urlaubsanträge ----------

// Mitarbeiter beantragen selbstständig Urlaub, wenn sie genug Tage gesammelt haben.
// Wird täglich um Mitternacht aufgerufen.
export function maybeGenerateVacationRequest(state, midnight) {
  if (midnight % DAY_MIN !== 0) return;
  state.absences = state.absences || {};
  state.absences.vacationRequests = state.absences.vacationRequests || [];

  const persons = getAllPersons(state);
  for (const p of persons) {
    if (!isActivelyEmployed(p._person)) continue;
    // Einführungsschutz
    const employedDay = p._person.employedDay || 1;
    const currentDay = dayOf(midnight);
    if (currentDay - employedDay < SICKNESS_INTRO_PROTECTION_DAYS) continue;
    // Bereits auf Urlaub?
    const onVacation = (state.absences.vacationRequests || []).some(r =>
      r.personId === p._person.id && r.status === "approved" && r.startMin <= midnight && r.endMin > midnight
    );
    if (onVacation) continue;
    // Bereits krank?
    const sick = (state.absences.sicknesses || []).some(s =>
      s.personId === p._person.id && s.status === "active"
    );
    if (sick) continue;
    // Bereits einen pending Antrag?
    const hasPending = (state.absences.vacationRequests || []).some(r =>
      r.personId === p._person.id && r.status === "pending"
    );
    if (hasPending) continue;
    // In Kündigung?
    if (p._person.employmentStatus === "notice_given") continue;
    // Cooldown nach letztem Urlaub
    const lastVacation = (state.absences.vacationRequests || [])
      .filter(r => r.personId === p._person.id && (r.status === "completed" || r.status === "approved" || r.status === "cancelled"))
      .sort((a, b) => (b.endMin || 0) - (a.endMin || 0))[0];
    if (lastVacation) {
      const cooldownEnd = (lastVacation.endMin || 0) + VACATION_REQUEST_COOLDOWN_DAYS * DAY_MIN;
      if (midnight < cooldownEnd) continue;
    }
    // Urlaubstage verfügbar?
    accrueVacationDays(state, p._person.id, midnight);
    const available = getVacationAvailable(state, p._person.id);
    if (available < VACATION_REQUEST_MIN_DAYS) continue;
    // Würfeln
    if (nextRng(state) >= VACATION_REQUEST_RATE) continue;

    // Urlaub planen: 3-7 Tage, Start in 5-14 Tagen
    const duration = Math.min(
      VACATION_REQUEST_MIN_DURATION + Math.floor(nextRng(state) * (VACATION_REQUEST_MAX_DURATION - VACATION_REQUEST_MIN_DURATION + 1)),
      available
    );
    if (duration < VACATION_REQUEST_MIN_DAYS) continue;
    const startOffsetDays = VACATION_REQUEST_MIN_OFFSET + Math.floor(nextRng(state) * (VACATION_REQUEST_MAX_OFFSET - VACATION_REQUEST_MIN_OFFSET + 1));
    const startMin = midnight + startOffsetDays * DAY_MIN;
    const endMin = startMin + duration * DAY_MIN;

    // Überlappende Genehmigungen prüfen
    const existing = (state.absences.vacationRequests || []).filter(r =>
      r.personId === p._person.id && r.status === "approved" && r.startMin < endMin && r.endMin > startMin
    );
    if (existing.length > 0) continue;

    // Konflikte prüfen
    const conflicts = detectAbsenceConflicts(state, p._person.id, startMin, endMin);
    // Bei harten Konflikten überspringen
    if (conflicts.some(c => c.severity === "hard")) continue;

    const request = {
      id: uid(state, "vr"),
      personId: p._person.id, personKind: p._kind, personName: p._person.name,
      startMin, endMin, days: duration, reason: "Erholungsurlaub",
      status: "pending", createdAtMin: midnight,
      approvedAtMin: null, approvedBy: null, conflictResolution: null,
      conflicts, autoGenerated: true,
    };
    state.absences.vacationRequests.push(request);

    pushEvent(state, {
      type: "vacation_requested",
      gameTime: midnight, isSystem: true,
      personId: p._person.id, personName: p._person.name, portraitId: p._person.portraitId,
      details: { startMin, endMin, days: duration, reason: "Erholungsurlaub", conflicts, autoGenerated: true },
      dedupKey: "vacation_requested:" + request.id,
    });

    deliverMessage(state, {
      fromId: p._person.id, toId: "player",
      subject: "Urlaubsantrag: " + p._person.name,
      body: `${p._person.name} beantragt Urlaub vom ${formatGameTime(startMin)} bis ${formatGameTime(endMin - 1)} (${duration} Tag(e)).\nGrund: Erholungsurlaub${conflicts.length > 0 ? "\n\nKonflikte erkannt:\n" + conflicts.map(c => "• " + c.description).join("\n") : "\nKeine Konflikte erkannt."}`,
      gameTime: midnight, category: "personnel", priority: "normal",
      linkedRefs: { type: "vacation_request", id: request.id }, dedupKey: "vacation_request_msg:" + request.id,
    });
  }
}

// ---------- Auto-Genehmigung durch Filialleiter und Assistenten ----------

// Filialleiter genehmigen Urlaubsanträge für Mitarbeiter ihrer Filiale.
// Assistenten genehmigen firmenweit. Der eigene Antrag wird nie selbst genehmigt.
// Wird während der Dienstzeiten aufgerufen.
export function autoApproveVacationRequests(state, m) {
  state.absences = state.absences || {};
  const pending = (state.absences.vacationRequests || []).filter(r => r.status === "pending");
  if (pending.length === 0) return;

  const branchManagers = (state.employees || []).filter(e =>
    e.role === "branch_manager" && e.employmentStatus === "employed" && e.attendance === "present"
  );
  const assistants = (state.employees || []).filter(e =>
    e.role === "assistant" && e.employmentStatus === "employed" && e.attendance === "present"
  );
  if (branchManagers.length === 0 && assistants.length === 0) return;

  for (const req of pending) {
    // Harte Konflikte nicht auto-genehmigen – Spieler muss entscheiden
    if (req.conflicts && req.conflicts.some(c => c.severity === "hard")) continue;

    const found = findPerson(state, req.personId);
    if (!found) continue;

    // Filialleiter für die Filiale des Mitarbeiters suchen
    const personBranchId = found.person.assignedBranchId || found.person.branchId;
    let approver = null;
    let approverRole = null;

    if (personBranchId) {
      approver = branchManagers.find(bm =>
        bm.assignedBranchId === personBranchId && bm.id !== req.personId
      );
      approverRole = "branch_manager";
    }

    // Wenn kein Filialleiter: Assistent suchen (nicht der Antragsteller selbst)
    if (!approver) {
      approver = assistants.find(a => a.id !== req.personId);
      approverRole = "assistant";
    }

    if (!approver) continue;

    // Genehmigen
    req.status = "approved";
    req.approvedAtMin = m;
    req.approvedBy = approver.name;
    req.approvedByRole = approverRole;
    req.conflictResolution = "accepted";
    req.autoApproved = true;

    // Zufriedenheit +3
    if (found.person.satisfaction !== undefined) {
      found.person.satisfaction = Math.min(100, (found.person.satisfaction || 70) + 3);
      found.person.satisfactionReasons = found.person.satisfactionReasons || [];
      found.person.satisfactionReasons.push({ reason: "Urlaub genehmigt (durch " + approver.name + ")", atMin: m });
    }

    pushEvent(state, {
      type: "vacation_approved",
      gameTime: m, isSystem: true,
      personId: req.personId, personName: req.personName, portraitId: found.person.portraitId,
      details: { startMin: req.startMin, endMin: req.endMin, days: req.days, autoApproved: true, approvedBy: approver.name, approvedByRole: approverRole },
      dedupKey: "vacation_approved:" + req.id,
    });

    // Nachricht an Mitarbeiter
    deliverMessage(state, {
      fromId: approver.id, toId: req.personId,
      subject: "Urlaub genehmigt",
      body: `Dein Urlaub vom ${formatGameTime(req.startMin)} bis ${formatGameTime(req.endMin - 1)} (${req.days} Tag(e)) wurde von ${approver.name} genehmigt.`,
      gameTime: m, category: "personnel", priority: "normal",
      dedupKey: "vacation_approved_msg:" + req.id,
    });

    // Benachrichtigung an GF
    deliverMessage(state, {
      fromId: approver.id, toId: "player",
      subject: "Urlaub genehmigt: " + req.personName,
      body: `${approver.name} hat den Urlaubsantrag von ${req.personName} (vom ${formatGameTime(req.startMin)} bis ${formatGameTime(req.endMin - 1)}, ${req.days} Tag(e)) genehmigt.`,
      gameTime: m, category: "personnel", priority: "normal",
      dedupKey: "vacation_auto_approved_gf:" + req.id,
    });
  }
}

// ---------- Migration ----------

export function migrateAbsences(state) {
  state.absences = state.absences || {};
  state.absences.vacationRequests = state.absences.vacationRequests || [];
  state.absences.sicknesses = state.absences.sicknesses || [];
  
  // Urlaubskonten für bestehende Mitarbeiter initialisieren (nur wenn fehlt)
  for (const d of (state.drivers || [])) {
    if (!d.vacationAccount) {
      d.vacationAccount = { totalEarned: VACATION_START_DAYS, daysUsed: 0, accrualHistory: [] };
    }
  }
  for (const e of (state.employees || [])) {
    if (!e.vacationAccount) {
      e.vacationAccount = { totalEarned: VACATION_START_DAYS, daysUsed: 0, accrualHistory: [] };
    }
  }
}