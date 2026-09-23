// @vitest-environment happy-dom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {it,expect,vi,beforeEach,afterEach} from "vitest";
import BranchPhoneDecision from "@/components/game/BranchPhoneDecision";
let root,container;
const proposal={id:"branch:d",label:"Wartung",description:"Flotte warten",costCents:10000,benefitDesc:"Weniger Ausfälle",command:"approveBranchDecision",params:{decisionId:"d"},rejectCommand:"rejectBranchDecision",rejectParams:{decisionId:"d"}};
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(onConfirm,extra={}){await act(async()=>root.render(React.createElement(BranchPhoneDecision,{proposal,blocked:false,onConfirm,onBusy:vi.fn(),...extra})));}
function button(label){return Array.from(container.querySelectorAll("button")).find((b:any)=>b.textContent===label) as HTMLButtonElement;}
it.each(["Bestätigen","Ablehnen"])("%s sendet die richtige Entscheidung mit Doppelklickschutz",async label=>{
 let finish;const send=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));await render(send);
 expect(container.textContent).toContain("Kosten:");expect(container.textContent).toContain("Weniger Ausfälle");
 await act(async()=>{button(label).click();button(label).click();});
 expect(send).toHaveBeenCalledTimes(1);
 expect(send.mock.calls[0][0]).toMatchObject({command:label==="Bestätigen"?"approveBranchDecision":"rejectBranchDecision",params:{decisionId:"d"}});
 await act(async()=>finish({ok:true}));
 expect(container.textContent).toContain(label==="Bestätigen"?"Freigabe erteilt":"abgelehnt und abgeschlossen");
 expect(container.querySelectorAll("button")).toHaveLength(0);
});
it("zeigt fehlgeschlagene Antworten und erlaubt einen erneuten Versuch",async()=>{
 const send=vi.fn().mockResolvedValueOnce({ok:false,error:"Anfrage verändert"}).mockResolvedValue({ok:true});
 await render(send);await act(async()=>button("Bestätigen").click());
 expect(container.querySelector('[role="alert"]').textContent).toBe("Anfrage verändert");
 await act(async()=>button("Ablehnen").click());expect(send).toHaveBeenCalledTimes(2);
 expect(container.textContent).toContain("abgelehnt und abgeschlossen");
});
it("fehlende Mittel sperren nur Bestätigen; geschlossene Anliegen bieten keine Aktion",async()=>{
 await render(vi.fn(),{proposal:{...proposal,approvalUnavailable:"Geld fehlt"}});
 expect(button("Bestätigen").disabled).toBe(true);expect(button("Ablehnen").disabled).toBe(false);
 await render(vi.fn(),{proposal:null});expect(container.querySelectorAll("button")).toHaveLength(0);
});
