// node bench/large-fleet.cjs [LKW=100] [historische Mails=0] [Wiederholungen=3]
// Engine + Structured-Clone messen; dies ist KEINE Browser-/UI-Zeitmessung.
const {applyCommand} = require('./harness.cjs');
const {makeLargeFleet} = require('../tests/fixtures/largeFleet.ts');
const {createHash} = require('crypto');
const count=Number(process.argv[2]||100), history=Number(process.argv[3]||0), runs=Number(process.argv[4]||3);
if(!Number.isInteger(count)||count<1||!Number.isInteger(history)||history<0||!Number.isInteger(runs)||runs<1) throw new Error('Ungültige Benchmark-Parameter');
Date.now=()=>1800000000000;
const initial=makeLargeFleet(count,history);
console.log(JSON.stringify({fixture:{vehicles:count,active:initial.vehicles.filter(v=>v.status==='on_trip').length,
  orders:initial.orders.length,dispatchers:initial.employees.length,bytes:Buffer.byteLength(JSON.stringify(initial))}}));
for(const minutes of [60,1440]) {
 const rows=[];
 for(let run=0;run<runs;run++) {
  let start=performance.now();const state=structuredClone(initial);const inputCloneMs=performance.now()-start;
  global.__BENCH={pd:0,btp:0,st:0,psv:0};
  start=performance.now();applyCommand(state,'advanceTime',{minutes,silentPhoneAdvance:true});const engineMs=performance.now()-start;
  start=performance.now();structuredClone(state);const outputCloneMs=performance.now()-start;
  if(state.gameTime!==initial.gameTime+minutes)throw new Error('Vorlauf nicht vollständig');
  rows.push({engineMs,inputCloneMs,outputCloneMs,plans:global.__BENCH.btp,delivered:state.stats.totalDeliveries,
   hash:createHash('sha256').update(JSON.stringify(state)).digest('hex')});
 }
 const median=key=>rows.map(r=>r[key]).sort((a,b)=>a-b)[Math.floor(rows.length/2)];
 console.log(JSON.stringify({minutes,medianMs:median('engineMs'),cloneMs:median('inputCloneMs')+median('outputCloneMs'),runs:rows}));
}
