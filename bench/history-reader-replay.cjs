// Local, read-only save replay. No cloud calls, production writes or publishing.
// node bench/history-repository-replay.cjs --save /private/export.json --baseline /path/to/old/src/lib/simulation --output /tmp/history-metrics.json
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
const {compactHistory,readArchiveRecords}=require(path.join(root,'src/lib/historyArchive.js'));
const {writeHistoryBlocks}=require(path.join(root,'src/lib/historyRepository.js'));
const {runSaveFileTask}=require(path.join(root,'src/lib/saveFileTasks.js'));
const {createHistoryReadCache}=require(path.join(root,'src/lib/historyReadCache.js'));
const {applyCommand}=require(path.join(root,'src/lib/simulation/simulationEngine.ts'));
async function main(){
 const state=JSON.parse(fs.readFileSync(save,'utf8')).state;
 applyCommand(state,'advanceTime',{minutes:0});
 const archive=await compactHistory(state),blocks=new Map();
 const stored=writeHistoryBlocks({put:(v,k)=>blocks.set(k,v)},'reader',archive);
 const metrics=[];
 let expected;
 for(const cached of [false,true]){
  let reads=0,decodes=0;
  const load=async(user,c)=>{reads++;return blocks.get('user_'+user+':history_'+c.id).data};
  const decode=async(c,b)=>{decodes++;return readArchiveRecords(c,b)};
  const reader=cached?createHistoryReadCache({load,decode}):async(u,c)=>decode(c,await load(u,c));
  const pages=[];let cursor=null;const t=performance.now();
  for(let page=0;page<20;page++){
   const result=await runSaveFileTask('historyPage',{state:{historyArchive:stored.historyArchive},userId:'reader',kind:'accountingJournal',cursor},reader);
   pages.push(result);cursor=result.cursor;if(!cursor)break;
  }
  const ms=performance.now()-t;
  if(expected)assert.deepEqual(pages,expected);else expected=pages;
  metrics.push({cached,pages:pages.length,rows:pages.reduce((n,p)=>n+p.rows.length,0),blockReads:reads,blockDecodes:decodes,ms});
 }
 const report={node:process.version,metrics,identicalPagesAndCursors:true,limits:'Controlled local read/decode test on copied save. In-memory block store instead of IndexedDB. No actual browser/worker startup/network timing or simulation speed claim. Cache capped at 8 MiB raw JSON, 4000 rows and 8 blocks; object heap overhead additional.'};
 fs.writeFileSync(arg('--output','/tmp/history-reader-metrics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
