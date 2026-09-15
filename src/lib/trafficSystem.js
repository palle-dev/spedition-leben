// Verkehrslage-System für FERNWERK.
// Deterministische Verkehrslage basierend auf Spielzeit und Route.
// Veränderung erfolgt stündlich (Spielzeit), konsistent über Renders.

export const TRAFFIC_LEVELS = [
  { id: 0, label: "Frei", color: "#4ADE80", delayPct: 0 },
  { id: 1, label: "Leicht", color: "#FBBF24", delayPct: 15 },
  { id: 2, label: "Dicht", color: "#FB923C", delayPct: 35 },
  { id: 3, label: "Stau", color: "#EF4444", delayPct: 70 },
];

// Stoßzeiten (Spielminuten)
const RUSH_MORNING_START = 7 * 60;
const RUSH_MORNING_END = 9 * 60;
const RUSH_AFTERNOON_START = 16 * 60;
const RUSH_AFTERNOON_END = 18 * 60;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Verkehrslage für ein Segment einer Route (fromCity -> toCity) zu einer Spielzeit.
// Der segmentIndex sorgt für Variation entlang der Strecke — so werden auf
// einer echten Straßenroute verschiedene Abschnitte unterschiedlich eingefärbt
// (z.B. Stau in der Stadt, frei auf der Autobahn).
// Deterministisch: gleiche Spielstunde + Route + Segment = gleiche Verkehrslage.
export function getSegmentTrafficLevel(gameTime, fromCity, toCity, segmentIndex, segmentCount) {
  const clock = gameTime % 1440;
  const isRush = (clock >= RUSH_MORNING_START && clock < RUSH_MORNING_END)
    || (clock >= RUSH_AFTERNOON_START && clock < RUSH_AFTERNOON_END);
  const isNight = clock >= 22 * 60 || clock < 5 * 60;

  const hourBucket = Math.floor(gameTime / 60);
  const routeHash = hashStr(`${fromCity}->${toCity}:${hourBucket}:${segmentIndex}/${segmentCount}`);

  if (isNight) {
    return routeHash % 10 < 1 ? 1 : 0;
  }
  if (isRush) {
    // In Stoßzeiten: mittlere Segmente (Stadt näher) eher dichter
    const isMiddle = segmentIndex > 0 && segmentIndex < segmentCount - 1;
    const r = routeHash % 10;
    if (isMiddle) {
      if (r < 1) return 1;
      if (r < 3) return 2;
      if (r < 6) return 3;
      return 2;
    }
    if (r < 1) return 0;
    if (r < 3) return 1;
    if (r < 6) return 2;
    return 3;
  }
  const r = routeHash % 10;
  if (r < 6) return 0;
  if (r < 9) return 1;
  return 2;
}

// Verkehrslage für eine Route (fromCity -> toCity) zu einer Spielzeit.
// Deterministisch: gleiche Spielstunde + Route = gleiche Verkehrslage.
export function getTrafficLevel(gameTime, fromCity, toCity) {
  const clock = gameTime % 1440;
  const isRush = (clock >= RUSH_MORNING_START && clock < RUSH_MORNING_END)
    || (clock >= RUSH_AFTERNOON_START && clock < RUSH_AFTERNOON_END);
  const isNight = clock >= 22 * 60 || clock < 5 * 60;

  const hourBucket = Math.floor(gameTime / 60);
  const routeHash = hashStr(`${fromCity}->${toCity}:${hourBucket}`);

  if (isNight) {
    return routeHash % 10 < 1 ? 1 : 0;
  }
  if (isRush) {
    const r = routeHash % 10;
    if (r < 1) return 0;
    if (r < 3) return 1;
    if (r < 6) return 2;
    return 3;
  }
  const r = routeHash % 10;
  if (r < 6) return 0;
  if (r < 9) return 1;
  return 2;
}

export function getTrafficInfo(level) {
  return TRAFFIC_LEVELS[level] || TRAFFIC_LEVELS[0];
}

export function getTrafficColor(gameTime, fromCity, toCity) {
  return getTrafficInfo(getTrafficLevel(gameTime, fromCity, toCity)).color;
}

// Verzögerungsfaktor für Reisezeit (1.0 = keine Verzögerung)
export function getTrafficDelayFactor(gameTime, fromCity, toCity) {
  const level = getTrafficLevel(gameTime, fromCity, toCity);
  return 1 + TRAFFIC_LEVELS[level].delayPct / 100;
}

// Zusammenfassung der Verkehrslage für alle aktiven Routen
export function getTrafficSummary(gameTime, trips) {
  let free = 0, light = 0, moderate = 0, heavy = 0;
  for (const trip of trips) {
    if (trip.status !== "in_progress") continue;
    const phases = trip.phases || trip.legs || [];
    const idx = trip.currentPhase !== undefined ? trip.currentPhase : trip.currentLeg;
    for (let i = 0; i < phases.length; i++) {
      const p = phases[i];
      const t = p.type;
      if (t !== "empty_drive" && t !== "loaded_drive" && t !== "empty" && t !== "drive") continue;
      const level = getTrafficLevel(gameTime, p.fromCity, p.toCity);
      if (level === 0) free++;
      else if (level === 1) light++;
      else if (level === 2) moderate++;
      else heavy++;
    }
  }
  return { free, light, moderate, heavy, total: free + light + moderate + heavy };
}