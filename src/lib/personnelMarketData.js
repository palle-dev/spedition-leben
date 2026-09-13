// Frontend-Spiegel der Personalmarkt-Engine (Auftrag 29).
// Spiegelt die serverseitigen Konstanten und Hilfsfunktionen für die UI.

import { formatGameTime } from "./gameData";

export const APPLICANT_EXPIRY_DAYS = 7;
export const APPLICANT_EXPIRY_MIN = 7 * 1440;
export const BATCH_LIMIT = 200;
export const REGULAR_WAVE_TIMES = [480, 840]; // 08:00 und 14:00

// Schicht-Vorlagen für Disponenten (spiegelt SHIFT_TEMPLATES aus gameRules)
export const SHIFT_TEMPLATES = [
  { id: "early",  label: "Frühschicht",  startMin: 360,  endMin: 840,  desc: "06:00–14:00 Uhr" },
  { id: "day",    label: "Tagschicht",   startMin: 480,  endMin: 960,  desc: "08:00–16:00 Uhr" },
  { id: "late",   label: "Spätschicht",  startMin: 840,  endMin: 1200, desc: "14:00–22:00 Uhr" },
  { id: "night",  label: "Nachtschicht", startMin: 1200, endMin: 360,  desc: "22:00–06:00 Uhr" },
];

// Rollen-Katalog (spiegelt PERSONNEL_ROLES aus gameRules)
export const ROLES = [
  { id: "driver",            label: "Fahrer",                  hireFeeCents: 50000,  costPerDayCents: 10000, capacity: 0,  profile: "standard" },
  { id: "dispatcher",         label: "Disponent",               hireFeeCents: 50000,  costPerDayCents: 18000, capacity: 6,  profile: "standard" },
  { id: "dispatcher_senior",  label: "Erfahrener Disponent",    hireFeeCents: 100000, costPerDayCents: 26000, capacity: 12, profile: "senior" },
  { id: "cleaner",            label: "Reinigungskraft",         hireFeeCents: 15000,  costPerDayCents: 6000,  capacity: 4,  profile: "standard" },
  { id: "mechanic",           label: "Werkstattmitarbeiter",    hireFeeCents: 50000,  costPerDayCents: 14000, capacity: 1,  profile: "standard" },
  { id: "accountant",         label: "Buchhalter/Buchhalterin", hireFeeCents: 40000,  costPerDayCents: 12000, capacity: 40, profile: "standard" },
  { id: "accountant_senior",  label: "Erfahrene Buchhaltungskraft", hireFeeCents: 70000, costPerDayCents: 19000, capacity: 80, profile: "senior" },
];

export const ROLE_LABELS = {
  driver: "Fahrer",
  dispatcher: "Disponent",
  dispatcher_senior: "Erf. Disponent",
  cleaner: "Reinigungskraft",
  mechanic: "Werkstattmitarbeiter",
  accountant: "Buchhalter/Buchhalterin",
  accountant_senior: "Erf. Buchhaltungskraft",
};

export const ROLE_ICONS = {
  driver: "Truck",
  dispatcher: "Headset",
  dispatcher_senior: "Headset",
  cleaner: "Sparkles",
  mechanic: "Wrench",
  accountant: "Calculator",
  accountant_senior: "Calculator",
};

// Kapazitäts-Label je Rolle
export function capacityLabel(role, capacity) {
  if (capacity <= 0) return null;
  if (role === "dispatcher" || role === "dispatcher_senior") return capacity + " Lkw";
  if (role === "cleaner") return capacity + " Reinigungseinheiten";
  if (role === "mechanic") return "1 Wartungsauftrag";
  if (role === "accountant" || role === "accountant_senior") return capacity + " Prüfpunkte";
  return capacity + " Einheiten";
}

// Profil-Label
export function profileLabel(role) {
  if (role === "dispatcher_senior" || role === "accountant_senior") return "Erfahren";
  return "Standard";
}

// Ablauf-Status eines Bewerbers
export function applicantExpiryStatus(app, currentMin) {
  if (!app.expiresAtMin) return { label: "unbegrenzt", color: "text-muted-foreground" };
  const remaining = app.expiresAtMin - currentMin;
  if (remaining <= 0) return { label: "abgelaufen", color: "text-coral" };
  const days = Math.floor(remaining / 1440);
  if (days >= 1) return { label: `noch ${days} Tag${days > 1 ? "e" : ""}`, color: "text-muted-foreground" };
  const hours = Math.floor(remaining / 60);
  if (hours >= 1) return { label: `noch ${hours} Std`, color: "text-amber-300" };
  return { label: "läuft bald ab", color: "text-coral" };
}

// Verfügbarkeits-Label
export function availabilityLabel(app, currentMin) {
  if (!app.earliestStartMin || app.earliestStartMin <= currentMin) {
    return { label: "ab sofort", color: "text-lime" };
  }
  return { label: "ab " + formatGameTime(app.earliestStartMin), color: "text-amber-300" };
}

// Nächste reguläre Wellenzeit
export function getNextRegularWaveTime(t) {
  const clock = t % 1440;
  if (clock < REGULAR_WAVE_TIMES[0]) return Math.floor(t / 1440) * 1440 + REGULAR_WAVE_TIMES[0];
  if (clock < REGULAR_WAVE_TIMES[1]) return Math.floor(t / 1440) * 1440 + REGULAR_WAVE_TIMES[1];
  return Math.floor(t / 1440) * 1440 + 1440 + REGULAR_WAVE_TIMES[0];
}

// Paginiere ein Array
export function paginate(arr, page, pageSize) {
  const start = (page - 1) * pageSize;
  return arr.slice(start, start + pageSize);
}

// Gesamtzahl Seiten
export function totalPages(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize));
}