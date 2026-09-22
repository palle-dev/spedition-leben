export const RIVAL_ID="headwind";
export const RIVAL_STORY={id:RIVAL_ID,title:"Gegenwind am Kai",subtitle:"Konkurrenten bleiben Menschen. Und verfolgen eigene Ziele.",chapters:4,unlockDays:0,kind:"Konkurrenz · Fortsetzung"};
export function ensureRivalStory(state,now=state.gameTime){
 const w=state.world;if(!w?.active||!w.stories)return;
 if(!w.stories[RIVAL_ID])w.stories[RIVAL_ID]={id:RIVAL_ID,stage:0,status:"locked",availableAtMin:null,decisions:[],actorId:null,actorName:null,pending:null,dueMin:null};
 const run=w.stories[RIVAL_ID],parent=w.stories.built_together;
 if(run.status!=="locked"||run.availableAtMin!=null||parent?.status!=="done"||parent.stage<5)return;
 if(!["nordsprint","hansen","hansecargo"].every(id=>w.rivals.some(r=>r.id===id)))return;
 run.path=parent.path||"independent";run.availableAtMin=now+21*1440;
}
const c=(id,label,detail,text,effect={},costCents=0)=>({id,label,detail:detail+" Die Folgen treten nach drei Spieltagen ein.",account:"company",costCents,effect:{},delayed:{text,effect}});
function rivalSceneBase(state,run){
 const rivals=state.world.rivals,malte=rivals.find(r=>r.id==="nordsprint"),anna=rivals.find(r=>r.id==="hansen");
 const picks=Object.fromEntries(run.decisions.map(d=>[d.stage,d.choiceId]));
 if(run.stage===0)return {title:"Malte bleibt noch stehen",
 text:"Nach einem Gespräch am Kai bleiben du und Malte Kröger vor der Tür stehen. "+
 (malte?.cashCents<14000?"NordSprints aktuelle Reserve reicht nicht für einen weiteren regulären Transport. Malte wirkt angespannt. „Du siehst die Zahlen. Ich muss mir überlegen, was ich als Nächstes zusage.“ ":
 "NordSprint hat aktuell Geld für das reguläre Tagesgeschäft. Malte will trotzdem über seinen Kurs sprechen. „Nur weil es weitergeht, muss nicht jede Entscheidung richtig gewesen sein.“ ")+
 ((malte?.relationship??45)<40?"Zwischen euch liegt Misstrauen. Seine Frage klingt eher wie eine Herausforderung als wie eine Bitte. ":"Ihr habt inzwischen genug miteinander zu tun gehabt, um nicht jedes Wort als Angriff zu verstehen. ")+
 "„Was hältst du eigentlich von mir, wenn gerade keine Ausschreibung offen ist?“",
 choices:[
 c("respect","Offen über eure unterschiedlichen Wege sprechen","Kostenlos. NordSprint-Verhältnis +6, Belastung +1.",
 "Du hast Malte als Gesprächspartner ernst genommen. Ihr seid weiterhin Konkurrenten, aber das Verhältnis zwischen euch ist weniger kühl.",{relations:{nordsprint:6},stress:1}),
 c("distance","Höflich Abstand halten","Kostenlos. Belastung −2, NordSprint-Verhältnis −2.",
 "Du hast das Gespräch kurz gehalten. Malte respektiert die Grenze und merkt sich die Distanz. Seine geschäftlichen Entscheidungen bleiben seine eigenen.",{stress:-2,relations:{nordsprint:-2}}),
 c("review","Eine unabhängige Analyse deiner eigenen Kalkulation bezahlen","500 € Firmenkonto. Verhandlungsvorsprung +2.",
 "Die Analyse zeigt dir Spielräume deiner eigenen Kalkulation. Dein Verhandlungsvorsprung bei Spielwelt-Ausschreibungen steigt; mit Malte wurden keine Preise oder Gebote abgestimmt.",{price:2},50000),
 ]};
 if(run.stage===1)return {title:"Annas offene Tür",
 text:"Anna Hansen hat von eurem Gespräch gehört. "+
 (run.path==="alliance"?"„Wir arbeiten zusammen. Trotzdem musst du nicht jede meiner Ansichten übernehmen.“ ":
 run.path==="corporate"?"„Dass du mit Vera arbeitest, macht ein Gespräch zwischen uns nicht unmöglich.“ ":
 "„Du wolltest unabhängig bleiben. Das heißt nicht, dass niemand deine Meinung hören darf.“ ")+
 (picks[0]==="respect"?"Sie fragt, was du an Maltes Sicht nachvollziehen kannst. ":"Sie fragt, warum du bei Malte vorsichtig geblieben bist. ")+
 ((anna?.relationship??45)>=55?"Euer Verhältnis lässt ein offenes Gespräch zu. ":"Du merkst, dass zwischen euch noch Vertrauen wachsen muss. ")+
 "Anna möchte die eigenen Qualitätsmaßstäbe klarer erklären. Du entscheidest, ob du dich an der fachlichen Vorbereitung beteiligst.",
 choices:[
 c("standards","Die fachliche Vorbereitung unterstützen","700 € Firmenkonto. Qualität +2, Hansen-Verhältnis +4.",
 "Ihr habt Qualitätsanforderungen verständlicher aufbereitet. Dein Qualitätsvorsprung steigt, und Anna schätzt deinen Beitrag. Eine gemeinsame Firma oder zusätzliche Transportpflicht ist daraus nicht entstanden.",{quality:2,relations:{hansen:4}},70000),
 c("questions","Mit konkreten Fragen zum Gespräch beitragen","Kostenlos. Hansen-Verhältnis +2, Verlässlichkeit +1.",
 "Du hast nachgefragt, statt Zustimmung vorzutäuschen. Anna kennt deine Haltung jetzt besser; deine klaren Aussagen stärken deinen Ruf.",{relations:{hansen:2},trust:1}),
 ]};
 if(run.stage===2)return {title:"Veras Maßstab",
 text:"Vera Brandt legt eine leere Vergleichstabelle auf den Tisch. „Jeder erzählt mir, was ihn besonders macht. Mich interessiert, was davon überprüfbar ist.“ "+
 (picks[1]==="standards"?"Du kannst auf die Arbeit an den Qualitätsmaßstäben zurückgreifen. ":"Du erinnerst dich an die offenen Fragen aus Annas Gespräch. ")+
 (state.world.reputation.trust<50?"Deine aktuelle Verlässlichkeit spricht für vorsichtige Zusagen. Eine Präsentation allein wird die Lieferprobleme nicht lösen. ":"Deine aktuelle Verlässlichkeit gibt dir eine gute Gesprächsgrundlage. Sie ist trotzdem kein Versprechen für jeden künftigen Auftrag. ")+
 "Vera fragt, wie du deine Position erklären möchtest.",
 choices:[
 c("evidence","Die eigene Qualitätsdarstellung fachlich prüfen lassen","900 € Firmenkonto. Qualität +2, HanseCargo-Verhältnis +3.",
 "Die Prüfung hilft dir, deine Qualitätsmaßstäbe verständlich und belastbar darzustellen. Vera schätzt die Vorbereitung. Neue Kundenverträge entstehen weiterhin nur über die vorhandenen Vertragsmechaniken.",{quality:2,relations:{hansecargo:3}},90000),
 c("limits","Stärken und Grenzen offen benennen","Kostenlos. Verlässlichkeit +2, HanseCargo-Verhältnis +1.",
 "Du hast deutlich zwischen Können und Wunsch unterschieden. Vera hat nicht auf alles eine begeisterte Antwort gegeben, aber sie weiß jetzt besser, worauf dein Wort beruht.",{trust:2,relations:{hansecargo:1}}),
 c("independent","Die eigene Kalkulation im Mittelpunkt halten","Kostenlos. Verhandlungsvorsprung +1, HanseCargo-Verhältnis −2.",
 "Du hast deine geschäftliche Eigenständigkeit betont. Das schärft deine Verhandlungsposition, lässt das Gespräch mit Vera aber etwas distanzierter enden.",{price:1,relations:{hansecargo:-2}}),
 ]};
 if(run.stage===3)return {title:"Morgen stehen wir wieder am Kai",
 text:"Malte, Anna und Vera begegnen dir wieder am Kai. Niemand hat seine Firma oder seine Interessen abgegeben. "+
 (picks[0]==="respect"?"Malte grüßt zuerst. Euer offenes Gespräch ist ihm in Erinnerung geblieben. ":"Malte nickt dir zu; zwischen euch bleibt eine gewisse Distanz. ")+
 (picks[2]==="independent"?"Vera erinnert sich an deine klare Betonung der Eigenständigkeit. ":"Vera kommt noch einmal auf eure sachliche Diskussion zurück. ")+
 "Anna fragt: „Was bleibt von diesen Gesprächen, wenn wir uns morgen wieder um denselben Auftrag bewerben?“",
 choices:[
 c("fair","Klar konkurrieren und den Gesprächsfaden halten","Kostenlos. Verhältnis zu allen drei Konkurrenten +2.",
 "Du hast keine Aufträge versprochen und keine Preise abgestimmt. Die Bereitschaft zum Gespräch verbessert eure Beziehungen. Ob später ein Kooperationsangebot entsteht, entscheidet weiterhin die Konkurrenzsimulation.",{relations:{hansen:2,nordsprint:2,hansecargo:2}}),
 c("own","Den eigenen Kurs erklären und dabei bleiben","Kostenlos. Verlässlichkeit +2, Belastung −2.",
 "Du bleibst auf deinem Weg, ohne jede Begegnung zu einer Grundsatzfrage zu machen. Die Gespräche und deine Entscheidungen bleiben in der Chronik erhalten.",{trust:2,stress:-2}),
 ]};
 return null;
}

export function rivalScene(state,run){
 const scene=rivalSceneBase(state,run);if(!scene)return scene;
 const acquired=state.world.rivals.filter(r=>r.businessStatus==="acquired");
 if(!acquired.length)return scene;
 const text="Seit der Übernahme von "+acquired.map(r=>r.name).join(", ")+" begegnet ihr euch mit einer veränderten gemeinsamen Firmengeschichte. Die früheren Inhaber behalten ihre persönliche Sicht auf deine Entscheidungen. "+
 scene.text.replace("Niemand hat seine Firma oder seine Interessen abgegeben.","Eure Rollen haben sich verändert, eure persönlichen Interessen bleiben.").replace("wenn wir uns morgen wieder um denselben Auftrag bewerben?","wenn sich unsere geschäftlichen Rollen verändern?");
 return {...scene,text,choices:scene.choices.map(choice=>({...choice,delayed:{...choice.delayed,text:choice.delayed.text.replace("Ihr seid weiterhin Konkurrenten, aber", "Ihr habt eine gemeinsame Firmengeschichte, und").replace("Eine gemeinsame Firma oder zusätzliche Transportpflicht ist daraus nicht entstanden.","Diese fachliche Arbeit begründet keine zusätzlichen Transportpflichten.")}}))};
}
