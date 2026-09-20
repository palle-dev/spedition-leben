import {describe,it,expect,vi} from 'vitest';
import {prepareLoadedState,prepareOwnedLoadedState} from '@/lib/saveSafety';
import {runSaveFileTask} from '@/lib/saveFileTasks';
import {portableHistory} from '@/lib/historyArchive';
const state=()=>({gameTime:14400,company:{name:'test'},private:{},vehicles:[],drivers:[],orders:[{id:'old',status:'expired',acceptDeadlineMin:1}],timeControl:{enabled:true},meta:{partyId:'A'}});
describe('Exclusively owned worker prepare input',()=>{
 it('keeps the public helper independent and normalizes the owned copy identically',()=>{
  const raw=state(),original=structuredClone(raw),owned=structuredClone(raw);
  expect(prepareOwnedLoadedState(owned)).toEqual(prepareLoadedState(raw));expect(raw).toEqual(original);
  const copy=prepareLoadedState(raw);copy.orders[0].id='changed';expect(raw.orders[0].id).toBe('old');
 });
 it('preserves exact archived originals and normalized state for both task paths',async()=>{
  const raw=state(),original=structuredClone(raw);
  const expected=await runSaveFileTask('prepare',raw);const actual=await runSaveFileTask('prepare',structuredClone(raw),undefined,{ownedInput:true});
  expect(await portableHistory(actual)).toEqual(await portableHistory(expected));expect(raw).toEqual(original);expect(actual.timeControl.enabled).toBe(false);
 });
 it('keeps caller state intact when invalid data causes preparation to fail',async()=>{
  const raw={...state(),branches:{}},original=structuredClone(raw);
  await expect(runSaveFileTask('prepare',raw)).rejects.toThrow();
  await expect(runSaveFileTask('prepare',structuredClone(raw),undefined,{ownedInput:true})).rejects.toThrow();expect(raw).toEqual(original);
 });
 it('executes the actual worker entrypoint against a cloned input and reports errors without a result',async()=>{
  const worker={postMessage:vi.fn(),onmessage:null};vi.stubGlobal('self',worker);
  try{
   await import('@/lib/saveFileWorker');const raw=state(),original=structuredClone(raw);
   await worker.onmessage({data:{command:'prepare',input:structuredClone(raw)}});
   expect(worker.postMessage.mock.calls[0][0].result.timeControl.enabled).toBe(false);expect(raw).toEqual(original);
   await worker.onmessage({data:{command:'prepare',input:{...structuredClone(raw),branches:{}}}});
   expect(worker.postMessage.mock.calls[1][0].error).toBeTruthy();expect(worker.postMessage.mock.calls[1][0].result).toBeUndefined();expect(raw).toEqual(original);
  }finally{vi.unstubAllGlobals();}
 });
});
