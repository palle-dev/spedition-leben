// Segment-Statistik-Engine für FERNWERK.
// Erfasst wirtschaftliche Kennzahlen pro Transportsegment (Regional, Express, Gefahrgut, Standard).
// Inkrementelle Auswertung: Jede abgeschlossene Lieferung wird sofort zugeordnet.
// Die analytische Zuordnung erzeugt KEINE zusätzlichen Buchungen oder Zahlungen.

import { getOrderSegments, getOrderCharacteristics } from "./segmentEngine.ts";

export function migrateSegmentStats(state) {
  if (!state.segmentStats) {
    state.segmentStats = {
      segments: {
        regional: { deliveries: 0, timelyDeliveries: 0, revenueCents: 0, fuelCents: 0, tollCents: 0, driverWageCents: 0, handlingCents: 0, emptyKm: 0, loadedKm: 0, trips: 0 },
        express: { deliveries: 0, timelyDeliveries: 0, revenueCents: 0, fuelCents: 0, tollCents: 0, driverWageCents: 0, handlingCents: 0, emptyKm: 0, loadedKm: 0, trips: 0 },
        dangerousGoods: { deliveries: 0, timelyDeliveries: 0, revenueCents: 0, fuelCents: 0, tollCents: 0, driverWageCents: 0, handlingCents: 0, emptyKm: 0, loadedKm: 0, trips: 0 },
        standard: { deliveries: 0, timelyDeliveries: 0, revenueCents: 0, fuelCents: 0, tollCents: 0, driverWageCents: 0, handlingCents: 0, emptyKm: 0, loadedKm: 0, trips: 0 },
      },
      tankCleaningCents: 0,
    };
  }
  // Sicherstellen, dass alle Segmente vorhanden sind
  for (const seg of ["regional", "express", "dangerousGoods", "standard"]) {
    if (!state.segmentStats.segments[seg]) {
      state.segmentStats.segments[seg] = { deliveries: 0, timelyDeliveries: 0, revenueCents: 0, fuelCents: 0, tollCents: 0, driverWageCents: 0, handlingCents: 0, emptyKm: 0, loadedKm: 0, trips: 0 };
    }
  }
  if (state.segmentStats.tankCleaningCents === undefined) state.segmentStats.tankCleaningCents = 0;
}

// Erfasst eine abgeschlossene Lieferung in der Segment-Statistik.
// Ein Auftrag kann mehreren Segmenten angehören — jedes Segment erhält die
// vollen Werte (keine Aufteilung), da die Segmente nicht exklusiv sind.
export function recordSegmentDelivery(state, order, trip, onTime, paymentCents, fuelCents, tollCents, driverWageCents, handlingCents) {
  migrateSegmentStats(state);
  const segments = getOrderSegments(order);
  const loadedKm = trip.drivenKm || 0;
  for (const seg of segments) {
    const s = state.segmentStats.segments[seg];
    if (!s) continue;
    s.deliveries++;
    if (onTime) s.timelyDeliveries++;
    s.revenueCents += paymentCents;
    s.fuelCents += fuelCents || 0;
    s.tollCents += tollCents || 0;
    s.driverWageCents += driverWageCents || 0;
    s.handlingCents += handlingCents || 0;
    s.loadedKm += loadedKm;
    s.trips++;
  }
}

// Erfasst eine Leerfahrt in der Segment-Statistik.
// Leerfahrten werden dem Standard-Segment zugeordnet, da sie nicht
// segmentspezifisch sind (kein Auftrag → keine Segment-Zuordnung).
export function recordEmptyTrip(state, trip) {
  migrateSegmentStats(state);
  const s = state.segmentStats.segments.standard;
  s.emptyKm += trip.drivenKm || 0;
  s.fuelCents += trip.fuelCents || 0;
  s.tollCents += trip.tollCents || 0;
}

// Erfasst eine Tankreinigungskosten im Gefahrgut-Segment.
export function recordTankCleaning(state, costCents) {
  migrateSegmentStats(state);
  state.segmentStats.tankCleaningCents += costCents || 0;
  state.segmentStats.segments.dangerousGoods.handlingCents += costCents || 0;
}

// Liefert die aggregierten Segment-Statistiken für die UI.
export function getSegmentStats(state) {
  migrateSegmentStats(state);
  const segments = {};
  for (const [key, s] of Object.entries(state.segmentStats.segments)) {
    const totalCostCents = (s.fuelCents || 0) + (s.tollCents || 0) + (s.driverWageCents || 0) + (s.handlingCents || 0);
    const contributionCents = (s.revenueCents || 0) - totalCostCents;
    const margin = s.revenueCents > 0 ? contributionCents / s.revenueCents : 0;
    const punctuality = s.deliveries > 0 ? s.timelyDeliveries / s.deliveries : 0;
    segments[key] = {
      deliveries: s.deliveries,
      timelyDeliveries: s.timelyDeliveries,
      revenueCents: s.revenueCents,
      totalCostCents,
      contributionCents,
      margin: Math.round(margin * 1000) / 1000,
      punctuality: Math.round(punctuality * 1000) / 1000,
      fuelCents: s.fuelCents,
      tollCents: s.tollCents,
      driverWageCents: s.driverWageCents,
      handlingCents: s.handlingCents,
      loadedKm: s.loadedKm,
      emptyKm: s.emptyKm,
      trips: s.trips,
    };
  }
  return {
    segments,
    tankCleaningCents: state.segmentStats.tankCleaningCents,
  };
}