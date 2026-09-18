import { getDeliveryRisks, getEscalatedDeliveryRisks } from "./deliveryRisk.ts";
import { deliverMessage } from "./mailEngine.ts";

// Called at simulation event boundaries; deterministic and idempotent.
export function processPhoneCommunications(state, silent=false){
 const risks=getDeliveryRisks(state);
 const orders=new Map((state.orders||[]).map(o=>[o.id,o]));
 for(const risk of risks){
  const order=orders.get(risk.orderId);
  if(!order || order.phoneCustomerInformed || risk.code==="unplanned")continue;
  const previous=(state.disruptions?.items||[]).some(d=>d.customerInformed&&d.orderIds?.includes(order.id));
  if(!previous)deliverMessage(state,{fromId:"system",toId:"player",subject:"Kundeninfo: "+order.customer,
   body:"Das Team hat "+order.customer+" über die Liefergefährdung informiert. Lieferfrist und tatsächliche Verspätungsfolgen bleiben unverändert.",
   gameTime:state.gameTime,category:"operations",priority:"normal",linkedRefs:{type:"order",id:order.id},dedupKey:"phone_customer:"+order.id});
  order.phoneCustomerInformed=true;
 }
 if(!silent)return;
 const calls=getEscalatedDeliveryRisks(state).map(r=>({...r,id:r.disruptionId||r.id,type:r.disruptionId?"disruption":r.type}));
 for(const d of state.disruptions?.items||[]){
  if(d.status!=="decision_open"||d.type==="loading_delay"||calls.some(c=>c.id===d.id))continue;
  calls.push({id:d.id,type:"disruption",title:d.cause||"Rückruf der Leitstelle",source:"Leitstelle",disruptionId:d.id});
 }
 if(!calls.length)return;
 const missed=state.missedPhoneCalls||(state.missedPhoneCalls=[]);
 const known=new Set(missed.map(c=>c.id));
 for(const call of calls)if(!known.has(call.id)){missed.push({...call,missedAtMin:state.gameTime});known.add(call.id);}
 // Keep unresolved calls even in very long saves.
 const active=new Set(calls.map(c=>c.id));
 state.missedPhoneCalls=missed.filter((c,i)=>active.has(c.id)||i>=missed.length-100);
}
