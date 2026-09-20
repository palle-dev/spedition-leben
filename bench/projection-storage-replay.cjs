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

const {packStoredProjection,unpackStoredProjection}=require(path.join(root,'src/lib/projectionStorage.js'));
const {freezeFinancialSnapshot}=require(path.join(root,'src/lib/simulationTransport.js'));
const {projectJournal}=require(path.join(root,'src/lib/simulation/financialProjection.ts'));
const accounts={'1000':{type:'asset'},'4000':{type:'revenue'}},rows=[];
const entry=(n,t)=>({entryNo:n,gameTime:t,type:'revenue',branchId:'branch'+n%10,lines:[{account:'1000',debitCents:100,creditCents:0},{account:'4000',debitCents:0,creditCents:100}]});
async function main(){
 for(const days of [100,1000,5000]){
  const entries=[];for(let d=0;d<days;d++)for(let m=0;m<12;m++)entries.push(entry(entries.length+1,d*1440+m*120));
  const record={savedAt:1,state:{accounting:{journal:[],journalProjection:projectJournal(null,entries,accounts)}}};freezeFinancialSnapshot(record.state);
  const start=performance.now(),packed=await packStoredProjection(record),firstPackMs=performance.now()-start;
  const times=[];for(let i=0;i<5;i++){const t=performance.now();const again=await packStoredProjection(record);times.push(performance.now()-t);assert.equal(again.localFinancialProjection.data,packed.localFinancialProjection.data);}
  const restored=await unpackStoredProjection(structuredClone(packed));assert.deepEqual(restored,record);
  const fullBytes=Buffer.byteLength(JSON.stringify(record)),storedBytes=Buffer.byteLength(JSON.stringify(packed))+packed.localFinancialProjection.data.size;
  rows.push({days,fullBytes,storedBytes,compressedBytes:packed.localFinancialProjection.data.size,reductionPercent:100*(1-storedBytes/fullBytes),firstPackMs,warmPackMedianMs:times.sort((a,b)=>a-b)[2],exactRoundtrip:true});
 }
 fs.writeFileSync(out+'/results.json',JSON.stringify({node:process.version,rows,method:'Synthetic finance-only local snapshot: 12 postings/day, ten branches. Logical UTF-8 metadata plus gzip Blob bytes, not physical IndexedDB disk usage or full-game size. First compression once, five warm packs of the same proven frozen projection. No browser, cloud or complete day timing.'},null,2));console.log(JSON.stringify(rows));
}
main().catch(e=>{console.error(e);process.exitCode=1});
