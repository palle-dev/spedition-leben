// Client-seitige Event-Log-Hilfsfunktionen – Auftrag 23.
// Spiegelt die serverseitigen Lese-Funktionen für den Browser.

import { eventToNotification, EMAILED_EVENT_TYPES } from "@/lib/eventNotifications";

export function getUnseenEventCount(state) {
  if (!state?.events) return 0;
  return state.events.filter(e => !e.seen && !e.isSystem && !EMAILED_EVENT_TYPES.has(e.type)).length;
}

export function getRecentEvents(state, limit = 50, typeFilter = null) {
  if (!state?.events) return [];
  let events = state.events.slice().reverse();
  if (typeFilter && typeFilter.length > 0) {
    events = events.filter(e => typeFilter.includes(e.type));
  }
  return events.slice(0, limit);
}

export function getAllNotifications(state, limit = 100) {
  if (!state?.events) return [];
  return state.events
    .slice()
    .reverse()
    .slice(0, limit)
    .map(ev => eventToNotification(ev))
    .filter(Boolean);
}