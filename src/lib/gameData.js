// Clientseitige statische Spieldaten für "Frachtfieber".
// (Die verbindlichen Werte liegen serverseitig in base44/shared/gameRules.ts;
// dies ist die ungefähre Spiegelung für Darstellung und Dispositionsplanung in der UI.)

import { CITIES, CITY_LATLON, getDistance } from "./simulation/dachGeography.ts";
export { CITIES, CITY_LATLON, getDistance };
export const CITY_COORDS=CITY_LATLON;

export const AVG_SPEED = 60;
export const LOAD_MIN = 60;
export const UNLOAD_MIN = 60;
export const MAX_DUTY_MIN = 480; // Veraltet — nicht mehr als Ablehnungsgrund
export const REST_MIN = 720; // 12 Stunden vollständige Ruhezeit
// Einheitliches Fahrerzeitmodell (Regeländerung 16)
export const WORK_BUDGET_MIN = 480;   // Arbeitsbudget zwischen vollständigen Ruhezeiten
export const DRIVE_BUDGET_MIN = 270;   // Lenkzeit seit qualifizierter Fahrpause/Ruhe
export const BREAK_MIN = 45;            // Kurze Fahrpause
export const FUEL_PRICE = 1.70;
export const TOLL_PER_KM = 0.20;
// Gespiegelte Spielwerte (Spiegel von base44/shared/gameRules.ts) für die Darstellung.
export const VEHICLE_PRICE_EUR = 30000;
export const VEHICLE_REFERENCE_PRICE = 3000000; // 30.000 € in Cent

// ---------- Fahrzeugkatalog (Spiegel von gameRules.ts) ----------
// Shared catalogue keeps purchase, lease, fleet and engine specifications identical.
export { VEHICLE_CATALOG, VEHICLE_CATALOG_LIST, getVehicleProfile } from "./simulation/gameRules.ts";

// ---------- Fahrzeug-Aufbauten (Spiegel von gameRules.ts) ----------
export const VEHICLE_BODY_TYPES = {
  planen: { id: "planen", label: "Planen", priceMultiplier: 1.0, maintenanceMultiplier: 1.0, consumptionAdd: 0, description: "Standard-Sattelzug mit Plane. Universell für Standardfracht einsetzbar." },
  kuehl: { id: "kuehl", label: "Kühlwagen", priceMultiplier: 1.15, maintenanceMultiplier: 1.20, consumptionAdd: 2, description: "Kühl- und Gefriertransporte. Höhere Wartungs- und Kraftstoffkosten durch Kühlaggregat." },
  tank: { id: "tank", label: "Tankwagen", priceMultiplier: 1.20, maintenanceMultiplier: 1.15, consumptionAdd: 1, description: "Flüssig- und Schüttguttransporte. Spezielle Pumpe und Tankausstattung." },
  kipper: { id: "kipper", label: "Kipper/Silo", priceMultiplier: 1.10, maintenanceMultiplier: 1.10, consumptionAdd: 1, description: "Schüttgut und Baustoffe. Hydraulische Kippeinrichtung für schnelles Entladen." },
};
export const VEHICLE_BODY_TYPE_LIST = [
  VEHICLE_BODY_TYPES.planen, VEHICLE_BODY_TYPES.kuehl, VEHICLE_BODY_TYPES.tank, VEHICLE_BODY_TYPES.kipper,
];
export function getVehicleBodyType(vehicle) {
  if (!vehicle) return VEHICLE_BODY_TYPES.planen;
  if (vehicle.bodyType && VEHICLE_BODY_TYPES[vehicle.bodyType]) return VEHICLE_BODY_TYPES[vehicle.bodyType];
  return VEHICLE_BODY_TYPES.planen;
}

// ---------- Cargo-Kategorien (Spiegel von gameRules.ts) ----------
// Bestimmt, welcher Aufbau für einen Auftrag erforderlich (strikt) oder
// bevorzugt (Bonus) ist.
export const CARGO_CATEGORIES = {
  standard: { id: "standard", label: "Standardfracht", requiredBodyType: null, bonusBodyType: null, bonusFactor: 1.0, priceFactor: 1.0 },
  kuehl: { id: "kuehl", label: "Kühlfracht", requiredBodyType: "kuehl", bonusBodyType: "kuehl", bonusFactor: 1.0, priceFactor: 1.20 },
  lebensmittel: { id: "lebensmittel", label: "Lebensmittel", requiredBodyType: null, bonusBodyType: "kuehl", bonusFactor: 1.15, priceFactor: 1.05 },
  fluessig: { id: "fluessig", label: "Flüssigtransport", requiredBodyType: "tank", bonusBodyType: "tank", bonusFactor: 1.0, priceFactor: 1.15 },
  getraenke: { id: "getraenke", label: "Getränke", requiredBodyType: null, bonusBodyType: "tank", bonusFactor: 1.10, priceFactor: 1.05 },
  schuettgut: { id: "schuettgut", label: "Schüttgut", requiredBodyType: "kipper", bonusBodyType: "kipper", bonusFactor: 1.0, priceFactor: 1.10 },
  baustoffe: { id: "baustoffe", label: "Baustoffe", requiredBodyType: null, bonusBodyType: "kipper", bonusFactor: 1.12, priceFactor: 1.05 },
};

export function getCargoCategory(order) {
  if (!order) return CARGO_CATEGORIES.standard;
  if (order.cargoCategory && CARGO_CATEGORIES[order.cargoCategory]) return CARGO_CATEGORIES[order.cargoCategory];
  return CARGO_CATEGORIES.standard;
}

// Prüft, ob ein Fahrzeug-Aufbau für einen Auftrag geeignet ist (clientseitig).
// Spiegel von gameRules.ts checkBodyTypeCompatibility.
export function checkBodyTypeCompatibility(order, vehicle) {
  const cat = getCargoCategory(order);
  if (!cat.requiredBodyType) return { ok: true };
  const body = getVehicleBodyType(vehicle);
  if (body.id !== cat.requiredBodyType) {
    return {
      ok: false,
      error: "Frachtart '" + cat.label + "' erfordert Aufbau '" +
        VEHICLE_BODY_TYPES[cat.requiredBodyType].label + "' — dieser Lkw hat '" + body.label + "'.",
    };
  }
  return { ok: true };
}
export const HIRE_FEE_EUR = 500;
export const DRIVER_COST_PER_DAY_EUR = 100;
export const BRANCH_COST_PER_DAY_EUR = 100;
export const MAINTENANCE_EUR = 1500;
export const PRIVATE_WITHDRAWAL_EUR = 100;
export const PRIVATE_LIVING_EUR = 30;

// ---------- Marktwertfunktion (Auftrag 21, Spiegel von gameRules.ts) ----------
const MONTH_MIN_VAL = 43200; // 30 Tage × 1440 Min

export function computeMarketValue(vehicle, atMin) {
  const R = vehicle.referencePriceCents || VEHICLE_REFERENCE_PRICE;
  const acquiredAt = vehicle.acquiredAtMin || 0;
  const A = Math.max(0, (atMin - acquiredAt) / MONTH_MIN_VAL);
  const K = vehicle.odometerKm || 0;
  const C = Math.max(0, Math.min(100, vehicle.condition || 0));
  const ageFactor = Math.max(0.25, 1 - 0.0125 * A);
  const kmFactor = Math.max(0.40, 1 - K / 1000000);
  const condFactor = 0.30 + 0.70 * C / 100;
  return Math.round(R * ageFactor * kmFactor * condFactor);
}

export function computeDealerOffer(vehicle, atMin) {
  return Math.round(computeMarketValue(vehicle, atMin) * 0.9);
}
export function driveMinutes(km) { return Math.ceil((km / AVG_SPEED) * 60); }
export function fuelEur(km, consumption) { return Math.round(km * consumption / 100 * FUEL_PRICE * 100) / 100; }
export function tollEur(km) { return Math.round(km * TOLL_PER_KM * 100) / 100; }

// Cent-basierte Berechnung (Spiegel von gameRules.ts für Tour-Engine).
export function roundCents(euro) { return Math.round(euro * 100); }
export function fuelCents(km, consumptionPer100km) { return roundCents(km * consumptionPer100km / 100 * FUEL_PRICE); }
export function tollCents(km) { return roundCents(km * TOLL_PER_KM); }

// Berechnet den Bonus-Faktor für eine Lieferung basierend auf Aufbau und Frachtart.
// 1.0 = kein Bonus; > 1.0 = Spezial-Lkw erhält Aufschlag. (Spiegel von gameRules.ts)
export function computeBodyBonusFactor(order, vehicle) {
  const cat = getCargoCategory(order);
  if (!cat.bonusBodyType) return 1.0;
  const body = getVehicleBodyType(vehicle);
  if (body.id === cat.bonusBodyType) return cat.bonusFactor;
  return 1.0;
}

export function dayOf(min) { return Math.floor(min / 1440) + 1; }
export function clockOf(min) {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
}
export function formatGameTime(min) { return "Tag " + dayOf(min) + ", " + clockOf(min); }

export function formatEuro(cents) {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}
export function euroSigned(cents) {
  const s = cents < 0 ? "-" : "+";
  return s + formatEuro(Math.abs(cents));
}

// ---------- Personalrollen (Spiegel von gameRules.ts) ----------
export const PERSONNEL_ROLES = {
  driver:             { id: "driver",             label: "Fahrer",                  hireFeeCents: 50000,  costPerDayCents: 10000, capacity: 0 },
  dispatcher:         { id: "dispatcher",         label: "Disponent",               hireFeeCents: 50000,  costPerDayCents: 18000, capacity: 6 },
  dispatcher_senior:  { id: "dispatcher_senior",  label: "Erfahrener Disponent",    hireFeeCents: 100000, costPerDayCents: 26000, capacity: 12 },
  cleaner:            { id: "cleaner",            label: "Reinigungskraft",         hireFeeCents: 15000,  costPerDayCents: 6000,  capacity: 4 },
  mechanic:           { id: "mechanic",           label: "Werkstattmitarbeiter",    hireFeeCents: 50000,  costPerDayCents: 14000, capacity: 1 },
  accountant:         { id: "accountant",         label: "Buchhalter/Buchhalterin",       hireFeeCents: 40000,  costPerDayCents: 12000, capacity: 40 },
  accountant_senior:  { id: "accountant_senior",  label: "Erfahrene Buchhaltungskraft",   hireFeeCents: 70000,  costPerDayCents: 19000, capacity: 80 },
  assistant:          { id: "assistant",          label: "Assistent der Geschäftsführung", hireFeeCents: 60000, costPerDayCents: 22000, capacity: 0 },
};

export const SERVICE_START_MIN = 480;
export const SERVICE_END_MIN = 960;
export const SERVICE_INTERVAL_MIN = 60;

export const ROLE_LABELS = {
  driver: "Fahrer",
  dispatcher: "Disponent",
  dispatcher_senior: "Erf. Disponent",
  cleaner: "Reinigung",
  mechanic: "Werkstatt",
  accountant: "Buchhaltung",
  accountant_senior: "Erf. Buchhaltung",
  assistant: "Geschäftsführung",
  branch_manager: "Filialleiter",
};

export const ROLE_ICONS = {
  driver: "Truck",
  dispatcher: "Headset",
  dispatcher_senior: "Headset",
  cleaner: "Sparkles",
  mechanic: "Wrench",
  accountant: "Calculator",
  accountant_senior: "Calculator",
  assistant: "Briefcase",
  branch_manager: "Building2",
};