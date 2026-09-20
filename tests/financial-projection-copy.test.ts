import {describe,it,expect} from 'vitest';
import {projectJournal,projectionRange,journalRange} from '@/lib/simulation/financialProjection';
import {ACCOUNTS} from '@/lib/simulation/accountingEngine';
function entry(no,time,n=100){return {entryNo:no,gameTime:time,type:'revenue',branchId:'branch',lines:[{account:'1000',debitCents:n,creditCents:0},{account:'4000',debitCents:0,creditCents:n}]};}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
describe('Immutable historical projection updates',()=>{
 it('preserves frozen old days and changes only touched days, including backdating',()=>{
  const rows=[entry(1,10),entry(2,1450),entry(3,2890)];const previous=freeze(projectJournal(null,rows,ACCOUNTS));const original=JSON.stringify(previous);
  const additions=[entry(4,1450,31),entry(5,1451,7),entry(6,4330,44)];const updated=projectJournal(previous,additions,ACCOUNTS);
  expect(JSON.stringify(previous)).toBe(original);expect(updated.days[0]).toBe(previous.days[0]);expect(updated.days[2]).toBe(previous.days[2]);expect(updated.days[1]).not.toBe(previous.days[1]);
  expect(updated).toEqual(projectJournal(null,[...rows,...additions],ACCOUNTS));
  for(const [a,b] of [[-Infinity,Infinity],[1450,1450],[1451,4330],[1440,2880]])expect(projectionRange(updated,a,b)).toEqual(journalRange([...rows,...additions],ACCOUNTS,a,b));
 });
 it('does not partially mutate old totals if a later posting is invalid',()=>{
  const previous=freeze(projectJournal(null,[entry(1,10)],ACCOUNTS)),original=JSON.stringify(previous);
  expect(()=>projectJournal(previous,[entry(2,11),entry(3,NaN)],ACCOUNTS)).toThrow();expect(JSON.stringify(previous)).toBe(original);
 });
 it('supports successive branches from the same snapshot without cross-updates',()=>{
  const original=freeze(projectJournal(null,[entry(1,10)],ACCOUNTS));
  const a=projectJournal(original,[entry(2,11,20)],ACCOUNTS);const b=projectJournal(original,[entry(3,11,30)],ACCOUNTS);
  expect(projectionRange(a).accounts['1000']).toBe(120);expect(projectionRange(b).accounts['1000']).toBe(130);expect(projectionRange(original).accounts['1000']).toBe(100);
 });
});
