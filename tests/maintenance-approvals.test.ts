import { describe, expect, it } from 'vitest';
import * as client from '@/lib/simulation/simulationEngine';
import * as server from '../base44/shared/simulationEngine';
import * as clientWorkshop from '@/lib/simulation/workshopEngine';
import * as serverWorkshop from '../base44/shared/workshopEngine';
import * as clientDelegation from '@/lib/simulation/delegationEngine';
import * as serverDelegation from '../base44/shared/delegationEngine';

describe.each([
  ['client', client, clientWorkshop, clientDelegation],
  ['server', server, serverWorkshop, serverDelegation],
])('%s maintenance approvals', (_, engine, workshop, delegation) => {
  function setup() {
    const s = engine.createInitialState({ companyName: 'Test', playerName: 'Test', partnerName: 'Test' }).state;
    engine.applyCommand(s, 'advanceTime', { minutes: 0 });
    s.gameTime = 480;
    workshop.buildWorkshopSlot(s, { branchId: 'b1' });
    s.employees.push({ id: 'mech', name: 'Test', role: 'mechanic', employmentStatus: 'employed', locationCity: 'Hamburg', branchId: 'b1' });
    s.vehicles[0].condition = 40;
    s.workshop.automationProfile.enabled = true;
    s.delegation.rules.maxSpendPerActionCents = 50000;
    workshop.evaluateWorkshopAutomation(s, 480, []);
    return s;
  }
  it('approval creates one work order and charges parts and budget once when work starts', () => {
    const s = setup();
    const req = s.approvals.pending[0];
    const balance = s.company.accountCents;
    const result = engine.applyCommand(s, 'approveApproval', { requestId: req.id }).result;
    expect(result.ok).toBe(true);
    expect(s.workshop.maintenanceOrders).toHaveLength(1);
    expect(s.company.accountCents).toBe(balance);
    expect(() => engine.applyCommand(s, 'approveApproval', { requestId: req.id })).toThrow();
    workshop.processWorkshop(s, 480, []);
    workshop.processWorkshop(s, 481, []);
    workshop.evaluateWorkshopAutomation(s, 481, []);
    expect(s.workshop.maintenanceOrders).toHaveLength(1);
    expect(s.workshop.maintenanceOrders[0].status).toBe('in_progress');
    expect(s.company.accountCents).toBe(balance - req.costCents);
    expect(s.delegation.dailySpend.companyCents).toBe(req.costCents);
    expect(s.delegation.dailySpend.byEmployee.mech).toBe(req.costCents);
    expect(s.approvals.pending).toHaveLength(0);
  });
  it('does not approve a vehicle already sold', () => {
    const s = setup();
    s.vehicles[0].status = 'sold';
    const r = engine.applyCommand(s, 'approveApproval', { requestId: s.approvals.pending[0].id }).result;
    expect(r).toMatchObject({ ok: false, superseded: true });
    expect(s.workshop.maintenanceOrders).toHaveLength(0);
  });
  it('resolves an obsolete request if a maintenance order already exists', () => {
    const s = setup();
    workshop.createMaintenanceOrder(s, { vehicleId: 'v1', branchId: 'b1', type: 'standard' });
    const r = engine.applyCommand(s, 'approveApproval', { requestId: s.approvals.pending[0].id }).result;
    expect(r).toMatchObject({ ok: false, superseded: true });
    expect(s.workshop.maintenanceOrders).toHaveLength(1);
  });
  it('keeps the request pending when current costs exceed the displayed approval', () => {
    const s = setup();
    s.private.stress = 100;
    expect(() => engine.applyCommand(s, 'approveApproval', { requestId: s.approvals.pending[0].id })).toThrow(/Kosten/);
    expect(s.approvals.pending[0].status).toBe('pending');
    expect(s.workshop.maintenanceOrders).toHaveLength(0);
  });
  it('does not charge above the approved ceiling if costs rise before work starts', () => {
    const s = setup();
    engine.applyCommand(s, 'approveApproval', { requestId: s.approvals.pending[0].id });
    const balance = s.company.accountCents;
    s.private.stress = 100;
    workshop.processWorkshop(s, 480, []);
    expect(s.workshop.maintenanceOrders[0].status).toBe('waiting');
    expect(s.company.accountCents).toBe(balance);
    s.private.stress = 0;
    workshop.processWorkshop(s, 481, []);
    expect(s.workshop.maintenanceOrders[0].status).toBe('in_progress');
  });
  it('archives identical legacy requests without executing work, and is idempotent', () => {
    const s = setup();
    const req = s.approvals.pending[0];
    for (let i = 0; i < 29; i++) s.approvals.pending.push({ ...structuredClone(req), id: 'legacy_' + i, dedupKey: 'legacy:' + i });
    const balance = s.company.accountCents;
    delegation.migrateApprovals(s);
    expect(s.approvals.pending).toHaveLength(1);
    expect(s.approvals.resolved).toHaveLength(29);
    expect(s.approvals.resolved.every(a => a.status === 'superseded')).toBe(true);
    expect(s.delegation.stats.pendingApprovals).toBe(1);
    expect(s.company.accountCents).toBe(balance);
    expect(s.workshop.maintenanceOrders).toHaveLength(0);
    const after = structuredClone(s.approvals);
    delegation.migrateApprovals(s);
    expect(s.approvals).toEqual(after);
    workshop.evaluateWorkshopAutomation(s, 481, []);
    expect(s.approvals.pending).toHaveLength(1);
  });
  it('does not merge requests for different vehicles, locations, or prices', () => {
    const s = setup();
    const req = s.approvals.pending[0];
    s.approvals.pending.push(
      { ...structuredClone(req), id: 'other_vehicle', actionData: { ...req.actionData, vehicleId: 'v2' } },
      { ...structuredClone(req), id: 'other_branch', actionData: { ...req.actionData, branchId: 'b2' } },
      { ...structuredClone(req), id: 'other_cost', costCents: req.costCents + 100 },
    );
    delegation.migrateApprovals(s);
    expect(s.approvals.pending).toHaveLength(4);
  });
  it('does not execute an expired request', () => {
    const s = setup();
    s.approvals.pending[0].deadlineMin = 479;
    const r = engine.applyCommand(s, 'approveApproval', { requestId: s.approvals.pending[0].id }).result;
    expect(r).toMatchObject({ ok: false, superseded: true });
    expect(s.workshop.maintenanceOrders).toHaveLength(0);
  });
});
