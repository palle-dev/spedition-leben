// @vitest-environment happy-dom
import React,{act} from "react";
import {createRoot} from "react-dom/client";
import {it,expect,vi,beforeEach,afterEach} from "vitest";
const fixture=vi.hoisted(()=>({game:{} as any}));
vi.mock("@/lib/gameContext",()=>({useGame:()=>fixture.game}));
vi.mock("react-router-dom",()=>({useLocation:()=>({pathname:"/"}),Link:({children,to,...p})=>React.createElement("a",{...p,href:to},children)}));
vi.mock("@/components/game/DockClock",()=>({default:()=>null}));
vi.mock("@/components/game/DiagPanel",()=>({default:()=>null}));
vi.mock("@/components/game/AdvanceProgressModal",()=>({default:({progress})=>React.createElement("div",{"data-testid":"result"},progress.status+" "+progress.current+"/"+progress.total)}));
import Dock from "@/components/game/ShellDock";
let root,container;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;fixture.game={state:{gameTime:480},enableAutomation:vi.fn(),pauseAutomation:vi.fn(),startBackgroundAdvance:vi.fn(),send:vi.fn(),showToast:vi.fn()};container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();});
async function render(){await act(async()=>root.render(React.createElement(Dock)));}
it("Start/Pause steht direkt vor +1 Tag und löst die richtige Aktion aus",async()=>{await render();let b=document.querySelector('button[aria-label="Live-Simulation starten"]') as HTMLButtonElement;expect(b.nextElementSibling?.getAttribute("aria-label")).toBe("1 Tag weiter");await act(async()=>b.click());expect(fixture.game.enableAutomation).toHaveBeenCalledTimes(1);fixture.game.automationEnabled=true;await render();await act(async()=>(document.querySelector('button[aria-label="Live-Simulation pausieren"]') as HTMLButtonElement).click());expect(fixture.game.pauseAutomation).toHaveBeenCalledTimes(1);await act(async()=>(document.querySelector('button[aria-label="1 Tag weiter"]') as HTMLButtonElement).click());expect(fixture.game.startBackgroundAdvance).toHaveBeenCalledWith(1440);});
it("zeigt Fehler auch ohne Ergebnis und Freigabestopps mit echtem Fortschritt",async()=>{fixture.game.backgroundAdvance={active:false,error:"Workerfehler",result:null};await render();expect(document.body.textContent).toContain("Workerfehler");fixture.game.backgroundAdvance={active:false,result:{stopped:true,stopReason:"pending_approval",advancedMinutes:0,requestedMinutes:1440}};await render();expect(document.body.textContent).toContain("Freigabe");expect(document.body.textContent).toContain("0/1440");});
