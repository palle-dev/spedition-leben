import {describe,it,expect} from "vitest";
import {getDeliveryRisks} from "@/lib/simulation/deliveryRisk";
import {getCommunicationQueue} from "@/lib/communicationData";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
function initial(){const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});s.orders=[];return s;}
function order(s,extra={}){const o={id:"risk-order",status:"angenommen",customer:"Testkunde",fromCity:"Hamburg",toCity:"Bremen",deliveryDeadlineMin:s.gameTime+100,...extra};s.orders.push(o);return o;}
describe("Liefergefährdung",()=>{
 it("meldet unzugeordneten Auftrag vor Fristablauf als Anruf",()=>{const s=initial();order(s);expect(getDeliveryRisks(s)[0].code).toBe("unplanned");expect(getCommunicationQueue(s).calls[0].type).toBe("delivery_risk");});
 it("meldet verspätete Ankunft auch ohne Störung",()=>{const s=initial();const o=order(s,{status:"unterwegs"});s.trips=[{orderId:o.id,status:"in_progress",endMin:o.deliveryDeadlineMin+10}];expect(getDeliveryRisks(s)[0].code).toBe("late_eta");});
 it("löst bei sicherer Ankunft keinen Anruf aus",()=>{const s=initial();const o=order(s,{status:"unterwegs"});s.trips=[{orderId:o.id,status:"in_progress",endMin:o.deliveryDeadlineMin-10}];expect(getDeliveryRisks(s)).toHaveLength(0);});
 it("laufende Reparatur bleibt als Liefergefährdung sichtbar",()=>{const s=initial();const o=order(s);s.disruptions.items=[{id:"d",type:"technical_defect",status:"measure_running",orderIds:[o.id],cause:"Reparatur dauert an"}];expect(getCommunicationQueue(s).calls[0]).toMatchObject({type:"delivery_risk",disruptionId:"d"});});
 it("offene Defektentscheidung und Auftrag erzeugen keinen doppelten Anruf",()=>{const s=initial();const o=order(s);s.disruptions.items=[{id:"d",type:"technical_defect",status:"decision_open",orderIds:[o.id]}];expect(getCommunicationQueue(s).calls).toHaveLength(1);});
 it("keine Warnung für gelieferte oder nur angebotene Aufträge",()=>{const s=initial();order(s,{status:"geliefert"});order(s,{id:"offer",status:"offered"});expect(getDeliveryRisks(s)).toHaveLength(0);});
 it("Risikoprüfung verändert keinen Spielstand",()=>{const s=initial();order(s);const before=JSON.stringify(s);getDeliveryRisks(s);expect(JSON.stringify(s)).toBe(before);});
 it("geschützter Vorlauf stoppt vor einer gefährdeten Lieferung",()=>{const s=initial();order(s);const start=s.gameTime;const r=applyCommand(s,"advanceTime",{minutes:1440,stopOnDeliveryRisk:true});expect(r.result.stopReason).toBe("delivery_at_risk");expect(s.gameTime).toBe(start);});
 it("Vorlauf erkennt später eintretende Dringlichkeit vor Ablauf",()=>{const s=initial();const o=order(s,{deliveryDeadlineMin:s.gameTime+300});const r=applyCommand(s,"advanceTime",{minutes:1440,stopOnDeliveryRisk:true});expect(r.result.stopReason).toBe("delivery_at_risk");expect(s.gameTime).toBeLessThan(o.deliveryDeadlineMin);});
});