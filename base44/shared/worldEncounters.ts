import { preserveHistory } from "./historyRetention.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
export const ENCOUNTER_ID="everyday";
export const ENCOUNTER_STORY={id:ENCOUNTER_ID,title:"Begegnungen im Alltag",subtitle:"Kleine Momente, die eure Geschichte weiterschreiben.",chapters:1,unlockDays:0,kind:"Fortlaufende Spielwelt"};
const DAY=1440;
const blank=()=>({id:ENCOUNTER_ID,stage:0,status:"locked",availableAtMin:null,decisions:[],actorId:null,actorName:null,pending:null,dueMin:null});
export function ensureEncounters(state,now=state.gameTime){
 const w=state.world;if(!w?.active||!w.stories)return;
 w.stories[ENCOUNTER_ID] ||= blank();
 w.encounterMemory ||= {sequence:0,recent:[],lastByKind:{}};
 const run=w.stories[ENCOUNTER_ID];
 if(run.status==="locked"&&run.availableAtMin==null&&w.stories.built_together?.status==="done"&&w.stories.built_together.stage>=5)run.availableAtMin=now+10*DAY;
 if(run.status==="done"&&run.nextEncounterMin==null)run.nextEncounterMin=now+10*DAY;
}
export function cycleEncounter(state,now){
 const w=state.world,run=w?.stories?.[ENCOUNTER_ID];
 if(!run||run.status!=="done"||run.nextEncounterMin==null||now<run.nextEncounterMin)return;
 // Archive the full scene, choice and outcome before reusing the single live slot.
 preserveHistory(state,"worldEncounters",[run]);
 w.stories[ENCOUNTER_ID]={...blank(),availableAtMin:now};
}
const option=(id,label,text,effect={},costCents=0,account="private")=>({
 id,label,detail:text+" Wirkung nach zwei Spieltagen.",costCents,account,effect:{},
 delayed:{text:"Deine Entscheidung: "+label+". "+text,effect},
});
function sceneFor(state,kind,actorName){
 if(kind==="team")return {title:"Ein Wort vor der nächsten Tour",text:actorName+" bleibt kurz an der Bürotür stehen. „Keine große Sache. Ich wollte wissen, ob du gerade zwei Minuten hast.“ Es geht um das Gefühl, zwischen Fahrzeugnummern und Aufträgen noch gesehen zu werden.",choices:[
 option("listen","Kurz zuhören","Zufriedenheit dieser Person +2, deine Belastung +1.",{driver:2,stress:1}),
 option("thanks","Die geleistete Arbeit ausdrücklich würdigen","Zufriedenheit dieser Person +1.",{driver:1}),
 ]};
 if(kind==="home")return {title:"Eine Nachricht ohne Einkaufsliste",text:actorName+" schickt dir ein Bild aus dem Alltag. Keine Bitte, kein Termin: einfach etwas, das ihr miteinander teilen könnt. Wie möchtest du antworten?",choices:[
 option("answer","Mit einer persönlichen Nachricht antworten","Beziehung +1.",{relationship:1}),
 option("smile","Die kleine Freude teilen","Glück +1.",{happiness:1}),
 ]};
 if(kind==="rival")return {title:"Ein Gespräch am Rande",text:actorName+" begegnet dir am Kai. Heute liegt kein Angebot auf dem Tisch. Ihr sprecht darüber, was euch an eurer Arbeit gefällt. Auch Konkurrenz besteht nicht nur aus Geboten.",choices:[
 option("respect","Mit Interesse nachfragen","Verhältnis zu diesem Konkurrenten +1.",{}),
 option("brief","Freundlich grüßen und weitergehen","Belastung −1.",{stress:-1}),
 ]};
 if(kind==="breather")return {title:"Die Jacke bleibt einen Moment hängen",text:"Deine aktuelle Belastung ist hoch. Am Ausgang fällt dir auf, dass du die letzte Pause schon wieder verschoben hast. Für diesen Moment musst du nichts Neues zusagen.",choices:[
 option("pause","Bewusst einen Moment durchatmen","Belastung −2. Es wird kein Kalendertermin angelegt.",{stress:-2}),
 option("sort","Den nächsten kleinen Schritt festhalten","Belastung −1.",{stress:-1}),
 ]};
 if(kind==="friend")return {title:"Eine Postkarte vom Anleger",text:"Jens hat eine Postkarte geschickt. Auf der Rückseite steht: „Hier sieht es heute ganz anders aus als damals. Musste an dich denken.“ Zwischen den Geschäftspapieren fühlt sich die Handschrift vertraut an.",choices:[
 option("reply","Jens persönlich antworten","Freundschaft mit Jens +1.",{friend:1}),
 option("remember","Die Erinnerung genießen","Glück +1.",{happiness:1}),
 ]};
 return {title:"Der erste Schlüssel",text:"Beim Aufräumen findest du einen alten Schlüsselanhänger. Er erinnert dich daran, wie sich der Anfang angefühlt hat. Heute gehören andere Fragen zu deinem Alltag. Was möchtest du aus diesem Moment mitnehmen?",choices:[
 option("pride","Den bisherigen Weg würdigen","Glück +1.",{happiness:1}),
 option("calm","Für heute nicht alles gleichzeitig wollen","Belastung −1.",{stress:-1}),
 ]};
}
export function prepareEncounter(state,run,now){
 // Authored arcs take priority; an unanswered encounter never expires.
 const busy=Object.values(state.world.stories).filter((r:any)=>r.id!==ENCOUNTER_ID&&["decision","waiting","appointment"].includes(r.status)).length;
 if(busy>=2){run.availableAtMin=now+DAY;return false;}
 const w=state.world,m=w.encounterMemory,p=state.private;
 const candidates:any[]=[{kind:"friend",actorId:w.friend.id,actorName:w.friend.name},{kind:"reflection"}];
 const drivers=state.drivers.filter(d=>isActivelyEmployed(d)&&!d.isTempStaff);
 if(drivers.length){const d=drivers.reduce((best,d)=>(d.satisfaction??70)<(best.satisfaction??70)?d:best);candidates.push({kind:"team",actorId:d.id,actorName:d.name});}
 if(p.partnerName&&!["single","separated","divorced"].includes(p.relationshipStatus))candidates.push({kind:"home",actorId:String(p.partnerId||"partner_existing"),actorName:p.partnerName});
 if(p.stress>=60)candidates.push({kind:"breather"});
 if(w.rivals.length){const r=w.rivals[m.sequence%w.rivals.length];candidates.push({kind:"rival",actorId:r.id,actorName:r.person});}
 const fresh=candidates.filter(c=>!m.recent.includes(c.kind));
 const pool=fresh.length?fresh:candidates.filter(c=>c.kind!==m.recent[m.recent.length-1]);
 const selected=(pool.length?pool:candidates)[m.sequence%(pool.length||candidates.length)];
 Object.assign(run,selected,{episode:++m.sequence,openedAtMin:now});
 run.scene=sceneFor(state,run.kind,run.actorName);
 const last=m.lastByKind[run.kind];
 if(last&&last.actorId===run.actorId)run.scene.text+=" Beim letzten Mal hast du dich so entschieden: „"+last.choice+"“.";
 if(run.kind==="rival")run.scene.choices[0].delayed.effect={relations:{[run.actorId]:1}};
 run.scene.choices.push(option("skip","Diesmal vorbeiziehen lassen","Keine Kosten und keine Werteänderung."));
 m.recent=[...m.recent,run.kind].slice(-3);
 return true;
}
export function encounterActorPresent(state,run){
 if(run.kind==="team")return state.drivers.some(d=>d.id===run.actorId&&isActivelyEmployed(d)&&!d.isTempStaff);
 if(run.kind==="home")return !!state.private.partnerName&&!["single","separated","divorced"].includes(state.private.relationshipStatus)&&String(state.private.partnerId||"partner_existing")===run.actorId;
 if(run.kind==="rival")return state.world.rivals.some(r=>r.id===run.actorId);
 return true;
}
export function rememberEncounter(state,run,choice){
 state.world.encounterMemory.lastByKind[run.kind]={actorId:run.actorId,choice:choice.label,atMin:state.gameTime};
}
