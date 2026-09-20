// Local, read-only save replay. No cloud calls, production writes or publishing.
// node bench/engine-profile.cjs --save /private/export.json > /tmp/engine-profile.json
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
const {applyCommand}=require(path.join(root,'src/lib/simulation/simulationEngine.ts'));
const inspector=require('node:inspector');
(async()=>{let s=JSON.parse(fs.readFileSync(save,'utf8')).state;applyCommand(s,'advanceTime',{minutes:0});s=await compactHistory(s);
const session=new inspector.Session();session.connect();const post=(method)=>new Promise((resolve,reject)=>session.post(method,(e,r)=>e?reject(e):resolve(r)));
await post('Profiler.enable');await post('Profiler.start');const t=performance.now();applyCommand(s,'advanceTime',{minutes:1440,silentPhoneAdvance:true});const ms=performance.now()-t;const {profile}=await post('Profiler.stop');session.disconnect();
const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();for(let i=0;i<profile.samples.length;i++){const n=nodes.get(profile.samples[i]);const k=n.callFrame.functionName+' '+n.callFrame.url.split('/').pop()+':'+n.callFrame.lineNumber;counts.set(k,(counts.get(k)||0)+profile.timeDeltas[i]);}
console.log(JSON.stringify({ms,top:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,30)},null,2));})();
