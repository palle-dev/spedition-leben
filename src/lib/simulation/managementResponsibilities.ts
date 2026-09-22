import {MANAGEMENT_GOALS,activeManagementGoal,setManagementGoal,managementGoalProgress} from "./managementGoals.ts";
import { deliverMessage, isEmployeeAvailable } from "./mailEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { isPersonInTraining } from "./trainingEngine.ts";

const ASSISTANT: [string,string,boolean][] = [
 ["autoAcceptOrders","Auftragsannahme",true],["autoDispatch","Disposition",false],
 ["accounting","Buchhaltungsunterstützung",true],["costOptimization","Kostenoptimierung",true],
 ["staffDevelopment","Personalentwicklung",true],["autoBookTraining","Kurse verbindlich buchen",true],
 ["orderMonitoring","Lieferfristen überwachen",true],["fleetUtilizationMonitoring","Flottenauslastung prüfen",true],
 ["managementReport","Liquidität und Personalbedarf täglich berichten",false]
];
const BRANCH: [string,string,boolean][] = [
 ["fleet","Fuhrpark und Wartung",true],["staff","Einstellungen und Weiterbildung",true],
 ["growth","Fahrzeugbeschaffung und Werkstattausbau",true],["orders","Aufträge und Disposition",true],
 ["costs","Standortkosten optimieren",true],["managementReport","Standortlage täglich berichten",false]
];
export function branchResponsibilityAllows(manager,type) {
 const key=({maintenance:"fleet",hire_driver:"staff",staff_training:"staff",hire_employee:"staff",buy_vehicle:"growth",build_workshop_slot:"growth",accept_order:"orders",optimize_dispatch:"orders",cost_optimization:"costs"})[type.split(":")[0]];
 return !key || manager.responsibilities?.[key] !== false;
}
export function managementReport(state,employee) {
 const branchId=employee.role==="branch_manager"?employee.assignedBranchId:null;
 const vehicles=(state.vehicles||[]).filter(v=>!["sold","archived"].includes(v.status)&&(!branchId||v.branchId===branchId));
 const drivers=(state.drivers||[]).filter(d=>d.employmentStatus==="employed"&&(!branchId||d.branchId===branchId));
 const vehiclesIds=new Set(vehicles.map(v=>v.id));
 const risks=(state.disruptions?.items||[]).filter(d=>d.status!=="completed"&&(!branchId||vehiclesIds.has(d.vehicleId)));
 const lines=[
  "Flotte: "+vehicles.length+" Fahrzeuge; "+vehicles.filter(v=>v.condition<50).length+" mit Zustand unter 50.",
  "Personal: "+drivers.length+" beschäftigte Fahrer; rechnerische Unterdeckung: "+Math.max(0,vehicles.length-drivers.length)+".",
  "Offene Störungen: "+risks.length+"."
 ];
 if(!branchId) {
  const due=(state.openCosts||[]).filter(c=>c.account==="company").reduce((sum,c)=>sum+Math.max(0,c.amountCents||0),0);
  lines.push("Firmenkonto: "+(state.company.accountCents/100).toFixed(2)+" EUR.",
   "Offene Betriebskosten: "+(due/100).toFixed(2)+" EUR. Buchhalterische offene Posten bitte zusätzlich prüfen.");
 }
 const goal=activeManagementGoal(state,employee.id);if(goal){const r=managementGoalProgress(state,goal);lines.push("Führungsziel: "+MANAGEMENT_GOALS.find(x=>x.id===goal.kind)?.label+"; Bilanz an Tag "+(Math.floor(goal.dueMin/1440)+1)+". "+(goal.kind==="reliability"?r.onTime+" von "+r.delivered+" Lieferungen pünktlich (mindestens 10 nötig).":r.staff+" Fahrer für "+r.vehicles+" Lkw."));}
 return lines.join("\n");
}
export function getManagementPhoneActions(state,employee) {
 const assistant=employee.role==="assistant",config=assistant?(state.assistantConfig||{}):(employee.responsibilities||{});
 const actions: any[]=(assistant?ASSISTANT:BRANCH).map(([key,label,defaultValue])=>{
  const current=config[key]??defaultValue;
  return {id:"responsibility:"+key,label:(current?"Entziehen: ":"Übertragen: ")+label,
   description:(current?"Diese dauerhafte Zuständigkeit wird deaktiviert. Bereits beauftragte Maßnahmen bleiben bestehen.":"Diese Zuständigkeit wird dauerhaft übertragen. Bestehende Ausgabenregeln, Qualifikationen und Freigaben gelten weiterhin.")+(assistant?" Die Einstellung gilt für die Assistenzfunktion im Unternehmen.":" Sie gilt ausschließlich für diesen Standort."),
   params:{action:"responsibility:"+key,enabled:!current,expected:current}};
 });
 actions.unshift({id:"management_report",label:"Liquidität, Personal und Betriebsrisiken prüfen",description:"Eine aktuelle Lageeinschätzung wird ohne Buchungen erstellt und im Postfach abgelegt.",params:{action:"management_report"}});
 if(!assistant)for(const amount of [50000,200000,500000])actions.push({id:"management_budget:"+amount,label:"Autonomes Tagesbudget: "+amount/100+" €",description:"Gemeinsame Obergrenze pro Spieltag für selbstständige Standortmaßnahmen. Darüber wird eine Freigabe benötigt. Bereits ausgegebenes Tagesbudget bleibt angerechnet.",params:{action:"management_budget:"+amount,amountCents:amount}});
 if(state.journey&&!activeManagementGoal(state,employee.id))for(const goal of MANAGEMENT_GOALS)actions.push({id:"management_goal:"+goal.id,label:"14-Tage-Ziel: "+goal.label,description:goal.detail+" Bestehende Budgets und Befugnisse gelten unverändert.",params:{action:"management_goal:"+goal.id,kind:goal.id}});
 return actions;
}
export function executeManagementPhoneAction(state,employee,p) {
 const action=getManagementPhoneActions(state,employee).find(a=>a.params.action===p.action);
 if(!action)return null;
 if(JSON.stringify(action.params)!==JSON.stringify(Object.fromEntries(Object.keys(action.params).map(k=>[k,p[k]]))))throw Error("Die Zuständigkeit hat sich geändert. Bitte erneut prüfen.");
 let summary;
 if(p.action==="management_report")summary=managementReport(state,employee);
 else if(p.action.startsWith("management_goal:")){setManagementGoal(state,{employeeId:employee.id,kind:p.kind});summary="Führungsziel übernommen. Die Bilanz erscheint unter Führung & Delegation.";}
 else if(p.action.startsWith("management_budget:")){employee.autonomousDailyBudgetCents=p.amountCents;summary="Tagesbudget auf "+p.amountCents/100+" EUR gesetzt.";}
 else {
  const key=p.action.slice("responsibility:".length);
  const config=employee.role==="assistant"?(state.assistantConfig||(state.assistantConfig={})):(employee.responsibilities||(employee.responsibilities={}));
  config[key]=p.enabled;summary=action.label+" – dauerhaft übernommen.";
 }
 deliverMessage(state,{fromId:employee.id,toId:"player",subject:"Führungsauftrag: "+action.label,body:summary,gameTime:state.gameTime,category:"reports"});
 return {ok:true,summary};
}
export function processManagementReports(state,m) {
 if(m%60!==0 || m%1440<480 || m%1440>=1080)return;
 const day=Math.floor(m/1440);
 for(const employee of state.employees||[]){
  if(employee.employmentStatus!=="employed"||!["assistant","branch_manager"].includes(employee.role))continue;
  if(employee.role==="branch_manager"&&!(state.branches||[]).some(b=>b.id===employee.assignedBranchId&&b.status==="active"))continue;
  const config=employee.role==="assistant"?state.assistantConfig:employee.responsibilities;
  if(!config?.managementReport||employee.lastManagementReportDay===day||!isEmployeeAvailable(state,employee.id,m).available||!isPersonAvailable(state,employee.id,m)||isPersonInTraining(state,employee.id,m))continue;
  employee.lastManagementReportDay=day;
  deliverMessage(state,{fromId:employee.id,toId:"player",subject:"Lagebericht: "+employee.name,body:managementReport(state,employee),gameTime:m,category:"reports",dedupKey:"management_report:"+employee.id+":"+day});
 }
}
