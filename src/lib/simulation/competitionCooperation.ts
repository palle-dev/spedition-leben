import { independentRival, competitionNotice, migrateCompetition } from "./competitionCore.ts";
import { postJournal } from "./accountingEngine.ts";
import { retainHistory } from "./historyRetention.ts";
// Rentals bind an actual idle, unreserved diesel vehicle. The rival supplies its driver.
export function startCompetitionRental(state,rival,m,incomeCents) {
  migrateCompetition(state);
  if(!independentRival(rival)||rival.cashCents<incomeCents)return false;
  const vehicle=(state.vehicles||[]).find(v=>v.status==="free"&&!v.markedForSale&&!v.maintenanceUntil&&!v.isElectric&&v.powertrain!=="electric"&&(v.condition||0)>=50&&
    !(state.trips||[]).some(t=>t.vehicleId===v.id&&t.status==="in_progress")&&
    !(state.tours||[]).some(t=>t.status==="active"&&(t.deployments||[]).some(d=>d.vehicleId===v.id&&["planned","in_progress"].includes(d.status)))&&
    !(state.employees||[]).some(e=>(e.assignedVehicleIds||[]).includes(v.id)));
  const drivers=(rival.business?.staff||[]).filter(p=>p.role==="driver"&&p.status==="employed").length;
  if(!vehicle||drivers<=rival.jobs.length)return false;
  state.competition.rentals ||= [];
  if(state.competition.rentals.some(x=>x.rivalId===rival.id&&x.status==="active"))return false;
  const rental={id:"rental_"+(++state.competition.sequence),rivalId:rival.id,vehicleId:vehicle.id,startedAtMin:m,dueMin:m+1440,incomeCents,status:"active"};
  rival.cashCents-=incomeCents;vehicle.status="rented_out";state.competition.rentals.push(rental);
  competitionNotice(state,"Lkw an "+rival.name+" vermietet","Ein freier, nicht zugewiesener Lkw ist für einen Tag gebunden. Die vereinbarte Nettovergütung wird bei Rückgabe gebucht. Betriebskosten und Fahrer stellt der Mieter.");
  return true;
}
export function processCompetitionCooperation(state,m) {
  const c=state.competition;if(!c)return;
  for(const x of c.rentals||[]){
    if(x.status!=="active"||x.dueMin>m)continue;
    const v=state.vehicles.find(v=>v.id===x.vehicleId);
    if(!v)throw new Error("Gemietetes Fahrzeug fehlt: "+x.vehicleId);
    if(v.status==="rented_out")v.status="free";
    postJournal(state,{text:"Fahrzeugvermietung",sourceEventId:x.id,vehicleId:v.id,lines:[{account:"1000",debit:x.incomeCents},{account:"4220",credit:x.incomeCents}]});
    x.status="completed";x.completedAtMin=m;
    competitionNotice(state,"Miet-Lkw zurück", "Der Lkw steht wieder zur Verfügung. "+(x.incomeCents/100).toFixed(2)+" € wurden dem Firmenkonto gutgeschrieben.");
  }
  const rentals=c.rentals||[],done=rentals.filter(x=>x.status==="completed"),archive=new Set(done.slice(0,-30));
  c.rentals=retainHistory(state,"competitionRentals",rentals,rentals.filter(x=>!archive.has(x)));
}
