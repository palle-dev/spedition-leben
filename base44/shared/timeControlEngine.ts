// Zeitsteuerungs-Engine für FERNWERK (Auftrag 20).
// Verwaltet den automatischen Spielzeitbetrieb mit serverseitiger Zeitautorität.
// Umrechnung: 2 echte Sekunden = 60 Spielminuten = 1 Spielstunde.
// 1 echte Millisekunde = 3/100 Spielminuten = 3 Numerator-Einheiten (1/100 Spielminute).

export const NUMERATOR_PER_REAL_MS = 0.1;
export const NUMERATOR_PER_GAME_MINUTE = 100;
export const REAL_MS_PER_GAME_HOUR = 60000; // 1 Minute = 1 Spielstunde
export const REAL_MS_PER_GAME_DAY = 1440000; // 24 Minuten = 1 Spieltag

// Berechnet das Ziel-Numerator (1/100 Spielminute) aus dem Echtzeitanker.
// Bei deaktivierter Automatik gilt ausschließlich das eingefrorene Endziel.
export function computeTargetNumerator(tc, serverNowMs) {
  if (!tc) return 0;
  if (!tc.enabled) return tc.frozenGameNumerator || 0;
  const anchorReal = tc.anchorRealMs || 0;
  const elapsed = Math.max(0, serverNowMs - anchorReal);
  return (tc.anchorGameNumerator || 0) + NUMERATOR_PER_REAL_MS * elapsed;
}

// Berechnet die Ziel-Spielminute (ganzzahlig).
export function computeTargetGameMinute(tc, serverNowMs) {
  return Math.floor(computeTargetNumerator(tc, serverNowMs) / NUMERATOR_PER_GAME_MINUTE);
}

// Berechnet den exakten Numerator für eine bestimmte Spielminute.
export function gameMinuteToNumerator(min) {
  return min * NUMERATOR_PER_GAME_MINUTE;
}

// Prüft, ob ein Claim abgelaufen ist.
export function isClaimExpired(tc, serverNowMs) {
  if (!tc?.claim) return true;
  return (tc.claim.expiresAt || 0) < serverNowMs;
}

// Migration: bestehende Spielstände erhalten Automatik AUS.
// Kein Interpretieren des alten updated_at als Beginn einer eingeschalteten Uhr.
export function migrateTimeControl(state) {
  if (!state.timeControl) {
    const gm = state.gameTime || 0;
    state.timeControl = {
      enabled: false,
      clockVersion: 1,
      anchorRealMs: null,
      anchorGameNumerator: gm * NUMERATOR_PER_GAME_MINUTE,
      processedGameMinute: gm,
      frozenGameNumerator: gm * NUMERATOR_PER_GAME_MINUTE,
      lastCommittedRealMs: 0,
      claim: { owner: null, expiresAt: 0, generation: 0 },
      pauseReason: null,
      lastSeenGameMin: gm,
    };
  } else {
    const tc = state.timeControl;
    if (tc.claim === undefined) tc.claim = { owner: null, expiresAt: 0, generation: 0 };
    if (tc.clockVersion === undefined) tc.clockVersion = 1;
    if (tc.lastSeenGameMin === undefined) tc.lastSeenGameMin = state.gameTime || 0;
    if (tc.processedGameMinute === undefined) tc.processedGameMinute = state.gameTime || 0;
    if (tc.frozenGameNumerator === undefined) tc.frozenGameNumerator = (state.gameTime || 0) * NUMERATOR_PER_GAME_MINUTE;
    if (tc.anchorGameNumerator === undefined) tc.anchorGameNumerator = (state.gameTime || 0) * NUMERATOR_PER_GAME_MINUTE;
  }
}

// Aktiviert die Zeitautomatik: setzt den Anker auf die aktuelle Spielposition.
// Verwendet immer state.gameTime (nicht processedGameMinute), da manuelle
// Zeitfortschritte (advanceTime, advanceToNextEvent) gameTime aktualisieren,
// aber processedGameMinute nicht synchronisieren — sonst springt die Zeit zurück.
export function enableAutomation(state, serverNowMs) {
  const tc = state.timeControl;
  const currentMin = state.gameTime || 0;
  tc.anchorRealMs = serverNowMs;
  tc.anchorGameNumerator = currentMin * NUMERATOR_PER_GAME_MINUTE;
  tc.processedGameMinute = currentMin;
  tc.enabled = true;
  tc.clockVersion = (tc.clockVersion || 1) + 1;
  tc.pauseReason = null;
  tc.frozenGameNumerator = 0;
  return tc;
}

// Pausiert die Zeitautomatik: friert das Ziel zum Pausenzeitpunkt ein.
export function pauseAutomation(state, serverNowMs, reason) {
  const tc = state.timeControl;
  const targetNum = computeTargetNumerator(tc, serverNowMs);
  tc.frozenGameNumerator = targetNum;
  tc.enabled = false;
  tc.clockVersion = (tc.clockVersion || 1) + 1;
  tc.pauseReason = reason || "user";
  return { tc, targetNumerator: targetNum };
}

// Synchronisiert den Spielzustand: verarbeitet Ereignisse bis zum Ziel.
// Gibt die verarbeiteten Ereignisse und die neue Spielminute zurück.
export function syncToTarget(state, serverNowMs, advanceFn) {
  const tc = state.timeControl;
  const targetMin = computeTargetGameMinute(tc, serverNowMs);
  const log = [];
  if (targetMin > tc.processedGameMinute) {
    state.gameTime = tc.processedGameMinute;
    advanceFn(state, targetMin, log);
  }
  tc.processedGameMinute = state.gameTime;
  tc.lastCommittedRealMs = serverNowMs;
  return { log, targetMin, gameTime: state.gameTime };
}