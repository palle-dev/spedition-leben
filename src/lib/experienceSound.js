// Device preference; never changes simulation time or state.
import { useSyncExternalStore } from "react";
let enabled = false;
try { enabled = globalThis.localStorage?.getItem("frachtfieber.sound") === "on"; } catch { /* storage optional */ }
let context, lastPlayed = -Infinity;
const listeners = new Set();
export function useSoundEnabled() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => enabled, () => false);
}
export async function setSoundEnabled(value) {
  enabled = !!value;
  try { localStorage.setItem("frachtfieber.sound", enabled ? "on" : "off"); } catch { /* optional */ }
  listeners.forEach(cb => cb());
  if (enabled) {
    try {
      const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Audio) return;
      context ||= new Audio();
      await context.resume();
      playExperienceSound("success");
    } catch { /* unsupported or blocked audio must not interrupt play */ }
  }
}
export async function unlockExperienceSound() {
 if (!enabled || context?.state === "running") return;
 try {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) return;
  context ||= new Audio();
  await context.resume();
 } catch { /* browser policy: keep silent */ }
}
export function playExperienceSound(kind) {
  if (!enabled || !context || context.state !== "running" || globalThis.document?.hidden) return;
  if (performance.now() - lastPlayed < 2500) return;
  lastPlayed = performance.now();
  try {
    const now = context.currentTime;
    [kind === "alert" ? 440 : 660, kind === "alert" ? 330 : 880].forEach((frequency, i) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + i * .13);
      gain.gain.linearRampToValueAtTime(.035, now + i * .13 + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, now + i * .13 + .18);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(now + i * .13); oscillator.stop(now + i * .13 + .2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  } catch { /* silent fallback */ }
}
