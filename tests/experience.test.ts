import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { createInitialState, applyCommand } from "@/lib/simulation/simulationEngine";
import { migrateState, checkAchievements } from "@/lib/simulation/progressEngine";
import { getDisruptionDetail, resolveDisruption } from "@/lib/simulation/disruptionEngine";
import { pushEvent } from "@/lib/simulation/eventLog";
import { postJournal } from "@/lib/simulation/accountingEngine";
import { getDayRecap, getUpcomingRiskCount } from "@/lib/experienceRecapData";
import { officeAtmosphere } from "@/lib/officeAtmosphere";
import { eventToToast, summarizeRoutineToasts } from "@/lib/eventNotifications";
import { setSoundEnabled, playExperienceSound } from "@/lib/experienceSound";
const fixture = vi.hoisted(() => ({state:null as any}));
vi.mock("@/lib/gameContext", () => ({ useGame: () => ({ state:fixture.state, motionEnabled:false }) }));
import LivingOffice from "@/components/office/LivingOffice";
import ShortGoals from "@/components/office/ShortGoals";
import DayRecap from "@/components/office/DayRecap";
function initial() { const s=createInitialState({}).state; applyCommand(s,"advanceTime",{minutes:0}); return s; }

describe("Spielgefühl – echte Daten und sichere Fortschritte", () => {
 it("ergänzt neue Ziele in Altständen ohne XP zu verdoppeln", () => {
  const s=initial();
  s.achievements=s.achievements.filter(a=>!["reliable_five","team_first_course","promise_first"].includes(a.id));
  const xp=s.xp;
  migrateState(s); migrateState(s);
  expect(s.xp).toBe(xp);
  expect(s.achievements.filter(a=>a.id==="reliable_five")).toHaveLength(1);
  s.stats.consecutiveTimely=5;
  const first=checkAchievements(s,s.gameTime);
  expect(first.filter(a=>a.id==="reliable_five")).toHaveLength(1);
  const after=s.xp;
  checkAchievements(s,s.gameTime);
  expect(s.xp).toBe(after);
  const restored=JSON.parse(JSON.stringify(s)); migrateState(restored); checkAchievements(restored,restored.gameTime);
  expect(restored.xp).toBe(after);
 });
 it("Weiterbildung und Termin belohnen nur abgeschlossene Ergebnisse",()=>{
  const s=initial(); s.training.enrollments=[{status:"reserved"}]; s.stats.promisesKept=0;
  expect(checkAchievements(s,s.gameTime).some(a=>["team_first_course","promise_first"].includes(a.id))).toBe(false);
  s.training.enrollments[0].status="completed"; s.stats.promisesKept=1;
  expect(checkAchievements(s,s.gameTime).map(a=>a.id)).toEqual(expect.arrayContaining(["team_first_course","promise_first"]));
 });
 it("zählt Lieferungen genau einmal und erhält sie über die 500-Meldungen-Grenze",()=>{
  const s=initial(); delete s.experienceRecap;
  const delivery={type:"delivery_completed",gameTime:500,details:{onTime:true},dedupKey:"delivery:test"};
  pushEvent(s,delivery); pushEvent(s,delivery);
  for(let i=0;i<700;i++) pushEvent(s,{type:"routine",gameTime:500,dedupKey:"noise:"+i});
  s.gameTime=1440;
  expect(getDayRecap(s,1)).toMatchObject({deliveries:1,onTime:1,partial:true});
  expect(s.events.length).toBe(500);
  expect(getDayRecap(JSON.parse(JSON.stringify(s)),1)).toEqual(getDayRecap(s,1));
 });
 it("begrenzt Rückblickdaten und ordnet Mitternacht korrekt zu",()=>{
  const s=initial(); delete s.experienceRecap;
  for(let d=1;d<=40;d++){s.gameTime=(d-1)*1440;pushEvent(s,{type:"delivery_completed",gameTime:s.gameTime,details:{onTime:false},dedupKey:"day:"+d});}
  expect(Object.keys(s.experienceRecap.days)).toHaveLength(14);
  expect(getDayRecap(s,39)).toMatchObject({deliveries:1,onTime:0,partial:false});
  expect(getDayRecap(s,40)).toBeNull();
  expect(getDayRecap(s,1)).toBeNull();
 });
 it("zeigt Buchungsergebnis statt Geldfluss – Kredit ist kein Ertrag",()=>{
  const s=initial(); delete s.experienceRecap;
  pushEvent(s,{type:"routine",gameTime:1440,dedupKey:"recap:start"});
  const before=s.accounting.dailySummary[2] || {revenue:0,expenses:0};
  const expected=before.revenue-before.expenses+700;
  postJournal(s,{text:"Testkredit",gameTime:1500,lines:[{account:"1000",debit:10000},{account:"2000",credit:10000}]});
  postJournal(s,{text:"Testumsatz",gameTime:1500,lines:[{account:"1000",debit:1000},{account:"4000",credit:1000}]});
  postJournal(s,{text:"Erlöskorrektur",gameTime:1500,lines:[{account:"4000",debit:300},{account:"1000",credit:300}]});
  s.gameTime=2880;
  expect(getDayRecap(s,2)?.result).toBe(expected);
 });
 it("behauptet keine historischen Ergebnisse vor Aktivierung",()=>{
  const s=initial(); delete s.experienceRecap; s.gameTime=14400;
  expect(getDayRecap(s,9)).toBeNull();
  pushEvent(s,{type:"routine",gameTime:14400,dedupKey:"new"}); s.gameTime=15840;
  expect(getDayRecap(s,11)).toMatchObject({deliveries:0,partial:false});
 });
 it("Ausblick nutzt tatsächliche deutsche Auftragsstatus und offene Fristen",()=>{
  const s={gameTime:100,orders:[{status:"angenommen",deliveryDeadlineMin:200},{status:"unterwegs",deliveryDeadlineMin:90},{status:"geliefert",deliveryDeadlineMin:200},{status:"offered",deliveryDeadlineMin:200},{status:"angenommen",deliveryDeadlineMin:99999}]};
  expect(getUpcomingRiskCount(s)).toBe(2);
 });
 it("Tageslicht folgt Spielzeit, auch über Tagesgrenzen",()=>{
  expect(officeAtmosphere(0).label).toBe("Nachtschicht");
  expect(officeAtmosphere(480)).toEqual(officeAtmosphere(1920));
  expect(officeAtmosphere(1200).label).toContain("Abend");
 });
 it("meldet Verspätung ehrlich und bündelt Bau- und Teamereignisse",()=>{
  expect(eventToToast({type:"delivery_completed",details:{onTime:false,paymentCents:100}}).title).toContain("Verspätung");
  const a=eventToToast({id:"a",type:"expansion_completed",details:{branchName:"Hamburg"}}); a._eventType="expansion_completed";
  const b=eventToToast({id:"b",type:"course_completed",details:{courseLabel:"ADR"}}); b._eventType="course_completed";
  expect(summarizeRoutineToasts([a,b]).body).toContain("Ausbau fertig");
  expect(summarizeRoutineToasts([a,b]).body).toContain("Weiterbildung");
 });
 it("Büro und Rückblick rendern mit Altständen ohne diese zu verändern",()=>{
  const s=initial(); delete s.experienceRecap; fixture.state=s;
  const before=JSON.stringify(s);
  const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,
   React.createElement(LivingOffice,{state:s}),React.createElement(ShortGoals,{state:s}),React.createElement(DayRecap,{state:s})));
  expect(html).toContain("Dein Betriebshof");
  expect(html).toContain("Fünf Punktlandungen");
  expect(html).toContain("nächsten Tageswechsel");
  expect(JSON.stringify(s)).toBe(before);
 });
 it("Störungsdetails bleiben aktuell und verändern die Simulation nicht",()=>{
  const s=initial(), order=s.orders[0];
  order.deliveryDeadlineMin=s.gameTime+95;
  const d={id:"test-delay",type:"loading_delay",status:"decision_open",createdAtMin:s.gameTime,orderIds:[order.id],delayMin:20,history:[],options:[]};
  s.disruptions.items.push(d);
  const before=JSON.stringify(s);
  const first=getDisruptionDetail(s,d.id);
  expect(first.orders[0].deadlineBufferMin).toBe(95);
  expect(JSON.stringify(s)).toBe(before);
  s.gameTime+=60;
  const current=getDisruptionDetail(s,d.id);
  expect(current.orders[0].deadlineBufferMin).toBe(35);
  d.options=current.options;
  resolveDisruption(s,d.id,"accept_delay",{});
  const result=getDisruptionDetail(s,d.id);
  expect(result.status).toBe("completed");
  expect(result.completionSummary).toContain("20");
 });
 it("deaktivierter Ton erzeugt keinen AudioContext",async()=>{
  const Constructor=vi.fn(); vi.stubGlobal("AudioContext",Constructor);
  await setSoundEnabled(false); playExperienceSound("success");
  expect(Constructor).not.toHaveBeenCalled(); vi.unstubAllGlobals();
 });
});
