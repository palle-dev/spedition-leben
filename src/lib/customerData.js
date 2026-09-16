// UI-Datenhilfsfunktionen für Kundenbeziehungen und Rahmenverträge.
// Reine Berechnung aus dem Spielzustand — keine Zustandsänderungen.

import { CUSTOMER_PROFILES } from "@/lib/simulation/gameRules";
import {
  TRUST_START, STAMMKUNDE_MIN_TRANSPORTS, STAMMKUNDE_MIN_TRUST,
  CONTRACT_DISCOUNT, CONTRACT_DURATION_DAYS,
} from "@/lib/simulation/customerEngine";

export function getTrustLabel(trust) {
  if (trust >= 80) return "Sehr vertrauensvoll";
  if (trust >= 60) return "Vertrauensvoll";
  if (trust >= 40) return "Neutral";
  if (trust >= 20) return "Vorsichtig";
  return "Misstrauisch";
}

export function getTrustColor(trust) {
  if (trust >= 80) return "text-lime";
  if (trust >= 60) return "text-lime/80";
  if (trust >= 40) return "text-muted-foreground";
  if (trust >= 20) return "text-coral/80";
  return "text-coral";
}

export function getRelationStatusLabel(summary) {
  if (summary.isStammkunde) return "Stammkunde";
  if (summary.completedTransports > 0) return "Geschäftskunde";
  return "Neukunde";
}

export function getContractStatusLabel(contract) {
  if (!contract) return "Kein Vertrag";
  switch (contract.status) {
    case "offered": return "Angebot offen";
    case "active": return "Aktiv";
    case "completed": return "Abgeschlossen";
    case "terminated": return "Beendet";
    default: return contract.status;
  }
}

export function formatEuro(cents) {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function formatDay(min) {
  if (min == null) return "—";
  const day = Math.floor(min / 1440) + 1;
  return "Tag " + day;
}

export function formatClock(min) {
  if (min == null) return "—";
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
}

export { TRUST_START, STAMMKUNDE_MIN_TRANSPORTS, STAMMKUNDE_MIN_TRUST, CONTRACT_DISCOUNT, CONTRACT_DURATION_DAYS };