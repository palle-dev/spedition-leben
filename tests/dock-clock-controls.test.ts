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
it("Start/Pause, +1 Stunde und +1 Tag und löst die richtige Aktion aus",async()=>{await render();let b=document.querySelector('button[aria-label="Live-Simulation starten"]') as HTMLButtonElement;const controls=Array.from(b.parentElement.querySelectorAll("button")).map(el=>el.getAttribute("aria-label"));expect(controls.indexOf("Live-Simulation starten")).toBeLessThan(controls.indexOf("1 Stunde weiter"));expect(controls.indexOf("1 Stunde weiter")).toBeLessThan(controls.indexOf("1 Tag weiter"));await act(async()=>b.click());expect(fixture.game.enableAutomation).toHaveBeenCalledTimes(1);fixture.game.automationEnabled=true;await render();await act(async()=>(document.querySelector('button[aria-label="Live-Simulation pausieren"]') as HTMLButtonElement).click());expect(fixture.game.pauseAutomation).toHaveBeenCalledTimes(1);await act(async()=>(document.querySelector('button[aria-label="1 Tag weiter"]') as HTMLButtonElement).click());expect(fixture.game.startBackgroundAdvance).toHaveBeenCalledWith(1440);});
it("zeigt Fehler auch ohne Ergebnis und Freigabestopps mit echtem Fortschritt",async()=>{fixture.game.backgroundAdvance={active:false,error:"Workerfehler",result:null};await render();expect(document.body.textContent).toContain("Workerfehler");fixture.game.backgroundAdvance={active:false,result:{stopped:true,stopReason:"pending_approval",advancedMinutes:0,requestedMinutes:1440}};await render();expect(document.body.textContent).toContain("Freigabe");expect(document.body.textContent).toContain("0/1440");});

it("+1 Std sendet genau 60 stille Minuten und sperrt den Button bis zum Ergebnis",async()=>{
 let finish;fixture.game.send=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 await render();const b=document.querySelector('button[aria-label="1 Stunde weiter"]') as HTMLButtonElement;
 await act(async()=>b.click());expect(b.disabled).toBe(true);
 await act(async()=>b.click());expect(fixture.game.send).toHaveBeenCalledTimes(1);
 expect(fixture.game.send).toHaveBeenCalledWith("advanceTime",{minutes:60,silentPhoneAdvance:true});
 await act(async()=>finish({events:[],advancedMinutes:60,stopped:false}));
 expect(b.disabled).toBe(false);
});
it("+1 Std erklärt einen Freigabestopp mit tatsächlichem Fortschritt",async()=>{
 fixture.game.send=vi.fn(async()=>({stopped:true,stopReason:"pending_approval",advancedMinutes:0}));
 await render();await act(async()=>(document.querySelector('button[aria-label="1 Stunde weiter"]') as HTMLButtonElement).click());
 expect(fixture.game.showToast).toHaveBeenCalledWith(expect.stringContaining("0 von 60 Minuten"),"info");
 expect(fixture.game.showToast).toHaveBeenCalledWith(expect.stringContaining("Freigaben"),"info");
});
