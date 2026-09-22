import { recordCompanyStoryEvent, chooseCompanyStory } from "./companyStories.ts";
import { countryOf } from "./dachGeography.ts";
import { preserveHistory } from "./historyRetention.ts";
const DAY=1440;
export const JOURNEY_PATHS=[
 {id:"reliable",label:"Verlässlichkeit",description:"Ein Betrieb, auf den Kunden zählen.",color:"#a3e635"},
 {id:"people",label:"Menschen entwickeln",description:"Ein starkes Team und Zeit fürs Leben.",color:"#38bdf8"},
 {id:"green",label:"Zukunft gestalten",description:"Elektrische Transporte und ein wachsendes Netz.",color:"#c4b5fd"}
];
const zero=()=>({delivered:0,onTime:0,failed:0,courses:0,contracts:0,personal:0,electric:0,foreign:0});
export function migrateJourney(s){
 if(s.journey)return;
 s.journey={version:1,sinceMin:s.gameTime,totals:zero(),path:null,round:0,goals:[],badges:0,completedGoals:0,
 nextReviewMin:(Math.floor(s.gameTime/(7*DAY))+1)*7*DAY,reviewStartMin:s.gameTime,reviewBase:zero(),weeks:[],
 brand:{color:"#a3e635",motto:"Wir bringen Zukunft auf die Straße."},moments:[],branchTotals:{},arcs:[],nextArcMin:s.gameTime+3*DAY,mandates:[]};
}
export function recordJourneyEvent(s,e){
 if(!s.journey)return;
 processJourney(s,e.gameTime);
 const j=s.journey,t=j.totals;
 if(e.type==="delivery_completed"){
  const v=s.vehicles?.find(v=>v.id===e.vehicleId);t.delivered++;if(e.details?.onTime)t.onTime++;
  if(v?.powertrain==="electric")t.electric++;
  if(["AT","CH"].includes(countryOf(e.details?.toCity)))t.foreign++;
  const branch=e.branchId||v?.branchId;
  if(branch){const b=j.branchTotals[branch]||=( {delivered:0,onTime:0} );b.delivered++;if(e.details?.onTime)b.onTime++;}
  if(e.driverId&&e.details?.onTime){j.moments=j.moments.filter(x=>x.driverId!==e.driverId);j.moments.push({driverId:e.driverId,customer:e.details.customer,atMin:e.gameTime,orderId:e.orderIds?.[0]});j.moments=j.moments.slice(-12);}
 }
 if(e.type==="order_failed")t.failed++;
 if(e.type==="course_completed")t.courses++;
 if(e.type==="contract_accepted")t.contracts++;
 if(e.type==="personal_appointment_done")t.personal++;
 recordCompanyStoryEvent(s,e);
 processJourney(s,e.gameTime);
}
function archive(s,type,record){preserveHistory(s,"events",[{id:"journey:"+type+":"+record.id,type:"journey_"+type,gameTime:s.gameTime,details:record,isSystem:true,seen:true}]);}
export function journeyProgress(s,g){return Math.max(0,(s.journey?.totals[g.metric]||0)-g.baseline);}
export function startJourneyPath(s,path){
 migrateJourney(s);const j=s.journey;if(!JOURNEY_PATHS.some(p=>p.id===path))throw Error("Unbekannter Entwicklungsweg.");
 if(j.goals.length&&!j.goals.every(g=>g.completedAtMin!=null))throw Error("Der gewählte Weg läuft noch. Erst abschließen oder bewusst beenden.");
 const fleet=(s.vehicles||[]).filter(v=>!["sold","archived"].includes(v.status)).length,scale=Math.max(1,Math.ceil(fleet/10));
 const definitions: any[][]=path==="reliable"?[["onTime",Math.min(100,5*scale),"Wort halten","Pünktliche Lieferungen","/disposition"],["contracts",1,"Vertrauen gewinnt","Neue Kundenverträge","/kunden"],["delivered",Math.min(1000,25*scale),"Ein Netz, das trägt","Abgeschlossene Lieferungen","/disposition"]]:
 path==="people"?[["personal",1,"Zeit, die zählt","Eingehaltene persönliche Termine","/zuhause"],["courses",Math.min(10,scale),"Gemeinsam besser","Abgeschlossene Weiterbildungen","/personal"],["onTime",Math.min(500,15*scale),"Erfolg als Team","Pünktliche Lieferungen","/disposition"]]:
 [["electric",Math.min(100,3*scale),"Leise voraus","Lieferungen mit E-Lkw","/fuhrpark"],["courses",Math.min(5,scale),"Wissen bewegt","Abgeschlossene Weiterbildungen","/personal"],["foreign",Math.min(100,5*scale),"Neue Horizonte","Lieferungen nach Österreich oder in die Schweiz","/filialen"]];
 j.path=path;j.round++;j.goals=definitions.map(([metric,target,title,description,link],i)=>({id:j.round+":"+i,metric,target,title,description,link,baseline:j.totals[metric]||0,startedAtMin:s.gameTime,completedAtMin:null}));
 return {ok:true};
}
export function processJourney(s,m){
 const j=s.journey;if(!j)return;
 for(const g of j.goals)if(g.completedAtMin==null&&journeyProgress(s,g)>=g.target){g.completedAtMin=m;j.badges++;j.completedGoals++;archive(s,"goal",{...g,id:g.id,earnedBadge:j.badges});}
 if(m>=j.nextReviewMin){
  const values=Object.fromEntries(Object.keys(j.totals).map(k=>[k,j.totals[k]-(j.reviewBase[k]||0)]));
  const report={id:String(j.nextReviewMin),fromMin:j.reviewStartMin,toMin:m,values,badges:j.badges,partial:m-j.reviewStartMin<7*DAY};
  j.weeks.push(report);if(j.weeks.length>8){archive(s,"week",j.weeks.shift());}
  j.reviewBase={...j.totals};j.reviewStartMin=m;j.nextReviewMin=(Math.floor(m/(7*DAY))+1)*7*DAY;
 }
}
export function handleJourneyCommand(s,command,p){
 if(!["chooseJourneyPath","abandonJourneyPath","setCompanyIdentity","chooseCompanyStory"].includes(command))return null;
 migrateJourney(s);const j=s.journey;
 if(command==="chooseCompanyStory")return chooseCompanyStory(s,p);
 if(command==="chooseJourneyPath")return startJourneyPath(s,p.path);
 if(command==="abandonJourneyPath"){
  if(p.round!==j.round)throw Error("Der Entwicklungsweg hat sich geändert.");
  if(j.goals.length)archive(s,"path",{id:String(j.round),path:j.path,goals:j.goals,endedAtMin:s.gameTime});
  j.goals=[];j.path=null;return {ok:true};
 }
 if(!["#a3e635","#38bdf8","#c4b5fd","#fb923c","#f472b6"].includes(p.color))throw Error("Bitte eine der Firmenfarben auswählen.");
 const motto=String(p.motto||"").trim();if(motto.length>80)throw Error("Der Leitsatz darf höchstens 80 Zeichen haben.");
 j.brand={color:p.color,motto};return {ok:true};
}
