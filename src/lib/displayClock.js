// Presentation only: the engine still commits 15 game minutes every 5 seconds.
// Bound extrapolation to one pending tick so a slow worker cannot invent hours.
export function displayedGameMinute(gameTime, timeControl, nowMs, running) {
  if (!running || !timeControl?.enabled || !Number.isFinite(timeControl.anchorRealMs)) return gameTime;
  const elapsed = Math.max(0, nowMs - timeControl.anchorRealMs);
  const minute = Math.floor(timeControl.anchorGameNumerator / 100 + elapsed * 15 / 5000);
  return Math.max(gameTime, Math.min(gameTime + 15, minute));
}
