import { describe, it, expect, vi } from 'vitest';
import { initAccounting, postJournal, getAccountBalance, getPnL, getBalanceSheet, getCashFlow, migrateAccounting, book } from '@/lib/simulation/accountingEngine';
import { compactHistory, readArchiveRecords, portableHistory, restoreHistory } from '@/lib/historyArchive';
import { getBranchFinancials } from '@/lib/accountingData';
import { journalPage } from '@/lib/journalQuery';
import { cleanupHistory } from '@/lib/simulation/historyCleanup';

function base(): any {
  const s:any={gameTime:0,company:{accountCents:0},orders:[],vehicles:[{id:'v',branchId:'a'}],drivers:[],employees:[],branches:[{id:'a',status:'active'},{id:'b',status:'active'}],serviceContracts:[]};
  initAccounting(s);s.accounting.migrationDone=true;return s;
}
function entry(s,time,n=100,extra={}) {
 s.gameTime=time;return postJournal(s,{text:'Erlös '+time,vehicleId:'v',...extra,lines:[{account:'1000',debit:n},{account:'4000',credit:n}]});
}
function reports(s) {
 return [0,1,1440,1441,60000,86400,100000,Infinity].map(t=>({bank:getAccountBalance(s,'1000',t),pnl:getPnL(s,0,t),period:getPnL(s,1440,t),balance:getBalanceSheet(s,t),cash:getCashFlow(s,0,t),branch:getBranchFinancials(s,0,t)}));
}
describe('Historisches Finanzjournal',()=>{
 it('erhält Salden, Bilanz, GuV, Zahlungsströme und Filialwerte centgenau an Zeitgrenzen',async()=>{
  const s=base();for(const t of [0,1,1439,1440,1441,59999,60000,86400,100000])entry(s,t);
  postJournal(s,{gameTime:2,text:'Rückdatiert',lines:[{account:'5000',debit:15},{account:'1000',credit:15}]});
  postJournal(s,{gameTime:1440,text:'Anlage',lines:[{account:'1200',debit:20},{account:'1000',credit:20}]});
  postJournal(s,{gameTime:0,text:'Einlage',lines:[{account:'1000',debit:50},{account:'2020',credit:50}]});
  s.gameTime=160000;const before=reports(s),original=structuredClone(s);const compact=await compactHistory(s);
  expect(reports(compact)).toEqual(before);expect(s).toEqual(original);
  expect(compact.accounting.journalProjection.count).toBe(12);
  const rows=[];for(const c of compact.historyArchive.chunks.filter(c=>c.kind==='accountingJournal'))rows.push(...await readArchiveRecords(c,c.data));
  expect([...rows,...compact.accounting.journal].sort((a,b)=>a.entryNo-b.entryNo)).toEqual(s.accounting.journal);
 });
 it('behält Filialumsätze nach Fahrzeugwechsel, Verkauf und Historienbereinigung',async()=>{
  const s=base();entry(s,100,10000);const first=getBranchFinancials(s,0,2000);
  s.vehicles[0].branchId='b';s.vehicles[0].status='sold';s.gameTime=100000;
  cleanupHistory(s,s.gameTime);const archived=await compactHistory(s);
  expect(getBranchFinancials(archived,0,2000).find(r=>r.branch.id==='a').revenue).toBe(first[0].revenue);
 });
 it('erfindet für alte Buchungen ohne Filiale keine heutige Zuordnung',async()=>{
  const s=base();entry(s,100);delete s.accounting.journal[0].branchId;s.gameTime=100000;
  const c=await compactHistory(s);const rows=getBranchFinancials(c,0,1000);
  expect(rows.find(r=>r.branch.id==='__unallocated__').revenue).toBe(100);
  expect(rows.find(r=>r.branch.id==='a').revenue).toBe(0);
 });
 it('rechnet alle Filialkosten inklusive sonstiger Kosten und Korrekturen vollständig ab',()=>{
  const s=base();entry(s,100,10000);postJournal(s,{text:'Werkstatt',vehicleId:'v',lines:[{account:'5300',debit:500},{account:'1000',credit:500}]});
  postJournal(s,{text:'Korrektur',branchId:'a',lines:[{account:'1000',debit:200},{account:'5300',credit:200}]});
  s.branches[0].status='closed';const rows=getBranchFinancials(s,0,1000);
  expect(rows.find(r=>r.branch.id==='a').otherCosts).toBe(300);
  expect(rows.reduce((n,r)=>n+r.profit,0)).toBe(getPnL(s,0,1000).result);
 });
 it('bewahrt stornierbare Vorauszahlungsbelege und archiviert sie erst nach Vertragsende',async()=>{
  const s=base();entry(s,10,100,{sourceEventId:'service'});s.gameTime=100000;
  s.serviceContracts=[{id:'service',startMin:110000,status:'booked'}];let c=await compactHistory(s);
  expect(c.accounting.journal).toHaveLength(1);c.gameTime+=1440;c.serviceContracts[0].status='cancelled';c=await compactHistory(c);
  expect(c.accounting.journal).toHaveLength(0);expect(c.accounting.journalProjection.count).toBe(1);
 });
 it('liefert sämtliche Einzelbelege mit Suche, Kontofilter und stabiler Seitennavigation',async()=>{
  const s=base();for(let i=0;i<123;i++)entry(s,i,100,{text:'Beleg '+i,sourceEventId:i===50?'service':null});
  s.gameTime=100000;s.serviceContracts=[{id:'service',startMin:110000,status:'booked'}];let c=await compactHistory(s);
  entry(c,100001,10,{text:'Neu'});entry(c,1,20,{text:'Nachtrag'});c.gameTime=101500;c=await compactHistory(c);
  const all=[];let before;do{const p=await journalPage({state:c,userId:'test',before});all.push(...p.rows);before=p.before;}while(before!=null);
  expect(all.map(e=>e.entryNo)).toEqual(Array.from({length:125},(_,i)=>125-i));
  const match=await journalPage({state:c,userId:'test',filters:{search:'Beleg 12',account:'4000'}});
  expect(match.rows.map(e=>e.text)).toEqual(['Beleg 122','Beleg 121','Beleg 120','Beleg 12']);
 });
 it('übersteht portable Sicherung und Cache-Neuaufbau ohne doppelte Beträge',async()=>{
  const s=base();entry(s,10);s.gameTime=100000;const c=await compactHistory(s);const expected=reports(c);
  const restored=await restoreHistory(JSON.parse(JSON.stringify(await portableHistory(c))));
  restored.accounting.accountBalances={};restored.accounting.dailySummaryRebuilt=false;migrateAccounting(restored);
  expect(reports(restored)).toEqual(expected);expect(restored.accounting.dailySummary['1'].revenue).toBe(100);
  migrateAccounting(restored);expect(reports(restored)).toEqual(expected);
 });
 it('verändert bei Komprimierungsfehlern weder Originaljournal noch Projektion',async()=>{
  const s=base();entry(s,10);s.gameTime=100000;const original=structuredClone(s);
  const old=globalThis.CompressionStream;vi.stubGlobal('CompressionStream',class{constructor(){throw Error('Speicher voll');}});
  try{await expect(compactHistory(s)).rejects.toThrow('Speicher voll');expect(s).toEqual(original);}finally{vi.stubGlobal('CompressionStream',old);}
 });
 it('erzeugt nach kompletter Archivierung keine zweite Eröffnungsbilanz',async()=>{
  const s=base();entry(s,10);s.accounting.migrationDone=false;s.accounting.historyChecked=false;s.gameTime=100000;
  const c=await compactHistory(s);migrateAccounting(c);
  expect(c.accounting.journal).toHaveLength(0);expect(c.company.accountCents).toBe(100);
  expect(c.accounting.historyIncompleteBeforeMin).toBe(null);
 });
 it('lehnt Sicherungen mit fehlenden Finanzblöcken ab',async()=>{
  const s=base();entry(s,10);s.gameTime=100000;const c=await compactHistory(s);
  c.historyArchive.chunks=[];await expect(restoreHistory(c)).rejects.toThrow(/unvollständig/);
 });
 it('übernimmt explizite Filialzuordnung aus Buchungsvorlagen auch bei Rückdatierung',()=>{
  const s=base();s.gameTime=500;book(s,'revenue_immediate',{paymentCents:100,customer:'Test',branchId:'a',gameTime:1});
  expect(s.accounting.journal[0].branchId).toBe('a');
 });
});


it('reduces an already checked legacy snapshot immediately, retains the exact seven-day boundary and pinned reversals', async () => {
 const s=base(), day=1440;
 entry(s,1,100,{sourceEventId:'service'});
 entry(s,3*day-1,200);
 entry(s,3*day,300);
 entry(s,10*day,400);
 s.gameTime=10*day;
 s.serviceContracts=[{id:'service',startMin:11*day,status:'booked'}];
 s.historyArchive={version:1,checkedDay:10,chunks:[]};
 const before=reports(s);
 const c=await compactHistory(s);
 expect(c.accounting.journal.map(e=>e.gameTime)).toEqual([1,3*day,10*day]);
 expect(c.accounting.journalProjection.count).toBe(1);
 expect(reports(c)).toEqual(before);
 expect(await compactHistory(c)).toBe(c);
 const portable=await portableHistory(c);
 const restored=await restoreHistory(JSON.parse(JSON.stringify(portable)));
 expect(reports(restored)).toEqual(before);
 const page=await journalPage({state:restored,userId:'test'});
 expect(page.rows).toEqual([...s.accounting.journal].reverse());
});

it('archives a released cancellation source on the next day without changing historic amounts', async () => {
 const s=base();entry(s,1,100,{sourceEventId:'service'});
 s.gameTime=10*1440;s.serviceContracts=[{id:'service',startMin:11*1440,status:'booked'}];
 let c=await compactHistory(s);expect(c.accounting.journal).toHaveLength(1);
 c.serviceContracts[0].status='cancelled';c.gameTime+=1440;
 const expected=reports(c);c=await compactHistory(c);
 expect(c.accounting.journal).toHaveLength(0);expect(reports(c)).toEqual(expected);
});
