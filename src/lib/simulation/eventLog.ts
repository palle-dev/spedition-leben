import { recordJourneyEvent } from "./playerJourney.ts";
import { retainLatestHistory } from "./historyRetention.ts";
// Dauerhaftes Ereignisprotokoll für FERNWERK – Auftrag 23.
// Speichert bestätigte Geschäftsereignisse mit stabiler ID, Revision und Sequenz.
// Ereignisse überleben Neuladen, Verbindungsabbruch und Offline-Zeit.
// Deduplizierung über dedupKey verhindert doppelte Zustellung.

import { recordExperienceEvent } from "./experienceRecap.ts";

const MAX_EVENTS = 500; // Begrenzung für Speichereffizienz (reduziert von 2000)

export function initEvents(state) {
  if (!state.events) state.events = [];
  if (!state.eventSeq) state.eventSeq = 0;
  if (!state.eventCursor) state.eventCursor = { lastSeenSeq: 0, lastSeenRevision: 0 };
}

export function migrateEvents(state) {
  if (!state.events) state.events = [];
  if (!state.eventSeq) state.eventSeq = 0;
  if (!state.eventCursor) state.eventCursor = { lastSeenSeq: 0, lastSeenRevision: 0 };
  // Alt-Ereignisse ohne seq migrieren
  for (const ev of state.events) {
    if (ev.seq === undefined) ev.seq = ++state.eventSeq;
    if (!ev.id) ev.id = "ev_" + ev.seq;
    if (!ev.dedupKey) ev.dedupKey = ev.id;
    if (ev.seen === undefined) ev.seen = false;
    if (!ev.committedAtMs) ev.committedAtMs = Date.now();
  }
}

// Erzeugt ein neues dauerhaftes Ereignis. Dedupliziert über dedupKey.
// Gibt das Ereignis zurück (neu oder bereits vorhanden).
export interface EventInput {
  type: string; gameTime?: number; revision?: number;
  employeeId?: string; employeeName?: string; portraitId?: string;
  personId?: string; personName?: string; branchId?: string; orderIds?: string[];
  tourId?: string; vehicleId?: string; driverId?: string;
  details?: Record<string, unknown>; dedupKey?: string; isSystem?: boolean;
}

export function pushEvent(state, {
  type, gameTime, revision, employeeId, employeeName, portraitId,
  orderIds, tourId, vehicleId, driverId, details, dedupKey, personId, personName, branchId,
  isSystem = false,
}: EventInput) {
  initEvents(state);
  const key = dedupKey || (type + ":" + (orderIds?.[0] || tourId || vehicleId || personId || employeeId || driverId || branchId || "") + ":" + (gameTime ?? state.gameTime));
  const existing = state.events.find(e => e.dedupKey === key);
  if (existing) return existing;

  state.eventSeq = (state.eventSeq || 0) + 1;
  const ev = {
    id: "ev_" + state.eventSeq,
    seq: state.eventSeq,
    type,
    gameTime: gameTime != null ? gameTime : state.gameTime,
    revision: revision || 0,
    employeeId: employeeId || null,
    personId: personId || employeeId || driverId || null,
    branchId: branchId || null,
    employeeName: employeeName || personName || null,
    personName: personName || employeeName || null,
    portraitId: portraitId || null,
    isSystem: isSystem || !employeeId,
    orderIds: orderIds || [],
    tourId: tourId || null,
    vehicleId: vehicleId || null,
    driverId: driverId || null,
    details: details || {},
    dedupKey: key,
    seen: false,
    seenAtMs: null,
    committedAtMs: Date.now(),
    createdAtMin: state.gameTime,
  };
  state.events.push(ev);
  recordExperienceEvent(state, ev);
  recordJourneyEvent(state, ev);

  // Begrenzung: älteste Ereignisse entfernen, aber nie die letzten 200
  if (state.events.length > MAX_EVENTS) {
    state.events = retainLatestHistory(state, "events", state.events, MAX_EVENTS, null);
  }

  return ev;
}

// Markiert ein Ereignis als gesehen (nicht gelesen – das ist eine separate Aktion).
export function markEventSeen(state, eventId) {
  const ev = (state.events || []).find(e => e.id === eventId);
  if (ev && !ev.seen) {
    ev.seen = true;
    ev.seenAtMs = Date.now();
  }
}

// Markiert alle Ereignisse als gesehen.
export function markAllEventsSeen(state) {
  for (const ev of (state.events || [])) {
    if (!ev.seen) {
      ev.seen = true;
      ev.seenAtMs = Date.now();
    }
  }
}

export function clearEvents(state) {
  state.events = [];
}

export function deleteEvent(state, eventId) {
  state.events = (state.events || []).filter(e => e.id !== eventId);
}

// Gibt Ereignisse seit einem Sequenz-Cursor zurück (für Delta-Abfrage).
// Sortiert nach seq aufsteigend. Paginiert.
export function getEventsSince(state, lastSeq, limit = 100) {
  const events = (state.events || []).filter(e => e.seq > lastSeq).sort((a, b) => a.seq - b.seq);
  return {
    events: events.slice(0, limit),
    hasMore: events.length > limit,
    nextSeq: events.length > 0 ? events[events.length - 1].seq : lastSeq,
    total: (state.events || []).length,
  };
}

// Gibt die neuesten N Ereignisse zurück (für Live-Verlauf).
export function getRecentEvents(state, limit = 20, typeFilter = null) {
  let events = (state.events || []).slice().reverse();
  if (typeFilter && typeFilter.length > 0) {
    events = events.filter(e => typeFilter.includes(e.type));
  }
  return events.slice(0, limit);
}

// Ungelesene Ereignisse zählen (für Glocke/Badge).
export function getUnseenEventCount(state) {
  return (state.events || []).filter(e => !e.seen && !e.isSystem).length;
}

// Ungelesene Entscheidungs-Ereignisse (für dringliche Hinweise).
export function getPendingDecisionEvents(state) {
  return (state.events || []).filter(e => !e.seen && e.details?.requiresDecision);
}