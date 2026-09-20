// Local, read-only save replay. No cloud calls, production writes or publishing.
// node bench/fleet-250-profile.cjs --output /tmp/fleet-250
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),assert=require('node:assert/strict');
const ts=require('typescript');
const {performance}=require('node:perf_hooks');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};
const out=arg('--output');if(!out)throw Error('Explicit --output required');fs.mkdirSync(out,{recursive:true});
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

const {applyCommand,createInitialState}=require(path.join(root,'src/lib/simulation/simulationEngine.ts'));
const {compactHistory}=require(path.join(root,'src/lib/historyArchive.js'));
const {writeHistoryBlocks}=require(path.join(root,'src/lib/historyRepository.js'));
const {CITIES,getDistance}=require(path.join(root,'src/lib/simulation/gameRules.ts'));
const {postJournal,registerAsset}=require(path.join(root,'src/lib/simulation/accountingEngine.ts'));
const inspector=require('node:inspector');
Date.now=()=>1800000000000;
async function main(){
 let s=createInitialState({companyName:'Isolated 250 truck profile',playerName:'Benchmark',partnerName:'Test'}).state;
 applyCommand(s,'advanceTime',{minutes:0});
 postJournal(s,{text:'Synthetic capital',lines:[{account:'1000',debit:100000000000},{account:'2020',credit:100000000000}]});
 const templates={vehicle:structuredClone(s.vehicles[0]),driver:structuredClone(s.drivers[0]),order:structuredClone(s.orders[0]),branch:structuredClone(s.branches[0])};
 applyCommand(s,'hireEmployee',{applicantId:s.availableApplicants.find(a=>a.role==='dispatcher').id});templates.dispatcher=structuredClone(s.employees[0]);
 s.vehicles=[];s.drivers=[];s.employees=[];s.orders=[];s.branches=[];
 applyCommand(s,'applyDelegationPreset',{presetId:'daily_relief'});
 Object.assign(s.delegation.rules,{maxSpendPerActionCents:100000000,dailyBudgetCents:1000000000,autoAcceptOrders:true,autoDispatch:true});
 const cities=['Hamburg','Bremen','Kiel','Hannover','Berlin','Köln','Frankfurt','München','Leipzig','Stuttgart'];
 for(const [index,city] of cities.entries()){
  const id='profile_b'+index;
  s.branches.push({...structuredClone(templates.branch),id,city,name:city,isHeadquarters:index===0,openedAtMin:s.gameTime,stats:{revenueCents:0,deliveries:0,expensesCents:0}});
  for(let i=0;i<25;i++){
   const v={...structuredClone(templates.vehicle),id:'profile_v'+index+'_'+i,branchId:id,locationCity:city,acquiredAtMin:s.gameTime};s.vehicles.push(v);
   registerAsset(s,{vehicleId:v.id,account:'1200',name:v.id,acquisitionCostCents:v.bookValueCents,acquiredAtMin:s.gameTime});
  }
  for(let i=0;i<35;i++)s.drivers.push({...structuredClone(templates.driver),id:'profile_d'+index+'_'+i,name:'Driver '+index+'/'+i,branchId:id,locationCity:city,employedDay:1});
  for(let i=0;i<6;i++)s.employees.push({...structuredClone(templates.dispatcher),id:'profile_e'+index+'_'+i,name:'Dispatcher '+index+'/'+i,branchId:id,assignedBranchId:id,locationCity:city,workMode:'autonomous',lastDecisionMin:null,suggestions:[]});
 }
 const nearest=city=>CITIES.filter(c=>c!==city).sort((a,b)=>getDistance(city,a)-getDistance(city,b)).slice(0,3);
 const quantities=()=>({vehicles:s.vehicles.length,branches:s.branches.length,drivers:s.drivers.length,dispatchers:s.employees.filter(e=>e.role==='dispatcher').length,activeTrucks:s.vehicles.filter(v=>v.status==='on_trip').length,orders:s.orders.length,trips:s.trips.length,tours:s.tours?.length||0,journal:s.accounting.journal.length});
 const blocks=new Map(),rows=[];
 for(let day=1;day<=6;day++){
  for(const v of s.vehicles) v.condition=Math.max(v.condition,85);
  for(const e of [...s.drivers,...s.employees])if(e.satisfaction<75){e.satisfaction=75;e.consecutiveLowSatisfactionDays=0;}
  for(let i=0;i<500;i++){
   const v=s.vehicles[Math.floor(i/2)],from=v.locationCity||s.branches.find(b=>b.id===v.branchId).city,to=nearest(from)[(i+day)%3];
   s.orders.push({...structuredClone(templates.order),id:'profile_o'+day+'_'+i,fromCity:from,toCity:to,paymentCents:Math.max(65000,getDistance(from,to)*350),tons:8,publishedAtMin:s.gameTime,earliestPickupMin:s.gameTime+(i%4)*15,acceptDeadlineMin:s.gameTime+1440,latestLoadStartMin:s.gameTime+1440,deliveryDeadlineMin:s.gameTime+2880,source:'benchmark'});
  }
  const start=s.gameTime,before=quantities(),delivered=s.stats.totalDeliveries;
  let session,post;if(day===6){session=new inspector.Session();session.connect();post=method=>new Promise((resolve,reject)=>session.post(method,(e,r)=>e?reject(e):resolve(r)));await post('Profiler.enable');await post('Profiler.start');}
  const t=performance.now();applyCommand(s,'advanceTime',{minutes:1440,silentPhoneAdvance:true});const engineMs=performance.now()-t;
  assert.equal(s.gameTime,start+1440);assert.equal(s.vehicles.length,250);assert.equal(s.branches.length,10);
  if(session){const {profile}=await post('Profiler.stop');session.disconnect();const nodes=new Map(profile.nodes.map(n=>[n.id,n])),counts=new Map();for(let i=0;i<profile.samples.length;i++){const n=nodes.get(profile.samples[i]),key=n.callFrame.functionName+' '+n.callFrame.url.split('/').pop()+':'+n.callFrame.lineNumber;counts.set(key,(counts.get(key)||0)+profile.timeDeltas[i]);}fs.writeFileSync(out+'/profile.json',JSON.stringify({engineMs,units:'sampled self microseconds',top:[...counts].sort((a,b)=>b[1]-a[1]).slice(0,35)},null,2));}
  const ct=performance.now();s=await compactHistory(s);s=writeHistoryBlocks({put:(v,k)=>blocks.set(k,v)},'profile',s);const compactionMs=performance.now()-ct;
  const row={day,warmup:day<=2,profiled:day===6,engineMs,compactionMs,before,after:quantities(),delivered:s.stats.totalDeliveries-delivered,activeBytes:Buffer.byteLength(JSON.stringify(s)),archivedBlocks:blocks.size};rows.push(row);
  fs.writeFileSync(out+'/days.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(row));
 }
 assert(rows.every(r=>r.delivered>0));
 const measured=rows.filter(r=>!r.warmup&&!r.profiled).map(r=>r.engineMs).sort((a,b)=>a-b);
 fs.writeFileSync(out+'/summary.json',JSON.stringify({node:process.version,baseCommit:arg('--commit','unspecified'),medianMs:measured[1],maxMs:Math.max(...measured),rows,method:'Isolated synthetic 250 trucks / 10 branches, 350 drivers, 60 ordinary dispatchers, capital and daily condition/morale floors. 500 synthetic offers/day plus natural market; real engine simulation and deliveries. Two warmup days, three measured consecutive days, one additional sampled day. Compaction and simulated archive staging outside engine time; no browser, actual IndexedDB, cloud, production saves or historical endurance process. Not a long-game proof; fleet size and game age need separate tests.'},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
