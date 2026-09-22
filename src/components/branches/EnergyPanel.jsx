import React, { useMemo, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { ENERGY_UPGRADES, ENERGY_RULES, emptyEnergySite, isElectric } from "@/lib/simulation/energyEngine";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import { Sun, BatteryCharging, PlugZap, Download } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const num=n=>Number(n||0).toLocaleString("de-DE",{maximumFractionDigits:1});
const cell="px-3 py-2 text-right whitespace-nowrap tabular-nums";
const button="rounded-lg border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";
const metrics=[
 ["pvKWh","PV-Erzeugung"],["pvDirectKWh","PV direkt an Lader"],["pvStoredKWh","PV in Gewerbespeicher"],
 ["storageOutKWh","Speicher an Lader"],["storageLossKWh","Speicherverluste"],["exportKWh","Einspeisung"],
 ["gridKWh","Netzbezug Filialladen"],["truckKWh","In Lkw-Batterien (Filialen)"],["chargeLossKWh","Ladeverluste Filialen"],
 ["publicKWh","Netzbezug unterwegs"],["publicBatteryKWh","In Lkw-Batterien (unterwegs)"],["driveKWh","Fahrverbrauch"],
];
export default function EnergyPanel({branchId:fixedBranchId}) {
 const {state,send,showToast,busy}=useGame();
 const [selection,setSelection]=useState(fixedBranchId||"all"),[period,setPeriod]=useState("30"),[pending,setPending]=useState(false);
 const selected=fixedBranchId||selection,today=Math.floor(state.gameTime/1440)+1;
 const branches=(state.branches||[]).filter(b=>selected==="all"||b.id===selected);
 const sites=branches.map(b=>({branch:b,site:state.energy?.sites?.[b.id]||emptyEnergySite()}));
 const rows=useMemo(()=>branches.flatMap(b=>(state.energy?.sites?.[b.id]?.daily||[])
  .filter(r=>period==="all"||r.day>today-Number(period)).map(r=>({...r,branchId:b.id,branchName:b.name})))
  .sort((a,b)=>b.day-a.day||a.branchName.localeCompare(b.branchName)),[state.energy,selected,period,today,state.branches]);
 const totals={};
 for(const item of period==="all"?sites.map(s=>s.site.totals):rows)for(const [k,v] of Object.entries(item))if(typeof v==="number")totals[k]=(totals[k]||0)+v;
 const chart=useMemo(()=>{
  const days=new Map();
  for(const r of rows){const d=days.get(r.day)||{day:r.day,solar:0,grid:0,public:0};
   d.solar+=(r.pvDirectKWh||0)+(r.storageOutKWh||0);d.grid+=r.gridKWh||0;d.public+=r.publicKWh||0;days.set(r.day,d);}
  return [...days.values()].sort((a,b)=>a.day-b.day).slice(-90);
 },[rows]);
 const fleet=(state.vehicles||[]).filter(v=>isElectric(v)&&!["sold","archived"].includes(v.status)&&(selected==="all"||v.branchId===selected));
 const source=(totals.pvDirectKWh||0)+(totals.storageOutKWh||0),input=source+(totals.gridKWh||0)+(totals.publicKWh||0);
 async function install(branchId,upgrade){
  setPending(true);
  try{await send("installEnergyUpgrade",{branchId,upgrade});showToast("Energieausbau ist betriebsbereit.","success");}
  catch(e){showToast(e.message,"error");}finally{setPending(false);}
 }
 function csv(){
  const keys=["day","branchName",...metrics.map(m=>m[0]),"gridCostCents","publicCostCents","exportRevenueCents"];
  const esc=v=>'"'+String(v??0).replaceAll('"','""')+'"';
  const text="\uFEFF"+[keys.join(";"),...rows.map(r=>keys.map(k=>esc(r[k])).join(";"))].join("\r\n");
  const url=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="frachtfieber-energie.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 return <section className="space-y-6">
  <div className="flex flex-wrap items-end justify-between gap-3">
   <div><h2 className="text-xl font-semibold flex gap-2 items-center"><Sun className="text-lime w-5 h-5"/> Energie & E-Mobilität</h2><p className="text-sm text-muted-foreground">Dein Solarstrom. Deine Ladepunkte. Deine elektrische Flotte.</p></div>
   <div className="flex flex-wrap gap-2">
    {!fixedBranchId&&<select aria-label="Energiestandort" className={button+" bg-surface"} value={selected} onChange={e=>setSelection(e.target.value)}><option value="all">Alle Standorte</option>{(state.branches||[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select>}
    <select aria-label="Energiezeitraum" className={button+" bg-surface"} value={period} onChange={e=>setPeriod(e.target.value)}><option value="7">7 Tage</option><option value="30">30 Tage</option><option value="90">90 Tage</option><option value="all">Seit Installation</option></select>
    <button className={button} onClick={csv} disabled={!rows.length}><Download className="w-4 h-4 inline mr-1"/> CSV (Tagesdaten)</button>
   </div>
  </div>
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
   <Stat title="PV erzeugt" value={num(totals.pvKWh)+" kWh"}/>
   <Stat title="Solarstrom in Lkw-Batterien" value={num(source*ENERGY_RULES.chargeEfficiency)+" kWh"}/>
   <Stat title="Netzstrom · Filialen + unterwegs" value={num((totals.gridKWh||0)+(totals.publicKWh||0))+" kWh"}/>
   <Stat title="Solaranteil am Ladestrom" value={num(input?100*source/input:0)+" %"}/>
  </div>
  <div className="grid md:grid-cols-3 gap-3">
   <Stat title="Stromkosten im Zeitraum" value={formatEuro(Math.round((totals.gridCostCents||0)+(totals.publicCostCents||0)))}/>
   <Stat title="Einspeiseerlös im Zeitraum" value={formatEuro(Math.round(totals.exportRevenueCents||0))}/>
   <Stat title="Investitionen seit Installation" value={formatEuro(sites.reduce((n,s)=>n+s.site.investmentCents,0))}/>
  </div>
  <div className="rounded-2xl border border-white/10 p-4 sm:p-6 space-y-5 min-w-0" style={{background:"#101b21",color:"#f1f5f9"}}>
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div><h3 className="font-semibold text-base">Woher kommt der Ladestrom?</h3><p className="text-sm mt-1" style={{color:"#a9bbc7"}}>Täglicher Energiebezug deiner elektrischen Flotte</p></div>
    {chart.length>0&&<span className="rounded-full px-3 py-1 text-xs border border-white/15" style={{color:"#d9e5ed"}}>Tag {chart[0].day} – {chart[chart.length-1].day}</span>}
   </div>
   <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
    {[["#c4f56f","PV + Speicher"],["#60a5fa","Filialnetz"],["#c084fc","Unterwegs"]].map(([color,label])=><span key={label} className="inline-flex items-center gap-2" style={{color:"#e2e8f0"}}><span className="h-2.5 w-2.5 rounded-sm" style={{background:color}}/>{label}</span>)}
   </div>
   {chart.some(d=>d.solar+d.grid+d.public>0)?<div style={{height:300,minWidth:0}}>
    <ResponsiveContainer width="100%" height="100%">
     <BarChart data={chart} margin={{top:12,right:12,bottom:8,left:0}} barCategoryGap="28%" accessibilityLayer>
      <CartesianGrid vertical={false} stroke="#33454f" strokeDasharray="3 6"/>
      <XAxis dataKey="day" tickFormatter={d=>"Tag "+d} tick={{fill:"#becdd7",fontSize:12}} tickLine={false} axisLine={{stroke:"#40535e"}} minTickGap={28} tickMargin={12}/>
      <YAxis width={66} tickFormatter={v=>num(v)} tick={{fill:"#becdd7",fontSize:12}} tickLine={false} axisLine={false} tickMargin={8} label={{value:"kWh",position:"insideTopLeft",fill:"#becdd7",fontSize:11,dy:-12}}/>
      <Tooltip content={<EnergyChartTooltip/>} cursor={{fill:"#ffffff",fillOpacity:0.045}} wrapperStyle={{zIndex:20,outline:"none"}} isAnimationActive={false}/>
      <Bar dataKey="solar" name="PV + Speicher" stackId="energy" fill="#c4f56f" maxBarSize={42} isAnimationActive={false}/>
      <Bar dataKey="grid" name="Filialnetz" stackId="energy" fill="#60a5fa" maxBarSize={42} isAnimationActive={false}/>
      <Bar dataKey="public" name="Unterwegs" stackId="energy" fill="#c084fc" maxBarSize={42} isAnimationActive={false}/>
     </BarChart>
    </ResponsiveContainer>
   </div>:<div className="rounded-xl border border-dashed border-white/15 px-5 py-10 text-center" style={{background:"#14232b"}}>
    <PlugZap className="mx-auto mb-3 h-7 w-7" style={{color:"#c4f56f"}}/>
    <p className="font-medium">Noch kein Ladestrom im gewählten Zeitraum</p>
    <p className="text-sm mt-2 max-w-xl mx-auto" style={{color:"#b6c6d1"}}>PV-Erzeugung allein ist noch kein Lkw-Ladeverbrauch. Sobald deine E-Lkw Strom laden, siehst du hier die Verteilung nach Stromquelle. PV-Erträge und Einspeisung stehen in der Energiebilanz.</p>
   </div>}
   <p className="text-xs leading-relaxed" style={{color:"#a9bbc7"}}>Energie am Ladeeingang, vor Ladeverlusten. Diagramm und CSV zeigen die letzten höchstens 90 Tage; ältere Tagesdaten bleiben im Historienarchiv. Gesamtzähler bleiben erhalten.</p>
  </div>
  <details className="glass rounded-xl border border-white/10 p-4" open><summary className="cursor-pointer font-medium">Detaillierte Energiebilanz</summary><dl className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">{metrics.map(([key,label])=><div key={key}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="tabular-nums">{num(totals[key])} kWh</dd></div>)}</dl></details>
  <div className="grid xl:grid-cols-2 gap-4">{sites.map(({branch:b,site:s})=><article key={b.id} className="glass rounded-xl border border-white/10 p-4 space-y-3">
   <h3 className="font-medium">{b.name} · {b.city}</h3>
   <p className="text-sm"><Sun className="w-4 h-4 inline"/> {s.pvKwp} kWp · <BatteryCharging className="w-4 h-4 inline"/> {num(s.storedKWh)} / {s.storageKWh} kWh · Speicherleistung {s.storageKw} kW</p>
   <p className="text-sm"><PlugZap className="w-4 h-4 inline"/> {s.wallboxes} Wallboxen à 22 kW · {s.dcChargers} DC-Lader à 150 kW · Netz {s.gridKw} kW</p>
   <p className="text-xs text-muted-foreground">Freie E-Lkw in dieser Stadt laden automatisch, nach Fahrzeug-ID und verfügbaren Anschlüssen. PV zuerst, danach Speicher, dann Netz. Überschüsse laden den Speicher oder werden eingespeist. Der Speicher enthält ausschließlich Solarstrom.</p>
   {b.status==="active"&&<div className="grid sm:grid-cols-2 gap-2">{Object.entries(ENERGY_UPGRADES).map(([id,u])=><button key={id} className={button+" text-left"} disabled={busy||pending||state.company.accountCents<u.priceCents||s[u.field]+u.amount>u.max} onClick={()=>install(b.id,id)}><span className="block">{u.label}</span><span className="text-lime">{formatEuro(u.priceCents)}</span></button>)}</div>}
  </article>)}</div>
  <div className="glass rounded-xl border border-white/10 p-4 space-y-3"><h3 className="font-medium">Elektrische Flotte · {fleet.length} Lkw</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Fahrzeug</th><th className={cell}>Batterie</th><th className={cell}>Reichweite bis 10 % Reserve</th><th className={cell}>PV / Netz / unterwegs geladen*</th></tr></thead><tbody>{fleet.map(v=>{const m=state.energy?.vehicleMeters?.[v.id]||{};return <tr key={v.id} className="border-t border-white/10"><td className="py-2">{vehicleDisplayName(v)}<span className="block text-xs text-muted-foreground">{v.locationCity} · {v.status==="free"?"Frei":"Im Einsatz"} · {v.ownership_type==="leased"?"Leasing":"Eigentum"}</span></td><td className={cell}>{num(v.batteryKWh)} / {v.batteryCapacityKWh} kWh</td><td className={cell}>{num(Math.max(0,v.batteryKWh-v.batteryCapacityKWh*0.1)/v.consumptionKWhPer100km*100)} km</td><td className={cell}>{num(m.solarKWh)} / {num(m.gridKWh)} / {num(m.publicKWh)} kWh</td></tr>})}</tbody></table></div><p className="text-xs text-muted-foreground">* Batterieseitig seit Anschaffung. Auslieferung mit voller Batterie ist im Fahrzeugpreis enthalten und zählt nicht als eigener Ladestrom. Fahr- und öffentliche Lademengen werden bei Phasenabschluss verbucht.</p></div>
  <details className="text-xs text-muted-foreground space-y-2"><summary className="cursor-pointer">Spielmodell, Tarife und Abrechnung</summary><p>Fiktive Spielwerte: Filialnetz 0,30 €/kWh, öffentliche Lader 0,65 €/kWh, Einspeisung 0,08 €/kWh. Ladeeffizienz 92 %, Speicher je Richtung 95 %. Stundenweise Sonnenkurve mit Jahreszeit, Stadt und deterministischem Wetter; keine reale Ertragsprognose und kein Gebäudeverbrauch.</p><p>Netzstrom und Einspeisung werden täglich um Mitternacht abgerechnet. Unterwegs-Ladungen werden zum Fahrtstart bezahlt. Öffentliche Lkw-Ladehubs in allen 30 Spielstädten: maximal 300 kW, fünf Minuten Anschlusszeit je Stopp. Ladeleistung wird auf die Fahrzeugleistung begrenzt, Ladezeit zählt konservativ als Arbeitszeit. Keine realen Stationsdaten oder Live-Belegungen. Reichweitenreserve 10 %, öffentliches Ladeziel 90 %. Umwege, Lenkpausen und Ruhezeiten zählen zur Lieferzeit.</p></details>
 </section>;
}
function EnergyChartTooltip({active,payload,label}) {
 if(!active||!payload?.length)return null;
 const total=payload.reduce((sum,item)=>sum+Number(item.value||0),0);
 return <div style={{background:"#0b141b",color:"#f8fafc",border:"1px solid #526674",borderRadius:14,padding:"14px 16px",boxShadow:"0 12px 32px #0009",width:250,maxWidth:"calc(100vw - 64px)"}}>
  <p style={{fontWeight:700,fontSize:14,marginBottom:12}}>Tag {label}</p>
  {payload.map(item=><div key={item.dataKey} style={{display:"flex",alignItems:"center",gap:8,marginTop:9,fontSize:13}}>
   <span style={{width:9,height:9,borderRadius:3,background:item.color,flexShrink:0}}/>
   <span style={{flex:1,color:"#dce6ed"}}>{item.name}</span>
   <span style={{fontVariantNumeric:"tabular-nums",fontWeight:600,color:"#ffffff"}}>{num(item.value)} kWh</span>
  </div>)}
  <div style={{display:"flex",justifyContent:"space-between",gap:12,borderTop:"1px solid #354854",paddingTop:10,marginTop:12,fontSize:13,fontWeight:700}}><span>Gesamt</span><span>{num(total)} kWh</span></div>
 </div>;
}

function Stat({title,value}){return <div className="glass rounded-xl border border-white/10 p-4"><p className="text-xs text-muted-foreground">{title}</p><p className="text-xl font-semibold tabular-nums mt-1">{value}</p></div>;}
