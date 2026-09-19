import React,{useState,useRef} from "react";
import {useGame} from "@/lib/gameContext";
import {getAdvisorPhoneData,ADVISOR_ID} from "@/lib/simulation/investmentAdvisor";
import AdvisorMandate from "./AdvisorMandate";
import StaffPhoneDialog from "@/components/game/StaffPhoneDialog";
import {formatGameTime} from "@/lib/gameData";
import {Phone,UserRound} from "lucide-react";

export default function InvestmentAdvisor({depotId}){
 const {state,send,busy,backgroundAdvance}=useGame();
 const advisor=state.investment?.advisor;
 const [pending,setPending]=useState(false),[error,setError]=useState(""),[calling,setCalling]=useState(false),[ending,setEnding]=useState(false);
 const lock=useRef(false);const blocked=busy||backgroundAdvance?.active||pending;
 async function command(name){if(lock.current||blocked)return;lock.current=true;setPending(true);setError("");try{const r=await send(name,{});if(!r?.ok)throw Error(r?.error||"Auftrag fehlgeschlagen.");setEnding(false);}catch(e){setError(e.message);}finally{lock.current=false;setPending(false);}}
 const data=getAdvisorPhoneData(state);
 return <div className="space-y-4">
 <section className="rounded-2xl border border-violet-300/20 bg-gradient-to-br from-violet-500/10 to-slate-900 p-5 space-y-4">
 <div className="flex gap-3 items-center"><div className="p-3 rounded-full bg-violet-400/15"><UserRound className="text-violet-300"/></div><div><h2 className="font-semibold text-lg">Robin Weber</h2><p className="text-sm text-slate-400">Investmentberater · Firmen- und Privatvermögen</p></div></div>
 <p className="text-sm text-slate-300">Übernimmt Aktien- und Kryptohandel nach getrennten Mandaten. Honorar: <strong>50 € pro Spieltag aus dem Firmenkonto</strong>, auch bei pausiertem Handel. Keine automatische Depotfinanzierung.</p>
 {!advisor?.hired?<button disabled={blocked} onClick={()=>command("hireInvestmentAdvisor")} className="rounded-xl bg-violet-300 text-slate-950 p-3 font-semibold disabled:opacity-40">Berater beauftragen · heute 50 €</button>:<>
 <button disabled={blocked} onClick={()=>setCalling(true)} className="flex items-center gap-2 rounded-xl bg-emerald-400 text-slate-950 p-3 font-semibold"><Phone size={18}/>Investmentberater anrufen</button>
 {advisor.suspended&&<p role="status" className="text-amber-200">Handel pausiert: Das Tageshonorar konnte nicht bezahlt werden.</p>}
 <details><summary className="cursor-pointer text-sm text-slate-300">Status beider Depots</summary><dl className="grid gap-2 mt-3 text-sm">{data?.report.map(r=><div key={r.label} className="flex justify-between gap-4"><dt className="text-slate-400">{r.label}</dt><dd className="text-right">{r.value}</dd></div>)}</dl></details>
 </>}
 {error&&<p role="alert" className="text-red-300">{error}</p>}
 </section>
 {advisor?.hired&&<section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4"><h3 className="font-semibold">Mandat · {depotId==="company"?"Firmendepot":"Privatdepot"}</h3><AdvisorMandate key={depotId+":"+advisor.revision} depotId={depotId}/></section>}
 {!!advisor?.activity?.length&&<section className="rounded-xl border border-white/10 p-4"><h3 className="font-semibold mb-3">Beraterprotokoll · {depotId==="company"?"Firma":"Privat"}</h3><div className="space-y-3 max-h-80 overflow-y-auto">{advisor.activity.filter(e=>e.depotId===depotId).slice(-20).reverse().map(e=><div key={e.id} className="border-b border-white/10 pb-3 text-sm"><p>{formatGameTime(e.atMin)} · {e.side==="buy"?"Kauf":"Verkauf"} {e.instrumentId} · {e.qty}</p><p className="text-xs text-slate-400">{e.reason} · {{filled:"Ausgeführt",open:"Offen",partially_filled:"Teilweise ausgeführt",cancelled:"Storniert",expired:"Abgelaufen",rejected:"Abgewiesen"}[state.investment.depots[depotId].orders.find(o=>o.id===e.id)?.status||e.status]||"Siehe Orderhistorie"}</p></div>)}</div></section>}
 {advisor?.hired&&<div className="text-sm">{!ending?<button disabled={blocked} onClick={()=>setEnding(true)} className="text-slate-400 underline">Beratervertrag beenden</button>:<div className="rounded-xl border border-red-300/20 p-4 space-y-3"><p>Beide Mandate werden beendet und offene Beraterorders storniert. Bestände bleiben erhalten. Ab dem nächsten Spieltag fallen keine Honorare mehr an.</p><button disabled={blocked} onClick={()=>command("stopInvestmentAdvisor")} className="text-red-300 mr-4">Vertrag verbindlich beenden</button><button onClick={()=>setEnding(false)}>Zurück</button></div>}</div>}
 {calling&&<StaffPhoneDialog employeeId={ADVISOR_ID} onClose={()=>setCalling(false)}/>}
 </div>;
}
