import {describe,it,expect,vi} from 'vitest';
import {createInitialState,applyCommand} from '@/lib/simulation/simulationEngine';
import {processEmployees,processDispatcher} from '@/lib/simulation/dispatcherProcessor';
import * as tours from '@/lib/simulation/tourEngine';
function setup(){
 const s:any=createInitialState({}).state;applyCommand(s,'advanceTime',{minutes:0});s.company.accountCents=100000000;
 applyCommand(s,'hireEmployee',{applicantId:s.availableApplicants.find(a=>a.role==='dispatcher').id});
 const e=s.employees[0];s.employees=Array.from({length:3},(_,i)=>({...structuredClone(e),id:'dispatcher'+i,workMode:'autonomous',attendance:'present'}));
 s.vehicles=[s.vehicles[0]];s.drivers=[s.drivers[0]];s.orders=[{...s.orders[0],deliveryDeadlineMin:s.gameTime+1,acceptDeadlineMin:s.gameTime+3000,latestLoadStartMin:s.gameTime+3000}];
 s.delegation.rules.maxSpendPerActionCents=100000000;s.delegation.rules.dailyBudgetCents=100000000;
 return s;
}
describe('Erfolglose Suchen innerhalb einer Dispositionsrunde',()=>{
 it('führt identische leere Suchen nur einmal aus und behält alle Zustandsänderungen',()=>{
  const s=setup(),reference=structuredClone(s),expectedLog=[],log=[];
  for(const e of reference.employees)processDispatcher(reference,e,reference.gameTime,expectedLog);
  const spy=vi.spyOn(tours,'suggestTours');
  try{processEmployees(s,s.gameTime,log);expect(spy).toHaveBeenCalledTimes(1);expect(s).toEqual(reference);expect(log).toEqual(expectedLog);}finally{spy.mockRestore();}
 });
 it('trennt unterschiedliche Qualifikationen, Puffer und Horizonte',()=>{
  const s=setup();s.employees[1].role='dispatcher_senior';const spy=vi.spyOn(tours,'suggestTours');
  try{processEmployees(s,s.gameTime,[]);expect(spy).toHaveBeenCalledTimes(2);}finally{spy.mockRestore();}
 });
 it('sucht nach neuen Angeboten in einer neuen Runde frisch und nimmt sie an',()=>{
  const s=setup();processEmployees(s,s.gameTime,[]);
  s.orders.push({...structuredClone(s.orders[0]),id:'feasible',deliveryDeadlineMin:s.gameTime+5000,paymentCents:100000});
  processEmployees(s,s.gameTime,[]);expect(s.orders[1].status).not.toBe('offered');
 });
 it('verwirft den Cache vor der Bearbeitung eines anderen Mitarbeitermodus',()=>{
  const s=setup();s.employees[1].workMode='suggestions';const spy=vi.spyOn(tours,'suggestTours');
  try{processEmployees(s,s.gameTime,[]);expect(spy).toHaveBeenCalledTimes(2);}finally{spy.mockRestore();}
 });
 it('verwirft leere Ergebnisse, sobald ein Spezialist eine Tour finden und bestätigen kann',()=>{
  const s=setup(),v=s.vehicles[0],d=s.drivers[0];
  v.dgEquipment={type:'versandstueck',validUntilMin:100000};
  s.training.qualifications.push({personId:d.id,type:'adr_basic',status:'active',validUntilMin:100000},{personId:s.employees[1].id,type:'dispo_dg',status:'active',validUntilMin:100000});
  s.orders.push({...structuredClone(s.orders[0]),id:'dg',fromCity:'Hamburg',toCity:'Bremen',tons:8,isDangerousGoods:true,dgProfileId:'dg_paint_north',requiredBodyType:null,paymentCents:1000000,deliveryDeadlineMin:5000});
  const spy=vi.spyOn(tours,'suggestTours');
  try{processEmployees(s,s.gameTime,[]);expect(s.orders[1].status).not.toBe('offered');expect(spy).toHaveBeenCalledTimes(3);}finally{spy.mockRestore();}
 });
});
