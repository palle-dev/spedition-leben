// Controlled Node worker-thread comparison; no cloud/production writes.
// --save /private/export.json --baseline /path/to/before --output /tmp/order-input.json
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const ts=require('typescript'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){if(request.startsWith('@/'))request=path.join(root,'src',request.slice(2));if(!path.extname(request)&&fs.existsSync(request+'.ts'))request+='.ts';return resolve.call(this,request,parent,...rest);};
const load=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:file}).outputText,file);
require.extensions['.ts']=load;const js=require.extensions['.js'];require.extensions['.js']=(mod,file)=>(file.startsWith(path.join(root,'src')) || file.includes('/before/src/'))?load(mod,file):js(mod,file);
Date.now=()=>1800000000000;
if(!isMainThread){
 global.self={postMessage:message=>parentPort.postMessage(message)};
 require(path.join(workerData.mode==='new'?root:workerData.baseline,'src/lib/simulationWorker.js'));
 parentPort.on('message',data=>self.onmessage({data}));
}else{
 const args=process.argv.slice(2),arg=name=>args[args.indexOf(name)+1];
 if(!args.includes('--save')||!args.includes('--output'))throw Error('Explicit --save and --output required');
 const {createSimulationClient}=require(path.join(root,'src/lib/simulationWorkerClient.js'));
 const {applyCommand}=require(path.join(root,'src/lib/simulation/simulationEngine.ts'));
 const {compactHistory}=require(path.join(root,'src/lib/historyArchive.js'));
 const {writeHistoryBlocks}=require(path.join(root,'src/lib/historyRepository.js'));
 const handles=[];
 function createWorker(mode){
  const native=new Worker(__filename,{workerData:{mode,baseline:arg('--baseline')}});handles.push(native);
  const w={sent:null,received:null,onmessage:null,onerror:null,onmessageerror:null,postMessage(m){w.sent=m;native.postMessage(m);},terminate(){native.terminate();}};
  native.on('message',data=>{if(data.type==='progress')return;w.received=data;w.onmessage?.({data});});native.on('error',e=>w.onerror?.(e));return w;
 }
 async function main(){
  let initial=JSON.parse(fs.readFileSync(arg('--save'),'utf8')).state;applyCommand(initial,'advanceTime',{minutes:0});initial=await compactHistory(initial);
  const stage=s=>writeHistoryBlocks({put(){}},'benchmark',s);initial=stage(initial);
  let before=structuredClone(initial),after=structuredClone(initial);
  const {createSimulationClient:baselineClient}=require(path.resolve(arg('--baseline'),'src/lib/simulationWorkerClient.js'));
  let oldWorker,newWorker;const oldClient=baselineClient(()=>{oldWorker=createWorker('old');return oldWorker;});
  const client=createSimulationClient(()=>{newWorker=createWorker('new');return newWorker;});
  const rows=[];let id=0;
  for(const [command,params] of [['setOwnerSalary',{dailyWithdrawalCents:10000}],['advanceTime',{minutes:60,silentPhoneAdvance:true}],['advanceTime',{minutes:1440,silentPhoneAdvance:true}],['advanceTime',{minutes:60,silentPhoneAdvance:true}]]){
   let t=performance.now();++id;const old=await oldClient.execute(before,command,params);const oldMs=performance.now()-t;
   if(old.error)throw Error(old.error);before=stage(old.state);oldClient.accept(old,before);
   t=performance.now();const data=await client.execute(after,command,params);const newMs=performance.now()-t;
   if(data.error)throw Error(data.error);after=stage(data.state);client.accept(data,after);
   assert.deepEqual(after,before);
   const bytes=m=>Buffer.byteLength(JSON.stringify(m));
   const row={command,minutes:params.minutes||0,coldStart:id===1,oldMs,newMs,oldInputBytes:bytes(oldWorker.sent),newInputBytes:bytes(newWorker.sent),oldOutputBytes:bytes(oldWorker.received),newOutputBytes:bytes(newWorker.received),reusedInput:!!newWorker.sent.reuseCold,reusedOrders:!!newWorker.sent.reuseOrders,reusedRows:newWorker.received.reusedRows,exactStateEquality:true};rows.push(row);console.log(JSON.stringify(row));
  }
  fs.writeFileSync(arg('--output'),JSON.stringify({node:process.version,vehicles:initial.vehicles.filter(v=>!['sold','archived'].includes(v.status)).length,branches:initial.branches.length,rows,measurement:'Real Node worker threads, structured clone and actual browser-worker module via a Node bridge. Single sequential comparisons, including engine and compaction. First command includes cold-start/transpilation. JSON byte sizes are logical payload estimates, not browser wire bytes; Blob payload sizes excluded. No React, actual IndexedDB writes, cloud or production writes. Entire resulting states equal. Not a browser end-to-end or large-fleet long-term guarantee.'},null,2)+'\n');
 }
 main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>handles.forEach(w=>w.terminate()));
}
