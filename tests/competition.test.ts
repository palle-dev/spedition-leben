import { startCompetitionRental,processCompetitionCooperation } from "../src/lib/simulation/competitionCooperation";
import { describe,it,expect } from "vitest";
import { createInitialState,applyCommand } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { migrateCompetition,rivalCapacity,competitionPriceFactor,competitionDaily } from "../src/lib/simulation/competitionCore";
import { handleCompetitionCommand,processCompetition,getCompetitionEventTimes } from "../src/lib/simulation/competitionDeals";
import { getAccountBalance,postJournal } from "../src/lib/simulation/accountingEngine";
import { prepareLoadedState } from "../src/lib/saveSafety";
import { resolvePoachingAttempts } from "../src/lib/simulation/rivalBehaviorEngine";
const copy=x=>JSON.parse(JSON.stringify(x));
function fresh(){
 const s:any=createInitialState({}).state;applyCommand(s,"startWorld",{});
 postJournal(s,{text:"Testkapital",lines:[{account:"1000",debit:200000000},{account:"2000",credit:200000000}]});return s;
}
function cmd(s,c,p={}){return applyCommand(s,c,p).result;}
function inspect(s,id="hansen"){cmd(s,"inspectCompetitor",{rivalId:id});s.gameTime+=1440;processCompetition(s,s.gameTime);return s.competition.deals.at(-1);}
function advance(s,n,step=1440){for(let left=n;left>0;left-=Math.min(step,left))cmd(s,"advanceTime",{minutes:Math.min(step,left)});}
describe("persistent competition",()=>{
 it("migrates once without minting cash, vehicles or people",()=>{
  const s=fresh(),before=copy(s);migrateCompetition(s);migrateCompetition(s);expect(s).toEqual(before);
  for(const r of s.world.rivals){expect(r.business.vehicles).toHaveLength(r.fleet);expect(rivalCapacity(r)).toBe(r.fleet);}
 });
 it("does not touch inactive worlds or old promised order prices",()=>{
  const s:any=createInitialState({}).state;migrateCompetition(s);expect(s.competition).toBeUndefined();expect(competitionPriceFactor(s,"Bremen")).toBe(1);
 });
 it("charges an inspection once, rejects invalid/unaffordable offers without booking",()=>{
  const s=fresh(),before=s.company.accountCents;cmd(s,"inspectCompetitor",{rivalId:"hansen"});cmd(s,"inspectCompetitor",{rivalId:"hansen"});
  expect(s.company.accountCents).toBe(before-75000);s.gameTime+=1440;processCompetition(s,s.gameTime);
  const d=s.competition.deals[0];expect(()=>cmd(s,"offerCompetitorPurchase",{dealId:d.id,percent:0})).toThrow();
  s.company.accountCents=1;const count=s.accounting.journal.length;
  expect(()=>cmd(s,"offerCompetitorPurchase",{dealId:d.id,percent:100})).toThrow(/Firmenkonto/);expect(s.accounting.journal).toHaveLength(count);
 });
 it("negotiates without charging, then transfers existing assets once and clears escrow",()=>{
  const s=fresh(),d=inspect(s),r=s.world.rivals[0],count=s.vehicles.length,staff=s.drivers.length+s.employees.length;
  const cash=s.company.accountCents;const counter=cmd(s,"offerCompetitorPurchase",{dealId:d.id,percent:95});expect(counter.counterOffer).toBe(true);expect(s.company.accountCents).toBe(cash);
  const expectedStaff=r.business.staff.length;cmd(s,"offerCompetitorPurchase",{dealId:d.id,percent:100});cmd(s,"offerCompetitorPurchase",{dealId:d.id,percent:100});
  expect(getAccountBalance(s,"1320")).toBe(d.priceCents);expect(s.company.accountCents).toBe(cash-d.priceCents);
  r.jobs=[];s.gameTime=d.dueMin;processCompetition(s,s.gameTime);processCompetition(s,s.gameTime);
  expect(s.vehicles.length).toBe(count+r.fleet);expect(s.drivers.length+s.employees.length).toBe(staff+expectedStaff);
  expect(getAccountBalance(s,"1320")).toBe(0);expect(getAccountBalance(s,"1000")).toBe(s.company.accountCents);
  expect(r.businessStatus).toBe("acquired");expect(new Set(s.vehicles.map(v=>v.id)).size).toBe(s.vehicles.length);
  expect(s.accounting.assets.filter(a=>d.vehicleIds.includes(a.vehicleId)).reduce((n,a)=>n+a.acquisitionCostCents,0)).toBe(d.valuation.vehicleCents);
 });
 it("waits for active rival transports and excludes integrating companies from the market",()=>{
  const s=fresh(),d=inspect(s),r=s.world.rivals[0];r.jobs=[{tenderId:"test",endMin:s.gameTime+5*1440,paymentCents:100000}];
  cmd(s,"offerCompetitorPurchase",{dealId:d.id,percent:100});expect(d.dueMin).toBe(r.jobs[0].endMin);
  expect(competitionPriceFactor(s,r.city)).toBe(1);s.gameTime=d.dueMin;processCompetition(s,s.gameTime);expect(d.status).toBe("integrating");
  r.jobs=[];processCompetition(s,s.gameTime);expect(d.status).toBe("completed");
 });
 it("expires inspections and preserves migration through export/load",()=>{
  const s=fresh(),d=inspect(s);const loaded:any=prepareLoadedState(copy(s));const restored=loaded.state||loaded;
  expect(restored.competition).toEqual(s.competition);restored.gameTime=d.expiresMin;processCompetition(restored,restored.gameTime);
  expect(()=>cmd(restored,"offerCompetitorPurchase",{dealId:d.id,percent:100})).toThrow();
 });
 it("offers a real employee, awaits confirmation and transfers the same person without an extra truck",()=>{
  const s=fresh(),r=s.world.rivals[0],p=r.business.staff.find(p=>p.role==="dispatcher_senior"),trucks=s.vehicles.length;
  cmd(s,"approachCompetitorEmployee",{rivalId:r.id,personId:p.id,branchId:s.branches[0].id,salaryPercent:150});
  const a=s.competition.recruitments[0];a.willAccept=true;s.gameTime=a.dueMin;processCompetition(s,s.gameTime);
  expect(a.status).toBe("accepted");const cash=s.company.accountCents;
  cmd(s,"hireCompetitorEmployee",{recruitmentId:a.id});cmd(s,"hireCompetitorEmployee",{recruitmentId:a.id});
  expect(s.company.accountCents).toBe(cash-a.bonusCents);
  expect(()=>cmd(s,"inspectCompetitor",{rivalId:r.id})).toThrow();
  s.gameTime=a.dueMin;processCompetition(s,s.gameTime);processCompetition(s,s.gameTime);
  expect(s.employees.filter(e=>e.id===a.employeeId)).toHaveLength(1);expect(s.vehicles).toHaveLength(trucks);expect(p.status).toBe("departed");expect(rivalCapacity(r)).toBe(0);
  expect(s.training.qualifications.some(q=>q.personId===a.employeeId&&q.type==="dispatcher_senior")).toBe(true);
 });
 it("rejects repeated approaches and honors rejections and expired replies",()=>{
  const s=fresh(),r=s.world.rivals[0],p=r.business.staff[0],params={rivalId:r.id,personId:p.id,branchId:s.branches[0].id,salaryPercent:125};
  cmd(s,"approachCompetitorEmployee",params);expect(()=>cmd(s,"approachCompetitorEmployee",params)).toThrow();
  const a=s.competition.recruitments[0];a.willAccept=false;s.gameTime=a.dueMin;processCompetition(s,s.gameTime);expect(a.status).toBe("rejected");
  expect(()=>cmd(s,"hireCompetitorEmployee",{recruitmentId:a.id})).toThrow();
 });
 it("retains old daily history losslessly",()=>{
  const s=fresh();for(let i=0;i<110;i++){s.gameTime+=1440;competitionDaily(s,s.gameTime);}
  expect(s.competition.daily.length).toBeLessThanOrEqual(270);expect(s.historyOutbox.some(x=>x.kind==="competitionDaily")).toBe(true);
 });
 it("has identical day/hour/quarter-hour and server execution including pending recruiting",()=>{
  const s=fresh(),r=s.world.rivals[0];cmd(s,"approachCompetitorEmployee",{rivalId:r.id,personId:r.business.staff[0].id,branchId:s.branches[0].id,salaryPercent:125});
  expect(getCompetitionEventTimes(s)).toContain(s.competition.recruitments[0].dueMin);
  const day=copy(s),hour=copy(s),quarter=copy(s),server=copy(s);
  advance(day,2*1440);advance(hour,2*1440,60);advance(quarter,2*1440,15);serverCommand(server,"advanceTime",{minutes:1440});serverCommand(server,"advanceTime",{minutes:1440});
  for(const other of [hour,quarter,server]){expect(other.competition).toEqual(day.competition);expect(other.world.rivals).toEqual(day.world.rivals);expect(other.company.accountCents).toBe(day.company.accountCents);}
 });
 it("does not steal a driver from a running trip or mint a competitor truck",()=>{
  const s=fresh(),d=s.drivers[0],r=s.world.rivals[0],fleet=r.fleet;d.satisfaction=10;
  const a={id:"test_poach",status:"pending",driverId:d.id,rivalId:r.id,rivalName:r.name,deadlineMin:s.gameTime,offerDailyWageCents:20000};
  s.rivalBehavior.pendingPoachingAttempts=[a];s.trips.push({id:"test",driverId:d.id,status:"in_progress"});
  resolvePoachingAttempts(s,s.gameTime,[]);expect(d.employmentStatus).toBe("employed");
  s.trips=s.trips.filter(t=>t.id!=="test");resolvePoachingAttempts(s,s.gameTime,[]);
  expect(d.employmentStatus).toBe("terminated");expect(r.fleet).toBe(fleet);expect(r.business.staff.some(p=>p.id==="poached_"+d.id)).toBe(true);
 });
});

it("rents one real free truck, blocks selling and pays once on return",()=>{
 const s=fresh(),r=s.world.rivals[0],cash=s.company.accountCents,capacity=rivalCapacity(r),reserve=r.cashCents;
 for(const e of s.employees)e.assignedVehicleIds=[];
 expect(startCompetitionRental(s,r,s.gameTime,40000)).toBe(true);
 const rental=s.competition.rentals[0],v=s.vehicles.find(v=>v.id===rental.vehicleId);
 expect(v.status).toBe("rented_out");expect(rivalCapacity(r)).toBe(capacity-1);expect(r.cashCents).toBe(reserve-40000);
 expect(s.company.accountCents).toBe(cash);expect(()=>cmd(s,"sellVehicle",{vehicleId:v.id})).toThrow(/vermietet/);
 s.gameTime=rental.dueMin;processCompetitionCooperation(s,s.gameTime);processCompetitionCooperation(s,s.gameTime);
 expect(v.status).toBe("free");expect(s.company.accountCents).toBe(cash+40000);expect(rivalCapacity(r)).toBe(capacity);
});
it("integrates acquisitions identically through the real event loop and reuses same-city sites",()=>{
 const s=fresh(),d=inspect(s),city=s.world.rivals[0].city;
 const existing=s.branches.find(b=>b.city===city);const branches=s.branches.length;
 cmd(s,"offerCompetitorPurchase",{dealId:d.id,percent:100});const a=copy(s),b=copy(s);
 advance(a,3*1440);advance(b,3*1440,60);
 expect(a.competition).toEqual(b.competition);expect(a.vehicles).toEqual(b.vehicles);expect(a.company.accountCents).toBe(b.company.accountCents);
 expect(a.competition.deals[0].status).toBe("completed");expect(a.branches.length).toBe(branches+(existing?0:1));
 expect(getAccountBalance(a,"1320")).toBe(0);
});
