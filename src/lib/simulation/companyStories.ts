import { preserveHistory } from "./historyRetention.ts";
const DAY=1440;
const employed=(s,id)=>(s.drivers||[]).find(p=>p.id===id&&p.employmentStatus==="employed");
function finish(s,a,status){a.status=status;a.closedAtMin=s.gameTime;preserveHistory(s,"events",[{id:"company_story:"+a.id,type:"company_story",gameTime:s.gameTime,isSystem:true,seen:true,details:structuredClone(a)}]);s.journey.nextArcMin=s.gameTime+10*DAY;}
export function processCompanyStories(s,m){
 const j=s.journey;if(!j)return;
 const active=j.arcs.find(a=>a.status==="decision"||a.status==="waiting");
 if(active){if(!employed(s,active.driverId))finish(s,active,"departed");return;}
 if(m<j.nextArcMin||!j.path||s.scenario?.status==="active")return;
 const moment=[...j.moments].reverse().find(x=>x.atMin>=(j.lastStoryMomentMin??j.sinceMin)&&employed(s,x.driverId));
 if(!moment)return;
 const person=employed(s,moment.driverId);j.storySeq=(j.storySeq||0)+1;
 j.arcs.push({id:String(j.storySeq),driverId:person.id,name:person.name,customer:moment.customer||"einem Kunden",causeMin:moment.atMin,createdAtMin:m,stage:0,status:"decision",path:j.path,deliveries:0,trained:false,choices:[]});
 j.lastStoryMomentMin=moment.atMin+1;
 while(j.arcs.length>6)j.arcs.shift(); // Every completed episode was already archived losslessly.
}
export function recordCompanyStoryEvent(s,e){
 const a=s.journey?.arcs?.find(a=>a.status==="waiting");if(!a)return;
 if(e.type==="delivery_completed"&&e.driverId===a.driverId&&e.details?.onTime){a.deliveries++;if(e.details.customer===a.customer)a.customerDeliveries=(a.customerDeliveries||0)+1;}
 if(e.type==="course_completed"&&(e.personId===a.driverId||e.driverId===a.driverId))a.trained=true;
 if((a.focus==="learning"&&a.trained)||(a.focus==="quality"&&a.deliveries>=5)){a.stage=2;a.status="decision";a.returnedAtMin=e.gameTime;}
}
export function companyStoryScene(a){
 const intro=a.path==="green"?"Zukunft braucht Menschen":a.path==="people"?"Mehr als ein Name im Dienstplan":"Ein Versprechen kommt an";
 if(a.status==="departed")return {title:"Wege trennen sich",text:a.name+" arbeitet nicht mehr im Betrieb. Diese Geschichte bleibt Teil eurer Chronik.",choices:[]};
 if(a.status==="done")return {title:"Das bleibt",text:a.ending,choices:[]};
 if(a.status==="waiting")return {title:a.focus==="learning"?"Raum zum Wachsen":"Vertrauen entsteht unterwegs",text:a.focus==="learning"?a.name+" wartet auf eine echte Weiterbildung. Wähle im Personalbereich einen passenden Kurs. Die Geschichte geht nach dessen Abschluss weiter.":a.name+" arbeitet an eurer nächsten Etappe: "+a.deliveries+" von 5 neuen pünktlichen Lieferungen. Keine Frist, keine Strafe.",choices:[{id:"close",label:"Vorhaben ohne Strafe beenden",detail:"Die bisherigen Entscheidungen bleiben in der Chronik."}]};
 if(a.stage===0)return {title:intro,text:a.name+" hat die Lieferung für "+a.customer+" pünktlich abgeschlossen. Nach der Rückkehr bleibt ein Moment für ein Gespräch: Was soll aus diesem Erfolg werden?",choices:[{id:"learning",label:"In Dich investieren",detail:"Ein persönliches Lernvorhaben. Kurse werden separat gewählt, bezahlt und tatsächlich absolviert."},{id:"quality",label:"Darauf bauen wir auf",detail:"Gemeinsam fünf weitere pünktliche Lieferungen schaffen."},{id:"close",label:"Danke – heute bleibt es dabei",detail:"Ein bewusster Abschluss ohne Verpflichtung."}]};
 return {title:a.focus==="learning"?"Aus Wissen wird Zuversicht":"Fünfmal Wort gehalten",text:a.name+(a.focus==="learning"?" hat die Weiterbildung wirklich abgeschlossen.":" hat fünf weitere Lieferungen pünktlich ans Ziel gebracht.")+" Ihr habt etwas gemeinsam erreicht. Möchtest Du den Erfolg als nächste Etappe festhalten?",choices:[{id:"celebrate",label:"Unseren Erfolg festhalten",detail:"Ein dauerhafter Meilenstein und ein Eintrag in eurer Chronik. Keine erfundene Umsatzprämie."},{id:"close",label:"Mit einem persönlichen Danke abschließen",detail:"Die Geschichte bleibt erhalten, ohne einen Meilenstein zu vergeben."}]};
}
export function chooseCompanyStory(s,p){
 const a=s.journey?.arcs?.find(a=>a.id===p.id);
 if(!a||a.stage!==p.stage||!["decision","waiting"].includes(a.status))throw Error("Diese Geschichte hat sich verändert.");
 if(!employed(s,a.driverId))throw Error("Diese Person arbeitet nicht mehr im Betrieb.");
 if(!companyStoryScene(a).choices.some(c=>c.id===p.choice))throw Error("Diese Antwort ist nicht verfügbar.");
 a.choices.push({id:p.choice,atMin:s.gameTime});
 if(p.choice==="close"||p.choice==="celebrate"){
  a.ending=p.choice==="celebrate"?a.name+" und Du habt euer Vorhaben erfüllt. Dieser gemeinsame Erfolg bleibt.":"Du hast "+a.name+" gedankt und das Vorhaben bewusst abgeschlossen.";
  if(p.choice==="celebrate")s.journey.badges++;
  finish(s,a,"done");
 }else{a.focus=p.choice;a.stage=1;a.status="waiting";}
 return {ok:true};
}
