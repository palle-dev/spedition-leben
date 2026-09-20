import {describe,it,expect} from 'vitest';
import {hasPendingTour,pendingTourResources,pendingTourChecker} from '@/lib/simulation/tourEngine';
const tour=(id,status,deployments,returnDeployment=null)=>({id,vehicleId:'v'+id,driverId:'d'+id,status,deployments,returnDeployment});
describe('Fresh reservation sets for idle reporting',()=>{
 it('matches individual checks for all tour and deployment statuses',()=>{
  const tours=[];let i=0;
  for(const status of ['active','planned','completed','cancelled','paused'])for(const ds of ['planned','active','completed','skipped','cancelled'])tours.push(tour(i++,status,[{status:ds}]));
  const s={tours},reserved=pendingTourResources(s);
  for(const t of tours)for(const id of [t.vehicleId,t.driverId])expect(reserved.has(id)).toBe(hasPendingTour(s,id));
  expect(reserved.has('missing')).toBe(false);
 });
 it('includes promised return deployments but excludes only running/completed ones',()=>{
  const s={tours:[tour(1,'active',[{status:'completed'}],{status:'planned'}),tour(2,'active',[{status:'active'}])]},set=pendingTourResources(s);
  expect([...set]).toEqual(['v1','d1']);
 });
 it('rebuilds after new confirmations, cancellation and final deployment completion',()=>{
  const s={tours:[tour(1,'planned',[{status:'planned'}])]};
  expect(pendingTourResources(s).has('v1')).toBe(true);
  s.tours[0].status='cancelled';s.tours.push(tour(2,'active',[{status:'planned'}]));
  expect([...pendingTourResources(s)]).toEqual(['v2','d2']);
  s.tours[1].deployments[0].status='completed';expect(pendingTourResources(s).size).toBe(0);
 });
 it('does not change or attach data to the saved state',()=>{
  const s={tours:[tour(1,'active',[{status:'planned'}])]},before=structuredClone(s);
  const set=pendingTourResources(s);set.clear();expect(s).toEqual(before);expect(pendingTourResources(s).size).toBe(2);
 });
});

it('uses a fresh reservation check for each separate resource search',()=>{
 const s={tours:[tour(1,'planned',[{status:'planned'}])]};
 const first=pendingTourChecker(s);expect(first('v1')).toBe(true);expect(first('d1')).toBe(true);
 s.tours[0].status='cancelled';const next=pendingTourChecker(s);expect(next('v1')).toBe(false);
 expect(next('d1')).toBe(false);
});
