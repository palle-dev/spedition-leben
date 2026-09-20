import { describe, it, expect } from 'vitest';
import { cloneSaveSnapshot, freezeFinancialSnapshot } from '@/lib/simulationTransport';
const make = () => ({gameTime: 123, company: {cash: 500}, meta: {partyId:'a'},
 historyArchive: {chunks:[{id:'block',storage:'indexeddb'}]},
 accounting: {journal:[{entryNo:1,lines:[{debitCents:123}]}],
 journalProjection:{days:{'1':{total:123}}},accountBalances:{cash:123}}});
describe('Stable queued save snapshots', () => {
 it('shares only proven immutable finance trees and isolates mutable state', () => {
  const s=make(),expected=structuredClone(s);freezeFinancialSnapshot(s);
  const copy=cloneSaveSnapshot(s);
  expect(copy).toEqual(expected);
  expect(copy.accounting.journal).toBe(s.accounting.journal);
  expect(copy.accounting.journalProjection).toBe(s.accounting.journalProjection);
  s.gameTime++;s.company.cash=0;s.accounting.accountBalances.cash=0;
  s.historyArchive.chunks[0].id='changed';s.meta.partyId='b';
  expect(copy).toEqual(expected);
  expect(()=>{copy.accounting.journal[0].lines[0].debitCents=99;}).toThrow();
  expect(()=>{copy.accounting.journalProjection.days['1'].total=99;}).toThrow();
 });
 it('keeps the queued snapshot intact when later results replace financial trees', () => {
  const s=make();freezeFinancialSnapshot(s);const copy=cloneSaveSnapshot(s);
  s.accounting.journal=[...s.accounting.journal,{entryNo:2,lines:[]}];
  s.accounting.journalProjection={days:{'1':{total:999}}};
  expect(copy.accounting.journal).toHaveLength(1);
  expect(copy.accounting.journalProjection.days['1'].total).toBe(123);
 });
 it('fully copies unconfirmed/imported states without freezing the input', () => {
  const s=make(),copy=cloneSaveSnapshot(s);
  s.accounting.journal[0].lines[0].debitCents=9;
  s.accounting.journalProjection.days['1'].total=9;
  expect(copy).toEqual(make());expect(Object.isFrozen(s.accounting.journal)).toBe(false);
 });
 it('does not mistake shallow-frozen external arrays for immutable originals', () => {
  const s=make();Object.freeze(s.accounting.journal);Object.freeze(s.accounting.journalProjection);
  const copy=cloneSaveSnapshot(s);s.accounting.journal[0].lines[0].debitCents=9;
  s.accounting.journalProjection.days['1'].total=9;
  expect(copy).toEqual(make());
 });
 it('falls back when a mutable projection replaces a previously frozen one', () => {
  const s=make();freezeFinancialSnapshot(s);s.accounting.journalProjection={days:{'1':{total:456}}};
  const copy=cloneSaveSnapshot(s);s.accounting.journalProjection.days['1'].total=0;
  expect(copy.accounting.journalProjection.days['1'].total).toBe(456);
  expect(copy.accounting.journal).not.toBe(s.accounting.journal);
 });
 it('preserves absent projection and states without accounting', () => {
  const s:any=make();delete s.accounting.journalProjection;freezeFinancialSnapshot(s);
  const copy=cloneSaveSnapshot(s);expect(copy).toEqual(s);
  expect(Object.hasOwn(copy.accounting,'journalProjection')).toBe(false);
  expect(cloneSaveSnapshot({gameTime:0})).toEqual({gameTime:0});
  expect(cloneSaveSnapshot(null)).toBe(null);
 });
});
