import {describe,it,expect} from "vitest";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {getDeliveryRisks,getEscalatedDeliveryRisks} from "@/lib/simulation/deliveryRisk";
import {processDisruptions,getDisruptionDetail} from "@/lib/simulation/disruptionEngine";
import {getCommunicationQueue} from "@/lib/communicationData";
function initial(){const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});return s;}
function late(s,min){const o=s.orders[0];o.status="unterwegs";o.deliveryDeadlineMin=s.gameTime+60;s.trips=[{id:"test-trip",orderId:o.id,status:"in_progress",endMin:o.deliveryDeadlineMin+min}];return o;}
describe("Eskalation an die Geschäftsführung",()=>{
 it("120 Minuten Verspätung bleiben ohne Anruf, größere Verspätung eskaliert",()=>{const s=initial();late(s,120);expect(getDeliveryRisks(s)).toHaveLength(1);expect(getCommunicationQueue(s).calls).toHaveLength(0);s.trips[0].endMin++;expect(getEscalatedDeliveryRisks(s)).toHaveLength(1);});
 it("bloßer Fristübertritt eskaliert eine kleine bekannte Verspätung nicht",()=>{const s=initial(),o=late(s,30);s.gameTime=o.deliveryDeadlineMin+10;expect(getEscalatedDeliveryRisks(s)).toHaveLength(0);});
 it("fehlender Transport bleibt auch nach Fristablauf dringend",()=>{const s=initial(),o=s.orders[0];o.status="angenommen";o.deliveryDeadlineMin=s.gameTime-1;expect(getEscalatedDeliveryRisks(s)).toHaveLength(1);});
 it("Fahrpersonal übernimmt Routine und Kundeninfo einmalig ohne Kosten",()=>{
 const s=initial(),o=late(s,30),driver=s.drivers[0];driver.attendance="present";
 const d={id:"routine",type:"loading_delay",status:"decision_open",driverId:driver.id,tripId:"test-trip",orderIds:[o.id],delayMin:30,createdAtMin:s.gameTime,history:[],options:[]};s.disruptions.items.push(d);d.options=getDisruptionDetail(s,d.id).options;
 expect(getCommunicationQueue(s).calls).toHaveLength(0);expect(getCommunicationQueue(s).emails.some(e=>e.id===d.id)).toBe(false);
 const balance=s.company.accountCents,deadline=o.deliveryDeadlineMin,eta=s.trips[0].endMin,log=[];
 processDisruptions(s,s.gameTime,log);processDisruptions(s,s.gameTime,log);
 expect(d.status).toBe("completed");expect(d.autoResolved).toBe(true);expect(d.autoResolvedBy).toBe(driver.name);expect(d.customerInformed).toBe(true);
 expect(s.company.accountCents).toBe(balance);expect(o.deliveryDeadlineMin).toBe(deadline);expect(s.trips[0].endMin).toBe(eta);
 expect(s.mail.messages.filter(m=>m.dedupKey==="disruption_inform:routine")).toHaveLength(1);
 });
 it("ohne verfügbares Personal bleibt die Routine im Postfach statt als Telefonunterbrechung",()=>{
 const s=initial(),o=late(s,30);s.employees=[];const d={id:"alone",type:"loading_delay",status:"decision_open",orderIds:[o.id],delayMin:30,createdAtMin:s.gameTime,history:[],options:[]};s.disruptions.items.push(d);expect(getCommunicationQueue(s).calls).toHaveLength(0);expect(getCommunicationQueue(s).emails.some(e=>e.id===d.id)).toBe(true);
 });
 it("Defekt ohne ausführbare Maßnahme wird zum Hinweis, laufende Maßnahme klingelt nicht",()=>{
 const s=initial(),o=late(s,30),d={id:"defect",type:"technical_defect",status:"decision_open",orderIds:[o.id]};s.disruptions.items.push(d);expect(getCommunicationQueue(s).calls).toHaveLength(0);expect(getCommunicationQueue(s).emails.some(e=>e.id===d.id&&e.informationOnly)).toBe(true);d.status="measure_running";expect(getCommunicationQueue(s).calls).toHaveLength(0);
 });
});