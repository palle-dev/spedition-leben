// Local, read-only save replay. No cloud calls, production writes or publishing.
// node bench/archive-replay.cjs --save /private/export.json --output /tmp/archive-metrics.json
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
const {compactHistory,archiveStats,portableHistory,partitionHistory,readLimited}=require(path.join(root,'src/lib/historyArchive.js'));
const {runSaveFileTask}=require(path.join(root,'src/lib/saveFileTasks.js'));
const {applyCommand}=require(path.join(root,'src/lib/simulation/simulationEngine.ts'));
function normalize(s){const p=partitionHistory(s),out={...s,orders:p.orders,accounting:{...s.accounting,taskQueue:p.taskQueue}};delete out.historyArchive;return out;}
async function main(){
 const original=JSON.parse(fs.readFileSync(save,'utf8')).state;
 Date.now=()=>1800000000000;
 let t=performance.now(),compact=await compactHistory(original);
 const report={node:process.version,inputBytes:Buffer.byteLength(JSON.stringify(original)),compactMs:performance.now()-t,
  activeBytes:Buffer.byteLength(JSON.stringify(compact)),archive:archiveStats(compact),ordersBefore:original.orders.length,ordersAfter:compact.orders.length,
  accountingTasksBefore:original.accounting.taskQueue.length,accountingTasksAfter:compact.accounting.taskQueue.length};
 t=performance.now();const exported=await runSaveFileTask('export',compact);report.exportMs=performance.now()-t;report.exportBytes=exported.size;
 t=performance.now();const imported=await runSaveFileTask('import',exported);report.importMs=performance.now()-t;
 assert.deepEqual(imported.orders,compact.orders);assert.deepEqual(imported.accounting,compact.accounting);
 assert.deepEqual(await portableHistory(imported).then(s=>s.historyArchive),await portableHistory(compact).then(s=>s.historyArchive));
 report.roundtrip=true;
 const before=structuredClone(original),after=structuredClone(compact);
 report.days=[];
 for(let day=1;day<=3;day++){
  const row={day};t=performance.now();applyCommand(before,'advanceTime',{minutes:1440,silentPhoneAdvance:true});row.beforeMs=performance.now()-t;
  t=performance.now();applyCommand(after,'advanceTime',{minutes:1440,silentPhoneAdvance:true});row.afterMs=performance.now()-t;
  try {assert.deepEqual(normalize(after),normalize(before));} catch(error){fs.writeFileSync('/tmp/archive-mismatch.txt',String(error));throw Error('Simulation differs; see /tmp/archive-mismatch.txt');}
  row.sameSimulation=true;row.gameTime=after.gameTime;
  report.days.push(row);console.log(JSON.stringify(row));
 }
 report.limits='Engine-only local measurements; excludes browser rendering, cloud, and device variability. Financial journal retained in full. Archived rows are never-accepted expired offers and completed accounting tasks.';
 fs.writeFileSync(arg('--output','/tmp/archive-metrics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
