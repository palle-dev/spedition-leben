// Age-scaling measurement: 20 consecutive days + one sampled day, no production writes.
// --sourceRoot /path/to/before --output /tmp/unique-run --commit <source-commit>
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const ts=require('typescript');
const {performance}=require('node:perf_hooks');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};
const out=arg('--output');if(!out)throw Error('Explicit --output required');fs.mkdirSync(out,{recursive:true});
const days=Number(arg('--days','20'));assert(Number.isSafeInteger(days)&&days>=3&&days<=200);
if(fs.existsSync(out+'/days.json'))throw Error('Output already contains a run; use a fresh directory');
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

const {prepareLoadedState,prepareOwnedLoadedState}=require(path.join(root,'src/lib/saveSafety.js'));
const crypto=require('node:crypto');const save=arg('--save');if(!save)throw Error('Explicit --save required');
const raw=JSON.parse(fs.readFileSync(save,'utf8')).state;const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');const original=hash(raw);
Date.now=()=>1800000000000;
const times={before:[],after:[]};let before,after;
for(let i=0;i<4;i++){
 for(const name of i%2?['after','before']:['before','after']){
  const t=performance.now();const input=structuredClone(raw);const prepared=(name==='before'?prepareLoadedState:prepareOwnedLoadedState)(input);const output=structuredClone(prepared);const elapsed=performance.now()-t;
  if(i)times[name].push(elapsed);if(name==='before')before=output;else after=output;
 }
 assert.deepEqual(before,after);
}
assert.equal(hash(raw),original);
const median=a=>[...a].sort((a,b)=>a-b)[1];const result={node:process.version,inputBytes:Buffer.byteLength(JSON.stringify(raw)),beforeMedianMs:median(times.before),afterMedianMs:median(times.after),samples:times,exactNormalizedState:true,originalUnchanged:true,method:'Private exported save copy. Simulated worker input structuredClone + normalization + output structuredClone, comparing three full copies versus two. One warmup pair, three measured pairs, alternating order. No real Worker scheduling/browser, IndexedDB, archive restoration/compaction, production writes or full simulation-day measurement. No private contents in report.'};
fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
