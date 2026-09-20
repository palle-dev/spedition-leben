import { afterEach, expect, it, vi } from 'vitest';
const mock=vi.hoisted(()=>({run:vi.fn(),cache:vi.fn(()=>vi.fn())}));
vi.mock('@/lib/saveFileTasks',()=>({runSaveFileTask:mock.run}));
vi.mock('@/lib/historyReadCache',()=>({createHistoryReadCache:mock.cache}));
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();vi.clearAllMocks();});
it('serializes requests and supplies the same reader to both query types',async()=>{
 const self:any={postMessage:vi.fn()};vi.stubGlobal('self',self);
 await import('../src/lib/historyQueryWorker');
 let release;mock.run.mockImplementationOnce(()=>new Promise(r=>{release=r})).mockResolvedValueOnce({rows:['second']});
 const first=self.onmessage({data:{id:1,command:'historyPage',input:{}}});
 await Promise.resolve();
 const second=self.onmessage({data:{id:2,command:'journalPage',input:{}}});
 expect(mock.run).toHaveBeenCalledTimes(1);
 release({rows:['first']});await first;await second;
 expect(mock.run.mock.calls[0][2]).toBe(mock.run.mock.calls[1][2]);
 expect(self.postMessage.mock.calls.map(c=>c[0])).toEqual([{id:1,result:{rows:['first']}},{id:2,result:{rows:['second']}}]);
});
it('rejects mutations without invoking a task and continues after a query error',async()=>{
 const self:any={postMessage:vi.fn()};vi.stubGlobal('self',self);
 await import('../src/lib/historyQueryWorker');
 await self.onmessage({data:{id:1,command:'import',input:{}}});
 expect(mock.run).not.toHaveBeenCalled();
 mock.run.mockRejectedValueOnce(Error('damaged')).mockResolvedValueOnce({rows:[]});
 await self.onmessage({data:{id:2,command:'historyPage',input:{}}});
 await self.onmessage({data:{id:3,command:'journalPage',input:{}}});
 expect(self.postMessage.mock.calls[1][0]).toEqual({id:2,error:'damaged'});
 expect(self.postMessage.mock.calls[2][0]).toEqual({id:3,result:{rows:[]}});
});
