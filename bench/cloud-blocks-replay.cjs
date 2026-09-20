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
const {compactHistory,portableHistory,archiveStats}=require(path.join(root,'src/lib/historyArchive.js'));
const {stageCloudArchive,hydrateCloudArchive}=require(path.join(root,"base44/shared/cloudArchiveStore.ts"));
const {resolveCloudArchive}=require(path.join(root,'base44/shared/cloudArchive.ts'));
const {applyCommand}=require(path.join(root,'src/lib/simulation/simulationEngine.ts'));
async function main(){
 const original=JSON.parse(fs.readFileSync(save,'utf8')).state;
 applyCommand(original,'advanceTime',{minutes:0});
 const state=await compactHistory(original);
 const full=await portableHistory(state);
 let reads=0;
 const delta=await portableHistory(state,{references:new Set(state.historyArchive.chunks.map(c=>c.id)),loadBlock:async c=>{reads++;return c.data}});
 assert.deepEqual(resolveCloudArchive(delta,full),full);
 assert.equal(reads,0);
 const blocks=new Map();let blockReads=0,blockWrites=0;
 const db={filter:async q=>{blockReads++;return [...blocks.values()].filter(r=>r.owner_id===q.owner_id&&r.content_hash===q.content_hash)},get:async id=>{blockReads++;return blocks.get(id)},create:async value=>{blockWrites++;const r={...value,id:'block-'+blocks.size};blocks.set(r.id,r);return r}};
 const staged=await stageCloudArchive(db,'test-owner',full);
 const firstBlockWrites=blockWrites;
 assert.deepEqual(await hydrateCloudArchive(db,'test-owner',staged.state,staged.archive_blocks),full);
 blockReads=0;blockWrites=0;
 const repeated=await stageCloudArchive(db,'test-owner',delta,staged.state,staged.archive_blocks);
 assert.deepEqual(repeated,staged);assert.equal(blockReads,0);assert.equal(blockWrites,0);
 const bytes=s=>Buffer.byteLength(JSON.stringify(s));
 const report={node:process.version,gameTime:state.gameTime,activeVehicles:state.vehicles.filter(v=>!['sold','archived'].includes(v.status)).length,branches:state.branches.length,
 firstBlockWrites,repeatedBlockReads:blockReads,repeatedBlockWrites:blockWrites,cloudSnapshotBytes:bytes(staged),fullPayloadBytes:bytes(full),repeatPayloadBytes:bytes(delta),bytesAvoided:bytes(full)-bytes(delta),archive:archiveStats(state),
 repeatedArchiveReads:reads,identicalReconstructedSnapshot:true,
 largestActiveFields:Object.entries(delta).map(([key,v])=>({key,bytes:bytes(v)})).sort((a,b)=>b.bytes-a.bytes).slice(0,10),
 limits:"Offline payload measurement on copied save. No cloud request or production change. Cloud stores a snapshot with block references and loads a complete snapshot; active state and archive manifest still transmitted. No browser or network timing."};
 fs.writeFileSync(arg('--output','/tmp/cloud-metrics.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(e=>{console.error(e);process.exitCode=1});
