// Browser audio is optional and must never interrupt the simulation.
import { useSyncExternalStore } from "react";
let enabled = false, volume = .65;
try {
 enabled = globalThis.localStorage?.getItem("frachtfieber.sound") === "on";
 const saved = globalThis.localStorage?.getItem("frachtfieber.volume");
 if (saved !== null && saved !== undefined && Number.isFinite(Number(saved))) volume = Math.min(1, Math.max(.1, Number(saved)));
} catch { /* Storage may be unavailable. */ }
let context, lastPlayed = -Infinity, status = "Noch nicht aktiviert";
const listeners = new Set(), voices = new Set();
const subscribe = cb => { listeners.add(cb); return () => listeners.delete(cb); };
const notify = () => listeners.forEach(cb => cb());
const updateStatus = text => { if (status !== text) { status = text; notify(); } };
export function useSoundEnabled() { return useSyncExternalStore(subscribe, () => enabled, () => false); }
export function useSoundVolume() { return useSyncExternalStore(subscribe, () => volume, () => .65); }
export function useSoundStatus() { return useSyncExternalStore(subscribe, () => status, () => "Noch nicht aktiviert"); }
export function setSoundVolume(value) {
 volume = Math.min(1, Math.max(.1, Number(value) || .1));
 try { globalThis.localStorage?.setItem("frachtfieber.volume", String(volume)); } catch { /* optional */ }
 notify();
}
export async function unlockExperienceSound() {
 if (!enabled) return false;
 try {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) { updateStatus("Dieser Browser unterstützt keine Audiowiedergabe."); return false; }
  if (!context || context.state === "closed") {
   context = new Audio();
   context.onstatechange = () => updateStatus(context.state === "running" ? "Audio bereit" : "Audio pausiert – Testton anklicken");
  }
  if (context.state !== "running") {
   // Called directly from a user gesture; do not defer resume to an effect.
   const resume = context.resume();
   let timer;
   try { await Promise.race([resume, new Promise(resolve => { timer = setTimeout(resolve, 1500); })]); }
   finally { clearTimeout(timer); }
  }
  if (context.state !== "running") { updateStatus("Browser blockiert Audio – Testton anklicken und Website-Ton erlauben."); return false; }
  updateStatus("Audio bereit");
  return true;
 } catch {
  updateStatus("Audio konnte nicht gestartet werden. Website-Ton im Browser prüfen.");
  return false;
 }
}
export async function setSoundEnabled(value) {
 enabled = !!value;
 try { globalThis.localStorage?.setItem("frachtfieber.sound", enabled ? "on" : "off"); } catch { /* optional */ }
 if (!enabled) {
  for (const voice of voices) { try { voice.stop(); } catch { /* already ended */ } }
  voices.clear(); updateStatus("Ton ausgeschaltet"); notify(); return false;
 }
 notify();
 return testExperienceSound();
}
export async function testExperienceSound() {
 if (!enabled || !(await unlockExperienceSound())) return false;
 return playExperienceSound("test", { force: true });
}
export function playExperienceSound(kind, { force = false } = {}) {
 if (!enabled || !context || context.state !== "running" || globalThis.document?.hidden) return false;
 if (!force && performance.now() - lastPlayed < 2500) return false;
 try {
  const now = context.currentTime;
  const tones = kind === "alert" ? [660, 880, 660, 880] : [660, 880];
  tones.forEach((frequency, i) => {
   const oscillator = context.createOscillator(), gain = context.createGain();
   const start = now + i * .22;
   oscillator.type = "sine"; oscillator.frequency.value = frequency;
   gain.gain.setValueAtTime(0, start);
   gain.gain.linearRampToValueAtTime(.22 * volume, start + .02);
   gain.gain.exponentialRampToValueAtTime(.0001, start + .3);
   oscillator.connect(gain); gain.connect(context.destination);
   voices.add(oscillator);
   oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
   oscillator.start(start); oscillator.stop(start + .32);
  });
  lastPlayed = performance.now();
  updateStatus(kind === "test" ? "Testton ausgegeben – falls stumm: Browser-Tab, Lautstärke und Ausgabegerät prüfen." : "Audio bereit");
  return true;
 } catch { updateStatus("Ton konnte nicht ausgegeben werden. Bitte Testton erneut versuchen."); return false; }
}
