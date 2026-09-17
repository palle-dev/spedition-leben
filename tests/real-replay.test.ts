import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { executeCommand } from '@/lib/simulationAdapter';
import { applyCommand } from '@/lib/simulation/simulationEngine';
import { getBalanceSheet } from '@/lib/simulation/accountingEngine';

// Reale Exporte bleiben außerhalb des Quellcodepakets. Zum Nachspielen:
// FRACHTFIEBER_FIXTURES=/pfad/zur/frachtfieber_systempruefung npm test
const fixtureDir = process.env.FRACHTFIEBER_FIXTURES;
const load = () => JSON.parse(fs.readFileSync(path.join(fixtureDir, 'FRACHTFIEBER_Ausgang_Tag28.json'), 'utf8')).state;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const coreKeys = ['gameTime', 'rngSeed', 'idCounter', 'company', 'private', 'stats', 'vehicles', 'drivers', 'employees',
  'orders', 'trips', 'tours', 'contracts', 'accounting', 'workshop', 'investment', 'partners', 'bookings', 'mail'];

describe.skipIf(!fixtureDir)('Reale Spielstände: Tag 28 → 29', () => {
  it('Tages-, Stunden- und Viertelstunden-Schritte ergeben denselben fachlichen Zustand', async () => {
    const runs = [];
    for (const step of [1440, 60, 15]) {
      let s = load(); const initial = structuredClone(s); const t0 = performance.now();
      for (let n = 0; n < 1440 / step; n++) {
        const r = await executeCommand(s, 'advanceTime', { minutes: step });
        if (r.error) throw new Error(r.error); s = r.state;
      }
      const elapsedMs = performance.now() - t0;
      const oldJournal = new Set(initial.accounting.journal.map(e => e.id));
      const journal = s.accounting.journal.filter(e => !oldJournal.has(e.id));
      const bankDelta = journal.flatMap(e => e.lines).filter(l => l.account === '1000')
        .reduce((sum, l) => sum + l.debitCents - l.creditCents, 0);
      const newTrips = s.trips.filter(t => t.startMin >= initial.gameTime && !initial.trips.some(x => x.id === t.id));
      const sickStarts = newTrips.filter(t => s.absences.sicknesses.some(a => a.personId === t.driverId &&
        a.startMin <= t.startMin && a.expectedEndMin > t.startMin));
      const earlyLoading = newTrips.filter(t => {
        const order = s.orders.find(o => o.id === t.orderId);
        return order && t.phases.some(p => p.type === 'loading' && p.startMin < order.earliestPickupMin);
      });
      const summary = { step, elapsedMs, gameTime: s.gameTime, newTrips: newTrips.length,
        cashDelta: s.company.accountCents - initial.company.accountCents, bankDelta,
        sickStarts: sickStarts.map(t => t.id), earlyLoading: earlyLoading.map(t => t.id),
        workshop: s.workshop.maintenanceOrders.find(o => o.id === 'wo_6368')?.status,
        balanced: getBalanceSheet(s).total.balanced,
        hashes: Object.fromEntries(coreKeys.map(k => [k, hash(s[k])])) };
      runs.push({ s, summary });
      fs.mkdirSync('audit', { recursive: true });
      fs.writeFileSync('audit/real-replay.json', JSON.stringify(runs.map(r => r.summary), null, 2));
      expect(summary.cashDelta).toBe(bankDelta);
      expect(summary.sickStarts).toEqual([]);
      expect(summary.earlyLoading).toEqual([]);
      expect(summary.workshop).toBe('completed');
    }
    for (const r of runs.slice(1)) for (const k of coreKeys) {
      if (r.summary.hashes[k] !== runs[0].summary.hashes[k]) {
        // Lokaler Nachweis zur Eingrenzung; wird nicht mit dem Quellcode ausgeliefert.
        fs.writeFileSync(`audit/replay-difference-${r.summary.step}-${k}.json`, JSON.stringify({ day: runs[0].s[k], split: r.s[k] }));
      }
      expect(r.summary.hashes[k], `${r.summary.step}-Minuten: ${k}`).toBe(runs[0].summary.hashes[k]);
    }
  }, 120000);
});
