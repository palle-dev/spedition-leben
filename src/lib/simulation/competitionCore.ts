import { PERSONNEL_ROLES, VEHICLE_CATALOG } from "./gameRules.ts";
import { retainLatestHistory } from "./historyRetention.ts";
import { deliverMessage } from "./mailEngine.ts";
export const COMPETITION_DAY = 1440;
export const independentRival = r => !!r && (!r.businessStatus || r.businessStatus === "independent");
export const rivalStaff = r => (r.business?.staff || []).filter(p => p.status === "employed");
export function rivalCapacity(r) {
  return r.business ? Math.min(r.business.vehicles.length, rivalStaff(r).filter(p => p.role === "driver").length,
    rivalStaff(r).filter(p => p.role.startsWith("dispatcher")).reduce((n,p) => n + PERSONNEL_ROLES[p.role].capacity,0)) : r.fleet;
}
export function competitionNotice(state, title, text) {
  const c=state.competition;
  const record={id:"competition_"+(++c.sequence),atMin:state.gameTime,title,text,kind:"competition"};
  state.world.chronicle.push(record);
  state.world.chronicle=retainLatestHistory(state,"worldChronicle",state.world.chronicle,180);
  deliverMessage(state,{fromId:"system",toId:"player",subject:title,body:text+"\n\nSpielwelt → Wettbewerb",gameTime:state.gameTime,
    category:"operations",priority:"normal",dedupKey:record.id});
}
function makeVehicle(r,index) {
  const profile=VEHICLE_CATALOG.standard;
  return {id:r.id+"_vehicle_"+index,type:profile.label,catalogId:profile.id,bodyType:"planen",
    capacityTons:profile.capacityTons,consumptionPer100km:profile.consumptionPer100km,
    condition:72+(index%4)*5,bookValueCents:3000000,referencePriceCents:profile.referencePriceCents,
    odometerKm:40000+index*11000,ownership_type:"owned"};
}
export function addRivalCapacity(r) {
  const index=++r.business.sequence;
  r.business.vehicles.push(makeVehicle(r,index));
  r.business.staff.push({id:r.id+"_driver_"+index,name:["Jens","Maren","Ole","Nele","Sven","Anja"][index%6]+" "+r.city+" "+index,
    role:"driver",costPerDayCents:10000,status:"employed",satisfaction:65,qualifications:["driver_license"]});
  if(r.business.staff.filter(p=>p.role.startsWith("dispatcher")&&p.status==="employed").reduce((n,p)=>n+PERSONNEL_ROLES[p.role].capacity,0)<r.business.vehicles.length)
    r.business.staff.push({id:r.id+"_dispatcher_"+index,name:"Alex "+r.city+" "+index,role:"dispatcher_senior",costPerDayCents:26000,status:"employed",satisfaction:75,qualifications:["dispatcher_senior"]});
  r.fleet=r.business.vehicles.length;
}
export function migrateCompetition(state) {
  if(!state.world?.active)return;
  state.competition ||= {version:1,sequence:0,rngSeed:891273,deals:[],recruitments:[],daily:[]};
  for(const r of state.world.rivals) {
    if(r.business)continue;
    r.businessStatus ||= "independent";
    r.business={version:1,sequence:0,vehicles:[],staff:[],siteCostCents:8000,regularDeliveries:0,totalRevenueCents:0,totalExpensesCents:0};
    const size=Math.max(0,Math.floor(r.fleet||0));
    for(let i=0;i<size;i++)addRivalCapacity(r);
  }
}
export function competitionPriceFactor(state,city) {
  if(!state.world?.active)return 1;
  const rivals=state.world.rivals.filter(r=>independentRival(r)&&r.city===city&&rivalCapacity(r)>0&&r.cashCents>=14000);
  if(!rivals.length)return 1;
  const total=rivals.reduce((n,r)=>n+rivalCapacity(r),0);
  const percent=rivals.reduce((n,r)=>n+r.pricePercent*rivalCapacity(r),0)/total;
  return Math.max(.94,Math.min(1.03,1+(percent-100)/500));
}
export function competitionDaily(state,m) {
  migrateCompetition(state);
  for(const r of state.world.rivals) {
    if(!independentRival(r))continue;
    const b=r.business,before=r.cashCents;
    const loads=Math.max(0,Math.min(rivalCapacity(r)-r.jobs.length,Math.floor(r.cashCents/14000)));
    const revenue=Math.round(loads*44000*r.pricePercent/100);
    const costs=loads*14000+b.vehicles.length*2500+b.siteCostCents+rivalStaff(r).reduce((n,p)=>n+p.costPerDayCents,0);
    r.cashCents=Math.max(0,r.cashCents+revenue-costs);
    b.unpaidCostsCents=(b.unpaidCostsCents||0)+Math.max(0,costs-before-revenue);
    b.regularDeliveries+=loads;b.totalRevenueCents+=revenue;b.totalExpensesCents+=costs;
    r.lastDayNetCents=revenue-costs;
    // A finite balance sheet, one investment per week, no second per-minute dispatch engine.
    const locked=state.competition.deals.some(d=>d.rivalId===r.id&&["review","ready"].includes(d.status));
    if(!locked&&Math.floor(m/1440)%7===0&&b.vehicles.length<40&&r.cashCents>3500000+costs*14) {
      r.cashCents-=3500000;addRivalCapacity(r);
      competitionNotice(state,r.name+" wächst","Ein Lkw und ein Fahrer wurden aus der Betriebsreserve finanziert.");
    }
    state.competition.daily.push({id:r.id+"_"+m,atMin:m,rivalId:r.id,fleet:r.fleet,capacity:rivalCapacity(r),deliveries:loads,revenueCents:revenue,costsCents:costs,cashCents:r.cashCents});
  }
  state.competition.daily=retainLatestHistory(state,"competitionDaily",state.competition.daily,270);
}
export function competitionValuation(r) {
  const vehicles=r.business.vehicles.reduce((n,v)=>n+v.bookValueCents,0);
  const goodwill=Math.max(300000,Math.round(vehicles*.12+(r.reliability||70)*10000));
  return {vehicleCents:vehicles,goodwillCents:goodwill,priceCents:vehicles+goodwill,
    dailyCostsCents:rivalStaff(r).reduce((n,p)=>n+p.costPerDayCents,0)+r.business.siteCostCents+r.fleet*2500};
}
export function competitionRandom(state) {
  let x=state.competition.rngSeed>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;state.competition.rngSeed=x>>>0;return (x>>>0)/4294967296;
}
export function joinPlayer(state,person,branch,salary,source) {
  state.idCounter=(state.idCounter||100)+1;
  const id=(person.role==="driver"?"d_":"emp_")+state.idCounter;
  const role=PERSONNEL_ROLES[person.role];
  const employee={id,name:person.name,role:person.role,branchId:branch.id,assignedBranchId:branch.id,locationCity:branch.city,
    costPerDayCents:salary,hireFeeCents:0,employedDay:Math.floor(state.gameTime/1440)+1,satisfaction:75,satisfactionReasons:[],
    employmentStatus:"employed",exitDate:null,attendance:"present",status:"free",restUntil:null,sickUntil:null,vacationUntil:null,
    vacationDaysAvailable:3,activity:"idle",consecutiveLowSatisfactionDays:0,assignedVehicleIds:[],workMode:"autonomous",
    managementMode:"requests_approval",capacity:role.capacity,lastDecisionMin:null,suggestions:[],portraitId:"p01",recruitedFrom:source};
  (person.role==="driver"?state.drivers:state.employees).push(employee);
  state.training ||= {qualifications:[]};state.training.qualifications ||= [];
  for(const type of person.qualifications||[])state.training.qualifications.push({id:"qual_"+id+"_"+type,personId:id,type,level:"standard",acquiredAtMin:state.gameTime,validUntilMin:null,status:"active",source:"competition",courseId:null,history:[]});
  return id;
}
