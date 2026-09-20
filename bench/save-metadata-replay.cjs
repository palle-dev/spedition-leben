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
async function main(){
 const state=JSON.parse(fs.readFileSync(save,'utf8')).state;applyCommand(state,'advanceTime',{minutes:0});
 const packed=await compactHistory(state);
 const stored=writeHistoryBlocks({put:()=>{}},'replay',packed);
 const records=new Map();let reads=[];
 const db={transaction:()=>({objectStore:()=>({get:key=>{
  const req={};queueMicrotask(()=>{reads.push(key);req.result=structuredClone(records.get(key));req.onsuccess()});return req;
 }})})};
 global.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result=db;req.onsuccess()});return req}};
 const current=require(path.join(root,'src/lib/persistence.js'));
 const previous=require(path.resolve(arg('--baseline'),'persistence.js'));
 for(let i=0;i<3;i++){
  const key='user_replay:autosave_'+i;
  records.set(key,{state:stored,savedAt:1800000000000+i});
  records.set('snapshot_metadata:'+key,{format:'snapshot-meta-v1',savedAt:1800000000000+i});
 }
 const metrics=[];let expected;
 for(const [version,api] of [['before',previous],['after',current]]){
  reads=[];const t=performance.now(),result=await api.getAllAutosaveMetas('replay',false),ms=performance.now()-t;
  if(expected)assert.deepEqual(result,expected);else expected=result;
  metrics.push({version,readCount:reads.length,snapshotReads:reads.filter(k=>!k.startsWith('snapshot_metadata:')).length,
   serializedReadBytes:reads.reduce((n,k)=>n+Buffer.byteLength(JSON.stringify(records.get(k))),0),ms});
 }
 const report={node:process.version,metrics,identicalMetadata:true,limits:'Copied save; in-memory IndexedDB request adapter using real structuredClone, not browser disk I/O. JSON bytes describe read values, not exact heap use or disk format. No simulation/browser/cloud speed guarantee.'};
 fs.writeFileSync(arg('--output','/tmp/save-metadata-metrics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
