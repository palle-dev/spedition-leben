// History-Cleanup für FERNWERK.
// Entfernt alte abgeschlossene Trips, Tours und erledigte Aufträge aus dem
// Zustand. Wird täglich um Mitternacht aufgerufen (processEventsAt).
// Verhindert, dass state.trips/orders/tours über Wochen wachsen und
// earliestEventAfter (O(n) pro Event) sowie processEventsAt langsam werden.
// Behalte die letzten 7 Tage Trips/Tours und 30 Tage Aufträge für die UI.

const TRIP_RETENTION_MIN = 7 * 1440;
const ORDER_RETENTION_MIN = 30 * 1440;
const DONE_ORDER_STATUSES = new Set(["geliefert", "storniert", "expired", "failed"]);

export function cleanupHistory(state, m) {
  const tripCutoff = m - TRIP_RETENTION_MIN;
  const orderCutoff = m - ORDER_RETENTION_MIN;
  if (state.trips && state.trips.length > 0) {
    state.trips = state.trips.filter(t =>
      t.status === "in_progress" || (t.endMin != null && t.endMin >= tripCutoff)
    );
  }
  if (state.tours && state.tours.length > 0) {
    state.tours = state.tours.filter(t =>
      t.status === "active" || t.status === "planned" ||
      (t.createdAt != null && t.createdAt >= tripCutoff)
    );
  }
  if (state.orders && state.orders.length > 0) {
    state.orders = state.orders.filter(o =>
      !DONE_ORDER_STATUSES.has(o.status) ||
      (o.failedAtMin != null && o.failedAtMin >= orderCutoff) ||
      (o.deliveredAtMin != null && o.deliveredAtMin >= orderCutoff)
    );
  }
}