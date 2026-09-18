import {describe,it,expect} from "vitest";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {processPhoneCommunications} from "@/lib/simulation/phoneCommunications";
function initial(){const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});return s;}
function risk(s){const o=s.orders[0];o.status="angenommen";o.deliveryDeadlineMin=s.gameTime+30;return o;}
describe("Stiller Zeitvorlauf",()=>{
 it.each([60,1440])("zeichnet Anrufe bei %s Minuten einmalig und dauerhaft auf",minutes=>{
  const s=initial(),o=risk(s);applyCommand(s,"advanceTime",{minutes,silentPhoneAdvance:true});
  expect(s.missedPhoneCalls.some(c=>c.orderId===o.id)).toBe(true);
  processPhoneCommunications(s,true);expect(s.missedPhoneCalls.filter(c=>c.orderId===o.id)).toHaveLength(1);
  expect(JSON.parse(JSON.stringify(s)).missedPhoneCalls.some(c=>c.orderId===o.id)).toBe(true);
 });
 it("bewahrt bereits erledigte Anrufe im Verlauf",()=>{
  const s=initial(),o=risk(s);processPhoneCommunications(s,true);o.status="geliefert";processPhoneCommunications(s,true);expect(s.missedPhoneCalls.some(c=>c.orderId===o.id)).toBe(true);
 });
 it("Livezeit markiert einen neuen Anruf nicht als verpasst",()=>{
  const s=initial();risk(s);processPhoneCommunications(s,false);expect(s.missedPhoneCalls).toBeUndefined();
 });
 it("informiert Kunden automatisch ohne Fristverlängerung oder doppelte Mitteilung",()=>{
  const s=initial(),o=risk(s);o.deliveryDeadlineMin=s.gameTime-1;const money=s.company.accountCents;
  processPhoneCommunications(s);processPhoneCommunications(s);expect(o.phoneCustomerInformed).toBe(true);expect(o.deliveryDeadlineMin).toBe(s.gameTime-1);expect(s.company.accountCents).toBe(money);expect(s.mail.messages.filter(m=>m.dedupKey==="phone_customer:"+o.id)).toHaveLength(1);
 });
});
