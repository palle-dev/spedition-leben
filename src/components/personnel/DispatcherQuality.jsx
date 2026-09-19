import React from 'react';
import {Link} from 'react-router-dom';
import {dispatcherReport} from '@/lib/simulation/dispatcherQuality';
export default function DispatcherQuality({state,employee}) {
 const r=dispatcherReport(state,employee);
 return <div className="rounded-xl border border-lime/20 bg-lime/5 p-3 space-y-2 mt-3">
  <div className="flex justify-between text-sm font-medium"><span>{r.label}</span><span className={r.load>=r.capacity?'text-coral':'text-lime'}>{r.load} / {r.capacity} Lkw betreut</span></div>
  <p className="text-xs text-muted-foreground">{r.horizonMin/60} Stunden Planung · {r.bufferMin} Minuten Mindestpuffer für neue Zusagen</p>
  <div className="grid grid-cols-3 gap-2 text-xs">
   <div><strong>{r.punctuality==null?'—':r.punctuality+' %'}</strong><div className="text-muted-foreground">pünktlich</div></div>
   <div><strong>{r.late}</strong><div className="text-muted-foreground">verspätet</div></div>
   <div><strong>{r.failed}</strong><div className="text-muted-foreground">gescheitert</div></div>
  </div>
  <p className="text-[11px] text-muted-foreground">Zugeordnete Lieferungen der letzten 7 Spieltage. {r.criticalAtPlanning} verspätete Lieferungen waren schon bei der Planung kritisch.</p>
  {r.load>=r.capacity&&<p className="text-xs text-coral">Betreuung ausgelastet: bestehende Zusagen werden weiter bearbeitet, neue Annahmen begrenzt. Verstärke die Schicht oder bilde Personal weiter.</p>}
  <Link className="text-xs text-lime underline" to="/personal">Personal, erfahrene Bewerber und Weiterbildung</Link>
 </div>;
}
