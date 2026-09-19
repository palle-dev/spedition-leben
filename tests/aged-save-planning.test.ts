import {describe,it,expect} from 'vitest';
import {createInitialState,applyCommand} from '@/lib/simulation/simulationEngine';
import {withTourValidation,validateTourConfirmation} from '@/lib/simulation/tourEngine';
import {withSimulationOrders,currentOrders,findOrder,withDispatchLookup,planningOrdersFor} from '@/lib/simulation/orderLookup';
import {getPhoneProposals} from '@/lib/simulation/phoneProposals';
import {dispatcherVehicleIds} from '@/lib/simulation/dispatcherQuality';
function fixture(){
 const s=createInitialState({}).state;applyCommand(s,'advanceTime',{minutes:0});s.company.accountCents=10000000;
 const o=s.orders[0],v=s.vehicles[0],d=s.drivers[0];
 Object.assign(o,{status:'angenommen',fromCity:v.locationCity,toCity:v.locationCity,tons:1,isDangerousGoods:false,deliveryDeadlineMin:s.gameTime+2880,latestLoadStartMin:s.gameTime+1440});
 Object.assign(d,{locationCity:v.locationCity,status:'free',restUntil:null});Object.assign(v,{status:'free',condition:100});
 return {s,o,v,d,p:{vehicleId:v.id,driverId:d.id,orderIds:[o.id]}};
}
describe('Planungsprüfung mit alten Spielständen',()=>{
 it('verwirft verpasste harte Ladefenster, lässt die exakte Grenze aber zu',()=>{
  const {s,o,p}=fixture();o.windowVersion=2;o.earliestPickupMin=s.gameTime;o.latestLoadStartMin=s.gameTime;
  expect(validateTourConfirmation(s,p)).toBeTruthy();
  expect(getPhoneProposals(s,{type:'delivery_risk',orderId:o.id},1)).toHaveLength(1);
  o.latestLoadStartMin=s.gameTime-1;
  expect(()=>validateTourConfirmation(s,p)).toThrow(/Ladefenster/);
  expect(getPhoneProposals(s,{type:'delivery_risk',orderId:o.id},1)).toEqual([]);
 });
 it('liefert in einer Lesesuche dieselben Pläne und prüft bei Bestätigung erneut',()=>{
  const {s,p,d}=fixture(),before=JSON.stringify(s),expected=validateTourConfirmation(s,p);
  withTourValidation(s,validate=>{expect(validate(p)).toEqual(expected);expect(validate({...p,driverId:'missing'})).toBeNull();expect(validate(p)).toEqual(expected);});
  expect(JSON.stringify(s)).toBe(before);
  d.locationCity='Berlin';expect(()=>validateTourConfirmation(s,p)).toThrow(/verschiedenen Orten/);
 });
 it('trennt verschachtelte Suchen und räumt bei Fehlern auf',()=>{
  const {s,p}=fixture(),other=fixture();other.d.locationCity='Berlin';
  withTourValidation(s,validate=>{
   expect(validate(p)).toBeTruthy();
   expect(()=>withTourValidation(other.s,v=>{expect(v(other.p)).toBeNull();throw Error('abort')})).toThrow('abort');
   expect(validate(p)).toEqual(validateTourConfirmation(s,p));
  });
  s.drivers[0]={...s.drivers[0],locationCity:'Berlin'};
  expect(withTourValidation(s,v=>v(p))).toBeNull();
 });
 it('beobachtet neue Aufträge, Statusänderungen und Mitternachtsbereinigung ohne Historienverlust',()=>{
  const old={id:'old',status:'geliefert'},active={id:'a',status:'unterwegs'};
  const s:any={orders:[old,active]};
  withSimulationOrders(s,()=>{
   expect(currentOrders(s)).toEqual([active]);expect(findOrder(s,'old')).toBe(old);
   active.status='angenommen';expect(currentOrders(s)[0].status).toBe('angenommen');
   const next={id:'b',status:'offered'};s.orders.push(next);
   expect(currentOrders(s)).toEqual([active,next]);expect(findOrder(s,'b')).toBe(next);
   s.orders=s.orders.filter(o=>o!==active);
   expect(currentOrders(s)).toEqual([next]);expect(findOrder(s,'a')).toBeUndefined();
  });
  expect(currentOrders(s)).toBe(s.orders);expect(s.orders).toContain(old);
 });
 it('sieht Mitarbeiterzuordnung und Bestätigung innerhalb derselben Dispositionsrunde',()=>{
  const o={id:'a',status:'offered',plannedById:'e1'},s:any={orders:[{id:'old',status:'geliefert'},o],tours:[{status:'active',vehicleId:'v',deployments:[{orderId:'a'}]}]};
  withSimulationOrders(s,()=>withDispatchLookup(s,()=>{
   expect(planningOrdersFor(s)).toEqual([o]);expect([...dispatcherVehicleIds(s,'e1')]).toEqual(['v']);
   o.status='angenommen';o.plannedById='e2';expect([...dispatcherVehicleIds(s,'e1')]).toEqual([]);expect([...dispatcherVehicleIds(s,'e2')]).toEqual(['v']);
  }));
 });
 it('räumt den Vorlaufindex auch bei Abbruch auf und lädt ersetzte Objekte frisch',()=>{
  const s:any={orders:[{id:'a',status:'offered'}]};
  expect(()=>withSimulationOrders(s,()=>{currentOrders(s);throw Error('abort')})).toThrow('abort');
  s.orders[0]={id:'a',status:'angenommen'};expect(findOrder(s,'a')).toBe(s.orders[0]);
 });
});
