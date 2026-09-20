import { describe, it, expect, vi } from 'vitest';
import { compactHistory, portableHistory, restoreHistory, readArchiveRecords } from '@/lib/historyArchive';
async function fixture() {
 return compactHistory({gameTime:14400,orders:Array.from({length:2001},(_,i)=>({id:'offer-'+i,status:'expired',acceptDeadlineMin:1,cargo:'Ä 🚚 '+i}))});
}
describe('Archive export reads each block once',()=>{
 it('preserves original records and base64 with a single read per block',async()=>{
  const source=await fixture(),chunks=source.historyArchive.chunks;
  const expected=await Promise.all(chunks.map(async c=>Buffer.from(await c.data.arrayBuffer()).toString('base64')));
  const spies=chunks.map(c=>vi.spyOn(c.data,'arrayBuffer'));
  try{
   const portable=await portableHistory(source);
   expect(portable.historyArchive.chunks.map(c=>c.data)).toEqual(expected);
   for(const spy of spies)expect(spy).toHaveBeenCalledTimes(1);
   const restored=await restoreHistory(portable);
   const rows=(await Promise.all(restored.historyArchive.chunks.map(c=>readArchiveRecords(c,c.data)))).flat();
   expect(rows).toHaveLength(2001);expect(rows[0].id).toBe('offer-0');expect(rows[2000].id).toBe('offer-2000');
   expect(source.historyArchive.chunks).toBe(chunks);for(const c of chunks)expect(c.data).toBeInstanceOf(Blob);
  }finally{vi.restoreAllMocks();}
 });
 it('loads only unacknowledged external blocks and keeps reference semantics',async()=>{
  const source=await fixture(),chunks=source.historyArchive.chunks;
  const external={...source,historyArchive:{...source.historyArchive,storage:'indexeddb',chunks:chunks.map(({data,...c})=>c)}};
  const loadBlock=vi.fn(async c=>chunks.find(x=>x.id===c.id).data);
  const result=await portableHistory(external,{references:new Set([chunks[0].id]),loadBlock});
  expect(loadBlock).toHaveBeenCalledTimes(2);expect(result.historyArchive.chunks[0].data).toBeUndefined();
  expect(result.historyArchive.chunks.slice(1).every(c=>typeof c.data==='string')).toBe(true);expect(result.historyArchive.storage).toBeUndefined();expect(external.historyArchive.storage).toBe('indexeddb');
 });
 it('rejects corrupt or missing data without replacing original blocks',async()=>{
  const source=await fixture(),original=source.historyArchive.chunks;
  await expect(portableHistory(source,{loadBlock:async()=>new Blob(['corrupt'])})).rejects.toThrow(/Prüfsumme/);
  await expect(portableHistory(source,{loadBlock:async()=>null})).rejects.toThrow(/Archivdaten fehlen/);
  expect(source.historyArchive.chunks).toBe(original);
 });
});
