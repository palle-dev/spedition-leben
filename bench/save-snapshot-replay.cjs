// Local, read-only save replay. No cloud calls, production writes or publishing.
// node bench/save-snapshot-replay.cjs --save /private/export.json --output /tmp/save-snapshot-metrics.json
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
async function main(){
 const state=JSON.parse(fs.readFileSync(save,'utf8')).state;applyCommand(state,'advanceTime',{minutes:0});
 const packed=await compactHistory(state);
 const stored=writeHistoryBlocks({put:()=>{}},'replay',packed);
 const {cloneSaveSnapshot,freezeFinancialSnapshot,withoutCold}=require(path.join(root,'src/lib/simulationTransport.js'));
 freezeFinancialSnapshot(stored);
 const metrics=[];
 for(const [version,clone] of [['before',structuredClone],['after',cloneSaveSnapshot]]){
  const samples=[];let copy;
  for(let i=0;i<9;i++){const t=performance.now();copy=clone(stored);samples.push(performance.now()-t);assert.deepEqual(copy,stored);}
  samples.sort((a,b)=>a-b);
  metrics.push({version,medianMs:samples[4],minMs:samples[0],maxMs:samples[8],clonedLogicalJsonBytes:Buffer.byteLength(JSON.stringify(version==='before'?stored:withoutCold(stored)))});
 }
 const copy=cloneSaveSnapshot(stored),expected=structuredClone(stored);
 stored.gameTime++;stored.company.name='changed after capture';stored.accounting.journal=[];
 assert.deepEqual(copy,expected);
 const report={node:process.version,samplesPerVersion:9,metrics,identicalSnapshots:true,isolatedFromLaterChanges:true,limits:'Private save copy. Node structuredClone microbenchmark of snapshot capture only, no browser UI, IndexedDB, cloud or day simulation timing. Immutable financial trees are shared only within the JS process; persistence/transport still serialize complete values. Logical JSON bytes are not heap measurements. Cold/imported states use full clone.'};
 fs.writeFileSync(arg('--output','/tmp/save-snapshot-metrics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
