import { describe, it, expect } from 'vitest';
import * as ce from '@/lib/simulation/simulationEngine';
import * as se from '../base44/shared/simulationEngine';
import * as cp from '@/lib/simulation/partnerEngine';
import * as sp from '../base44/shared/partnerEngine';
import * as cd from '@/lib/simulation/delegationEngine';
import * as sd from '../base44/shared/delegationEngine';
import * as ct from '@/lib/simulation/tourEngine';
import * as st from '../base44/shared/tourEngine';
import { executeCommand } from '@/lib/simulationAdapter';

describe.each([['client', ce, cp, cd, ct], ['server', se, sp, sd, st]])('%s approval execution', (_, engine, partner, delegation, tours) => {
 function base() {
  tours._clearPlanCache();
  const s = engine.createInitialState({ companyName:'Test', playerName:'Test', partnerName:'Test' }).state;
  engine.applyCommand(s, 'advanceTime', {minutes:0});
  s.employees.push({ id:'boss', name:'Test', role:'branch_manager', employmentStatus:'employed', branchId:'b1', assignedBranchId:'b1', locationCity:'Hamburg' });
  s.delegation.rules.maxSpendPerActionCents = 1;
  s.orders = [{...s.orders[0], id:'test-order', customer:'Testkunde', status:'angenommen', fromCity:'Hamburg', toCity:'Kiel',
   tons:1, paymentCents:100000, isDangerousGoods:false, earliestPickupMin:s.gameTime, latestLoadStartMin:s.gameTime+1440,
   deliveryDeadlineMin:s.gameTime+2400, history:[]}];
  return s;
 }
 function partnerRequest(s) {
  const offer = partner.requestPartnerOffers(s,'test-order').offers[0];
  expect(offer).toBeDefined();
  const r = engine.applyCommand(s,'bookPartnerTransport',{orderId:'test-order',partnerId:offer.partnerId,employeeId:'boss'}).result;
  expect(r).toMatchObject({ok:false,requiresApproval:true});
  return {req:s.approvals.pending[0],offer};
 }
 it('retains a partner request without booking or charging prematurely', () => {
  const s=base(), balance=s.company.accountCents;
  const {req}=partnerRequest(s);
  expect(req.actionData.type).toBe('partner_booking');
  expect(s.partners.transports).toHaveLength(0);
  expect(s.company.accountCents).toBe(balance);
 });
 it('books an approved partner exactly once and records the delegation budget', () => {
  const s=base(); const {req}=partnerRequest(s); const balance=s.company.accountCents;
  const r=engine.applyCommand(s,'approveApproval',{requestId:req.id}).result;
  expect(r.ok).toBe(true);
  expect(s.partners.transports).toHaveLength(1);
  expect(s.partners.transports[0].employeeId).toBe('boss');
  expect(s.company.accountCents).toBe(balance-req.costCents);
  expect(s.delegation.dailySpend.companyCents).toBe(req.costCents);
  expect(()=>engine.applyCommand(s,'approveApproval',{requestId:req.id})).toThrow();
  expect(s.partners.transports).toHaveLength(1);
 });
 it('retains an expansion request and starts the approved construction once', () => {
  const s=base(), balance=s.company.accountCents;
  const r=engine.applyCommand(s,'startSiteExpansion',{branchId:'b1',type:'parking',slots:1,employeeId:'boss'}).result;
  expect(r).toMatchObject({ok:false,requiresApproval:true});
  const req=s.approvals.pending[0];
  expect(s.siteExpansion.projects).toHaveLength(0);
  expect(s.company.accountCents).toBe(balance);
  const result=engine.applyCommand(s,'approveApproval',{requestId:req.id}).result;
  expect(result.ok).toBe(true);
  expect(s.siteExpansion.projects).toHaveLength(1);
  expect(s.company.accountCents).toBe(balance-req.costCents);
  expect(s.delegation.dailySpend.companyCents).toBe(req.costCents);
 });
 it('executes a legacy tour request with its saved order sequence', () => {
  const s=base();
  const data={vehicleId:'v1',driverId:'d1',orderIds:['test-order']};
  const plan=tours.buildTourPlan(s,data);
  expect(plan.ok).toBe(true);
  const cost=plan.totalVariableCostCents;
  const {request:req}=delegation.createApprovalRequest(s,{type:'spend',employeeId:'boss',costCents:cost,actionData:data});
  const r=engine.applyCommand(s,'approveApproval',{requestId:req.id}).result;
  expect(r.ok).toBe(true);
  expect(s.tours).toHaveLength(1);
  expect(s.tours[0].deployments.map(d => d.orderId)).toContain('test-order');
  expect(s.trips.some(t => t.orderId === 'test-order' && t.status === 'in_progress')).toBe(true);
  expect(s.delegation.dailySpend.companyCents).toBe(cost);
 });
 it('does not reuse an expired partner offer', () => {
  const s=base(); const {req,offer}=partnerRequest(s);
  offer.validUntilMin=s.gameTime-1;
  const balance=s.company.accountCents;
  const r=engine.applyCommand(s,'approveApproval',{requestId:req.id}).result;
  expect(r).toMatchObject({ok:false,superseded:true});
  expect(s.partners.transports).toHaveLength(0);
  expect(s.company.accountCents).toBe(balance);
 });
 it('does not book a transport with a start time in the past', () => {
  const s=base(); const {req,offer}=partnerRequest(s);
  s.gameTime=offer.earliestStartMin+1;
  const balance=s.company.accountCents;
  const r=engine.applyCommand(s,'approveApproval',{requestId:req.id}).result;
  expect(r).toMatchObject({ok:false,superseded:true});
  expect(s.company.accountCents).toBe(balance);
  expect(s.partners.transports).toHaveLength(0);
 });
 it('does not silently approve a higher partner price', () => {
  const s=base(); const {req,offer}=partnerRequest(s);
  offer.priceCents+=10000;
  expect(()=>engine.applyCommand(s,'approveApproval',{requestId:req.id})).toThrow(/Kosten/);
  expect(s.partners.transports).toHaveLength(0);
  expect(s.approvals.pending[0].status).toBe('pending');
 });
 it('rechecks own-fulfillment requirements at booking time', () => {
  const s=base(); const {req}=partnerRequest(s);
  s.contracts.contracts.push({id:'own-only',status:'active',customerName:'Testkunde',requiresOwnFulfillment:true});
  const r=engine.applyCommand(s,'approveApproval',{requestId:req.id}).result;
  expect(r).toMatchObject({ok:false,superseded:true});
  expect(s.partners.transports).toHaveLength(0);
 });
 it('does not treat an unknown employee as a manual booking', () => {
  const s=base(); const offer=partner.requestPartnerOffers(s,'test-order').offers[0];
  expect(()=>partner.bookPartnerTransport(s,{orderId:'test-order',partnerId:offer.partnerId,employeeId:'missing'})).toThrow();
  expect(s.partners.transports).toHaveLength(0);
 });
 it('deduplicates tour retries even when the old key contains changing time', () => {
  const s=base();
  for(let i=0;i<30;i++) delegation.createApprovalRequest(s,{type:'spend',employeeId:'boss',costCents:1000,
   dedupKey:'tour_spend:boss:'+i+':v1',actionData:{vehicleId:'v1',driverId:'d1',orderIds:['test-order']}});
  expect(s.approvals.pending).toHaveLength(1);
 });
 it('remembers rejection of an unchanged request and permits a changed price', () => {
  const s=base();
  s.vehicles[0].condition=40;
  const opts={type:'maintenance',employeeId:'boss',costCents:90000,actionData:{vehicleId:'v1',branchId:'b1',type:'standard'}};
  const {request:req}=delegation.createApprovalRequest(s,opts);
  delegation.rejectApproval(s,req.id);
  // History pruning must not reactivate a rejected action.
  s.approvals.resolved=[];
  for(let i=0;i<30;i++) { s.gameTime++; delegation.migrateApprovals(s); expect(delegation.createApprovalRequest(s,opts).isNew).toBe(false); }
  expect(s.approvals.pending).toHaveLength(0);
  expect(delegation.createApprovalRequest(s,{...opts,costCents:95000}).isNew).toBe(true);
 });
 it('keeps unsupported actions pending instead of reporting success', () => {
  const s=base();
  const {request:req}=delegation.createApprovalRequest(s,{type:'other',employeeId:'boss',actionData:{type:'unknown'}});
  expect(()=>engine.applyCommand(s,'approveApproval',{requestId:req.id})).toThrow();
  expect(s.approvals.pending[0].status).toBe('pending');
 });
});

it('returns the new approval through the real client command boundary', async () => {
 const s=ce.createInitialState({companyName:'Test',playerName:'Test',partnerName:'Test'}).state;
 ce.applyCommand(s,'advanceTime',{minutes:0});
 s.employees.push({id:'boss',name:'Test',role:'branch_manager',employmentStatus:'employed',branchId:'b1'});
 s.delegation.rules.maxSpendPerActionCents=1;
 const r=await executeCommand(structuredClone(s),'startSiteExpansion',{branchId:'b1',type:'parking',slots:1,employeeId:'boss'});
 expect(r.error).toBeUndefined();
 expect(r.result).toMatchObject({ok:false,requiresApproval:true});
 expect(r.state.approvals.pending).toHaveLength(1);
});

describe('load and dispatcher boundaries', () => {
 it('cleans duplicate approvals while loading without mutating the stored snapshot', async () => {
  const { prepareLoadedState } = await import('@/lib/saveSafety');
  const s=ce.createInitialState({companyName:'Test',playerName:'Test',partnerName:'Test'}).state;
  ce.applyCommand(s,'advanceTime',{minutes:0});
  cd.createApprovalRequest(s,{type:'maintenance',employeeId:'boss',costCents:90000,actionData:{vehicleId:'v1',branchId:'b1',type:'standard'}});
  const original=s.approvals.pending[0];
  s.approvals.pending.push({...structuredClone(original),id:'duplicate',dedupKey:'legacy:time'});
  const loaded=prepareLoadedState(s);
  expect(loaded.approvals.pending).toHaveLength(1);
  expect(s.approvals.pending).toHaveLength(2);
  expect(loaded.gameTime).toBe(s.gameTime);
 });
 it.each([['client','dispatcher_senior'],['server','dispatcher_senior'],['client','dispatcher'],['server','dispatcher']])('%s %s includes real fuel and toll in the request', async (side, role) => {
  const engine=side==='client'?ce:se;
  const { processDispatcher }=side==='client'?await import('@/lib/simulation/dispatcherProcessor'):await import('../base44/shared/dispatcherProcessor');
  const s=engine.createInitialState({companyName:'Test',playerName:'Test',partnerName:'Test'}).state;
  engine.applyCommand(s,'advanceTime',{minutes:0});
  s.orders=[{...s.orders[0],id:'dispatch-test',status:'angenommen',fromCity:'Hamburg',toCity:'Kiel',tons:1,isDangerousGoods:false,
   paymentCents:100000,earliestPickupMin:s.gameTime,latestLoadStartMin:s.gameTime+1440,deliveryDeadlineMin:s.gameTime+2400,history:[]}];
  const emp={id:'dispatcher',name:'Test',role,employmentStatus:'employed',workMode:'autonomous',assignedBranchId:'b1',capacity:6};
  s.employees.push(emp);
  s.delegation.rules.maxSpendPerActionCents=1;
  processDispatcher(s,emp,s.gameTime,[]);
  expect(s.approvals.pending).toHaveLength(1);
  expect(s.approvals.pending[0].costCents).toBeGreaterThan(0);
  expect(s.tours||[]).toHaveLength(0);
 });
});
