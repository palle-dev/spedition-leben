import {describe,it,expect} from 'vitest';
import {createInitialState,applyCommand} from '@/lib/simulation/simulationEngine';
import {suggestTours,buildTourPlan,_clearPlanCache} from '@/lib/simulation/tourEngine';
import {CITY_LATLON,getDistance} from '@/lib/simulation/gameRules';

function setup() {
 const s:any=createInitialState({}).state; applyCommand(s,'advanceTime',{minutes:0});
 s.company.accountCents=10000000;s.orders=[s.orders[0]];s.vehicles=[s.vehicles[0]];
 s.orders[0].deliveryDeadlineMin=5000;
 s.drivers=Array.from({length:4},(_,i)=>({...structuredClone(s.drivers[0]),id:'candidate_'+i}));
 return s;
}
function search(s) {return suggestTours(s,{vehicleIds:[s.vehicles[0].id],earliestStart:s.gameTime,horizonMin:6000,acceptNew:true,mode:'balanced'}).suggestions;}

describe('Ergebnisgleiche Großflotten-Planung',()=>{
 it('behält bei gleichwertigen Fahrern die ursprüngliche Reihenfolge und unabhängige Pläne',()=>{
  const s=setup();const first=search(s)[0];expect(first.driverId).toBe('candidate_0');
  const again=search(s)[0];expect(again.plan).toEqual(first.plan);
  first.plan.deployments[0].phases[0].endMin=-1;
  expect(again.plan.deployments[0].phases[0].endMin).not.toBe(-1);
  expect(s._driverMap).toBeNull();expect(s._vehicleMap).toBeNull();expect(s._orderMap).toBeNull();
 });
 it('unterscheidet befristete Fahrer trotz identischer Arbeitszeiten',()=>{
  const s=setup();s.drivers[0].isTempStaff=true;s.drivers[0].tempReturnMin=s.gameTime+10;
  expect(search(s)[0].driverId).toBe('candidate_1');
 });
 it('unterscheidet Fahrer mit zukünftiger Reservierung',()=>{
  const s=setup();s.tours=[{id:'reservation',status:'planned',vehicleId:'other',driverId:'candidate_0',deployments:[{status:'planned',startMin:s.gameTime+30}]}];
  expect(search(s)[0].driverId).toBe('candidate_1');
 });
 it('unterscheidet Lenkzeit, Ruhe und Verfügbarkeit und erneuert Zähler nach einer Suche',()=>{
  const s=setup();s.orders[0].status='angenommen';s.orders[0].deliveryDeadlineMin=481;s.drivers[0].driveMinutesSinceBreak=270;
  const result=search(s)[0];expect(result.driverId).toBe('candidate_1');
  s.drivers[1].status='resting';s.drivers[1].restUntil=s.gameTime+2000;
  expect(search(s)[0].driverId).toBe('candidate_2');
  s.drivers[0].driveMinutesSinceBreak=0;
  expect(search(s)[0].driverId).toBe('candidate_0');
  _clearPlanCache();const plan=buildTourPlan(s,{vehicleId:s.vehicles[0].id,driverId:'candidate_0',orderIds:[s.orders[0].id]});
  expect(plan.ok).toBe(true);
 });
 it('behält für alle Stadtpaare die bisherige Entfernungsformel exakt bei',()=>{
  for(const [a,[x1,y1]] of Object.entries(CITY_LATLON))for(const [b,[x2,y2]] of Object.entries(CITY_LATLON)){
   const lat=(y2-y1)*Math.PI/180,lng=(x2-x1)*Math.PI/180;
   const h=Math.sin(lat/2)**2+Math.cos(y1*Math.PI/180)*Math.cos(y2*Math.PI/180)*Math.sin(lng/2)**2;
   const expected=Math.round(2*6371*Math.asin(Math.min(1,Math.sqrt(h)))*1.2/5)*5;
   expect(getDistance(a,b)).toBe(expected);
  }
  expect(getDistance('unbekannt','Hamburg')).toBe(0);
 });
});
