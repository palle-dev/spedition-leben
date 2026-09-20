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
const days=Number(arg('--days',5)),start=original.gameTime;
if(!Number.isInteger(days)||days<1)throw Error('Invalid days');
Date.now=()=>1800000000000;
const s=structuredClone(original),daily=[];
for(let day=1;day<=days;day++){
 const previous=new Map(s.orders.map(o=>[o.id,o.status])),t=performance.now();
 applyCommand(s,'advanceTime',{minutes:1440,silentPhoneAdvance:true});
 const ms=performance.now()-t;
 if(s.gameTime!==start+day*1440)throw Error('Incomplete advance');
 const changed=s.orders.filter(o=>previous.get(o.id)!==o.status),delivered=changed.filter(o=>o.status==='geliefert');
 const row={day,ms,gameTime:s.gameTime,delivered:delivered.length,onTime:delivered.filter(o=>o.deliveredAtMin<=o.deliveryDeadlineMin).length,
  late:delivered.filter(o=>o.deliveredAtMin>o.deliveryDeadlineMin).length,failed:changed.filter(o=>o.status==='failed').length,
  expiredOffers:changed.filter(o=>o.status==='expired').length};daily.push(row);console.log(JSON.stringify(row));
}
const outcomes=orders=>({accepted:orders.length,delivered:orders.filter(o=>o.status==='geliefert').length,
 onTime:orders.filter(o=>o.status==='geliefert'&&o.deliveredAtMin<=o.deliveryDeadlineMin).length,
 late:orders.filter(o=>o.status==='geliefert'&&o.deliveredAtMin>o.deliveryDeadlineMin).length,
 failed:orders.filter(o=>o.status==='failed').length,open:orders.filter(o=>['angenommen','unterwegs'].includes(o.status)).length});
const cohort=s.orders.filter(o=>o.acceptedAtMin>=start),mature=cohort.filter(o=>o.deliveryDeadlineMin+240<=s.gameTime);
const cancelled=s.tours.filter(t=>t.createdAt>=start&&t.status==='cancelled'),reasons={};
for(const tour of cancelled)reasons[tour.cancelReason||tour.pauseReason||'unknown']=(reasons[tour.cancelReason||tour.pauseReason||'unknown']||0)+1;
const report={node:process.version,days,initialGameTime:start,finalGameTime:s.gameTime,activeVehicles:original.vehicles.filter(v=>!['archived','sold'].includes(v.status)).length,
 branches:original.branches.length,daily,newCommitments:outcomes(cohort),matureNewCommitments:outcomes(mature),cancelledNewTours:reasons,
 finalAccountCents:s.company.accountCents,finalPoorCondition:s.vehicles.filter(v=>v.condition<20&&!['archived','sold'].includes(v.status)).length,
 limits:'Engine-only time. Same unmodified original save, natural simulation, different decisions intentionally change RNG evolution. Open commitments are not counted as successful.'};
const output=arg('--output');if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({newCommitments:report.newCommitments,matureNewCommitments:report.matureNewCommitments}));
