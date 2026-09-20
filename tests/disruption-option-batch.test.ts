import {withSimulationOrders} from "@/lib/simulation/orderLookup";
import {describe,it,expect} from 'vitest';
import {createInitialState,applyCommand} from '@/lib/simulation/simulationEngine';
import {getDisruptionDetail,getValidatedDisruptionOptions,validateDisruptionResolution} from '@/lib/simulation/disruptionEngine';
function setup(type){
 const s=createInitialState({}).state;applyCommand(s,'advanceTime',{minutes:0});s.company.accountCents=10000000;
 const v=s.vehicles[0],driver=s.drivers[0],o=s.orders[0];
 const tour={id:'batch-tour',vehicleId:v.id,driverId:driver.id,status:'active',startCity:v.locationCity,deployments:[{orderId:o.id,status:'planned'}]};
 s.tours.push(tour);
 const d={id:'batch-disruption',type,status:'decision_open',vehicleId:v.id,driverId:driver.id,tourId:tour.id,orderIds:[o.id],createdAtMin:s.gameTime,delayMin:30,history:[],options:[]};
 s.disruptions.items.push(d);d.options=getDisruptionDetail(s,d.id).options;return {s,d};
}
function previous(s,id){const detail=getDisruptionDetail(s,id);if(detail?.status!=='decision_open')return [];
 return detail.options.filter(o=>{if(!o.available||o.id==='inform_customer'||(o.costCents||0)>s.company.accountCents)return false;try{validateDisruptionResolution(s,id,o.id,{});return true;}catch{return false;}});
}
describe('Read-only disruption option batching',()=>{
 it.each(['technical_defect','loading_delay','personnel_absence'])('matches previous options and leaves state intact: %s',type=>{
  const {s,d}=setup(type);
  for(const cash of [0,10000000])for(const missingTour of [false,true]){
   s.company.accountCents=cash;d.tourId=missingTour?'missing':'batch-tour';
   const before=JSON.stringify(s);expect(getValidatedDisruptionOptions(s,d.id)).toEqual(previous(s,d.id));expect(JSON.stringify(s)).toBe(before);
  }
 });
 it('retains rejection of unavailable previously recorded options',()=>{
  const {s,d}=setup('technical_defect');d.options.forEach(o=>o.available=false);
  expect(getValidatedDisruptionOptions(s,d.id)).toEqual([]);
 });
 it('does not reuse prepared options for execution after cash/resource changes',()=>{
  const {s,d}=setup('technical_defect');const opt=getValidatedDisruptionOptions(s,d.id).find(o=>o.id==='emergency_repair');expect(opt).toBeTruthy();
  s.company.accountCents=0;expect(()=>validateDisruptionResolution(s,d.id,opt.id,{})).toThrow();
  s.company.accountCents=10000000;s.vehicles=s.vehicles.filter(v=>v.id!==d.vehicleId);
  expect(()=>validateDisruptionResolution(s,d.id,opt.id,{})).toThrow();
 });
 it('refreshes the next query and rejects expired quotes',()=>{
  const {s,d}=setup('loading_delay');const opt=getValidatedDisruptionOptions(s,d.id)[0];d.delayMin+=60;
  expect(getValidatedDisruptionOptions(s,d.id)).toEqual(previous(s,d.id));
  expect(()=>validateDisruptionResolution(s,d.id,opt.id,{phoneQuote:{cost:opt.costCents,duration:opt.estimatedDurationMin,description:opt.description}})).toThrow(/geändert/);
 });
 it('returns no options for missing or resolved disruptions',()=>{
  const {s,d}=setup('loading_delay');d.status='completed';expect(getValidatedDisruptionOptions(s,d.id)).toEqual([]);expect(getValidatedDisruptionOptions(s,'missing')).toEqual([]);
 });
});

describe('Disruption proposals using the advance order index',()=>{
 it.each(['technical_defect','loading_delay','personnel_absence'])('matches direct search before and after order changes: %s',type=>{
  const {s,d}=setup(type);
  const direct=()=>getDisruptionDetail(s,d.id);
  const compare=()=>{const expected=direct();expect(withSimulationOrders(s,direct)).toEqual(expected);};
  compare();
  const old=s.orders[0],newOrder={...old,id:'appended-order',tons:2};
  withSimulationOrders(s,()=>{
   direct();s.orders.push(newOrder);s.tours[0].deployments[0].orderId=newOrder.id;d.orderIds=[newOrder.id];
   const indexed=direct();const independent=structuredClone(s);expect(indexed).toEqual(getDisruptionDetail(independent,d.id));
   newOrder.tons=22;expect(direct()).toEqual(getDisruptionDetail(structuredClone(s),d.id));
   s.orders=s.orders.filter(o=>o.id!==newOrder.id);expect(direct()).toEqual(getDisruptionDetail(structuredClone(s),d.id));
  });
  compare();
 });
});
