import React from "react";
import { useSoundEnabled, setSoundEnabled } from "@/lib/experienceSound";
export default function SoundSettings() {
 const enabled = useSoundEnabled();
 return <div className="rounded-xl border border-white/10 bg-white/5 p-4">
 <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">Funk & Erfolgsklänge</span>
 <button type="button" role="switch" aria-checked={enabled} onClick={() => setSoundEnabled(!enabled)} className="rounded-lg border border-lime/30 px-3 py-1 text-sm text-lime">{enabled ? "An" : "Aus"}</button></div>
 <p className="mt-2 text-xs text-muted-foreground">Dezente Signale für Lieferungen und Entscheidungen. Nach dem Neuladen werden Klänge mit deiner ersten Interaktion aktiviert.</p></div>;
}
