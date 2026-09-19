import {isEmployeeAvailable,createStaffTask,deliverMessage} from "./mailEngine.ts";
import {isPersonAvailable} from "./absenceEngine.ts";
import {isPersonInTraining} from "./trainingEngine.ts";
import {setBranchManagerMode,approveBranchDecision,rejectBranchDecision} from "./branchManagerEngine.ts";

const TASKS={
 assistant_report:{label:"Tagesbericht erstellen",description:"Der Assistent erstellt einen Bericht. Die Antwort erscheint nach Bearbeitung im Postfach."},
 assistant_accept_orders:{label:"Passende Aufträge prüfen und annehmen",description:"Der Assistent darf passende Angebote nach den bestehenden Annahmeregeln verbindlich annehmen. Dadurch entstehen Lieferverpflichtungen."},
 assistant_dispatch:{label:"Offene Aufträge disponieren",description:"Der Assistent plant ausführbare Touren innerhalb der vorhandenen Befugnisse. Dabei können Transportkosten entstehen."},
 assistant_optimize_costs:{label:"Gemeinkosten prüfen und optimieren",description:"Der Assistent prüft die bestehenden Einsparmöglichkeiten und setzt zulässige Optimierungen um."}
};
export function getStaffPhoneContacts(state){
 return (state.employees||[]).filter(e=>e.employmentStatus==="employed"&&["assistant","branch_manager"].includes(e.role)).map(e=>{
  const branch=e.role==="branch_manager"?(state.branches||[]).find(b=>b.id===e.assignedBranchId&&b.status==="active"):null;
  let availability=isEmployeeAvailable(state,e.id,state.gameTime);
  if(!isPersonAvailable(state,e.id,state.gameTime)||isPersonInTraining(state,e.id,state.gameTime))availability={available:false,reason:"in Abwesenheit oder Weiterbildung"};
  if(e.role==="branch_manager"&&!branch)availability={available:false,reason:"kein aktiver Standort zugewiesen"};
  return {id:e.id,name:e.name,portraitId:e.portraitId,role:e.role,branchId:branch?.id,label:e.role==="assistant"?"Assistenz der Geschäftsführung":"Filialleitung · "+(branch?.name||branch?.city||"ohne Standort"),...availability};
 }).sort((a,b)=>a.role.localeCompare(b.role)||a.name.localeCompare(b.name));
}
export function getStaffPhoneData(state,employeeId){
 const contact=getStaffPhoneContacts(state).find(c=>c.id===employeeId);
 if(!contact)return null;
 const branchId=contact.branchId;
 const vehicles=(state.vehicles||[]).filter(v=>!["sold","archived"].includes(v.status)&&(!branchId||v.branchId===branchId));
 const vehicleIds=new Set(vehicles.map(v=>v.id)),orderIds=new Set();
 for(const trip of state.trips||[])if(vehicleIds.has(trip.vehicleId)&&trip.orderId)orderIds.add(trip.orderId);
 for(const tour of state.tours||[])if(!branchId||tour.branchId===branchId||vehicleIds.has(tour.vehicleId))for(const d of tour.deployments||[])if(d.orderId)orderIds.add(d.orderId);
 const orders=(state.orders||[]).filter(o=>!branchId||o.branchId===branchId||orderIds.has(o.id));
 const decisions=(state.branchDecisions||[]).filter(d=>d.status==="pending"&&(!branchId||(d.branchId===branchId&&d.managerId===employeeId)));
 const pending=(state.mail?.staffTasks||[]).filter(t=>t.employeeId===employeeId);
 const report=[
  {label:"Flotte",value:vehicles.length+" Lkw · "+vehicles.filter(v=>v.status==="free").length+" frei · "+vehicles.filter(v=>v.status==="on_trip").length+" unterwegs"},
  {label:branchId?"Standortzugeordnete Aufträge":"Aufträge im Unternehmen",value:orders.filter(o=>o.status==="angenommen").length+" angenommen · "+orders.filter(o=>o.status==="unterwegs").length+" unterwegs"},
  {label:"Offene Standortentscheidungen",value:String(decisions.length)}
 ];
 if(!branchId)report.push({label:"Firmenkonto",value:(state.company.accountCents/100).toLocaleString("de-DE",{style:"currency",currency:"EUR"})});
 const actions=[];
 if(contact.role==="assistant"){
  for(const [action,info]of Object.entries(TASKS)){
   const waiting=pending.some(t=>t.type===action&&["pending","in_progress"].includes(t.status));
   actions.push({id:action,...info,disabled:waiting,reason:waiting?"Bereits zur Bearbeitung angenommen":null,params:{action}});
  }
 }else{
  const emp=state.employees.find(e=>e.id===employeeId);
  const mode=emp.managementMode||"requests_approval";
  report.push({label:"Arbeitsweise",value:mode==="autonomous"?"Selbstständig":"Mit Freigabe"});
  actions.push({id:"mode",label:mode==="autonomous"?"Maßnahmen wieder zur Freigabe vorlegen":"Standort selbstständig führen",
   description:mode==="autonomous"?"Neue Standortmaßnahmen werden dir zur Entscheidung vorgelegt.":"Der Filialleiter darf Standortmaßnahmen selbstständig ausführen. Dabei können Kosten und neue Verpflichtungen entstehen.",
   params:{action:"mode",mode:mode==="autonomous"?"requests_approval":"autonomous"}});
  for(const d of decisions)for(const approve of [true,false])actions.push({id:d.id+(approve?":approve":":reject"),
   label:(approve?"Freigeben: ":"Ablehnen: ")+d.title,
   description:approve?(d.description||"Die vorgeschlagene Standortmaßnahme wird verbindlich ausgeführt."):"Diese konkrete Maßnahme wird nicht beauftragt.",
   costCents:approve?d.costCents||0:0,
   params:{action:approve?"approve":"reject",decisionId:d.id,expectedCostCents:d.costCents||0}});
 }
 return {contact,report,actions,tasks:pending.slice(-4).reverse()};
}
export function executeStaffPhoneCommand(state,p){
 const data=getStaffPhoneData(state,p.employeeId);
 if(!data)throw Error("Diese Person gehört nicht mehr zu deinem Führungsteam.");
 if(!data.contact.available)throw Error("Die Person ist derzeit nicht erreichbar: "+data.contact.reason);
 const action=data.actions.find(a=>a.params.action===p.action && (!a.params.decisionId||a.params.decisionId===p.decisionId));
 if(!action)throw Error("Diese Anweisung ist für die Person nicht verfügbar.");
 if(action.disabled)return {ok:true,queued:true,summary:"Diese Aufgabe ist bereits zur Bearbeitung angenommen."};
 if(p.action==="mode"){
  if(!["autonomous","requests_approval"].includes(p.mode))throw Error("Ungültiger Führungsmodus.");
  setBranchManagerMode(state,p.employeeId,p.mode);
 }else if(p.action==="approve"||p.action==="reject"){
  const d=(state.branchDecisions||[]).find(d=>d.id===p.decisionId&&d.status==="pending"&&d.branchId===data.contact.branchId&&d.managerId===p.employeeId);
  if(!d || (d.costCents||0)!==p.expectedCostCents)throw Error("Der Vorschlag hat sich geändert. Bitte erneut prüfen.");
  if(p.action==="approve")approveBranchDecision(state,d.id);else rejectBranchDecision(state,d.id);
 }else{
  const task=createStaffTask(state,{employeeId:p.employeeId,type:p.action,params:{},conversationId:null,messageId:null,earliestProcessMin:state.gameTime+15});
  deliverMessage(state,{fromId:p.employeeId,toId:"player",subject:"Telefonauftrag: "+action.label,body:"Auftrag angenommen. Bearbeitung frühestens in 15 Spielminuten während meiner Dienstzeit. Das Ergebnis folgt im Postfach.",gameTime:state.gameTime,category:"operations",dedupKey:"staff_phone:"+task.id});
  return {ok:true,queued:true,taskId:task.id,summary:"Auftrag angenommen. Bearbeitung frühestens in 15 Spielminuten während der Dienstzeit; Ergebnis im Postfach."};
 }
 const summary=p.action==="mode"?"Die Arbeitsweise wurde umgestellt.":p.action==="approve"?"Die Standortmaßnahme wurde ausgeführt.":"Die Standortmaßnahme wurde abgelehnt.";
 deliverMessage(state,{fromId:p.employeeId,toId:"player",subject:"Gesprächsnotiz: "+action.label,body:summary,gameTime:state.gameTime,category:"operations"});
 return {ok:true,summary};
}
