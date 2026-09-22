import {it,expect,vi} from "vitest";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {electricFields,ENERGY_RULES as R} from "@/lib/simulation/electricCatalog";
import {VEHICLE_CATALOG,CITIES} from "@/lib/simulation/gameRules";
import {migrateEnergy,emptyEnergySite,processEnergyUntil} from "@/lib/simulation/energyEngine";
import {buildTourPlan,buildDeployment,confirmTour,suggestTours,processTours} from "@/lib/simulation/tourEngine";
const fixture=vi.hoisted(()=>({state:null as any}));
vi.mock("@/lib/gameContext",()=>({useGame:()=>({state:fixture.state,send:vi.fn(),showToast:vi.fn(),busy:false})}));
import EnergyPanel from "@/components/branches/EnergyPanel";
import BuyVehicleDialog from "@/components/fleet/BuyVehicleDialog";
import LeaseVehicleDialog from "@/components/fleet/LeaseVehicleDialog";
function setup(){
 const s:any=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});s.company.accountCents=1e9;s.openCosts=[];
 const v=s.vehicles[0],d=s.drivers[0];Object.assign(v,electricFields(VEHICLE_CATALOG.electric_standard),{catalogId:"electric_standard",condition:100,status:"free",locationCity:"Hamburg",batteryKWh:100});
 Object.assign(d,{status:"free",locationCity:"Hamburg",workMinutesSinceRest:0,driveMinutesSinceBreak:0,restUntil:null});
 s.vehicles=[v];s.drivers=[d];s.employees=[];s.tutorial.active=false;
 s.orders=[{...s.orders[0],id:"electric-order",fromCity:"Hamburg",toCity:"München",tons:1,status:"offered",isDangerousGoods:false,
 cargo:"Stückgut",requiredBodyType:null,paymentCents:1000000,earliestPickupMin:s.gameTime,latestLoadStartMin:s.gameTime+10000,acceptDeadlineMin:s.gameTime+5000,deliveryDeadlineMin:s.gameTime+10000,history:[]}];
 return s;
}
const opts=s=>({vehicleId:s.vehicles[0].id,driverId:s.drivers[0].id,orderIds:s.orders.map(o=>o.id)});
it("completes a real electric delivery with charging, payment and no diesel booking",()=>{
 const s=setup(),v=s.vehicles[0],o=s.orders[0],plan=buildTourPlan(s,opts(s));expect(plan.ok).toBe(true);
 const result=confirmTour(s,opts(s)),trip=s.trips.find(t=>t.id===result.firstTripId);
 expect(trip.energy.stops.length).toBeGreaterThan(0);expect(trip.phases.some(p=>p.type==="charging")).toBe(true);
 const target=trip.endMin;
 for(let i=0;s.gameTime<target&&i<10;i++)applyCommand(s,"advanceTime",{minutes:Math.min(1440,target-s.gameTime),silentPhoneAdvance:true});
 expect(s.gameTime).toBe(target);expect(o.status).toBe("geliefert");expect(trip.status).toBe("completed");
 expect(v.batteryKWh).toBeCloseTo(trip.energy.finalBatteryKWh,6);
 const publicBookings=[...s.bookings,...(s.historyOutbox||[]).filter(x=>x.kind==="bookings").map(x=>x.data)].filter(b=>b.cause.startsWith("Ladestrom unterwegs"));
 expect(publicBookings).toHaveLength(1);expect(publicBookings[0].amountCents).toBe(-trip.energy.publicCostCents);
 expect(s.accounting.journal.some(e=>e.lines.some(l=>l.account==="5005"))).toBe(true);
});
it("carries remaining battery through a two-order chain and rejects charging-induced missed deadlines",()=>{
 const s=setup();s.orders.push({...structuredClone(s.orders[0]),id:"return",fromCity:"München",toCity:"Hamburg",deliveryDeadlineMin:s.gameTime+20000});
 const p=buildTourPlan(s,opts(s));expect(p.ok).toBe(true);expect(p.deployments[1].energy.startBatteryKWh).toBeCloseTo(p.deployments[0].energy.finalBatteryKWh,6);
 const diesel={...s.vehicles[0],powertrain:"diesel",consumptionPer100km:28};
 const ordinary=buildDeployment(s,s.orders[0],diesel,"Hamburg",s.gameTime,{workMin:0,driveMin:0});
 s.orders=[s.orders[0]];s.orders[0].deliveryDeadlineMin=ordinary.endMin+1;
 expect(suggestTours(s,{acceptNew:true,minNewOrderBufferMin:0}).suggestions).toHaveLength(0);
});
it("pauses an unreachable planned return without crashing the time advance",()=>{
 const s=setup(),v=s.vehicles[0],d=s.drivers[0];s.energy.closedPublicCities=CITIES;v.batteryKWh=32;
 const dep={status:"planned",startMin:s.gameTime,fromCity:"Hamburg",toCity:"München",phases:[{fromCity:"Hamburg"}],fuelCents:0,tollCents:0};
 s.tours=[{id:"paused-return",vehicleId:v.id,driverId:d.id,status:"active",deployments:[{status:"completed"}],returnDeployment:dep}];
 expect(()=>processTours(s,s.gameTime,[])).not.toThrow();expect(s.tours[0].pauseReason).toMatch(/Laderoute/);expect(s.trips).toHaveLength(0);
});
it("renders energy, buying and leasing for legacy games without mutating them",()=>{
 const s=setup();delete s.energy;fixture.state=s;const old=structuredClone(s);
 const energy=renderToStaticMarkup(React.createElement(EnergyPanel));
 expect(energy).toContain("Energie &amp; E-Mobilität");expect(energy).toContain("Gewerbespeicher");
 for(const Component of [BuyVehicleDialog,LeaseVehicleDialog]){
  const html=renderToStaticMarkup(React.createElement(Component,{branchId:s.branches[0].id,branchCity:"Hamburg",onClose:()=>{}}));
  expect(html).toContain("E-Regional-Lkw");expect(html).toContain("E-Fernverkehrs-Lkw");expect(html).toContain("kWh");
 }expect(s).toEqual(old);
});
it("keeps a 250-electric-truck / 10-depot energy day bounded and reports incremental runtime",()=>{
 const s=setup();s.gameTime=0;s.energy.lastMin=0;s.branches=[];s.vehicles=[];s.energy.sites={};
 for(let j=0;j<10;j++){const id="b"+j,city=CITIES[j];s.branches.push({id,city,status:"active",name:city});s.energy.sites[id]={...emptyEnergySite(),pvKwp:500,storageKWh:1000,storageKw:500,dcChargers:10,wallboxes:15,gridKw:650};for(let i=0;i<25;i++)s.vehicles.push({id:id+"v"+i,branchId:id,locationCity:city,status:"free",...electricFields(VEHICLE_CATALOG.electric_heavy),batteryKWh:54});}
 const start=performance.now();processEnergyUntil(s,1440);const ms=performance.now()-start;
 expect(s.energy.lastMin).toBe(1440);expect(s.vehicles).toHaveLength(250);expect(s.vehicles.every(v=>v.batteryKWh<=540&&v.batteryKWh>=54)).toBe(true);
 expect(Object.values(s.energy.sites).every((x:any)=>x.daily.length===1)).toBe(true);
 console.log(JSON.stringify({benchmark:"energy subsystem only; stationary synthetic fleet",trucks:250,depots:10,minutes:1440,elapsedMs:Math.round(ms*10)/10}));
});
