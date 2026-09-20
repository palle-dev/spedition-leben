import { describe,it,expect } from 'vitest';
import { captureOrders,packOrderResult,unpackOrderResult } from '@/lib/orderTransport';
const orders=()=>[{id:'a',status:'offered',cargo:{units:1}},{id:'b',status:'offered',cargo:{units:2}}];
function roundtrip(source,mutate){
 const worker=structuredClone({orders:source}),base=captureOrders(worker);mutate(worker);
 const packet=structuredClone(packOrderResult({data:{state:worker}},base));
 return {packet,result:unpackOrderResult(packet,packet.data,source),expected:worker};
}
describe('Lossless order response references',()=>{
 it('reuses unchanged orders but sends nested in-place mutations whole',()=>{
  const source=orders(),r=roundtrip(source,s=>{s.orders[1].cargo.units=9;});
  expect(r.result.state).toEqual(r.expected);expect(r.packet.orderDelta.rows[0]).toBe(0);
  expect(r.packet.orderDelta.rows[1].cargo.units).toBe(9);
  expect(r.result.state.orders[0]).toBe(source[0]);expect(source[1].cargo.units).toBe(2);
 });
 it('preserves additions, deletions, reordering and changed identifiers',()=>{
  const r=roundtrip(orders(),s=>{s.orders=[s.orders[1],{id:'new',status:'offered',cargo:{units:3}}];});
  expect(r.result.state).toEqual(r.expected);expect(r.packet.orderDelta.rows[0]).toBe(1);
 });
 it('does not reuse removed fields, undefined/null changes, NaN/null or array holes',()=>{
  for(const [before,after] of [[{x:1},{}],[{x:undefined},{}],[{x:NaN},{x:null}],[{x:[undefined]},{x:[null]}],[{x:new Array(1)},{x:[undefined]}]]){
   const source=[{id:'a',...before},{id:'b'}];
   const r=roundtrip(source,s=>{s.orders[0]={id:'a',...after};});
   expect(r.result.state).toEqual(r.expected);expect(typeof r.packet.orderDelta.rows[0]).toBe('object');
  }
 });
 it('sends ambiguous duplicate IDs and non-plain values without reuse',()=>{
  const source=[{id:'dup',v:1},{id:'dup',v:2},{id:'date',v:new Date(0)},{id:'stable'}];
  const r=roundtrip(source,()=>{});expect(r.result.state).toEqual(r.expected);
  expect(r.packet.orderDelta.rows.slice(0,3).every(v=>typeof v==='object')).toBe(true);
  expect(r.packet.orderDelta.rows[3]).toBe(3);
 });
 it('supports cycles conservatively without infinite recursion',()=>{
  const cycle:any={id:'cycle'};cycle.self=cycle;
  const r=roundtrip([cycle,{id:'stable'}],()=>{});
  expect(r.result.state).toEqual(r.expected);expect(r.packet.orderDelta.rows[0].self).toBe(r.packet.orderDelta.rows[0]);
 });
 it('keeps empty/all-new lists and missing order fields as complete responses',()=>{
  for(const replacement of [[],[{id:'new'}]]){
   const r=roundtrip(orders(),s=>{s.orders=replacement;});expect(r.packet.orderDelta).toBeUndefined();expect(r.result.state).toEqual(r.expected);
  }
  const packet={data:{state:{gameTime:1}}};expect(packOrderResult(packet,orders())).toBe(packet);
 });
 it('rejects invalid references, versions, source lengths and ambiguous payloads',()=>{
  const source=orders();
  for(const row of [-1,2,0.5,NaN,null,'0',[]]){
   const p={data:{state:{}},orderDelta:{version:1,baseLength:2,rows:[row]}};
   expect(()=>unpackOrderResult(p,p.data,source)).toThrow();
  }
  for(const delta of [{version:2,baseLength:2,rows:[0]},{version:1,baseLength:3,rows:[0]}]){
   expect(()=>unpackOrderResult({orderDelta:delta},{state:{}},source)).toThrow();
  }
  expect(()=>unpackOrderResult({orderDelta:{version:1,baseLength:2,rows:[0]}},{state:{orders:[]}},source)).toThrow();
 });
});
