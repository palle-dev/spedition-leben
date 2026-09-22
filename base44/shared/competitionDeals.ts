import { processCompetitionCooperation } from "./competitionCooperation.ts";
import { migrateCompetition, independentRival, rivalStaff, competitionValuation, competitionNotice, competitionRandom, joinPlayer } from "./competitionCore.ts";
import { postJournal, registerAsset } from "./accountingEngine.ts";
import { retainHistory } from "./historyRetention.ts";
const DAY=1440;
export const COMPETITION_COMMANDS=["inspectCompetitor","offerCompetitorPurchase","cancelCompetitorPurchase","approachCompetitorEmployee","hireCompetitorEmployee","declineCompetitorEmployee"];
function funds(state,cents) {
  if(!Number.isSafeInteger(cents)||cents<=0)throw new Error("Ungültiger Betrag.");
  if((state.openCosts||[]).some(o=>o.account==="company"))throw new Error("Zuerst offene betriebliche Kosten begleichen.");
  if(state.company.accountCents<cents)throw new Error("Das Firmenkonto reicht nicht aus.");
}
function pay(state,cents,account,text,id) {
  postJournal(state,{text,sourceEventId:id,lines:[{account,debit:cents},{account:"1000",credit:cents}]});
}
function byId(state,id) {
  const r=state.world?.rivals.find(r=>r.id===id);
  if(!independentRival(r))throw new Error("Diese Firma steht nicht mehr als unabhängiger Mitbewerber zur Verfügung.");
  return r;
}
function newId(state,prefix){return prefix+"_"+(++state.competition.sequence);}
function personFor(r,id){const p=rivalStaff(r).find(p=>p.id===id);if(!p)throw new Error("Diese Person steht nicht mehr zur Verfügung.");return p;}
function activeBranch(state,id){const b=state.branches.find(b=>b.id===id&&b.status==="active");if(!b)throw new Error("Bitte eine aktive Zielfiliale wählen.");return b;}
export function handleCompetitionCommand(state,command,p: any={}) {
  if(!COMPETITION_COMMANDS.includes(command))return null;
  migrateCompetition(state);
  if(!state.competition)throw new Error("Bitte zuerst die Spielwelt betreten.");
  const c=state.competition,m=state.gameTime;
  if(command==="inspectCompetitor"){
    const r=byId(state,p.rivalId);
    const existing=c.deals.find(d=>d.rivalId===r.id&&["review","ready","integrating"].includes(d.status));
    if(existing)return {ok:true,alreadyApplied:true,dealId:existing.id};
    if(c.recruitments.some(a=>a.rivalId===r.id&&["pending","accepted","joining"].includes(a.status)))throw new Error("Bitte zuerst offene Personalangebote abschließen oder zurückziehen.");
    funds(state,75000);const id=newId(state,"deal");
    pay(state,75000,"5700","Unternehmensprüfung: "+r.name,id);
    c.deals.push({id,rivalId:r.id,status:"review",requestedAtMin:m,dueMin:m+DAY});
    return {ok:true,dealId:id};
  }
  if(command==="cancelCompetitorPurchase"){
    const d=c.deals.find(d=>d.id===p.dealId);
    if(!d||!["review","ready"].includes(d.status))throw new Error("Diese Prüfung kann nicht mehr beendet werden.");
    d.status="cancelled";d.endedAtMin=m;return {ok:true};
  }
  if(command==="offerCompetitorPurchase"){
    const d=c.deals.find(d=>d.id===p.dealId);
    if(d?.status==="integrating"||d?.status==="completed")return {ok:true,alreadyApplied:true};
    if(!d||d.status!=="ready"||m>=d.expiresMin)throw new Error("Unternehmensprüfung fehlt oder ist abgelaufen.");
    const r=byId(state,d.rivalId);
    if(c.recruitments.some(a=>a.rivalId===r.id&&a.status==="joining"))throw new Error("Bitte den bereits vereinbarten Personalwechsel abwarten.");
    if(![95,100,110].includes(p.percent))throw new Error("Unbekanntes Kaufangebot.");
    const amount=Math.round(d.valuation.priceCents*p.percent/100);
    const minimum=r.relationship>=65||r.cashCents<100000?95:r.relationship<30?110:100;
    if(p.percent<minimum){d.counterCents=Math.round(d.valuation.priceCents*minimum/100);return {ok:true,counterOffer:true};}
    funds(state,amount);
    pay(state,amount,"1320","Übernahme-Anzahlung: "+r.name,d.id+"_purchase");
    Object.assign(d,{status:"integrating",priceCents:amount,dueMin:Math.max(m+2*DAY,...r.jobs.map(j=>j.endMin),...(c.rentals||[]).filter(x=>x.rivalId===r.id&&x.status==="active").map(x=>x.dueMin)),snapshot:structuredClone(r.business)});
    r.businessStatus="integrating";
    for(const a of c.recruitments)if(a.rivalId===r.id&&["pending","accepted"].includes(a.status))a.status="cancelled";
    competitionNotice(state,"Übernahme vereinbart: "+r.name,"Der Kaufpreis ist bezahlt. Laufende Ausschreibungen werden vor der Übergabe abgeschlossen. Fahrzeuge, Personal und Standortbetrieb gehen an dich; Bargeld und Altverbindlichkeiten bleiben beim Verkäufer.");
    return {ok:true};
  }
  if(command==="approachCompetitorEmployee"){
    const r=byId(state,p.rivalId),person=personFor(r,p.personId);
    if(c.deals.some(d=>d.rivalId===r.id&&["review","ready"].includes(d.status)))throw new Error("Während der Unternehmensprüfung sind Personalangebote gesperrt.");
    const old=c.recruitments.find(a=>a.personId===person.id&&(["pending","accepted","joining"].includes(a.status)||m<(a.cooldownUntilMin||0)));
    if(old)throw new Error("Für diese Person läuft bereits ein Angebot oder eine Wartefrist.");
    if(![110,125,150].includes(p.salaryPercent))throw new Error("Unbekanntes Gehaltsangebot.");
    activeBranch(state,p.branchId);
    const salary=Math.round(person.costPerDayCents*p.salaryPercent/100),bonus=salary*5;
    const chance=Math.max(.15,Math.min(.9,.25+(p.salaryPercent-100)/100+(70-person.satisfaction)/100));
    c.recruitments.push({id:newId(state,"recruit"),rivalId:r.id,personId:person.id,personName:person.name,role:person.role,
      branchId:p.branchId,salaryCents:salary,bonusCents:bonus,chance,willAccept:competitionRandom(state)<chance,status:"pending",requestedAtMin:m,dueMin:m+DAY,cooldownUntilMin:m+14*DAY});
    return {ok:true};
  }
  const a=c.recruitments.find(a=>a.id===p.recruitmentId);
  if(!a)throw new Error("Personalangebot nicht gefunden.");
  if(command==="declineCompetitorEmployee"){
    if(!["pending","accepted"].includes(a.status))throw new Error("Dieses Angebot kann nicht mehr zurückgezogen werden.");
    a.status="declined";return {ok:true};
  }
  if(a.status==="joining"||a.status==="completed")return {ok:true,alreadyApplied:true};
  if(a.status!=="accepted"||m>=a.expiresMin)throw new Error("Keine gültige Zusage vorhanden.");
  const r=byId(state,a.rivalId),person=personFor(r,a.personId);
  activeBranch(state,a.branchId);funds(state,a.bonusCents);
  pay(state,a.bonusCents,"5140","Wechselprämie: "+person.name,a.id);
  // Notice is paid by the former employer; no existing rival tender is interrupted.
  a.status="joining";a.dueMin=Math.max(m+2*DAY,...r.jobs.map(j=>j.endMin));
  r.relationship=Math.max(0,r.relationship-8);
  return {ok:true};
}
function closeDeal(state,d,r) {
  let branch=state.branches.find(b=>b.status==="active"&&b.city===r.city);
  if(!branch){
    state.idCounter=(state.idCounter||100)+1;
    branch={id:"branch_"+state.idCounter,name:r.name+" · "+r.city,city:r.city,status:"active",costPerDayCents:r.business.siteCostCents,
      openedAtMin:state.gameTime,stats:{revenueCents:0,deliveries:0,expensesCents:0},cleanliness:85,lastCleaningDay:0,isHeadquarters:false,parkingSlotsBase:r.fleet+2};
    state.branches.push(branch);
  } else {
    branch.parkingSlotsBase=(branch.parkingSlotsBase??Math.max(8,state.vehicles.filter(v=>v.branchId===branch.id).length+2))+r.fleet+2;
    branch.costPerDayCents+=r.business.siteCostCents;
  }
  const vehicleTotal=Math.min(d.priceCents,r.business.vehicles.reduce((n,v)=>n+v.bookValueCents,0));
  const goodwill=d.priceCents-vehicleTotal;
  postJournal(state,{text:"Übernahme abgeschlossen: "+r.name,sourceEventId:d.id+"_close",
    lines:[{account:"1200",debit:vehicleTotal},{account:"1220",debit:goodwill},{account:"1320",credit:d.priceCents}]});
  let allocated=0;d.vehicleIds=[];d.personIds=[];
  r.business.vehicles.forEach((v,i)=>{
    state.idCounter=(state.idCounter||100)+1;
    const value=i===r.business.vehicles.length-1?vehicleTotal-allocated:Math.floor(vehicleTotal/r.business.vehicles.length);allocated+=value;
    const vehicle={...v,id:"v_"+state.idCounter,branchId:branch.id,locationCity:branch.city,status:"free",tripId:null,maintenanceUntil:null,
      bookValueCents:value,acquiredAtMin:state.gameTime,markedForSale:false,saleOffer:null,acquiredFrom:r.id};
    state.vehicles.push(vehicle);d.vehicleIds.push(vehicle.id);
    registerAsset(state,{vehicleId:vehicle.id,account:"1200",name:vehicle.type+" · "+r.name,acquisitionCostCents:value,acquiredAtMin:state.gameTime});
  });
  if(goodwill)registerAsset(state,{account:"1220",name:"Betriebsübernahme "+r.name,acquisitionCostCents:goodwill,acquiredAtMin:state.gameTime});
  for(const p of rivalStaff(r)){d.personIds.push(joinPlayer(state,p,branch,p.costPerDayCents,r.name));p.status="transferred";}
  r.businessStatus="acquired";r.acquiredAtMin=state.gameTime;d.status="completed";d.completedAtMin=state.gameTime;d.branchId=branch.id;
  competitionNotice(state,r.name+" übernommen",d.vehicleIds.length+" Lkw und "+d.personIds.length+" Mitarbeiter wurden an "+branch.name+" übergeben. Der Standort nimmt am normalen Betrieb teil. Dispositionsschichten und Zuweisungen bitte prüfen.");
}
export function processCompetition(state,m) {
  migrateCompetition(state);if(!state.competition)return;
  const c=state.competition;
  processCompetitionCooperation(state,m);
  for(const d of c.deals){
    const r=state.world.rivals.find(r=>r.id===d.rivalId);
    if(d.status==="review"&&d.dueMin<=m){d.status="ready";d.valuation=competitionValuation(r);d.expiresMin=m+7*DAY;
      competitionNotice(state,"Unternehmensprüfung: "+r.name,"Bewertung und Kaufangebote stehen im Wettbewerbsbereich bereit. Das Angebot gilt sieben Spieltage.");}
    if(d.status==="ready"&&d.expiresMin<=m)d.status="expired";
    if(d.status==="integrating"&&d.dueMin<=m&&r.jobs.length===0)closeDeal(state,d,r);
  }
  for(const a of c.recruitments){
    const r=state.world.rivals.find(r=>r.id===a.rivalId);
    if(a.status==="pending"&&a.dueMin<=m){
      a.status=a.willAccept&&independentRival(r)&&rivalStaff(r).some(p=>p.id===a.personId)?"accepted":"rejected";a.expiresMin=m+3*DAY;
      competitionNotice(state,"Antwort von "+a.personName,a.status==="accepted"?"Dein Angebot wurde angenommen. Bestätige die Einstellung innerhalb von drei Spieltagen.":"Dein Angebot wurde abgelehnt. Nach Ablauf der Wartefrist ist ein neues Angebot möglich.");
    }
    if(a.status==="accepted"&&a.expiresMin<=m)a.status="expired";
    if(a.status==="joining"&&a.dueMin<=m){
      const branch=state.branches.find(b=>b.id===a.branchId&&b.status==="active")||state.branches.find(b=>b.status==="active");
      if(!branch)continue;
      const p=r.business.staff.find(p=>p.id===a.personId);
      a.employeeId=joinPlayer(state,p,branch,a.salaryCents,r.name);p.status="departed";p.departedAtMin=m;a.status="completed";a.completedAtMin=m;
      competitionNotice(state,a.personName+" beginnt",a.personName+" arbeitet jetzt an "+branch.name+". Die vereinbarte Vergütung wird regulär abgerechnet.");
    }
  }
  for(const r of state.world.rivals){
    const staff=r.business.staff,departed=staff.filter(p=>p.status==="departed"),archive=new Set(departed.slice(0,-20));
    r.business.staff=retainHistory(state,"competitionRoster",staff,staff.filter(p=>!archive.has(p)),r.id);
  }
  for(const [key,kind] of [["deals","competitionDeals"],["recruitments","competitionRecruiting"]]){
    const all=c[key],terminal=all.filter(x=>!["review","ready","integrating","pending","accepted","joining"].includes(x.status)&&m>=(x.cooldownUntilMin||0));
    const archive=new Set(terminal.slice(0,-30));c[key]=retainHistory(state,kind,all,all.filter(x=>!archive.has(x)));
  }
}
export function getCompetitionEventTimes(state) {
  const c=state.competition;if(!c)return [];
  return [...(c.rentals||[]).filter(x=>x.status==="active").map(x=>x.dueMin), ...[...c.deals,...c.recruitments].flatMap(x=>["review","integrating","pending","joining"].includes(x.status)?[x.dueMin]:["ready","accepted"].includes(x.status)?[x.expiresMin]:[])];
}
