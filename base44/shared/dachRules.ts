import { countryOf, dachRoute } from "./dachGeography.ts";
export const DACH_RULE_VERSION="DACH-2026.1";
export const DACH_SOURCES=[
 {label:"EU: Lenk- und Ruhezeiten",url:"https://transport.ec.europa.eu/transport-modes/road/social-provisions/driving-time-and-rest-periods_en"},
 {label:"EU: Kabotage",url:"https://transport.ec.europa.eu/transport-modes/road/mobility-package-i/market-rules/rules-cabotage-applicable-21-february-2022_en"},
 {label:"Deutschland: § 30 StVO",url:"https://www.gesetze-im-internet.de/stvo_2013/__30.html"},
 {label:"Österreich: Fahrverbote",url:"https://www.usp.gv.at/themen/betrieb-und-umwelt/transport-und-verkehr/lkw-fahrverbote.html"},
 {label:"Österreich: GO-Maut 2026",url:"https://www.go-maut.at/tarife"},
 {label:"Schweiz: Fahrverbote und Gefahrgut",url:"https://www.astra.admin.ch/de/sonderbewilligungen"},
 {label:"Schweiz: LSVA-Berechnung",url:"https://www.bazg.admin.ch/de/lsva-berechnung"},
 {label:"Schweiz: LSVA und E-Lkw",url:"https://www.bazg.admin.ch/de/faq-lsva"},
 {label:"Schweiz: Fahrzeugimport/Binnentransporte",url:"https://www.bazg.admin.ch/de/einfuhr-schweiz-strassenfahrzeuge-firmen"},
 {label:"Schweiz: Passar",url:"https://www.bazg.admin.ch/de/passar-warenverkehrssystem"}
];
// Frozen simulation tariffs; road shares, agency charges and FX are game assumptions, not quotations.
export const DACH_TARIFFS={version:DACH_RULE_VERSION,asOf:"2026-09-22",eurPerChf:1.05,
 DE:{regional:23.8,standard:30.3,heavy:34.8,electric:0},
 AT:{regional:27.74,standard:38.56,heavy:57.24,electric2:5.87,electric3:8.06,electric4:11.89},
 CH:{euro6RappenPerTonneKm:2.39,electric:0},customsAgencyCents:6500,customsMinutes:90};
export function truckRegulation(v){
 const size=(v.capacityTons||12)<=8?"regional":(v.capacityTons||12)<=12?"standard":"heavy";
 return {size,grossTonnes:v.grossWeightTonnes||({regional:16,standard:26,heavy:40}[size]),axles:v.axles||({regional:2,standard:3,heavy:5}[size]),euroClass:v.euroClass||6,co2Class:v.powertrain==="electric"?5:1};
}
export function transportCosts(vehicle,steps){
 const info=truckRegulation(vehicle),electric=vehicle.powertrain==="electric",totals={DE:0,AT:0,CH:0},charges={DE:0,AT:0,CH:0};
 let customsCents=0;
 for(const step of steps){
  if(!["empty_drive","loaded_drive"].includes(step.type))continue;
  const route=dachRoute(step.fromCity,step.toCity);
  for(const leg of route.segments){
   const km=leg.distanceKm;totals[leg.country]+=km;
   let cents=0;
   if(leg.country==="DE")cents=km*(electric?0:DACH_TARIFFS.DE[info.size]);
   if(leg.country==="AT")cents=km*(electric?DACH_TARIFFS.AT[info.axles===2?"electric2":info.axles===3?"electric3":"electric4"]:DACH_TARIFFS.AT[info.size]);
   if(leg.country==="CH")cents=electric?0:km*Math.min(40,info.grossTonnes)*DACH_TARIFFS.CH.euro6RappenPerTonneKm*DACH_TARIFFS.eurPerChf;
   charges[leg.country]+=cents;
  }
  if(route.crossing?.customs&&step.type==="loaded_drive")customsCents+=DACH_TARIFFS.customsAgencyCents;
 }
 const breakdown=Object.keys(totals).filter(c=>totals[c]>0).map(country=>({country,distanceKm:totals[country],cents:Math.round(charges[country])}));
 return {tollCents:breakdown.reduce((n,x)=>n+x.cents,0),customsCents,breakdown,tariffVersion:DACH_RULE_VERSION};
}
export function regulatorySteps(steps){
 const result=[];
 for(const s of steps){
  if(!["empty_drive","loaded_drive"].includes(s.type)){result.push({...s,regulatory:true,country:countryOf(s.fromCity)});continue;}
  const route=dachRoute(s.fromCity,s.toCity);
  route.segments.forEach((leg,i)=>{
   if(i>0&&route.crossing?.customs&&s.type==="loaded_drive")result.push({type:"customs",regulatory:true,country:route.crossing.to,durationMin:DACH_TARIFFS.customsMinutes,distanceKm:0,fromCity:s.fromCity,toCity:s.toCity,border:route.crossing.id});
   if(leg.distanceKm>0)result.push({...s,regulatory:true,country:leg.country,distanceKm:leg.distanceKm,durationMin:leg.distanceKm,routeCoordinates:route.crossing?[route.coordinates[i],route.coordinates[i+1]]:route.coordinates});
  });
 }
 return result;
}
const day=1440,week=10080;
export const regulatoryDate=m=>new Date(Date.UTC(2026,0,5)+Math.floor(m/day)*86400000);
function easter(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,n=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*n+114)/31),date=(h+l-7*n+114)%31+1;return Date.UTC(year,month-1,date);}
const holidayCache=new Map();
export function holiday(country,m){
 const date=regulatoryDate(m),year=date.getUTCFullYear(),key=country+year;
 if(!holidayCache.has(key)){
  const fixed={DE:["1-1","5-1","10-3","12-25","12-26"],AT:["1-1","1-6","5-1","8-15","10-26","11-1","12-8","12-25","12-26"],CH:["1-1","8-1","12-25"]}[country]||[];
  const offsets=country==="DE"?[-2,1,39,50]:country==="AT"?[1,39,50,60]:[];
  const set=new Set(fixed);for(const offset of offsets){const d=new Date(easter(year)+offset*86400000);set.add((d.getUTCMonth()+1)+"-"+d.getUTCDate());}
  if(holidayCache.size>18)holidayCache.clear();holidayCache.set(key,set);
 }
 return holidayCache.get(key).has((date.getUTCMonth()+1)+"-"+date.getUTCDate());
}
export function drivingWindow(country,m){
 const time=((m%day)+day)%day,weekday=Math.floor(m/day)%7,start=m-time;
 // No commodity or low-noise exemptions are presumed from a generic cargo label.
 let blocked=false;
 if(country==="DE")blocked=(weekday===6||holiday(country,m))&&time<1320;
 if(country==="AT")blocked=time<300||time>=1320||(weekday===5&&time>=900)||weekday===6||holiday(country,m);
 if(country==="CH")blocked=time<300||time>=1320||weekday===6||holiday(country,m);
 const boundaries=[300,900,1320,1440].filter(x=>x>time);
 return {blocked,nextMin:start+boundaries[0]};
}
export function normalizeDriverLedger(ledger,m){
 const result=ledger?{...ledger}:{weekIndex:Math.floor(m/week),thisWeek:0,previousWeek:0,weeklyRestEndMin:m};
 const current=Math.floor(m/week),diff=current-result.weekIndex;
 if(diff>0){result.previousWeek=diff===1?result.thisWeek:0;result.thisWeek=0;result.weekIndex=current;}
 return result;
}
export function regulatoryBudget(ledger,m,driving){
 const l=normalizeDriverLedger(ledger,m),restDue=l.weeklyRestEndMin+6*day;
 if(m>=restDue)return {ledger:l,rest:2700,weekly:true,budget:0};
 if(driving&&(l.thisWeek>=3360||l.thisWeek+l.previousWeek>=5400)){
  const until=(Math.floor(m/week)+1)*week;
  return {ledger:l,rest:Math.max(2700,until-m),weekly:true,budget:0};
 }
 return {ledger:l,rest:0,weekly:false,budget:Math.min(restDue-m,(Math.floor(m/week)+1)*week-m,driving?Math.min(3360-l.thisWeek,5400-l.thisWeek-l.previousWeek):Infinity)};
}
