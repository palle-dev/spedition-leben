import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useGame } from "@/lib/gameContext";
import { officeAtmosphere } from "@/lib/officeAtmosphere";
import { getSiteOverview } from "@/lib/simulation/siteExpansionEngine";
import Portrait from "@/components/ui/Portrait";
export default function LivingOffice({ state }) {
 const navigate = useNavigate();
 const { motionEnabled } = useGame();
 const reduced = useReducedMotion();
 const branch = state.branches?.find(b => b.isHeadquarters) || state.branches?.[0];
 const site = useMemo(() => branch ? getSiteOverview(state, branch.id) : null, [state, branch]);
 const vehicles = (state.vehicles || []).filter(v => !["sold","archived"].includes(v.status));
 const moving = vehicles.filter(v => v.status === "on_trip").length;
 const contact = (state.employees || []).find(e => e.role === "dispatcher") || state.drivers?.[0];
 const mood = officeAtmosphere(state.gameTime);
 const tier = vehicles.length >= 25 ? "Logistikzentrale" : vehicles.length >= 10 ? "Wachsender Betrieb" : "Dein Betriebshof";
 const project = site?.activeProject;
 const latest = [...(state.events || [])].reverse().find(e => e.type === "delivery_completed");
 return <section className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 p-5">
 <div className="relative z-10 flex flex-wrap justify-between gap-3">
 <div><p className="text-[10px] uppercase tracking-[.2em] text-lime">{mood.label}</p><h2 className="text-xl font-semibold mt-1">{tier}</h2>
 <p className="text-xs text-slate-300 mt-1">{vehicles.length} Fahrzeuge · {moving} unterwegs · {state.branches?.length || 0} Standorte</p></div>
 <button onClick={() => navigate("/filialen")} className="self-start text-xs rounded-lg border border-white/20 px-3 py-2 hover:bg-white/10">Standort entwickeln →</button></div>
 <svg viewBox="0 0 800 180" role="img" aria-label="Schematischer Betriebshof: Ausbaustand und Flottengröße" className="w-full h-36 sm:h-44 mt-1">
 <path d="M0 150H800" stroke="#64748b" strokeWidth="2"/>
 <path d="M0 174H800" stroke="#94a3b8" strokeDasharray="22 18" opacity=".3"/>
 <rect x="25" y={vehicles.length >= 10 ? 28 : 58} width="185" height={vehicles.length >= 10 ? 120 : 90} rx="6" fill="#1e3a46" stroke="#475569"/>
 <text x="42" y="85" fill="#bef264" fontSize="13" fontFamily="sans-serif">FRACHTFIEBER</text>
 {[0,1,2,3].map(i => <rect key={i} x={44+i*39} y="104" width="23" height="25" rx="2" fill={mood.label.includes("Nacht") || mood.label.includes("Abend") ? "#fcd34d" : "#7dd3fc"} opacity=".65"/>)}
 {vehicles.length >= 25 && <rect x="220" y="20" width="95" height="128" rx="5" fill="#254350" stroke="#64748b"/>}
 {Array.from({length:Math.min(8,vehicles.length)},(_,i)=><motion.g key={i + ":" + (latest?.id || "yard")} initial={false} animate={{y:motionEnabled && !reduced ? [0,-2,0] : 0}} transition={{duration:1.2, delay:i*.08, repeat:0}}>
 <rect x={335+(i%4)*108} y={95-Math.floor(i/4)*45} width="67" height="27" rx="3" fill={i%2 ? "#94a3b8" : "#bef264"}/>
 <path d={`M${404+(i%4)*108} ${104-Math.floor(i/4)*45}h17l8 10v8h-25z`} fill="#e2e8f0"/>
 {[0,1].map(j=><circle key={j} cx={350+(i%4)*108+j*62} cy={125-Math.floor(i/4)*45} r="5" fill="#0f172a" stroke="#64748b"/>)}</motion.g>)}
 {project && <g stroke="#fbbf24" strokeWidth="3"><path d="M270 145V30h55M240 40h85M295 30v40"/><rect x="250" y="132" width="65" height="14" fill="#78350f"/></g>}
 </svg>
 <div className="relative grid sm:grid-cols-2 gap-3">
 <div className="flex items-center gap-3 rounded-xl bg-black/20 p-3">
 <Portrait portraitId={contact?.portraitId || contact?.portrait_id} name={contact?.name || "Leitstelle"} size="sm"/>
 <div className="min-w-0"><p className="text-xs font-medium">{contact?.name || "Aus der Leitstelle"}</p><p className="text-xs text-slate-300 mt-1">{latest?.type === "delivery_completed" ? `Fracht bei ${latest.details?.customer || "unserem Kunden"} angekommen.` : `${moving} Fahrzeuge unterwegs. ${site?.parking.free ?? 0} freie Stellplätze am Hauptstandort.`}</p></div></div>
 <div className="rounded-xl bg-black/20 p-3 text-xs">
 {project ? <><p className="text-amber-300">Im Bau: {project.label} · {project.progressPct}%</p><progress aria-label="Baufortschritt" value={project.progressPct} max="100" className="w-full h-2 mt-2 accent-amber-400"/><p className="text-slate-300 mt-1">Noch {Math.max(0,Math.ceil((project.completionMin-state.gameTime)/60))} Spielstunden</p></> : <><p className="text-lime">Werkstatt & Hof</p><p className="text-slate-300 mt-1">{site?.workshop.slots || 0} Werkstattplätze · {site?.workshop.activeMaintenance || 0} Wartungen eingeplant oder in Arbeit</p><p className="text-slate-400 mt-1">Dein Hof wächst mit Flotte und Standortausbau.</p></>}
 </div></div></section>;
}
