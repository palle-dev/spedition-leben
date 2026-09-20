import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { retainLatestHistory, preserveHistory } from '@/lib/simulation/historyRetention';
import { cleanupHistory } from '@/lib/simulation/historyCleanup';
import { addBooking } from '@/lib/simulation/accountingEngine';
import { compactHistory, readArchiveRecords, portableHistory } from '@/lib/historyArchive';

let records, fail, writes;
beforeEach(() => {
  vi.resetModules(); records=new Map(); fail=false; writes=0;
  const db={transaction(){
    const pending=[];let aborted=false;
    const tx:any={abort(){aborted=true;tx.error=Error('aborted');tx.onabort?.();},objectStore:()=>({
      put(value,key){pending.push(()=>{writes++;records.set(key,structuredClone(value));});},
      get(key){const req:any={};setTimeout(()=>{req.result=structuredClone(records.get(key));req.onsuccess?.();},0);return req;},
      delete(key){pending.push(()=>records.delete(key));},
    })};
    setTimeout(()=>{if(aborted)return;if(fail){tx.error=Error('QuotaExceededError');tx.onabort?.();return;}pending.forEach(f=>f());tx.oncomplete?.();},0);return tx;
  }};
  vi.stubGlobal('indexedDB',{open(){const req:any={};setTimeout(()=>{req.result=db;req.onsuccess?.();},0);return req;}});
  vi.stubGlobal('localStorage',{getItem:()=>null});
});
afterEach(()=>vi.unstubAllGlobals());
const base=()=>({gameTime:60000,meta:{partyId:'party'},company:{accountCents:100000},private:{},vehicles:[],drivers:[],orders:[],trips:[],tours:[],appointments:[],events:[],bookings:[]});
async function sample(n=120){const s:any=base();preserveHistory(s,'bookings',Array.from({length:n},(_,i)=>({id:'b'+i,text:'Buchung '+i,amountCents:i})));return compactHistory(s);}

it('bewahrt auch innerhalb eines Befehls erzeugte und abgeschnittene Buchungen',()=>{
 const s:any=base();for(let i=0;i<300;i++)addBooking(s,s.gameTime,'Buchung '+i,1,'company','ref'+i);
 expect(s.bookings).toHaveLength(200);expect(s.historyOutbox).toHaveLength(100);
 expect(s.historyOutbox[0].data.cause).toBe('Buchung 0');expect(s.historyOutbox[99].data.cause).toBe('Buchung 99');
});
it('bewahrt entfernte Originale einschließlich Mail-Verknüpfungen',()=>{
 const s:any=base();s.orders=[{id:'old',status:'geliefert',deliveredAtMin:1},{id:'open',status:'angenommen'}];
 s.trips=[{id:'trip',status:'completed',endMin:1,orderId:'old'}];
 s.accounting={receipts:Array.from({length:205},(_,i)=>({id:'r'+i}))};
 s.mail={messages:Array.from({length:305},(_,i)=>({id:'m'+i,read:true})),conversations:[{id:'c',messageIds:['m0','m304']}],staffTasks:[]};
 cleanupHistory(s,s.gameTime);
 expect(s.orders.map(x=>x.id)).toEqual(['open']);
 expect(s.historyOutbox.find(x=>x.kind==='orders').data.id).toBe('old');
 expect(s.historyOutbox.filter(x=>x.kind==='receipts')).toHaveLength(5);
 expect(s.historyOutbox.filter(x=>x.kind==='mailMessages')).toHaveLength(5);
 expect(s.historyOutbox.find(x=>x.kind==='mailConversationVersions').data.messageIds).toEqual(['m0','m304']);
});
it('Archivkopien ändern sich nicht mit nachträglichen Objektmutationen',()=>{
 const s:any=base(),r={id:'x',nested:{value:1}};retainLatestHistory(s,'events',[r,{id:'keep'}],1);r.nested.value=9;
 expect(s.historyOutbox[0].data.nested.value).toBe(1);expect(s.idCounter).toBeUndefined();
});
it('trennt Blöcke vom aktiven Zustand und lädt sie benutzergetrennt',async()=>{
 const repo=await import('@/lib/historyRepository'),packed=await sample();const active=await repo.stageHistory('alice',packed);
 expect(active.historyArchive.storage).toBe('indexeddb');expect(active.historyArchive.chunks[0].data).toBeUndefined();
 expect(await readArchiveRecords(active.historyArchive.chunks[0],await repo.readHistoryBlock('alice',active.historyArchive.chunks[0]))).toHaveLength(120);
 await expect(repo.readHistoryBlock('bob',active.historyArchive.chunks[0])).rejects.toThrow(/fehlt/);
 const count=writes;expect(await repo.stageHistory('alice',active)).toBe(active);expect(writes).toBe(count);
});
it('bestätigt bei Quotenfehlern weder neue Blöcke noch einen neuen Speicherstand',async()=>{
 const repo=await import('@/lib/historyRepository'),p=await import('@/lib/persistence');
 await p.saveCurrent('alice',base());const before=structuredClone(records);const packed=await sample();fail=true;
 await expect(repo.stageHistory('alice',packed)).rejects.toThrow('QuotaExceededError');
 await expect(p.saveCurrent('alice',packed)).rejects.toThrow('QuotaExceededError');
 expect(records).toEqual(before);expect(packed.historyArchive.chunks[0].data).toBeInstanceOf(Blob);
});
it('speichert neue Originalblöcke und Snapshot zusammen; ältere Slots bleiben lesbar',async()=>{
 const p=await import('@/lib/persistence'),repo=await import('@/lib/historyRepository');const packed=await sample();
 await p.saveManualSlot('alice','alt',packed);const older=await p.loadManualSlot('alice','alt',false);
 expect(older.historyArchive.chunks[0].data).toBeUndefined();
 const next:any={...older,gameTime:older.gameTime+1440};preserveHistory(next,'events',[{id:'next'}]);await p.saveCurrent('alice',await compactHistory(next));
 const reload=await p.loadManualSlot('alice','alt',false);expect(reload.historyArchive.chunks).toHaveLength(1);
 expect((await repo.hydrateHistory('alice',reload)).historyArchive.chunks[0].data).toBeInstanceOf(Blob);
});
it('liefert Seiten ohne doppelte Originale und sucht auch ältere archivierte Felder',async()=>{
 const repo=await import('@/lib/historyRepository'),{runSaveFileTask}=await import('@/lib/saveFileTasks');
 const active=await repo.stageHistory('alice',await sample(123));let cursor=null;const all=[];
 do{const page=await runSaveFileTask('historyPage',{state:active,userId:'alice',cursor});all.push(...page.rows);cursor=page.cursor;}while(cursor);
 expect(all).toHaveLength(123);expect(new Set(all.map(x=>x.record.data.id)).size).toBe(123);
 const match=await runSaveFileTask('historyPage',{state:active,userId:'alice',kind:'history:bookings',search:'Buchung 122'});
 expect(match.rows.map(x=>x.record.data.id)).toEqual(['b122']);
});
it('exportiert getrennte Archive vollständig und importiert sie in ein anderes Konto',async()=>{
 const repo=await import('@/lib/historyRepository'),{runSaveFileTask}=await import('@/lib/saveFileTasks');
 const active=await repo.stageHistory('alice',await sample());const file=await runSaveFileTask('export',await repo.hydrateHistory('alice',active));
 const imported=await runSaveFileTask('import',file);expect(imported.meta.partyId).toBeUndefined();
 const other=await repo.stageHistory('bob',imported,true);
 expect((await runSaveFileTask('historyPage',{state:other,userId:'bob'})).rows).toHaveLength(50);
});
it('lehnt fehlende Verweise beim Laden und manipulierte Archivdaten beim Abrufen ab',async()=>{
 const repo=await import('@/lib/historyRepository'),{runSaveFileTask}=await import('@/lib/saveFileTasks');
 const active=await repo.stageHistory('alice',await sample());const chunk=active.historyArchive.chunks[0];
 await expect(repo.stageHistory('bob',active,true)).rejects.toThrow(/fehlt/);
 const key='user_alice:history_'+chunk.id,record=records.get(key);const bytes=new Uint8Array(await record.data.arrayBuffer());bytes[bytes.length-1]^=1;record.data=new Blob([bytes]);
 await expect(runSaveFileTask('historyPage',{state:active,userId:'alice'})).rejects.toThrow(/Prüfsumme/);
});
it('speichert neue Outbox-Daten auch bei schon erfolgter täglicher Kompaktierung',async()=>{
 const s=await sample(1);preserveHistory(s,'events',[{id:'same-day'}]);const next=await compactHistory(s);
 expect(next.historyOutbox).toEqual([]);expect(next.historyArchive.chunks).toHaveLength(2);
 const wire=await portableHistory(next);expect(wire.historyArchive.storage).toBeUndefined();
});
