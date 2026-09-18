import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { deliverMessage, migrateMail } from '../base44/shared/mailEngine';
import { pushEvent } from '../base44/shared/eventLog';
import { createApprovalRequest, migrateDelegation } from '../base44/shared/delegationEngine';
import { buildTourPlan } from '../base44/shared/tourEngine';
import { getKpiHistory, getTrainingEvents } from '@/lib/kpiHistoryData';
import AppDrawer from '@/components/ui/Drawer';

function mailState() {
  return { gameTime: 480, employees: [], drivers: [], mail: {
    conversations: [], messages: [], drafts: [], reportSchedules: [], staffTasks: [],
    nextMailId: 1, migrationDone: true,
  } };
}

describe('mail and event contracts', () => {
  it('normalizes single links and groups subsequent messages in the same conversation', () => {
    const state = mailState();
    const link = { type: 'vehicle', id: 'v1' };
    const a = deliverMessage(state, { fromId: 'system', toId: 'player', subject: 'Wartung', linkedRefs: link });
    const b = deliverMessage(state, { fromId: 'system', toId: 'player', linkedRefs: [link] });
    expect(a.linkedRefs).toEqual([link]);
    expect(b.conversationId).toBe(a.conversationId);
    expect(state.mail.conversations).toHaveLength(1);
  });

  it('preserves quick replies and decision metadata', () => {
    const state = mailState();
    const quickReplies = [{ label: 'Übernehmen', intentType: 'takeover_apprentice', params: { apprenticeshipId: 'a1' } }];
    const message = deliverMessage(state, { fromId: 'system', toId: 'player', quickReplies, intent: { requiresDecision: true } });
    expect(message.quickReplies).toEqual(quickReplies);
    expect(state.mail.conversations[0].decisionRequired).toBe(true);
  });

  it('migrates saved messages with object references idempotently', () => {
    const state = mailState();
    const message = deliverMessage(state, { fromId: 'system', toId: 'player' });
    message.linkedRefs = { type: 'vehicle', id: 'v1' };
    migrateMail(state);
    migrateMail(state);
    expect(message.linkedRefs).toEqual([{ type: 'vehicle', id: 'v1' }]);
  });

  it('keeps same-minute events for different people and branches', () => {
    const state = { gameTime: 480 };
    for (const personId of ['p1', 'p2']) pushEvent(state, { type: 'absence', personId, personName: personId });
    for (const branchId of ['b1', 'b2']) pushEvent(state, { type: 'branch', branchId });
    expect(state.events).toHaveLength(4);
    expect(state.events[0]).toMatchObject({ personId: 'p1', personName: 'p1', employeeName: 'p1' });
    pushEvent(state, { type: 'absence', personId: 'p1' });
    expect(state.events).toHaveLength(4);
    state.gameTime++;
    pushEvent(state, { type: 'absence', personId: 'p1' });
    expect(state.events).toHaveLength(5);
  });

  it('honors an explicit event deduplication key', () => {
    const state = { gameTime: 480 };
    pushEvent(state, { type: 'notice', dedupKey: 'once' });
    pushEvent(state, { type: 'notice', dedupKey: 'once', gameTime: 500 });
    expect(state.events).toHaveLength(1);
  });
});

it('does not multiply a pending maintenance approval across repeated ticks', () => {
  const state = { gameTime: 480, company: { accountCents: 100000 }, employees: [], drivers: [] };
  migrateDelegation(state);
  for (let i = 0; i < 30; i++) {
    state.gameTime++;
    createApprovalRequest(state, { type: 'maintenance', employeeId: 'm1', costCents: 90000,
      actionData: { vehicleId: 'v1' }, dedupKey: 'workshop_auto:v1' });
  }
  expect(state.approvals.pending).toHaveLength(1);
  expect(state.delegation.stats.pendingApprovals).toBe(1);
  expect(state.events).toHaveLength(1);
});

it('returns an explicit failed tour plan for missing resources', () => {
  expect(buildTourPlan({ vehicles: [], drivers: [] }, { vehicleId: 'missing', driverId: 'missing', orderIds: ['o1'] }))
    .toMatchObject({ ok: false, error: expect.any(String) });
});

it('aligns training markers with the chart day labels', () => {
  const state = { gameTime: 4000, training: { qualifications: [{ source: 'course', acquiredAtMin: 3000, type: 'test' }] } };
  const [event] = getTrainingEvents(state, 3);
  const day = getKpiHistory(state, 3).find(d => d.day === event.day);
  expect(event.dayLabel).toBe(day.dayLabel);
});

it('does not render closed drawer contents into the page', () => {
  const html = renderToString(React.createElement(AppDrawer,
    { open: false, onClose: () => {}, title: 'Kaufdetails' },
    React.createElement('button', null, 'Kauf verbindlich bestätigen')));
  expect(html).not.toContain('Kauf verbindlich bestätigen');
});
