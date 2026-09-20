import {describe,it,expect,vi} from 'vitest';
import {createAvailabilityReader,earliestAvailable} from '@/lib/simulation/tourEngine';
describe('Read-only availability batch',()=>{
 it('matches individual lookups including first matches, maintenance and rest',()=>{
  const state={gameTime:500,trips:[{id:'t',driverId:'d',status:'completed',endMin:700},{id:'t',driverId:'d',status:'in_progress',endMin:900},{id:'later',driverId:'d',status:'in_progress',endMin:1200}]};
  const copy=structuredClone(state),read=createAvailabilityReader(state);
  for(const vehicle of [{status:'free'},{status:'on_trip',tripId:'t'},{status:'on_trip',tripId:'missing'},{status:'maintenance',maintenanceUntil:800}])
   for(const driver of [{status:'free'},{status:'on_trip',id:'d'},{status:'on_trip',id:'missing'},{status:'resting',restUntil:1500}])expect(read(vehicle,driver)).toBe(earliestAvailable(state,vehicle,driver));
  expect(state).toEqual(copy);
 });
 it('scans trips only once for a batch and skips them for free resources',()=>{
  const state={gameTime:0,trips:[{id:'t',driverId:'d',status:'in_progress',endMin:99}]};
  const iterator=vi.spyOn(state.trips,Symbol.iterator),read=createAvailabilityReader(state);
  expect(read({status:'free'},{status:'free'})).toBe(0);expect(iterator).not.toHaveBeenCalled();
  for(let i=0;i<100;i++)expect(read({status:'on_trip',tripId:'t'},{status:'on_trip',id:'d'})).toBe(99);
  expect(iterator).toHaveBeenCalledTimes(1);iterator.mockRestore();
 });
 it('rebuilds from changed trips for the next calculation',()=>{
  const state={gameTime:0,trips:[{id:'t',driverId:'d',status:'in_progress',endMin:99}]};const vehicle={status:'on_trip',tripId:'t'},driver={status:'on_trip',id:'d'};
  expect(createAvailabilityReader(state)(vehicle,driver)).toBe(99);
  state.trips=[{id:'t',driverId:'d',status:'in_progress',endMin:200}];expect(createAvailabilityReader(state)(vehicle,driver)).toBe(200);
  state.trips=[];expect(createAvailabilityReader(state)(vehicle,driver)).toBe(0);
 });
});
