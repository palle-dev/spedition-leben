import React,{useState,useId} from "react";
import {Link} from "react-router-dom";
import {ArrowUpRight,Check,Palette} from "lucide-react";
import {useGame} from "@/lib/gameContext";
import "./yard.css";
const COLORS=["#a3e635","#38bdf8","#c4b5fd","#fb923c","#f472b6"];
export default function CompanyYard(){
 const {state,send,showToast,motionEnabled,busy,backgroundAdvance}=useGame();
 const [edit,setEdit]=useState(false),[color,setColor]=useState(null),[motto,setMotto]=useState(null),[saving,setSaving]=useState(false);
 const id=useId().replace(/:/g,"");
 const brand=state.journey?.brand||{color:COLORS[0],motto:"Wir bringen Zukunft auf die Straße."};
 const accent=brand.color,branch=state.branches?.find(b=>b.isHeadquarters)||state.branches?.[0];
 const fleet=(state.vehicles||[]).filter(v=>!["sold","archived"].includes(v.status)),moving=fleet.filter(v=>v.status==="on_trip").length;
 const siteFleet=fleet.filter(v=>v.branchId===branch?.id),parked=siteFleet.filter(v=>v.status==="free"&&v.locationCity===branch?.city);
 const energy=state.energy?.sites?.[branch?.id],sites=(state.branches||[]).filter(b=>b.status==="active").length;
 const night=state.gameTime%1440<360||state.gameTime%1440>=1200;
 async function save(){setSaving(true);try{await send("setCompanyIdentity",{color:color||brand.color,motto:motto??brand.motto});setEdit(false);showToast("Dein Unternehmen trägt jetzt Deine Handschrift.","success");}catch(e){showToast(e.message,"error");}finally{setSaving(false);}}
 return <section className={"ff-yard "+(motionEnabled?"ff-yard-motion":"")} style={/** @type {React.CSSProperties} */ ({"--yard-color":accent})} aria-label="Dein persönlicher Betriebshof">
  <div className="ff-yard-top"><div><p className="ff-yard-eyebrow">{night?"NACHTSCHICHT":"DEIN UNTERNEHMEN IN BEWEGUNG"} · {branch?.city||"Hauptstandort"}</p><h2>{state.company?.name||"Deine Spedition"}</h2><p>{brand.motto}</p></div><button className="ff-yard-customize" onClick={()=>{setColor(brand.color);setMotto(brand.motto);setEdit(!edit);}} aria-expanded={edit}><Palette size={16}/><span>Gestalten</span></button></div>
  <svg viewBox="0 0 980 290" role="img" aria-label="Betriebshof mit eigener Lackierung und tatsächlich installierter Energieausstattung" className="ff-yard-scene">
   <defs><linearGradient id={id+"ground"} x2="0" y2="1"><stop stopColor="#243840"/><stop offset="1" stopColor="#111f28"/></linearGradient><linearGradient id={id+"roof"} x2="1" y2="1"><stop stopColor="#415966"/><stop offset="1" stopColor="#273c45"/></linearGradient></defs>
   <ellipse cx="510" cy="260" rx="430" ry="24" fill="#060d13" opacity=".4"/>
   <path d="M45 238L256 82H782L955 238L740 280H235Z" fill={"url(#"+id+"ground)"} stroke="#ffffff12"/>
   <path d="M90 245H890" stroke="#83909a" strokeDasharray="20 14" opacity=".35"/>
   <path d="M150 186V85L362 55V162Z" fill="#1a303c"/><path d="M362 55L702 82V187L362 162Z" fill="#203845"/>
   <path d="M150 85L365 16L703 82L362 111Z" fill={"url(#"+id+"roof)"} stroke="#728d9733"/>
   <path d="M151 116L361 143L702 117" stroke={accent} strokeWidth="3" opacity=".8"/>
   {[0,1,2,3,4].map(i=><g key={i}><rect x={385+i*58} y={126+i*2} width="42" height="51" rx="2" fill="#10212b" stroke="#57707a"/><path d={"M"+(390+i*58)+" "+(135+i*2)+"h32m-32 9h32m-32 9h32"} stroke="#3f5660"/></g>)}
   <text x="174" y="158" fill={accent} fontFamily="sans-serif" fontWeight="700" fontSize="17">{(state.company?.name||"FRACHTFIEBER").slice(0,23)}</text>
   {energy?.pvKwp>0&&[0,1,2,3,4,5].map(i=><g key={i} transform={"translate("+(295+i*45)+" "+(44+i*7)+") skewX(-38)"}><rect width="38" height="28" fill="#103c5d" stroke="#62b8da" strokeWidth=".8"/><path d="M12 0V28M25 0V28M0 14H38" stroke="#5c9dbb" strokeWidth=".5"/></g>)}
   {energy?.storageKWh>0&&<g><rect x="743" y="127" width="54" height="69" rx="5" fill="#c2d5d8"/><path d="M775 141L760 161H773L765 181" fill="none" stroke="#26726c" strokeWidth="4"/></g>}
   {Array.from({length:Math.min(4,(energy?.wallboxes||0)+(energy?.dcChargers||0))},(_,i)=><g key={i} transform={"translate("+(745+i*36)+" 209)"}><rect y="-33" width="12" height="33" rx="3" fill="#65c9b7"/><rect x="2" y="-28" width="8" height="7" fill="#143744"/><path d="M12 -22q15 0 11 20" stroke="#65c9b7" fill="none"/></g>)}
   {parked.slice(0,6).map((v,i)=><YardTruck key={v.id} x={210+i*80} y={188+(i%2)*14} color={accent} electric={v.powertrain==="electric"}/>)}
   {moving>0&&<g className="ff-yard-driving"><YardTruck x={110} y={234} color={accent}/></g>}
   {[135,825].map(x=><g key={x}><path d={"M"+x+" 209v-104h29"} stroke="#708a96" strokeWidth="3"/><rect x={x+18} y="104" width="19" height="4" fill={night?"#ffeaa2":"#a8bdc2"}/>{night&&<path d={"M"+(x+18)+" 110l-42 99h112l-52-99"} fill="#ffe7a008"/>}</g>)}
  </svg>
  <div className="ff-yard-bottom"><div><strong>{fleet.length}</strong><span>Lkw im Unternehmen</span></div><div><strong>{moving}</strong><span>gerade unterwegs</span></div><div><strong>{sites}</strong><span>aktive Standorte</span></div><Link to="/filialen">Standort entwickeln <ArrowUpRight size={17}/></Link></div>
  <p className="ff-yard-note">Schematische Ansicht von {branch?.city}: {parked.length} freie Lkw vor Ort · {energy?.pvKwp||0} kWp PV · {(energy?.wallboxes||0)+(energy?.dcChargers||0)} Ladepunkte. Die Szene zeigt eine Auswahl der Fahrzeuge.</p>
  {edit&&<div className="ff-yard-editor"><h3>Deine Handschrift.</h3><div className="ff-yard-palette" role="group" aria-label="Firmenfarbe">{COLORS.map((c,i)=><button key={c} style={{background:c,color:"#07151c"}} aria-label={["Limette","Himmelblau","Lavendel","Orange","Pink"][i]} aria-pressed={color===c} onClick={()=>setColor(c)}>{color===c&&<Check size={20}/>}</button>)}</div><label>Leitsatz<input maxLength={80} value={motto??brand.motto} onChange={e=>setMotto(e.target.value)}/></label><div><button disabled={saving||busy||backgroundAdvance?.active} onClick={save}>{saving?"Wird gespeichert …":"Gestaltung speichern"}</button><button disabled={saving} onClick={()=>setEdit(false)}>Abbrechen</button></div></div>}
 </section>;
}
function YardTruck({x,y,color,electric=false}){return <g transform={"translate("+x+" "+y+")"}><ellipse cx="31" cy="19" rx="36" ry="5" fill="#050d13" opacity=".55"/><rect width="46" height="22" rx="3" fill={color}/><path d="M48 7h12l10 9v8H48Z" fill="#e0e9e9"/><path d="M52 9h6l7 7H52Z" fill="#2d5264"/><circle cx="12" cy="24" r="5" fill="#081018" stroke="#5d7783"/><circle cx="57" cy="24" r="5" fill="#081018" stroke="#5d7783"/>{electric&&<text x="19" y="16" fontSize="12" fontWeight="bold" fill="#122b29">E</text>}</g>;}
