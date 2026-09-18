import PhoneConversation from "./PhoneConversation";
import { getPhoneProposals } from "@/lib/simulation/phoneProposals";
import OfficeAudioControls from "./OfficeAudioControls";
import { setOfficeDucked } from "@/lib/officeAudio";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Phone, PhoneIncoming, PhoneOff, Clock, Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { getCommunicationQueue, deadlineLabel } from "@/lib/communicationData";
import { getDisruptionDetail } from "@/lib/simulation/disruptionEngine";
import { formatGameTime } from "@/lib/gameData";
import { startPhoneRinging } from "@/lib/phoneRinging";
import { playPhoneSound, stopPhoneSound, useSoundEnabled, useSoundVolume, usePhoneAudioStatus, phoneRingUrl, setSoundEnabled } from "@/lib/experienceSound";
import Portrait from "@/components/ui/Portrait";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function PhoneCenter() {
 const { state,send,busy,backgroundAdvance,overlay,motionEnabled,automationEnabled,pauseAutomation }=useGame();
 const navigate=useNavigate(), reduced=useReducedMotion();
 const queue=useMemo(()=>getCommunicationQueue(state),[state]);
 const [selected,setSelected]=useState(null),[showList,setShowList]=useState(false),[later,setLater]=useState([]);
 const [sending,setSending]=useState(false),[error,setError]=useState("");
 const ringCounts=useRef(new Map());
 const soundReady=useSoundEnabled();
 const phoneAudioStatus=usePhoneAudioStatus(), soundVolume=useSoundVolume();
 const [playerStatus,setPlayerStatus]=useState("");
 const incoming=queue.calls.find(c=>!later.includes(c.id));
 useEffect(()=>{setOfficeDucked(!!incoming||!!selected);return()=>setOfficeDucked(false);},[!!incoming,!!selected]);
 const recent=(state.disruptions?.items||[]).filter(d=>d.status==="completed").slice(-5).reverse();

 const canRing=soundReady && !selected && !overlay && !backgroundAdvance?.active;
 useEffect(()=>{
  if (!incoming || !canRing || document.hidden) return;
  for(const id of ringCounts.current.keys())if(!queue.calls.some(c=>c.id===id))ringCounts.current.delete(id);
  const remaining=3-(ringCounts.current.get(incoming.id)||0);
  const stop=startPhoneRinging(()=>{
   ringCounts.current.set(incoming.id,(ringCounts.current.get(incoming.id)||0)+1);
   void playPhoneSound("ring");
  },setInterval,clearInterval,remaining);
  const onVisibility=()=>{if(document.hidden){stop();stopPhoneSound("ring");}};
  document.addEventListener("visibilitychange",onVisibility);
  return ()=>{stop();stopPhoneSound("ring");document.removeEventListener("visibilitychange",onVisibility);};
 },[incoming?.id,canRing]);
 const detail=useMemo(()=>selected?.demo ? {
  status:"decision_open", cause:"Hier ist die Leitstelle. Das ist ein Testanruf. Du kannst annehmen und auflegen; deine Spedition bleibt unverändert.",
  orders:[],options:[{id:"demo_done",label:"Verstanden – Verbindung steht",description:"Testgespräch beenden",costCents:0,estimatedDurationMin:0,available:true}]
 } : selected?.type==="delivery_risk" ? (() => {
 const risk=queue.calls.find(c=>c.id===selected.id);
 if(!risk)return {status:"completed",completionSummary:"Diese Liefergefährdung besteht im aktuellen Spielstand nicht mehr.",orders:[],options:[]};
 return {status:"decision_open",cause: risk.customer+": "+risk.fromCity+" → "+risk.toCity+". "+risk.description+(risk.eta!==null?" Geplante Ankunft: "+formatGameTime(risk.eta)+".":""),
 orders:[{status:"angenommen",deliveryDeadlineMin:risk.deadline}],
 options:[]};
 })() : selected ? getDisruptionDetail(state,selected.id) : null,[state,selected,queue.calls]);
 function testCall(){
  setError("");setPlayerStatus("");setShowList(false);
  void setSoundEnabled(true,{preview:false});
  void playPhoneSound("test");
  setSelected({id:"demo",demo:true,source:"Leitstelle · Testanruf",title:"Verbindungstest"});
 }
 const blocked=busy || !!backgroundAdvance?.active || sending;
 const defer=()=>{stopPhoneSound("test");if(selected && !selected.demo)setLater(prev=>[...new Set([...prev.filter(id=>queue.calls.some(c=>c.id===id)),selected.id])]);setSelected(null);setError("");};
 const answer=call=>{setSelected(call);setShowList(false);setError("");};
 const proposals=useMemo(()=>{
  if(!selected || selected.demo)return [];
  if(selected.type!=="delivery_risk" && detail?.status!=="decision_open"){
   const orderId=detail?.orderIds?.[0];
   return orderId?getPhoneProposals(state,{type:"delivery_risk",orderId}).filter(p=>p.informationOnly):[];
  }
  return getPhoneProposals(state,selected);
 },[state,selected,detail]);
 async function confirmProposal(option){
  const result=await send(option.command,option.params);
  return result;
 }
 return <>
 <button onClick={()=>setShowList(true)} aria-label={incoming?"Eingehender Anruf – Telefon öffnen":`Telefon öffnen · ${queue.calls.length} offene Anliegen`} title="Telefon"
 className={`relative w-9 h-9 grid place-items-center rounded-full border shrink-0 ${incoming?"border-emerald-300 bg-emerald-400/15 text-emerald-200":"border-white/10 bg-white/5 text-muted-foreground hover:text-lime"}`}>
 <Phone className="w-4 h-4"/>
 {queue.calls.length>0&&<span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-emerald-300 text-slate-950 text-[9px] font-bold">{queue.calls.length>9?"9+":queue.calls.length}</span>}
 </button>
 <Dialog open={showList&&!selected} onOpenChange={setShowList}>
 <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto rounded-2xl border-cyan-200/20 bg-slate-950 text-white p-4">
 <DialogTitle>Telefon · {queue.calls.length} offen</DialogTitle>
 <DialogDescription className="text-slate-400">Anrufe und Rückrufe deiner Leitstelle. Die laufende Spielzeit läuft auch während des Gesprächs weiter.</DialogDescription>
 <button onClick={()=>{setShowList(false);navigate("/postfach");}} className="text-xs flex items-center gap-2 text-slate-300"><Mail className="w-4 h-4"/>Postfach · {queue.emails.length} Entscheidungen</button>
 {incoming && !selected && !overlay && <div className="border-t border-white/10 p-3">
 <div className="flex items-center gap-3"><motion.div animate={motionEnabled&&!reduced?{rotate:[0,-12,12,0]}:{rotate:0}} transition={{duration:.5,repeat:2}}><PhoneIncoming className="text-emerald-300 w-6 h-6"/></motion.div><div><p className="text-sm font-semibold text-white">{incoming.source}</p><p className="text-xs text-slate-300">{incoming.title}</p></div></div>
 <div className="flex gap-2 mt-3"><button disabled={blocked} onClick={()=>answer(incoming)} className="flex-1 rounded-xl bg-emerald-400 text-slate-950 py-2 text-xs font-semibold disabled:opacity-50">Annehmen</button><button onClick={()=>setLater(prev=>[...new Set([...prev,incoming.id])])} className="rounded-xl bg-white/10 text-white px-3 text-xs">Später</button></div></div>}
 {showList && <div className="border-t border-white/10 p-2 max-h-64 overflow-y-auto">{queue.calls.length===0?<p className="p-2 text-xs text-slate-400">Keine offenen Rückrufe.</p>:queue.calls.map(c=><button key={c.id} disabled={blocked} onClick={()=>answer(c)} className="w-full text-left rounded-xl hover:bg-white/10 p-3 disabled:opacity-50"><p className="text-xs font-medium text-white">{c.source} · {c.title}</p><p className="text-[10px] text-amber-200 mt-1">{deadlineLabel(c.deadline,state.gameTime)}</p></button>)}</div>}
 {showList && <div className="border-t border-white/10 px-3 py-3 space-y-2">
 <OfficeAudioControls compact />
 <button disabled={blocked} onClick={testCall} className="w-full rounded-lg border border-cyan-300/30 py-2 text-xs text-cyan-100 disabled:opacity-40">Testanruf starten · Ton aktivieren</button>
 <p className="text-[10px] text-slate-400">Anrufe entstehen bei offenen dringenden Einsätzen. Automatisch gelöste Anliegen bleiben im Verlauf sichtbar.</p>
 {recent.length>0&&<details className="text-xs text-slate-300"><summary className="cursor-pointer">Letzte erledigte Anliegen ({recent.length})</summary>{recent.map(d=><div key={d.id} className="mt-2 border-t border-white/10 pt-2"><p>{d.cause}</p><p className="text-[10px] text-emerald-200">{d.autoResolved ? "Vom Team erledigt" : "Erledigt"}{d.autoResolvedBy ? " · "+d.autoResolvedBy : ""}</p></div>)}</details>}
 </div>}
 </DialogContent></Dialog>
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
 {selected?.demo && <section className="rounded-xl border border-cyan-300/30 bg-cyan-400/5 p-4 space-y-3" aria-label="Klingelton testen">
 <p className="text-sm font-medium">Klingelton direkt abspielen</p>
 <audio controls preload="auto" src={phoneRingUrl} className="w-full" aria-label="Klingelton-Audioplayer"
 ref={node=>{if(node)node.volume=soundVolume;}}
 onPlay={()=>{stopPhoneSound("test");setPlayerStatus("Wiedergabe gestartet. Bewegt sich die Zeitanzeige, aber du hörst nichts? Bitte den Browser-Tab entstummen und die Audioausgabe prüfen.");}}
 onError={()=>setPlayerStatus("Die Audiodatei konnte nicht geladen werden. Bitte diese Spielversion erneut veröffentlichen und die Seite neu laden.")}
 onEnded={()=>setPlayerStatus("Wiedergabe beendet.")}/>
 <p role="status" className="text-xs text-cyan-100">{playerStatus || phoneAudioStatus}</p>
 <p className="text-xs text-slate-300">Dieser Test spielt einen Klingelton ab, keine gesprochenen Dialoge.</p>
 </section>}
 {!detail ? <p>Dieses Anliegen ist nicht mehr vorhanden.</p> : <>
 <div className="rounded-2xl rounded-tl-sm bg-white/5 border border-white/10 p-4"><p className="text-sm leading-relaxed">{detail.status==="completed"?detail.completionSummary:detail.status==="measure_running"?"Die Maßnahme läuft. Wir melden uns nach Abschluss wieder.":detail.cause}</p></div>
 {detail.status==="decision_open"&&<>
 <p className="flex items-center gap-2 text-xs text-amber-200"><Clock className="w-4 h-4"/>{deadlineLabel(detail.orders.filter(o=>["angenommen","unterwegs"].includes(o.status)&&Number.isFinite(o.deliveryDeadlineMin)).reduce((min,o)=>min===null?o.deliveryDeadlineMin:Math.min(min,o.deliveryDeadlineMin),null),state.gameTime)}</p>
 </>}
 {detail.status!=="decision_open"&&<p className="text-xs text-emerald-300">Entscheidung übernommen. Den Verlauf findest du im Postfach.</p>}
 </>}
 {selected&&!selected.demo&&<PhoneConversation key={selected.id} proposals={proposals} blocked={busy||!!backgroundAdvance?.active} onConfirm={confirmProposal} onBusy={setSending}/>}
 {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
 {automationEnabled&&<button disabled={blocked} onClick={()=>pauseAutomation()} className="text-xs underline text-amber-200">Spielzeit läuft automatisch · jetzt pausieren</button>}
 <button disabled={sending} onClick={defer} className="flex items-center justify-center gap-2 w-full rounded-xl bg-rose-500/15 border border-rose-400/20 text-rose-200 py-3 text-sm"><PhoneOff className="w-4 h-4"/>{detail?.status==="decision_open"?"Auflegen · später zurückrufen":"Gespräch beenden"}</button>
 </div></DialogContent></Dialog>
 </>;
}
