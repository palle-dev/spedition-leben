import {describe,it,expect,vi} from 'vitest';
import {packStoredProjection,unpackStoredProjection} from '@/lib/projectionStorage';
import {freezeFinancialSnapshot} from '@/lib/simulationTransport';
function record(){return {savedAt:99,name:'Slot',state:{meta:{partyId:'party'},accounting:{journal:[],journalProjection:{version:1,count:1000,days:Object.fromEntries(Array.from({length:1000},(_,i)=>[i,{total:{accounts:{'1000':i},cash:[i,0,0],branches:{}},minutes:{[i*1440]:{accounts:{'1000':i},cash:[i,0,0],branches:{}}}}]))}}}};}
describe('Compressed local financial snapshots',()=>{
 it('roundtrips every field without changing original and preserves portable in-memory state',async()=>{
  const r=record(),original=structuredClone(r);const packed=await packStoredProjection(r);expect(packed.localFinancialProjection.data).toBeInstanceOf(Blob);expect(r).toEqual(original);
  expect(await unpackStoredProjection(structuredClone(packed))).toEqual(r);
 });
 it('reuses only proven immutable trees and refreshes mutable and shallow-frozen inputs',async()=>{
  const r=record();freezeFinancialSnapshot(r.state);const a=await packStoredProjection(r),b=await packStoredProjection(r);expect(a.localFinancialProjection.data).toBe(b.localFinancialProjection.data);
  const mutable=record();Object.freeze(mutable.state.accounting.journalProjection);const x=await packStoredProjection(mutable);mutable.state.accounting.journalProjection.days[0].total.accounts['1000']=987;
  const y=await packStoredProjection(mutable);expect(y.localFinancialProjection.sha256).not.toBe(x.localFinancialProjection.sha256);expect(await unpackStoredProjection(y)).toEqual(mutable);
 });
 it('keeps legacy and small records readable and rejects missing/corrupt blocks',async()=>{
  const small={state:{accounting:{journalProjection:{version:1,count:0,days:{}}}}};expect(await packStoredProjection(small)).toBe(small);expect(await unpackStoredProjection(small)).toBe(small);
  const packed=await packStoredProjection(record());const missing={...packed};delete missing.localFinancialProjection;await expect(unpackStoredProjection(missing)).rejects.toThrow();
  await expect(unpackStoredProjection({...packed,localFinancialProjection:{...packed.localFinancialProjection,data:new Blob(['bad'])}})).rejects.toThrow(/Prüfsumme/);
  await expect(unpackStoredProjection({...packed,localFinancialProjection:{...packed.localFinancialProjection,rawBytes:1}})).rejects.toThrow();
 });
 it('fails before storage on compression errors and does not cache failures',async()=>{
  const r=record();freezeFinancialSnapshot(r.state);const original=CompressionStream;vi.stubGlobal('CompressionStream',class{constructor(){throw Error('disk full');}});
  try{await expect(packStoredProjection(r)).rejects.toThrow('disk full');}finally{vi.stubGlobal('CompressionStream',original);}
  expect(await unpackStoredProjection(await packStoredProjection(r))).toEqual(r);
 });
});
