import { validateTourConfirmation, _clearPlanCache, getOrderReservation } from "./tourEngine.ts";
import { isLeasingOverdueBlocked } from "./financingEngine.ts";
import { getDisruptionDetail, validateDisruptionResolution } from "./disruptionEngine.ts";

export function proposalSignature(option) {
 return JSON.stringify([option.id,option.costCents,option.estimatedDurationMin,option.description,option.params]);
}
export function getPhoneProposals(state, call, limit = 2) {
 if (!call || call.demo || (state.appointments||[]).some(a=>a.status==="active"&&a.type!=="scenario_timeoff")) return [];
 if (call.type !== "delivery_risk") {
  const detail=getDisruptionDetail(state,call.id);
  if(detail?.status!=="decision_open")return [];
  return detail.options.filter(o=>{
   if(!o.available || o.id==="inform_customer" || (o.costCents||0)>state.company.accountCents)return false;
   try{validateDisruptionResolution(state,call.id,o.id,{});return true;}catch{return false;}
  }).map(o=>({...o,command:"resolveDisruption",params:{disruptionId:call.id,optionId:o.id,params:{phoneQuote:{cost:o.costCents,duration:o.estimatedDurationMin,description:o.description}}},informationOnly:o.id==="inform_customer"}));
 }
 const order=state.orders.find(o=>o.id===call.orderId);
 if(!order || !["angenommen","unterwegs"].includes(order.status))return [];
 const proposals=[];
 if(order.status==="angenommen" && !getOrderReservation(state,order.id) && !order.externalTransportId &&
   !(state.trips||[]).some(t=>t.orderId===order.id&&t.status==="in_progress")){
  _clearPlanCache();
  const candidates=[];
  candidateSearch: for(const v of state.vehicles.filter(v=>v.status==="free"&&v.condition>=20&&!isLeasingOverdueBlocked(state,v.id))){
   for(const d of state.drivers.filter(d=>d.status==="free"&&d.locationCity===v.locationCity)){
    const params={vehicleId:v.id,driverId:d.id,orderIds:[order.id]};
    try {
     const {plan}=validateTourConfirmation(state,params);
     if(!plan.ok)continue;
     candidates.push({v,d,params,plan});
     if(limit===1)break candidateSearch;
    }catch{ /* No executable proposal for this pair. */ }
   }
  }
  candidates.sort((a,b)=>a.plan.lastDeliveryEndMin-b.plan.lastDeliveryEndMin||a.plan.totalVariableCostCents-b.plan.totalVariableCostCents);
  for(const {v,d,params,plan} of candidates){
   proposals.push({id:"tour:"+v.id+":"+d.id,label:"Lieferung mit eigenem Team disponieren",
    description:d.name+" übernimmt mit "+(v.plate||v.name||v.id)+". Die Tour wird verbindlich eingeplant. Start und Ankunft stehen unten; die Spielzeit läuft dadurch nicht vor.",
    costCents:plan.totalVariableCostCents,estimatedDurationMin:plan.lastDeliveryEndMin-plan.earliestStartMin,
    startMin:plan.earliestStartMin,eta:plan.lastDeliveryEndMin,isEstimate:true,
    command:"confirmTour",params:{...params,phoneQuote:{cost:plan.totalVariableCostCents,start:plan.earliestStartMin,eta:plan.lastDeliveryEndMin}}});
   if(proposals.length===limit)break;
  }
 }
 return proposals;
}
