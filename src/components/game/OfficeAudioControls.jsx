import React from "react";
import { useOfficeAudio,useOfficeVolume,setOfficeVolume,startOfficeAudio,stopOfficeAudio } from "@/lib/officeAudio";
import { useSoundEnabled } from "@/lib/experienceSound";
export default function OfficeAudioControls(){
 const status=useOfficeAudio(),volume=useOfficeVolume(),enabled=useSoundEnabled();
 const start=()=>{void startOfficeAudio();};
 return <section aria-label="Büro- und Speditionsgeräusche" className="space-y-2">
 <div className="flex gap-2"><button type="button" disabled={!enabled} onClick={start} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40">Büroklänge starten</button><button type="button" onClick={()=>stopOfficeAudio(true)} className="rounded-lg border border-white/15 px-3 py-2 text-xs">Stopp</button></div>
 <p role="status" className="text-[11px] text-muted-foreground">{status}</p>
 <><label className="block text-xs">Hintergrund · {Math.round(volume*100)}%<input aria-label="Lautstärke Bürogeräusche" type="range" min="10" max="100" step="5" value={Math.round(volume*100)} onChange={e=>setOfficeVolume(Number(e.target.value)/100)} className="block w-full mt-2 accent-lime"/></label><p className="text-xs text-muted-foreground">Dezente Büro- und Hofgeräusche. Telefon und Benachrichtigungen sind lauter; bei Anrufen wird der Hintergrund zusätzlich abgesenkt.</p></>
 </section>;
}
