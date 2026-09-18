import { useEffect } from "react";
import { unlockExperienceSound,useSoundEnabled,stopPhoneSound } from "@/lib/experienceSound";
import { wantsOfficeAudio,startOfficeAudio,stopOfficeAudio } from "@/lib/officeAudio";
export default function SoundGate(){
 const enabled=useSoundEnabled();
 useEffect(()=>{
  if(!enabled){stopOfficeAudio();return;}
  const unlock=()=>{void unlockExperienceSound();if(wantsOfficeAudio())void startOfficeAudio();};
  const visibility=()=>{if(document.hidden){stopOfficeAudio();stopPhoneSound("ring");stopPhoneSound("test");}else unlock();};
  window.addEventListener("pointerdown",unlock);window.addEventListener("keydown",unlock);document.addEventListener("visibilitychange",visibility);
  return()=>{window.removeEventListener("pointerdown",unlock);window.removeEventListener("keydown",unlock);document.removeEventListener("visibilitychange",visibility);stopOfficeAudio();};
 },[enabled]);
 return null;
}

