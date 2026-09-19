import React, { useEffect, useRef, useState } from "react";
import OfficeAudioControls from "./OfficeAudioControls";
import { useSoundEnabled, setSoundEnabled, useSoundVolume, useSoundStatus, setSoundVolume, testExperienceSound, playPhoneSound, stopPhoneSound, usePhoneAudioStatus, phoneRingUrl } from "@/lib/experienceSound";

export default function SoundSettings() {
 const enabled=useSoundEnabled(), volume=useSoundVolume(), status=useSoundStatus(), phoneStatus=usePhoneAudioStatus();
 const [testing,setTesting]=useState(false), [playerStatus,setPlayerStatus]=useState("");
 const player=useRef(null);
 useEffect(()=>{if(player.current){player.current.volume=volume;player.current.muted=!enabled;if(!enabled)player.current.pause();}if(!enabled)stopPhoneSound("test");},[enabled,volume]);
 useEffect(()=>()=>{stopPhoneSound("test");},[]);
 async function test(){setTesting(true);try{await testExperienceSound();}finally{setTesting(false);}}
 return <section aria-label="Ton & Audio" className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-5">
  <div>
   <div className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold">Ton & Audio</h3>
    <button type="button" role="switch" aria-label="Spielton" aria-checked={enabled} onClick={()=>setSoundEnabled(!enabled)} className="rounded-lg border border-lime/30 px-4 py-2 text-sm text-lime">{enabled?"An":"Aus"}</button>
   </div>
   <p className="text-xs text-muted-foreground mt-2">Schaltet Telefon, Benachrichtigungen, Erfolgsklänge und Hintergrundgeräusche gemeinsam ein oder aus.</p>
  </div>
  <label className="block text-sm">Gesamtlautstärke · {Math.round(volume*100)}%
   <input aria-label="Gesamtlautstärke" type="range" min="10" max="100" step="5" value={Math.round(volume*100)} onChange={e=>setSoundVolume(Number(e.target.value)/100)} className="block w-full mt-3 accent-lime"/>
  </label>
  <div className="border-t border-white/10 pt-4 space-y-3"><h4 className="text-sm font-medium">Büro & Betriebshof</h4><OfficeAudioControls/></div>
  <div className="border-t border-white/10 pt-4 space-y-3">
   <h4 className="text-sm font-medium">Telefon & Benachrichtigungen testen</h4>
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={!enabled||testing} onClick={test} className="rounded-lg bg-lime text-ink px-3 py-2 text-xs font-medium disabled:opacity-40">{testing?"Audio wird aktiviert…":"Testton abspielen"}</button>
    <button type="button" disabled={!enabled} onClick={()=>{setPlayerStatus("");void playPhoneSound("test");}} className="rounded-lg border border-cyan-300/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40">Klingelton testen</button>
    <button type="button" onClick={()=>{stopPhoneSound("test");player.current?.pause();setPlayerStatus("Wiedergabe beendet.");}} className="rounded-lg border border-white/15 px-3 py-2 text-xs">Test beenden</button>
   </div>
   <p role="status" className="text-xs text-muted-foreground">{enabled?status:"Ton ausgeschaltet"}</p>
   <p role="status" className="text-xs text-muted-foreground">{enabled?(playerStatus||phoneStatus):"Zum Testen bitte den Spielton einschalten."}</p>
   {enabled&&<details className="text-xs text-muted-foreground">
    <summary className="cursor-pointer py-2">Kein Ton? Direkte Wiedergabe prüfen</summary>
    <audio controls preload="none" src={phoneRingUrl} className="w-full mt-2" aria-label="Klingelton-Audioplayer" ref={node=>{player.current=node;if(node){node.volume=volume;node.muted=!enabled;}}}
     onPlay={()=>{stopPhoneSound("test");setPlayerStatus("Wiedergabe läuft. Falls stumm: Browser-Tab und Ausgabegerät prüfen.");}}
     onError={()=>setPlayerStatus("Klingelton konnte nicht geladen werden. Bitte die Seite neu laden.")}
     onEnded={()=>setPlayerStatus("Wiedergabe beendet.")}/>
    <p className="mt-2">Der Test spielt einen Klingelton, keine gesprochenen Dialoge.</p>
   </details>}
  </div>
 </section>;
}
