import {describe,it,expect} from 'vitest';
import {computePlanableFleetN} from '@/lib/simulation/marketEngine';
import {earliestAvailable} from '@/lib/simulation/tourEngine';
// Independent original greedy matching: preserve resource order and horizon.
function original(s){
 const used=new Set();let n=0;
 const vs=s.vehicles.filter(v=>v.status!=='archived'&&v.condition>=20).sort((a,b)=>(a.status==='free'?0:1)-(b.status==='free'?0:1));
 for(const v of vs){let best=null,at=Infinity;
  for(const d of s.drivers){if(d.employmentStatus!=='employed'||d.attendance==='released'||used.has(d.id)||d.locationCity!==v.locationCity)continue;
   const t=earliestAvailable(s,v,d);if(t<=s.gameTime+4320&&t<at){best=d;at=t;}}
  if(best){used.add(best.id);n++;}
 }return n;
}
function fixture(seed){
 let rng=seed;const next=n=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng%n;};
 const cities=['Hamburg','Kiel','Berlin',undefined,NaN];
 const s={gameTime:20000,vehicles:[],drivers:[],trips:[]};
 for(let i=0;i<30;i++){const status=['free','on_trip','maintenance','archived'][next(4)];s.vehicles.push({id:'v'+i,status,condition:next(100),locationCity:cities[next(5)],tripId:'vt'+i,maintenanceUntil:s.gameTime+next(7000)});s.trips.push({id:'vt'+i,driverId:'other'+i,status:'in_progress',endMin:s.gameTime+next(7000)});}
 for(let i=0;i<45;i++){const id='d'+i;s.drivers.push({id,status:['free','on_trip','resting'][next(3)],employmentStatus:next(5)?'employed':'left',attendance:next(5)?'present':'released',locationCity:cities[next(5)],restUntil:s.gameTime+next(7000)});s.trips.push({id:'dt'+i,driverId:id,status:'in_progress',endMin:s.gameTime+next(7000)});}
 return s;
}
describe('Scoped market fleet availability',()=>{
 it('matches original greedy pairing across mixed states without mutations',()=>{
  for(let seed=1;seed<=100;seed++){const s=fixture(seed),before=structuredClone(s);expect(computePlanableFleetN(s)).toBe(original(s));expect(s).toEqual(before);}
 });
 it('refreshes after trips, rest, maintenance and location changes',()=>{
  const s=fixture(71);computePlanableFleetN(s);
  for(const t of s.trips)t.endMin+=10000;
  for(const d of s.drivers){d.locationCity='Hamburg';d.restUntil=s.gameTime+4321;}
  for(const v of s.vehicles){v.locationCity='Hamburg';v.maintenanceUntil=s.gameTime+4321;}
  expect(computePlanableFleetN(s)).toBe(original(s));s.gameTime+=10000;expect(computePlanableFleetN(s)).toBe(original(s));
 });
 it('keeps horizon inclusivity and empty/missing-location behavior',()=>{
  const s={gameTime:0,trips:[],vehicles:[{id:'v',status:'maintenance',condition:20,maintenanceUntil:4320}],drivers:[{id:'d',employmentStatus:'employed',status:'resting',restUntil:4320}]};
  expect(computePlanableFleetN(s)).toBe(1);s.drivers[0].restUntil=4321;expect(computePlanableFleetN(s)).toBe(0);s.vehicles=[];expect(computePlanableFleetN(s)).toBe(0);
 });
});
