import React,{useState} from "react";
import {Link} from "react-router-dom";
import {BookOpen,ArrowUpRight,Check} from "lucide-react";
import {useGame} from "@/lib/gameContext";
import {companyStoryScene} from "@/lib/simulation/companyStories";
import "./journey.css";
export default function CompanyStories(){
 const {state,send,showToast,busy,backgroundAdvance}=useGame(),[pending,setPending]=useState(false);
 const arcs=state.journey?.arcs||[],a=arcs.find(a=>["decision","waiting"].includes(a.status))||arcs.at(-1);
 async function choose(choice){setPending(true);try{await send("chooseCompanyStory",{id:a.id,stage:a.stage,choice});}catch(e){showToast(e.message,"error");}finally{setPending(false);}}
 const scene=a&&companyStoryScene(a),locked=pending||busy||backgroundAdvance?.active;
 return <section className="ff-journey ff-story" aria-label="Geschichten aus Deinem Betrieb"><p className="ff-eyebrow"><BookOpen size={15}/> AUS EUREM ALLTAG</p><h2>{scene?.title||"Erfolge bekommen ein Gesicht."}</h2>
 {!a?<p>Wähle einen Unternehmensweg. Nach den ersten pünktlichen Lieferungen entstehen persönliche Folgegeschichten mit Deinem tatsächlichen Team.</p>:<><p className="ff-story-person">{a.name} <span>· Episode {a.id} · ausgelöst an Tag {Math.floor(a.causeMin/1440)+1}</span></p><div className="ff-story-steps" aria-label={`Kapitel ${a.stage+1} von 3`}>{[0,1,2].map(n=><i key={n} className={n<=a.stage?"active":""}/>)}</div><p className="ff-story-text">{scene.text}</p>
 {a.status==="waiting"&&<Link className="ff-story-link" to={a.focus==="learning"?"/personal":"/disposition"}>{a.focus==="learning"?"Weiterbildung planen":"Disposition ansehen"}<ArrowUpRight size={15}/></Link>}
 <div className="ff-story-choices">{scene.choices.map(c=><button key={c.id} disabled={locked} onClick={()=>choose(c.id)}><strong>{c.label}</strong><span>{c.detail}</span></button>)}</div>
 {a.status==="done"&&<p className="ff-story-link"><Check size={15}/> In eurer Chronik gesichert. Neue Begegnungen entstehen frühestens nach zehn Spieltagen und einem weiteren echten Erfolg.</p>}
 {arcs.length>1&&<details className="ff-story-history"><summary>Die letzten Begegnungen ({arcs.length-1})</summary>{arcs.filter(x=>x.id!==a.id).slice().reverse().map(x=><p key={x.id}><strong>{x.name}</strong> · {companyStoryScene(x).text}</p>)}</details>}</>}
 </section>;
}
