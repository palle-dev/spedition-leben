// Local, read-only save replay. No cloud calls, production writes or publishing.
// node bench/planning-pool-replay.cjs --save /private/export.json --baseline /path/to/old/src/lib/simulation --output /tmp/history-metrics.json
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const ts=require('typescript');
const {performance}=require('node:perf_hooks');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};
const save=arg('--save');if(!save)throw Error('Explicit --save required');
const root=path.resolve(__dirname,'..'),resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
 if(request.startsWith('@/'))request=path.join(root,'src',request.slice(2));
 if(!path.extname(request)&&fs.existsSync(request+'.ts'))request+='.ts';
 return resolve.call(this,request,parent,...rest);
};
const load=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:file
}).outputText,file);
require.extensions['.ts']=load;
const js=require.extensions['.js'];require.extensions['.js']=(mod,file)=>(file.startsWith(path.join(root,'src')) || file.includes('/before/src/'))?load(mod,file):js(mod,file);
const {compactHistory,archiveStats,readArchiveRecords}=require(path.join(root,'src/lib/historyArchive.js'));
const {writeHistoryBlocks}=require(path.join(root,'src/lib/historyRepository.js'));
const {applyCommand}=require(path.join(root,'src/lib/simulation/simulationEngine.ts'));
const finance=require(path.join(root,'src/lib/simulation/accountingEngine.ts'));
const old=arg('--baseline');if(!old)throw Error('Explicit --baseline required');
const baseline=require(path.resolve(old,'simulationEngine.ts'));
const oldFinance=require(path.resolve(old,'accountingEngine.ts'));
const {compactHistory:baselineCompact}=require(path.resolve(old,'../historyArchive.js'));
function reports(s,f){return [0,1440,43200,86400,129600,s.gameTime].map(t=>({pnl:f.getPnL(s,0,t),balance:f.getBalanceSheet(s,t),cash:f.getCashFlow(s,0,t),period:f.getPnL(s,Math.max(0,t-43200),t)}));}
async function main(){
 Date.now=()=>1800000000000;
 const original=JSON.parse(fs.readFileSync(save,'utf8')).state;
 const before=structuredClone(original);let after=structuredClone(original);

 baseline.applyCommand(before,'advanceTime',{minutes:0});applyCommand(after,'advanceTime',{minutes:0});
 Object.assign(before,await baselineCompact(before));
 const expected=reports(before,oldFinance);
 const t=performance.now();after=await compactHistory(after);const initialCompactionMs=performance.now()-t;
 assert.deepEqual(reports(after,finance),expected);
 const blocks=new Map();const store={put:(v,k)=>blocks.set(k,v)};
 after=writeHistoryBlocks(store,'replay',after);
 const initial={rawExportStateBytes:Buffer.byteLength(JSON.stringify(original)),beforeJournalRows:before.accounting.journal.length,activeJournalRows:after.accounting.journal.length,archivedJournalRows:after.accounting.journalProjection?.count||0,projectionBytes:Buffer.byteLength(JSON.stringify(after.accounting.journalProjection)),beforeActiveBytes:Buffer.byteLength(JSON.stringify(before)),afterActiveBytes:Buffer.byteLength(JSON.stringify(after)),initialCompactionMs};
 const days=[];
 for(let day=1;day<=3;day++){
  let t=performance.now();baseline.applyCommand(before,'advanceTime',{minutes:1440,silentPhoneAdvance:true});const baselineMs=performance.now()-t;
  t=performance.now();applyCommand(after,'advanceTime',{minutes:1440,silentPhoneAdvance:true});const engineMs=performance.now()-t;
  assert.deepEqual(reports(after,finance),reports(before,oldFinance));
  for(const key of Object.keys(before)) {
   if(['historyArchive','accounting'].includes(key))continue;
   assert.deepEqual(after[key],before[key],key);
 }
 const operationalAccounting=s=>Object.fromEntries(Object.entries(s.accounting).filter(([k])=>!['journal','journalProjection'].includes(k)));
 assert.deepEqual(operationalAccounting(after),operationalAccounting(before));
  const delivered=s=>s.orders.filter(o=>o.status==='geliefert').map(o=>({id:o.id,paidCents:o.paidCents,at:o.deliveredAtMin}));
  assert.deepEqual(delivered(after),delivered(before));
  t=performance.now();after=await compactHistory(after);const compressionMs=performance.now()-t;
  after=writeHistoryBlocks(store,'replay',after);
  Object.assign(before,await baselineCompact(before));
  assert.deepEqual(reports(after,finance),reports(before,oldFinance));
  const row={day,gameTime:after.gameTime,baselineMs,engineMs,compressionMs,activeJournalRows:after.accounting.journal.length,archivedJournalRows:after.accounting.journalProjection.count,equalFinancialReports:true,equalCompanyPeopleFleetAndDeliveredOrders:true};days.push(row);console.log(JSON.stringify(row));
 }
 const originals=[];
 for(const c of after.historyArchive.chunks.filter(c=>c.kind==='accountingJournal')) originals.push(...await readArchiveRecords(c,blocks.get('user_replay:history_'+c.id).data));
 originals.push(...after.accounting.journal);originals.sort((a,b)=>a.entryNo-b.entryNo);
 assert.equal(new Set(originals.map(e=>e.entryNo)).size,originals.length);
 // All historical originals pre-dating the implementation stay byte-equivalent.
 const initialIds=new Set(original.accounting.journal.map(e=>e.entryNo));
 assert.deepEqual(originals.filter(e=>initialIds.has(e.entryNo)),original.accounting.journal);
 const report={node:process.version,activeVehicles:original.vehicles.filter(v=>!['sold','archived'].includes(v.status)).length,branches:original.branches.length,initial,days,originalJournalEntriesPreserved:initialIds.size,totalJournalRows:originals.length,activeBytes:Buffer.byteLength(JSON.stringify(after)),archive:archiveStats(after),measurement:'Local controlled engine comparison on copied save. Financial reports and listed business fields compared, all original pre-existing journal entries verified. No browser/IndexedDB/network timing, no production writes. Baseline/current retain seven days of journal originals. All fields except archive descriptor arrays and journal/projection compared, with exact finance/original-journal verification. All operational fields including tours, history outbox and sequence compared. Not a long-term or 250-truck proof.'};
 fs.writeFileSync(arg('--output','/tmp/finance-metrics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
