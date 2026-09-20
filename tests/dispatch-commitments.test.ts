import {describe,it,expect} from 'vitest';
import {createInitialState,applyCommand} from '@/lib/simulation/simulationEngine';
import {confirmTour,validateTourConfirmation,futureLocation,futureDriverLocation,hasPendingTour,isDriverAvailableForTour,processTours} from '@/lib/simulation/tourEngine';
import {autoAcceptOrders} from '@/lib/simulation/assistantEngine';
import {previewCourseBooking} from '@/lib/simulation/trainingEngine';
function setup(){
 const s:any=createInitialState({}).state;applyCommand(s,'advanceTime',{minutes:0});s.company.accountCents=100000000;
 s.orders=Array.from({length:4},(_,i)=>({...s.orders[0],id:'promise-'+i,status:'offered',fromCity:'Hamburg',toCity:'Kiel',tons:1,isDangerousGoods:false,
  paymentCents:100000,earliestPickupMin:s.gameTime,latestLoadStartMin:s.gameTime+3000,deliveryDeadlineMin:s.gameTime+4000,acceptDeadlineMin:s.gameTime+2000,history:[]}));
 for(const d of s.drivers)Object.assign(d,{status:'free',locationCity:'Hamburg',workMinutesSinceRest:0,driveMinutesSinceBreak:0,restUntil:null});
 for(const v of s.vehicles)Object.assign(v,{status:'free',locationCity:'Hamburg',condition:100});
 s.delegation.rules.maxSpendPerActionCents=100000000;s.delegation.rules.dailyBudgetCents=100000000;
 return s;
}
const params=(s,i=0)=>({vehicleId:s.vehicles[0].id,driverId:s.drivers[0].id,orderIds:[s.orders[i].id]});
describe('Verbindliche und ausführbare Disposition',()=>{
 it('behandelt ein zukünftiges Tourziel nicht als aktuellen Standort',()=>{
  const s=setup();confirmTour(s,{...params(s),minStartTime:s.gameTime+60});
  expect(futureLocation(s,s.vehicles[0])).toBe('Hamburg');expect(futureDriverLocation(s,s.drivers[0])).toBe('Hamburg');
 });
 it('reserviert Fahrzeug und Fahrer unabhängig voneinander, auch bei überfälligem Start',()=>{
  const s=setup();confirmTour(s,{...params(s),minStartTime:s.gameTime+60});
  expect(()=>confirmTour(s,{...params(s,1),driverId:s.drivers[1].id})).toThrow(/reserviert/);
  expect(()=>confirmTour(s,{...params(s,1),vehicleId:s.vehicles[1].id})).toThrow(/reserviert/);
  s.gameTime+=120;
  expect(()=>confirmTour(s,params(s,1))).toThrow(/reserviert/);expect(s.orders[1].status).toBe('offered');
 });
 it('manuelle Einzel- und Leerfahrten übergehen keine zugesagte Tour',()=>{
  const s=setup();confirmTour(s,{...params(s),minStartTime:s.gameTime+60});s.orders[1].status='angenommen';
  expect(()=>applyCommand(s,'startTransport',{vehicleId:s.vehicles[0].id,driverId:s.drivers[0].id,orderId:s.orders[1].id})).toThrow(/reserviert/);
  expect(()=>applyCommand(s,'startEmptyTrip',{vehicleId:s.vehicles[0].id,driverId:s.drivers[0].id,fromCity:'Hamburg',toCity:'Berlin'})).toThrow(/reserviert/);
 });
 it('schützt Rückladung und Rückfahrt vor einer konkurrierenden Disposition',()=>{
  const s=setup();s.orders[1].fromCity='Kiel';s.orders[1].toCity='Bremen';
  const first=confirmTour(s,{...params(s),orderIds:[s.orders[0].id,s.orders[1].id],desiredEndCity:'Hamburg'});
  expect(hasPendingTour(s,s.vehicles[0].id)).toBe(true);
  expect(()=>confirmTour(s,{...params(s,2),driverId:s.drivers[1].id})).toThrow(/reserviert/);
  const t=s.tours.find(t=>t.id===first.tourId);t.deployments.forEach(d=>d.status='completed');
  expect(hasPendingTour(s,s.drivers[0].id)).toBe(true);
 });
 it('startet nach nachgewiesener Ruhe mit denselben Zählern und Zeiten wie die Vorschau',()=>{
  const s=setup(),d=s.drivers[0];d.freeSinceMin=s.gameTime-720;d.workMinutesSinceRest=590;d.driveMinutesSinceBreak=260;
  const preview=validateTourConfirmation(s,params(s)).plan,r=confirmTour(s,params(s));
  const trip=s.trips.find(t=>t.id===r.firstTripId);
  expect(trip.initialCounters).toEqual({workMin:0,driveMin:0});expect(trip.endMin).toBe(preview.lastDeliveryEndMin);
 });
 it('weist die vorgesehene Ruhe auch ohne alten freeSince-Zeitstempel tatsächlich nach',()=>{
  const s=setup(),d=s.drivers[0];s.gameTime+=7;delete d.freeSinceMin;d.workMinutesSinceRest=590;
  const p=validateTourConfirmation(s,params(s)).plan;expect(p.earliestStartMin).toBeGreaterThan(s.gameTime);
  const now=s.gameTime,r=confirmTour(s,params(s));expect(d.freeSinceMin).toBe(now);
  s.gameTime=p.earliestStartMin;processTours(s,s.gameTime,[]);
  const t=s.trips.find(t=>t.tourId===r.tourId);expect(t).toBeTruthy();expect(t.initialCounters.workMin).toBe(0);expect(t.endMin).toBe(p.lastDeliveryEndMin);
 });
 it('lehnt einen bekannten Urlaub oder Kurs mitten in der Fahrt ab',()=>{
  const s=setup(),d=s.drivers[0],from=s.gameTime,to=from+300;
  s.absences.vacationRequests.push({personId:d.id,status:'approved',startMin:from+60,endMin:from+120});
  expect(isDriverAvailableForTour(s,d,from,to)).toBe(false);s.absences.vacationRequests=[];
  s.training.enrollments.push({personId:d.id,status:'reserved',blockStarts:[from+60]});
  expect(isDriverAvailableForTour(s,d,from,to)).toBe(false);
  expect(isDriverAvailableForTour(s,d,from+600,from+660)).toBe(false);
  expect(isDriverAvailableForTour(s,d,from+1260,from+1320)).toBe(true);
 });
 it('erkennt bei Kursbuchung die Fahrerzuordnung auf der Tour',()=>{
  const s=setup(),d=s.drivers[0],first=previewCourseBooking(s,d.id,'eco_drive_1');expect(first.ok).toBe(true);
  s.tours.push({id:'reserved',status:'active',vehicleId:s.vehicles[0].id,driverId:d.id,deployments:[{status:'planned',startMin:first.startMin,endMin:first.endMin}]});
  expect(previewCourseBooking(s,d.id,'eco_drive_1').conflicts.some(c=>c.type==='planned_tour')).toBe(true);
 });
 it('nimmt ohne Fahrzeug keinen Auftrag nur wegen guter Marge an',()=>{
  const s=setup();s.vehicles=[];const emp={id:'assistant-test',role:'assistant',name:'Test',employmentStatus:'employed',attendance:'present'};s.employees.push(emp);
  autoAcceptOrders(s,emp,s.gameTime,[],true);expect(s.orders.every(o=>o.status==='offered')).toBe(true);
 });
 it('bindet jede Assistentenzusage an eine bestätigte Tour und nimmt nicht mehrfach dieselbe Kapazität',()=>{
  const s=setup();s.vehicles=s.vehicles.slice(0,1);s.drivers=s.drivers.slice(0,1);
  const emp={id:'assistant-test',role:'assistant',name:'Test',employmentStatus:'employed',attendance:'present'};s.employees.push(emp);
  autoAcceptOrders(s,emp,s.gameTime,[],true);autoAcceptOrders(s,emp,s.gameTime,[],true);
  const accepted=s.orders.filter(o=>o.status!=='offered');expect(accepted.length).toBeGreaterThan(0);
  for(const o of accepted)expect(s.tours.some(t=>t.deployments.some(d=>d.orderId===o.id))).toBe(true);
  expect(s.tours.filter(t=>t.deployments.some(d=>d.status==='planned')).length).toBeLessThanOrEqual(1);
 });
});
