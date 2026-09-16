// Frontend-Hilfsfunktionen für den Standortausbau.
// Reine Berechnung aus dem Spielzustand — keine Zustandsänderungen.

import { EXPANSION_CONFIG } from "@/lib/simulation/siteExpansionEngine";

export { EXPANSION_CONFIG };

export function formatEuro(cents) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function formatDuration(min) {
  if (min == null || min <= 0) return "—";
  const days = Math.floor(min / 1440);
  const hours = Math.floor((min % 1440) / 60);
  if (days > 0 && hours > 0) return `${days} T ${hours} Std`;
  if (days > 0) return `${days} Tag(e)`;
  return `${hours} Std`;
}

export function formatGameTimeShort(min) {
  if (min == null) return "—";
  const day = Math.floor(min / 1440) + 1;
  const clock = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(clock / 60);
  const m = clock % 60;
  return `T${day} ${(h < 10 ? "0" : "") + h}:${(m < 10 ? "0" : "") + m}`;
}

// Stellplatz-Belegung-Label
export function parkingOccupancyLabel(overview) {
  if (!overview?.parking) return "—";
  const p = overview.parking;
  return `${p.assigned + p.reserved}/${p.total} belegt`;
}

// Werkstatt-Kapazitäts-Label
export function workshopCapacityLabel(overview) {
  if (!overview?.workshop) return "—";
  const w = overview.workshop;
  if (w.slots === 0) return "Keine Werkstatt";
  return `${w.effectiveCapacity} nutzbar (${w.slots} Plätze, ${w.mechanics} Mechaniker)`;
}

// Aufenthaltsbereich-Label
export function breakAreaLabel(overview) {
  if (!overview?.breakArea) return "—";
  const ba = overview.breakArea;
  if (ba.level === 0) return "Nicht vorhanden";
  return `Stufe ${ba.level} (Zustand ${ba.condition}%, +${ba.workEnvironmentBonus} Zufriedenheit)`;
}

// Engpass-Begründung
export function bottleneckReason(overview) {
  if (!overview) return null;
  const reasons = [];
  if (overview.parking.free <= 0) {
    reasons.push(`Keine freien Stellplätze (${overview.parking.assigned + overview.parking.reserved}/${overview.parking.total} belegt).`);
  }
  if (overview.workshop.slots > 0 && overview.workshop.bottleneck === "mechanics") {
    reasons.push(`Werkstattplatz ist fertig, es fehlt jedoch verfügbarer Mechaniker (${overview.workshop.mechanics}/${overview.workshop.slots}).`);
  }
  if (overview.breakArea.level > 0 && overview.breakArea.condition < 50) {
    reasons.push(`Der Aufenthaltsbereich wirkt wegen des aktuellen Pflegezustands (${overview.breakArea.condition}%) eingeschränkt.`);
  }
  return reasons.length > 0 ? reasons : null;
}