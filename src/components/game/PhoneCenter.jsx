import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Phone, PhoneIncoming, PhoneOff, Clock, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { getCommunicationQueue, deadlineLabel } from "@/lib/communicationData";
import { getDisruptionDetail } from "@/lib/simulation/disruptionEngine";
import { formatEuro } from "@/lib/gameData";
import { playExperienceSound } from "@/lib/experienceSound";
import Portrait from "@/components/ui/Portrait";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function PhoneCenter() {
 const { state,send,busy,backgroundAdvance,overlay,motionEnabled,automationEnabled,pauseAutomation }=useGame();
 const navigate=useNavigate(), reduced=useReducedMotion();
 const queue=useMemo(()=>getCommunicationQueue(state),[state]);
 const [selected,setSelected]=useState(null),[showList,setShowList]=useState(false),[later,setLater]=useState([]);
 const [sending,setSending]=useState(false),[error,setError]=useState("");
 const lock=useRef(false), seen=useRef(null);
 const ids=queue.calls.map(c=>c.id).join("|");
 useEffect(()=>{
  const current=new Set(queue.calls.map(c=>c.id));
  if(seen.current && [...current].some(id=>!seen.current.has(id))) playExperienceSound("alert");
  seen.current=current;
  setLater(prev=>prev.filter(id=>current.has(id)));
 },[ids]); // eslint-disable-line react-hooks/exhaustive-deps
 const incoming=queue.calls.find(c=>!later.includes(c.id));
 const detail=useMemo(()=>selected?getDisruptionDetail(state,selected.id):null,[state,selected]);
 const blocked=busy || !!backgroundAdvance?.active || sending;
 const defer=()=>{if(selected)setLater(prev=>[...new Set([...prev,selected.id])]);setSelected(null);setError("");};
 const answer=call=>{setSelected(call);setShowList(false);setError("");};
 async function choose(id){
  if(lock.current || blocked || !detail || detail.status!=="decision_open")return;
  lock.current=true;setSending(true);setError("");
  try { const result=await send("resolveDisruption",{disruptionId:selected.id,optionId:id});
   if(!result?.ok)throw Error(result?.error || "Die Entscheidung konnte nicht ausgeführt werden.");
  }catch(e){setError(e.message);}finally{lock.current=false;setSending(false);}
 }
 return <>
 <div className="fixed right-3 top-20 z-30 w-64 sm:w-80 pointer-events-none">
 <div className="pointer-events-auto rounded-2xl border border-cyan-200/20 bg-slate-950/95 shadow-xl backdrop-blur-xl overflow-hidden">
 <div className="flex items-center justify-between px-3 py-2">
 <button onClick={()=>setShowList(v=>!v)} aria-expanded={showList} className="text-xs flex items-center gap-2 text-cyan-100"><Phone className="w-4 h-4"/> Telefon · {queue.calls.length} offen</button>
 <button aria-label="Entscheidungen im Postfach öffnen" onClick={()=>navigate("/postfach")} className="text-xs flex items-center gap-1 text-slate-300"><Mail className="w-4 h-4"/>{queue.emails.length}</button></div>
 {incoming && !selected && !overlay && <div className="border-t border-white/10 p-3">
 <div className="flex items-center gap-3"><motion.div animate={motionEnabled&&!reduced?{rotate:[0,-12,12,0]}:{rotate:0}} transition={{duration:.5,repeat:2}}><PhoneIncoming className="text-emerald-300 w-6 h-6"/></motion.div><div><p className="text-sm font-semibold text-white">{incoming.source}</p><p className="text-xs text-slate-300">{incoming.title}</p></div></div>
 <div className="flex gap-2 mt-3"><button disabled={blocked} onClick={()=>answer(incoming)} className="flex-1 rounded-xl bg-emerald-400 text-slate-950 py-2 text-xs font-semibold disabled:opacity-50">Annehmen</button><button onClick={()=>setLater(prev=>[...new Set([...prev,incoming.id])])} className="rounded-xl bg-white/10 text-white px-3 text-xs">Später</button></div></div>}
 {showList && <div className="border-t border-white/10 p-2 max-h-64 overflow-y-auto">{queue.calls.length===0?<p className="p-2 text-xs text-slate-400">Keine offenen Rückrufe.</p>:queue.calls.map(c=><button key={c.id} disabled={blocked} onClick={()=>answer(c)} className="w-full text-left rounded-xl hover:bg-white/10 p-3 disabled:opacity-50"><p className="text-xs font-medium text-white">{c.source} · {c.title}</p><p className="text-[10px] text-amber-200 mt-1">{deadlineLabel(c.deadline,state.gameTime)}</p></button>)}</div>}
 </div></div>
 <Dialog open={!!selected} onOpenChange={open=>{if(!open&&!sending)defer();}}>
 <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl border-cyan-300/20 bg-slate-950 text-slate-100 p-0 gap-0">
 <div className="relative overflow-hidden px-6 pt-8 pb-6 bg-gradient-to-br from-cyan-950 via-slate-900 to-emerald-950">
 <p className="text-[10px] uppercase tracking-[.3em] text-cyan-300 mb-5">FRACHTFIEBER · Direkte Leitung</p>
 <div className="flex items-center gap-4"><Portrait portraitId={selected?.portraitId} name={selected?.source} size="lg"/><div>
 <DialogTitle className="text-xl">{selected?.source || "Leitstelle"}</DialogTitle>
 <DialogDescription className="text-slate-300 mt-1">{selected?.title}</DialogDescription>
 <div className="flex gap-1 mt-3 items-end h-5" aria-hidden="true">{[8,16,11,20,9,14,6].map((h,i)=><motion.span key={i} className="w-1 rounded bg-emerald-300" style={{height:h}} animate={motionEnabled&&!reduced?{scaleY:[.5,1,.5]}:{scaleY:1}} transition={{duration:.7,delay:i*.07,repeat:3}}/>)}</div>
 </div></div></div>
 <div className="p-5 sm:p-6 space-y-4">
 {!detail ? <p>Dieses Anliegen ist nicht mehr vorhanden.</p> : <>
 <div className="rounded-2xl rounded-tl-sm bg-white/5 border border-white/10 p-4"><p className="text-sm leading-relaxed">{detail.status==="completed"?detail.completionSummary:detail.status==="measure_running"?"Die Maßnahme läuft. Wir melden uns nach Abschluss wieder.":detail.cause}</p></div>
 {detail.status==="decision_open"&&<>
 <p className="flex items-center gap-2 text-xs text-amber-200"><Clock className="w-4 h-4"/>{deadlineLabel(detail.orders.filter(o=>["angenommen","unterwegs"].includes(o.status)&&Number.isFinite(o.deliveryDeadlineMin)).reduce((min,o)=>min===null?o.deliveryDeadlineMin:Math.min(min,o.deliveryDeadlineMin),null),state.gameTime)}</p>
 <p className="text-xs text-slate-400">Was soll das Team tun? Jede Antwort löst die angezeigte Maßnahme aus.</p>
 <div className="space-y-2">{detail.options.map(option=><button key={option.id} disabled={blocked||!option.available} onClick={()=>choose(option.id)} className="w-full text-left rounded-2xl p-4 bg-white/5 border border-white/10 hover:border-cyan-300/50 hover:bg-cyan-400/10 transition disabled:opacity-40 disabled:cursor-not-allowed">
 <span className="font-medium text-sm">{option.label}</span><span className="block text-xs text-slate-300 mt-1">{option.description}</span>
 <span className="block text-xs text-cyan-200 mt-2">{formatEuro(option.costCents||0)} · {option.estimatedDurationMin||0} Min{option.isEstimate?" · geschätzt":""}</span>
 {!option.available&&<span className="block text-xs text-amber-200 mt-1">{option.unavailableReason}</span>}</button>)}</div></>}
 {detail.status!=="decision_open"&&<p className="text-xs text-emerald-300">Entscheidung übernommen. Den Verlauf findest du im Postfach.</p>}
 </>}
 {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
 {automationEnabled&&<button disabled={blocked} onClick={()=>pauseAutomation()} className="text-xs underline text-amber-200">Spielzeit läuft automatisch · jetzt pausieren</button>}
 <button disabled={sending} onClick={defer} className="flex items-center justify-center gap-2 w-full rounded-xl bg-rose-500/15 border border-rose-400/20 text-rose-200 py-3 text-sm"><PhoneOff className="w-4 h-4"/>{detail?.status==="decision_open"?"Auflegen · später zurückrufen":"Gespräch beenden"}</button>
 </div></DialogContent></Dialog>
 </>;
}
