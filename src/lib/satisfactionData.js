// Frontend-Spiegel für die Zufriedenheits-Engine (Auftrag 30).
// Stellt Ursachen-Typen, Maßnahmen und Formatierung bereit.

import { formatEuro, formatGameTime } from "./gameData";

// Ursachen-Typen mit Label und Icon
export const CAUSE_TYPES = {
  unpaid_wage: { label: "Offene Löhne", icon: "Wallet", color: "text-amber-300", bg: "bg-amber-400/10" },
  bad_vehicle: { label: "Fahrzeugzustand", icon: "Truck", color: "text-coral", bg: "bg-coral/10" },
  dirty_workplace: { label: "Schmutziger Arbeitsplatz", icon: "Sparkles", color: "text-sky-300", bg: "bg-sky-300/10" },
  vacation_denied: { label: "Urlaub abgelehnt", icon: "CalendarX", color: "text-rose-300", bg: "bg-rose-400/10" },
  vacation_approved: { label: "Urlaub genehmigt", icon: "CalendarCheck", color: "text-lime", bg: "bg-lime/10" },
  salary_raised: { label: "Gehaltserhöhung", icon: "TrendingUp", color: "text-lime", bg: "bg-lime/10" },
  wages_paid: { label: "Löhne beglichen", icon: "CheckCircle", color: "text-lime", bg: "bg-lime/10" },
  bonus_given: { label: "Prämie gewährt", icon: "Gift", color: "text-lime", bg: "bg-lime/10" },
  conversation_held: { label: "Gespräch geführt", icon: "MessageCircle", color: "text-lime", bg: "bg-lime/10" },
  recovery: { label: "Erholung", icon: "Sun", color: "text-lime", bg: "bg-lime/10" },
};

export function causeTypeLabel(type) {
  return CAUSE_TYPES[type]?.label || type;
}

export function causeTypeColor(type) {
  return CAUSE_TYPES[type]?.color || "text-muted-foreground";
}

export function causeTypeBg(type) {
  return CAUSE_TYPES[type]?.bg || "bg-white/5";
}

// Zufriedenheits-Label und Farbe
export function satisfactionLevel(sat) {
  if (sat >= 70) return { label: "Zufrieden", color: "text-lime", dot: "bg-lime", bar: "bg-lime" };
  if (sat >= 45) return { label: "Unzufrieden", color: "text-amber-300", dot: "bg-amber-300", bar: "bg-amber-300" };
  if (sat >= 30) return { label: "Kritisch", color: "text-coral", dot: "bg-coral", bar: "bg-coral" };
  return { label: "Sehr kritisch", color: "text-red-300", dot: "bg-red-300", bar: "bg-red-300" };
}

// Delta formatieren
export function formatDelta(delta) {
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

// Maßnahme-Beschreibungen
export const ACTION_INFO = {
  payWages: {
    label: "Löhne begleichen",
    description: "Begleicht die offenen Lohnforderungen dieser Person aus der Firmenbank.",
    icon: "Wallet",
  },
  raiseSalary: {
    label: "Gehalt erhöhen",
    description: "Dauerhafte Erhöhung des Tageslohns. +5 Zufriedenheit bei erfülltem 30-Tage-Abstand.",
    icon: "TrendingUp",
  },
  giveBonus: {
    label: "Anerkennungsprämie",
    description: "Einmalige Prämie in Höhe des Tageslohns. +4 Zufriedenheit, max. alle 30 Tage.",
    icon: "Gift",
  },
  conductConversation: {
    label: "Mitarbeitergespräch",
    description: "30 Spielminuten Gespräch. +2 bei Zufriedenheit unter 70, max. alle 7 Tage.",
    icon: "MessageCircle",
  },
  retentionConversation: {
    label: "Bleibegespräch",
    description: "Gespräch zur Rücknahme der Eigenkündigung. Voraussetzung: Löhne beglichen, Zufriedenheit ≥ 45.",
    icon: "HeartHandshake",
  },
};

// Teamklima-Filter
export const CLIMATE_FILTERS = [
  { id: "all", label: "Alle" },
  { id: "critical", label: "Kritisch (<40)" },
  { id: "atRisk", label: "Austrittsrisiko" },
  { id: "noticeGiven", label: "Kündigung offen" },
  { id: "unpaidWages", label: "Offene Löhne" },
];