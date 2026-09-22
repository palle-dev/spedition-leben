// @vitest-environment happy-dom
import {playPhoneSound} from "@/lib/experienceSound";
import React, {act} from "react";
import {createRoot} from "react-dom/client";
import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
const fixture=vi.hoisted(()=>({game:{} as any,calls:[] as any[]}));
vi.mock("@/lib/experienceSound",()=>({useSoundEnabled:()=>true,useSoundVolume:()=>.65,usePhoneAudioStatus:()=>"",phoneRingUrl:"test.wav",getSoundVolume:()=>.65,setSoundEnabled:vi.fn(),playPhoneSound:vi.fn(),stopPhoneSound:vi.fn()}));
vi.mock("@/lib/gameContext",()=>({useGame:()=>fixture.game}));
vi.mock("react-router-dom",()=>({useNavigate:()=>vi.fn(),useLocation:()=>({pathname:"/"})}));
vi.mock("@/api/base44Client",()=>({base44:{auth:{logout:vi.fn()}}}));
vi.mock("@/components/scenarios/ScenarioPicker",()=>({default:()=>null}));
vi.mock("@/lib/communicationData",()=>({getCommunicationQueue:()=>({calls:fixture.calls,emails:[]}),deadlineLabel:()=>"Lieferung prüfen"}));
vi.mock("@/components/office/OfficeHeader",()=>({default:()=>React.createElement("h1",null,"Büro")}));
vi.mock("@/components/office/OfficeKPIs",()=>({default:()=>React.createElement("div",null,"Kennzahlen")}));
vi.mock("@/components/office/DailyOverview",()=>({default:()=>React.createElement("div",null,"Tageshinweise")}));
vi.mock("@/components/office/ForecastHints",()=>({default:()=>null}));
vi.mock("@/components/office/DailyCapacity",()=>({default:()=>React.createElement("div",null,"Kapazitätsdetails")}));
vi.mock("@/components/office/DisruptionPanel",()=>({default:()=>React.createElement("div",null,"Störungsdetails")}));
vi.mock("@/components/office/ShortGoals",()=>({default:()=>React.createElement("div",null,"Zieldetails")}));
vi.mock("@/components/scenarios/ScenarioProgressPanel",()=>({default:()=>null}));
import {createInitialState} from "@/lib/simulation/simulationEngine";
import StaffPhoneDialog from "@/components/game/StaffPhoneDialog";
import Start from "@/pages/Start";
import Office from "@/pages/Office";
import Phone from "@/components/game/PhoneCenter";
let container:any,root:any;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;fixture.calls=[];fixture.game={
 state:null,busy:false,listSlots:vi.fn(async(s)=>s?[]:[{name:"Teststand",savedAt:1}]),refreshCloudSaves:vi.fn(),
 autosaveMetas:[],cloudSaves:[],loadSlot:vi.fn(),showToast:vi.fn(),pauseAutomation:vi.fn(),motionEnabled:false
};container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.restoreAllMocks();});
async function render(Component){await act(async()=>{root.render(React.createElement(Component));});}
function button(text){return [...document.querySelectorAll("button")].find(b=>b.textContent?.includes(text)) as HTMLButtonElement;}
describe("Laden, Büro und Telefon",()=>{
 it("zeigt den gewählten Spielstand sofort, blockiert Doppelklicks und ermöglicht nach Fehler einen erneuten Versuch",async()=>{
 let finish:any;fixture.game.loadSlot.mockImplementation(()=>new Promise(r=>finish=r));
 await render(Start);
 await act(async()=>{button("Teststand").click();button("Teststand").click();});
 expect(document.body.textContent).toContain("Spielstand wird geladen");
 expect(document.querySelector("fieldset").disabled).toBe(true);
 await act(async()=>{await new Promise(r=>setTimeout(r,60));});
 expect(fixture.game.loadSlot).toHaveBeenCalledTimes(1);
 await act(async()=>finish({ok:false,error:"Verbindung unterbrochen"}));
 expect(document.querySelector('[role="alert"]').textContent).toContain("Verbindung unterbrochen");
 expect(document.querySelector("fieldset").disabled).toBe(false);
 expect(document.body.textContent).not.toContain("Spielstand wird geladen");
 });
 it("behandelt auch eine geworfene Ladeausnahme ohne dauerhaft gesperrte Oberfläche",async()=>{
 fixture.game.loadSlot.mockRejectedValue(new Error("Datei nicht lesbar"));await render(Start);
 await act(async()=>{button("Teststand").click();await new Promise(r=>setTimeout(r,60));});
 expect(document.body.textContent).toContain("Datei nicht lesbar");expect(document.querySelector("fieldset").disabled).toBe(false);
 });
 it("Büro startet kompakt und baut Betrieb erst nach Auswahl auf",async()=>{
 fixture.game.state={meta:{partyId:"test"}};await render(Office);
 expect(document.body.textContent).toContain("Kennzahlen");
 expect(document.body.textContent).not.toContain("Kapazitätsdetails");
 expect(document.body.textContent).not.toContain("Störungsdetails");
 expect(document.querySelectorAll('[role="tab"]')).toHaveLength(4);
 await act(async()=>{button("Betrieb").dispatchEvent(new MouseEvent("mousedown",{bubbles:true,button:0}));button("Betrieb").click();});
 expect(document.body.textContent).toContain("Kapazitätsdetails");expect(document.body.textContent).toContain("Störungsdetails");
 });
 it("Telefon ist eine kompakte Schaltfläche und pausiert auch beim Annehmen keine Livezeit",async()=>{
 fixture.game.state={orders:[],vehicles:[],drivers:[],disruptions:{items:[]},gameTime:1};fixture.game.automationEnabled=true;
 fixture.calls=[{id:"risk_1",type:"delivery_risk",orderId:"1",source:"Leitstelle",title:"Lieferung in Gefahr",customer:"Kunde",fromCity:"Hamburg",toCity:"Bremen",deadline:100,eta:120}];
 await render(Phone);expect(document.querySelector('[role="dialog"]')).toBeNull();expect(fixture.game.pauseAutomation).not.toHaveBeenCalled();
 const phone=document.querySelector('button[aria-label*="Telefon öffnen"]') as HTMLButtonElement;
 expect(phone.className).not.toContain("fixed");
 await act(async()=>phone.click());expect(document.querySelector('[role="dialog"]')).not.toBeNull();
 await act(async()=>button("Annehmen").click());expect(document.body.textContent).toContain("FRACHTFIEBER · Direkte Leitung");
 expect(fixture.game.pauseAutomation).not.toHaveBeenCalled();
 });
});

it("zeigt das Abrufen der Cloud-Liste auch bei anfangs leerer Liste an",async()=>{
 fixture.game.cloudLoading=true;await render(Start);expect(document.body.textContent).toContain("Cloud-Spielstände werden geladen");
 fixture.game.cloudLoading=false;await render(Start);expect(document.body.textContent).not.toContain("Cloud-Spielstände werden geladen");
});
it("zeigt Vorlaufanrufe als verpasst und klingelt nach Abschluss oder erneutem Rendern nicht",async()=>{
 fixture.calls=[{id:"risk_1",type:"delivery_risk",orderId:"1",source:"Leitstelle",title:"Lieferung in Gefahr"}];
 fixture.game.state={orders:[],vehicles:[],drivers:[],disruptions:{items:[]},gameTime:90,missedPhoneCalls:[{...fixture.calls[0],missedAtMin:60}]};
 vi.mocked(playPhoneSound).mockClear();await render(Phone);await render(Phone);
 expect(playPhoneSound).not.toHaveBeenCalled();
 await act(async()=>{(document.querySelector('button[aria-label*="Telefon öffnen"]') as HTMLButtonElement).click();});
 expect(document.body.textContent).toContain("Verpasster Anruf");expect(document.body.textContent).toContain("Rückruf offen");
});

it("Statusabfrage ist lesend; eine telefonische Anweisung wird erst nach Bestätigung einmal gesendet",async()=>{
 const s=createInitialState({}).state;s.gameTime=540;s.employees.push({id:"team-assistant",name:"Alex",role:"assistant",employmentStatus:"employed",attendance:"present"});
 fixture.game.state=s;fixture.game.send=vi.fn(async()=>({ok:true,queued:true,summary:"Auftrag angenommen."}));
 await render(()=>React.createElement(StaffPhoneDialog,{employeeId:"team-assistant",onClose:vi.fn()}));
 await act(async()=>button("Aktuellen Status abfragen").click());
 expect(document.querySelector('[aria-label="Statusauskunft"]').textContent).toContain("Firmenkonto");expect(fixture.game.send).not.toHaveBeenCalled();
 await act(async()=>button("Offene Aufträge disponieren").click());expect(fixture.game.send).not.toHaveBeenCalled();
 await act(async()=>{button("Anweisung bestätigen").click();button("Anweisung bestätigen").click();});
 expect(fixture.game.send).toHaveBeenCalledTimes(1);expect(fixture.game.send).toHaveBeenCalledWith("staffPhoneCommand",{employeeId:"team-assistant",action:"assistant_dispatch"});
 expect(document.body.textContent).toContain("Auftrag angenommen.");expect(fixture.game.pauseAutomation).not.toHaveBeenCalled();
});

it("iPhone-Navigation öffnet Kontakte und einen Team-Anruf ohne Änderung der Spielzeit",async()=>{
 const s=createInitialState({}).state;s.gameTime=540;s.employees.push({id:"phone-contact",name:"Alex",role:"assistant",employmentStatus:"employed",attendance:"present"});
 fixture.game.state=s;fixture.game.send=vi.fn();
 await render(Phone);
 await act(async()=>{(document.querySelector('button[aria-label*="Telefon öffnen"]') as HTMLButtonElement).click();});
 expect(document.querySelector(".ff-phone")).not.toBeNull();
 expect(document.querySelector('[aria-label="Telefonnavigation"]')).not.toBeNull();
 await act(async()=>button("Kontakte").click());
 expect(document.querySelector('button[aria-pressed="true"]').textContent).toContain("Kontakte");
 await act(async()=>button("Alex").click());
 expect(document.querySelector(".ff-phone-call")).not.toBeNull();
 expect(document.body.textContent).toContain("Aktuellen Status abfragen");
 expect(fixture.game.send).not.toHaveBeenCalled();expect(fixture.game.state.gameTime).toBe(540);
 await act(async()=>button("Gespräch beenden").click());expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("verpasste Anrufe lassen sich aus dem Verpasst-Bereich zurückrufen",async()=>{
 fixture.calls=[{id:"risk_1",type:"delivery_risk",orderId:"1",source:"Leitstelle",title:"Lieferung in Gefahr"}];
 fixture.game.state={orders:[],vehicles:[],drivers:[],disruptions:{items:[]},gameTime:90,missedPhoneCalls:[{...fixture.calls[0],missedAtMin:60}]};
 await render(Phone);await act(async()=>{(document.querySelector('button[aria-label*="Telefon öffnen"]') as HTMLButtonElement).click();});
 await act(async()=>{const tab=[...document.querySelectorAll('[aria-label="Telefonnavigation"] button')].find(b=>b.textContent?.includes("Verpasst")) as HTMLButtonElement;tab.click();});
 await act(async()=>button("Rückruf offen").click());
 expect(document.querySelector(".ff-phone-call")).not.toBeNull();
 expect(fixture.game.pauseAutomation).not.toHaveBeenCalled();
});

it("Investmentberater-Mandat kann im Telefon geprüft und erst danach verbindlich erteilt werden",async()=>{
 const s=createInitialState({}).state;s.gameTime=600;
 s.investment.advisor={hired:true,revision:1,paidDay:0,policies:{},runtime:{},activity:[]};
 fixture.game.state=s;fixture.game.send=vi.fn(async()=>({ok:true,summary:"Mandat übernommen."}));
 await render(()=>React.createElement(StaffPhoneDialog,{employeeId:"investment-advisor",onClose:vi.fn()}));
 expect(document.body.textContent).toContain("Robin Weber");
 const section=document.querySelector('[aria-label="Handelsmandat Firmendepot"]')!;
 const activate=section.querySelector('input[type="checkbox"]') as HTMLInputElement;
 await act(async()=>activate.click());
 const review=[...section.querySelectorAll("button")].find(b=>b.textContent==="Mandat prüfen")!;
 await act(async()=>review.click());expect(fixture.game.send).not.toHaveBeenCalled();
 const confirm=[...section.querySelectorAll("button")].find(b=>b.textContent==="Mandat bestätigen")!;
 await act(async()=>{confirm.click();confirm.click();});
 expect(fixture.game.send).toHaveBeenCalledTimes(1);
 expect(fixture.game.send).toHaveBeenCalledWith("staffPhoneCommand",expect.objectContaining({employeeId:"investment-advisor",action:"advisor_policy",depotId:"company",expectedRevision:1,policy:expect.objectContaining({enabled:true})}));
});
