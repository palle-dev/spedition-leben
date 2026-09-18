import { describe,it,expect } from "vitest";
import { createInitialState,applyCommand } from "@/lib/simulation/simulationEngine";
import { getCommunicationQueue,deadlineLabel } from "@/lib/communicationData";
import { getDisruptionDetail,resolveDisruption } from "@/lib/simulation/disruptionEngine";
import { approveBranchDecision,rejectBranchDecision } from "@/lib/simulation/branchManagerEngine";
function initial(){const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});return s;}
function addDelay(s,remaining=300){
 const o=s.orders[0];o.status="angenommen";o.deliveryDeadlineMin=s.gameTime+remaining;
 const d={id:"phone-delay",type:"loading_delay",status:"decision_open",createdAtMin:s.gameTime,orderIds:[o.id],delayMin:30,cause:"Rampe belegt",history:[],options:[]};
 s.disruptions.items.push(d);d.options=getDisruptionDetail(s,d.id).options;return d;
}
describe("Telefon und Entscheidungspostfach",()=>{
 it("eskaliert planbare Rückfrage erst bei knapper Spielzeit zum Anruf",()=>{
  const s=initial();const d=addDelay(s,121);d.delayMin=180;
  expect(getCommunicationQueue(s).emails.some(e=>e.id===d.id)).toBe(true);
  expect(getCommunicationQueue(s).calls).toHaveLength(0);
  s.gameTime+=1;
  expect(getCommunicationQueue(s).calls.map(e=>e.id)).toEqual([d.id]);
  expect(getCommunicationQueue(s).emails.some(e=>e.id===d.id)).toBe(false);
 });
 it("blockierte Einsätze ohne ausführbare Maßnahme bleiben Hinweise ohne erfundene Frist",()=>{
  const s=initial();const d=addDelay(s);d.type="technical_defect";d.orderIds=[];
  const q=getCommunicationQueue(s);expect(q.calls).toHaveLength(0);const c=q.emails.find(e=>e.id===d.id);expect(c.informationOnly).toBe(true);
  expect(c.deadline).toBeNull();expect(deadlineLabel(c.deadline,s.gameTime)).toContain("Einsatz wartet");
 });
 it("offene Rückrufe überleben Laden, erledigte verschwinden",()=>{
  const s=initial();const d=addDelay(s,30);
  expect(getCommunicationQueue(JSON.parse(JSON.stringify(s))).calls[0].id).toBe(d.id);
  d.status="completed";
  expect(getCommunicationQueue(s).calls.some(c=>c.id===d.id)).toBe(false);
  expect(getCommunicationQueue(s).calls.some(c=>c.type==="delivery_risk")).toBe(true);
  s.orders[0].status="geliefert";
  expect(getCommunicationQueue(s).calls).toHaveLength(0);
 });
 it("ordnet echte Fristen und zeigt keine Echtzeit-Countdowns",()=>{
  expect(deadlineLabel(95,60)).toContain("35min Spielzeit");
  expect(deadlineLabel(59,60)).toContain("überschritten");
 });
 it("Gesprächsentscheidung erzeugt einmalige gespeicherte Notiz",()=>{
  const s=initial();const d=addDelay(s,30);
  resolveDisruption(s,d.id,"accept_delay",{});
  const notes=s.mail.messages.filter(m=>m.dedupKey==="disruption_note:"+d.id+":accept_delay");
  expect(notes).toHaveLength(1);expect(notes[0].body).toContain("30");
  expect(()=>resolveDisruption(s,d.id,"accept_delay",{})).toThrow();
  expect(s.mail.messages.filter(m=>m.dedupKey===notes[0].dedupKey)).toHaveLength(1);
  expect(JSON.parse(JSON.stringify(s)).mail.messages.some(m=>m.id===notes[0].id)).toBe(true);
 });
 it("fehlende Mittel lassen eine Freigabe offen und erzeugen keine Erfolgsantwort",()=>{
  const s=initial();s.company.accountCents=0;
  s.branchDecisions=[{id:"decision-test",status:"pending",type:"hire_driver",branchId:"b1",costCents:10000,title:"Fahrer"}];
  const count=s.drivers.length;
  expect(()=>approveBranchDecision(s,"decision-test")).toThrow();
  expect(s.branchDecisions[0].status).toBe("pending");
  expect(s.drivers.length).toBe(count);
  expect(s.mail.messages.some(m=>m.dedupKey==="branch_reply:decision-test")).toBe(false);
 });
 it("Freigabe und Antwort sind einmalig und dem Anliegen zugeordnet",()=>{
  const s=initial();s.branchDecisions=[{id:"decision-test",status:"pending",type:"hire_driver",branchId:"b1",costCents:10000,title:"Fahrer"}];
  const count=s.drivers.length;
  approveBranchDecision(s,"decision-test");
  expect(s.drivers.length).toBe(count+1);
  expect(s.branchDecisions[0].status).toBe("approved");
  const msg=s.mail.messages.find(m=>m.dedupKey==="branch_reply:decision-test");
  expect(msg.linkedRefs).toEqual([{type:"branch_decision",id:"decision-test"}]);
  expect(()=>approveBranchDecision(s,"decision-test")).toThrow();
  expect(s.drivers.length).toBe(count+1);
 });
 it("Ablehnung verschwindet aus der offenen Post und erhält eine Antwort",()=>{
  const s=initial();s.branchDecisions=[{id:"reject-test",status:"pending",type:"hire_driver",branchId:"b1",costCents:10000,title:"Fahrer"}];
  rejectBranchDecision(s,"reject-test");
  expect(getCommunicationQueue(s).emails.some(e=>e.id==="reject-test")).toBe(false);
  expect(s.mail.messages.some(m=>m.dedupKey==="branch_reply:reject-test")).toBe(true);
 });
});