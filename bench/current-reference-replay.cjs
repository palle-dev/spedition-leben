// Local, read-only save replay. No cloud calls, production writes or publishing.
// node bench/current-reference-replay.cjs --save /private/export.json --baseline /path/to/old/src/lib --output /tmp/current-reference-metrics.json
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
 const records=new Map();let writes=[];
 const db={transaction:()=>{
  const tx={};const pending=[];let requests=0;
  tx.objectStore=()=>({
   put:(value,key)=>{const cloned=structuredClone(value);writes.push({key,bytes:Buffer.byteLength(JSON.stringify(value)),snapshot:!!value.state});pending.push(()=>records.set(key,cloned));},
   get:key=>{const req={};requests++;setTimeout(()=>{req.result=structuredClone(records.get(key));req.onsuccess?.();requests--;},0);return req;}
  });
  tx.abort=()=>{tx.aborted=true};
  const complete=()=>{if(requests){setTimeout(complete,0);return;}if(tx.aborted){tx.onabort?.();return;}pending.forEach(f=>f());tx.oncomplete?.();};setTimeout(complete,0);return tx;
 }};
 global.indexedDB={open:()=>{const req={};queueMicrotask(()=>{req.result=db;req.onsuccess()});return req}};
 const current=require(path.join(root,'src/lib/persistence.js'));
 const previous=require(path.resolve(arg('--baseline'),'persistence.js'));
 const metrics=[];
 for(const [version,api] of [['before',previous],['after',current]]){
  records.clear();writes=[];const t=performance.now();await api.saveCurrent('replay',stored,null,1800000000000);const ms=performance.now()-t;
  assert.deepEqual(await api.loadCurrent('replay'),stored);
  metrics.push({version,snapshotWrites:writes.filter(w=>w.snapshot).length,writeCount:writes.length,serializedWriteBytes:writes.reduce((n,w)=>n+w.bytes,0),ms});
 }
 assert.equal(metrics[0].snapshotWrites,2);assert.equal(metrics[1].snapshotWrites,1);
 const report={node:process.version,metrics,identicalLoadedState:true,limits:'Private save copy; compacted archive references already persisted. Transactional in-memory IndexedDB adapter using real structuredClone. Timings include JSON byte counting and are not browser measurements. JSON logical bytes are not exact disk usage. Archive block contents are unchanged; test covers recurring snapshot saves, not first archive ingestion.'};
 fs.writeFileSync(arg('--output','/tmp/current-reference-metrics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
