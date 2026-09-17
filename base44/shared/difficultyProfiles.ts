// Schwierigkeitsprofile für FERNWERK.
// Zentralisiert wirtschaftliche Parameter, die die Spielbalance steuern:
// Startkapital, Auftragsfristen (Zeitpuffer) und Störungswahrscheinlichkeit.
// Hilfestellungen sind separat in helpSettings.ts konfiguriert und unabhängig.

// ---------- Profile ----------
export const DIFFICULTY_PROFILES = [
  {
    id: "relaxed",
    label: "Entspannt",
    description: "Mehr Startkapital, großzügige Lieferfristen, seltene Störungen. Ideal zum Entdecken und Ausprobieren.",
    startCapitalCents: 12_000_000,     // 120.000 €
    privateCapitalCents: 10_000_000,   // 10.000 €
    bufferHoursFactor: 1.5,            // 50% mehr Zeitpuffer bei Lieferfristen
    disruptionRateFactor: 0.5,         // Halbierte Störungswahrscheinlichkeit
  },
  {
    id: "standard",
    label: "Standard",
    description: "Ausgewogene Herausforderung für erfahrene Spieler. Das klassische FERNWERK-Erlebnis.",
    startCapitalCents: 7_500_000,      // 75.000 €
    privateCapitalCents: 7_500_000,    // 7.500 €
    bufferHoursFactor: 1.0,            // Standard-Zeitpuffer
    disruptionRateFactor: 1.0,         // Standard-Störungen
  },
  {
    id: "demanding",
    label: "Anspruchsvoll",
    description: "Knappes Kapital, enge Lieferfristen, häufige Störungen. Für Spieler, die eine echte Herausforderung suchen.",
    startCapitalCents: 5_000_000,      // 50.000 €
    privateCapitalCents: 5_000_000,    // 5.000 €
    bufferHoursFactor: 0.6,            // 40% weniger Zeitpuffer
    disruptionRateFactor: 1.6,         // 60% mehr Störungen
  },
];

export const DEFAULT_PROFILE_ID = "standard";

export function getProfileById(id) {
  return DIFFICULTY_PROFILES.find(p => p.id === id) || DIFFICULTY_PROFILES.find(p => p.id === DEFAULT_PROFILE_ID);
}

// ---------- Effektive Parameter aus dem Spielstand ----------
// Liefert die Profil-Parameter, die zur Laufzeit gelten. Bei älteren
// Spielständen ohne Profil wird "standard" angenommen.
export function getEffectiveParams(state) {
  const id = state?.difficulty?.profileId || DEFAULT_PROFILE_ID;
  return getProfileById(id);
}

// ---------- Puffer-Stunden für Lieferfristen anpassen ----------
// Multipliziert das [min, max] Paar der Puffer-Stunden mit dem Profil-Faktor.
// Garantiert ein Minimum von 0 — ein Profil kann die Lieferfrist nie unter
// die reine Transportdauer drücken (die Puffer sind zusätzlich).
export function applyBufferHoursFactor(bufferHours, params) {
  const f = params?.bufferHoursFactor ?? 1.0;
  return [
    Math.max(0, bufferHours[0] * f),
    Math.max(0, bufferHours[1] * f),
  ];
}

// ---------- Störungswahrscheinlichkeit anpassen ----------
// Multipliziert die Basis-Rate mit dem Profil-Faktor.
export function applyDisruptionRate(baseRate, params) {
  const f = params?.disruptionRateFactor ?? 1.0;
  return baseRate * f;
}

// ---------- Profil bei Spielstart anwenden ----------
// Speichert das Profil im Spielstand und setzt die Startkapitalien.
// Wird NUR bei der SpielErstellung aufgerufen — bestehende Spielstände
// behalten ihr ursprüngliches Profil.
export function applyProfileAtCreation(state, profileId) {
  const profile = getProfileById(profileId);
  state.difficulty = {
    profileId: profile.id,
    profileLabel: profile.label,
    appliedAtMin: state.gameTime,
  };
  // Startkapitalien werden durch die Eröffnungsbuchung gesetzt;
  // die Werte hier dienen als Referenz für die Buchhaltung.
  state._startCapitalCents = profile.startCapitalCents;
  state._privateStartCapitalCents = profile.privateCapitalCents;
  return profile;
}

// ---------- Migration für bestehende Spielstände ----------
// Ältere Spielstände ohne difficulty-Objekt erhalten das Standard-Profil,
// aber OHNE rückwirkende Kapitaländerung — nur die laufenden Parameter
// (Puffer, Störungen) gelten für die Zukunft.
export function migrateDifficulty(state) {
  if (!state.difficulty) {
    state.difficulty = {
      profileId: DEFAULT_PROFILE_ID,
      profileLabel: getProfileById(DEFAULT_PROFILE_ID).label,
      appliedAtMin: state.gameTime || 0,
      migrated: true,
    };
  }
}