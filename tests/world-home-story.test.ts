import { it, expect } from "vitest";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { migrateWorld, processWorld, handleWorldCommand, worldAppointmentSlot } from "../src/lib/simulation/worldEngine";
import { worldScene } from "../src/lib/simulation/worldCatalog";
import { prepareLoadedState } from "../src/lib/saveSafety";
const id="own_dreams",DAY=1440,copy=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const s:any=createInitialState({}).state;handleWorldCommand(s,"startWorld",{});
 s.private.partnerId="alex";s.private.partnerName="Alex";s.private.relationshipStatus="dating";s.private.relationship=40;
 Object.assign(s.world.stories.home,{status:"done",stage:2,actorId:"alex",actorName:"Alex",decisions:[{stage:1,choiceId:"repeat"}]});
 Object.assign(s.world.stories.built_together,{status:"done",stage:5});
 return s;
}
function ready(){const s=fixture();migrateWorld(s);s.gameTime=s.world.stories[id].availableAtMin;processWorld(s,s.gameTime);return s;}
function choose(s,pick){return handleWorldCommand(s,"chooseWorldStory",{storyId:id,stage:s.world.stories[id].stage,choiceId:pick});}
function resolve(s){s.gameTime=s.world.stories[id].dueMin;processWorld(s,s.gameTime);}
it("migrates old saves once with a future pause and unchanged originals",()=>{
 const s=fixture();delete s.world.stories[id];s.gameTime=300*DAY;const original=copy(s.world.stories.home),money=s.private.accountCents;
 const loaded=prepareLoadedState(copy(s));expect(loaded.world.stories[id].availableAtMin).toBe(s.gameTime+14*DAY);
 expect(loaded.world.stories.home).toEqual(original);expect(loaded.private.accountCents).toBe(money);
 const before=copy(loaded.world);migrateWorld(loaded);expect(loaded.world).toEqual(before);
});
it("requires both completed stories and the whole pause",()=>{
 const s=fixture();s.world.stories.home.status="waiting";migrateWorld(s);expect(s.world.stories[id].availableAtMin).toBeNull();
 s.world.stories.home.status="done";migrateWorld(s);const due=s.world.stories[id].availableAtMin;
 s.gameTime=due-1;processWorld(s,s.gameTime);expect(s.world.stories[id].status).toBe("locked");
 s.gameTime=due;processWorld(s,s.gameTime);expect(s.world.stories[id].status).toBe("decision");
});
it("completes a free path without changing company funds or inventing appointments",()=>{
 const s=ready(),cash=s.company.accountCents,money=s.private.accountCents,n=s.appointments.length;
 for(const pick of ["curious","encourage","listen","gentle"]){choose(s,pick);resolve(s);}
 expect(s.world.stories[id].status).toBe("done");expect(s.world.stories[id].decisions).toHaveLength(4);
 expect(s.company.accountCents).toBe(cash);expect(s.private.accountCents).toBe(money);expect(s.appointments).toHaveLength(n);
 expect(s.world.stories[id].ending).toContain("ehrliche Antwort");
});
it("charges only the private account once, checks funds and preserves pending effects on reload",()=>{
 let s=ready();s.private.accountCents=0;expect(()=>choose(s,"evening")).toThrow(/Privatkonto/);
 choose(s,"curious");resolve(s);s.private.accountCents=10000;const company=s.company.accountCents,rel=s.private.relationship;
 choose(s,"materials");expect(s.private.accountCents).toBe(1000);expect(s.company.accountCents).toBe(company);
 expect(choose(s,"materials").alreadyApplied).toBe(true);expect(s.private.accountCents).toBe(1000);
 s=prepareLoadedState(copy(s));resolve(s);expect(s.private.relationship).toBe(rel+4);
 processWorld(s,s.gameTime);expect(s.private.relationship).toBe(rel+4);
});
it.each(["before","pause","appointment","pending"])("does not transfer the relationship story after a partner change: %s",phase=>{
 const s=fixture();if(phase!=="before")migrateWorld(s);
 if(["appointment","pending"].includes(phase)){s.gameTime=s.world.stories[id].availableAtMin;processWorld(s,s.gameTime);choose(s,phase==="appointment"?"evening":"curious");}
 const run=s.world.stories[id],ap=s.appointments.find(a=>a.id===run.appointmentId);
 s.private.partnerId="sam";s.private.partnerName="Sam";const rel=s.private.relationship;
 migrateWorld(s);processWorld(s,s.gameTime);
 expect(run.status).toBe("done");expect(run.pending).toBeNull();expect(s.private.relationship).toBe(rel);
 if(ap)expect(ap.status).toBe("cancelled");
});
it("follows renaming but ends on separation even if partner ID is unchanged",()=>{
 const s=ready();s.private.partnerName="Alexandra";processWorld(s,s.gameTime);
 expect(worldScene(s,s.world.stories[id]).text).toContain("Alexandra");
 choose(s,"curious");s.private.relationshipStatus="separated";const rel=s.private.relationship;processWorld(s,s.gameTime);
 expect(s.world.stories[id].status).toBe("done");expect(s.private.relationship).toBe(rel);
});
it("uses a nonoverlapping real appointment and remembers attendance without granting Jens rewards",()=>{
 const s=ready(),first=worldAppointmentSlot(s);
 s.appointments.push({id:"busy",status:"accepted",type:"test",...first});
 choose(s,"evening");const run=s.world.stories[id],ap=s.appointments.find(a=>a.id===run.appointmentId),friend=s.world.friend.quality;
 expect(ap.startMin).toBe(first.startMin+DAY);expect(ap.text).toContain("Alex");expect(ap.text).not.toContain("Jens");
 // Exercise the scheduler through the real command path; unrelated fixture appointment is no longer needed.
 s.appointments=s.appointments.filter(a=>a.id!=="busy");
 while(s.gameTime<ap.endMin)applyCommand(s,"advanceTime",{minutes:Math.min(DAY,ap.endMin-s.gameTime)});
 expect(ap.status).toBe("done");expect(run.lastAppointmentOutcome).toBe("attended");
 for(let day=0;day<3;day++)applyCommand(s,"advanceTime",{minutes:DAY});
 expect(worldScene(s,run).text).toContain("Ausstellungsbesuch klingt noch nach");
 expect(s.world.friend.quality).toBe(friend);
});
it("remembers cancellation honestly and suppresses attendance and happiness rewards",()=>{
 const s=ready();choose(s,"evening");const rel=s.private.relationship,happy=s.private.happiness,friend=s.world.friend.quality;
 handleWorldCommand(s,"cancelWorldAppointment",{storyId:id,stage:0});processWorld(s,s.gameTime);resolve(s);
 expect(s.private.relationship).toBe(rel-3);expect(s.private.happiness).toBe(happy);expect(s.world.friend.quality).toBe(friend);
 expect(worldScene(s,s.world.stories[id]).text).toContain("nicht stattgefunden");
});
it("matches daily hourly and server progression with pending private consequences",()=>{
 const a=ready();choose(a,"curious");const b=copy(a),c=copy(a);
 for(let day=0;day<3;day++){
  applyCommand(a,"advanceTime",{minutes:DAY});
  for(let h=0;h<24;h++)applyCommand(b,"advanceTime",{minutes:60});
  serverCommand(c,"advanceTime",{minutes:DAY});
 }
 expect(a.world).toEqual(b.world);expect(a.world).toEqual(c.world);
 expect(a.private.relationship).toBe(b.private.relationship);
});
