// Read-only engine profiling; isolated inputs, no cloud or production writes.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const {performance}=require('node:perf_hooks'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const args=process.argv.slice(2),arg=(n,d)=>{const i=args.indexOf(n);return i<0?d:args[i+1]};
const root=path.resolve(__dirname,'..'),baseline=arg('--baseline'),resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
 if(request.startsWith('@/'))request=path.join(root,'src',request.slice(2));
 if(!path.extname(request)&&fs.existsSync(request+'.ts'))request+='.ts';
 return resolve.call(this,request,parent,...rest);
};
const load=(mod,file)=>{
 const rel=path.relative(root,file);
 const source=baseline&&['src/lib/simulation/tourEngine.ts','src/lib/simulation/dispatcherProcessor.ts'].includes(rel)
 ?execFileSync('git',['show',baseline+':'+rel],{cwd:root,encoding:'utf8'}):fs.readFileSync(file,'utf8');
 mod._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:file}).outputText,file);
};
require.extensions['.ts']=load;
const js=require.extensions['.js'];require.extensions['.js']=(mod,file)=>file.startsWith(path.join(root,'src'))?load(mod,file):js(mod,file);
Date.now=()=>1800000000000;
const {applyCommand}=require('../src/lib/simulation/simulationEngine.ts');
const {compactHistory}=require('../src/lib/historyArchive.js');
const {makeLargeFleet}=require('../tests/fixtures/largeFleet.ts');
async function main(){
 let s;const save=arg('--save');
 if(save){const raw=save.endsWith('.gz')?require('node:zlib').gunzipSync(fs.readFileSync(save)):fs.readFileSync(save);const input=JSON.parse(raw);s=input.state||input;}
 else s=makeLargeFleet(Number(arg('--fleet',250)));
 applyCommand(s,'advanceTime',{minutes:0});s=await compactHistory(s);
 const before={time:s.gameTime,vehicles:s.vehicles.length,drivers:s.drivers.length,employees:s.employees.length,orders:s.orders.length,trips:s.trips.length,tours:s.tours.length};
 const inspector=require('node:inspector'),session=new inspector.Session();session.connect();
 const post=m=>new Promise((resolve,reject)=>session.post(m,(e,r)=>e?reject(e):resolve(r)));
 await post('Profiler.enable');await post('Profiler.start');
 const t=performance.now();applyCommand(s,'advanceTime',{minutes:Number(arg('--minutes',1440)),silentPhoneAdvance:true});const ms=performance.now()-t;
 const {profile}=await post('Profiler.stop');session.disconnect();
 const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();
 for(let i=0;i<profile.samples.length;i++){const n=nodes.get(profile.samples[i]);const key=n.callFrame.functionName+' '+n.callFrame.url.split('/').pop()+':'+n.callFrame.lineNumber;counts.set(key,(counts.get(key)||0)+profile.timeDeltas[i]);}
 const result={baseline,before,ms,gameTime:s.gameTime,hash:createHash('sha256').update(JSON.stringify(s)).digest('hex'),delivered:s.stats.totalDeliveries,top:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,35)};
 fs.writeFileSync(arg('--output','/tmp/day-profile.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}main().catch(e=>{console.error(e);process.exitCode=1});
