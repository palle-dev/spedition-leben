// Isolated projection-update microbenchmark; no saves, engine advances or cloud.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript'),crypto=require('node:crypto');
const {performance}=require('node:perf_hooks');const args=process.argv.slice(2);const arg=n=>args[args.indexOf(n)+1];
if(!args.includes('--baseline')||!args.includes('--output'))throw Error('--baseline and --output required');
const out=arg('--output');if(fs.existsSync(out))throw Error('Output already exists');
function load(file){const m=new Module(file);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports;}
const old=load(path.resolve(arg('--baseline'))),next=load(path.join(__dirname,'../src/lib/simulation/financialProjection.ts'));
const accounts={'1000':{type:'asset'},'4000':{type:'revenue'}};
const entry=(no,time)=>({entryNo:no,gameTime:time,type:'revenue',branchId:'branch'+no%10,lines:[{account:'1000',debitCents:100+no%100,creditCents:0},{account:'4000',debitCents:0,creditCents:100+no%100}]});
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];const rows=[];
for(const days of [100,1000,5000]){
 const entries=[];for(let d=0;d<days;d++)for(let m=0;m<12;m++)entries.push(entry(entries.length+1,d*1440+m*120));
 const previous=old.projectJournal(null,entries,accounts);const beforeHash=hash(previous);
 const additions=Array.from({length:12},(_,i)=>entry(entries.length+i+1,days*1440+i*120));additions.push(entry(entries.length+13,Math.floor(days/2)*1440+60));
 const times={old:[],next:[]};let a,b;
 for(let run=0;run<7;run++)for(const which of run%2?['next','old']:['old','next']){const t=performance.now();const result=(which==='old'?old:next).projectJournal(previous,additions,accounts);const elapsed=performance.now()-t;if(run>=2)times[which].push(elapsed);if(which==='old')a=result;else b=result;}
 if(hash(a)!==hash(b)||hash(previous)!==beforeHash)throw Error('Projection changed');
 let shared=0;for(const key of Object.keys(previous.days))if(previous.days[key]===b.days[key])shared++;
 const row={days,entries:entries.length,projectionBytes:Buffer.byteLength(JSON.stringify(previous)),addedEntries:additions.length,oldMedianMs:median(times.old),newMedianMs:median(times.next),oldSamplesMs:times.old,newSamplesMs:times.next,identicalHash:hash(b),sharedHistoricalDays:shared};rows.push(row);console.log(JSON.stringify(row));
}
fs.writeFileSync(out,JSON.stringify({node:process.version,method:'Synthetic exact financial projections; 12 postings per day, ten branches. Append 12 entries on a new day and one backdated entry. Two warmups and five timed updates per version, alternating order. Projection-update time only, not archive compression, persistence, simulation day, browser, memory RSS or cloud. No change to serialized size or retention policy.',rows},null,2));
