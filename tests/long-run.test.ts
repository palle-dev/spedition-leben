import { it, expect } from 'vitest';
import { createInitialState, applyCommand } from '@/lib/simulation/simulationEngine';
import { getBalanceSheet, getAccountBalance, postJournal } from '@/lib/simulation/accountingEngine';
import { executeCommand } from '@/lib/simulationAdapter';
import fs from 'node:fs';

it('35 Betriebstage mit Personal, Disposition und Monatswechsel erhalten Buchungsinvarianten', async () => {
  let s = createInitialState({ companyName: 'Langzeittest', playerName: 'Test', partnerName: 'Test' }).state;
  postJournal(s, { text: 'Testkapital', lines: [{ account: '1000', debit: 50000000 }, { account: '2020', credit: 50000000 }] });
  for (const role of ['dispatcher', 'dispatcher', 'mechanic', 'accountant', 'assistant', 'branch_manager']) {
    const a = s.availableApplicants.find(a => a.role === role);
    applyCommand(s, 'hireEmployee', { applicantId: a.id });
  }
  for (const e of s.employees.filter(e => e.role === 'dispatcher')) applyCommand(s, 'setupDispatcher', { employeeId: e.id, workMode: 'autonomous' });
  applyCommand(s, 'buildWorkshopSlot', { branchId: 'b1' });
  const rows = [];
  for (let day = 1; day <= 35; day++) {
    const t0 = performance.now();
    const r = await executeCommand(s, 'advanceTime', { minutes: 1440 });
    if (r.error) throw new Error(`Tag ${day}: ${r.error}`);
    s = r.state;
    expect(r.result.stopped, `Tag ${day}`).toBe(false);
    expect(getAccountBalance(s, '1000'), `Firmenbank Tag ${day}`).toBe(s.company.accountCents);
    expect(getBalanceSheet(s).total.balanced, `Bilanz Tag ${day}`).toBe(true);
    expect(s.accounting.journal.every(e => e.lines.reduce((n, l) => n + l.debitCents - l.creditCents, 0) === 0)).toBe(true);
    expect(s.accounting.journal.flatMap(e => e.lines).every(l => Number.isSafeInteger(l.debitCents) && Number.isSafeInteger(l.creditCents) && l.debitCents >= 0 && l.creditCents >= 0)).toBe(true);
    expect(s.drivers.every(d => Number.isFinite(d.workMinutesSinceRest) && Number.isFinite(d.driveMinutesSinceBreak))).toBe(true);
    rows.push({ day, elapsedMs: performance.now() - t0, gameTime: s.gameTime, cashCents: s.company.accountCents,
      delivered: s.stats.totalDeliveries, orders: s.orders.length, journal: s.accounting.journal.length, stateBytes: Buffer.byteLength(JSON.stringify(s)) });
  }
  fs.mkdirSync('audit', { recursive: true }); fs.writeFileSync('audit/long-run.json', JSON.stringify(rows, null, 2));
  expect(s.accounting.periods.some(p => p.month === 1)).toBe(true);
  expect(s.accounting.journal.some(e => e.type === 'opening')).toBe(true);
}, 120000);
