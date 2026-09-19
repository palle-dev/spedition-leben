// Read-only replay of an explicitly supplied save export. Never connects to cloud.
// Example: node bench/replay-export.cjs --save /private/export.json --runs 3 --output /tmp/replay.json
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {performance}=require('node:perf_hooks'),{createHash}=require('node:crypto');
const ts=require('typescript');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};
const save=arg('--save');if(!save)throw Error('An explicit --save path is required');
const root=path.resolve(__dirname,'..'),engine=path.resolve(arg('--engine',path.join(root,'src/lib/simulation')));
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
 if(request.startsWith('@/'))request=path.join(root,'src',request.slice(2));
 if(!path.extname(request)&&fs.existsSync(request+'.ts'))request+='.ts';
 return resolve.call(this,request,parent,...rest);
};
require.extensions['.ts']=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:file
}).outputText,file);
const {applyCommand}=require(path.join(engine,'simulationEngine.ts'));
const input=JSON.parse(fs.readFileSync(save,'utf8')),original=input.state||input;
const minutes=Number(arg('--minutes',1440)),chunk=Number(arg('--chunk',minutes)),runs=Number(arg('--runs',3));
if(!Number.isInteger(minutes)||minutes<=0||!Number.isInteger(chunk)||chunk<=0||!Number.isInteger(runs)||runs<1)throw Error('Invalid duration or run count');
Date.now=()=>1800000000000;
const results=[];
for(let i=0;i<runs;i++){
 const s=structuredClone(original),start=s.gameTime,t=performance.now();
 for(let n=0;n<minutes;n+=chunk)applyCommand(s,'advanceTime',{minutes:Math.min(chunk,minutes-n),silentPhoneAdvance:true});
 const ms=performance.now()-t;
 if(s.gameTime!==start+minutes)throw Error('Advance did not complete');
 const json=JSON.stringify(s);
 results.push({run:i+1,ms,gameTime:s.gameTime,deliveries:s.stats?.totalDeliveries,
  hash:createHash('sha256').update(json).digest('hex'),outputBytes:Buffer.byteLength(json)});
 console.log(JSON.stringify(results.at(-1)));
}
const sorted=results.map(r=>r.ms).sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
const report={node:process.version,measurement:'Engine only; excludes startup, cloning, serialization, browser and storage',minutes,chunk,
 activeVehicles:original.vehicles.filter(v=>!['archived','sold'].includes(v.status)).length,branches:original.branches.length,
 inputOrders:original.orders.length,inputGameTime:original.gameTime,
 medianMs:sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2,maxMs:sorted.at(-1),results};
const output=arg('--output');if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({medianMs:report.medianMs,maxMs:report.maxMs}));
