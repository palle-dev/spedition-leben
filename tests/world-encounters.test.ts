import { it, expect } from "vitest";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { migrateWorld, processWorld, handleWorldCommand } from "../src/lib/simulation/worldEngine";
import { prepareEncounter } from "../src/lib/simulation/worldEncounters";
import { prepareLoadedState } from "../src/lib/saveSafety";
import { compactHistory, portableHistory, restoreHistory, readLimited } from "../src/lib/historyArchive";
const DAY=1440,id="everyday",copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const s:any=createInitialState({}).state;handleWorldCommand(s,"startWorld",{});
 for(const r of Object.values(s.world.stories) as any[])if(r.id!==id){r.status="done";r.stage=5;}
 migrateWorld(s);return s;
}
function ready(){const s=fixture();s.gameTime=s.world.stories[id].availableAtMin;processWorld(s,s.gameTime);return s;}
function choose(s,pick="skip",episode=s.world.stories[id].episode){return handleWorldCommand(s,"chooseWorldStory",{storyId:id,stage:0,choiceId:pick,episode});}
function resolve(s){s.gameTime=s.world.stories[id].dueMin;processWorld(s,s.gameTime);}
function next(s){s.gameTime=s.world.stories[id].nextEncounterMin;processWorld(s,s.gameTime);}
it("migrates once with ten days notice and preserves existing history",()=>{
 const s=fixture();delete s.world.stories[id];delete s.world.encounterMemory;
 const old=copy(s.world),cash=s.company.accountCents,loaded=prepareLoadedState(copy(s));
 expect(loaded.world.stories[id].availableAtMin).toBe(s.gameTime+10*DAY);
 expect(loaded.world.chronicle).toEqual(old.chronicle);expect(loaded.company.accountCents).toBe(cash);
 const before=copy(loaded.world);migrateWorld(loaded);expect(loaded.world).toEqual(before);
});
it("waits for the parent finale and gives busy authored arcs priority",()=>{
 const s=fixture(),r=s.world.stories[id];r.availableAtMin=null;s.world.stories.built_together.status="locked";
 migrateWorld(s);expect(r.availableAtMin).toBeNull();
 s.world.stories.built_together.status="done";migrateWorld(s);
 s.world.stories.harbor.status="decision";s.world.stories.friend.status="decision";
 s.gameTime=r.availableAtMin;processWorld(s,s.gameTime);expect(r.status).toBe("locked");expect(r.availableAtMin).toBe(s.gameTime+DAY);
 s.world.stories.harbor.status="done";s.world.stories.friend.status="done";
 s.gameTime=r.availableAtMin;processWorld(s,s.gameTime);expect(r.status).toBe("decision");
});
it("keeps unanswered encounters open without expiry or replacement",()=>{
 const s=ready(),before=copy(s.world.stories[id]);
 s.gameTime+=90*DAY;processWorld(s,s.gameTime);expect(s.world.stories[id]).toEqual(before);
});
it("applies a saved delayed consequence once and guards duplicate commands",()=>{
 let s=ready();expect(s.world.stories[id].kind).toBe("friend");
 const friendship=s.world.friend.quality;choose(s,"reply");expect(choose(s,"reply").alreadyApplied).toBe(true);
 expect(()=>choose(s,"skip")).toThrow();s=prepareLoadedState(copy(s));resolve(s);
 expect(s.world.friend.quality).toBe(friendship+1);processWorld(s,s.gameTime);expect(s.world.friend.quality).toBe(friendship+1);
 expect(s.world.stories[id].nextEncounterMin).toBe(s.gameTime+10*DAY);
});
it("rejects a stale or missing episode even when stage and choice match",()=>{
 const s=ready(),episode=s.world.stories[id].episode;choose(s);resolve(s);next(s);
 expect(s.world.stories[id].episode).toBe(episode+1);
 expect(()=>choose(s,"skip",episode)).toThrow(/nicht mehr aktuell/);
 expect(()=>handleWorldCommand(s,"chooseWorldStory",{storyId:id,stage:0,choiceId:"skip"})).toThrow(/nicht mehr aktuell/);
 expect(s.world.stories[id].decisions).toHaveLength(0);
});
it("archives the entire scene, decision and result through portable save roundtrip",async()=>{
 const s=ready();choose(s);resolve(s);const old=copy(s.world.stories[id]);next(s);
 const row=s.historyOutbox.find(x=>x.kind==="worldEncounters");expect(row.data).toEqual(old);
 const archived=await compactHistory(s),restored=await restoreHistory(JSON.parse(JSON.stringify(await portableHistory(archived))));
 const chunk=restored.historyArchive.chunks.find(x=>x.kind==="history:worldEncounters");expect(chunk).toBeTruthy();
 const rows=JSON.parse(await (await readLimited(chunk.data.stream().pipeThrough(new DecompressionStream("gzip")))).text());
 expect(rows.some(x=>JSON.stringify(x.data)===JSON.stringify(old))).toBe(true);
});
it("keeps one live slot and bounded memory over 50 completed encounters",()=>{
 const s=ready(),seen=[];
 for(let n=0;n<50;n++){seen.push(s.world.stories[id].kind);choose(s);resolve(s);next(s);}
 expect(s.world.stories[id].episode).toBe(51);
 expect(s.historyOutbox.filter(x=>x.kind==="worldEncounters")).toHaveLength(50);
 expect(s.world.encounterMemory.recent.length).toBeLessThanOrEqual(3);
 expect(Object.keys(s.world.encounterMemory.lastByKind).length).toBeLessThanOrEqual(6);
 for(let i=1;i<seen.length;i++)expect(seen[i]).not.toBe(seen[i-1]);
});
it("uses only eligible actors and remembers the same person's prior choice",()=>{
 const s=fixture();s.drivers=[];s.private.partnerName=null;s.private.stress=0;s.world.rivals=[];
 const kinds=new Set();
 for(let n=0;n<12;n++){const r:any={};prepareEncounter(s,r,s.gameTime);kinds.add(r.kind);}
 expect([...kinds].sort()).toEqual(["friend","reflection"]);
 s.world.encounterMemory={sequence:0,recent:[],lastByKind:{friend:{actorId:s.world.friend.id,choice:"Jens persönlich antworten"}}};
 const r:any={};prepareEncounter(s,r,s.gameTime);expect(r.scene.text).toContain("Jens persönlich antworten");
});
it("does not transfer a pending relationship reward to a new partner",()=>{
 const s=fixture();s.private.partnerName="Alex";s.private.partnerId="alex";s.private.relationshipStatus="relationship";
 s.world.encounterMemory.recent=["friend","reflection","team"];s.world.encounterMemory.sequence=0;
 s.gameTime=s.world.stories[id].availableAtMin;processWorld(s,s.gameTime);expect(s.world.stories[id].kind).toBe("home");
 choose(s,"answer");s.private.partnerId="new";const relationship=s.private.relationship;resolve(s);
 expect(s.private.relationship).toBe(relationship);expect(s.world.stories[id].status).toBe("done");
});
it("matches hourly daily and server simulation across a cycle boundary",()=>{
 const a=ready();choose(a);resolve(a);a.world.stories[id].nextEncounterMin=a.gameTime+60;
 const b=copy(a),c=copy(a);applyCommand(a,"advanceTime",{minutes:DAY});
 for(let h=0;h<24;h++)applyCommand(b,"advanceTime",{minutes:60});
 serverCommand(c,"advanceTime",{minutes:DAY});
 expect(a.world).toEqual(b.world);expect(a.world).toEqual(c.world);
 expect(a.historyOutbox.filter(x=>x.kind==="worldEncounters")).toEqual(b.historyOutbox.filter(x=>x.kind==="worldEncounters"));
});
