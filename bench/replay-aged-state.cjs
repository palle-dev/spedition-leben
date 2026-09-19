const fs=require('fs'),zlib=require('zlib'),{performance}=require('perf_hooks'),{createHash}=require('crypto');
const {applyCommand}=require('./harness.cjs');
Date.now=()=>1800000000000;
const fixture = process.argv[2] || 'audit/endurance-200/state-day40.json.gz';
const runs = Number(process.argv[3] || 3);
if (!Number.isInteger(runs) || runs < 1) throw Error('Invalid run count');
for(let run=0;run<runs;run++){
 const state=JSON.parse(zlib.gunzipSync(fs.readFileSync(fixture)));
 global.__BENCH={pd:0,st:0,btp:0,psv:0};
 const started=performance.now();applyCommand(state,'advanceTime',{minutes:1440,silentPhoneAdvance:true});const ms=performance.now()-started;
 const hash=createHash('sha256').update(JSON.stringify(state)).digest('hex');
 console.log(JSON.stringify({run,ms,hash,gameTime:state.gameTime,delivered:state.stats.totalDeliveries,plans:global.__BENCH.btp}));
}
