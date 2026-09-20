import { describe, it, expect } from 'vitest';
import { exportSave, importSave } from '@/lib/persistence';
function oldExport(state) {
 const json=JSON.stringify(state);let h=0x811c9dc5;
 for(let i=0;i<json.length;i++){h^=json.charCodeAt(i);h=Math.imul(h,0x01000193);}
 return JSON.stringify({version:2,checksum:(h>>>0).toString(16).padStart(8,'0'),size:new Blob([json]).size,state});
}
const base=()=>({gameTime:900,company:{name:'Spedition 🚚 Äöß "Nord"\n'},private:{},vehicles:[],drivers:[],orders:[],meta:{}});
describe('Single serialization save export',()=>{
 it('preserves the exact v2 bytes, UTF-8 size and import compatibility',()=>{
  const state={...base(),special:{text:'\\\u0000\ud800',numbers:[0,-0,NaN,Infinity],missing:undefined},historyArchive:{chunks:[{kind:'orders',data:'embedded',rawBytes:8}]}};
  const original=structuredClone(state),text=exportSave(state);
  expect(text).toBe(oldExport(state));expect(state).toEqual(original);
  const parsed=JSON.parse(text);expect(parsed.size).toBe(new Blob([JSON.stringify(parsed.state)]).size);
  expect(importSave(text).company).toEqual(state.company);
 });
 it('serializes state fields once so checksum and payload describe the same snapshot',()=>{
  let reads=0;const state={...base(),get sample(){return ++reads;}};
  const text=exportSave(state);expect(reads).toBe(1);expect(importSave(text).sample).toBe(1);
 });
 it('still refuses missing archive payloads and non-JSON state',()=>{
  expect(()=>exportSave({...base(),historyArchive:{chunks:[{kind:'orders',key:'external'}]}})).toThrow(/vollständig einbetten/);
  const cycle=base();cycle.self=cycle;expect(()=>exportSave(cycle)).toThrow();
  expect(()=>exportSave({...base(),invalid:1n})).toThrow();
 });
});
