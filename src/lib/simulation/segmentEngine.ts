// Segment-Klassifikation für FERNWERK.
// Klassifiziert Aufträge nach Transportmerkmalen: Regional, Express, Gefahrgut.
// Keine Dubletten-Zählung: Ein Auftrag kann mehrere Merkmale gleichzeitig haben
// (z.B. Regional + Express), wird aber pro Segment nur einmal gezählt.

import { getDistance, CITIES } from "./gameRules.ts";

// Schwellwert für Regionalverkehr (einfache Entfernung in km)
export const REGIONAL_DISTANCE_KM = 150;

// Express-Schwellwert: Lieferfrist ab Annahme in Minuten
export const EXPRESS_DEADLINE_MIN = 1440; // 24h

// Auftragsmerkmale
export interface OrderCharacteristics {
  isRegional: boolean;
  isExpress: boolean;
  isDangerousGoods: boolean;
  distanceKm: number;
  deliveryWindowMin: number;
}

// Migriert Aufträge mit Segment-Feldern
export function migrateSegmentFields(state) {
  for (const o of (state.orders || [])) {
    if (o._segmentMigrated) continue;
    const chars = getOrderCharacteristics(o);
    o.isRegional = chars.isRegional;
    o.isExpress = chars.isExpress;
    o._segmentMigrated = true;
  }
}

// Berechnet Auftragsmerkmale aus vorhandenen Daten
export function getOrderCharacteristics(order): OrderCharacteristics {
  const distanceKm = getDistance(order.fromCity, order.toCity);
  const deliveryWindowMin = (order.deliveryDeadlineMin || 0) - (order.acceptedAtMin || order.publishedAtMin || order.acceptDeadlineMin || 0);
  return {
    isRegional: distanceKm <= REGIONAL_DISTANCE_KM,
    isExpress: deliveryWindowMin > 0 && deliveryWindowMin <= EXPRESS_DEADLINE_MIN,
    isDangerousGoods: !!order.isDangerousGoods,
    distanceKm,
    deliveryWindowMin,
  };
}

// Bestimmt das primäre Segment eines Auftrags für UI-Anzeige
export function getPrimarySegment(order): "regional" | "express" | "dangerousGoods" | "standard" {
  const chars = getOrderCharacteristics(order);
  if (chars.isDangerousGoods) return "dangerousGoods";
  if (chars.isExpress) return "express";
  if (chars.isRegional) return "regional";
  return "standard";
}

// Alle Segmente eines Auftrags als Array
export function getOrderSegments(order): string[] {
  const chars = getOrderCharacteristics(order);
  const segments = [];
  if (chars.isRegional) segments.push("regional");
  if (chars.isExpress) segments.push("express");
  if (chars.isDangerousGoods) segments.push("dangerousGoods");
  if (segments.length === 0) segments.push("standard");
  return segments;
}