import OfficeAudioControls from "./OfficeAudioControls";
import React, { useState } from "react";
import { useSoundEnabled, setSoundEnabled, useSoundVolume, useSoundStatus, setSoundVolume, testExperienceSound } from "@/lib/experienceSound";
export default function SoundSettings() {
 const enabled = useSoundEnabled(), volume = useSoundVolume(), status = useSoundStatus();
 const [testing, setTesting] = useState(false);
 async function test() {
  setTesting(true);
  try { await testExperienceSound(); } finally { setTesting(false); }
 }
 return <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
 <OfficeAudioControls />
 <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Funk & Erfolgsklänge</span>
 <button type="button" role="switch" aria-label="Spielton" aria-checked={enabled} onClick={() => setSoundEnabled(!enabled)} className="rounded-lg border border-lime/30 px-3 py-1 text-sm text-lime">{enabled ? "An" : "Aus"}</button></div>
 <label className="block text-xs text-muted-foreground">Lautstärke · {Math.round(volume * 100)}%
 <input aria-label="Lautstärke" type="range" min="10" max="100" step="5" value={Math.round(volume*100)} onChange={e=>setSoundVolume(Number(e.target.value)/100)} className="block w-full mt-2 accent-lime" /></label>
 <button type="button" disabled={!enabled || testing} onClick={test} className="rounded-lg bg-lime text-ink px-4 py-2 text-sm font-medium disabled:opacity-40">{testing ? "Audio wird aktiviert…" : "Testton abspielen"}</button>
 <p role="status" className="text-xs text-muted-foreground">{enabled ? status : "Ton ausgeschaltet"}</p>
 <p className="text-xs text-muted-foreground">Signale ertönen bei Spielereignissen. Mit dem Testton kannst du die Wiedergabe jederzeit prüfen.</p>
 </div>;
}
