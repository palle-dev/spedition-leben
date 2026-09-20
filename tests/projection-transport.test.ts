import {describe,it,expect} from 'vitest';
import {packResult,unpackResult,coldPart} from '@/lib/simulationTransport';
import {projectJournal} from '@/lib/simulation/financialProjection';
import {ACCOUNTS} from '@/lib/simulation/accountingEngine';
const entry=(n,t)=>({entryNo:n,gameTime:t,type:'test',branchId:'a',lines:[{account:'1000',debitCents:n,creditCents:0},{account:'4000',debitCents:0,creditCents:n}]});
function setup(){
 const projection=projectJournal(null,[entry(1,0),entry(2,1440),entry(3,2880)],ACCOUNTS);
 const before={accounting:{journal:[],journalProjection:projection}};
 const after={accounting:{journal:[],journalProjection:projectJournal(projection,[entry(4,1441),entry(5,4320)],ACCOUNTS)}};
 const source=coldPart(before),packet=packResult({state:after},source);return {before,after,source,packet};
}
describe('Revision-bound financial history response references',()=>{
 it('roundtrips changed, new and unchanged days including a backdated entry',()=>{
  const {after,source,packet}=setup();expect(packet.cold.projectionDays.rows.filter(r=>r[1]===null).map(r=>r[0])).toEqual(['0','2']);
  const result=unpackResult(structuredClone(packet),source);expect(result.state).toEqual(after);
  expect(result.state.accounting.journalProjection.days[0]).toBe(source.projection.days[0]);
  expect(result.state.accounting.journalProjection.days[1]).not.toBe(source.projection.days[1]);
 });
 it('keeps full transport for independent/imported projections and absence',()=>{
  const {after,source}=setup();const packet=packResult({state:structuredClone(after)},source);expect(packet.cold.projectionDays).toBeUndefined();expect(unpackResult(structuredClone(packet),source).state).toEqual(after);
  const empty={accounting:{journal:[]}};expect(unpackResult(packResult({state:empty},source),source).state).toEqual(empty);
 });
 it('retains whole-projection reuse when unchanged',()=>{
  const {before,source}=setup();const packet=packResult({state:before},source);expect(packet.cold.reuseProjection).toBe(true);expect(unpackResult(packet,source).state.accounting.journalProjection).toBe(source.projection);
 });
 it('rejects malformed or ambiguous references instead of dropping history',()=>{
  const mutations=[p=>p.cold.projectionDays.version=2,p=>p.cold.projectionDays.baseCount++,p=>p.cold.projectionDays.rows.push(['missing',null]),p=>p.cold.projectionDays.rows.push(['0',null]),p=>p.cold.projectionDays.rows[0]=['0',7],p=>p.cold.reuseProjection=true,p=>p.cold.projection.days={},p=>p.cold.projectionDays=null];
  for(const mutate of mutations){const {source,packet}=setup();mutate(packet);expect(()=>unpackResult(packet,source)).toThrow();}
 });
 it('does not mutate the request source while reconstructing a response',()=>{
  const {source,packet}=setup(),saved=structuredClone(source);unpackResult(structuredClone(packet),source);expect(source).toEqual(saved);
 });
});
