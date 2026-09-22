import { countryOf, COUNTRY_NAMES } from "./dachGeography.ts";
import { DACH_RULE_VERSION } from "./dachRules.ts";
import { postJournal } from "./accountingEngine.ts";
export function migrateDach(state){
 state.dach ||= {version:1,enabled:false,ruleVersion:DACH_RULE_VERSION,activatedAtMin:null};
 if(!state.dach.enabled)return;
 for(const b of state.branches||[]){b.country ||= countryOf(b.city)||"DE";}
 for(const v of state.vehicles||[]){
  const home=countryOf(state.branches.find(b=>b.id===v.branchId)?.city)||"DE";
  v.operatorCountry ||= home;v.registrationCountry ||= home;
 }
}
export function governedTransport(state,order){return !!state.dach?.enabled&&(!order||order.transportRulesVersion===DACH_RULE_VERSION||countryOf(order.fromCity)!=="DE"||countryOf(order.toCity)!=="DE");}
export function validateDachTransport(state,order,vehicle,endMin){
 if(!governedTransport(state,order)||!order)return null;
 const from=countryOf(order.fromCity),to=countryOf(order.toCity),home=vehicle.operatorCountry||"DE";
 if(!from||!to)return "Start oder Ziel ist keinem DACH-Land zugeordnet.";
 if(order.isDangerousGoods&&(from!=="DE"||to!=="DE"))return "Internationales Gefahrgut benötigt eine streckenspezifische ADR-/Tunnelprüfung und ist in dieser Regelversion noch gesperrt.";
 if(from!==to||from===home)return null;
 if(from==="CH")return "Schweizer Binnenauftrag: benötigt einen lokal zugelassenen Schweizer Betrieb und Lkw. Eine Filialzuweisung allein ersetzt die Registrierung nicht.";
 if(home==="CH")return "Schweizer Betreiber: keine EU-Kabotageberechtigung für diesen Binnenauftrag.";
 const c=vehicle.dachCabotage;
 if(!c||c.country!==from||!c.inboundAtMin)return "Kabotage: zuerst einen beladenen grenzüberschreitenden Transport mit diesem Lkw vollständig zustellen.";
 if((c.cooldownUntilMin||0)>state.gameTime)return "Kabotage: die viertägige Abkühlfrist ist noch nicht beendet.";
 const limit=(Math.floor(c.inboundAtMin/1440)+8)*1440;
 if(endMin>=limit)return "Kabotage: Lieferung liegt außerhalb des siebentägigen Zeitfensters.";
 if(c.count>=3)return "Kabotage: maximal drei Binnenlieferungen nach der internationalen Einfahrt.";
 return null;
}
export function projectDachDelivery(vehicle,order,m){
 if(!order)return;
 const from=countryOf(order.fromCity),to=countryOf(order.toCity),home=vehicle.operatorCountry||"DE",old=vehicle.dachCabotage;
 if(from!==to){
  const cooldown=(old?.count>0)?(Math.floor(old.lastCabotageMin/1440)+5)*1440:(old?.cooldownUntilMin||0);
  vehicle.dachCabotage={country:to,inboundAtMin:m,count:0,cooldownUntilMin:old?.country===to?cooldown:0,priorCountry:old?.country,priorCooldownUntilMin:cooldown};
  if(old?.priorCountry===to)vehicle.dachCabotage.cooldownUntilMin=Math.max(vehicle.dachCabotage.cooldownUntilMin,old.priorCooldownUntilMin||0);
 }else if(from!==home&&old){old.count++;old.lastCabotageMin=m;}
}
export function recordDachDelivery(state,trip,order,vehicle,m){
 if(!trip.transport?.ruleVersion)return;
 projectDachDelivery(vehicle,order,m);
}
export const DACH_COMMANDS=["activateDach","registerDachVehicle"];
export function handleDachCommand(state,command,p:any={}){
 if(!DACH_COMMANDS.includes(command))return null;migrateDach(state);
 if(command==="activateDach"){
  if(state.dach.enabled)return {ok:true,alreadyApplied:true};
  state.dach.enabled=true;state.dach.activatedAtMin=state.gameTime;
  state.dach.operatingModel="licensed-local-entities";state.dach.customsMode="agency";
  migrateDach(state);return {ok:true};
 }
 if(!state.dach.enabled)throw new Error("Zuerst den DACH-Betrieb aktivieren.");
 const v=state.vehicles.find(v=>v.id===p.vehicleId),b=state.branches.find(b=>b.id===v?.branchId&&b.status==="active");
 if(!v||!b)throw new Error("Lkw oder aktive Heimatfiliale fehlt.");
 const country=countryOf(b.city);
 if(v.operatorCountry===country&&v.registrationCountry===country)return {ok:true,alreadyApplied:true};
 if(v.status!=="free"||v.locationCity!==b.city||(state.tours||[]).some(t=>["planned","active"].includes(t.status)&&(t.vehicleId===v.id||(t.deployments||[]).some(d=>d.vehicleId===v.id&&d.status==="planned"))))throw new Error("Lkw muss frei und ohne Reservierung an seiner Heimatfiliale stehen.");
 if((v.ownership_type||"owned")!=="owned")throw new Error("Ausländische Leasing-Lkw werden im Spiel nicht umregistriert. Lokal leasen oder kaufen.");
 const cost=80000;if(state.company.accountCents<cost)throw new Error("800 € Firmenkapital werden benötigt.");
 postJournal(state,{text:"Betriebszuordnung und Registrierung: "+COUNTRY_NAMES[country],vehicleId:v.id,lines:[{account:"5700",debit:cost},{account:"1000",credit:cost}]});
 v.operatorCountry=country;v.registrationCountry=country;v.dachCabotage=null;
 return {ok:true};
}
