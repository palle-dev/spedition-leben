import { useEffect } from "react";
import { unlockExperienceSound } from "@/lib/experienceSound";
export default function SoundGate() {
 useEffect(() => {
  const unlock = () => { void unlockExperienceSound(); };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
 }, []);
 return null;
}
