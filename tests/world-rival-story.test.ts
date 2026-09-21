import { it, expect } from "vitest";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { migrateWorld, processWorld, handleWorldCommand } from "../src/lib/simulation/worldEngine";
import { worldScene } from "../src/lib/simulation/worldCatalog";
import { prepareLoadedState } from "../src/lib/saveSafety";
const id="headwind",DAY=1440,copy=x=>JSON.parse(JSON.stringify(x));
function fixture(path="independent"){
 const s:any=createInitialState({}).state;handleWorldCommand(s,"startWorld",{});
 Object.assign(s.world.stories.built_together,{status:"done",stage:5,path});
 return s;
}
function ready(path="independent"){const s=fixture(path);migrateWorld(s);s.gameTime=s.world.stories[id].availableAtMin;processWorld(s,s.gameTime);return s;}
function choose(s,pick){return handleWorldCommand(s,"chooseWorldStory",{storyId:id,stage:s.world.stories[id].stage,choiceId:pick});}
function resolve(s){s.gameTime=s.world.stories[id].dueMin;processWorld(s,s.gameTime);}
it("adds a future 21-day pause to old saves, preserves history and migrates once",()=>{
 const s=fixture();delete s.world.stories[id];s.gameTime=300*DAY;
 const original=copy(s.world),loaded=prepareLoadedState(copy(s));
 expect(loaded.world.stories[id].availableAtMin).toBe(s.gameTime+21*DAY);
 expect(loaded.world.stories.built_together).toEqual(original.stories.built_together);
 expect(loaded.world.chronicle).toEqual(original.chronicle);
 const before=copy(loaded.world);migrateWorld(loaded);expect(loaded.world).toEqual(before);
});
it("waits for the completed parent, required rivals and the full pause",()=>{
 const s=fixture();s.world.stories.built_together.status="waiting";migrateWorld(s);expect(s.world.stories[id].availableAtMin).toBeNull();
 s.world.stories.built_together.status="done";const rival=s.world.rivals.pop();migrateWorld(s);expect(s.world.stories[id].availableAtMin).toBeNull();
 s.world.rivals.push(rival);migrateWorld(s);const due=s.world.stories[id].availableAtMin;
 s.gameTime=due-1;processWorld(s,s.gameTime);expect(s.world.stories[id].status).toBe("locked");
 s.gameTime=due;processWorld(s,s.gameTime);expect(s.world.stories[id].status).toBe("decision");
});
it("reads real reserves and relationships instead of inventing a crisis",()=>{
 const s=ready(),r=s.world.rivals.find(r=>r.id==="nordsprint"),run=s.world.stories[id];
 r.cashCents=13999;r.relationship=20;expect(worldScene(s,run).text).toContain("reicht nicht");
 expect(worldScene(s,run).text).toContain("Misstrauen");
 r.cashCents=14000;r.relationship=60;expect(worldScene(s,run).text).toContain("Geld für das reguläre Tagesgeschäft");
 expect(worldScene(s,run).text).not.toContain("Misstrauen");
});
it.each(["alliance","independent","corporate"])("remembers %s and completes the free path",path=>{
 const s=ready(path),cash=s.company.accountCents,privateCash=s.private.accountCents,identity=s.world.identity;
 choose(s,"respect");resolve(s);
 expect(worldScene(s,s.world.stories[id]).text).toContain({alliance:"Wir arbeiten zusammen",independent:"unabhängig bleiben",corporate:"mit Vera arbeitest"}[path]);
 for(const pick of ["questions","limits","fair"]){choose(s,pick);resolve(s);}
 expect(s.world.stories[id].status).toBe("done");expect(s.world.stories[id].decisions).toHaveLength(4);
 expect(s.world.stories[id].ending).toContain("Konkurrenzsimulation");
 expect(s.company.accountCents).toBe(cash);expect(s.private.accountCents).toBe(privateCash);expect(s.world.identity).toBe(identity);
});
it("checks costs, books once and restores a delayed outcome exactly once",()=>{
 let s=ready();s.company.accountCents=0;expect(()=>choose(s,"review")).toThrow(/Firmenkonto/);
 s.company.accountCents=100000;const privateCash=s.private.accountCents;choose(s,"review");
 expect(s.company.accountCents).toBe(50000);expect(s.private.accountCents).toBe(privateCash);
 expect(choose(s,"review").alreadyApplied).toBe(true);expect(s.company.accountCents).toBe(50000);
 expect(()=>choose(s,"respect")).toThrow(/bereits/);
 s=prepareLoadedState(copy(s));const price=s.world.reputation.price;resolve(s);
 expect(s.world.reputation.price).toBe(price+2);processWorld(s,s.gameTime);expect(s.world.reputation.price).toBe(price+2);
});
it("does not change rival assets, bids or live contracts when deciding",()=>{
 const s=ready(),rivals=copy(s.world.rivals),tenders=copy(s.world.tenders),orders=copy(s.orders);
 choose(s,"respect");expect(s.world.rivals).toEqual(rivals);expect(s.world.tenders).toEqual(tenders);expect(s.orders).toEqual(orders);
 // Stop unrelated economy events to isolate the delayed story effect.
 s.world.nextEconomyMin=Infinity;s.world.nextTenderMin=Infinity;
 for(const t of s.world.tenders)t.closeMin=Infinity;
 for(const r of s.world.rivals)for(const job of r.jobs)job.endMin=Infinity;
 const before=s.world.rivals.map(r=>({id:r.id,cash:r.cashCents,fleet:r.fleet,relation:r.relationship}));
 resolve(s);
 expect(s.world.rivals.map(r=>({id:r.id,cash:r.cashCents,fleet:r.fleet}))).toEqual(before.map(({relation,...r})=>r));
 expect(s.world.rivals.find(r=>r.id==="nordsprint").relationship).toBe(before.find(r=>r.id==="nordsprint").relation+6);
});
it("matches daily hourly and server progression for pending rival consequences",()=>{
 const a=ready();choose(a,"respect");const b=copy(a),c=copy(a);
 for(let day=0;day<3;day++){
  applyCommand(a,"advanceTime",{minutes:DAY});
  for(let h=0;h<24;h++)applyCommand(b,"advanceTime",{minutes:60});
  serverCommand(c,"advanceTime",{minutes:DAY});
 }
 expect(a.world).toEqual(b.world);expect(a.world).toEqual(c.world);
});
