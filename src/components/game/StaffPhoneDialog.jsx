import PhoneScreen from "./PhoneScreen";
import React,{useMemo,useRef,useState} from "react";
import {useGame} from "@/lib/gameContext";
import {getStaffPhoneData} from "@/lib/simulation/staffPhone";
import {formatGameTime,formatEuro} from "@/lib/gameData";
import {Dialog,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import Portrait from "@/components/ui/Portrait";
import {PhoneOff,ClipboardList} from "lucide-react";

export default function StaffPhoneDialog({employeeId,onClose}){
 const {state,send,busy,backgroundAdvance}=useGame();
 const data=useMemo(()=>getStaffPhoneData(state,employeeId),[state,employeeId]);
 const [report,setReport]=useState(false),[draft,setDraft]=useState(null),[sending,setSending]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 const lock=useRef(false);
 const blocked=busy||backgroundAdvance?.active||sending||!data?.contact.available;
 const latest=draft&&data?.actions.find(a=>a.id===draft.id);
 const unchanged=latest&&JSON.stringify(latest.params)===JSON.stringify(draft.params)&&latest.costCents===draft.costCents;
 async function confirm(){
  if(lock.current||blocked||!unchanged||latest.disabled)return;
  lock.current=true;setSending(true);setError("");
  try{
   const result=await send("staffPhoneCommand",{employeeId,...draft.params});
   if(!result?.ok)throw Error(result?.error||"Die Anweisung konnte nicht übernommen werden.");
   setNotice(result.summary);setDraft(null);
  }catch(e){setError(e.message);}finally{lock.current=false;setSending(false);}
 }
 return <Dialog open={!!employeeId} onOpenChange={open=>{if(!open&&!lock.current)onClose();}}>
 <PhoneScreen gameTime={state.gameTime} conversation closingDisabled={sending}>
 <div className="ff-phone-call-header">
 <p className="text-[10px] tracking-[.25em] text-cyan-300 mb-5">FRACHTFIEBER · AUSGEHENDES GESPRÄCH</p>
 <div className="flex items-center gap-4"><Portrait portraitId={data?.contact.portraitId} name={data?.contact.name} size="lg"/><div><DialogTitle>{data?.contact.name||"Kontakt nicht mehr verfügbar"}</DialogTitle><DialogDescription className="text-slate-300 mt-2">{data?.contact.label||"Diese Person ist nicht mehr beschäftigt."}</DialogDescription></div></div>
 </div>
 <div className="ff-phone-call-body space-y-4">
 {data&&!data.contact.available&&<p role="status" className="rounded-xl bg-amber-400/10 p-4 text-amber-200">Derzeit nicht erreichbar: {data.contact.reason}. Bitte während der Dienstzeit erneut anrufen.</p>}
 {data?.contact.available&&<>
 <p className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 p-4 text-sm">Hallo! Möchtest du den aktuellen Stand wissen oder mir eine Anweisung geben?</p>
 <button onClick={()=>setReport(v=>!v)} aria-expanded={report} className="flex gap-2 items-center text-cyan-200 rounded-xl border border-cyan-300/30 p-3 w-full"><ClipboardList className="w-4 h-4"/>Aktuellen Status abfragen</button>
 {report&&<section aria-label="Statusauskunft" className="rounded-xl border border-white/10 p-4 space-y-3"><p className="text-xs text-slate-400">Stand: {formatGameTime(state.gameTime)}</p>{data.report.map(r=><div key={r.label} className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-slate-400">{r.label}</span><span>{r.value}</span></div>)}</section>}
 {!draft&&<div className="space-y-2"><h3 className="text-sm font-semibold">Anweisung erteilen</h3>{data.actions.map(a=><button key={a.id} disabled={blocked||a.disabled} onClick={()=>{setDraft(a);setNotice("");setError("");}} className="block w-full text-left rounded-xl border border-white/10 bg-white/5 p-3 hover:border-cyan-300/40 disabled:opacity-40"><span className="text-sm">{a.label}</span>{a.reason&&<span className="block text-xs text-slate-400 mt-1">{a.reason}</span>}</button>)}</div>}
 {draft&&<section className="rounded-2xl border border-cyan-300/30 bg-cyan-400/5 p-4 space-y-3"><h3 className="font-semibold">{draft.label}</h3><p className="text-sm text-slate-300">{draft.description}</p>{draft.costCents!==undefined&&<p className="text-sm text-cyan-200">Kosten: {formatEuro(draft.costCents)}</p>}{!unchanged&&<p role="alert" className="text-amber-200 text-sm">Dieser Vorschlag hat sich geändert. Bitte erneut auswählen.</p>}<div className="flex gap-2"><button disabled={blocked||!unchanged||latest?.disabled} onClick={confirm} className="flex-1 rounded-xl bg-emerald-400 text-slate-950 p-3 font-semibold disabled:opacity-40">{sending?"Wird übermittelt …":"Anweisung bestätigen"}</button><button disabled={sending} onClick={()=>setDraft(null)} className="rounded-xl border border-white/20 p-3">Zurück</button></div></section>}
 </>}
 {notice&&<p role="status" className="rounded-xl bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</p>}
 {error&&<p role="alert" className="text-red-300 text-sm">{error}</p>}
 {!!data?.tasks.length&&<details className="text-xs text-slate-300"><summary className="cursor-pointer">Letzte beauftragte Aufgaben</summary>{data.tasks.map(t=><div key={t.id} className="mt-3 border-t border-white/10 pt-2"><p>{{assistant_report:"Tagesbericht",assistant_accept_orders:"Auftragsprüfung",assistant_dispatch:"Disposition",assistant_optimize_costs:"Kostenoptimierung"}[t.type]||"Aufgabe"} · {{pending:"Wartet auf Bearbeitung",in_progress:"In Bearbeitung",completed:"Bearbeitet",failed:"Fehlgeschlagen"}[t.status]||t.status}</p>{t.result?.body&&<p className="mt-2 whitespace-pre-wrap">{t.result.body}</p>}</div>)}</details>}
 <p className="text-xs text-slate-400">Die laufende Spielzeit wird durch dieses Gespräch nicht pausiert.</p>
 <button disabled={sending} onClick={onClose} className="ff-phone-hangup"><PhoneOff className="w-4 h-4"/>Gespräch beenden</button>
 </div>
 </PhoneScreen></Dialog>;
}
