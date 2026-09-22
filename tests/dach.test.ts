import {describe,it,expect,vi} from "vitest";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createInitialState,applyCommand} from "../src/lib/simulation/simulationEngine";
import {applyCommand as remoteCommand} from "../base44/shared/simulationEngine";
import {CITIES,EXTRA_LOCATIONS,countryOf,dachRoute} from "../src/lib/simulation/dachGeography";
import {DACH_RULE_VERSION,transportCosts,regulatorySteps,drivingWindow,regulatoryBudget,holiday} from "../src/lib/simulation/dachRules";
import {validateDachTransport,projectDachDelivery} from "../src/lib/simulation/dachEngine";
import {buildPhases,buildWorkSteps,computeFinalCounters} from "../src/lib/simulation/driverTimeEngine";
import {buildDeployment,buildTourPlan,confirmTour} from "../src/lib/simulation/tourEngine";
import {postJournal,getAccountBalance} from "../src/lib/simulation/accountingEngine";
import {prepareLoadedState} from "../src/lib/saveSafety";
import {generateMarketWave} from "../src/lib/simulation/marketEngine";
const fixture=vi.hoisted(()=>({state:null as any}));
vi.mock("@/lib/gameContext",()=>({useGame:()=>({state:fixture.state,send:vi.fn(),showToast:vi.fn()})}));
import DachPanel from "../src/components/branches/DachPanel";
function fresh(enabled=true){
 const s:any=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});
 postJournal(s,{text:"Testkapital",lines:[{account:"1000",debit:100000000},{account:"2000",credit:100000000}]});
 if(enabled)applyCommand(s,"activateDach",{});
 s.employees=[];s.tutorial.active=false;s.openCosts=[];
 const v=s.vehicles[0],d=s.drivers[0];s.vehicles=[v];s.drivers=[d];
 Object.assign(v,{condition:100,status:"free",locationCity:"München"});
 Object.assign(d,{status:"free",locationCity:"München",workMinutesSinceRest:0,driveMinutesSinceBreak:0,restUntil:null});
 s.orders=[{...s.orders[0],id:"dach-delivery",fromCity:"München",toCity:"Zürich",tons:1,status:"offered",isDangerousGoods:false,cargo:"Stückgut",requiredBodyType:null,paymentCents:1000000,
 earliestPickupMin:s.gameTime,latestLoadStartMin:s.gameTime+10000,acceptDeadlineMin:s.gameTime+5000,deliveryDeadlineMin:s.gameTime+10000,history:[],transportRulesVersion:DACH_RULE_VERSION}];
 return s;
}
const opts=s=>({vehicleId:s.vehicles[0].id,driverId:s.drivers[0].id,orderIds:s.orders.map(o=>o.id)});
const leg=(fromCity,toCity)=>({type:"loaded_drive",fromCity,toCity});
function advance(s,n,step=1440){for(let m=0;m<n;m+=Math.min(step,n-m))applyCommand(s,"advanceTime",{minutes:Math.min(step,n-m),silentPhoneAdvance:true});}
describe("DACH",()=>{
 it("covers all Austrian states and Swiss cantons, with shared routes and no duplicate cities",()=>{
  expect(CITIES).toHaveLength(73);expect(new Set(CITIES).size).toBe(73);
  expect(new Set(EXTRA_LOCATIONS.filter(x=>x[1]==="AT").map(x=>x[2])).size).toBe(9);
  expect(new Set(EXTRA_LOCATIONS.filter(x=>x[1]==="CH").map(x=>x[2])).size).toBe(26);
  for(const [a,b]of [["Hamburg","Wien"],["Bern","Graz"],["München","Zürich"]]){
   const r=dachRoute(a,b);expect(r.segments.reduce((s,x)=>s+x.distanceKm,0)).toBe(r.totalKm);expect(r.totalKm).toBe(dachRoute(b,a).totalKm);expect(r.crossing).toBeTruthy();
  }
 });
 it("charges LSVA on registered weight, Swiss customs once, and EV GO toll",()=>{
  const s=[leg("München","Zürich")],diesel=transportCosts({capacityTons:24},s),ev=transportCosts({capacityTons:24,powertrain:"electric"},s);
  expect(diesel.customsCents).toBe(6500);expect(ev.tollCents).toBe(0);expect(ev.customsCents).toBe(6500);
  const ch=diesel.breakdown.find(x=>x.country==="CH");expect(ch.cents).toBe(Math.round(ch.distanceKm*40*2.39*1.05));
  expect(transportCosts({capacityTons:24,powertrain:"electric"},[leg("Wien","Linz")]).tollCents).toBeGreaterThan(0);
  expect(transportCosts({capacityTons:12},[{...leg("München","Zürich"),type:"empty_drive"}]).customsCents).toBe(0);
 });
 it("observes national bans and holiday boundaries",()=>{
  expect(drivingWindow("DE",6*1440+600).blocked).toBe(true);expect(drivingWindow("DE",6*1440+1320).blocked).toBe(false);
  expect(drivingWindow("AT",5*1440+900).blocked).toBe(true);expect(drivingWindow("CH",1320).blocked).toBe(true);
  expect(drivingWindow("CH",300).blocked).toBe(false);expect(holiday("AT",1440)).toBe(true);
 });
 it("splits border legs without double distance and keeps legal waiting in predicted counters",()=>{
  const steps=regulatorySteps(buildWorkSteps("München",{fromCity:"München",toCity:"Zürich"})),p=buildPhases(steps,{workMin:0,driveMin:0},5*1440+800);
  expect(p.phases.some(x=>x.reason==="driving_ban")).toBe(true);expect(p.phases.filter(x=>x.type==="customs").reduce((n,x)=>n+x.durationMin,0)).toBe(90);
  expect(p.phases.reduce((n,x)=>n+(x.distanceKm||0),0)).toBe(dachRoute("München","Zürich").totalKm);
  expect(computeFinalCounters(p.phases).regulation).toEqual(p.finalRegulation);
  for(const phase of p.phases.filter(x=>x.type.endsWith("_drive"))){expect(drivingWindow(phase.country,phase.startMin).blocked).toBe(false);expect(drivingWindow(phase.country,phase.endMin-0.01).blocked).toBe(false);expect(phase.routeCoordinates).toHaveLength(2);}
 });
 it("enforces weekly and fortnight limits plus weekly rest without growing history",()=>{
  const l={weekIndex:0,thisWeek:3360,previousWeek:0,weeklyRestEndMin:0};expect(regulatoryBudget(l,5000,true).rest).toBeGreaterThanOrEqual(2700);
  expect(regulatoryBudget({...l,thisWeek:2500,previousWeek:2900},5000,true).rest).toBeGreaterThanOrEqual(2700);
  expect(regulatoryBudget({...l,thisWeek:0},8640,false).rest).toBe(2700);
 });
 it("protects old domestic promises and makes activation idempotent",()=>{
  const s=fresh(false),cash=s.company.accountCents;delete s.orders[0].transportRulesVersion;s.orders[0].fromCity="Hamburg";s.orders[0].toCity="Bremen";
  const old=buildDeployment(s,s.orders[0],s.vehicles[0],"Hamburg",s.gameTime,{workMin:0,driveMin:0});
  applyCommand(s,"activateDach",{});applyCommand(s,"activateDach",{});expect(s.company.accountCents).toBe(cash);
  const next=buildDeployment(s,s.orders[0],s.vehicles[0],"Hamburg",s.gameTime,{workMin:0,driveMin:0});expect(next).toEqual(old);
 });
 it("requires inbound load, limits cabotage, and preserves cooling-off across departure/re-entry",()=>{
  const s=fresh(),v=s.vehicles[0],local={fromCity:"Wien",toCity:"Linz",transportRulesVersion:DACH_RULE_VERSION};
  expect(validateDachTransport(s,local,v,1000)).toMatch(/zuerst/);
  projectDachDelivery(v,{fromCity:"München",toCity:"Wien"},500);
  expect(validateDachTransport(s,local,v,1000)).toBeNull();
  for(let i=0;i<3;i++)projectDachDelivery(v,local,600+i);
  expect(validateDachTransport(s,local,v,1000)).toMatch(/drei/);
  projectDachDelivery(v,null,900,{fromCity:"Linz",toCity:"München"});
  projectDachDelivery(v,{fromCity:"München",toCity:"Wien"},1000);
  expect(validateDachTransport(s,local,v,1100)).toMatch(/Abkühlfrist/);
  s.gameTime=8000;expect(validateDachTransport(s,local,v,18000)).toMatch(/siebentägigen/);
  expect(Object.keys(v.dachCabotage).length).toBeLessThanOrEqual(3);
 });
 it("blocks Swiss cabotage and international dangerous goods before dispatch",()=>{
  const s=fresh(),v=s.vehicles[0];expect(validateDachTransport(s,{fromCity:"Zürich",toCity:"Bern"},v,1000)).toMatch(/Schweizer Binnenauftrag/);
  expect(validateDachTransport(s,{fromCity:"München",toCity:"Zürich",isDangerousGoods:true},v,1000)).toMatch(/ADR/);
 });
 it("delivers a real Swiss order with one agency booking and persisted driver ledger",()=>{
  const s=fresh(),o=s.orders[0];expect(buildTourPlan(s,opts(s)).ok).toBe(true);
  const r=confirmTour(s,opts(s)),trip=s.trips.find(t=>t.id===r.firstTripId),end=trip.endMin;
  advance(s,end-s.gameTime);
  expect(o.status).toBe("geliefert");expect(trip.status).toBe("completed");expect(s.vehicles[0].locationCity).toBe("Zürich");
  expect(s.drivers[0].regulation.thisWeek).toBeGreaterThan(0);
  expect(s.bookings.filter(b=>b.cause.startsWith("Zollagentur:"))).toHaveLength(1);expect(getAccountBalance(s,"1000")).toBe(s.company.accountCents);
 });
 it("plans an international inbound plus a local follow-up with projected cabotage rights",()=>{
  const s=fresh();s.orders[0].toCity="Wien";s.orders.push({...s.orders[0],id:"local",fromCity:"Wien",toCity:"Linz",deliveryDeadlineMin:s.gameTime+15000});
  expect(buildTourPlan(s,opts(s)).ok).toBe(true);expect(s.vehicles[0].dachCabotage).toBeUndefined();
 });
 it("executes the same delivery with day/hour/quarter-hour advances and server engine",()=>{
  const origin=fresh();confirmTour(origin,opts(origin));
  const states=[1440,60,15].map(step=>{const s=structuredClone(origin);advance(s,4320,step);return s;});
  const remote=structuredClone(origin);for(let n=0;n<3;n++)remoteCommand(remote,"advanceTime",{minutes:1440,silentPhoneAdvance:true});
  for(const s of [...states.slice(1),remote])for(const key of ["gameTime","company","vehicles","drivers","dach"])expect(s[key],key).toEqual(states[0][key]);
 });
 it("generates only domestic offers before activation and tagged offers afterwards",()=>{
  const s=fresh(false);s.orders=[];generateMarketWave(s,s.gameTime,[]);expect(s.orders.every(o=>countryOf(o.fromCity)==="DE"&&countryOf(o.toCity)==="DE")).toBe(true);
  applyCommand(s,"activateDach",{});s.orders=[];generateMarketWave(s,s.gameTime,[]);
  expect(s.orders.every(o=>o.transportRulesVersion===DACH_RULE_VERSION)).toBe(true);
 });
 it("persists rules and counters through save preparation and renders legacy/active UI without mutation",()=>{
  const s=fresh();fixture.state=s;const before=structuredClone(s);
  expect(renderToStaticMarkup(React.createElement(DachPanel))).toContain("Routen- und Kostencheck");expect(s).toEqual(before);
  const result:any=prepareLoadedState(structuredClone(s));expect((result.state||result).dach).toEqual(s.dach);
  delete s.dach;fixture.state=s;expect(renderToStaticMarkup(React.createElement(DachPanel))).toContain("DACH-Betrieb aktivieren");
 });
});
