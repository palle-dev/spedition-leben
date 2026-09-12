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
export const MAX_DUTY_MIN = 480; // 8 Stunden zusammenhängender Einsatz
export const REST_MIN = 720; // 12 Stunden Erholung
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

export const STANDARD_TRUCK = {
  type: "Standard-Lkw",
  capacityTons: 12,
  consumptionPer100km: 28,
  bookValueCents: 3000000
};

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
  accountant:         { id: "accountant",         label: "Buchhalter/Buchhalterin", hireFeeCents: 40000,  costPerDayCents: 12000, capacity: 0 },
};

// Dienstzeiten für nicht fahrende Mitarbeiter (08:00–16:00 Spielzeit)
export const SERVICE_START_MIN = 480;
export const SERVICE_END_MIN = 960;
export const SERVICE_INTERVAL_MIN = 60;

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