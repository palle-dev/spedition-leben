import { LIVE_TICK_MS, LIVE_TICK_MINUTES, NUMERATOR_PER_GAME_MINUTE } from "./simulation/timeControlEngine";
// Presentation only: the engine still commits 15 game minutes every 2.5 seconds.
// Bound extrapolation to one pending tick so a slow worker cannot invent hours.
export function displayedGameMinute(gameTime, timeControl, nowMs, running) {
  if (!running || !timeControl?.enabled || !Number.isFinite(timeControl.anchorRealMs)) return gameTime;
  const elapsed = Math.max(0, nowMs - timeControl.anchorRealMs);
  const minute = Math.floor(timeControl.anchorGameNumerator / NUMERATOR_PER_GAME_MINUTE + elapsed * LIVE_TICK_MINUTES / LIVE_TICK_MS);
  return Math.max(gameTime, Math.min(gameTime + LIVE_TICK_MINUTES, minute));
}