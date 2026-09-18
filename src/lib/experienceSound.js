// Browser audio is optional and must never interrupt the simulation.
import phoneRingUrl from "@/assets/phone-ring.wav?url";
import { useSyncExternalStore } from "react";
let enabled = false, volume = .65;
try {
 enabled = globalThis.localStorage?.getItem("frachtfieber.sound") === "on";
 const saved = globalThis.localStorage?.getItem("frachtfieber.volume");
 if (saved !== null && saved !== undefined && Number.isFinite(Number(saved))) volume = Math.min(1, Math.max(.1, Number(saved)));
} catch { /* Storage may be unavailable. */ }
let context, lastPlayed = -Infinity, lastPhonePlayed = -Infinity, status = "Noch nicht aktiviert";
const listeners = new Set(), voices = new Set();
const subscribe = cb => { listeners.add(cb); return () => listeners.delete(cb); };
const notify = () => listeners.forEach(cb => cb());
const updateStatus = text => { if (status !== text) { status = text; notify(); } };
export function useSoundReady() { return useSyncExternalStore(subscribe, () => !!enabled && context?.state === "running", () => false); }
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
export async function setSoundEnabled(value, { preview = true } = {}) {
 enabled = !!value;
 try { globalThis.localStorage?.setItem("frachtfieber.sound", enabled ? "on" : "off"); } catch { /* optional */ }
 if (!enabled) {
  for (const channel of phonePlayers.keys()) stopPhoneSound(channel);
  for (const voice of voices) { try { voice.stop(); } catch { /* already ended */ } }
  voices.clear(); updateStatus("Ton ausgeschaltet"); notify(); return false;
 }
 notify();
 return preview ? testExperienceSound() : true;
}
export async function testExperienceSound() {
 if (!enabled || !(await unlockExperienceSound())) return false;
 return playExperienceSound("test", { force: true });
}
export function playExperienceSound(kind, { force = false } = {}) {
 if (!enabled || !context || context.state !== "running" || globalThis.document?.hidden) return false;
 if (!force && performance.now() - (kind === "phone" ? lastPhonePlayed : lastPlayed) < 2500) return false;
 try {
  const now = context.currentTime;
  const tones = (kind === "alert" || kind === "phone") ? [660, 880, 660, 880] : [660, 880];
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
  if (kind === "phone") lastPhonePlayed = performance.now();
  else lastPlayed = performance.now();
  updateStatus(kind === "test" ? "Testton ausgegeben – falls stumm: Browser-Tab, Lautstärke und Ausgabegerät prüfen." : "Audio bereit");
  return true;
 } catch { updateStatus("Ton konnte nicht ausgegeben werden. Bitte Testton erneut versuchen."); return false; }
}
const phonePlayers = new Map();
let phoneStatus = "Klingelton noch nicht geprüft";
export function usePhoneAudioStatus() { return useSyncExternalStore(subscribe, () => phoneStatus, () => "Klingelton noch nicht geprüft"); }
const setPhoneStatus = text => { phoneStatus = text; notify(); };
export function stopPhoneSound(channel = "ring") {
 const player = phonePlayers.get(channel);
 if (player) { phonePlayers.delete(channel); player.pause(); }
}
export function playPhoneSound(channel = "ring") {
 if (!enabled || globalThis.document?.hidden) return Promise.resolve(false);
 stopPhoneSound(channel);
 try {
  const player = new Audio(phoneRingUrl);
  player.volume = volume;
  player.preload = "auto";
  phonePlayers.set(channel, player);
  player.onended = () => { if (phonePlayers.get(channel) === player) phonePlayers.delete(channel); };
  player.onerror = () => {
   if (phonePlayers.get(channel) !== player) return;
   setPhoneStatus("Klingelton-Datei konnte nicht geladen werden. Bitte Seite neu laden.");
  };
  // Invoke play synchronously inside the click, before any await or dialog render.
  const started = player.play();
  setPhoneStatus("Klingelton wird gestartet…");
  return Promise.resolve(started).then(() => {
   if (phonePlayers.get(channel) !== player) return false;
   setPhoneStatus("Klingelton läuft. Wenn nichts hörbar ist: Tab-Ton und Ausgabegerät prüfen.");
   return true;
  }).catch(error => {
   if (phonePlayers.get(channel) !== player) return false;
   setPhoneStatus(error?.name === "NotAllowedError"
    ? "Browser hat den Ton blockiert. Im Audioplayer auf Wiedergabe klicken."
    : "Klingelton konnte nicht abgespielt werden. Bitte den Audioplayer verwenden.");
   return false;
  });
 } catch {
  setPhoneStatus("Audiowiedergabe nicht verfügbar. Bitte den Audioplayer verwenden.");
  return Promise.resolve(false);
 }
}
export { phoneRingUrl };

export function getSoundVolume(){return volume;}

