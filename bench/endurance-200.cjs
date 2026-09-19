// Controlled scaling/age stress test. No production saves, cloud or UI calls.
// node bench/endurance-200.cjs [days=200] [output=/tmp/frachtfieber-endurance]
const fs=require('fs'),{performance}=require('perf_hooks'),{execFileSync}=require('child_process');
const {applyCommand}=require('./harness.cjs');
const {createInitialState}=require('../src/lib/simulation/simulationEngine.ts');
const {CITIES,getDistance}=require('../src/lib/simulation/gameRules.ts');
const {postJournal,registerAsset}=require('../src/lib/simulation/accountingEngine.ts');
const days=Number(process.argv[2]||200),out=process.argv[3]||'/tmp/frachtfieber-endurance';
if(!Number.isInteger(days)||days<1||days>200)throw Error('days must be 1..200');
fs.mkdirSync(out,{recursive:true});
const s=createInitialState({companyName:'Lasttest 200 Tage',playerName:'Benchmark',partnerName:'Test'}).state;
applyCommand(s,'advanceTime',{minutes:0});
postJournal(s,{text:'Lasttestkapital',lines:[{account:'1000',debit:100000000000},{account:'2020',credit:100000000000}]});
const templates={vehicle:structuredClone(s.vehicles[0]),driver:structuredClone(s.drivers[0]),order:structuredClone(s.orders[0]),branch:structuredClone(s.branches[0])};
applyCommand(s,'hireEmployee',{applicantId:s.availableApplicants.find(a=>a.role==='dispatcher').id});
templates.dispatcher=structuredClone(s.employees[0]);
s.vehicles=[];s.drivers=[];s.employees=[];s.orders=[];s.branches=[];
applyCommand(s,'applyDelegationPreset',{presetId:'daily_relief'});
s.delegation.rules.maxSpendPerActionCents=100000000;s.delegation.rules.dailyBudgetCents=1000000000;s.delegation.rules.autoAcceptOrders=true;s.delegation.rules.autoDispatch=true;
const cities=['Hamburg','Bremen','Kiel','Hannover','Berlin','Köln','Frankfurt','München','Leipzig','Stuttgart'];
const metadata={startedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),days,seed:s.rngSeed,node:process.version,method:'continuous engine advanceTime(1440), every day measured; no browser/render/cloud time',growth:'25 trucks and 1 branch on days 1,21,41,61,81,101,121,141,161,181',controls:'Synthetic fleet/branch/staff provisioning outside timing; 35 drivers and 6 ordinary dispatchers per branch. Daily 2 new test offers per truck; destinations among nearest 3 cities. Capital injection, daily condition floor 85 and satisfaction floor 75 maintain load. No history removal; travel, rest, illness, disruptions and natural market remain engine-controlled.'};
fs.writeFileSync(out+'/metadata.json',JSON.stringify(metadata,null,2));fs.writeFileSync(out+'/days.jsonl','');
const nearest=city=>CITIES.filter(c=>c!==city).sort((a,b)=>getDistance(city,a)-getDistance(city,b)).slice(0,3);
function expand(index){
 const id='load_b'+index,city=cities[index];
 s.branches.push({...structuredClone(templates.branch),id,city,name:'Lasttest '+city,isHeadquarters:index===0,openedAtMin:s.gameTime,stats:{revenueCents:0,deliveries:0,expensesCents:0}});
 for(let i=0;i<25;i++){
  const v={...structuredClone(templates.vehicle),id:'load_v'+index+'_'+i,branchId:id,locationCity:city,acquiredAtMin:s.gameTime};s.vehicles.push(v);
  registerAsset(s,{vehicleId:v.id,account:'1200',name:v.id,acquisitionCostCents:v.bookValueCents,acquiredAtMin:s.gameTime});
 }
 for(let i=0;i<35;i++)s.drivers.push({...structuredClone(templates.driver),id:'load_d'+index+'_'+i,name:'Testfahrer '+index+'/'+i,branchId:id,locationCity:city,employedDay:Math.floor(s.gameTime/1440)+1});
 for(let i=0;i<6;i++)s.employees.push({...structuredClone(templates.dispatcher),id:'load_e'+index+'_'+i,name:'Testdisponent '+index+'/'+i,branchId:id,assignedBranchId:id,locationCity:city,workMode:'autonomous',lastDecisionMin:null,suggestions:[]});
}
function quantities(){return{vehicles:s.vehicles.length,branches:s.branches.length,drivers:s.drivers.length,dispatchers:s.employees.filter(e=>e.role==='dispatcher').length,activeTrucks:s.vehicles.filter(v=>v.status==='on_trip').length,freeTrucks:s.vehicles.filter(v=>v.status==='free').length,orders:s.orders.length,offered:s.orders.filter(o=>o.status==='offered').length,accepted:s.orders.filter(o=>o.status==='angenommen').length,trips:s.trips.length,tours:(s.tours||[]).length,journal:(s.accounting?.journal||[]).length,mails:(s.mail?.messages||[]).length,bookings:s.bookings.length};}
try{
 for(let day=1;day<=days;day++){
  if((day-1)%20===0)expand(Math.floor((day-1)/20));
  let repairs=0,morale=0;
  for(const v of s.vehicles){if(v.condition<85){v.condition=85;repairs++;}}
  for(const e of [...s.drivers,...s.employees])if(e.satisfaction<75){e.satisfaction=75;e.consecutiveLowSatisfactionDays=0;morale++;}
  for(let i=0;i<s.vehicles.length*2;i++){
   const v=s.vehicles[Math.floor(i/2)],from=v.locationCity||s.branches.find(b=>b.id===v.branchId).city,to=nearest(from)[(i+day)%3];
   s.orders.push({...structuredClone(templates.order),id:'load_o'+day+'_'+i,fromCity:from,toCity:to,paymentCents:Math.max(65000,getDistance(from,to)*350),tons:8,publishedAtMin:s.gameTime,earliestPickupMin:s.gameTime+(i%4)*15,acceptDeadlineMin:s.gameTime+1440,latestLoadStartMin:s.gameTime+1440,deliveryDeadlineMin:s.gameTime+2880,source:'benchmark'});
  }
  const startTime=s.gameTime,before=quantities(),deliveredBefore=s.stats.totalDeliveries;
  let t=performance.now();const inputBytes=Buffer.byteLength(JSON.stringify(s)),serializeMs=performance.now()-t;
  t=performance.now();structuredClone(s);const inputCloneMs=performance.now()-t;
  global.__BENCH={pd:0,btp:0,st:0,psv:0};
  t=performance.now();const result=applyCommand(s,'advanceTime',{minutes:1440,silentPhoneAdvance:true});const engineMs=performance.now()-t;
  if(s.gameTime!==startTime+1440)throw Error('Incomplete advance day '+day+': '+s.gameTime+' expected '+(startTime+1440)+' '+JSON.stringify(result));
  t=performance.now();structuredClone(s);const outputCloneMs=performance.now()-t;
  const row={day,startGameDay:Math.floor(startTime/1440)+1,endGameDay:Math.floor(s.gameTime/1440)+1,gameTime:s.gameTime,engineMs,inputCloneMs,outputCloneMs,serializeMs,inputBytes,outputBytes:Buffer.byteLength(JSON.stringify(s)),before,after:quantities(),delivered:s.stats.totalDeliveries-deliveredBefore,totalDelivered:s.stats.totalDeliveries,plans:global.__BENCH.btp,suggestions:global.__BENCH.st,dispatcherCalls:global.__BENCH.pd,heapMB:process.memoryUsage().heapUsed/1048576,controls:{conditionRestored:repairs,moraleRestored:morale},cashCents:s.company.accountCents};
  fs.appendFileSync(out+'/days.jsonl',JSON.stringify(row)+'\n');console.log(JSON.stringify({day,vehicles:row.after.vehicles,branches:row.after.branches,seconds:+(engineMs/1000).toFixed(3),delivered:row.delivered,active:row.after.activeTrucks,orders:row.after.orders,MB:+(row.outputBytes/1048576).toFixed(2)}));
  if(day%20===0||day===days){fs.writeFileSync(out+'/state-day'+day+'.json',JSON.stringify(s));}
 }
 fs.writeFileSync(out+'/done.json',JSON.stringify({completed:true,days,gameTime:s.gameTime,finishedAt:new Date().toISOString()}));
}catch(e){fs.writeFileSync(out+'/error.json',JSON.stringify({message:e.message,stack:e.stack,gameTime:s.gameTime}));throw e;}
