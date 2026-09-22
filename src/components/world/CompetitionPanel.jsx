import React, { useRef, useState } from "react";
import { Building2, Users, Truck, ArrowRight, Handshake, Loader2 } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { independentRival, rivalCapacity, rivalStaff, competitionPriceFactor } from "@/lib/simulation/competitionCore";
import { PERSONNEL_ROLES } from "@/lib/simulation/gameRules";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
const money=n=>(Number(n||0)/100).toLocaleString("de-DE",{style:"currency",currency:"EUR"});
const when=m=>"Tag "+(Math.floor(m/1440)+1)+", "+String(Math.floor(m%1440/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
const button="rounded-xl border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed";
const statuses={review:"Prüfung läuft",ready:"Kaufangebot möglich",integrating:"Übergabe läuft",completed:"Abgeschlossen",expired:"Abgelaufen",cancelled:"Zurückgezogen",pending:"Antwort ausstehend",accepted:"Zusage – Einstellung bestätigen",rejected:"Abgelehnt",joining:"Wechsel vereinbart",declined:"Zurückgezogen"};
export default function CompetitionPanel() {
  const {state,send,showToast,busy,backgroundAdvance}=useGame();
  const [selected,setSelected]=useState(null),[section,setSection]=useState("companies"),[pending,setPending]=useState(false),[confirm,setConfirm]=useState(null);
  const branches=(state.branches||[]).filter(b=>b.status==="active");
  const [branchId,setBranchId]=useState(""),[premium,setPremium]=useState(125);
  const lock=useRef(false),c=state.competition;
  const disabled=pending||busy||backgroundAdvance?.active||state.appointments?.some(a=>a.status==="active"&&a.type!=="scenario_timeoff");
  const rivals=state.world.rivals,r=rivals.find(x=>x.id===selected)||rivals[0];
  const targetBranch=branches.some(b=>b.id===branchId)?branchId:branches[0]?.id;
  async function act(command,params) {
    if(lock.current||disabled)return;
    lock.current=true;setPending(true);
    try{const response=await send(command,params);showToast(response?.result?.counterOffer?"Der Verkäufer bleibt beim regulären Kaufpreis.":"Entscheidung gespeichert.","success");setConfirm(null);}
    catch(e){showToast(e.message,"error");}
    finally{lock.current=false;setPending(false);}
  }
  function ask(title,text,command,params){setConfirm({title,text,command,params});}
  const deal=c?.deals.find(d=>d.rivalId===r?.id&&["review","ready","integrating"].includes(d.status));
  const owned=state.vehicles.filter(v=>!["sold","archived"].includes(v.status)).length;
  const competing=rivals.filter(independentRival).reduce((n,x)=>n+rivalCapacity(x),0);
  return <section className="rounded-3xl border border-sky-300/15 bg-[#101b21] p-4 sm:p-6 space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-sky-300">Unternehmen · Menschen · Markt</p><h2 className="text-2xl font-semibold mt-2 text-white">Dein nächster großer Schritt.</h2><p className="text-sm text-slate-400 mt-2 max-w-3xl">Mitbewerber finanzieren Transporte, Personal und Wachstum aus ihren Reserven. Gewinne Aufträge, hole erfahrene Menschen ins Team oder übernimm einen Betrieb.</p></div><Handshake className="text-sky-300 w-8 h-8"/></header>
    <div className="grid sm:grid-cols-3 gap-3">{[["Unabhängige Firmen",rivals.filter(independentRival).length],["Eigener Anteil an erfasster Kapazität",Math.round(100*owned/Math.max(1,owned+competing))+" %"],["Abgeschlossene Übernahmen",rivals.filter(x=>x.businessStatus==="acquired").length]].map(([label,value])=><div key={label} className="bg-white/5 rounded-xl p-4"><p className="text-xs text-slate-400">{label}</p><p className="text-2xl font-semibold mt-2">{value}</p></div>)}</div>
    <p className="text-xs text-slate-400">Kapazitätsanteil: deine Lkw gegenüber den einsatzfähigen Kapazitäten dieser Firmen, kein Anteil am gesamten Transportmarkt. Das regionale Tagesgeschäft der Konkurrenz wird täglich zusammengefasst simuliert.</p>
    <nav className="flex flex-wrap gap-2" aria-label="Wettbewerbsverwaltung">{[["companies","Firmen & Übernahmen"],["staff","Personal abwerben"],["processes","Vorgänge & Antworten"]].map(([id,label])=><button key={id} className={button+(section===id?" bg-sky-300/15 text-sky-200":" text-slate-300")} onClick={()=>setSection(id)} aria-pressed={section===id}>{label}</button>)}</nav>
    {section!=="processes"&&<div className="flex flex-wrap gap-2">{rivals.map(x=><button key={x.id} onClick={()=>setSelected(x.id)} aria-pressed={r?.id===x.id} className={button+(r?.id===x.id?" border-sky-300/50 bg-sky-300/10":"")}>{x.name}{x.businessStatus==="acquired"?" · übernommen":""}</button>)}</div>}
    {section==="companies"&&r&&<div className="grid lg:grid-cols-2 gap-5">
      <article className="rounded-2xl bg-white/5 p-5 space-y-4"><div><p className="text-xs text-sky-300">{r.city} · {r.person}</p><h3 className="text-xl font-semibold mt-1">{r.name}</h3><p className="text-sm text-slate-400 mt-2">{r.strategy}</p></div>
        <dl className="grid grid-cols-2 gap-4 text-sm">{[["Lkw / Transportkapazität",r.fleet+" / "+rivalCapacity(r)],["Mitarbeiter",rivalStaff(r).length],["Betriebsreserve",money(r.cashCents)],["Tagesergebnis",money(r.lastDayNetCents)],["Verlässlichkeit",r.reliability+" / 100"],["Verhältnis",r.relationship+" / 100"],["Reguläre Lieferungen",r.business?.regularDeliveries||0],["Marktpreis in "+r.city,((competitionPriceFactor(state,r.city)-1)*100).toFixed(1)+" %"]].map(([label,value])=><div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
        <p className="text-xs text-slate-400">Preiswirkung gilt für neue Marktangebote ab dieser Stadt. Laufende Verträge bleiben unverändert. Zuschläge am Kai binden Geld und Transportkapazität.</p>
      </article>
      <article className="rounded-2xl border border-sky-300/20 p-5 space-y-4"><Building2 className="text-sky-300"/><h3 className="text-lg font-semibold">Betrieb übernehmen</h3>
        <p className="text-sm text-slate-300">Kaufe die Lkw, übernimm das Team und führe den Standort weiter. Besteht dort bereits eine Filiale, werden Betrieb, Stellplätze und Standortkosten zusammengeführt. Bargeld und alte Schulden des Verkäufers sind nicht Teil des Kaufs.</p>
        {r.businessStatus==="acquired"?<p className="text-sky-200">Dieser Betrieb gehört bereits zu deinem Unternehmen.</p>:deal?<><p className="text-sky-200">{statuses[deal.status]} · {when(deal.status==="ready"?deal.expiresMin:deal.dueMin)}</p>
          {deal.status==="ready"&&<><div className="rounded-xl bg-white/5 p-4 text-sm space-y-2"><p>Kaufpreis: <strong>{money(deal.valuation.priceCents)}</strong></p><p>Fahrzeugwerte: {money(deal.valuation.vehicleCents)}</p><p>Betriebswert: {money(deal.valuation.goodwillCents)}</p><p>Löhne, Standort & Fahrzeuggrundkosten: {money(deal.valuation.dailyCostsCents)} / Tag</p><p className="text-xs text-slate-400">Zusätzlich fallen die normalen Kosten deiner gefahrenen Transporte an.</p></div>
            {deal.counterCents&&<p className="text-amber-200 text-sm">Gegenangebot: {money(deal.counterCents)}</p>}
            <div className="flex flex-wrap gap-2">{[95,100,110].map(percent=><button key={percent} disabled={disabled} className={button} onClick={()=>ask("Kauf verbindlich anbieten",money(Math.round(deal.valuation.priceCents*percent/100))+" werden bei Annahme sofort vom Firmenkonto bezahlt. Übergabe frühestens nach zwei Tagen und nach Abschluss laufender Transporte. Der Kauf ist danach verbindlich.","offerCompetitorPurchase",{dealId:deal.id,percent})}>{percent===95?"Verhandeln":percent===100?"Regulär kaufen":"Premiumangebot"} · {money(Math.round(deal.valuation.priceCents*percent/100))}</button>)}</div></>}
          {["review","ready"].includes(deal.status)&&<button className={button} disabled={disabled} onClick={()=>act("cancelCompetitorPurchase",{dealId:deal.id})}>Prüfung beenden · Prüfgebühr bleibt</button>}
        </>:<button disabled={disabled||!independentRival(r)} className={button+" text-sky-200"} onClick={()=>ask("Unternehmensprüfung beauftragen","Die Prüfung kostet 750 € und dauert einen Spieltag. Danach sind Bewertung und verbindliche Kaufangebote sieben Tage lang verfügbar.","inspectCompetitor",{rivalId:r.id})}>Unternehmen prüfen · 750 € <ArrowRight className="inline w-4 h-4"/></button>}
      </article>
    </div>}
    {section==="staff"&&r&&<div className="space-y-4">
      <div className="flex flex-wrap gap-4"><label className="text-sm space-y-2"><span className="block text-slate-400">Zielfiliale</span><select className="bg-slate-900 rounded-lg border border-white/15 p-2" value={targetBranch||""} onChange={e=>setBranchId(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="text-sm space-y-2"><span className="block text-slate-400">Gehaltsangebot</span><select className="bg-slate-900 rounded-lg border border-white/15 p-2" value={premium} onChange={e=>setPremium(Number(e.target.value))}>{[110,125,150].map(x=><option key={x} value={x}>{x} % des bisherigen Gehalts</option>)}</select></label></div>
      <p className="text-sm text-slate-400">Antwort nach einem Tag. Bei Zusage entscheidest du erneut: fünf Tagesgehälter Wechselprämie, anschließend mindestens zwei Tage Übergabe. Nicht jedes Angebot wird angenommen. Abwerben belastet das Verhältnis zum Mitbewerber.</p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{rivalStaff(r).map(p=>{
        const a=c?.recruitments.find(a=>a.personId===p.id&&(["pending","accepted","joining"].includes(a.status)||state.gameTime<(a.cooldownUntilMin||0)));
        const salary=Math.round(p.costPerDayCents*premium/100);
        return <article key={p.id} className="bg-white/5 rounded-xl p-4 space-y-3"><Users className="w-5 h-5 text-sky-300"/><h3 className="font-medium">{p.name}</h3><p className="text-xs text-slate-400">{PERSONNEL_ROLES[p.role]?.label} · Zufriedenheit {p.satisfaction}/100</p><p className="text-sm">Bisher {money(p.costPerDayCents)} / Tag<br/>Angebot <strong>{money(salary)} / Tag</strong></p><p className="text-xs text-slate-400">Wechselprämie bei Einstellung: {money(salary*5)}</p>{a?<p className="text-xs text-sky-200">{statuses[a.status]} · Details unter Vorgänge{a.cooldownUntilMin>state.gameTime&&!["pending","accepted","joining"].includes(a.status)?" · erneutes Angebot ab "+when(a.cooldownUntilMin):""}</p>:<button className={button} disabled={disabled||!targetBranch||!independentRival(r)||!!deal} onClick={()=>act("approachCompetitorEmployee",{rivalId:r.id,personId:p.id,branchId:targetBranch,salaryPercent:premium})}>Unverbindlich ansprechen</button>}</article>;
      })}</div>{!rivalStaff(r).length&&<p className="text-slate-400 text-sm">Das Team wurde bereits übernommen.</p>}
    </div>}
    {section==="processes"&&<div className="space-y-3">
      {!(c?.deals.length||c?.recruitments.length)&&<p className="text-slate-400">Noch keine Übernahme oder Abwerbung gestartet.</p>}
      {[...(c?.deals||[]),...(c?.recruitments||[])].sort((a,b)=>b.requestedAtMin-a.requestedAtMin).map(a=><article key={a.id} className="rounded-xl bg-white/5 p-4 flex flex-wrap justify-between gap-4"><div><h3 className="font-medium">{a.personName||rivals.find(x=>x.id===a.rivalId)?.name}</h3><p className="text-sm text-sky-200 mt-1">{statuses[a.status]||a.status}</p>{["pending","joining","review","integrating"].includes(a.status)&&<p className="text-xs text-slate-400 mt-2">Nächster Schritt: {when(a.dueMin)}</p>}{["accepted","ready"].includes(a.status)&&<p className="text-xs text-slate-400 mt-2">Gültig bis {when(a.expiresMin)}</p>}{a.salaryCents&&<p className="text-xs text-slate-400 mt-2">{money(a.salaryCents)} / Tag · Wechselprämie {money(a.bonusCents)}</p>}{a.vehicleIds&&<p className="text-xs text-slate-400 mt-2">{a.vehicleIds.length} Lkw · {a.personIds.length} Mitarbeiter übergeben</p>}</div><div className="flex items-center gap-2">
        {a.status==="accepted"&&<button disabled={disabled} className={button+" text-sky-200"} onClick={()=>ask(a.personName+" einstellen",money(a.bonusCents)+" Wechselprämie sofort; "+money(a.salaryCents)+" tägliches Gehalt ab Arbeitsbeginn. Der Wechsel wird verbindlich vereinbart.","hireCompetitorEmployee",{recruitmentId:a.id})}>Einstellung bestätigen</button>}
        {["accepted","pending"].includes(a.status)&&<button disabled={disabled} className={button} onClick={()=>act("declineCompetitorEmployee",{recruitmentId:a.id})}>Zurückziehen</button>}
        {a.status==="ready"&&<button className={button} onClick={()=>{setSelected(a.rivalId);setSection("companies");}}>Kaufangebote ansehen</button>}
      </div></article>)}
    </div>}
    <Dialog open={!!confirm} onOpenChange={open=>{if(!open&&!pending)setConfirm(null);}}><DialogContent className="bg-[#101b21] border-white/15 text-white"><DialogHeader><DialogTitle>{confirm?.title}</DialogTitle><DialogDescription className="text-slate-300 leading-relaxed">{confirm?.text}</DialogDescription></DialogHeader><div className="flex justify-end gap-3 mt-4"><button className={button} disabled={pending} onClick={()=>setConfirm(null)}>Abbrechen</button><button className={button+" bg-sky-300/15 text-sky-200"} disabled={disabled} onClick={()=>act(confirm.command,confirm.params)}>{pending&&<Loader2 className="inline w-4 h-4 animate-spin mr-2"/>}Verbindlich bestätigen</button></div></DialogContent></Dialog>
  </section>;
}
