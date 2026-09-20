// Synthetic financial response transport only, not a simulation-day benchmark.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..'),oldJS=require.extensions['.js'];
const compile=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
require.extensions['.ts']=compile;require.extensions['.js']=(m,f)=>f.startsWith(path.join(root,'src'))?compile(m,f):oldJS(m,f);
const {packResult,unpackResult,coldPart}=require('../src/lib/simulationTransport.js');
const {projectJournal}=require('../src/lib/simulation/financialProjection.ts');
const accounts={'1000':{type:'asset'},'4000':{type:'revenue'}};
const entry=(n,t)=>({entryNo:n,gameTime:t,type:'revenue',branchId:'branch'+n%10,lines:[{account:'1000',debitCents:100,creditCents:0},{account:'4000',debitCents:0,creditCents:100}]});
const rows=[];for(const days of [100,1000,5000]){
 const entries=[];for(let d=0;d<days;d++)for(let m=0;m<12;m++)entries.push(entry(entries.length+1,d*1440+m*120));
 const projection=projectJournal(null,entries,accounts),state={accounting:{journal:[],journalProjection:projection}},source=coldPart(state);
 const additions=[entry(entries.length+1,days*1440),entry(entries.length+2,Math.floor(days/2)*1440+60)];
 const next={accounting:{journal:[],journalProjection:projectJournal(projection,additions,accounts)}};
 const packed=packResult({state:next},source),restored=unpackResult(structuredClone(packed),source);assert.deepStrictEqual(restored.state,next);
 const legacy={...packed,cold:{...packed.cold,projection:next.accounting.journalProjection}};delete legacy.cold.projectionDays;
 const fullBytes=Buffer.byteLength(JSON.stringify(legacy)),referenceBytes=Buffer.byteLength(JSON.stringify(packed));
 rows.push({days,fullBytes,referenceBytes,reductionPercent:100*(1-referenceBytes/fullBytes),reusedDays:packed.cold.projectionDays.rows.filter(r=>r[1]===null).length,exactRoundtrip:true});
}
const output=process.argv[2];if(!output||fs.existsSync(output))throw Error('New output path required');fs.writeFileSync(output,JSON.stringify({node:process.version,rows,method:'Synthetic finance-only worker response after a new and a backdated posting. Twelve existing postings per day, ten branches. Exact structural roundtrip after structured clone. JSON UTF-8 bytes, not actual structured-clone bytes, browser time, total game state or save size.'},null,2));console.log(JSON.stringify(rows));
