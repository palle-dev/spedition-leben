// Measures exportSave only; private source data never enters the report.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
for(const k of ['--save','--baseline','--output'])assert(args.includes(k),k+' required');
const out=arg('--output');assert(!fs.existsSync(out),'Use a fresh output directory');
function load(file){const s=fs.readFileSync(file,'utf8'),start=s.indexOf('function checksum('),end=s.indexOf('export function importSave(');return new Function('const EXPORT_VERSION=2;'+s.slice(start,end).replace('export function exportSave','function exportSave')+';return exportSave;')();}
const before=load(path.join(arg('--baseline'),'src/lib/persistence.js')),after=load(path.join(__dirname,'../src/lib/persistence.js'));
const state=JSON.parse(fs.readFileSync(arg('--save'),'utf8')).state,hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex'),initial=hash(state),samples={before:[],after:[]};let bytes;
for(let i=0;i<6;i++){const results={};for(const k of i%2?['after','before']:['before','after']){const t=performance.now();results[k]=(k==='before'?before:after)(state);const blob=new Blob([results[k]]);bytes=blob.size;const elapsed=performance.now()-t;if(i)samples[k].push(elapsed);}assert.equal(results.before,results.after);bytes=Buffer.byteLength(results.after);}
assert.equal(hash(state),initial);
const median=x=>[...x].sort((a,b)=>a-b)[2],result={node:process.version,bytes,samples,beforeMedianMs:median(samples.before),afterMedianMs:median(samples.after),byteIdentical:true,originalUnchanged:true,method:'One warmup pair and five alternating measured pairs. exportSave plus construction of the output Blob, including JSON serialization, checksum, UTF-8 byte count and materialization of concatenated text. Excludes archive embedding, gzip, I/O, real Worker scheduling, browser rendering, persistence and simulation time.'};
fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
