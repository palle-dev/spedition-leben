import { getBranchPhoneProposal } from "./branchPhone.ts";
import { checkBodyTypeCompatibility } from "./gameRules.ts";
import { findOrder } from "./orderLookup.ts";
import { withTourValidation, getOrderReservation } from "./tourEngine.ts";
import { isLeasingOverdueBlocked } from "./financingEngine.ts";
import { getValidatedDisruptionOptions } from "./disruptionEngine.ts";

// One event-boundary evaluation is read-only for tour planning. Share its
// resource calculations across calls, and discard them before the next event.
const proposalValidators = new WeakMap<object, any>();
export function withPhoneProposalSearch<T>(state, action: () => T): T {
 const previous=proposalValidators.get(state);
 return withTourValidation(state, validate=>{
  proposalValidators.set(state,validate);
  try{return action();}
  finally{if(previous)proposalValidators.set(state,previous);else proposalValidators.delete(state);}
 });
}
function searchCandidates(state, action) {
 const validate=proposalValidators.get(state);
 return validate ? action(validate) : withTourValidation(state,action);
}

export function proposalSignature(option) {
 return JSON.stringify([option.id,option.costCents,option.estimatedDurationMin,option.description,option.params]);
}
export function getPhoneProposals(state, call, limit = 2) {
 if (!call || call.demo) return [];
 if (call.type==="branch_decision") {const proposal=getBranchPhoneProposal(state,call.id);return proposal?[proposal]:[];}
 if ((state.appointments||[]).some(a=>a.status==="active"&&a.type!=="scenario_timeoff")) return [];
 if (call.type !== "delivery_risk") {
  return getValidatedDisruptionOptions(state,call.id).map(o=>({...o,command:"resolveDisruption",params:{disruptionId:call.id,optionId:o.id,params:{phoneQuote:{cost:o.costCents,duration:o.estimatedDurationMin,description:o.description}}},informationOnly:o.id==="inform_customer"}));
 }
 const order=findOrder(state,call.orderId);
 if(!order || !["angenommen","unterwegs"].includes(order.status))return [];
 // No newly planned loading phase can start before the current game time.
 // A missed hard loading window cannot be repaired by trying more drivers.
 if(order.windowVersion>=2 && order.latestLoadStartMin<state.gameTime)return [];
 const proposals=[];
 if(order.status==="angenommen" && !getOrderReservation(state,order.id) && !order.externalTransportId &&
   !(state.trips||[]).some(t=>t.orderId===order.id&&t.status==="in_progress")){
  const candidates=searchCandidates(state, validate => {
  const candidates=[];
  candidateSearch: for(const v of state.vehicles.filter(v=>v.status==="free"&&v.condition>=20&&!isLeasingOverdueBlocked(state,v.id))){
   // Both constraints are independent of the driver and mandatory in buildTourPlan.
   if(order.tons>v.capacityTons || !checkBodyTypeCompatibility(order,v).ok)continue;
   for(const d of state.drivers.filter(d=>d.status==="free"&&d.locationCity===v.locationCity)){
    const params={vehicleId:v.id,driverId:d.id,orderIds:[order.id]};
    try {
     const result=validate(params);
     if(!result)continue;
     const {plan}=result;
     candidates.push({v,d,params,plan});
     if(limit===1)break candidateSearch;
    }catch{ /* No executable proposal for this pair. */ }
   }
  }
  return candidates;
  });
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
