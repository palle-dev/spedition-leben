import {describe,it,expect} from 'vitest';
import {createInitialState,applyCommand} from '@/lib/simulation/simulationEngine';
import {suggestTours,buildTourPlan} from '@/lib/simulation/tourEngine';
import {processDispatcher,planSingleVehicle} from '@/lib/simulation/dispatcherProcessor';
import {dispatcherProfile,dispatcherVehicleIds,dispatcherReport} from '@/lib/simulation/dispatcherQuality';
import {bookCourse,checkCoursePrerequisites} from '@/lib/simulation/trainingEngine';
function base(count=1) {
 const s:any=createInitialState({}).state;applyCommand(s,'advanceTime',{minutes:0});s.company.accountCents=100000000;
 const app=s.availableApplicants.find(a=>a.role==='dispatcher');applyCommand(s,'hireEmployee',{applicantId:app.id});
 const emp=s.employees[0];emp.workMode='autonomous';
 s.vehicles=Array.from({length:count},(_,i)=>({...structuredClone(s.vehicles[0]),id:'v'+i,condition:100}));
 s.drivers=Array.from({length:count},(_,i)=>({...structuredClone(s.drivers[0]),id:'d'+i}));
 s.orders=Array.from({length:count},(_,i)=>({...structuredClone(s.orders[0]),id:'o'+i,deliveryDeadlineMin:5000,acceptDeadlineMin:3000,latestLoadStartMin:3000}));
 s.delegation.rules.maxSpendPerActionCents=100000000;s.delegation.rules.dailyBudgetCents=100000000;
 return s;
}
const search=s=>suggestTours(s,{acceptNew:true,mode:'balanced',minNewOrderBufferMin:30});
describe('Zuverlässige Disposition',()=>{
 it('nimmt keine schon verspätet geplanten Neuaufträge an, rettet aber bestehende Zusagen',()=>{
  const s=base(),plan=buildTourPlan(s,{vehicleId:'v0',driverId:'d0',orderIds:['o0']});s.orders[0].deliveryDeadlineMin=plan.lastDeliveryEndMin-20;
  expect(search(s).suggestions).toHaveLength(0);s.orders[0].status='angenommen';
  expect(search(s).suggestions[0].orderIds).toEqual(['o0']);
 });
 it('verlangt echten Mindestpuffer und bevorzugt bei gleicher Wirtschaftlichkeit die frühere Ankunft',()=>{
  const s=base();s.drivers.push({...structuredClone(s.drivers[0]),id:'fresh'});s.drivers[0].driveMinutesSinceBreak=270;
  const sug=search(s).suggestions[0];expect(sug.driverId).toBe('fresh');
  s.orders[0].deliveryDeadlineMin=sug.plan.lastDeliveryEndMin+29;
  expect(search(s).suggestions).toHaveLength(0);
 });
 it('verdrängt eine dringende Bestandszusage nicht durch 13 lukrativere Angebote',()=>{
  const s=base();const o=s.orders[0];o.status='angenommen';o.paymentCents=100;o.deliveryDeadlineMin=1000;
  s.orders.push(...Array.from({length:13},(_,i)=>({...structuredClone(o),id:'new'+i,status:'offered',paymentCents:200000,deliveryDeadlineMin:5000})));
  expect(search(s).suggestions[0].orderIds).toContain('o0');
 });
 it('begrenzt neue Zusagen auch über mehrere Aufrufe und macht Weiterbildung wirksam',()=>{
  const s=base(7),e=s.employees[0];processDispatcher(s,e,s.gameTime,[]);
  expect(dispatcherVehicleIds(s,e.id).size).toBe(6);
  processDispatcher(s,e,s.gameTime,[]);expect(dispatcherVehicleIds(s,e.id).size).toBe(6);
  s.training.qualifications.push({personId:e.id,type:'dispo_efficiency',status:'active'});
  processDispatcher(s,e,s.gameTime,[]);expect(dispatcherVehicleIds(s,e.id).size).toBe(7);
 });
 it('respektiert die Kostenbefugnisse auch bei sofortiger Einzelfahrzeug-Disposition',()=>{
  const s=base();s.delegation.rules.maxSpendPerActionCents=1;
  planSingleVehicle(s,s.vehicles[0],s.gameTime,[]);expect(s.tours).toHaveLength(0);
 });
 it('erlaubt Leitung erst nach Senior-Qualifikation und vergibt die Wirkung nach Kursabschluss',()=>{
  const s=base(),e=s.employees[0];expect(checkCoursePrerequisites(s,e.id,'dispo_lead').ok).toBe(false);
  e.role='dispatcher_senior';bookCourse(s,e.id,'dispo_lead');
  expect(dispatcherProfile(s,e).capacity).toBe(12);expect(dispatcherProfile(s,e).bufferMin).toBe(45);
  const enrollment=s.training.enrollments.find(x=>x.courseId==='dispo_lead');
  while(s.gameTime<=enrollment.endMin) applyCommand(s,'advanceTime',{minutes:Math.min(1440,enrollment.endMin-s.gameTime+1),silentPhoneAdvance:true});
  expect(dispatcherProfile(s,e).lead).toBe(true);expect(dispatcherProfile(s,e).capacity).toBe(18);expect(dispatcherProfile(s,e).bufferMin).toBe(60);
 });
 it('zeigt nur die letzten sieben Spieltage und erfindet keine Pünktlichkeitsquote',()=>{
  const s=base(),e=s.employees[0];expect(dispatcherReport(s,e).punctuality).toBeNull();s.gameTime=20*1440;
  s.orders=[{plannedById:e.id,status:'geliefert',deliveredAtMin:19*1440,deliveryDeadlineMin:20*1440},{plannedById:e.id,status:'geliefert',deliveredAtMin:1,deliveryDeadlineMin:0}];
  expect(dispatcherReport(s,e).punctuality).toBe(100);
 });
});

it('wählt einen verfügbaren Fahrer statt eines gleichwertigen erkrankten Fahrers',()=>{
 const s=base();s.drivers.push({...structuredClone(s.drivers[0]),id:'healthy'});
 s.absences.sicknesses.push({personId:'d0',status:'active',startMin:0,expectedEndMin:10000});
 expect(search(s).suggestions[0].driverId).toBe('healthy');
});
it('normaler Disponent erhält nur zweckgebundene Tourausgaben innerhalb seiner Befugnisse',async()=>{
 const {checkSpendAuthority}=await import('@/lib/simulation/delegationEngine');const s=base(),e=s.employees[0];
 expect(checkSpendAuthority(s,e.id,100,{purpose:'tour'}).allowed).toBe(true);
 expect(checkSpendAuthority(s,e.id,100,{}).allowed).toBe(false);
 s.delegation.rules.autoDispatch=false;
 expect(checkSpendAuthority(s,e.id,100,{purpose:'tour'}).allowed).toBe(false);
});
it('Schichtverstärkung übernimmt neue Zusagen, wenn der erste Disponent ausgelastet ist',()=>{
 const s=base(7),first=s.employees[0];processDispatcher(s,first,s.gameTime,[]);
 s.employees.push({...structuredClone(first),id:'second',lastDecisionMin:null,suggestions:[]});
 const free=s.vehicles.find(v=>v.status==='free');planSingleVehicle(s,free,s.gameTime,[]);
 expect(dispatcherVehicleIds(s,'second').size).toBe(1);
});
