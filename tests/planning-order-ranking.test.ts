import {describe,it,expect} from 'vitest';
import {createPlanningOrderRanking} from '@/lib/simulation/planningOrderRanking';
import {getDistance} from '@/lib/simulation/gameRules';
function previous(orders,city,limit){
 if(orders.length<=limit)return orders;
 const scored=orders.map(o=>({o,score:(o.paymentCents||0)/((getDistance(city,o.fromCity)+getDistance(o.fromCity,o.toCity))||1)}));
 scored.sort((a,b)=>{const aa=a.o.status==='angenommen',ba=b.o.status==='angenommen';if(aa!==ba)return aa?-1:1;if(aa&&a.o.deliveryDeadlineMin!==b.o.deliveryDeadlineMin)return a.o.deliveryDeadlineMin-b.o.deliveryDeadlineMin;return b.score-a.score;});
 return scored.slice(0,limit).map(s=>s.o);
}
const pool=()=>Array.from({length:90},(_,i)=>({id:String(i),status:i<30?'angenommen':'offered',deliveryDeadlineMin:100+(i%7),paymentCents:10000+(i%11)*1000,fromCity:['Kiel','Hamburg','Berlin'][i%3],toCity:['München','Bremen','Köln'][i%3]}));
describe('Shared per-city planning ranks',()=>{
 it('matches previous sorting for changing eligible subsets and multiple cities',()=>{
  const all=pool(),rank=createPlanningOrderRanking(all);
  for(const city of ['Kiel','Berlin','Hamburg'])for(let omitted=0;omitted<12;omitted++)for(const limit of [12,18,24]){
   const eligible=all.filter((_,i)=>i%13!==omitted&&i%5!==omitted%5);
   expect(rank(eligible,city,limit)).toEqual(previous(eligible,city,limit));
  }
 });
 it('preserves input order below or at the limit',()=>{
  const all=pool(),rank=createPlanningOrderRanking(all),subset=all.slice(10,22);
  expect(rank(subset,'Kiel',12)).toBe(subset);expect(rank(subset,'Kiel',24)).toBe(subset);
 });
 it('preserves stable ties and object identity without mutating the pool',()=>{
  const all=pool().map(o=>({...o,status:'offered',fromCity:'Kiel',toCity:'Hamburg',paymentCents:100}));
  const original=structuredClone(all),eligible=all.filter((_,i)=>i%2===0),result=createPlanningOrderRanking(all)(eligible,'Berlin',12);
  expect(result).toEqual(eligible.slice(0,12));expect(result[0]).toBe(eligible[0]);expect(all).toEqual(original);
 });
 it('falls back to exact original subset behavior for nonfinite comparison keys',()=>{
  for(const invalid of [NaN,Infinity,undefined]){
   const all=pool();all[1].deliveryDeadlineMin=invalid;all[50].paymentCents=Infinity;
   const eligible=all.filter((_,i)=>i%3!==0);
   expect(createPlanningOrderRanking(all)(eligible,'Kiel',12)).toEqual(previous(eligible,'Kiel',12));
  }
 });
 it('does not retain ranks across separate planning calls after state changes',()=>{
  const all=pool();createPlanningOrderRanking(all)(all,'Kiel',12);
  all[0].deliveryDeadlineMin=1;all[60].paymentCents=1000000;
  expect(createPlanningOrderRanking(all)(all,'Kiel',12)).toEqual(previous(all,'Kiel',12));
 });
});

describe('Sparse planning subsets',()=>{
 it('matches original sorting for sparse subsets, ties and dense reuse',()=>{
  const all=Array.from({length:4000},(_,i)=>({...pool()[i%90],id:String(i)})),rank=createPlanningOrderRanking(all),original=structuredClone(all);
  for(const city of ['Kiel','Berlin'])for(const step of [97,89,1,101]){
   const eligible=all.filter((_,i)=>i%step===0);
   expect(rank(eligible,city,12)).toEqual(previous(eligible,city,12));
  }
  expect(all).toEqual(original);
 });
 it('retains pool tie order in the sparse path',()=>{
  const all=Array.from({length:4000},(_,i)=>({id:String(i),status:'offered',fromCity:'Kiel',toCity:'Hamburg',paymentCents:100}));
  const eligible=all.filter((_,i)=>i%101===0);
  expect(createPlanningOrderRanking(all)(eligible,'Berlin',12)).toEqual(eligible.slice(0,12));
 });
});
