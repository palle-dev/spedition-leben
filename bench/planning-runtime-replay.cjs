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
const js=require.extensions['.js'];require.extensions['.js']=(mod,file)=>(file.startsWith(path.join(root,'src')) || file.includes('/before/src/'))?load(mod,file):js(mod,file);
const {compactHistory}=require(path.join(root,'src/lib/historyArchive.js'));
const {writeHistoryBlocks}=require(path.join(root,'src/lib/historyRepository.js'));
const {applyCommand}=require(path.join(root,'src/lib/simulation/simulationEngine.ts'));
const old=arg('--baseline');if(!old)throw Error('Explicit --baseline required');
const baseline=require(path.resolve(old,'simulationEngine.ts'));
async function main(){
 Date.now=()=>1800000000000;
 let initial=JSON.parse(fs.readFileSync(save,'utf8')).state;
 baseline.applyCommand(initial,'advanceTime',{minutes:0});initial=await compactHistory(initial);
 initial=writeHistoryBlocks({put(){}},'benchmark',initial);
 const rows=[];let before=structuredClone(initial),after=structuredClone(initial);
 for(const minutes of [60,1440,1440,1440]){
  let t=performance.now();baseline.applyCommand(before,'advanceTime',{minutes,silentPhoneAdvance:true});const baselineMs=performance.now()-t;
  t=performance.now();applyCommand(after,'advanceTime',{minutes,silentPhoneAdvance:true});const engineMs=performance.now()-t;
  assert.deepEqual(after,before);
  const row={minutes,gameTime:after.gameTime,baselineMs,engineMs,exactStateEquality:true};rows.push(row);console.log(JSON.stringify(row));
  // Identical adapter retention between commands, excluding IndexedDB time.
  before=await compactHistory(before);after=await compactHistory(after);
  before=writeHistoryBlocks({put(){}},'benchmark',before);after=writeHistoryBlocks({put(){}},'benchmark',after);
  assert.deepEqual(after,before);
 }
 const report={node:process.version,vehicles:initial.vehicles.filter(v=>!['sold','archived'].includes(v.status)).length,branches:initial.branches.length,rows,measurement:'Single sequential controlled engine comparisons on a copied real save. Entire state deeply equal, including RNG, booking rows, decisions and retention queues; no production writes. Browser, worker transport, persistence and rendering excluded. No 250-truck or thousands-of-days guarantee.'};
 fs.writeFileSync(arg('--output','/tmp/runtime-metrics.json'),JSON.stringify(report,null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1});
