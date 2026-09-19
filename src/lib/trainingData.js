// Frontend-Spiegel für die Ausbildungs- und Weiterbildungs-Engine (Auftrag 31).
// Stellt Kurskatalog, Qualifikations-Labels und Formatierung bereit.

import { formatEuro, formatGameTime } from "./gameData";

// Kurskatalog (Spiegel von trainingEngine.ts)
export const COURSE_CATALOG = [
  {
    id: "eco_drive_1",
    label: "Wirtschaftliches Fahren",
    targetRole: "driver",
    feeCents: 35000,
    hours: 8,
    blocks: 1,
    effect: "eco_drive",
    effectDesc: "5 % weniger Kraftstoffverbrauch für zukünftig damit gestartete Fahrten",
    requires: ["driver_license"],
    description: "Spritsparende Fahrweise und vorausschauendes Fahren.",
    icon: "Fuel",
  },
  {
    id: "adr_basic",
    label: "ADR-Basiskurs (Spiel)",
    targetRole: "driver",
    feeCents: 60000,
    hours: 24,
    blocks: 3,
    effect: "adr_basic",
    effectDesc: "Aktive Basisqualifikation für implementierte Versandstückprofile",
    requires: ["driver_license"],
    description: "Basisqualifikation für Gefahrguttransporte (Versandstückprofile).",
    icon: "Flame",
  },
  {
    id: "adr_tank",
    label: "ADR-Aufbau Tank (Spiel)",
    targetRole: "driver",
    feeCents: 45000,
    hours: 16,
    blocks: 2,
    effect: "adr_tank",
    effectDesc: "Zusätzliche Tankberechtigung für implementierte Tankprofile",
    requires: ["adr_basic_valid"],
    description: "Aufbaukurs für Tankbeförderungen. Übernimmt Basisablauf.",
    icon: "Droplet",
  },
  {
    id: "adr_refresh",
    label: "ADR-Auffrischung (Spiel)",
    targetRole: "driver",
    feeCents: 35000,
    hours: 8,
    blocks: 1,
    effect: "adr_refresh",
    effectDesc: "Einmalige Erneuerung des bestehenden gültigen Umfangs",
    requires: ["adr_refresh_window"],
    description: "Auffrischung innerhalb des Erneuerungsfensters vor Ablauf.",
    icon: "RefreshCw",
  },
  {
    id: "dispo_advanced",
    label: "Erweiterte Disposition",
    targetRole: "dispatcher",
    feeCents: 120000,
    hours: 16,
    blocks: 2,
    effect: "dispo_advanced",
    effectDesc: "Kapazität 6 → 12 Lkw; Beförderung mit Lohnanpassung",
    requires: ["dispatcher_role"],
    description: "Erweiterte Disposition mit höherer Kapazität. Beförderung bei Abschluss.",
    isPromotion: true,
    promotionMinWageCents: 26000,
    promotionNewRole: "dispatcher_senior",
    icon: "Headset",
  },
  {
    id: "dispo_dg",
    label: "Gefahrgutdisposition",
    targetRole: "dispatcher",
    feeCents: 35000,
    hours: 8,
    blocks: 1,
    effect: "dispo_dg",
    effectDesc: "Autonome Gefahrgutannahme/-planung innerhalb erteilter Befugnisse",
    requires: ["dispatcher_role"],
    description: "Gefahrgutdisposition für Disponenten.",
    icon: "Flame",
  },
  {
    id: "dispo_efficiency",
    label: "Effiziente Tourenplanung",
    targetRole: "dispatcher",
    feeCents: 80000,
    hours: 16,
    blocks: 2,
    effect: "dispo_efficiency",
    effectDesc: "72h Planung, 2 zusätzliche betreute Lkw, mindestens 16 Auftragskandidaten und 20 Minuten Mindestpuffer",
    requires: ["dispatcher_role"],
    description: "Fortgeschrittene Tourenplanung mit erweitertem Horizont und verkürzten Reaktionszeiten.",
    icon: "Route",
  },
  {
    id: "dispo_lead", label: "Dispositionsleitung & Krisenkoordination",
    targetRole: "dispatcher", targetRoleSenior: "dispatcher_senior",
    feeCents: 180000, hours: 24, blocks: 3, effect: "dispo_lead",
    effectDesc: "18 betreute Lkw (20 mit Effizienzschulung), 96h Planung, 20 Auftragskandidaten und Vorrang bei Störungskoordination",
    requires: ["dispatcher_senior_role"],
    description: "Weiterbildung erfahrener Disponenten zur Leitung. Im Firmenpool filialübergreifend; bestehende Filialzuordnung und Befugnisse bleiben verbindlich.",
  },
  {
    id: "assistant_advanced",
    label: "Betriebliche Analyse & Steuerung",
    targetRole: "assistant",
    feeCents: 90000,
    hours: 16,
    blocks: 2,
    effect: "assistant_advanced",
    effectDesc: "Höhere Auftragsannahme-Quote, frühere Fristwarnung, früherer Auto-Dispatch – weniger verfallende und scheiternde Aufträge",
    requires: ["assistant_role"],
    description: "Fortgeschrittene betriebswirtschaftliche Analyse für Assistenten der Geschäftsführung.",
    icon: "Briefcase",
  },
  {
    id: "branch_manager_advanced",
    label: "Filialmanagement & Steuerung",
    targetRole: "branch_manager",
    feeCents: 110000,
    hours: 16,
    blocks: 2,
    effect: "branch_manager_advanced",
    effectDesc: "Höhere Auto-Freigabegrenze und häufigere Entscheidungen – Filiale läuft autonomer und Engpässe werden früher erkannt",
    requires: ["branch_manager_role"],
    description: "Fortgeschrittenes Filialmanagement für Filialleiter.",
    icon: "Building2",
  },
  {
    id: "mechanic_material_1",
    label: "Materialeffiziente Wartung",
    targetRole: "mechanic",
    feeCents: 90000,
    hours: 16,
    blocks: 2,
    effect: "mechanic_material_1",
    effectDesc: "10 % weniger Teilekosten bei neuen Standardwartungen",
    requires: ["mechanic_role"],
    description: "Materialeffiziente Wartungstechniken.",
    icon: "Wrench",
  },
  {
    id: "dg_vehicle_tech",
    label: "Gefahrgut-Fahrzeugtechnik (Spiel)",
    targetRole: "mechanic",
    feeCents: 60000,
    hours: 8,
    blocks: 1,
    effect: "dg_vehicle_tech",
    effectDesc: "Interne Ausrüstungs- und Spielprüfaufträge",
    requires: ["mechanic_role"],
    description: "Fahrzeugtechnik für Gefahrguttransporte (Spiel).",
    icon: "Truck",
  },
  {
    id: "cleaning_advanced",
    label: "Reinigungsorganisation",
    targetRole: "cleaner",
    feeCents: 25000,
    hours: 8,
    blocks: 1,
    effect: "cleaning_advanced",
    effectDesc: "Tageskapazität 4 → 6 Einheiten",
    requires: ["cleaner_role"],
    description: "Erweiterte Reinigungsorganisation.",
    icon: "Sparkles",
  },
  {
    id: "accounting_advanced",
    label: "Erweiterte Buchhaltung",
    targetRole: "accountant",
    feeCents: 100000,
    hours: 16,
    blocks: 2,
    effect: "accounting_advanced",
    effectDesc: "Bis 80 statt 40 Prüfpunkte; Beförderung mit Lohnanpassung",
    requires: ["accountant_role"],
    description: "Erweiterte Buchhaltung mit höherer Kapazität. Beförderung bei Abschluss.",
    isPromotion: true,
    promotionMinWageCents: 19000,
    promotionNewRole: "accountant_senior",
    icon: "Calculator",
  },
  {
    id: "mentor_1",
    label: "Ausbildungsbegleitung",
    targetRole: "any",
    feeCents: 45000,
    hours: 8,
    blocks: 1,
    effect: "mentor_1",
    effectDesc: "Eine passende eigene Nachwuchskraft betreuen",
    requires: ["any_qualified"],
    description: "Befähigung zur Ausbildungsbegleitung für Nachwuchskräfte.",
    icon: "GraduationCap",
  },
];

export function getCourseById(courseId) {
  return COURSE_CATALOG.find(c => c.id === courseId);
}

// Qualifikations-Typ-Labels
export const QUAL_TYPE_LABELS = {
  driver_license: "Fahrerqualifikation",
  role_dispatcher: "Dispositionsqualifikation",
  role_dispatcher_senior: "Erfahrene Disposition",
  role_mechanic: "Mechanikerqualifikation",
  role_cleaner: "Reinigungsqualifikation",
  role_accountant: "Buchhaltungsqualifikation",
  role_accountant_senior: "Erfahrene Buchhaltung",
  eco_drive: "Wirtschaftliches Fahren",
  adr_basic: "ADR-Basis (Spiel)",
  adr_tank: "ADR-Tank (Spiel)",
  dispo_advanced: "Erweiterte Disposition",
  dispo_dg: "Gefahrgutdisposition",
  dispo_efficiency: "Effiziente Tourenplanung",
  dispo_lead: "Dispositionsleitung & Krisenkoordination",
  assistant_advanced: "Betriebliche Analyse & Steuerung",
  branch_manager_advanced: "Filialmanagement & Steuerung",
  mechanic_material_1: "Materialeffiziente Wartung",
  dg_vehicle_tech: "Gefahrgut-Fahrzeugtechnik (Spiel)",
  cleaning_advanced: "Reinigungsorganisation",
  accounting_advanced: "Erweiterte Buchhaltung",
  mentor_1: "Ausbildungsbegleitung",
};

export function qualTypeLabel(type) {
  return QUAL_TYPE_LABELS[type] || type;
}

// Qualifikations-Status
export function qualStatusLabel(qual, now) {
  if (qual.status === "expired") return { label: "Abgelaufen", color: "text-red-300", dot: "bg-red-300" };
  if (qual.status === "active" && qual.validUntilMin) {
    const daysLeft = Math.floor((qual.validUntilMin - now) / 1440);
    if (daysLeft <= 0) return { label: "Abgelaufen", color: "text-red-300", dot: "bg-red-300" };
    if (daysLeft <= 30) return { label: `Läuft in ${daysLeft} Tagen ab`, color: "text-amber-300", dot: "bg-amber-300" };
    if (daysLeft <= 120) return { label: `${daysLeft} Tage gültig`, color: "text-sky-300", dot: "bg-sky-300" };
    return { label: `${daysLeft} Tage gültig`, color: "text-lime", dot: "bg-lime" };
  }
  return { label: "Gültig", color: "text-lime", dot: "bg-lime" };
}

// Zielgruppen-Label
export function targetRoleLabel(role) {
  const labels = {
    driver: "Fahrer",
    dispatcher: "Disponent",
    dispatcher_senior: "Erf. Disponent",
    mechanic: "Mechaniker",
    cleaner: "Reinigung",
    accountant: "Buchhaltung",
    accountant_senior: "Erf. Buchhaltung",
    assistant: "Assistent",
    branch_manager: "Filialleiter",
    any: "Alle qualifizierten Mitarbeiter",
  };
  return labels[role] || role;
}

// Voraussetzungs-Labels
export function requirementLabel(req) {
  const labels = {
    driver_license: "Fahrerqualifikation",
    adr_basic_valid: "Gültige ADR-Basis",
    adr_refresh_window: "ADR im Erneuerungsfenster",
    dispatcher_role: "Disponent",
    assistant_role: "Assistent",
    branch_manager_role: "Filialleiter",
    mechanic_role: "Mechaniker",
    cleaner_role: "Reinigungskraft",
    accountant_role: "Buchhaltungskraft",
    any_qualified: "Qualifizierte Person",
  };
  return labels[req] || req;
}

// Ausbildungsrollen
export const APPRENTICE_ROLES = [
  { id: "driver", label: "Fahrer", wage: 10000, icon: "Truck" },
  { id: "dispatcher", label: "Disposition", wage: 18000, icon: "Headset" },
  { id: "mechanic", label: "Mechanik", wage: 14000, icon: "Wrench" },
  { id: "cleaner", label: "Reinigung", wage: 6000, icon: "Sparkles" },
  { id: "accountant", label: "Buchhaltung", wage: 12000, icon: "Calculator" },
];

// Ausbildungsstatus-Labels
export function apprenticeshipStatusLabel(status) {
  const labels = {
    theory: { label: "Theoriephase", color: "text-sky-300", dot: "bg-sky-300" },
    practice: { label: "Praxisphase", color: "text-amber-300", dot: "bg-amber-300" },
    takeover_pending: { label: "Übernahme offen", color: "text-coral", dot: "bg-coral" },
    completed: { label: "Abgeschlossen", color: "text-lime", dot: "bg-lime" },
    cancelled: { label: "Abgebrochen", color: "text-muted-foreground", dot: "bg-muted-foreground" },
    expired: { label: "Verfallen", color: "text-red-300", dot: "bg-red-300" },
    released: { label: "Nicht übernommen", color: "text-muted-foreground", dot: "bg-muted-foreground" },
  };
  return labels[status] || { label: status, color: "text-muted-foreground", dot: "bg-muted-foreground" };
}

// Einschreibungs-Status
export function enrollmentStatusLabel(status) {
  const labels = {
    reserved: { label: "Vorgemerkt", color: "text-sky-300", dot: "bg-sky-300" },
    in_progress: { label: "Laufend", color: "text-amber-300", dot: "bg-amber-300" },
    completed: { label: "Abgeschlossen", color: "text-lime", dot: "bg-lime" },
    cancelled: { label: "Storniert", color: "text-muted-foreground", dot: "bg-muted-foreground" },
  };
  return labels[status] || { label: status, color: "text-muted-foreground", dot: "bg-muted-foreground" };
}

// Konstanten für Anzeige
export const APPRENTICE_ADMISSION_FEE = 25000;
export const APPRENTICE_THEORY_FEE = 100000;
export const APPRENTICE_COMPLETION_FEE = 25000;
export const APPRENTICE_TRAINING_WAGE = 3000;
export const APPRENTICE_THEORY_HOURS = 80;
export const APPRENTICE_PRACTICE_HOURS = 80;
export const APPRENTICE_MIN_DAYS = 20;
export const PROVIDER_SLOTS = 10;
export const PROVIDER_CITY = "Hamburg";