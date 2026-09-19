import {describe,it,expect} from "vitest";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {processMarketTick,depositToDepot,placeOrder} from "@/lib/simulation/investmentEngine";
import {processInvestmentAdvisor,getAdvisorPolicy,ADVISOR_ID} from "@/lib/simulation/investmentAdvisor";
import {getStaffPhoneContacts,getStaffPhoneData} from "@/lib/simulation/staffPhone";
function initial(){
 const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});
 s.gameTime=600;processMarketTick(s,600,[]);
 s.private.accountCents=1000000;
 depositToDepot(s,{depotId:"private",amountCents:500000});
 depositToDepot(s,{depotId:"company",amountCents:500000});
 return s;
}
function hire(s){return applyCommand(s,"hireInvestmentAdvisor",{});}
function config(s,id,patch={}){return applyCommand(s,"configureInvestmentAdvisor",{depotId:id,expectedRevision:s.investment.advisor.revision,policy:{enabled:true,allowCrypto:true,allowStocks:false,reserveCents:0,dailyBudgetCents:100000,maxPositionPct:100,...patch}});}
function tick(s,m){s.gameTime=m;processMarketTick(s,m,[]);processInvestmentAdvisor(s,m);}
describe("Investmentberater",()=>{
 it("startet ohne Handel, berechnet nur ein Tageshonorar und wird Telefonkontakt",()=>{
  const s=initial(),bank=s.company.accountCents;hire(s);hire(s);
  expect(s.company.accountCents).toBe(bank-5000);
  expect(getAdvisorPolicy(s,"company").enabled).toBe(false);
  expect(getAdvisorPolicy(s,"private").enabled).toBe(false);
  const before=JSON.stringify(s);expect(getStaffPhoneContacts(s).some(c=>c.id===ADVISOR_ID)).toBe(true);getStaffPhoneData(s,ADVISOR_ID);expect(JSON.stringify(s)).toBe(before);
 });
 it.each(["company","private"])("kauft Krypto ausschließlich im freigegebenen %s-Depot und hält Budget/Reserve",id=>{
  const s=initial();hire(s);config(s,id,{reserveCents:450000});const other=id==="company"?"private":"company";
  const otherBefore=JSON.stringify(s.investment.depots[other]),banks=[s.company.accountCents,s.private.accountCents];
  for(let m=660;m<=900;m+=60)tick(s,m);
  const depot=s.investment.depots[id],a=s.investment.advisor;
  expect(depot.orders.some(o=>o.advisorManaged&&o.side==="buy"&&o.filledQty>0)).toBe(true);
  expect(depot.settlementCents).toBeGreaterThanOrEqual(450000);
  expect(a.runtime[id].spentCents).toBeLessThanOrEqual(100000);
  expect(a.runtime[id].trades).toBeLessThanOrEqual(4);
  // Market ticks may add performance metadata; positions, cash and orders stay separate.
  const previous=JSON.parse(otherBefore);
  expect(s.investment.depots[other].positions).toEqual(previous.positions);
  expect(s.investment.depots[other].settlementCents).toBe(previous.settlementCents);
  expect(s.investment.depots[other].orders).toEqual(previous.orders);
  expect([s.company.accountCents,s.private.accountCents]).toEqual(banks);
  const before=JSON.stringify(s);processInvestmentAdvisor(s,900);expect(JSON.stringify(s)).toBe(before);
 });
 it("kauft Aktien, respektiert Handelszeiten und ausgeschlossene Anlageklassen",()=>{
  const s=initial();hire(s);config(s,"private",{allowStocks:true,allowCrypto:false});
  tick(s,660);expect(s.investment.depots.private.orders.some(o=>o.advisorManaged&&s.investment.market.instruments[o.instrumentId].type==="stock")).toBe(true);
  const n=s.investment.depots.private.orders.length;tick(s,1080);expect(s.investment.depots.private.orders).toHaveLength(n);
 });
 it.each(["company","private"])("verkauft freigegebene Bestände bei Gewinnziel im %s-Depot",id=>{
  const s=initial();hire(s);
  placeOrder(s,{depotId:id,instrumentId:"FHBR",side:"buy",orderType:"market",budgetCents:50000});
  config(s,id,{allowBuy:false});
  const inst=s.investment.market.instruments.FHBR;
  inst.currentQuote={...inst.currentQuote,bid:4000,ask:4010,mid:4005,status:"open"};inst.brokerLiquidityCents=10000000;
  s.gameTime=660;processInvestmentAdvisor(s,660);
  expect(s.investment.depots[id].orders.some(o=>o.advisorManaged&&o.side==="sell"&&o.filledQty>0)).toBe(true);
 });
 it("Verlustgrenze erzeugt ebenfalls einen Verkauf und Verkaufssperre verhindert ihn",()=>{
  const s=initial();hire(s);placeOrder(s,{depotId:"private",instrumentId:"FHBR",side:"buy",orderType:"market",budgetCents:50000});
  config(s,"private",{allowBuy:true,allowSell:false,reserveCents:500000});
  const inst=s.investment.market.instruments.FHBR;inst.currentQuote={...inst.currentQuote,bid:500,ask:510,mid:505,status:"open"};inst.brokerLiquidityCents=10000000;
  s.gameTime=660;processInvestmentAdvisor(s,660);expect(s.investment.depots.private.orders.some(o=>o.advisorManaged&&o.side==="sell")).toBe(false);
  config(s,"private",{allowBuy:false,allowSell:true});s.gameTime=720;processInvestmentAdvisor(s,720);
  expect(s.investment.depots.private.orders.some(o=>o.advisorManaged&&o.side==="sell"&&o.filledQty>0)).toBe(true);
 });
 it("blockiert Firmenkäufe bei offenen Betriebskosten, aber trennt das Privatmandat",()=>{
  const s=initial();hire(s);config(s,"company");config(s,"private");s.openCosts.push({account:"company",amountCents:10000});
  tick(s,660);expect(s.investment.depots.company.orders.some(o=>o.advisorManaged)).toBe(false);expect(s.investment.depots.private.orders.some(o=>o.advisorManaged)).toBe(true);
 });
 it("weist ungültige Mandate und veraltete Telefonfreigaben ohne Änderung zurück",()=>{
  const s=initial();hire(s);
  const p=getStaffPhoneData(s,ADVISOR_ID).actions[0].params;
  applyCommand(s,"staffPhoneCommand",{employeeId:ADVISOR_ID,...p});
  expect(()=>applyCommand(s,"staffPhoneCommand",{employeeId:ADVISOR_ID,...p})).toThrow(/geändert/);
  const before=JSON.stringify(s.investment.advisor);
  for(const policy of [{dailyBudgetCents:-1},{reserveCents:NaN},{maxTradesPerDay:999},{allowCrypto:"yes"},{unknown:true}])
   expect(()=>applyCommand(s,"configureInvestmentAdvisor",{depotId:"company",policy,expectedRevision:s.investment.advisor.revision})).toThrow();
  expect(JSON.stringify(s.investment.advisor)).toBe(before);
 });
 it("Pausieren storniert nur offene Beraterorders und erhält manuelle Orders",()=>{
  const s=initial();hire(s);config(s,"private");
  const manual=placeOrder(s,{depotId:"private",instrumentId:"FHBR",side:"buy",orderType:"limit",limitCents:1,qty:10}).order;
  const automatic=placeOrder(s,{depotId:"private",instrumentId:"FNOV",side:"buy",orderType:"limit",limitCents:1,qty:1}).order;automatic.advisorManaged=true;
  config(s,"private",{enabled:false});
  expect(automatic.status).toBe("cancelled");expect(manual.status).toBe("open");
  const n=s.investment.depots.private.orders.length;tick(s,660);expect(s.investment.depots.private.orders).toHaveLength(n);
 });
 it("beendet Honorare und Handel bei Kündigung; fehlendes Honorar pausiert",()=>{
  const s=initial();hire(s);config(s,"private");s.company.accountCents=0;s.gameTime=1440;processInvestmentAdvisor(s,1440);
  expect(s.investment.advisor.suspended).toBe(true);expect(s.investment.depots.private.orders).toHaveLength(0);
  applyCommand(s,"stopInvestmentAdvisor",{});const n=s.bookings.length;processInvestmentAdvisor(s,2880);expect(s.bookings).toHaveLength(n);expect(getStaffPhoneContacts(s).some(c=>c.id===ADVISOR_ID)).toBe(false);
 });
 it("liefert identische Ergebnisse für Tages-, Stunden- und Viertelstundenvorlauf einschließlich Save/Load",()=>{
  const s=initial();hire(s);config(s,"company");config(s,"private");
  const results=[1440,60,15].map(step=>{let copy=structuredClone(s);for(let n=0;n<1440;n+=step){applyCommand(copy,"advanceTime",{minutes:step,silentPhoneAdvance:true});copy=JSON.parse(JSON.stringify(copy));}return {advisor:copy.investment.advisor,depots:copy.investment.depots,bank:copy.company.accountCents,private:copy.private.accountCents};});
  expect(results[1]).toEqual(results[0]);expect(results[2]).toEqual(results[0]);
 });
});
