import React,{useRef,useState} from "react";
import {formatEuro} from "@/lib/gameData";

export default function BranchPhoneDecision({proposal,blocked,onConfirm,onBusy}) {
 const [pending,setPending]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const lock=useRef(false);
 async function decide(approve) {
  if(!proposal||blocked||lock.current||(approve&&proposal.approvalUnavailable))return;
  lock.current=true;setPending(true);onBusy(true);setError("");
  try {
   const result=await onConfirm(approve?proposal:{command:proposal.rejectCommand,params:proposal.rejectParams});
   if(!result?.ok)throw Error(result?.error||"Die Entscheidung konnte nicht gespeichert werden.");
   setNotice(approve?"Freigabe erteilt. Die Maßnahme wurde ausgeführt.":"Verstanden. Die Anfrage ist abgelehnt und abgeschlossen.");
  } catch(e){setError(e.message);}
  finally {lock.current=false;setPending(false);onBusy(false);}
 }
 return <section aria-label="Filialanfrage im Telefonat" className="space-y-3">
 {notice?<p role="status" className="text-sm text-emerald-200">{notice}</p>:proposal?<div className="rounded-2xl border border-cyan-300/30 bg-cyan-400/5 p-4 space-y-3">
 <p className="text-xs uppercase tracking-widest text-cyan-300">Vorschlag deiner Filialleitung</p>
 <h3 className="font-semibold">{proposal.label}</h3>
 <p className="text-sm text-slate-300">{proposal.description}</p>
 <p className="text-sm text-cyan-200">Kosten: {formatEuro(proposal.costCents)}</p>
 {proposal.benefitDesc&&<p className="text-sm text-emerald-200">Nutzen: {proposal.benefitDesc}</p>}
 {proposal.approvalUnavailable&&<p className="text-xs text-amber-200">{proposal.approvalUnavailable}</p>}
 <div className="flex gap-2">
 <button disabled={blocked||pending||!!proposal.approvalUnavailable} onClick={()=>decide(true)} className="flex-1 rounded-xl bg-emerald-400 text-slate-950 p-3 font-semibold disabled:opacity-40">Bestätigen</button>
 <button disabled={blocked||pending} onClick={()=>decide(false)} className="flex-1 rounded-xl border border-white/20 p-3 disabled:opacity-40">Ablehnen</button>
 </div>
 {pending&&<p role="status" className="text-xs text-slate-300">Entscheidung wird gespeichert …</p>}
 </div>:<p className="text-sm text-slate-300">Diese Anfrage ist nicht mehr offen.</p>}
 {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
 </section>;
}
