import { CITIES, CITY_LATLON, getDistance, driveMinutes } from "./gameRules.ts";
import { ENERGY_RULES as R, ENERGY_UPGRADES } from "./electricCatalog.ts";
import { addBooking, registerAsset } from "./accountingEngine.ts";
import { preserveHistory } from "./historyRetention.ts";
export { ENERGY_RULES, ENERGY_UPGRADES } from "./electricCatalog.ts";
const EPS=1e-8, DAY=1440;
const FIELDS=["pvKWh","pvDirectKWh","pvStoredKWh","storageOutKWh","storageLossKWh","exportKWh","gridKWh","truckKWh","chargeLossKWh","publicKWh","publicBatteryKWh","driveKWh","gridCostCents","publicCostCents","exportRevenueCents"];
const meter=()=>Object.fromEntries(FIELDS.map(k=>[k,0]));
export const isElectric=v=>v?.powertrain==="electric";
export function migrateEnergy(state) {
 state.energy ||= {version:1,lastMin:state.gameTime,sites:{},vehicleMeters:{}};
}
export function emptyEnergySite() {
 return {pvKwp:0,storageKWh:0,storageKw:0,storedKWh:0,wallboxes:0,dcChargers:0,gridKw:50,investmentCents:0,totals:meter(),daily:[],billedGridCents:0,billedExportCents:0};
}
function rowFor(site,min) {
 const day=Math.floor(min/DAY)+1;
 let row=site.daily[site.daily.length-1];
 if(!row||row.day!==day){row={day,...meter()};site.daily.push(row);}
 return row;
}
function record(site,min,values) {
 const row=rowFor(site,min);
 for(const [k,v] of Object.entries(values)){site.totals[k]=(site.totals[k]||0)+Number(v);row[k]=(row[k]||0)+Number(v);}
}
function siteFor(state,branchId) {
 migrateEnergy(state);
 return state.energy.sites[branchId] ||= emptyEnergySite();
}
export function installEnergyUpgrade(state,p) {
 const b=(state.branches||[]).find(b=>b.id===p.branchId&&b.status==="active"),u=ENERGY_UPGRADES[p.upgrade];
 if(!b||!u)throw Error("Aktive Filiale und gültiger Energieausbau erforderlich.");
 if(state.company.accountCents<u.priceCents||state.openCosts?.some(c=>c.account==="company"))throw Error("Firmenkonto reicht nicht aus oder betriebliche Kosten sind offen.");
 const site=siteFor(state,b.id);
 if(site[u.field]+u.amount>u.max)throw Error("Ausbaugrenze erreicht.");
 site[u.field]+=u.amount;if(p.upgrade==="storage")site.storageKw+=50;
 site.investmentCents+=u.priceCents;
 state.idCounter=(state.idCounter||100)+1;const ref="energy_asset_"+state.idCounter;
 addBooking(state,state.gameTime,"Energieanlage: "+u.label,-u.priceCents,"company",ref,{branchId:b.id});
 registerAsset(state,{account:"1220",name:b.name+" · "+u.label,acquisitionCostCents:u.priceCents,acquiredAtMin:state.gameTime});
 return {ok:true,priceCents:u.priceCents};
}
// Piecewise constant hourly sunshine with deterministic seasonal/cloud variation.
// The existing game starts on day 1; a 365-day synthetic year is used.
export function pvPowerKw(branch,site,min) {
 const day=Math.floor(min/DAY),hour=Math.floor((min%DAY)/60);
 const season=0.65+0.35*Math.sin(2*Math.PI*(day-80)/365);
 const daylight=Math.max(0,Math.sin(Math.PI*(hour+0.5-6)/12));
 const latitude=CITY_LATLON[branch.city]?.[1]||51;
 const cloud=0.65+0.35*((day*17+CITIES.indexOf(branch.city)*13+101)%23)/22;
 return site.pvKwp*season*daylight*cloud*(1+(51-latitude)*0.015);
}
// Integrate only elapsed time, before trips change status. Each subinterval ends
// at an hour, midnight, a full truck battery or full/empty stationary storage.
export function processEnergyUntil(state,toMin) {
 const energy=state.energy;if(!energy)return;
 let from=energy.lastMin;if(toMin<=from)return;
 while(from<toMin-EPS){
  const end=Math.min(toMin,(Math.floor(from/60)+1)*60);
  for(const branch of state.branches||[]){
   const site=energy.sites[branch.id];if(!site)continue;
   let t=branch.status === "active" ? from : end;
   const fleet=(state.vehicles||[]).filter(v=>isElectric(v)&&v.status==="free"&&v.locationCity===branch.city);
   const ports=[...Array(site.dcChargers).fill(150),...Array(site.wallboxes).fill(22)];
   while(t<end-EPS){
    const waiting=fleet.filter(v=>v.batteryKWh<v.batteryCapacityKWh-EPS).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const active=waiting.slice(0,ports.length).map((v,i)=>({v,kw:Math.min(ports[i],ports[i]===22?(v.maxAcChargeKw||22):v.maxChargeKw)}));
    const solar=pvPowerKw(branch,site,t),demand=active.reduce((n,a)=>n+a.kw,0);
    const available=solar+site.gridKw+(site.storedKWh>EPS?site.storageKw:0);
    const scale=demand>0?Math.min(1,available/demand):0;
    active.forEach(a=>a.kw*=scale);
    const load=active.reduce((n,a)=>n+a.kw,0);
    const direct=Math.min(solar,load),deficit=Math.max(0,load-direct);
    const discharge=site.storedKWh>EPS?Math.min(deficit,site.storageKw):0;
    const grid=Math.min(site.gridKw,Math.max(0,deficit-discharge));
    const charge=site.storedKWh<site.storageKWh-EPS?Math.min(Math.max(0,solar-direct),site.storageKw):0;
    const exported=Math.max(0,solar-direct-charge);
    let hours=(end-t)/60;
    for(const a of active)if(a.kw>EPS)hours=Math.min(hours,(a.v.batteryCapacityKWh-a.v.batteryKWh)/(a.kw*R.chargeEfficiency));
    if(discharge>EPS)hours=Math.min(hours,site.storedKWh*R.storageEfficiency/discharge);
    if(charge>EPS)hours=Math.min(hours,(site.storageKWh-site.storedKWh)/(charge*R.storageEfficiency));
    for(const a of active){
     const kwh=a.kw*hours*R.chargeEfficiency;
     a.v.batteryKWh=Math.min(a.v.batteryCapacityKWh,a.v.batteryKWh+kwh);
     const vm=energy.vehicleMeters[a.v.id] ||= {depotKWh:0,solarKWh:0,gridKWh:0,publicKWh:0,driveKWh:0};
     vm.depotKWh+=kwh;vm.solarKWh+=load? kwh*(direct+discharge)/load:0;vm.gridKWh+=load?kwh*grid/load:0;
    }
    site.storedKWh=Math.max(0,Math.min(site.storageKWh,site.storedKWh+charge*hours*R.storageEfficiency-discharge*hours/R.storageEfficiency));
    record(site,t,{pvKWh:solar*hours,pvDirectKWh:direct*hours,pvStoredKWh:charge*hours,storageOutKWh:discharge*hours,
     storageLossKWh:charge*hours*(1-R.storageEfficiency)+discharge*hours*(1/R.storageEfficiency-1),
     exportKWh:exported*hours,gridKWh:grid*hours,truckKWh:load*hours*R.chargeEfficiency,chargeLossKWh:load*hours*(1-R.chargeEfficiency),
     gridCostCents:grid*hours*R.gridCentsPerKWh,exportRevenueCents:exported*hours*R.exportCentsPerKWh});
    t+=hours*60;
   }
   if(end%DAY===0){
    const grid=Math.round(site.totals.gridCostCents)-site.billedGridCents,exported=Math.round(site.totals.exportRevenueCents)-site.billedExportCents;
    if(grid)addBooking(state,end,"Ladestrom: "+branch.name,-grid,"company","energy_grid_"+branch.id+"_"+end,{branchId:branch.id});
    if(exported)addBooking(state,end,"PV-Einspeisung: "+branch.name,exported,"company","energy_export_"+branch.id+"_"+end,{branchId:branch.id});
    site.billedGridCents+=grid;site.billedExportCents+=exported;
    if(site.daily.length>90)preserveHistory(state,"energyDays",site.daily.splice(0,site.daily.length-90),branch.id);
   }
  }
  from=end;
 }
 energy.lastMin=toMin;
}
export function processElectricPhase(state,trip,phase,min) {
 const v=state.vehicles.find(v=>v.id===trip.vehicleId);if(!isElectric(v))return;
 const site=siteFor(state,trip.branchId||v.branchId),vm=state.energy.vehicleMeters[v.id] ||= {depotKWh:0,solarKWh:0,gridKWh:0,publicKWh:0,driveKWh:0};
 if(phase.type==="charging"){
  const kwh=phase.chargeKWh||0;v.batteryKWh=Math.min(v.batteryCapacityKWh,v.batteryKWh+kwh);
  vm.publicKWh+=kwh;
  record(site,min,{publicKWh:kwh/R.chargeEfficiency,publicBatteryKWh:kwh,publicCostCents:kwh/R.chargeEfficiency*R.publicCentsPerKWh});
 }else if(phase.type==="loaded_drive"||phase.type==="empty_drive"){
  const used=(phase.distanceKm||0)*v.consumptionKWhPer100km/100;
  v.batteryKWh=Math.max(0,v.batteryKWh-used);vm.driveKWh+=used;record(site,min,{driveKWh:used});
 }
}
export function futureBattery(state,v) {
 const trip=(state.trips||[]).find(t=>t.vehicleId===v.id&&t.status==="in_progress");
 return trip?.energy?.finalBatteryKWh??v.batteryKWh;
}
// Public game network: one truck-capable DC hub per game city, 300 kW.
// Paths use actual game-city distances; detours are included in time and tolls.
export function publicHub(state,city) {return CITIES.includes(city)&&!(state.energy?.closedPublicCities||[]).includes(city);}
const routeCache=new Map();
function electricRoute(state,from,to,maxKm,initialKm) {
 const key=[from,to,maxKm,initialKm,(state.energy?.closedPublicCities||[]).join(",")].join("|");
 if(routeCache.has(key))return routeCache.get(key);
 const nodes=[...new Set([from,to,...CITIES.filter(c=>publicHub(state,c))])],dist=new Map(nodes.map(c=>[c,Infinity])),prev=new Map(),pending=new Set(nodes);
 dist.set(from,0);
 while(pending.size){
  let at=null,best=Infinity;for(const c of pending)if(dist.get(c)<best){at=c;best=dist.get(c);}
  if(at===null||at===to)break;pending.delete(at);
  for(const c of pending){
   const km=getDistance(at,c),range=at===from&&!publicHub(state,from)?initialKm:maxKm;
   if(km<=0||km>range+EPS)continue;
   const score=best+km;if(score<dist.get(c)){dist.set(c,score);prev.set(c,at);}
  }
 }
 let path=null;
 if(from===to)path=[from];else if(prev.has(to)){path=[to];while(path[0]!==from)path.unshift(prev.get(path[0]));}
 if(routeCache.size>2048)routeCache.clear();routeCache.set(key,path);return path;
}
export function electricWorkSteps(state,vehicle,steps) {
 if(!isElectric(vehicle))return {steps,energy:null};
 const capacity=vehicle.batteryCapacityKWh,consumption=vehicle.consumptionKWhPer100km/100,reserve=capacity*R.reserveFraction,target=capacity*R.publicTargetFraction;
 let soc=vehicle.batteryKWh;const output=[],stops=[];
 if(!(capacity>0&&consumption>0&&Number.isFinite(soc)&&vehicle.maxChargeKw>0))return {error:"Ungültige Batteriedaten.",steps:[],energy:null};
 let charged=0,used=0;
 for(const s of steps){
  if(!["empty_drive","loaded_drive"].includes(s.type)){output.push(s);continue;}
  if(s.fromCity===s.toCity)continue;
  const direct=getDistance(s.fromCity,s.toCity);
  const path=soc-direct*consumption>=reserve-EPS?[s.fromCity,s.toCity]:electricRoute(state,s.fromCity,s.toCity,(target-reserve)/consumption,Math.max(0,(soc-reserve)/consumption));
  if(!path)return {error:"Keine mit Batteriereserve erreichbare Laderoute zwischen "+s.fromCity+" und "+s.toCity+".",steps:[],energy:null};
  for(let i=0;i<path.length-1;i++){
   const km=getDistance(path[i],path[i+1]),need=km*consumption;
   if(soc-need<reserve-EPS){
    if(!publicHub(state,path[i]))return {error:"Kein erreichbarer Ladepunkt in "+path[i]+".",steps:[],energy:null};
    const kwh=Math.max(0,target-soc),kw=Math.min(300,vehicle.maxChargeKw),minutes=Math.ceil(kwh/(kw*R.chargeEfficiency)*60)+5;
    output.push({type:"charging",fromCity:path[i],toCity:path[i],distanceKm:0,durationMin:minutes,chargeKWh:kwh,chargeKw:kw});
    stops.push({city:path[i],kWh:kwh,minutes,kw});charged+=kwh;soc+=kwh;
   }
   output.push({...s,fromCity:path[i],toCity:path[i+1],distanceKm:km,durationMin:driveMinutes(km)});
   used+=need;soc-=need;
  }
 }
 return {steps:output,energy:{startBatteryKWh:vehicle.batteryKWh,finalBatteryKWh:soc,usedKWh:used,publicChargeKWh:charged,publicCostCents:Math.round(charged/R.chargeEfficiency*R.publicCentsPerKWh),stops}};
}
