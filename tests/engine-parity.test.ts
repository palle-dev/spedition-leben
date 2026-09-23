import { it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createInitialState, applyCommand } from '@/lib/simulation/simulationEngine';
import { migrateApprovals } from '@/lib/simulation/delegationEngine';
import { createInitialState as remoteInitial, applyCommand as remoteCommand } from '../base44/shared/simulationEngine';

it('Browser- und Base44-Module sind identische, überprüfbare Kopien', () => {
  for (const file of readdirSync('src/lib/simulation').filter(f => /\.(ts|js)$/.test(f))) {
    expect(readFileSync('base44/shared/' + file, 'utf8'), file).toBe(readFileSync('src/lib/simulation/' + file, 'utf8'));
  }
});
it('Löschen einer offenen Freigabe funktioniert in beiden Engines identisch', () => {
  const a = createInitialState({ companyName: 'Parity' }).state;
  const b = remoteInitial({ companyName: 'Parity' }).state;
  for (const state of [a, b]) {
    migrateApprovals(state);
    state.approvals.pending = [{ id: 'remove', status: 'pending' }, { id: 'keep', status: 'pending' }];
    state.delegation = { ...state.delegation, stats: { ...state.delegation?.stats, pendingApprovals: 2 } };
  }
  const local = applyCommand(a, 'deleteApproval', { requestId: 'remove' });
  const remote = remoteCommand(b, 'deleteApproval', { requestId: 'remove' });
  expect(remote).toEqual(local);
  expect(a.approvals.pending.map(r => r.id)).toEqual(['keep']);
  expect(b.approvals).toEqual(a.approvals);
  expect(a.delegation.stats.pendingApprovals).toBe(1);
  expect(b.delegation.stats.pendingApprovals).toBe(1);
});
it('Browser- und Server-Engine führen denselben Spieltag aus', () => {
  const names = { companyName: 'Parity', playerName: 'Test', partnerName: 'Test' };
  const a = createInitialState(names).state, b = remoteInitial(names).state;
  applyCommand(a, 'advanceTime', { minutes: 1440 }); remoteCommand(b, 'advanceTime', { minutes: 1440 });
  for (const k of ['gameTime', 'rngSeed', 'company', 'private', 'orders', 'accounting', 'drivers', 'vehicles', 'contracts']) expect(b[k], k).toEqual(a[k]);
});
