// Statische Spielweltdaten und reine Berechnungsregeln für "Spedition & Leben".
// Diese Werte sind vereinfachte, veränderbare Spielwerte – keine Abbildung realer Preise oder Vorschriften.

export const CITIES = ["Hamburg", "Bremen", "Kiel", "Lübeck", "Hannover", "Berlin", "Rostock", "Magdeburg"];

export const CITY_COORDS = {
  Hamburg: { x: 45, y: 50 },
  Bremen: { x: 25, y: 55 },
  Kiel: { x: 55, y: 25 },
  Lübeck: { x: 58, y: 40 },
  Hannover: { x: 30, y: 70 },
  Berlin: { x: 75, y: 65 },
  Rostock: { x: 62, y: 22 },
  Magdeburg: { x: 55, y: 70 }
};

// Feste, symmetrische Spielentfernungen in Kilometern (ungleiche Städtepaare, gleiche Stadt = 0).
const _D = [
  [0, 120, 95, 65, 150, 290, 190, 300],
  [120, 0, 200, 180, 100, 400, 250, 260],
  [95, 200, 0, 80, 240, 370, 210, 340],
  [65, 180, 80, 0, 210, 300, 160, 300],
  [150, 100, 240, 210, 0, 260, 290, 190],
  [290, 400, 370, 300, 260, 0, 230, 150],
  [190, 250, 210, 160, 290, 230, 0, 260],
  [300, 260, 340, 300, 190, 150, 260, 0]
];
export function getDistance(a, b) {
  const i = CITIES.indexOf(a), j = CITIES.indexOf(b);
  if (i < 0 || j < 0) return 0;
  return _D[i][j];
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
};

// Dienstzeiten für nicht fahrende Mitarbeiter (08:00–16:00 Spielzeit)
export const SERVICE_START_MIN = 480;
export const SERVICE_END_MIN = 960;
export const SERVICE_INTERVAL_MIN = 15;

// Bewerber-Namen-Pools pro Rolle (disjunkt von Fahrer-Pool)
export const APPLICANT_NAMES = {
  dispatcher:        ["Helena Voss", "Stefan Kloth", "Anke Ruge", "Silke Quaas"],
  dispatcher_senior: ["Rüdiger Mai", "Friedhelm Paasch"],
  cleaner:           ["Tanja Hennig", "Dorothee Saar"],
  mechanic:          ["Manfred Brod", "Veit Karger"],
  accountant:        ["Greta Möller", "Tobias Brandt"],
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
    depots: ["Hannover"],
    preferredRelations: [["Hannover","Hamburg"],["Hannover","Berlin"],["Hannover","Magdeburg"]],
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