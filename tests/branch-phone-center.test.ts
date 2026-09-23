// @vitest-environment happy-dom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {it,expect,vi,beforeEach,afterEach} from "vitest";
const fixture=vi.hoisted(()=>({game:{} as any,ring:vi.fn(()=>()=>{}),navigate:vi.fn()}));
vi.mock("@/lib/gameContext",()=>({useGame:()=>fixture.game}));
vi.mock("react-router-dom",()=>({useNavigate:()=>fixture.navigate}));
vi.mock("@/lib/officeAudio",()=>({setOfficeDucked:vi.fn()}));
vi.mock("@/lib/phoneRinging",()=>({startPhoneRinging:fixture.ring}));
vi.mock("@/lib/experienceSound",()=>({useSoundEnabled:()=>true,playPhoneSound:vi.fn(),stopPhoneSound:vi.fn()}));
vi.mock("@/components/game/StaffPhoneDialog",()=>({default:()=>null}));
vi.mock("@/components/game/PhoneScreen",()=>({default:({children})=>React.createElement("div",null,children)}));
vi.mock("@/components/ui/Portrait",()=>({default:()=>null}));
vi.mock("@/components/ui/dialog",()=>({Dialog:({open,children})=>open?React.createElement("div",null,children):null,DialogTitle:({children})=>React.createElement("h2",null,children),DialogDescription:({children})=>React.createElement("p",null,children)}));
import PhoneCenter from "@/components/game/PhoneCenter";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {executeCommand} from "@/lib/simulationAdapter";
import {getCommunicationQueue} from "@/lib/communicationData";
let root,container;
beforeEach(()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;fixture.ring.mockClear();fixture.navigate.mockClear();
 const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});
 s.branchDecisions=[{id:"phone-ui",status:"pending",type:"maintenance",branchId:s.branches[0].id,costCents:10000,title:"Werkstatt prüfen",description:"Fahrzeuge instand halten",createdAt:s.gameTime,benefitDesc:"Sichere Flotte"}];
 fixture.game={state:s,motionEnabled:false,busy:false,send:vi.fn(async(command,params)=>{
  const r=await executeCommand(fixture.game.state,command,params);
  if(r.error)throw Error(r.error);
  fixture.game.state=r.state;root.render(React.createElement(PhoneCenter));return r.result;
 })};
 container=document.createElement("div");document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(){await act(async()=>root.render(React.createElement(PhoneCenter)));}
async function click(label){await act(async()=>{const b=Array.from(container.querySelectorAll("button")).find(b=>b.textContent===label);expect(b).toBeTruthy();b.click();});}
it.each(["Bestätigen","Ablehnen"])("Filialanruf lässt sich annehmen und mit %s im Gespräch abschließen",async action=>{
 await render();expect(fixture.ring).toHaveBeenCalled();
 await act(async()=>container.querySelector('button[title="Telefon"]').click());
 await click("Annehmen");expect(container.textContent).toContain("Sichere Flotte");
 await click(action);
 expect(fixture.game.send).toHaveBeenCalledWith(action==="Bestätigen"?"approveBranchDecision":"rejectBranchDecision",{decisionId:"phone-ui"});
 expect(fixture.game.state.branchDecisions[0].status).toBe(action==="Bestätigen"?"approved":"rejected");
 expect(getCommunicationQueue(fixture.game.state).calls).toHaveLength(0);
 expect(fixture.navigate).not.toHaveBeenCalled();
 expect(container.textContent).toContain("Gespräch beenden");
});
it("im Zeitvorlauf verpasste Filialanfragen klingeln nicht nachträglich und bleiben rückrufbar",async()=>{
 const call=getCommunicationQueue(fixture.game.state).calls[0];
 fixture.game.state.missedPhoneCalls=[{...call,missedAtMin:fixture.game.state.gameTime}];
 await render();expect(fixture.ring).not.toHaveBeenCalled();
 await act(async()=>container.querySelector('button[title="Telefon"]').click());
 expect(container.textContent).toContain("Rückruf offen");
 const callback=Array.from(container.querySelectorAll("button")).find(b=>b.textContent.includes("Rückruf offen"));
 await act(async()=>callback.click());expect(container.textContent).toContain("Sichere Flotte");
});
