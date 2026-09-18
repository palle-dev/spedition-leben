import React, { useState } from "react";
import { getDayRecap, getUpcomingRiskCount } from "@/lib/experienceRecapData";
import { formatEuro } from "@/lib/gameData";
export default function DayRecap({ state }) {
 const [offset, setOffset] = useState(0);
 const lastDay = Math.floor(state.gameTime / 1440);
 const day = lastDay - offset;
 const recap = getDayRecap(state, day);
 if (!getDayRecap(state,lastDay)) return <div className="text-xs text-muted-foreground px-1">Dein Tagesrückblick erscheint nach dem nächsten Tageswechsel.</div>;
 const r = recap || getDayRecap(state,lastDay);
 return <section aria-label="Tagesrückblick" className="rounded-2xl border border-lime/20 bg-lime/5 p-4">
 <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-sm">Das war dein Tag {r.day}.</h2>
 <select aria-label="Tag für Rückblick" value={recap ? offset : 0} onChange={e=>setOffset(Number(e.target.value))} className="text-xs bg-surface border border-white/15 rounded-lg px-2 py-1">
 {Array.from({length:13},(_,i)=>i).filter(i=>getDayRecap(state,lastDay-i)).map(i=><option key={i} value={i}>Tag {lastDay-i}{i===0 ? " · zuletzt abgeschlossen" : ""}</option>)}</select></div>
 {r.partial && <p className="text-xs text-amber-300 mt-2">Ereignisse dieses Tages erst ab Aktivierung des Rückblicks erfasst. Finanzwerte umfassen den gesamten Buchungstag.</p>}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
 {[[r.deliveries,"Lieferungen"],[r.onTime,"davon pünktlich"],[r.failed,"Aufträge gescheitert"],[r.result===null ? "—" : formatEuro(r.result),"Buchungsergebnis"]].map(([value,label])=><div key={label}><p className="text-lg font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>)}</div>
 <details className="mt-3 text-xs"><summary className="cursor-pointer text-lime">Momente & Ausblick</summary>
 <div className="space-y-2 text-muted-foreground mt-3">
 <p>Erträge: {r.revenue===null ? "nicht verfügbar" : formatEuro(r.revenue)} · Aufwendungen: {r.expenses===null ? "nicht verfügbar" : formatEuro(r.expenses)}. Ergebnis nach Buchungsdatum, einschließlich verbuchter Abschreibungen und Bewertungen.</p>
 <p>{r.contractsWon} Kundenverträge angenommen · {r.contractsCompleted} abgeschlossen.</p>
 <p>{r.appointmentsDone} persönliche Termine abgeschlossen · {r.appointmentsMissed} verpasst.</p>
 <p>{r.courses} Weiterbildungen · {r.expansions} Standortausbauten abgeschlossen.</p>
 <p className="text-amber-200">Ausblick ab jetzt: {getUpcomingRiskCount(state)} offene Lieferfristen bis morgen oder bereits überschritten. Prüfe die Disposition.</p>
 </div></details></section>;
}
