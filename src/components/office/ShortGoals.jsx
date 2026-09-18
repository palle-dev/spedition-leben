import React from "react";
import { useNavigate } from "react-router-dom";
import { ACHIEVEMENTS } from "@/lib/simulation/achievementCatalog";
const GOALS = [["reliable_five", "/disposition"], ["team_first_course", "/personal"], ["promise_first", "/zuhause"]];
export default function ShortGoals({ state }) {
 const navigate = useNavigate();
 return <section aria-label="Deine nächsten Erfolgsmomente" className="glass rounded-2xl border border-lime/20 p-4">
 <div className="flex justify-between items-center gap-2 mb-3"><h2 className="text-sm font-semibold">Noch ein guter Zug.</h2><span className="text-xs text-muted-foreground">Kleine Ziele · echte Fortschritte</span></div>
 <div className="grid sm:grid-cols-3 gap-3">{GOALS.map(([id,path]) => {
 const def = ACHIEVEMENTS.find(a => a.id === id);
 const saved = state.achievements?.find(a => a.id === id)?.unlocked;
 const progress = def.progress(state, {});
 const current = saved ? progress.target : progress.current;
 return <button key={id} onClick={() => navigate(saved ? "/erfolge" : path)} className={"text-left rounded-xl border p-3 " + (saved ? "border-lime/30 bg-lime/10" : "border-white/10 bg-white/5 hover:border-lime/30")}>
 <span className="text-xs text-lime">{saved ? "✓ Geschafft" : current + " / " + progress.target} · {def.xp} XP</span>
 <h3 className="text-sm font-medium mt-1">{def.title}</h3><p className="text-xs text-muted-foreground mt-1">{def.desc}</p>
 <progress aria-label={def.title} value={current} max={progress.target} className="w-full h-1 mt-3 accent-lime" />
 </button>;
 })}</div></section>;
}
