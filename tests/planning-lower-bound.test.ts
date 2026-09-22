import {describe,it,expect,vi} from 'vitest';
import {createInitialState,applyCommand} from '@/lib/simulation/simulationEngine';
import {optimisticDeliveryEnd} from '@/lib/simulation/planningLowerBound';
import {buildDeployment,buildTourPlan,_clearPlanCache} from '@/lib/simulation/tourEngine';
import {DACH_RULE_VERSION} from '@/lib/simulation/dachRules';
import * as driverTime from '@/lib/simulation/driverTimeEngine';
function fixture(){
 const s:any=createInitialState({}).state;applyCommand(s,'advanceTime',{minutes:0});applyCommand(s,'activateDach',{});
 const v=s.vehicles[0],d=s.drivers[0],o=s.orders[0];
 Object.assign(o,{fromCity:'Hamburg',toCity:'Bremen',isDangerousGoods:false,tons:1,requiredBodyType:null,transportRulesVersion:DACH_RULE_VERSION,earliestPickupMin:s.gameTime,latestLoadStartMin:s.gameTime+20000,deliveryDeadlineMin:s.gameTime+600,acceptDeadlineMin:s.gameTime+20000});
 return {s,v,d,o};
}
describe('Sichere Frühausschlüsse ohne vollständige Phasenplanung',()=>{
 it('baut für eine vor Wochenwechsel unmögliche Tour keine Phasen',()=>{
  const {s,v,d,o}=fixture();d.regulation={weekIndex:0,thisWeek:3360,previousWeek:0,weeklyRestEndMin:0};
  const spy=vi.spyOn(driverTime,'buildPhases');
  try{_clearPlanCache();expect(buildTourPlan(s,{vehicleId:v.id,driverId:d.id,orderIds:[o.id]}).ok).toBe(false);expect(spy).not.toHaveBeenCalled();}finally{spy.mockRestore();}
 });
 it('lässt dieselbe Tour bei genügend Frist über den Wochenwechsel zu',()=>{
  const {s,v,d,o}=fixture();d.regulation={weekIndex:0,thisWeek:3360,previousWeek:0,weeklyRestEndMin:0};o.deliveryDeadlineMin=20000;
  _clearPlanCache();const result=buildTourPlan(s,{vehicleId:v.id,driverId:d.id,orderIds:[o.id]});expect(result.ok).toBe(true);
 });
 it('überschätzt auch nahe Wochenwechsel, Ruhe- und Fahrverbotsgrenzen nie den vollständigen Plan',()=>{
  const {s,v,o}=fixture();
  for(const [from,to,startCity] of [['Hamburg','Bremen','Hamburg'],['München','Zürich','Hamburg'],['Wien','Linz','Wien'],['Hamburg','Hamburg','Hamburg']]){
   Object.assign(o,{fromCity:from,toCity:to});
   for(const t of [480,8600,10020,10070,10080])for(const pickup of [t,t+1440])for(const weekly of [0,3360]){
    o.earliestPickupMin=pickup;
    const c={workMin:470,driveMin:260,regulation:{weekIndex:0,thisWeek:weekly,previousWeek:2500,weeklyRestEndMin:0}};
    const before=JSON.stringify(c),bound=optimisticDeliveryEnd(s,o,startCity,t,c);
    const full=buildDeployment(s,o,v,startCity,t,c);
    expect(bound.delivery).toBeLessThanOrEqual(full.endMin);expect(JSON.stringify(c)).toBe(before);
   }
  }
 });
 it('überträgt Wochenlimits nicht auf geschützte alte Inlandsaufträge',()=>{
  const {s,o}=fixture();delete o.transportRulesVersion;
  const bound=optimisticDeliveryEnd(s,o,'Hamburg',480,{regulation:{weekIndex:0,thisWeek:3360,previousWeek:0,weeklyRestEndMin:0}});
  expect(bound.delivery).toBeLessThan(1440);
 });
 it('erhält die exakte Lieferfrist plus bestehende Kulanzgrenze',()=>{
  const {s,v,d,o}=fixture();delete o.transportRulesVersion;o.earliestPickupMin=s.gameTime;
  const c={workMin:0,driveMin:0},end=buildDeployment(s,o,v,'Hamburg',s.gameTime,c).endMin;
  o.deliveryDeadlineMin=end-240;_clearPlanCache();expect(buildTourPlan(s,{vehicleId:v.id,driverId:d.id,orderIds:[o.id]}).ok).toBe(true);
  o.deliveryDeadlineMin--;_clearPlanCache();expect(buildTourPlan(s,{vehicleId:v.id,driverId:d.id,orderIds:[o.id]}).ok).toBe(false);
 });
 it('setzt für alternative E-Laderouten keine direkte Straßenlänge als Mindestdauer voraus',()=>{
  const {s,o}=fixture();const c={workMin:0,driveMin:0};
  const ev=optimisticDeliveryEnd(s,o,'Hamburg',480,c,true),diesel=optimisticDeliveryEnd(s,o,'Hamburg',480,c);
  expect(ev.delivery).toBe(600);expect(ev.delivery).toBeLessThan(diesel.delivery);
 });
});
