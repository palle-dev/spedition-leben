import {describe,it,expect} from "vitest";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {getCommunicationQueue} from "@/lib/communicationData";
import {getPhoneProposals} from "@/lib/simulation/phoneProposals";
import {getDisruptionDetail} from "@/lib/simulation/disruptionEngine";
import {processPhoneCommunications} from "@/lib/simulation/phoneCommunications";
function initial(){const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});return s;}
function late(s){const o=s.orders[0];o.status="unterwegs";o.deliveryDeadlineMin=s.gameTime+60;s.trips=[{orderId:o.id,status:"in_progress",endMin:o.deliveryDeadlineMin+180}];return o;}
describe("Telefon nur für ausführbare Entscheidungen",()=>{
 it("verspätete laufende Lieferung ohne Maßnahme erscheint nur als Hinweis",()=>{const s=initial(),o=late(s),before=JSON.stringify(s),q=getCommunicationQueue(s);expect(q.calls).toHaveLength(0);expect(q.emails.find(e=>e.orderId===o.id)).toMatchObject({informationOnly:true,actions:[]});expect(JSON.stringify(s)).toBe(before);});
 it("legt eine echte Mail einmalig an und keinen verpassten Anruf",()=>{const s=initial(),o=late(s);processPhoneCommunications(s,true);processPhoneCommunications(s,true);expect(s.missedPhoneCalls||[]).toHaveLength(0);expect(s.mail.messages.filter(m=>m.dedupKey==="delivery_notice:risk_"+o.id)).toHaveLength(1);});
 it("fehlende Fahrzeuge führen zu einer E-Mail statt leerem Telefonat",()=>{const s=initial(),o=s.orders[0];o.status="angenommen";o.deliveryDeadlineMin=s.gameTime+60;s.vehicles=[];expect(getCommunicationQueue(s).calls).toHaveLength(0);expect(getCommunicationQueue(s).emails.some(e=>e.orderId===o.id&&e.informationOnly)).toBe(true);});
 it("ein ausführbarer Reparaturvorschlag ruft weiterhin an und verändert bei Prüfung nichts",()=>{
 const s=initial(),v=s.vehicles[0],o=s.orders[0];o.status="angenommen";o.deliveryDeadlineMin=s.gameTime+60;
 const d={id:"actual-defect",type:"technical_defect",status:"decision_open",vehicleId:v.id,orderIds:[o.id],createdAtMin:s.gameTime,delayMin:0,history:[],options:[]};
 s.disruptions.items.push(d);d.options=getDisruptionDetail(s,d.id).options;const before=JSON.stringify(s);
 const q=getCommunicationQueue(s);expect(q.calls.some(c=>c.id===d.id)).toBe(true);for(const c of q.calls)expect(getPhoneProposals(s,c).length).toBeGreaterThan(0);expect(JSON.stringify(s)).toBe(before);
 const repair=getPhoneProposals(s,{id:d.id,type:"disruption"}).find(p=>p.id==="emergency_repair");expect(repair).toBeTruthy();expect(applyCommand(s,repair.command,repair.params).result.ok).toBe(true);
 });
 it("privat blockierte operative Entscheidungen klingeln nicht",()=>{const s=initial();late(s);s.appointments.push({status:"active",type:"private",endMin:s.gameTime+60});expect(getCommunicationQueue(s).calls).toHaveLength(0);});
});
