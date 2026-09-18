import React, {useRef,useState} from "react";
import {proposalSignature} from "@/lib/simulation/phoneProposals";
import {formatEuro,formatGameTime} from "@/lib/gameData";

export default function PhoneConversation({proposals,blocked,onConfirm,onBusy}) {
 const [rejected,setRejected]=useState([]),[done,setDone]=useState([]),[notice,setNotice]=useState("Ich habe folgende Möglichkeit vorbereitet. Soll ich sie beauftragen?");
 const [error,setError]=useState(""),[pending,setPending]=useState(false);
 const lock=useRef(false),latest=useRef(proposals);latest.current=proposals;
 const option=proposals.find(p=>!rejected.includes(p.id)&&!done.includes(p.id));
 async function confirm(){
  if(!option||blocked||lock.current)return;
  const current=latest.current.find(p=>p.id===option.id);
  if(!current||proposalSignature(current)!==proposalSignature(option)){setError("Der Vorschlag hat sich geändert. Bitte erneut prüfen.");return;}
  lock.current=true;setPending(true);onBusy(true);setError("");
  try{
   const result=await onConfirm(option);
   if(!result?.ok)throw Error(result?.error||"Die Maßnahme konnte nicht ausgeführt werden.");
   setDone(v=>[...v,option.id]);
   setNotice(option.informationOnly?"Der Kunde ist informiert. Sollen wir zusätzlich eine verfügbare Maßnahme beauftragen?":"Die Maßnahme wurde beauftragt. Gibt es noch etwas zu veranlassen?");
  }catch(e){setError(e.message);}finally{lock.current=false;setPending(false);onBusy(false);}
 }
 return <section aria-label="Entscheidung im Telefonat" className="space-y-3">
 <p role="status" className="text-sm text-cyan-100">{notice}</p>
 {option?<div className="rounded-2xl border border-cyan-300/30 bg-cyan-400/5 p-4 space-y-3">
 <p className="text-xs uppercase tracking-widest text-cyan-300">Vorschlag der Leitstelle</p>
 <h3 className="font-semibold">{option.label}</h3><p className="text-sm text-slate-300">{option.description}</p>
 <p className="text-xs text-cyan-200">{formatEuro(option.costCents||0)} · {option.estimatedDurationMin||0} Min{option.isEstimate?" · geplante variable Kosten":""}</p>
 {Number.isFinite(option.eta)&&<p className="text-xs text-slate-300">Start: {formatGameTime(option.startMin)} · Ankunft: {formatGameTime(option.eta)}</p>}
 <div className="flex gap-2">
 <button disabled={blocked||pending} onClick={confirm} className="flex-1 rounded-xl bg-emerald-400 text-slate-950 p-3 font-semibold disabled:opacity-40">{pending?"Wird beauftragt …":"Bestätigen"}</button>
 <button disabled={blocked||pending} onClick={()=>{setRejected(v=>[...v,option.id]);setError("");setNotice("In Ordnung, diesen Vorschlag beauftrage ich nicht. Prüfen wir die nächste Möglichkeit.");}} className="flex-1 rounded-xl border border-white/20 p-3 disabled:opacity-40">Ablehnen</button>
 </div></div>:<p className="text-sm text-slate-300">Es gibt aktuell keinen weiteren ausführbaren Vorschlag. Nicht behobene Lieferrisiken bleiben offen; Lieferfristen laufen unverändert weiter.</p>}
 {rejected.length>0&&!pending&&<button disabled={blocked} onClick={()=>{setRejected([]);setNotice("Sehen wir uns die verfügbaren Vorschläge noch einmal an.");}} className="text-xs text-cyan-200 underline">Abgelehnte Vorschläge erneut prüfen</button>}
 {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
 </section>;
}
