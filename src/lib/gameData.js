// Clientseitige statische Spieldaten für "Spedition & Leben".
// (Die verbindlichen Werte liegen serverseitig in base44/shared/gameRules.ts;
// dies ist die ungefähre Spiegelung für Darstellung und Dispositionsplanung in der UI.)

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

export const AVG_SPEED = 60;
export const LOAD_MIN = 60;
export const UNLOAD_MIN = 60;
export const MAX_DUTY_MIN = 480;
export const FUEL_PRICE = 1.70;
export const TOLL_PER_KM = 0.20;
export function driveMinutes(km) { return Math.ceil((km / AVG_SPEED) * 60); }
export function fuelEur(km, consumption) { return Math.round(km * consumption / 100 * FUEL_PRICE * 100) / 100; }
export function tollEur(km) { return Math.round(km * TOLL_PER_KM * 100) / 100; }

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