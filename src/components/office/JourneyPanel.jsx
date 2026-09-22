import React,{useState} from "react";
import {Link} from "react-router-dom";
import {ArrowUpRight,Check,Compass,Sparkles,Trophy} from "lucide-react";
import {useGame} from "@/lib/gameContext";
import {JOURNEY_PATHS,journeyProgress} from "@/lib/simulation/playerJourney";
import "./journey.css";
export default function JourneyPanel(){
 const {state,send,showToast,busy,backgroundAdvance}=useGame(),[pending,setPending]=useState(false),[confirm,setConfirm]=useState(false);
 const j=state.journey,locked=pending||busy||backgroundAdvance?.active;
 async function act(c,p){setPending(true);try{await send(c,p);setConfirm(false);}catch(e){showToast(e.message,"error");}finally{setPending(false);}}
 const done=j?.goals?.length&&j.goals.every(g=>g.completedAtMin!=null);
 const last=j?.weeks?.at(-1),v=last?.values;
 return <section className="ff-journey" aria-label="Dein Unternehmensweg">
  <header className="ff-journey-heading"><div><p className="ff-eyebrow"><Compass size={14}/> DEIN NÄCHSTES KAPITEL</p><h2>{j?.path?JOURNEY_PATHS.find(p=>p.id===j.path)?.label:"Wohin soll Deine Reise gehen?"}</h2><p>Du bestimmst die Richtung. Dein Betrieb schreibt den Fortschritt.</p></div><div className="ff-badge"><Trophy size={20}/><strong>{j?.badges||0}</strong><span>Meilensteine</span></div></header>
  {(!j?.goals?.length||done)?<><p className="ff-journey-caption">{done?"Etappe geschafft. Wähle Dein nächstes Vorhaben.":"Drei Wege. Neue Fortschritte zählen ab Deiner Wahl. Keine Frist, keine Strafe."}</p><div className="ff-journey-grid">{JOURNEY_PATHS.map(p=><button key={p.id} disabled={locked} onClick={()=>act("chooseJourneyPath",{path:p.id})} className="ff-path" style={{"--journey-accent":p.color}}><Sparkles size={22}/><strong>{p.label}</strong><span>{p.description}</span><span className="ff-path-action">Weg wählen <ArrowUpRight size={17}/></span></button>)}</div></>:
  <><div className="ff-journey-grid">{j.goals.map((g,i)=>{const n=journeyProgress(state,g),finished=g.completedAtMin!=null;return <article className={"ff-goal "+(finished?"ff-goal-done":"")} key={g.id}><p className="ff-eyebrow">{["DER NÄCHSTE SCHRITT","DEIN VORHABEN","DAS GROSSE ZIEL"][i]}</p><h3>{g.title}</h3><p>{g.description}</p><div className="ff-goal-number">{finished?<Check size={26}/>:Math.min(n,g.target)}<span>/ {g.target}</span></div><progress aria-label={g.title} value={Math.min(n,g.target)} max={g.target}/><Link to={g.link}>{finished?"Geschafft · ein Meilenstein":"Nächsten Schritt angehen"} <ArrowUpRight size={15}/></Link></article>;})}</div>
  <div className="ff-path-change">{confirm?<><span>Aktuellen Weg beenden? Verdiente Meilensteine bleiben, offene Ziele werden archiviert.</span><button disabled={locked} onClick={()=>act("abandonJourneyPath",{round:j.round})}>Weg beenden</button><button onClick={()=>setConfirm(false)}>Behalten</button></>:<button onClick={()=>setConfirm(true)}>Richtung bewusst ändern</button>}</div></>}
  <div className="ff-week"><div><p className="ff-eyebrow">DEINE WOCHE IN BEWEGUNG</p><h3>{last?"Das habt Ihr gemeinsam erreicht.":"Die erste Bilanz entsteht gerade."}</h3><p>{last?`Tag ${Math.floor(last.fromMin/1440)+1} bis ${Math.floor(last.toMin/1440)}${last.partial?" · erste Teilwoche":""}`:"Nach dem nächsten Wochenwechsel erscheinen hier Deine tatsächlichen Ergebnisse."}</p></div>{v&&<div className="ff-week-metrics">{[[v.delivered,"Lieferungen"],[v.delivered?Math.round(100*v.onTime/v.delivered)+" %":"—","pünktlich"],[v.courses,"Weiterbildungen"],[v.personal,"Zeit fürs Privatleben"]].map(([n,label])=><div key={label}><strong>{n}</strong><span>{label}</span></div>)}</div>}</div>
  {v&&<p className="ff-journey-caption">{v.failed} gescheiterte Aufträge · {v.electric} E-Lkw-Lieferungen · {v.contracts} neue Verträge. Werte seit Einführung dieser Ansicht; keine nachträglich erfundenen Erfolge.</p>}
 </section>;
}
