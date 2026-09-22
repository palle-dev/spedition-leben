// Isolated synthetic comparison. Does not load user saves or use cloud APIs.
// node bench/dispatch-intake.cjs [--baseline] [--count=250]
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('typescript'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const count=Number((process.argv.find(a=>a.startsWith('--count='))||'--count=100').split('=')[1]);
const commit='9bf5c39f4e1b66e96f8a08d5517229fbf60194a9';
const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,parent,...rest){
 if(request.startsWith('@/'))request=path.join(root,'src',request.slice(2));
 if(!path.extname(request)&&fs.existsSync(request+'.ts'))request+='.ts';
 return resolve.call(this,request,parent,...rest);
};
require.extensions['.ts']=(mod,file)=>{
 const relative=path.relative(root,file);
 const source=baseline&&['src/lib/simulation/tourEngine.ts','src/lib/simulation/dispatcherProcessor.ts'].includes(relative)
  ?execFileSync('git',['show',commit+':'+relative],{cwd:root,encoding:'utf8'}):fs.readFileSync(file,'utf8');
 mod._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true},fileName:file}).outputText,file);
};
Date.now=()=>1800000000000;
const {makeLargeFleet}=require('../tests/fixtures/largeFleet.ts');
const {applyCommand,createInitialState}=require('../src/lib/simulation/simulationEngine.ts');
const {suggestTours}=require('../src/lib/simulation/tourEngine.ts');
const {performance}=require('node:perf_hooks');
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const original=makeLargeFleet(count);
original.employees=Array.from({length:Math.ceil(count/6)},(_,i)=>({...structuredClone(original.employees[0]),id:'bench_dispatcher_'+i,suggestions:[]}));
const days=[];
for(let run=0;run<4;run++){
 const s=structuredClone(original),start=s.gameTime,t=performance.now();
 applyCommand(s,'advanceTime',{minutes:1440,silentPhoneAdvance:true});
 const ms=performance.now()-t;
 if(s.gameTime!==start+1440)throw Error('Incomplete day');
 const row={run,ms,delivered:s.orders.filter(o=>o.status==='geliefert').length,failed:s.orders.filter(o=>o.status==='failed').length,tours:s.tours.length};
 if(run)days.push(row);
}
const blocked=createInitialState({}).state;applyCommand(blocked,'advanceTime',{minutes:0});blocked.company.accountCents=1000000000;
blocked.vehicles=Array.from({length:count},(_,i)=>({...structuredClone(blocked.vehicles[0]),id:'v'+i,condition:100}));
blocked.drivers=Array.from({length:count},(_,i)=>({...structuredClone(blocked.drivers[0]),id:'d'+i}));
const good={...structuredClone(blocked.orders[0]),fromCity:'Hamburg',toCity:'Bremen',paymentCents:100000,deliveryDeadlineMin:5000,acceptDeadlineMin:3000,latestLoadStartMin:3000};
blocked.orders=[...Array.from({length:12},(_,i)=>({...structuredClone(good),id:'impossible'+i,paymentCents:10000000,deliveryDeadlineMin:blocked.gameTime+1})),...Array.from({length:count},(_,i)=>({...structuredClone(good),id:'good'+i}))];
const searches=[];
for(let run=0;run<4;run++){
 const s=structuredClone(blocked),t=performance.now();
 const result=suggestTours(s,{acceptNew:true,mode:'balanced',minNewOrderBufferMin:30});
 const ms=performance.now()-t;
 if(run)searches.push({ms,suggestions:result.suggestions.length});
}
const report={baseline,baselineCommit:commit,count,node:process.version,days,dayMedianMs:median(days.map(x=>x.ms)),blockedSelection:searches,selectionMedianMs:median(searches.map(x=>x.ms)),limits:'Synthetic fresh fleet and market. One warmup, three independent clones. Engine only, not browser or aged user save. Day fixture starts all trucks on tours; blocked-selection fixture starts all trucks free. Dispatcher staffing/capital supplied synthetically; natural simulation during measured day.'};
const out=path.join(root,'audit/dispatch-intake', (baseline?'before':'after')+'-'+count+'.json');
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
