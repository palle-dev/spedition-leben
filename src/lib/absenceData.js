// Frontend-Konstanten und Helfer für Abwesenheiten und Dienstleistungen (Auftrag 25).
// Spiegel von base44/shared/absenceEngine.ts und serviceEngine.ts für die Darstellung.

export const VACATION_START_DAYS = 3;
export const VACATION_ACCRUAL_INTERVAL_DAYS = 10;
export const VACATION_MAX_UNUSED = 20;
export const SICKNESS_MIN_DURATION = 1;
export const SICKNESS_MAX_DURATION = 3;
export const SICKNESS_COOLDOWN_DAYS = 5;

export const CLEANING_PRICE_PER_UNIT = 2500;
export const CLEANING_MAX_EFFECT = 35;
export const TOWING_BASE_CENTS = 20000;
export const TOWING_PER_KM_CENTS = 300;
export const TOWING_APPROACH_MIN = 60;
export const TOWING_SPEED = 40;
export const TOWING_HANDOVER_MIN = 30;
export const BLOCK_DURATION_MIN = 1440;

export const SERVICE_PROVIDERS = [
  { id: "sp_clean_01", name: "Nordclean GmbH", type: "cleaning", homeCity: "Hamburg", capacityPerDay: 8, pricePerUnitCents: 2500, description: "Reinigungsservice für Standorte" },
  { id: "sp_clean_02", name: "Frisch & Sauber KG", type: "cleaning", homeCity: "Bremen", capacityPerDay: 6, pricePerUnitCents: 2500, description: "Reinigungsservice für Standorte" },
  { id: "sp_maint_01", name: "Werkstatt Nord GmbH", type: "maintenance", homeCity: "Hamburg", capacityPerDay: 2, priceCents: 150000, durationMin: 480, description: "Standard-Wartung 8h, Zustand→100" },
  { id: "sp_maint_02", name: "Motor-Service Meyer", type: "maintenance", homeCity: "Hannover", capacityPerDay: 1, priceCents: 150000, durationMin: 480, description: "Standard-Wartung 8h, Zustand→100" },
  { id: "sp_tow_01", name: "Pannenhilfe Nord e.K.", type: "towing", homeCity: "Hamburg", capacityPerDay: 3, description: "Abschlepp- und Pannenhilfe" },
  { id: "sp_temp_d_01", name: "Fahrpersonal Leihwerk", type: "temp_driver", homeCity: "Hamburg", provisionCents: 15000, blockRateCents: 18000, minBlocks: 2, capacity: 3, description: "Befristete Fahrervertretung" },
  { id: "sp_temp_disp_01", name: "Dispo-Service Nord", type: "temp_dispatcher", homeCity: "Hamburg", provisionCents: 15000, blockRateCents: 26000, minBlocks: 2, capacity: 6, description: "Befristete Disponentenvertretung, Kapazität 6 Lkw" },
  { id: "sp_acct_01", name: "Buchhaltungsexpress GmbH", type: "external_accounting", homeCity: "Hamburg", dailyRateCents: 16000, capacityPerDay: 40, description: "Externe Buchhaltungsprüfung pro Spieltag" },
  { id: "sp_rental_01", name: "TruckMiet Nord", type: "rental_truck", homeCity: "Hamburg", handoverCents: 15000, blockRateCents: 12000, minBlocks: 2, capacity: 5, description: "Miet-Lkw, 150 € Übergabe + 120 €/24h" },
];

export const SERVICE_TYPE_LABELS = {
  cleaning: "Reinigung",
  maintenance: "Wartung",
  towing: "Abschleppen",
  temp_driver: "Fahrervertretung",
  temp_dispatcher: "Disponentenvertretung",
  external_accounting: "Externe Buchhaltung",
  rental_truck: "Mietfahrzeug",
};

export const SERVICE_TYPE_ICONS = {
  cleaning: "Sparkles",
  maintenance: "Wrench",
  towing: "Truck",
  temp_driver: "Users",
  temp_dispatcher: "Headset",
  external_accounting: "Calculator",
  rental_truck: "Truck",
};

export const ABSENCE_TYPE_LABELS = {
  vacation: "Urlaub",
  sickness: "Krankheit",
  termination: "Austritt",
  driver_rest: "Ruhezeit",
  substitution: "Vertretung",
};

export const ABSENCE_COLORS = {
  vacation: "lime",
  sickness: "coral",
  termination: "amber",
  driver_rest: "sky",
  substitution: "violet",
};

// Berechnet den Tagesbedarf für Reinigung am Frontend
export function computeCleaningNeedFront(personsAtCity) {
  return Math.max(1, Math.ceil(personsAtCity / 10));
}

// Alle Personen eines Standorts zählen
export function countPersonsAtCity(state, city) {
  let count = 0;
  for (const d of (state.drivers || [])) {
    if (d.locationCity === city && d.employmentStatus === "employed") count++;
  }
  for (const e of (state.employees || [])) {
    if (e.locationCity === city && e.employmentStatus === "employed") count++;
  }
  return count;
}