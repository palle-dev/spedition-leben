const {performance}=require("perf_hooks");
const b=require("./harness.cjs");
const {getDisruptionDetail}=require("../src/lib/simulation/disruptionEngine.ts");
const {processPhoneCommunications}=require("../src/lib/simulation/phoneCommunications.ts");
const s=b.makeState(); b.applyCommand(s,"advanceTime",{minutes:0});
s.company.accountCents=10000000;
for(let i=0;i<12;i++){const d={id:"stress-defect-"+i,type:"technical_defect",status:"decision_open",vehicleId:s.vehicles[i%s.vehicles.length].id,orderIds:[],createdAtMin:s.gameTime,delayMin:0,history:[],options:[]};s.disruptions.items.push(d);d.options=getDisruptionDetail(s,d.id).options;}
for(let i=0;i<10000;i++)s.mail.messages.push({id:"history-"+i,fromId:"system",toId:"player",subject:"Abgeschlossener Transport",body:"Lieferung abgeschlossen. Zahlung verbucht.",gameTime:s.gameTime-1440,category:"operations",priority:"normal",read:true});
const clone=global.structuredClone;let copies=0,cloneMs=0;
global.structuredClone=(x)=>{const t=performance.now();const r=clone(x);copies++;cloneMs+=performance.now()-t;return r;};
const bytes=JSON.stringify(s).length;const t=performance.now();
for(let i=0;i<30;i++)processPhoneCommunications(s,true);
const result={fixture:"12 offene Defekte, 10000 historische Nachrichten, 30 Kommunikationsprüfungen",bytes,ms:Math.round(performance.now()-t),copies,cloneMs:Math.round(cloneMs)};
console.log(JSON.stringify(result));
if(process.argv[2])require("fs").writeFileSync(process.argv[2],JSON.stringify(result,null,2));
