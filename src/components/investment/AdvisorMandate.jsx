import React,{useState,useRef} from "react";
import {useGame} from "@/lib/gameContext";
import {getAdvisorPolicy,ADVISOR_ID} from "@/lib/simulation/investmentAdvisor";
import {formatEuro} from "@/lib/gameData";

export default function AdvisorMandate({depotId,phone=false}){
 const {state,send,busy,backgroundAdvance}=useGame();
 const initial=getAdvisorPolicy(state,depotId);
 const [policy,setPolicy]=useState(initial),[review,setReview]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const revision=useRef(state.investment.advisor.revision),lock=useRef(false);
 const blocked=busy||backgroundAdvance?.active||pending;
 const stale=revision.current!==state.investment.advisor.revision;
 const label=depotId==="company"?"Firmendepot":"Privatdepot";
 async function confirm(){
  if(lock.current||blocked||stale)return;lock.current=true;setPending(true);setError("");
  try{
   const params={depotId,policy,expectedRevision:revision.current};
   const r=await send(phone?"staffPhoneCommand":"configureInvestmentAdvisor",phone?{employeeId:ADVISOR_ID,action:"advisor_policy",...params}:params);
   if(!r?.ok)throw Error(r?.error||"Mandat konnte nicht gespeichert werden.");
   setNotice(r.summary);setReview(false);
  }catch(e){setError(e.message);}finally{lock.current=false;setPending(false);}
 }
 const check=(key,label)=><label key={key} className="flex items-center gap-3 text-sm py-2"><input type="checkbox" checked={policy[key]} onChange={e=>setPolicy(p=>({...p,[key]:e.target.checked}))} className="accent-emerald-400 w-4 h-4"/>{label}</label>;
 return <section aria-label={"Handelsmandat "+label} className="space-y-4">
 <p className="text-xs text-slate-400">Gilt nur für das {label}. Käufe verwenden ausschließlich dessen freie Depotmittel. Keine automatischen Überweisungen.</p>
 {!review?<fieldset disabled={blocked} className="space-y-4 disabled:opacity-50">
 <div className="rounded-xl border border-white/10 p-3">{check("enabled","Autonomen Handel aktivieren")}{check("allowBuy","Käufe erlauben")}{check("allowSell","Verkäufe erlauben – auch bestehende Positionen")}{check("allowStocks","Aktien handeln")}{check("allowCrypto","Krypto handeln")}</div>
 <label className="block text-xs">Strategie<select aria-label="Anlagestrategie" value={policy.strategy} onChange={e=>setPolicy(p=>({...p,strategy:e.target.value}))} className="block w-full bg-slate-900 border border-white/20 rounded-lg p-3 mt-2"><option value="defensive">Defensiv · nur niedrige Risikoklassen</option><option value="balanced">Ausgewogen · niedrige und mittlere Risiken</option><option value="growth">Wachstum · positive Kurstrends, auch hohe Risiken</option></select></label>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 {[["dailyBudgetCents","Kaufbudget pro Tag (€)",100,10,1000000000],["reserveCents","Depotreserve (€)",100,0,1000000000],["maxPositionPct","Max. Einzelposition (%)",1,5,100],["stopLossPct","Verlustgrenze (%)",1,1,90],["takeProfitPct","Gewinnziel (%)",1,1,500],["maxTradesPerDay","Max. Orders pro Tag",1,1,12]].map(([key,label,factor,min,max])=><label key={key} className="block text-xs">{label}<input aria-label={label} type="number" min={min} max={max} step={factor===100?.01:1} value={Number.isFinite(policy[key])?policy[key]/factor:""} onChange={e=>setPolicy(p=>({...p,[key]:e.target.value===""?NaN:Math.round(Number(e.target.value)*factor)}))} className="w-full rounded-lg border border-white/20 bg-slate-900 p-3 mt-2"/></label>)}
 </div>
 <p className="text-xs text-slate-400">Prüfung stündlich in Spielzeit. Gewinn-/Verlustgrenzen lösen Verkaufsaufträge aus, garantieren aber keinen Ausführungskurs. Positionsgrenze gilt bei neuen Käufen. Bereits heute beauftragte Käufe bleiben auf das Tagesbudget angerechnet.</p>
 <button type="button" disabled={stale} onClick={()=>setReview(true)} className="w-full rounded-xl bg-emerald-400 text-slate-950 p-3 font-semibold disabled:opacity-40">Mandat prüfen</button>
 </fieldset>:<div className="rounded-xl border border-emerald-400/30 bg-emerald-400/5 p-4 space-y-3">
 <h4 className="font-semibold">{label}: {policy.enabled?"Handel freigeben":"Handel pausieren"}</h4>
 <p className="text-sm">{policy.allowStocks?"Aktien ":""}{policy.allowCrypto?"Krypto":""} · {policy.allowBuy?"Kaufen ":""}{policy.allowSell?"Verkaufen":""}</p>
 <p className="text-sm">Kaufbudget: {formatEuro(policy.dailyBudgetCents)}/Tag · Reserve: {formatEuro(policy.reserveCents)}</p>
 <p className="text-sm">Einzelposition höchstens {policy.maxPositionPct}% · maximal {policy.maxTradesPerDay} Orders/Tag · Gewinnziel {policy.takeProfitPct}% · Verlustgrenze {policy.stopLossPct}%.</p>
 <p className="text-xs text-slate-400">Offene Beraterorders dieses Depots werden beim Speichern storniert. Manuelle Orders bleiben bestehen. Verkäufe können Verluste realisieren.</p>
 <div className="flex gap-2"><button disabled={blocked||stale} onClick={confirm} className="flex-1 bg-emerald-400 text-slate-950 rounded-xl p-3 disabled:opacity-40">{pending?"Wird übernommen …":"Mandat bestätigen"}</button><button disabled={pending} onClick={()=>setReview(false)} className="p-3 border border-white/20 rounded-xl">Zurück</button></div>
 </div>}
 {stale&&<p role="alert" className="text-amber-200 text-xs">Einstellungen geändert. Bitte das Mandat erneut öffnen.</p>}
 {error&&<p role="alert" className="text-red-300 text-sm">{error}</p>}{notice&&<p role="status" className="text-emerald-300 text-sm">{notice}</p>}
 </section>;
}
