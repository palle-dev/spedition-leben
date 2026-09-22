import { preserveHistory } from "./historyRetention.ts";
export const MANAGEMENT_GOALS=[
 {id:"reliability",label:"Verlässlich liefern",detail:"14 Tage: mindestens 10 abgeschlossene Lieferungen, davon mindestens 90 % pünktlich. Disposition und Betriebsbereitschaft haben Vorrang."},
 {id:"staffing",label:"Team vor Wachstum",detail:"In 14 Tagen mindestens ein beschäftigter Fahrer je aktivem Lkw. Personalengpässe haben Vorrang vor weiteren Fahrzeugkäufen."}
];
const fleet=(s,branchId)=>(s.vehicles||[]).filter(v=>!["sold","archived"].includes(v.status)&&(!branchId||v.branchId===branchId));
const drivers=(s,branchId)=>(s.drivers||[]).filter(d=>d.employmentStatus==="employed"&&(!branchId||d.branchId===branchId));
const totals=(s,branchId)=>branchId?(s.journey?.branchTotals[branchId]||{delivered:0,onTime:0}):s.journey.totals;
export function activeManagementGoal(s,employeeId){return s.journey?.mandates?.find(g=>g.employeeId===employeeId&&g.status==="active");}
export function managementGoalProgress(s,g){
 const t=totals(s,g.branchId),delivered=Math.max(0,t.delivered-g.baseline.delivered),onTime=Math.max(0,t.onTime-g.baseline.onTime),vehicles=fleet(s,g.branchId).length,staff=drivers(s,g.branchId).length;
 return {delivered,onTime,percent:delivered?Math.round(100*onTime/delivered):null,vehicles,staff,met:g.kind==="reliability"?delivered>=10&&onTime/delivered>=.9:vehicles>0&&staff>=vehicles};
}
function close(s,g,status){g.result=managementGoalProgress(s,g);g.status=status;g.closedAtMin=s.gameTime;preserveHistory(s,"events",[{id:"management_goal:"+g.id,type:"management_goal",title:"Führungsbilanz: "+g.name,gameTime:s.gameTime,isSystem:true,seen:true,details:structuredClone(g)}]);}
export function setManagementGoal(s,p){
 const e=(s.employees||[]).find(e=>e.id===p.employeeId&&e.employmentStatus==="employed"&&["assistant","branch_manager"].includes(e.role));
 if(!e)throw Error("Keine beschäftigte Führungskraft ausgewählt.");
 const old=activeManagementGoal(s,e.id);if(old)throw Error("Diese Führungskraft hat bereits einen laufenden Auftrag.");
 if(!MANAGEMENT_GOALS.some(x=>x.id===p.kind))throw Error("Unbekanntes Führungsziel.");
 const branchId=e.role==="branch_manager"?e.assignedBranchId:null;
 if(e.role==="branch_manager"&&!(s.branches||[]).some(b=>b.id===branchId&&b.status==="active"))throw Error("Keine aktive Filiale zugewiesen.");
 const j=s.journey;j.mandateSeq=(j.mandateSeq||0)+1;
 j.mandates.push({id:String(j.mandateSeq),employeeId:e.id,name:e.name,branchId,kind:p.kind,status:"active",startedAtMin:s.gameTime,dueMin:(Math.ceil(s.gameTime/1440)+14)*1440,baseline:{...totals(s,branchId)}});
 const completed=j.mandates.filter(g=>g.status!=="active");if(completed.length>16){const remove=new Set(completed.slice(0,-16).map(g=>g.id));j.mandates=j.mandates.filter(g=>!remove.has(g.id));}
 return {ok:true};
}
export function cancelManagementGoal(s,p){const g=s.journey?.mandates.find(g=>g.id===p.id&&g.status==="active");if(!g)throw Error("Dieser Führungsauftrag ist nicht mehr aktiv.");close(s,g,"cancelled");return {ok:true};}
export function processManagementGoals(s,m){
 for(const g of s.journey?.mandates||[]){if(g.status!=="active")continue;
 const e=(s.employees||[]).find(e=>e.id===g.employeeId&&e.employmentStatus==="employed");
 if(!e||(!g.branchId&&e.role!=="assistant")||!["assistant","branch_manager"].includes(e.role)||(g.branchId&&(e.role!=="branch_manager"||e.assignedBranchId!==g.branchId||!s.branches.some(b=>b.id===g.branchId&&b.status==="active")))){close(s,g,"interrupted");continue;}
 if(m>=g.dueMin){const r=managementGoalProgress(s,g);close(s,g,g.kind==="reliability"&&r.delivered<10?"insufficient":r.met?"achieved":"missed");}
 }
}
// Only recommendation ordering changes. Existing responsibility, budget and approval gates remain in charge.
export function managementPriority(s,manager,branch){
 const own=activeManagementGoal(s,manager.id),global=s.journey?.mandates?.find(g=>g.status==="active"&&!g.branchId&&(s.employees||[]).some(e=>e.id===g.employeeId&&e.role==="assistant"&&e.employmentStatus==="employed"));
 const g=own||global;if(!g||s.gameTime>=g.dueMin)return null;
 const vs=fleet(s,branch.id),ds=drivers(s,branch.id);
 if(ds.length<vs.length)return "hire_driver";
 if(g.kind==="reliability"){
  const dispatchers=(s.employees||[]).filter(e=>e.employmentStatus==="employed"&&["dispatcher","dispatcher_senior"].includes(e.role)&&(e.assignedBranchId===branch.id||e.branchId===branch.id));
  if(vs.length>=2&&!dispatchers.length)return "hire_employee:dispatcher";
  if(dispatchers.some(e=>e.workMode!=="autonomous")&&vs.some(v=>v.status==="free")&&(s.orders||[]).some(o=>o.status==="angenommen"&&o.fromCity===branch.city))return "optimize_dispatch";
  if(vs.some(v=>v.condition<60))return "maintenance";
 }
 return null;
}
