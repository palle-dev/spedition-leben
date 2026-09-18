// UI-Hilfsfunktionen für die Liquiditätsvorschau.
// Reine Formatierung — keine Zustandsänderungen.

import { dayOf, clockOf, formatGameTime } from "@/lib/simulation/gameRules";

// Formatiert Cent-Beträge als Euro.
export function formatEuro(cents) {
  if (!Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

// Formatiert Cent-Beträge kompakt (k€).
export function formatKEuro(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  if (abs >= 100000) return sign + (abs / 100000).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " k€";
  return sign + (abs / 100).toFixed(0) + " €";
}

// Formatiert eine Spielminute als Tag-Label.
export function formatDayLabel(min) {
  if (min === null || min === undefined) return "—";
  return "T" + dayOf(min);
}

// Formatiert eine Spielminute als Tageszeitpunkt.
export function formatGameClock(min) {
  if (min === null || min === undefined) return "—";
  return formatGameTime(min);
}

// Bestimmt die CSS-Klasse für einen Kontostand.
export function balanceClass(cents, minBuffer = 0) {
  if (cents < 0) return "text-red-400";
  if (cents < minBuffer) return "text-coral";
  return "text-foreground";
}

// Bestimmt die CSS-Klasse für eine Position (Einnahme/Ausgabe).
export function directionClass(direction) {
  return direction === "in" ? "text-lime" : "text-coral";
}

// Bestimmt das Icon für einen Quelltyp.
export function sourceIcon(sourceType) {
  const map = {
    openItem: "📋",
    loanRate: "🏦",
    loanOverdue: "⚠️",
    leasingRate: "🚛",
    leasingOverdue: "⚠️",
    tripRevenue: "📦",
    acceptedOrder: "📦",
    contractOrder: "📜",
    maintenance: "🔧",
    dailyPersonnel: "👥",
    dailyBranch: "📍",
    dailyWithdrawalOut: "💸",
    dailyWithdrawalIn: "💰",
    dailyLiving: "🏠",
    decisionBuy: "🛒",
    decisionLeaseSpecial: "🛒",
    decisionLeaseRate1: "🛒",
    decisionHireFee: "👤",
    decisionHireWage: "👤",
    decisionBranchOpen: "🏢",
    decisionBranchDaily: "🏢",
  };
  return map[sourceType] || "•";
}

// Bestimmt das Label für eine Ansicht.
export function viewLabel(view) {
  const map = {
    known: "Bekannte Zahlungen",
    expected: "Erwarteter Verlauf",
    conservative: "Vorsichtige Planung",
  };
  return map[view] || view;
}

// Bestimmt die Beschreibung für eine Ansicht.
export function viewDescription(view) {
  const map = {
    known: "Bestehende Verpflichtungen und offene Posten mit verfügbaren Terminen. Eine fällige Forderung ist keine garantiert eingehende Zahlung.",
    expected: "Ergänzt erwartete Erlöse und variable Kosten aus geplanten und vertraglich vorgesehenen Transporten.",
    conservative: "Verwendet einstellbare Annahmen: spätere Einnahmen, höhere Kosten. Alternatives Rechenmodell, keine Untergrenze.",
  };
  return map[view] || "";
}

// Bestimmt das Certainty-Label.
export function certaintyLabel(certainty) {
  const map = {
    certain: "Sicher",
    expected: "Erwartet",
    assumed: "Angenommen",
  };
  return map[certainty] || certainty;
}

// Bestimmt die Certainty-CSS-Klasse.
export function certaintyClass(certainty) {
  const map = {
    certain: "text-muted-foreground",
    expected: "text-yellow-400/80",
    assumed: "text-coral/80",
  };
  return map[certainty] || "text-muted-foreground";
}