import { it, expect } from "vitest";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { handleWorldCommand, processWorld, migrateWorld } from "../src/lib/simulation/worldEngine";
import { worldScene } from "../src/lib/simulation/worldCatalog";
import { prepareLoadedState } from "../src/lib/saveSafety";
const id="people_behind_tours",DAY=1440,copy=x=>JSON.parse(JSON.stringify(x));
function fixture(background="invest"){
 const s:any=createInitialState({}).state;handleWorldCommand(s,"startWorld",{});
 const d=s.drivers[0];d.satisfaction=40;
 Object.assign(s.world.stories.driver,{status:"done",stage:2,actorId:d.id,actorName:d.name,decisions:[{stage:0,choiceId:background},{stage:1,choiceId:"listen"}]});
 Object.assign(s.world.stories.built_together,{status:"done",stage:5});
 return s;
}
function ready(background="invest"){
 const s=fixture(background);migrateWorld(s);s.gameTime=s.world.stories[id].availableAtMin;processWorld(s,s.gameTime);return s;
}
function choose(s,pick){return handleWorldCommand(s,"chooseWorldStory",{storyId:id,stage:s.world.stories[id].stage,choiceId:pick});}
function resolve(s){s.gameTime=s.world.stories[id].dueMin;processWorld(s,s.gameTime);}
it("adds the team continuation to old saves without replaying decisions or charges",()=>{
 const s=fixture();delete s.world.stories[id];s.gameTime=200*DAY;
 const original=copy(s.world.stories.driver),cash=s.company.accountCents;
 const loaded=prepareLoadedState(copy(s));
 expect(loaded.world.stories[id].availableAtMin).toBe(s.gameTime+7*DAY);
 expect(loaded.world.stories[id].actorId).toBe(original.actorId);
 expect(loaded.world.stories.driver).toEqual(original);expect(loaded.company.accountCents).toBe(cash);
 const saved=copy(loaded.world);migrateWorld(loaded);expect(loaded.world).toEqual(saved);
});
it("waits for both parent stories and the full seven-day pause",()=>{
 const s=fixture();s.world.stories.built_together.status="waiting";migrateWorld(s);
 expect(s.world.stories[id].availableAtMin).toBeNull();
 s.world.stories.built_together.status="done";migrateWorld(s);const due=s.world.stories[id].availableAtMin;
 s.gameTime=due-1;processWorld(s,s.gameTime);expect(s.world.stories[id].status).toBe("locked");
 s.gameTime=due;processWorld(s,s.gameTime);expect(s.world.stories[id].status).toBe("decision");
});
it.each(["invest","honest","dismiss"])("remembers %s and completes the free path without changing qualifications",background=>{
 const s=ready(background),initial=copy(s.training),cash=s.company.accountCents;
 expect(s.world.stories[id].background).toBe(background);
 expect(worldScene(s,s.world.stories[id]).text).toContain({invest:"Geld für meine Entwicklung",honest:"damals ehrlich",dismiss:"um meinen Vertrag"}[background]);
 for(const pick of ["brief","respect","keep","honest"]){choose(s,pick);resolve(s);}
 expect(s.world.stories[id].status).toBe("done");expect(s.world.stories[id].decisions).toHaveLength(4);
 expect(s.world.stories[id].ending).toContain("keine Beförderung");
 expect(s.company.accountCents).toBe(cash);expect(s.training).toEqual(initial);
});
it("checks budget, books each paid decision once and restores delayed effects exactly once",()=>{
 let s=ready();s.company.accountCents=0;
 expect(()=>choose(s,"review")).toThrow(/Firmenkonto/);expect(s.world.stories[id].decisions).toHaveLength(0);
 s.company.accountCents=100000;choose(s,"review");expect(s.company.accountCents).toBe(65000);
 expect(choose(s,"review").alreadyApplied).toBe(true);expect(s.company.accountCents).toBe(65000);
 expect(()=>choose(s,"listen")).toThrow(/bereits/);
 const did=s.world.stories[id].actorId,before=s.drivers.find(d=>d.id===did).satisfaction;
 s=prepareLoadedState(copy(s));resolve(s);
 expect(s.drivers.find(d=>d.id===did).satisfaction).toBe(before+3);
 processWorld(s,s.gameTime);expect(s.drivers.find(d=>d.id===did).satisfaction).toBe(before+3);
});
it.each(["before","pause","decision","pending"])("never transfers the story or effects when a driver leaves: %s",phase=>{
 const s=fixture(),d=s.drivers[0];
 if(phase!=="before")migrateWorld(s);
 if(["decision","pending"].includes(phase)){s.gameTime=s.world.stories[id].availableAtMin;processWorld(s,s.gameTime);}
 if(phase==="pending")choose(s,"review");
 const other=s.drivers[1],otherBefore=copy(other),before=d.satisfaction;
 d.employmentStatus="left";migrateWorld(s);processWorld(s,s.gameTime);
 expect(s.world.stories[id].status).toBe("done");
 expect(s.world.stories[id].pending).toBeNull();expect(d.satisfaction).toBe(before);expect(other).toEqual(otherBefore);
});
it("follows a renamed driver and grants a bonus only to that person",()=>{
 const s=ready(),d=s.drivers[0];d.name="Mara Neumann";processWorld(s,s.gameTime);
 expect(worldScene(s,s.world.stories[id]).text).toContain("Mara Neumann");
 choose(s,"listen");resolve(s);const before=d.satisfaction,others=copy(s.drivers.slice(1)),cash=s.company.accountCents;
 choose(s,"bonus");expect(s.company.accountCents).toBe(cash-30000);expect(d.satisfaction).toBe(before);
 resolve(s);expect(d.satisfaction).toBe(before+7);expect(s.drivers.slice(1)).toEqual(others);
});
it("matches daily, hourly and server replay for pending team consequences",()=>{
 const a=ready();choose(a,"listen");const b=copy(a),c=copy(a);
 for(let day=0;day<3;day++){
  applyCommand(a,"advanceTime",{minutes:DAY});
  for(let h=0;h<24;h++)applyCommand(b,"advanceTime",{minutes:60});
  serverCommand(c,"advanceTime",{minutes:DAY});
 }
 expect(a.world).toEqual(b.world);expect(a.world).toEqual(c.world);
 expect(a.drivers.map(d=>d.satisfaction)).toEqual(b.drivers.map(d=>d.satisfaction));
});
