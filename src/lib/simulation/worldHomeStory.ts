export const HOME_ID = "own_dreams";
export const HOME_STORY = { id: HOME_ID, title: "Ein Platz für eigene Träume", subtitle: "Ihr seid mehr als der freie Abend zwischen zwei Aufträgen.", chapters: 4, unlockDays: 0, kind: "Privatleben · Fortsetzung" };
export function sameHomePartner(state, actorId) {
 const p=state.private;
 return !!p?.partnerName && !["single","separated","divorced"].includes(p.relationshipStatus) && String(p.partnerId || "partner_existing") === actorId;
}
export function ensureHomeStory(state, now=state.gameTime) {
 const w=state.world;if(!w?.active || !w.stories)return;
 if(!w.stories[HOME_ID])w.stories[HOME_ID]={id:HOME_ID,stage:0,status:"locked",availableAtMin:null,decisions:[],actorId:null,actorName:null,pending:null,dueMin:null};
 const run=w.stories[HOME_ID],parent=w.stories.home;
 if(run.status!=="locked" || run.availableAtMin!=null)return;
 if(parent?.status!=="done" || parent.stage<2 || w.stories.built_together?.status!=="done" || w.stories.built_together.stage<5)return;
 run.actorId=parent.actorId;run.actorName=parent.actorName;
 if(!sameHomePartner(state,run.actorId)){run.status="done";run.ending="Diese Fortsetzung gehört zu eurer damaligen Beziehung. Eure Wege haben sich getrennt; die gemeinsame Geschichte bleibt erhalten.";return;}
 run.actorName=state.private.partnerName;run.availableAtMin=now+14*1440;
 run.background=parent.decisions?.find(d=>d.stage===1)?.choiceId || "boundaries";
}
const choice=(id,label,detail,text,effect={},costCents=0)=>({
 id,label,detail:detail+" Die Nachwirkung folgt nach drei Spieltagen.",account:"private",costCents,effect:{},delayed:{text,effect},
});
export function homeScene(state,run){
 const name=sameHomePartner(state,run.actorId)?state.private.partnerName:run.actorName;
 const picks=Object.fromEntries(run.decisions.map(d=>[d.stage,d.choiceId]));
 if(run.stage===0)return {title:"Die Schachtel unter dem Tisch",
 text:name+" zieht eine Schachtel mit alten Skizzen hervor. „Das habe ich lange nicht gezeigt. Irgendwann wollte ich damit wieder anfangen.“ "+
 (run.background==="repeat"?"Ihr habt schon gemeinsame Abende geplant. Heute geht es darum, womit ihr die gemeinsame Zeit füllen wollt. ":"Ihr habt über realistische Grenzen gesprochen. Heute liegt ein Wunsch auf dem Tisch, der nichts mit deinem Unternehmen zu tun hat. ")+
 "Zwischen den Blättern steckt eine Einladung zu einer kleinen Ausstellung. „Ich brauche keinen perfekten Plan. Ich wollte erst einmal wissen, was du darin siehst.“",
 choices:[
 {...choice("evening","Einen Abend für die Ausstellung vereinbaren","60 € Privatkonto bei Zusage. Zwei Stunden im Kalender. Bei Teilnahme Beziehung +8, Belastung −8; später Glück +3.",
 "Ihr habt euch Zeit genommen, über die Bilder und eigene Ideen zu sprechen. Ein gemeinsamer Abend ist zu einer neuen Erinnerung geworden.",{happiness:3},6000),appointment:true},
 choice("curious","Die Skizzen gemeinsam anschauen","Kostenlos. Später Beziehung +3.",
 "Du hast Fragen gestellt, ohne aus den Skizzen sofort ein Projekt zu machen. Dein Interesse hat gutgetan.",{relationship:3}),
 choice("space","Raum für einen eigenen Anfang lassen","Kostenlos. Später Beziehung +1, Belastung −2.",
 "Du hast deutlich gemacht, dass dieser Wunsch nicht deine Erlaubnis braucht. Für den Anfang muss daraus kein gemeinsamer Plan werden.",{relationship:1,stress:-2}),
 ]};
 if(run.stage===1)return {title:"Nicht alles muss nützlich sein",
 text:name+" hat wieder gezeichnet. "+
 (picks[0]==="evening"?(run.lastAppointmentOutcome==="attended"?"Euer Ausstellungsbesuch klingt noch nach. ":"Der geplante Ausstellungsabend hat nicht stattgefunden. Das ist nicht vergessen. "):picks[0]==="curious"?"Eure Fragen zu den alten Skizzen haben neue Ideen angestoßen. ":"Du hast Raum gelassen; jetzt zeigt sich ein erster eigener Schritt. ")+
 "„Du denkst bei guten Ideen schnell daran, was daraus werden könnte“, sagt "+name+". „Ich möchte erst einmal herausfinden, ob ich es gern mache.“ Auf dem Tisch liegt eine kleine Materialliste.",
 choices:[
 choice("materials","Das Material als Geschenk übernehmen","90 € Privatkonto. Später Beziehung +4, Glück +2. Es entsteht kein verkäuflicher Besitzgegenstand.",
 "Die Materialien sind ein Geschenk ohne Leistungsversprechen. Du hast weder einen Kurs gebucht noch ein Geschäft daraus gemacht.",{relationship:4,happiness:2},9000),
 choice("encourage","Zum Ausprobieren ermutigen","Kostenlos. Später Beziehung +2.",
 "Deine Antwort lässt Platz für Versuche, die nichts einbringen müssen. Auch ohne Geschenk ist die Ermutigung angekommen.",{relationship:2}),
 ]};
 if(run.stage===2)return {title:"Ein freier Platz an der Wand",
 text:"Am Abend lehnt ein neues Bild an der Wand. "+name+" ist unsicher, ob es schon jemand sehen soll. "+
 (picks[1]==="materials"?"„Dein Geschenk war schön. Ich möchte nur nicht, dass ich dir jetzt etwas beweisen muss.“ ":"„Es tut gut, dass ich einfach ausprobieren darf.“ ")+
 ((state.private.relationship??50)<45?"Zwischen euch ist noch Abstand spürbar. Ein freundlicher Abend kann ihn nicht einfach ungeschehen machen. ":"Das Gespräch fühlt sich vertrauter an, auch wenn ihr nicht über alles gleich denkt. ")+
 "Du kannst einen gemeinsamen Abend freihalten oder einfach zuhören.",
 choices:[
 {...choice("together","Einen Abend für eure Ideen reservieren","Kostenlos. Zwei Stunden im Kalender. Bei Teilnahme Beziehung +8, Belastung −8; später Glück +2.",
 "Ihr habt euch erzählt, was ihr außerhalb eurer Verpflichtungen ausprobieren möchtet. Nicht jede Idee braucht sofort eine Zusage.",{happiness:2}),appointment:true},
 choice("listen","Zuhören, ohne etwas zu organisieren","Kostenlos. Später Beziehung +2, Belastung −1.",
 "Du hast zugehört und die Unsicherheit ausgehalten. Das Bild muss weder ausgestellt noch verkauft werden, damit dieser Moment etwas bedeutet.",{relationship:2,stress:-1}),
 ]};
 if(run.stage===3)return {title:"Was wir einander lassen",
 text:name+" legt die alten und die neuen Skizzen nebeneinander. "+
 (picks[2]==="together"?(run.lastAppointmentOutcome==="attended"?"Euer gemeinsamer Abend hat einen neuen Gesprächsfaden eröffnet. ":"Euer geplanter Abend ist ausgefallen. Ihr müsst daraus keine schöne Erinnerung machen, um trotzdem weiterzureden. "):"Das ruhige Gespräch ist euch beiden in Erinnerung geblieben. ")+
 "„Ich möchte eigene Dinge haben. Und ich möchte sie mit dir teilen können.“ Es geht nicht um eine neue Verpflichtung. Es geht darum, wie ihr zusammenlebt.",
 choices:[
 choice("share","Gemeinsame Zeit und eigene Interessen gehören zusammen","Kostenlos. Später Beziehung +3, Glück +2.",
 "Ihr habt einen gemeinsamen Gedanken gefunden: Nähe lässt Raum für eigene Interessen. Die Skizzen bleiben Teil eurer Geschichte. Neue regelmäßige Termine entstehen daraus nicht automatisch.",{relationship:3,happiness:2}),
 choice("gentle","Kleine Schritte ohne große Versprechen vereinbaren","Kostenlos. Später Beziehung +2, Belastung −3.",
 "Ihr habt euch gegen einen perfekten Zukunftsplan entschieden. Für heute reicht eine ehrliche Antwort. Die bisherigen Entscheidungen und Erinnerungen bleiben erhalten.",{relationship:2,stress:-3}),
 ]};
 return null;
}
