import { expect, it } from 'vitest';
import { processTours, onTripCompleted } from '@/lib/simulation/tourEngine';
import { cleanupHistory } from '@/lib/simulation/historyCleanup';
import { compactHistory, readArchiveRecords } from '@/lib/historyArchive';
function fixture() {
 const tour:any={id:'tour',status:'active',vehicleId:'v',driverId:'d',createdAt:0,deployments:[{id:'dep',orderId:'o',status:'skipped',endMin:10}],returnDeployment:null};
 const state:any={gameTime:100001,tours:[tour],trips:[],orders:[{id:'o',status:'failed'}],vehicles:[],drivers:[],company:{accountCents:100},bookings:[],events:[]};
 return {state,tour};
}
it('repairs a terminal old tour once and preserves its original before eventual archival',async()=>{
 const {state,tour}=fixture(),old=structuredClone(tour),log=[];
 processTours(state,state.gameTime,log);processTours(state,state.gameTime+1,log);
 expect(tour.status).toBe('completed');expect(tour.completedAtMin).toBe(state.gameTime);
 expect(log.filter(e=>e.type==='tour_completed')).toHaveLength(1);
 expect(state.historyOutbox[0].data).toEqual(old);
 expect(state.company.accountCents).toBe(100);expect(state.bookings).toEqual([]);
 state.gameTime+=8*1440;cleanupHistory(state,state.gameTime);
 expect(state.tours).toEqual([]);
 const c=await compactHistory(state),rows=[];
 for(const block of c.historyArchive.chunks)rows.push(...await readArchiveRecords(block,block.data));
 expect(rows.some(r=>r.kind==='tourLifecycleVersions'&&r.data.status==='active')).toBe(true);
 expect(rows.some(r=>r.kind==='tours'&&r.data.status==='completed')).toBe(true);
});
it.each(['plannedReturn','activeReturn','linkedTrip','deploymentTrip','disruption','empty'])('does not prematurely finish %s',mode=>{
 const {state,tour}=fixture();
 if(mode==='plannedReturn')tour.returnDeployment={status:'planned',startMin:200000};
 if(mode==='activeReturn')tour.returnDeployment={status:'active'};
 if(mode==='linkedTrip')state.trips=[{id:'t',tourId:'tour',status:'in_progress'}];
 if(mode==='deploymentTrip'){state.trips=[{id:'t',status:'in_progress'}];tour.deployments[0].tripId='t';}
 if(mode==='disruption')tour.disruptionId='incident';
 if(mode==='empty')tour.deployments=[];
 processTours(state,state.gameTime,[]);
 expect(tour.status).toBe('active');
});
it('finishes immediately when the last invalid order is skipped, without creating delivery or payment',()=>{
 const {state,tour}=fixture();
 tour.deployments[0]={...tour.deployments[0],status:'planned',startMin:state.gameTime};
 state.training={enrollments:[],apprenticeships:[]};
 state.vehicles=[{id:'v',status:'free',locationCity:'Hamburg'}];
 state.drivers=[{id:'d',status:'free',employmentStatus:'employed',locationCity:'Hamburg'}];
 const original=structuredClone(state.orders);
 processTours(state,state.gameTime,[]);
 expect(tour.status).toBe('completed');expect(state.orders).toEqual(original);
 expect(state.trips).toEqual([]);expect(state.bookings).toEqual([]);
});
it('finishes after the real last trip once and never revives a cancelled tour',()=>{
 for(const status of ['active','cancelled']){
  const {state,tour}=fixture();tour.status=status;
  tour.deployments[0]={status:'active',tripId:'t'};
  const trip={id:'t',tourId:'tour',status:'completed'};state.trips=[trip];const log=[];
  onTripCompleted(state,trip,100,log);onTripCompleted(state,trip,101,log);
  expect(tour.status).toBe(status==='active'?'completed':'cancelled');
  expect(tour.deployments[0].actualEndMin).toBe(100);
  expect(log).toHaveLength(status==='active'?1:0);
 }
});
it('does not cancel a paused chain while its trip is still running',()=>{
 const {state,tour}=fixture();tour.pauseReason='wait';
 tour.deployments[0]={status:'active',tripId:'t'};
 state.trips=[{id:'t',tourId:'tour',status:'in_progress'}];
 processTours(state,state.gameTime,[]);
 expect(tour.status).toBe('active');expect(tour.deployments[0].status).toBe('active');
});
