import { describe, it, expect } from 'vitest';
import { createSimulationClient } from '@/lib/simulationWorkerClient';
import { createSimulationRuntime } from '@/lib/simulationWorkerRuntime';
import { coldPart, unpackResult } from '@/lib/simulationTransport';
const state=()=>({gameTime:0,company:{value:1},accounting:{journal:[{entryNo:1,text:'Original',lines:[{account:'1000',debitCents:10,creditCents:0}]}],accountBalances:{'1000':10},journalProjection:{version:1,days:{}}}});
function harness(execute:any=async(s,cmd)=>{s.gameTime++;s.accounting.journal.push({entryNo:s.gameTime+1,text:cmd,lines:[]});return {state:s,result:{ok:true}};}) {
 const workers:any[]=[];let calls=0;
 const client=createSimulationClient(()=>{
  const w:any={messages:[],responses:[],terminated:false,queue:Promise.resolve(),run:null,
   terminate(){this.terminated=true;},
   forget(){this.run=createSimulationRuntime(async(...args)=>{calls++;return execute(...args);},async s=>s);},
   postMessage(message){
    const cloned=structuredClone(message);this.messages.push(cloned);
    if(this.failPost){this.failPost=false;throw Error('postMessage failed');}
    this.queue=this.queue.then(async()=>{const result=structuredClone(await this.run(cloned));this.responses.push(result);if(!this.terminated)this.onmessage?.({data:result});});
   }};
  w.forget();workers.push(w);return w;
 });
 return {client,workers,calls:()=>calls};
}
describe('Revisionsgebundener Finanztransport',()=>{
 it('überträgt bekannte Originale nur einmal und rekonstruiert neue Ergebnisse exakt',async()=>{
  const h=harness(),s=state();const a=await h.client.execute(s,'first',{});h.client.accept(a,a.state);
  const b=await h.client.execute(a.state,'second',{});
  expect(h.workers[0].messages[0].reuseCold).toBe(false);expect(h.workers[0].messages[1].reuseCold).toBe(true);
  expect(h.workers[0].messages[1].state.accounting.journal).toBeUndefined();
  expect(b.state.accounting.journal.map(e=>e.text)).toEqual(['Original','first','second']);
  expect(b.state.accounting.journal[0]).toBe(s.accounting.journal[0]);
  expect(h.workers[0].responses[1].reusedRows).toBe(2);expect(s.gameTime).toBe(0);
 });
 it('verwendet ein nicht übernommenes Ergebnis nach Speicherfehler nicht weiter',async()=>{
  const h=harness(),s=state();await h.client.execute(s,'not-saved',{});
  const b=await h.client.execute(s,'retry-from-old',{});
  expect(h.workers[0].messages[1].reuseCold).toBe(false);
  expect(b.state.accounting.journal.map(e=>e.text)).toEqual(['Original','retry-from-old']);
 });
 it('führt nach fehlender Worker-Revision ausschließlich den ausdrücklich abgelehnten Befehl erneut zu',async()=>{
  const h=harness();const a=await h.client.execute(state(),'first',{});h.client.accept(a,a.state);h.workers[0].forget();
  const b=await h.client.execute(a.state,'second',{});
  expect(h.workers[0].messages).toHaveLength(3);expect(h.calls()).toBe(2);expect(b.state.gameTime).toBe(2);
 });
 it('verwirft durch fehlgeschlagene Befehle teilweise veränderte Worker-Daten',async()=>{
  const h=harness(async(s,cmd)=>{s.company.value++;if(cmd==='fail')return {error:'Fehler'};return {state:s,result:{ok:true}};});
  const a=await h.client.execute(state(),'ok',{});h.client.accept(a,a.state);
  expect((await h.client.execute(a.state,'fail',{})).error).toBe('Fehler');
  const b=await h.client.execute(a.state,'ok',{});expect(b.state.company.value).toBe(3);
  expect(h.workers[0].messages[2].reuseCold).toBe(false);
 });
 it('überträgt veränderliche Felder immer und verhindert direkte Änderungen an Originalbelegen',async()=>{
  const h=harness(),a=await h.client.execute(state(),'first',{});h.client.accept(a,a.state);
  expect(()=>{a.state.accounting.journal[0].lines[0].debitCents=99;}).toThrow();
  a.state.company.value=99;a.state.accounting.accountBalances['1000']=20;
  const b=await h.client.execute(a.state,'second',{});
  expect(b.state.company.value).toBe(99);expect(b.state.accounting.accountBalances['1000']).toBe(20);
 });
 it('behält Reihenfolge und Originalwerte beim Kürzen, Umordnen und Ersetzen bei',async()=>{
  const h=harness(async s=>{s.accounting.journal=[{entryNo:99,text:'neu',lines:[]},s.accounting.journal[0]];s.accounting.journalProjection={version:1,days:{day:1}};return {state:s};});
  const s=state(),a=await h.client.execute(s,'change',{});
  expect(a.state.accounting.journal.map(e=>e.entryNo)).toEqual([99,1]);expect(a.state.accounting.journalProjection.days).toEqual({day:1});
 });
 it('setzt bei Neustart oder Kontowechsel den Cache zurück und ignoriert alte Nachrichten',async()=>{
  const h=harness(),a=await h.client.execute(state(),'first',{});h.client.accept(a,a.state);
  const old=h.workers[0];h.client.reset();h.client.accept(a,a.state);
  const b=await h.client.execute(state(),'new-account',{});
  old.onmessage({data:{id:2,data:{state:{gameTime:999}}}});
  expect(h.workers).toHaveLength(2);expect(h.workers[1].messages[0].reuseCold).toBe(false);expect(b.state.gameTime).toBe(1);
 });
 it('startet nach Worker-Absturz neu, ohne einen ausgeführten Befehl automatisch zu wiederholen',async()=>{
  const h=harness(),a=await h.client.execute(state(),'first',{});h.client.accept(a,a.state);
  h.workers[0].onerror({message:'Crash'});
  const b=await h.client.execute(a.state,'second',{});expect(h.workers).toHaveLength(2);expect(h.calls()).toBe(2);expect(b.state.gameTime).toBe(2);
 });
 it('lehnt ungültige Rückverweise ab',()=>{
  expect(()=>unpackResult({data:{state:{accounting:{}}},cold:{rows:[999]}},coldPart(state()))).toThrow(/Journalverweis/);
 });
 it('bestätigt kein nachträglich ausgetauschtes Journal als Worker-Bestand',async()=>{
  const h=harness(),a=await h.client.execute(state(),'first',{});a.state.accounting.journal=[{entryNo:999,text:'ersetzt',lines:[]}];h.client.accept(a,a.state);
  const b=await h.client.execute(a.state,'second',{});expect(h.workers[0].messages[1].reuseCold).toBe(false);expect(b.state.accounting.journal[0].entryNo).toBe(999);
 });
});
