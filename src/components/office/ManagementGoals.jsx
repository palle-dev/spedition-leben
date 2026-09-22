import React,{useState} from "react";
import {Link} from "react-router-dom";
import {Target,ArrowUpRight} from "lucide-react";
import {useGame} from "@/lib/gameContext";
import {MANAGEMENT_GOALS,managementGoalProgress} from "@/lib/simulation/managementGoals";
import "./journey.css";
const labels={active:"In Arbeit",achieved:"Ziel erreicht",missed:"Ziel verfehlt",insufficient:"Zu wenig Lieferungen für eine Bilanz",interrupted:"Zuständigkeit beendet",cancelled:"Bewusst beendet"};
export default function ManagementGoals(){
 const {state,send,showToast,busy,backgroundAdvance}=useGame();const [employeeId,setEmployeeId]=useState(""),[kind,setKind]=useState("reliability"),[pending,setPending]=useState(false),[confirm,setConfirm]=useState(null);
 const all=state.journey?.mandates||[],active=all.filter(g=>g.status==="active"),recent=all.filter(g=>g.status!=="active").slice(-6).reverse();
 const managers=(state.employees||[]).filter(e=>e.employmentStatus==="employed"&&["assistant","branch_manager"].includes(e.role)&&!active.some(g=>g.employeeId===e.id)&&(e.role==="assistant"||state.branches?.some(b=>b.id===e.assignedBranchId&&b.status==="active")));
 const selected=managers.find(e=>e.id===employeeId)||managers[0],locked=pending||busy||backgroundAdvance?.active;
 async function act(command,params){setPending(true);try{await send(command,params);setConfirm(null);}catch(e){showToast(e.message,"error");}finally{setPending(false);}}
 function progress(g){const r=g.result||managementGoalProgress(state,g);return g.kind==="reliability"?`${r.onTime} / ${r.delivered} pünktlich · ${r.percent==null?"noch keine Quote":r.percent+" %"} · mindestens 10 Lieferungen nötig`:`${r.staff} beschäftigte Fahrer / ${r.vehicles} aktive Lkw`;}
 return <section className="ff-journey" aria-label="Führungsziele"><p className="ff-eyebrow"><Target size={15}/> RICHTUNG GEBEN</p><h2>Du führst. Dein Team handelt.</h2><p>Messbare Ziele mit einer Bilanz nach mindestens 14 Spieltagen. Filialleiter priorisieren passende Maßnahmen innerhalb ihrer Befugnisse. Assistenzziele geben den gemeinsamen Rahmen vor; Standortziele gehen vor.</p>
 <div className="ff-management-form"><label>Verantwortung<select aria-label="Verantwortliche Führungskraft" disabled={!managers.length||locked} value={selected?.id||""} onChange={e=>setEmployeeId(e.target.value)}>{!managers.length&&<option value="">Keine freie Führungskraft</option>}{managers.map(e=><option key={e.id} value={e.id}>{e.name} · {e.role==="assistant"?"Unternehmen":state.branches.find(b=>b.id===e.assignedBranchId)?.name}</option>)}</select></label><label>Ziel<select value={kind} onChange={e=>setKind(e.target.value)} disabled={locked}>{MANAGEMENT_GOALS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}</select></label><button disabled={locked||!selected} onClick={()=>act("setManagementGoal",{employeeId:selected.id,kind})}>Auftrag erteilen <ArrowUpRight size={16}/></button></div>
 <p>{MANAGEMENT_GOALS.find(g=>g.id===kind)?.detail}</p><p className="ff-journey-caption">Keine zusätzlichen Ausgabenbefugnisse. Tagesbudgets, Genehmigungen und bereits erteilte Aufträge gelten weiter. Auch per Telefon unter Führungsaufträge verfügbar.</p>
 {!managers.length&&!active.length&&<Link className="ff-story-link" to="/personal">Assistenz oder Filialleitung einstellen <ArrowUpRight size={15}/></Link>}
 <div className="ff-mandates">{active.map(g=><article key={g.id}><div><span className="ff-eyebrow">{g.name} · BILANZ TAG {Math.floor(g.dueMin/1440)+1}</span><h3>{MANAGEMENT_GOALS.find(x=>x.id===g.kind)?.label}</h3><p>{progress(g)}</p></div>{confirm===g.id?<div className="ff-path-change"><span>Auftrag beenden? Bisheriger Verlauf bleibt erhalten.</span><button disabled={locked} onClick={()=>act("cancelManagementGoal",{id:g.id})}>Beenden</button><button onClick={()=>setConfirm(null)}>Behalten</button></div>:<button className="ff-management-cancel" onClick={()=>setConfirm(g.id)}>Auftrag beenden</button>}</article>)}</div>
 {!!recent.length&&<details className="ff-story-history"><summary>Letzte Führungsbilanzen ({recent.length})</summary>{recent.map(g=><article className="ff-management-review" key={g.id}><strong>{g.name} · {labels[g.status]}</strong><p>{MANAGEMENT_GOALS.find(x=>x.id===g.kind)?.label}: {progress(g)}</p></article>)}</details>}
 </section>;
}
