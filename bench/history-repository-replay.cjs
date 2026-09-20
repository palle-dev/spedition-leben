// Local, read-only save replay. No cloud calls, production writes or publishing.
// node bench/history-repository-replay.cjs --save /private/export.json --baseline /path/to/old/src/lib/simulation --output /tmp/history-metrics.json
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
const js=require.extensions['.js'];require.extensions['.js']=(mod,file)=>file.startsWith(path.join(root,'src'))?load(mod,file):js(mod,file);
const {compactHistory,archiveStats}=require(path.join(root,'src/lib/historyArchive.js'));
const {writeHistoryBlocks}=require(path.join(root,'src/lib/historyRepository.js'));
const {applyCommand}=require(path.join(root,'src/lib/simulation/simulationEngine.ts'));
const old=arg('--baseline');if(!old)throw Error('Explicit --baseline required');
const {applyCommand:baselineApply}=require(path.resolve(old,'simulationEngine.ts'));
function normalized(s){const c={...s};delete c.historyOutbox;delete c.historySequence;delete c.historyArchive;return c;}
async function main(){
 Date.now=()=>1800000000000;
 const original=JSON.parse(fs.readFileSync(save,'utf8')).state;
 const initial=await compactHistory(original),before=structuredClone(initial);
 const blocks=new Map();const store={put:(v,k)=>blocks.set(k,v)};
 let after=writeHistoryBlocks(store,'replay',structuredClone(initial));const days=[];
 for(let day=1;day<=3;day++){
  let t=performance.now();baselineApply(before,'advanceTime',{minutes:1440,silentPhoneAdvance:true});const baselineMs=performance.now()-t;
  t=performance.now();applyCommand(after,'advanceTime',{minutes:1440,silentPhoneAdvance:true});const engineMs=performance.now()-t;
  assert.deepEqual(normalized(after),normalized(before));
  const originalRows=after.historyOutbox.length;t=performance.now();after=await compactHistory(after);const compressionMs=performance.now()-t;
  after=writeHistoryBlocks(store,'replay',after);
  // Baseline adapter would apply the same expired-offer/task retention.
  const refreshed=await compactHistory(before);Object.assign(before,refreshed);
  assert.deepEqual(normalized(after),normalized(before));
  assert(after.historyArchive.chunks.every(c=>c.data===undefined));
  const row={day,gameTime:after.gameTime,baselineMs,engineMs,compressionMs,newRetainedOriginalRows:originalRows,archive:archiveStats(after),sameGameState:true};days.push(row);console.log(JSON.stringify(row));
 }
 const report={baselineEngine:require('node:path').basename(old),node:process.version,activeVehicles:original.vehicles.filter(v=>!['sold','archived'].includes(v.status)).length,branches:original.branches.length,days,
 activeBytes:Buffer.byteLength(JSON.stringify(after)),immutableBlocks:blocks.size,blobBytes:[...blocks.values()].reduce((n,b)=>n+b.data.size,0),allHistoryOutsideActiveState:after.historyArchive.chunks.every(c=>c.data===undefined),
 measurement:'Engine and compression on private local copies; no browser, IndexedDB, cloud or production writes. In-memory immutable block adapter checks references only. Not a 1000-truck or 10000-day test.'};
 fs.writeFileSync(arg('--output','/tmp/history-metrics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
