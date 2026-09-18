import {processPhoneCommunications} from "@/lib/simulation/phoneCommunications";
import {describe,it,expect} from "vitest";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {getPhoneProposals} from "@/lib/simulation/phoneProposals";
import {getDisruptionDetail,resolveDisruption} from "@/lib/simulation/disruptionEngine";
function initial(){const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});return s;}
function delay(s){const o=s.orders[0];o.status="angenommen";const d={id:"phone-test",type:"loading_delay",status:"decision_open",createdAtMin:s.gameTime,orderIds:[o.id],delayMin:30,cause:"Rampe belegt",history:[],options:[]};s.disruptions.items.push(d);d.options=getDisruptionDetail(s,d.id).options;return d;}
describe("Geführte Telefongespräche",()=>{
 it("Vorbereitung verändert weder Störung noch Konto",()=>{const s=initial(),d=delay(s),before=JSON.stringify(s);const options=getPhoneProposals(s,{id:d.id,type:"disruption"});expect(options.some(o=>o.id==="accept_delay")).toBe(true);expect(JSON.stringify(s)).toBe(before);});
 it("Kundeninformation benötigt keine Gesprächsentscheidung",()=>{const s=initial(),d=delay(s);const opts=getPhoneProposals(s,{id:d.id,type:"disruption"});expect(opts.some(o=>o.id==="inform_customer")).toBe(false);const act=opts.find(o=>o.id==="accept_delay");applyCommand(s,act.command,act.params);expect(d.status).toBe("completed");});
 it("geänderte Maßnahme wird vor Ausführung abgewiesen",()=>{const s=initial(),d=delay(s);const p=getPhoneProposals(s,{id:d.id,type:"disruption"}).find(o=>o.id==="accept_delay");p.params.params.phoneQuote.duration=-999;expect(()=>resolveDisruption(s,d.id,p.id,p.params.params)).toThrow(/geändert/);expect(d.status).toBe("decision_open");});
 it("automatische Kundeninformation bleibt gespeichert und ist idempotent",()=>{const s=initial(),o=s.orders[0];o.status="unterwegs";o.deliveryDeadlineMin=s.gameTime-1;const deadline=o.deliveryDeadlineMin;processPhoneCommunications(s);processPhoneCommunications(s);expect(s.mail.messages.filter(m=>m.dedupKey==="phone_customer:"+o.id)).toHaveLength(1);expect(o.deliveryDeadlineMin).toBe(deadline);expect(JSON.parse(JSON.stringify(s)).orders.find(x=>x.id===o.id).phoneCustomerInformed).toBe(true);expect(getPhoneProposals(s,{type:"delivery_risk",orderId:o.id})).toHaveLength(0);});
 it("fragt nach bestätigter Kundeninfo nicht erneut nach derselben Mitteilung",()=>{const s=initial(),d=delay(s);d.customerInformed=true;const o=s.orders.find(o=>o.id===d.orderIds[0]);o.status="unterwegs";expect(getPhoneProposals(s,{type:"delivery_risk",orderId:o.id}).some(p=>p.informationOnly)).toBe(false);});
 it("gelieferter Auftrag erhält keine neue Maßnahme",()=>{const s=initial(),o=s.orders[0];o.status="geliefert";expect(getPhoneProposals(s,{type:"delivery_risk",orderId:o.id})).toHaveLength(0);expect(()=>applyCommand(s,"phoneInformCustomer",{orderId:o.id})).toThrow();});
 it("Tourangebot wird rein vorbereitet und kann tatsächlich bestätigt werden",()=>{
  const s=initial();s.company.accountCents=10000000;const o=s.orders[0],v=s.vehicles[0],d=s.drivers[0];
  o.status="angenommen";o.fromCity=v.locationCity;o.toCity=v.locationCity;o.tons=1;o.isDangerousGoods=false;o.deliveryDeadlineMin=s.gameTime+2880;o.latestLoadStartMin=s.gameTime+1440;
  d.locationCity=v.locationCity;d.status="free";d.restUntil=null;v.status="free";v.condition=100;
  const before=JSON.stringify(s);const options=getPhoneProposals(s,{type:"delivery_risk",orderId:o.id});
  expect(JSON.stringify(s)).toBe(before);const p=options.find(o=>o.command==="confirmTour");expect(p).toBeTruthy();
  const bad=structuredClone(p.params);bad.phoneQuote.cost+=1;
  expect(()=>applyCommand(s,p.command,bad)).toThrow(/geändert/);expect(s.tours).toHaveLength(0);
  const r=applyCommand(s,p.command,p.params);expect(r.result.ok).toBe(true);expect(s.tours).toHaveLength(1);
  expect(()=>applyCommand(s,p.command,p.params)).toThrow();expect(s.tours).toHaveLength(1);
 });
});
