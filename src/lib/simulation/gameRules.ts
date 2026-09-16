// Statische Spielweltdaten und reine Berechnungsregeln für "Spedition & Leben".
// Diese Werte sind vereinfachte, veränderbare Spielwerte – keine Abbildung realer Preise oder Vorschriften.

// 30 Städte – deckt ganz Deutschland ab (Nord, Süd, West, Ost, Mitte).
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
  Dresden: [13.7373, 51.0504], Nürnberg: [11.0775, 49.4539], Dortmund: [7.4653, 51.5136],
  Essen: [7.0127, 51.4556], Mannheim: [8.4914, 49.4891], Freiburg: [7.8491, 47.9990],
  Braunschweig: [10.5276, 52.2688], Erfurt: [11.0290, 50.9847], Kassel: [9.4797, 51.3128],
  Münster: [7.6261, 51.9607], Osnabrück: [8.0472, 52.2790], Saarbrücken: [7.0019, 49.2354],
  Regensburg: [12.1016, 49.0175], Würzburg: [9.9296, 49.7924], Bielefeld: [8.5285, 52.0302],
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

// Spielkonstanten (Cent-basiert für Geld).
export const FUEL_PRICE = 1.70; // €/Liter
export const TOLL_PER_KM = 0.20; // €
export const AVG_SPEED = 60; // km/h
export const LOAD_MIN = 60;
export const UNLOAD_MIN = 60;
// Alte pauschale Grenze pro Einzelauftrag — DURCH REGELÄNDERUNG 16 ERSETZT.
// WORK_BUDGET_MIN gilt zwischen vollständigen Ruhezeiten, nicht pro Auftrag.
export const MAX_DUTY_MIN = 480; // Veraltet — nicht mehr als Ablehnungsgrund verwenden
export const REST_MIN = 720; // 12 Stunden vollständige Ruhezeit

// ---------- Einheitliches Fahrerzeitmodell (Regeländerung 16) ----------
export const WORK_BUDGET_MIN = 480;   // Arbeitsbudget zwischen vollständigen Ruhezeiten
export const DRIVE_BUDGET_MIN = 270;   // Lenkzeit seit qualifizierter Fahrpause/Ruhe
export const BREAK_MIN = 45;            // Kurze Fahrpause (setzt Lenkzeit zurück)
export const DRIVER_COST_PER_DAY = 10000; // Cent
export const BRANCH_COST_PER_DAY = 10000; // Cent
export const PRIVATE_WITHDRAWAL_PER_DAY = 10000; // Cent
export const PRIVATE_LIVING_PER_DAY = 3000; // Cent
export const VEHICLE_PRICE = 3000000; // Cent
export const HIRE_FEE = 50000; // Cent
export const MAINTENANCE_COST = 150000; // Cent
export const MAINTENANCE_DURATION = 480; // Minuten
export const INVITATION_COST = 6000; // Cent
export const STRESS_MAINT_THRESHOLD = 80;
export const MAINT_STRESS_FACTOR = 1.25;

// ---------- Filialverwaltung ----------
export const BRANCH_OPEN_FEE = 5000000; // 50.000 € Eröffnungsgebühr
export const BRANCH_MIN_GAME_DAY = 3; // Mindest-Spieltag vor Eröffnung
export const BRANCH_MIN_CAPITAL_RATIO = 2; // Firmenkonto muss >= 2× Gebühr sein
export const DRIVER_TRAVEL_COST_PER_KM = 15; // 0,15 €/km Bahn/Bus-Ticket (Cent)
export const DRIVER_TRAVEL_SPEED = 80; // km/h durchschnittliche Reisegeschwindigkeit

// Kündigungsfrist (Auftrag 18): 7 Spieltage = 10.080 Minuten
export const NOTICE_PERIOD_MIN = 10080;

export const STANDARD_TRUCK = {
  type: "Standard-Lkw",
  capacityTons: 12,
  consumptionPer100km: 28,
  bookValueCents: 3000000
};

// Referenz-Neupreis für die Marktwertberechnung (Auftrag 21).
export const VEHICLE_REFERENCE_PRICE = 3000000; // 30.000 €

// ---------- Fahrzeugkatalog (Fahrzeugprofile) ----------
// Drei normale Fahrzeugprofile mit unterschiedlichen Kapazitäten, Anschaffungskosten
// und Verbrauchswerten. Die Wahl hängt von Aufträgen, Geschäftsmodell und finanziellen
// Möglichkeiten ab. Geschwindigkeit und Fahrerzeitregeln bleiben für alle Typen gleich.
export const VEHICLE_CATALOG = {
  regional: {
    id: "regional",
    label: "Regional-Lkw",
    capacityTons: 8,
    priceCents: 1800000,          // 18.000 €
    consumptionPer100km: 22,       // geringerer Verbrauch
    maintenanceCostCents: 120000,  // 1.200 € (geringere Wartungskosten)
    maintenanceDurationMin: 360,  // 6 h (kürzere Wartung)
    referencePriceCents: 1800000,
    description: "Kompakter Lkw für regionale Transporte. Günstige Anschaffung und niedriger Verbrauch.",
    suitableFor: ["regional", "normal"],
  },
  standard: {
    id: "standard",
    label: "Standard-Lkw",
    capacityTons: 12,
    priceCents: 3000000,           // 30.000 € (wie bisher)
    consumptionPer100km: 28,
    maintenanceCostCents: 150000,  // 1.500 € (wie bisher)
    maintenanceDurationMin: 480,   // 8 h (wie bisher)
    referencePriceCents: 3000000,
    description: "Universeller Lkw für mittlere bis lange Strecken. Ausgewogenes Verhältnis von Kapazität und Kosten.",
    suitableFor: ["regional", "normal", "express"],
  },
  heavy: {
    id: "heavy",
    label: "Schwerer Fernverkehrs-Lkw",
    capacityTons: 24,
    priceCents: 5500000,            // 55.000 €
    consumptionPer100km: 35,        // höherer Verbrauch
    maintenanceCostCents: 220000,   // 2.200 € (höhere Wartungskosten)
    maintenanceDurationMin: 600,   // 10 h (längere Wartung)
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
  // Bestimmung über catalogId (neue Fahrzeuge) oder Rückwärtskompatibel über type
  if (vehicle.catalogId && VEHICLE_CATALOG[vehicle.catalogId]) return VEHICLE_CATALOG[vehicle.catalogId];
  if (vehicle.type === "Regional-Lkw") return VEHICLE_CATALOG.regional;
  if (vehicle.type === "Schwerer Fernverkehrs-Lkw") return VEHICLE_CATALOG.heavy;
  // Standard-Lkw und alle älteren Fahrzeuge (inkl. Miet-Lkw, Leasing, Tank) → Standard
  return VEHICLE_CATALOG.standard;
}

// ---------- Marktwertfunktion (Auftrag 21) ----------
// R = gespeicherter Referenz-Neupreis des Modells.
// A = seit Inbetriebnahme verstrichene Spielmonate (kontinuierlich, 1 Monat = 30 Tage = 43200 Min).
// K = tatsächliche Kilometer.
// C = technischer Zustand 0–100.
// Altersfaktor     = max(0,25; 1 − 0,0125 × A)
// Kilometerfaktor  = max(0,40; 1 − K / 1.000.000)
// Zustandsfaktor   = 0,30 + 0,70 × C / 100
// Marktwert        = R × Altersfaktor × Kilometerfaktor × Zustandsfaktor
// Händler-Ankauf   = 90 % des Marktwerts.
// Alle Werte in Cent; abschließend runden.
export const MONTH_MIN = 43200; // 30 Tage × 1440 Min

export function computeMarketValue(vehicle, atMin) {
  const R = vehicle.referencePriceCents || VEHICLE_REFERENCE_PRICE;
  const acquiredAt = vehicle.acquiredAtMin || 0;
  const A = Math.max(0, (atMin - acquiredAt) / MONTH_MIN);
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

export const DRIVER_APPLICANT_POOL = [
  "Greta Möller", "Tobias Brandt", "Stefan Kloth", "Helena Voss", "Rüdiger Mai",
  "Anke Ruge", "Friedhelm Paasch", "Silke Quaas", "Manfred Brod", "Tanja Hennig",
  "Veit Karger", "Dorothee Saar"
];

// ---------- Personalrollen-Katalog ----------
// Alle Rollen sind von Beginn an einstellbar. Keine künstliche Freischaltung.
export const PERSONNEL_ROLES = {
  driver:             { id: "driver",             label: "Fahrer",                  hireFeeCents: 50000,  costPerDayCents: 10000, capacity: 0 },
  dispatcher:         { id: "dispatcher",         label: "Disponent",               hireFeeCents: 50000,  costPerDayCents: 18000, capacity: 6 },
  dispatcher_senior:  { id: "dispatcher_senior",  label: "Erfahrener Disponent",    hireFeeCents: 100000, costPerDayCents: 26000, capacity: 12 },
  cleaner:            { id: "cleaner",            label: "Reinigungskraft",         hireFeeCents: 15000,  costPerDayCents: 6000,  capacity: 4 },
  mechanic:           { id: "mechanic",           label: "Werkstattmitarbeiter",    hireFeeCents: 50000,  costPerDayCents: 14000, capacity: 1 },
  accountant:         { id: "accountant",         label: "Buchhalter/Buchhalterin",       hireFeeCents: 40000,  costPerDayCents: 12000, capacity: 40 },
  accountant_senior:  { id: "accountant_senior",  label: "Erfahrene Buchhaltungskraft",   hireFeeCents: 70000,  costPerDayCents: 19000, capacity: 80 },
  assistant:          { id: "assistant",          label: "Assistent der Geschäftsführung", hireFeeCents: 80000,  costPerDayCents: 22000, capacity: 0 },
  branch_manager:     { id: "branch_manager",     label: "Filialleiter",                    hireFeeCents: 120000, costPerDayCents: 35000, capacity: 0 },
};

// Dienstzeiten für nicht fahrende Mitarbeiter (Buchhaltung, Reinigung etc.)
// Disponenten nutzen eigene Schichten (siehe SHIFT_TEMPLATES).
export const SERVICE_START_MIN = 480;
export const SERVICE_END_MIN = 960;
export const SERVICE_INTERVAL_MIN = 15;

// Schicht-Vorlagen für Disponenten (8-Stunden-Schichten für 24/7-Betrieb)
export const SHIFT_TEMPLATES = [
  { id: "early",  label: "Frühschicht",  startMin: 360,  endMin: 840,  desc: "06:00–14:00 Uhr" },
  { id: "day",    label: "Tagschicht",   startMin: 480,  endMin: 960,  desc: "08:00–16:00 Uhr" },
  { id: "late",   label: "Spätschicht",  startMin: 840,  endMin: 1200, desc: "14:00–22:00 Uhr" },
  { id: "night",  label: "Nachtschicht", startMin: 1200, endMin: 360,  desc: "22:00–06:00 Uhr" },
];

// Bewerber-Namen-Pools pro Rolle (disjunkt von Fahrer-Pool)
export const APPLICANT_NAMES = {
  dispatcher:        ["Helena Voss", "Stefan Kloth", "Anke Ruge", "Silke Quaas"],
  dispatcher_senior: ["Rüdiger Mai", "Friedhelm Paasch"],
  cleaner:           ["Tanja Hennig", "Dorothee Saar"],
  mechanic:          ["Manfred Brod", "Veit Karger"],
  accountant:        ["Greta Möller", "Tobias Brandt"],
  assistant:         ["Lorenz Greif", "Christine Stahl"],
  branch_manager:    ["Max Becker", "Lena Walter", "Karl Herrmann", "Inge Keller"],
};

// Porträt-Katalog: 12 einheitliche Cartoon-Porträts.
// IDs p01–p12 werden beim Start zugeordnet und persistent gespeichert.
export const PORTRAIT_IDS = [
  "p01", "p02", "p03", "p04", "p05", "p06",
  "p07", "p08", "p09", "p10", "p11", "p12"
];

export const CARGO_TYPES = [
  "Stückgut", "Bauteile", "Lebensmittel", "Möbel", "Elektronik",
  "Verpackungsmaterial", "Maschinenteile", "Getränke", "Textilien", "Baustoffe"
];

export const CUSTOMER_NAMES = [
  "Hanse Handelskontor", "Norddeutsche Feinkost", "Ostsee Frischlief", "Hauptstadt-Express",
  "Elbe-Logistik", "Schleswig-Spedition", "Ostsee-Vertrieb", "Nordwind Transport",
  "Salzstein GmbH", "Müller & Söhne", "Weser Handel", "Havel-Spedition",
  "Alsterwerk", "Prien Paketdienst", "Eldena Export"
];

// ---------- Kundenprofile (Auftrag 19) ----------
// Stabile fiktive Unternehmen mit Versanddepots und bevorzugten Relationen.
// Ein Kundendepot muss am Abholort existieren; kein Kunde versendet aus jeder Stadt.
export const CUSTOMER_PROFILES = [
  { id: "c01", name: "Hanse Handelskontor", industry: "Handel", contact: "Frau Brandt",
    depots: ["Hamburg"],
    preferredRelations: [["Hamburg","Bremen"],["Hamburg","Hannover"],["Hamburg","Lübeck"]],
    cargoTypes: ["Stückgut","Verpackungsmaterial"] },
  { id: "c02", name: "Norddeutsche Feinkost", industry: "Lebensmittel", contact: "Herr Petersen",
    depots: ["Hamburg"],
    preferredRelations: [["Hamburg","Hannover"],["Hamburg","Berlin"],["Hamburg","Bremen"]],
    cargoTypes: ["Lebensmittel","Getränke"] },
  { id: "c03", name: "Ostsee Frischlief", industry: "Getränke", contact: "Frau Jansen",
    depots: ["Rostock","Kiel"],
    preferredRelations: [["Rostock","Hamburg"],["Kiel","Hamburg"],["Rostock","Lübeck"]],
    cargoTypes: ["Getränke","Lebensmittel"] },
  { id: "c04", name: "Weser Handel", industry: "Möbel", contact: "Herr Meyer",
    depots: ["Bremen"],
    preferredRelations: [["Bremen","Hamburg"],["Bremen","Hannover"],["Bremen","Berlin"]],
    cargoTypes: ["Möbel","Stückgut"] },
  { id: "c05", name: "Hauptstadt-Express", industry: "Elektronik", contact: "Frau Schwarz",
    depots: ["Berlin"],
    preferredRelations: [["Berlin","Hamburg"],["Berlin","Hannover"],["Berlin","Magdeburg"]],
    cargoTypes: ["Elektronik","Stückgut"] },
  { id: "c06", name: "Ostsee-Vertrieb", industry: "Textilien", contact: "Herr Lange",
    depots: ["Rostock"],
    preferredRelations: [["Rostock","Hamburg"],["Rostock","Berlin"],["Rostock","Hannover"]],
    cargoTypes: ["Textilien","Verpackungsmaterial"] },
  { id: "c07", name: "Elbe-Logistik", industry: "Bauteile", contact: "Herr Wagner",
    depots: ["Hamburg","Magdeburg"],
    preferredRelations: [["Hamburg","Magdeburg"],["Magdeburg","Berlin"],["Hamburg","Berlin"]],
    cargoTypes: ["Bauteile","Baustoffe"] },
  { id: "c08", name: "Schleswig-Spedition", industry: "Verpackung", contact: "Frau Hansen",
    depots: ["Lübeck"],
    preferredRelations: [["Lübeck","Hamburg"],["Lübeck","Bremen"],["Lübeck","Kiel"]],
    cargoTypes: ["Verpackungsmaterial","Stückgut"] },
  { id: "c09", name: "Nordwind Transport", industry: "Baustoffe", contact: "Herr Storm",
    depots: ["Hannover","Braunschweig"],
    preferredRelations: [["Hannover","Hamburg"],["Hannover","Berlin"],["Hannover","Magdeburg"],["Braunschweig","Hannover"]],
    cargoTypes: ["Baustoffe","Bauteile"] },
  { id: "c10", name: "Salzstein GmbH", industry: "Stückgut", contact: "Frau Keller",
    depots: ["Magdeburg"],
    preferredRelations: [["Magdeburg","Hannover"],["Magdeburg","Berlin"],["Magdeburg","Hamburg"]],
    cargoTypes: ["Stückgut","Maschinenteile"] },
  { id: "c11", name: "Müller & Söhne", industry: "Maschinenteile", contact: "Herr Müller",
    depots: ["Hannover","Bremen"],
    preferredRelations: [["Hannover","Hamburg"],["Bremen","Berlin"],["Hannover","Magdeburg"]],
    cargoTypes: ["Maschinenteile","Bauteile"] },
  { id: "c12", name: "Havel-Spedition", industry: "Lebensmittel", contact: "Frau Weber",
    depots: ["Berlin"],
    preferredRelations: [["Berlin","Magdeburg"],["Berlin","Hamburg"],["Berlin","Hannover"]],
    cargoTypes: ["Lebensmittel","Getränke"] },
  { id: "c13", name: "Alsterwerk", industry: "Maschinenteile", contact: "Herr Becker",
    depots: ["Hamburg"],
    preferredRelations: [["Hamburg","Berlin"],["Hamburg","Kiel"],["Hamburg","Magdeburg"]],
    cargoTypes: ["Maschinenteile","Elektronik"] },
  { id: "c14", name: "Prien Paketdienst", industry: "Stückgut", contact: "Frau Stahl",
    depots: ["Lübeck","Kiel"],
    preferredRelations: [["Lübeck","Hamburg"],["Kiel","Bremen"],["Lübeck","Hannover"]],
    cargoTypes: ["Stückgut","Verpackungsmaterial"] },
  { id: "c15", name: "Eldena Export", industry: "Getränke", contact: "Herr Greif",
    depots: ["Rostock"],
    preferredRelations: [["Rostock","Lübeck"],["Rostock","Hannover"],["Rostock","Berlin"]],
    cargoTypes: ["Getränke","Lebensmittel"] },
  // Neue Kunden für Süd-, West- und Mitteldeutschland (Auftrag 34: Städte-Erweiterung)
  { id: "c16", name: "Bayern Logistik", industry: "Stückgut", contact: "Frau Steinberger",
    depots: ["München"],
    preferredRelations: [["München","Nürnberg"],["München","Stuttgart"],["München","Regensburg"],["München","Hamburg"]],
    cargoTypes: ["Stückgut","Elektronik"] },
  { id: "c17", name: "Rheinland Transport", industry: "Handel", contact: "Herr Becker",
    depots: ["Köln","Düsseldorf"],
    preferredRelations: [["Köln","Düsseldorf"],["Köln","Dortmund"],["Köln","Frankfurt"],["Düsseldorf","Essen"],["Köln","Hamburg"]],
    cargoTypes: ["Stückgut","Verpackungsmaterial"] },
  { id: "c18", name: "Main-Spedition", industry: "Finanz & Technik", contact: "Frau Hartmann",
    depots: ["Frankfurt","Würzburg"],
    preferredRelations: [["Frankfurt","Mannheim"],["Frankfurt","Würzburg"],["Frankfurt","Kassel"],["Würzburg","Nürnberg"],["Frankfurt","Berlin"]],
    cargoTypes: ["Elektronik","Stückgut"] },
  { id: "c19", name: "Schwaben-Express", industry: "Maschinenteile", contact: "Herr Keller",
    depots: ["Stuttgart"],
    preferredRelations: [["Stuttgart","München"],["Stuttgart","Nürnberg"],["Stuttgart","Mannheim"],["Stuttgart","Frankfurt"]],
    cargoTypes: ["Maschinenteile","Bauteile"] },
  { id: "c20", name: "Sachsen-Fracht", industry: "Baustoffe", contact: "Frau Richter",
    depots: ["Leipzig"],
    preferredRelations: [["Leipzig","Dresden"],["Leipzig","Magdeburg"],["Leipzig","Erfurt"],["Leipzig","Hamburg"]],
    cargoTypes: ["Baustoffe","Stückgut"] },
  { id: "c21", name: "Elbsandstein Logistik", industry: "Möbel", contact: "Herr Wagner",
    depots: ["Dresden"],
    preferredRelations: [["Dresden","Berlin"],["Dresden","Leipzig"],["Dresden","Magdeburg"],["Dresden","Hannover"]],
    cargoTypes: ["Möbel","Stückgut"] },
  { id: "c22", name: "Franken-Vertrieb", industry: "Textilien", contact: "Frau Bauer",
    depots: ["Nürnberg"],
    preferredRelations: [["Nürnberg","München"],["Nürnberg","Frankfurt"],["Nürnberg","Stuttgart"],["Nürnberg","Würzburg"]],
    cargoTypes: ["Textilien","Stückgut"] },
  { id: "c23", name: "Ruhr-Express", industry: "Bauteile", contact: "Herr Schmitz",
    depots: ["Essen","Dortmund"],
    preferredRelations: [["Essen","Düsseldorf"],["Dortmund","Köln"],["Essen","Münster"],["Dortmund","Hannover"]],
    cargoTypes: ["Bauteile","Maschinenteile"] },
  { id: "c24", name: "Rhein-Neckar Transport", industry: "Lebensmittel", contact: "Frau Klein",
    depots: ["Mannheim"],
    preferredRelations: [["Mannheim","Frankfurt"],["Mannheim","Stuttgart"],["Mannheim","Freiburg"],["Mannheim","Köln"]],
    cargoTypes: ["Lebensmittel","Getränke"] },
  { id: "c25", name: "Schwarzwald-Spediteur", industry: "Möbel", contact: "Herr Braun",
    depots: ["Freiburg"],
    preferredRelations: [["Freiburg","Mannheim"],["Freiburg","Stuttgart"],["Freiburg","Frankfurt"],["Freiburg","Köln"]],
    cargoTypes: ["Möbel","Baustoffe"] },
  { id: "c26", name: "Ostwestfalen-Transport", industry: "Stückgut", contact: "Frau Meyer",
    depots: ["Bielefeld","Münster","Osnabrück"],
    preferredRelations: [["Bielefeld","Hannover"],["Bielefeld","Dortmund"],["Münster","Osnabrück"],["Osnabrück","Bremen"],["Bielefeld","Hamburg"]],
    cargoTypes: ["Stückgut","Verpackungsmaterial"] },
  { id: "c27", name: "Saar-Palatina Logistik", industry: "Stahl & Metall", contact: "Herr Klein",
    depots: ["Saarbrücken"],
    preferredRelations: [["Saarbrücken","Mannheim"],["Saarbrücken","Frankfurt"],["Saarbrücken","Stuttgart"],["Saarbrücken","Köln"]],
    cargoTypes: ["Bauteile","Maschinenteile"] },
  { id: "c28", name: "Donau-Transport", industry: "Getränke", contact: "Frau Fischer",
    depots: ["Regensburg","Ulm"],
    preferredRelations: [["Regensburg","München"],["Regensburg","Nürnberg"],["Ulm","Stuttgart"],["Ulm","München"]],
    cargoTypes: ["Getränke","Lebensmittel"] },
  { id: "c29", name: "Thüringen-Express", industry: "Elektronik", contact: "Herr Schmidt",
    depots: ["Erfurt"],
    preferredRelations: [["Erfurt","Leipzig"],["Erfurt","Kassel"],["Erfurt","Frankfurt"],["Erfurt","Hannover"]],
    cargoTypes: ["Elektronik","Stückgut"] },
  { id: "c30", name: "Nordhessen-Fracht", industry: "Verpackung", contact: "Frau Wolf",
    depots: ["Kassel"],
    preferredRelations: [["Kassel","Frankfurt"],["Kassel","Hannover"],["Kassel","Erfurt"],["Kassel","Dortmund"]],
    cargoTypes: ["Verpackungsmaterial","Stückgut"] },
];

// ---------- Marktkonstanten (Auftrag 19) ----------
export const MARKET_VERSION = 2;
export const MARKET_WAVE_INTERVAL = 60; // Minuten: jede volle Stunde

// Preisformel: Grundpreis = 125 € + 2,10 € × km + 6 € × Tonnen
export const PRICE_BASE_CENTS = 12500;
export const PRICE_PER_KM_CENTS = 210;
export const PRICE_PER_TON_CENTS = 600;
export const EXPRESS_FACTOR = 1.25;
export const RELATION_FACTOR_MIN = 0.90;
export const RELATION_FACTOR_MAX = 1.10;

// Annahmefristen in Stunden
export const NORMAL_ACCEPT_HOURS = [6, 12];
export const EXPRESS_ACCEPT_HOURS = [1, 3];
export const ADVANCE_ACCEPT_HOURS = [12, 24];

// Lieferpuffer in Stunden
export const NORMAL_BUFFER_HOURS = [2, 6];
export const EXPRESS_BUFFER_HOURS = [0.5, 1];

// Zahlungsziele in Spieltagen
export const PAYMENT_TERMS_DAYS = [0, 3, 7];

// Mindestens fünf eigene Vorlagen für wiederkehrende private Einladungen.
export const INVITATION_TEMPLATES = [
  { id: "t1", text: "Mara lädt dich zu einem gemeinsamen Abendessen ein. Sie hat extra deinen Lieblingstisch reserviert." },
  { id: "t2", text: "Mara möchte am Hafen mit dir spazieren gehen und danach ein Glas Wein trinken." },
  { id: "t3", text: "Ein alter Freund ist überraschend in der Stadt und lädt dich auf einen Kaffee ein." },
  { id: "t4", text: "Mara schlägt vor, heute Abend zusammen zu kochen und es euch gemütlich zu machen." },
  { id: "t5", text: "Die Nachbarn feiern ein kleines Fest und haben euch herzlich eingeladen." },
  { id: "t6", text: "Mara möchte einen gemeinsamen Filmabend verbringen – Popcorn ist schon besorgt." }
];

// Zeitformatierung (unabhängig von Zeitzonen/Sommerzeit).
export function dayOf(min) { return Math.floor(min / 1440) + 1; }
export function clockOf(min) {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
}
export function formatGameTime(min) { return "Tag " + dayOf(min) + ", " + clockOf(min); }

export function roundCents(euro) { return Math.round(euro * 100); }
export function driveMinutes(km) { return Math.ceil((km / AVG_SPEED) * 60); }
export function fuelCents(km, consumptionPer100km) { return roundCents(km * consumptionPer100km / 100 * FUEL_PRICE); }
export function tollCents(km) { return roundCents(km * TOLL_PER_KM); }

// Mulberry32 – deterministischer PRNG für reproduzierbare Zufallsergebnisse.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}