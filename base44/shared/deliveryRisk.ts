// Read-only risk detection; no random draws, events, finance, or mutation.
export function getDeliveryRisks(state) {
 const now=state.gameTime||0, trips=new Map(), plans=new Map(), issues=new Map();
 for(const t of state.trips||[])if(t.orderId&&t.status==="in_progress")trips.set(t.orderId,t);
 for(const t of state.tours||[]){
  if(["completed","cancelled"].includes(t.status))continue;
  for(const d of t.deployments||[])if(d.orderId&&["planned","active"].includes(d.status))plans.set(d.orderId,{...d,vehicleId:t.vehicleId,driverId:t.driverId});
 }
 for(const d of state.disruptions?.items||[])if(d.status!=="completed")for(const id of d.orderIds||[])issues.set(id,d);
 const vehicles=new Map((state.vehicles||[]).map(v=>[v.id,v])),drivers=new Map((state.drivers||[]).map(d=>[d.id,d]));
 const risks=[];
 for(const o of state.orders||[]){
  if(!["angenommen","unterwegs"].includes(o.status)||!Number.isFinite(o.deliveryDeadlineMin))continue;
  const trip=trips.get(o.id),plan=plans.get(o.id),movement=trip||plan,issue=issues.get(o.id);
  const eta=Number.isFinite(movement?.endMin)?movement.endMin:null;
  const vehicle=vehicles.get(movement?.vehicleId),driver=drivers.get(movement?.driverId);
  let reason=null,code=null;
  if(issue&&issue.type!=="loading_delay"){code="blocked";reason=issue.cause||"Ein Defekt oder Personalausfall blockiert den Einsatz.";}
  else if(o.deliveryDeadlineMin<=now){code="overdue";reason="Die Lieferfrist ist überschritten; der Auftrag ist noch offen.";}
  else if(eta!==null&&eta>o.deliveryDeadlineMin){code="late_eta";reason="Die aktuell geplante Ankunft liegt nach der Lieferfrist.";}
  else if(!movement&&o.deliveryDeadlineMin-now<=120){code="unplanned";reason="Weniger als zwei Spielstunden bis zur Lieferfrist und kein aktiver oder geplanter Transport.";}
  else if(movement&&(trip||movement.startMin<=now)&&vehicle?.status==="maintenance"){code="vehicle";reason="Das eingeplante Fahrzeug befindet sich in Wartung.";}
  else if(movement&&(trip||movement.startMin<=now)&&(driver?.sickUntil>now||["sick","vacation"].includes(driver?.attendance))){code="driver";reason="Der eingeplante Fahrer ist nicht verfügbar.";}
  if(!reason)continue;
  risks.push({id:"risk_"+o.id,key:"risk_"+o.id,type:"delivery_risk",orderId:o.id,title:"Lieferung in Gefahr",source:driver?.name||"Leitstelle",portraitId:driver?.portraitId,description:reason,deadline:o.deliveryDeadlineMin,createdAt:now,eta,code,customer:o.customer,fromCity:o.fromCity,toCity:o.toCity,disruptionId:issue?.id});
 }
 return risks.sort((a,b)=>a.deadline-b.deadline||a.id.localeCompare(b.id));
}
// Management escalation: routine lateness stays visible in orders, not on the phone.
export const ROUTINE_DELAY_MIN = 120;
export function getEscalatedDeliveryRisks(state, risks = getDeliveryRisks(state)) {
 const issues=new Map((state.disruptions?.items||[]).map(d=>[d.id,d]));
 return risks.filter(r=>{
  const issue=issues.get(r.disruptionId);
  if(issue?.status==="measure_running")return false;
  if(["late_eta","overdue"].includes(r.code)){
   if(r.eta===null)return true;
   const late=Math.max(state.gameTime||0,r.eta??0)-r.deadline;
   return late>ROUTINE_DELAY_MIN;
  }
  return true;
 });
}


