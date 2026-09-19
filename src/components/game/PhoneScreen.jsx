import React from "react";
import { DialogContent, DialogClose } from "@/components/ui/dialog";
import { X, Phone } from "lucide-react";
import "./phoneScreen.css";

export default function PhoneScreen({children,gameTime=0,conversation=false,footer,closingDisabled=false}) {
 const minute=((Math.floor(gameTime)%1440)+1440)%1440;
 const time=String(Math.floor(minute/60)).padStart(2,"0")+":"+String(minute%60).padStart(2,"0");
 return <DialogContent className={"ff-phone "+(conversation?"ff-phone-call":"")} onEscapeKeyDown={e=>{if(closingDisabled)e.preventDefault();}} onPointerDownOutside={e=>{if(closingDisabled)e.preventDefault();}}>
  <div className="ff-phone-status"><span aria-label={"Spielzeit "+time}>{time}</span><div className="ff-phone-island" aria-hidden="true">{conversation&&<Phone size={12}/>}<i/></div><span className="ff-phone-brand">FF</span></div>
  <div className="ff-phone-toolbar"><span>{conversation?"Gespräch":"FRACHTFIEBER"}</span><DialogClose disabled={closingDisabled} aria-label="Telefon schließen"><X size={18}/></DialogClose></div>
  <div className="ff-phone-scroll">{children}</div>
  {footer&&<div className="ff-phone-footer">{footer}</div>}
  <div className="ff-phone-home" aria-hidden="true"><span/></div>
 </DialogContent>;
}
