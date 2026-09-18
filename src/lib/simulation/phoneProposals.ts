import { buildTourPlan, confirmTour, _clearPlanCache, getOrderReservation } from "./tourEngine.ts";
import { getDisruptionDetail } from "./disruptionEngine.ts";

export function proposalSignature(option) {
 return JSON.stringify([option.id,option.costCents,option.estimatedDurationMin,option.description,option.params]);
}
export function getPhoneProposals(state, call) {
 if (!call || call.demo) return [];
 if (call.type !== "delivery_risk") {
  const detail=getDisruptionDetail(state,call.id);
  if(detail?.status!=="decision_open")return [];
  return detail.options.filter(o=>o.available).map(o=>({...o,command:"resolveDisruption",params:{disruptionId:call.id,optionId:o.id,params:{phoneQuote:{cost:o.costCents,duration:o.estimatedDurationMin,description:o.description}}},informationOnly:o.id==="inform_customer"}));
 }
 const order=state.orders.find(o=>o.id===call.orderId);
 if(!order || !["angenommen","unterwegs"].includes(order.status))return [];
 const proposals=[];
 if(order.status==="angenommen" && !getOrderReservation(state,order.id) && !order.externalTransportId &&
   !(state.trips||[]).some(t=>t.orderId===order.id&&t.status==="in_progress")){
  _clearPlanCache();
  const candidates=[];
  for(const v of state.vehicles.filter(v=>v.status==="free"&&v.condition>=20)){
   for(const d of state.drivers.filter(d=>d.status==="free"&&d.locationCity===v.locationCity)){
    const params={vehicleId:v.id,driverId:d.id,orderIds:[order.id]};
    try {
     const plan=buildTourPlan(state,params);
     if(!plan.ok)continue;
     candidates.push({v,d,params,plan});
    }catch{ /* No executable proposal for this pair. */ }
   }
  }
  candidates.sort((a,b)=>a.plan.lastDeliveryEndMin-b.plan.lastDeliveryEndMin||a.plan.totalVariableCostCents-b.plan.totalVariableCostCents);
  for(const {v,d,params,plan} of candidates){
   try{confirmTour(structuredClone(state),params);}catch{continue;}
   proposals.push({id:"tour:"+v.id+":"+d.id,label:"Lieferung mit eigenem Team disponieren",
    description:d.name+" übernimmt mit "+(v.plate||v.name||v.id)+". Die Tour wird verbindlich eingeplant. Start und Ankunft stehen unten; die Spielzeit läuft dadurch nicht vor.",
    costCents:plan.totalVariableCostCents,estimatedDurationMin:plan.lastDeliveryEndMin-plan.earliestStartMin,
    startMin:plan.earliestStartMin,eta:plan.lastDeliveryEndMin,isEstimate:true,
    command:"confirmTour",params:{...params,phoneQuote:{cost:plan.totalVariableCostCents,start:plan.earliestStartMin,eta:plan.lastDeliveryEndMin}}});
   if(proposals.length===2)break;
  }
 }
 if(!order.phoneCustomerInformed && !(state.disruptions?.items||[]).some(d=>d.customerInformed && d.orderIds?.includes(order.id)))proposals.push({id:"customer:"+order.id,label:"Kunden über das Lieferrisiko informieren",
  description:"Die Leitstelle informiert "+order.customer+" und dokumentiert die Mitteilung. Das ändert weder die Lieferfrist noch mögliche Verspätungsfolgen und behebt keinen Defekt.",
  costCents:0,estimatedDurationMin:0,informationOnly:true,command:"phoneInformCustomer",params:{orderId:order.id}});
 return proposals;
}
