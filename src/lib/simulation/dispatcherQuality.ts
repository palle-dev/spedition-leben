// Reine Auswertung, keine Migration und keine Zufallsziehungen.
export function dispatcherProfile(state, employee) {
  const has = type => (state.training?.qualifications || []).some(q => q.personId === employee.id && q.type === type && q.status === 'active' && (!q.validUntilMin || q.validUntilMin > state.gameTime));
  const lead = has('dispo_lead'), efficient = has('dispo_efficiency');
  const senior = employee.role === 'dispatcher_senior';
  const capacity = (lead ? 18 : senior ? 12 : 6) + (efficient ? 2 : 0);
  return {label:lead?'Dispositionsleiter':senior?'Erfahrener Disponent':'Disponent',capacity,
    bufferMin:lead?15:senior||efficient?20:30,
    horizonMin:lead?96*60:efficient?72*60:48*60,
    candidateOrderLimit:lead?20:efficient||senior?16:12,
    efficiency:efficient,lead};
}
export function dispatcherVehicleIds(state, employeeId) {
  const orders = new Map((state.orders || []).map(o => [o.id, o]));
  const ids = new Set();
  for (const tour of state.tours || []) {
    if (!['active','planned'].includes(tour.status)) continue;
    if (tour.dispatcherId === employeeId || (!tour.dispatcherId && (tour.deployments || []).some(d => orders.get(d.orderId)?.plannedById === employeeId))) ids.add(tour.vehicleId);
  }
  return ids;
}
export function dispatcherReport(state, employee) {
  const profile=dispatcherProfile(state,employee), cutoff=(state.gameTime||0)-7*1440;
  let timely=0,late=0,failed=0,criticalAtPlanning=0;
  for(const order of state.orders||[]) {
    if(order.plannedById!==employee.id)continue;
    if(order.status==='geliefert' && order.deliveredAtMin>=cutoff) {
      if(order.deliveredAtMin<=order.deliveryDeadlineMin)timely++;else late++;
      if(order.dispatchQuality?.lateAtPlanning)criticalAtPlanning++;
    } else if(order.status==='failed' && order.failedAtMin>=cutoff)failed++;
  }
  return {...profile,load:dispatcherVehicleIds(state,employee.id).size,timely,late,failed,criticalAtPlanning,
    punctuality:timely+late?Math.round(timely*100/(timely+late)):null};
}
export function tagDispatcherTour(state,tourId,employeeId) {
  const tour=(state.tours||[]).find(t=>t.id===tourId);
  if(!tour)return;
  tour.dispatcherId=employeeId;
  for(const dep of tour.deployments||[]) {
    const order=state.orders.find(o=>o.id===dep.orderId);
    if(order)order.dispatchQuality={plannedAtMin:state.gameTime,predictedDeliveryMin:dep.endMin,lateAtPlanning:dep.endMin>order.deliveryDeadlineMin};
  }
}
