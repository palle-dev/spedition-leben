import {describe,it,expect,vi} from 'vitest';
import {exportSave,importSave} from '@/lib/persistence';
const state=()=>({gameTime:900,company:{name:'Original'},private:{},vehicles:[],drivers:[],orders:[{id:'order',cargo:{tons:3}}],meta:{partyId:'foreign',ownerId:'other',owner_id:'other',cloudId:'cloud'},timeControl:{enabled:true}});
describe('Import owns its freshly parsed state',()=>{
 it('keeps source and independent imports isolated while resetting identity and live time',()=>{
  vi.spyOn(Date,'now').mockReturnValue(1800000000000);
  try{
   const original=state(),saved=structuredClone(original),text=exportSave(original),a=importSave(text),b=importSave(text);
   expect(a).toEqual(b);expect(a.timeControl.enabled).toBe(false);expect(a.meta).toEqual({cloudId:null,importedAt:1800000000000});
   a.orders[0].cargo.tons=9;a.company.name='Changed';expect(b.orders[0].cargo.tons).toBe(3);expect(b.company.name).toBe('Original');expect(original).toEqual(saved);expect(exportSave(original)).toBe(text);
  }finally{vi.restoreAllMocks();}
 });
 it('rejects corrupt checksums and sizes before returning an imported state',()=>{
  const original=state(),text=exportSave(original),bad=JSON.parse(text);bad.state.company.name='Tampered';expect(()=>importSave(JSON.stringify(bad))).toThrow(/Prüfsumme/);
  const size=JSON.parse(text);size.size++;expect(()=>importSave(JSON.stringify(size))).toThrow(/Größenprüfung/);expect(importSave(text).company.name).toBe('Original');
 });
 it('rejects invalid privately parsed state without changing the original',()=>{
  const original={...state(),branches:{invalid:true}},saved=structuredClone(original);expect(()=>importSave(exportSave(original))).toThrow(/ungültiges Format/);expect(original).toEqual(saved);
 });
});
