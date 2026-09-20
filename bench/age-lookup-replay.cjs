// Age-scaling measurement: 20 consecutive days + one sampled day, no production writes.
// --sourceRoot /path/to/before --output /tmp/unique-run --commit <source-commit>
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const ts=require('typescript');
const {performance}=require('node:perf_hooks');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};
const out=arg('--output');if(!out)throw Error('Explicit --output required');fs.mkdirSync(out,{recursive:true});
const days=Number(arg('--days','20'));assert(Number.isSafeInteger(days)&&days>=3&&days<=200);
if(fs.existsSync(out+'/replay.json'))throw Error('Use a fresh output directory');
const root=path.resolve(arg('--sourceRoot',path.join(__dirname,'..'))),resolve=Module._resolveFilename;
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

const {applyCommand}=require(path.join(root,'src/lib/simulation/simulationEngine.ts'));
const zlib=require('node:zlib'),crypto=require('node:crypto');
Date.now=()=>1800000000000;
const input=fs.readFileSync(arg('--state')),s=JSON.parse(zlib.gunzipSync(input));
const initialTime=s.gameTime,initialDeliveries=s.stats.totalDeliveries;
const t=performance.now();applyCommand(s,'advanceTime',{minutes:1440,silentPhoneAdvance:true});const engineMs=performance.now()-t;
assert.equal(s.gameTime,initialTime+1440);assert.equal(s.vehicles.length,250);assert.equal(s.branches.length,10);assert(s.stats.totalDeliveries>initialDeliveries);
const result={source:arg('--commit','unspecified'),node:process.version,inputSHA256:crypto.createHash('sha256').update(input).digest('hex'),engineMs,gameTime:s.gameTime,delivered:s.stats.totalDeliveries-initialDeliveries,vehicles:s.vehicles.length,branches:s.branches.length,stateSHA256:crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex'),method:'One further day from the identical synthetic day-21 state, natural market only on this additional day. Engine only; no archive reads, persistence, compaction, UI or cloud. Existing archive descriptors remain untouched. This input is an internal engine fixture, not a portable save.'};
fs.writeFileSync(out+'/replay.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
