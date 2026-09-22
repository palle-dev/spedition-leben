// Client-side Filial-Daten für FERNWERK.
// Spiegelt gameRules.ts Konstanten und Stadt-Koordinaten für die Darstellung.

export const BRANCH_OPEN_FEE = 5000000; // 50.000 €
export const BRANCH_MIN_GAME_DAY = 3;
export const BRANCH_MIN_CAPITAL_RATIO = 2;
export const BRANCH_COST_PER_DAY = 10000; // 100 € in Cent
export const DRIVER_TRAVEL_COST_PER_KM = 15; // 0,15 €/km
export const DRIVER_TRAVEL_SPEED = 80; // km/h

// Stadt-Koordinaten [Längengrad, Breitengrad] für Karten-Positionierung
import { CITY_LATLON } from "./simulation/dachGeography.ts";
export { CITY_LATLON };

export const ALL_CITIES = Object.keys(CITY_LATLON);

// Deutschland Bounding-Box für Projektion auf x/y-Prozent
const BOUNDS = { minLng: 5.5, maxLng: 17.5, minLat: 45.5, maxLat: 55.1 };

export function projectCity(city) {
  const coords = CITY_LATLON[city];
  if (!coords) return null;
  const [lng, lat] = coords;
  const x = ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 100;
  const y = ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { x, y };
}

export function formatEuro(cents) {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}