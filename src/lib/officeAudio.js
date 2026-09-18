import { useSyncExternalStore } from "react";
import officeUrl from "@/assets/office-yard.wav?url";
let wanted=false, volume=.55, player, ducked=false, status="Büroklänge sind aus";
try {wanted=localStorage.getItem("frachtfieber.ambience")==="on";const v=localStorage.getItem("frachtfieber.ambienceVolume");if(v!==null&&Number.isFinite(Number(v)))volume=Math.max(.1,Math.min(1,Number(v)));}catch{/* optional */}
const listeners=new Set();
const subscribe=cb=>{listeners.add(cb);return()=>listeners.delete(cb);};
const notify=()=>listeners.forEach(cb=>cb());
const setStatus=s=>{if(status!==s){status=s;notify();}};
export function useOfficeAudio(){return useSyncExternalStore(subscribe,()=>status,()=>"Büroklänge sind aus");}
export function useOfficeVolume(){return useSyncExternalStore(subscribe,()=>volume,()=>.55);}
export function wantsOfficeAudio(){return wanted;}
export function setOfficeVolume(value){volume=Math.max(.1,Math.min(1,Number(value)||.1));try{localStorage.setItem("frachtfieber.ambienceVolume",String(volume));}catch{/*optional*/}if(player)player.volume=volume*(ducked?.25:1);notify();}
export function setOfficeDucked(value){ducked=!!value;if(player)player.volume=volume*(ducked?.25:1);}
export function stopOfficeAudio(disable=false){
 if(disable){wanted=false;try{localStorage.setItem("frachtfieber.ambience","off");}catch{/*optional*/}}
 if(player){const old=player;player=null;old.pause();}
 setStatus(disable?"Büroklänge sind aus":"Büroklänge pausiert");
}
export function startOfficeAudio(){
 if(globalThis.document?.hidden)return Promise.resolve(false);
 wanted=true;try{localStorage.setItem("frachtfieber.ambience","on");}catch{/*optional*/}
 if(player&&!player.paused)return Promise.resolve(true);
 try{
  const audio=new Audio(officeUrl);player=audio;audio.loop=true;audio.volume=volume*(ducked?.25:1);audio.preload="auto";
  audio.onplaying=()=>{if(player===audio)setStatus("Büro & Betriebshof laufen");};
  audio.onerror=()=>{if(player===audio)setStatus("Audiodatei konnte nicht geladen werden");};
  const playing=audio.play();setStatus("Büroklänge werden gestartet…");
  return Promise.resolve(playing).then(()=>{if(player!==audio)return false;setStatus("Büro & Betriebshof laufen");return true;}).catch(e=>{
   if(player!==audio)return false;setStatus(e?.name==="NotAllowedError"?"Browser blockiert Audio – Büroklänge starten anklicken":"Wiedergabe fehlgeschlagen – Website-Ton und Audioausgabe prüfen");player=null;return false;
  });
 }catch{setStatus("Audiowiedergabe nicht verfügbar");return Promise.resolve(false);}
}
