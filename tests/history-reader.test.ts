import { afterEach, expect, it, vi } from 'vitest';
import { createHistoryReadCache } from '@/lib/historyReadCache';
import { createHistoryQueryClient } from '@/lib/historyQueryClient';
afterEach(()=>vi.useRealTimers());
const chunk=(id='a')=>({id,kind:'history:test',rawBytes:10,count:1});
it('reuses verified immutable records, makes them read-only and isolates owners',async()=>{
 const load=vi.fn(async()=>new Blob()),decode=vi.fn(async()=>[{nested:{value:1}}]);
 const read=createHistoryReadCache({load,decode});
 const a=await read('u',chunk());expect(await read('u',chunk())).toBe(a);
 expect(load).toHaveBeenCalledTimes(1);expect(Object.isFrozen(a[0].nested)).toBe(true);
 await read('other',chunk());await read('u',chunk());expect(load).toHaveBeenCalledTimes(3);
});
it('revalidates inline payloads and changed descriptors',async()=>{
 const load=vi.fn(async()=>new Blob()),decode=vi.fn(async()=>[{}]),read=createHistoryReadCache({load,decode});
 await read('u',chunk());await read('u',{...chunk(),count:2});
 for(let i=0;i<2;i++)await read('u',{...chunk(),data:new Blob()});
 expect(decode).toHaveBeenCalledTimes(4);
});
it('does not cache failed checks or oversized blocks',async()=>{
 const load=vi.fn(async()=>new Blob()),decode=vi.fn(async()=>[{}]);
 const read=createHistoryReadCache({load,decode,maxBytes:5});
 await read('u',chunk());await read('u',chunk());expect(load).toHaveBeenCalledTimes(2);
 decode.mockRejectedValueOnce(Error('checksum'));await expect(read('u',chunk())).rejects.toThrow('checksum');
 await read('u',chunk());expect(load).toHaveBeenCalledTimes(4);
});
it.each([{maxBytes:15},{maxRows:1},{maxChunks:1}])('evicts bounded LRU entries: %j',async limits=>{
 const load=vi.fn(async()=>new Blob()),decode=vi.fn(async()=>[{}]),read=createHistoryReadCache({load,decode,...limits});
 await read('u',chunk('a'));await read('u',chunk('b'));await read('u',chunk('b'));await read('u',chunk('a'));
 expect(load).toHaveBeenCalledTimes(3);
});
function harness(){
 const workers:any[]=[];
 const client=createHistoryQueryClient(()=>{const w={postMessage:vi.fn(),terminate:vi.fn(),onmessage:null,onerror:null,onmessageerror:null};workers.push(w);return w;},100);
 const input={userId:'u',sessionGeneration:1};
 const reply=(w,id,result)=>w.onmessage({data:{id,result}});
 return {client,workers,input,reply};
}
it('reuses its worker and routes concurrent responses by request ID',async()=>{
 vi.useFakeTimers();const {client,workers,input,reply}=harness();
 const a=client.execute('historyPage',input),b=client.execute('journalPage',input);
 expect(workers).toHaveLength(1);reply(workers[0],2,'second');reply(workers[0],1,'first');
 expect(await a).toBe('first');expect(await b).toBe('second');client.reset();
});
it.each(['owner','generation','reset'])('rejects pending work on %s change and ignores stale messages',async mode=>{
 vi.useFakeTimers();const {client,workers,input,reply}=harness();
 const a=client.execute('historyPage',input),rejected=expect(a).rejects.toThrow('gewechselt');
 if(mode==='reset')client.reset();
 const b=client.execute('historyPage',{...input,userId:mode==='owner'?'other':'u',sessionGeneration:mode==='generation'?2:1});
 await rejected;reply(workers[0],1,'stale');reply(workers[1],2,'fresh');
 expect(await b).toBe('fresh');expect(workers[0].terminate).toHaveBeenCalledTimes(1);client.reset();
});
it('terminates after idle time, but never while a query is pending',async()=>{
 vi.useFakeTimers();const {client,workers,input,reply}=harness();
 const a=client.execute('historyPage',input);vi.advanceTimersByTime(1000);expect(workers[0].terminate).not.toHaveBeenCalled();
 reply(workers[0],1,[]);await a;vi.advanceTimersByTime(100);expect(workers[0].terminate).toHaveBeenCalledTimes(1);
 const b=client.execute('historyPage',input);expect(workers).toHaveLength(2);reply(workers[1],2,[]);await b;client.reset();
});
it('rejects worker errors and creates a fresh worker for the next query',async()=>{
 vi.useFakeTimers();const {client,workers,input,reply}=harness();
 const a=client.execute('historyPage',input),rejected=expect(a).rejects.toThrow('broken');
 workers[0].onerror({message:'broken'});await rejected;
 const b=client.execute('journalPage',input);reply(workers[1],2,[]);await b;client.reset();
});
it('does not accept mutation or import commands',async()=>{
 const {client,workers,input}=harness();
 await expect(client.execute('import',input)).rejects.toThrow('Unzulässige');
 expect(workers).toHaveLength(0);
});
