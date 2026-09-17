// Clientseitige statische Spieldaten für "Spedition & Leben".
// (Die verbindlichen Werte liegen serverseitig in base44/shared/gameRules.ts;
// dies ist die ungefähre Spiegelung für Darstellung und Dispositionsplanung in der UI.)

// 30 Städte – deckt ganz Deutschland ab (Spiegel von base44/shared/gameRules.ts).
export const CITIES = [
  "Hamburg", "Bremen", "Kiel", "Lübeck", "Hannover", "Berlin", "Rostock", "Magdeburg",
  "München", "Köln", "Düsseldorf", "Frankfurt", "Stuttgart", "Leipzig", "Dresden",
  "Nürnberg", "Dortmund", "Essen", "Mannheim", "Freiburg", "Braunschweig", "Erfurt",
  "Kassel", "Münster", "Osnabrück", "Saarbrücken", "Regensburg", "Würzburg",
  "Bielefeld", "Ulm"
];

// Reale Koordinaten [Längengrad, Breitengrad] für Entfernungsberechnung und Karte.
export const CITY_LATLON = {
  Hamburg: [9.9937, 53.5511], Bremen: [8.8072, 53.0758], Kiel: [10.1394, 54.3233],
  Lübeck: [10.6866, 53.8697], Hannover: [9.7322, 52.3759], Berlin: [13.4050, 52.5200],
  Rostock: [12.0989, 54.0922], Magdeburg: [11.6276, 52.1205],
  München: [11.5820, 48.1351], Köln: [6.9603, 50.9375], Düsseldorf: [6.7760, 51.2217],
  Frankfurt: [8.6821, 50.1109], Stuttgart: [9.1829, 48.7758], Leipzig: [12.3878, 51.3438],
  Dresden: [13.7373, 51.0506], Nürnberg: [11.0775, 49.4539], Dortmund: [7.4653, 51.5136],
  Essen: [7.0127, 51.4556], Mannheim: [8.4914, 49.4891], Freiburg: [7.8491, 47.9990],
  Braunschweig: [10.5276, 52.2688], Erfurt: [11.0290, 50.9847], Kassel: [9.4797, 51.3128],
  Münster: [7.6261, 51.9607], Osnabrück: [8.0472, 52.2790], Saarbrücken: [7.0019, 49.2354],
  Regensburg: [12.1016, 49.0175], Würzburg: [9.9296, 49.7924], Bielefeld: [8.5285, 52.0300],
  Ulm: [9.9900, 48.4011]
};

// Kompatibilität: älterer Code referenziert CITY_COORDS.
export const CITY_COORDS = CITY_LATLON;

// Straßenfaktor: Haversine-Luftlinie × 1,2 approximiert Straßenentfernung.
const ROAD_FACTOR = 1.2;

function haversineKm(a, b) {
  const [lng1, lat1] = a, [lng2, lat2] = b;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const sLat = Math.sin(dLat / 2), sLng = Math.sin(dLng / 2);
  const h = sLat * sLat + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * sLng * sLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function getDistance(a, b) {
  if (a === b) return 0;
  const c1 = CITY_LATLON[a], c2 = CITY_LATLON[b];
  if (!c1 || !c2) return 0;
  return Math.round(haversineKm(c1, c2) * ROAD_FACTOR / 5) * 5;
}

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
export const VEHICLE_CATALOG = {
  regional: {
    id: "regional",
    label: "Regional-Lkw",
    capacityTons: 8,
    consumptionPer100km: 22,
    priceCents: 1800000,
    maintenanceCostCents: 120000,
    maintenanceDurationMin: 360,
    referencePriceCents: 1800000,
    description: "Wendiger Lkw für regionale Verteilerverkehre. Geringer Verbrauch, geringere Wartungskosten.",
    suitableFor: ["normal", "express"],
  },
  standard: {
    id: "standard",
    label: "Standard-Lkw",
    capacityTons: 12,
    consumptionPer100km: 28,
    priceCents: 3000000,
    maintenanceCostCents: 150000,
    maintenanceDurationMin: 480,
    referencePriceCents: 3000000,
    description: "Vielseitiger Lkw für mittlere bis lange Strecken. Ausgewogenes Verhältnis von Kapazität und Kosten.",
    suitableFor: ["normal", "express", "heavy"],
  },
  heavy: {
    id: "heavy",
    label: "Schwerer Fernverkehrs-Lkw",
    capacityTons: 24,
    consumptionPer100km: 35,
    priceCents: 5500000,
    maintenanceCostCents: 220000,
    maintenanceDurationMin: 600,
    referencePriceCents: 5500000,
    description: "Großer Lkw für schwere Ladungen und lange Fernverkehrsstrecken. Hohe Nutzlast bei höheren Kosten.",
    suitableFor: ["normal", "express", "heavy"],
  },
};
export const VEHICLE_CATALOG_LIST = [
  VEHICLE_CATALOG.regional,
  VEHICLE_CATALOG.standard,
  VEHICLE_CATALOG.heavy,
];
export function getVehicleProfile(vehicle) {
  if (!vehicle) return VEHICLE_CATALOG.standard;
  if (vehicle.catalogId && VEHICLE_CATALOG[vehicle.catalogId]) return VEHICLE_CATALOG[vehicle.catalogId];
  if (vehicle.type === "Regional-Lkw") return VEHICLE_CATALOG.regional;
  if (vehicle.type === "Schwerer Fernverkehrs-Lkw") return VEHICLE_CATALOG.heavy;
  return VEHICLE_CATALOG.standard;
}

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