import React, { useMemo, useRef, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { getCommunicationQueue } from "@/lib/communicationData";
import { formatEuro } from "@/lib/gameData";
import DisruptionDialog from "@/components/office/DisruptionDialog";
export default function DecisionInbox() {
 const {state,send,busy,backgroundAdvance}=useGame();
 const entries=useMemo(()=>getCommunicationQueue(state).emails,[state]);
 const [selected,setSelected]=useState(null),[reason,setReason]=useState(""),[error,setError]=useState(""),[sending,setSending]=useState(false),[notice,setNotice]=useState("");
 const lock=useRef(false);
 const current=entries.find(e=>e.key===selected);
 async function respond(action){
  if(lock.current||busy||backgroundAdvance||!current)return;
  lock.current=true;setSending(true);setError("");
  try{
   const params={...action.params};
   if(current.type==="vacation_request"&&action.kind==="reject")params.reason=reason.trim();
   const r=await send(action.command,params);
   if(!r?.ok)throw Error(r?.error||"Antwort konnte nicht übernommen werden.");
   setNotice(action.label+" – deine Entscheidung wurde übernommen.");setSelected(null);setReason("");
  }catch(e){setError(e.message);}finally{lock.current=false;setSending(false);}
 }
 return <section aria-label="E-Mails mit offenen Entscheidungen" className="mb-5 rounded-2xl border border-cyan-300/20 bg-cyan-500/5 p-4">
 <h2 className="text-sm font-semibold">Antworten, die auf dich warten · {entries.length}</h2>
 <p className="text-xs text-muted-foreground mt-1">Planbare Anliegen bearbeitest du hier. Dringende Einsätze erscheinen am Telefon.</p>
 {notice&&<p role="status" className="text-xs text-lime mt-2">{notice}</p>}
 <div className="mt-3 space-y-2 max-h-[45vh] overflow-y-auto">
 {entries.map(e=><div key={e.key} className="rounded-xl border border-white/10 bg-surface/60">
 <button aria-expanded={selected===e.key} onClick={()=>{if(sending)return;setSelected(selected===e.key?null:e.key);setReason("");setError("");setNotice("");}} className="w-full text-left p-3"><span className="block text-[10px] uppercase tracking-wider text-cyan-200">{e.source}</span><span className="text-sm font-medium">{e.title}</span><span className="block text-xs text-muted-foreground mt-1">{e.description}</span></button>
 {selected===e.key&&e.type!=="disruption"&&<div className="px-3 pb-3 space-y-3">
 <p className="text-xs text-cyan-100">Kosten laut Anfrage: {formatEuro(e.costCents||0)}{e.benefitDesc?" · "+e.benefitDesc:""}</p>
 {e.type==="vacation_request"&&<><p className="text-xs text-amber-200">Vor der Genehmigung die Personaldeckung prüfen. Bestehende Einsätze werden dadurch nicht automatisch umgeplant.</p>
 {(e.meta.conflicts||[]).length>0&&<p className="text-xs text-amber-200">{e.meta.conflicts.length} bekannte Überschneidungen im Urlaubszeitraum.</p>}
 <label className="block text-xs text-muted-foreground">Begründung bei Ablehnung (optional)<textarea value={reason} onChange={event=>setReason(event.target.value)} maxLength={500} rows={2} className="block w-full rounded-lg bg-white/5 border border-white/15 p-2 mt-1"/></label></>}
 <div className="flex flex-wrap gap-2">{e.actions.map(a=><button key={a.command} disabled={busy||!!backgroundAdvance||sending} onClick={()=>respond(a)} className={"rounded-lg px-4 py-2 text-xs font-medium border disabled:opacity-40 "+(a.kind==="approve"?"bg-lime text-ink border-lime":"bg-white/5 border-white/15")}>{sending?"Wird übermittelt…":a.label}</button>)}</div>
 {error&&<p role="alert" className="text-xs text-red-300">{error}</p>}
 </div>}
 </div>)}
 {entries.length===0&&<p className="text-xs text-muted-foreground">Alle planbaren Rückfragen sind bearbeitet.</p>}
 </div>
 {current?.type==="disruption"&&<DisruptionDialog disruptionId={current.id} onClose={()=>setSelected(null)}/>}
 </section>;
}
