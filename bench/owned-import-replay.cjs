// Compare importSave with a private export, without production writes.
// --save /private/export.json --baseline /path/to/before --output /tmp/unique-run
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const ts=require('typescript');
const {performance}=require('node:perf_hooks');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};
const out=arg('--output');if(!out)throw Error('Explicit --output required');fs.mkdirSync(out,{recursive:true});
if(fs.existsSync(out+'/results.json'))throw Error('Output already contains a run; use a fresh directory');
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

const crypto=require('node:crypto'),baseline=arg('--baseline'),save=arg('--save');if(!baseline||!save)throw Error('--baseline and --save required');
const before=require(path.resolve(baseline,'src/lib/persistence.js')),after=require(path.join(root,'src/lib/persistence.js'));
const original=JSON.parse(fs.readFileSync(save,'utf8')).state,hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),originalHash=hash(original);
const text=before.exportSave(original);Date.now=()=>1800000000000;
const times={before:[],after:[]};let a,b;
for(let i=0;i<4;i++){
 for(const name of i%2?['after','before']:['before','after']){const t=performance.now();const result=(name==='before'?before:after).importSave(text);const ms=performance.now()-t;if(i)times[name].push(ms);if(name==='before')a=result;else b=result;}
 assert.deepEqual(a,b);
}
assert.equal(hash(original),originalHash);
const median=a=>[...a].sort((a,b)=>a-b)[1];const result={node:process.version,inputBytes:Buffer.byteLength(text),beforeMedianMs:median(times.before),afterMedianMs:median(times.after),samples:times,exactImportedState:true,originalUnchanged:true,method:'Private export copy serialized to the unchanged v2 envelope. Timed importSave: size check, JSON parse, checksum, state normalization and identity reset. One warmup pair, three measured pairs, alternating order. No file I/O, gzip decompression, archive restoration/compaction, Worker scheduling, browser UI, persistence or simulation day in timing. No private contents in report.'};fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
