import { describe, it, expect } from "vitest";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { migrateWorld, processWorld, handleWorldCommand, getWorldEventTimes } from "../src/lib/simulation/worldEngine";
import { worldScene } from "../src/lib/simulation/worldCatalog";
import { prepareLoadedState } from "../src/lib/saveSafety";
const DAY=1440, id="built_together";
const copy=x=>JSON.parse(JSON.stringify(x));
function legacy(path="independent"){
 const s:any=createInitialState({}).state;handleWorldCommand(s,"startWorld",{});
 s.world.stories.harbor={...s.world.stories.harbor,status:"done",stage:4,decisions:[{stage:3,choiceId:path,atMin:480}],ending:"Original ending"};
 delete s.world.stories[id];s.gameTime=200*DAY;
 return s;
}
function ready(path="independent"){
 const s=legacy(path);migrateWorld(s);s.gameTime=s.world.stories[id].availableAtMin;processWorld(s,s.gameTime);return s;
}
function choose(s,choiceId){return handleWorldCommand(s,"chooseWorldStory",{storyId:id,stage:s.world.stories[id].stage,choiceId});}
function resolve(s){s.gameTime=s.world.stories[id].dueMin;processWorld(s,s.gameTime);}
describe("Was wir aufgebaut haben",()=>{
 it("migrates completed old saves once without altering original history, balances or identity",()=>{
  const s=legacy("corporate"),old=copy(s.world),cash=s.company.accountCents;
  const loaded=prepareLoadedState(copy(s));
  expect(loaded.world.stories[id].path).toBe("corporate");
  expect(loaded.world.stories[id].availableAtMin).toBe(s.gameTime+7*DAY);
  expect(loaded.world.stories.harbor).toEqual(old.stories.harbor);
  expect(loaded.world.chronicle).toEqual(old.chronicle);
  expect(loaded.company.accountCents).toBe(cash);
  const before=copy(loaded.world);migrateWorld(loaded);expect(loaded.world).toEqual(before);
 });
 it("does not unlock before a valid finale and starts exactly after the pause",()=>{
  const s=legacy();s.world.stories.harbor.status="decision";migrateWorld(s);
  expect(s.world.stories[id].availableAtMin).toBeNull();
  expect(getWorldEventTimes(s).every(x=>typeof x==="number")).toBe(true);
  processWorld(s,s.gameTime);expect(s.world.stories[id].status).toBe("locked");
  s.world.stories.harbor.status="done";processWorld(s,s.gameTime);
  const due=s.world.stories[id].availableAtMin;
  s.gameTime=due-1;processWorld(s,s.gameTime);expect(s.world.stories[id].status).toBe("locked");
  s.gameTime=due;processWorld(s,s.gameTime);expect(s.world.stories[id].status).toBe("decision");
 });
 it.each(["alliance","independent","corporate"])("completes all five chapters from %s and preserves the original path",path=>{
  const s=ready(path),original=copy(s.world.stories.harbor),identity=s.world.identity;
  const title=worldScene(s,s.world.stories[id]).title;
  expect(title).toBe({alliance:"Ein Bündnis im Alltag",independent:"Dein Name auf dem Briefkopf",corporate:"Die kleine Fußnote"}[path]);
  for(const pick of ["limits","own","letter","honest","steady"]){choose(s,pick);resolve(s);}
  expect(s.world.stories[id].status).toBe("done");
  expect(s.world.stories[id].decisions).toHaveLength(5);
  expect(s.world.stories[id].ending).toContain("überschaubaren Zusagen");
  expect(s.world.stories.harbor).toEqual(original);expect(s.world.identity).toBe(identity);
  const ended=copy(s.world.stories[id]);processWorld(s,s.gameTime+30*DAY);expect(s.world.stories[id]).toEqual(ended);
 });
 it("guards costs and repeats, preserves pending consequences through reload",()=>{
  const s=ready("alliance");s.company.accountCents=0;
  expect(()=>choose(s,"joint")).toThrow(/Firmenkonto/);
  expect(s.world.stories[id].decisions).toHaveLength(0);
  s.company.accountCents=100000;choose(s,"joint");expect(s.company.accountCents).toBe(40000);
  expect(choose(s,"joint").alreadyApplied).toBe(true);expect(s.company.accountCents).toBe(40000);
  expect(()=>choose(s,"limits")).toThrow(/bereits/);
  const loaded=prepareLoadedState(copy(s)),quality=loaded.world.reputation.quality;
  resolve(loaded);expect(loaded.world.reputation.quality).toBe(quality+2);
  processWorld(loaded,loaded.gameTime);expect(loaded.world.reputation.quality).toBe(quality+2);
  expect(worldScene(loaded,loaded.world.stories[id]).text).toContain("gemeinsame Vorbereitung");
 });
 it("cancels Jens' meeting without granting attendance or happiness rewards",()=>{
  const s=ready();for(const pick of ["limits","own"]){choose(s,pick);resolve(s);}
  choose(s,"meet");const run=s.world.stories[id],ap=s.appointments.find(a=>a.id===run.appointmentId);
  expect(ap.text).toBe("Mit Jens am alten Anleger");
  const happiness=s.private.happiness,friend=s.world.friend.quality;
  handleWorldCommand(s,"cancelWorldAppointment",{storyId:id,stage:2});processWorld(s,s.gameTime);resolve(s);
  expect(s.private.happiness).toBe(happiness);expect(s.world.friend.quality).toBe(friend-3);
  expect(s.world.stories[id].stage).toBe(3);
 });
 it("uses the real scheduler for Jens' attendance and delayed consequence",()=>{
  const s=ready();for(const pick of ["limits","own"]){choose(s,pick);resolve(s);}
  choose(s,"meet");const ap=s.appointments.find(a=>a.id===s.world.stories[id].appointmentId);
  while(s.gameTime<ap.endMin)applyCommand(s,"advanceTime",{minutes:Math.min(DAY,ap.endMin-s.gameTime)});
  expect(ap.status).toBe("done");expect(s.world.stories[id].status).toBe("waiting");
  for(let i=0;i<3;i++)applyCommand(s,"advanceTime",{minutes:DAY});
  expect(s.world.stories[id].stage).toBe(3);
  expect(s.world.chronicle.some(e=>e.title==="Zeit, die du dir genommen hast"&&e.cause.storyId===id)).toBe(true);
 });
 it("matches daily, hourly and server progression across continuation activation",()=>{
  const a=legacy();migrateWorld(a);a.world.stories[id].availableAtMin=a.gameTime+DAY;
  const b=copy(a),c=copy(a);
  for(let d=0;d<2;d++){
   applyCommand(a,"advanceTime",{minutes:DAY});
   for(let h=0;h<24;h++)applyCommand(b,"advanceTime",{minutes:60});
   serverCommand(c,"advanceTime",{minutes:DAY});
  }
  for(const s of [a,b,c])applyCommand(s,"chooseWorldStory",{storyId:id,stage:0,choiceId:"limits"});
  for(let d=0;d<3;d++){
   applyCommand(a,"advanceTime",{minutes:DAY});
   for(let h=0;h<24;h++)applyCommand(b,"advanceTime",{minutes:60});
   serverCommand(c,"advanceTime",{minutes:DAY});
  }
  expect(a.world).toEqual(b.world);expect(a.world).toEqual(c.world);
 });
});
