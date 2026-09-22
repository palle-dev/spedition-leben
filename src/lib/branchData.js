// Client-side Filial-Daten für FERNWERK.
// Spiegelt gameRules.ts Konstanten und Stadt-Koordinaten für die Darstellung.

export const BRANCH_OPEN_FEE = 5000000; // 50.000 €
export const BRANCH_MIN_GAME_DAY = 3;
export const BRANCH_MIN_CAPITAL_RATIO = 2;
export const BRANCH_COST_PER_DAY = 10000; // 100 € in Cent
export const DRIVER_TRAVEL_COST_PER_KM = 15; // 0,15 €/km
export const DRIVER_TRAVEL_SPEED = 80; // km/h

// Stadt-Koordinaten [Längengrad, Breitengrad] für Karten-Positionierung
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

export const ALL_CITIES = Object.keys(CITY_LATLON);

// Deutschland Bounding-Box für Projektion auf x/y-Prozent
const BOUNDS = { minLng: 5.5, maxLng: 15.2, minLat: 47.2, maxLat: 55.1 };

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