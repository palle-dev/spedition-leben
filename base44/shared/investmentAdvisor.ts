import { getDepot, getFreeSettlement, placeOrder, cancelOrder, isOpenInvestmentOrder, isStockTradingHour, roundQty } from "./investmentEngine.ts";
import { addBooking } from "./accountingEngine.ts";
import { deliverMessage } from "./mailEngine.ts";

export const ADVISOR_ID="investment-advisor";
export const ADVISOR_DAILY_FEE=5000;
export const ADVISOR_DEFAULTS={enabled:false,allowBuy:true,allowSell:true,allowStocks:true,allowCrypto:false,strategy:"balanced",dailyBudgetCents:100000,reserveCents:50000,maxPositionPct:25,stopLossPct:10,takeProfitPct:15,maxTradesPerDay:4};
export function getAdvisorPolicy(state,depotId){return {...ADVISOR_DEFAULTS,...state.investment?.advisor?.policies?.[depotId]};}
const label=id=>id==="company"?"Firma":"Privat";
const money=n=>(n/100).toFixed(2)+" EUR";
function note(state,subject,body,key){
 deliverMessage(state,{fromId:ADVISOR_ID,toId:"player",subject,body,gameTime:state.gameTime,category:"investment",priority:"normal",...(key?{dedupKey:key}:{})});
}
function requireAdvisor(state){const a=state.investment?.advisor;if(!a?.hired)throw Error("Bitte den Investmentberater zuerst beauftragen.");return a;}
function depotIdCheck(id){if(!["company","private"].includes(id))throw Error("Ungültiges Depot.");}
function cancelAdvisorOrders(state,depotId){
 for(const order of [...(getDepot(state,depotId)?.orders||[])])if(order.advisorManaged&&isOpenInvestmentOrder(order))cancelOrder(state,{orderId:order.id});
}
export function hireInvestmentAdvisor(state){
 if(state.investment?.advisor?.hired)return {ok:true,summary:"Der Berater ist bereits beauftragt."};
 if(state.company.accountCents<ADVISOR_DAILY_FEE)throw Error("Firmenkonto reicht für das Tageshonorar nicht aus.");
 const day=Math.floor(state.gameTime/1440);
 const existing=state.investment.advisor;
 const alreadyPaid=existing?.paidDay===day;
 if(!alreadyPaid)addBooking(state,state.gameTime,"Investmentberatung",-ADVISOR_DAILY_FEE,"company","advisor_fee:"+day);
 const a=existing||{policies:{},activity:[],runtime:{},revision:0};
 a.hired=true;a.paidDay=day;a.revision++;a.lastRunHour=Math.floor(state.gameTime/60);
 for(const id of ["company","private"])a.policies[id]={...ADVISOR_DEFAULTS,...a.policies[id],enabled:false};
 state.investment.advisor=a;
 note(state,"Investmentberater beauftragt","Robin Weber betreut deine beiden Depots. Honorar: 50 EUR je Spieltag aus dem Firmenkonto, heute "+(alreadyPaid?"bereits bezahlt":"bezahlt")+". Handel beginnt erst nach deiner separaten Freigabe pro Depot. Es erfolgen keine automatischen Überweisungen zwischen Bank und Depot.");
 return {ok:true,summary:"Investmentberater beauftragt. Beide Handelsmandate sind zunächst pausiert."};
}
export function configureInvestmentAdvisor(state,p){
 const a=requireAdvisor(state);depotIdCheck(p.depotId);
 if(p.expectedRevision!==a.revision)throw Error("Die Berater-Einstellungen haben sich geändert. Bitte neu prüfen.");
 if(!p.policy||typeof p.policy!=="object"||Array.isArray(p.policy))throw Error("Ungültiges Mandat.");
 for(const k of Object.keys(p.policy))if(!(k in ADVISOR_DEFAULTS))throw Error("Unbekannte Mandatseinstellung.");
 const next={...getAdvisorPolicy(state,p.depotId),...p.policy};
 for(const k of ["enabled","allowBuy","allowSell","allowStocks","allowCrypto"])if(typeof next[k]!=="boolean")throw Error("Ungültige Handelsfreigabe.");
 if(!["defensive","balanced","growth"].includes(next.strategy))throw Error("Ungültige Strategie.");
 for(const k of ["dailyBudgetCents","reserveCents"])if(!Number.isSafeInteger(next[k])||next[k]<0||next[k]>100000000000)throw Error("Ungültiger Eurobetrag.");
 for(const [k,min,max] of [["maxPositionPct",5,100],["stopLossPct",1,90],["takeProfitPct",1,500],["maxTradesPerDay",1,12]])if(!Number.isInteger(next[k])||next[k]<min||next[k]>max)throw Error("Ungültige Grenze: "+k);
 if(next.enabled&&(!next.allowStocks&&!next.allowCrypto||!next.allowBuy&&!next.allowSell))throw Error("Bitte mindestens eine Anlageklasse und Handelsrichtung erlauben.");
 if(next.enabled&&next.allowBuy&&next.dailyBudgetCents<1000)throw Error("Kaufbudget muss mindestens 10 EUR betragen.");
 cancelAdvisorOrders(state,p.depotId);
 a.policies[p.depotId]=next;a.revision++;
 note(state,"Handelsmandat · "+label(p.depotId),(next.enabled?"Autonomer Handel aktiviert.":"Handel pausiert.")+" Kaufbudget je Tag: "+money(next.dailyBudgetCents)+". Depotreserve: "+money(next.reserveCents)+". Maximal "+next.maxTradesPerDay+" Orders täglich. Bestehende freie Bestände dürfen bei Verkaufsfreigabe mitverwaltet werden. Offene Beraterorders wurden storniert; bereits ausgeführte Geschäfte bleiben bestehen.");
 return {ok:true,summary:"Mandat für "+label(p.depotId)+" gespeichert. Prüfung zur nächsten vollen Spielstunde."};
}
export function stopInvestmentAdvisor(state){
 const a=requireAdvisor(state);
 for(const id of ["company","private"]){cancelAdvisorOrders(state,id);a.policies[id]={...getAdvisorPolicy(state,id),enabled:false};}
 a.hired=false;a.revision++;
 note(state,"Investmentberatung beendet","Keine weiteren Honorare oder neuen Beraterorders. Offene Beraterorders wurden storniert. Bestände und manuelle Orders bleiben erhalten.");
 return {ok:true,summary:"Beratung beendet. Bestände bleiben erhalten."};
}
function totalValue(state,id){
 const depot=getDepot(state,id);
 return depot.settlementCents+Object.entries(depot.positions).reduce((sum,[instrumentId,pos]:any)=>sum+Math.round(pos.qty*(state.investment.market.instruments[instrumentId]?.currentQuote.mid||0)),0);
}
function record(state,a,id,order,reason,budget){
 const entry={id:order.id,depotId:id,atMin:state.gameTime,side:order.side,instrumentId:order.instrumentId,qty:order.qty,reason,budgetCents:budget||0,status:order.status};
 a.activity.push(entry);if(a.activity.length>100)a.activity=a.activity.slice(-100);
}
export function processInvestmentAdvisor(state,m){
 const a=state.investment?.advisor;
 if(!a?.hired||m%60!==0||a.lastRunHour===Math.floor(m/60))return;
 a.lastRunHour=Math.floor(m/60);
 const day=Math.floor(m/1440);
 if(a.paidDay!==day){
  if(state.company.accountCents<ADVISOR_DAILY_FEE){
   for(const id of ["company","private"])cancelAdvisorOrders(state,id);
   a.suspended=true;
   note(state,"Investmentberatung pausiert","Das Firmenkonto reicht für das Tageshonorar nicht aus. Beide Depots pausieren; offene Beraterorders wurden storniert.","advisor_unpaid:"+day);return;
  }
  addBooking(state,m,"Investmentberatung",-ADVISOR_DAILY_FEE,"company","advisor_fee:"+day);
  a.paidDay=day;
 }
 a.suspended=false;
 for(const id of ["company","private"]){
  const policy=getAdvisorPolicy(state,id),depot=getDepot(state,id);
  if(!policy.enabled||!depot)continue;
  let rt=a.runtime[id];
  if(!rt||rt.day!==day)rt=a.runtime[id]={day,spentCents:0,trades:0,touched:[],lastSummary:"Noch keine passende Gelegenheit."};
  if(rt.trades>=policy.maxTradesPerDay)continue;
  const instruments=Object.values(state.investment.market.instruments).filter((i:any)=>i.tradeable&&i.currentQuote.status==="open"&&(i.type==="stock"?policy.allowStocks&&isStockTradingHour(m):policy.allowCrypto));
  const freeInstrument=(i:any)=>!rt.touched.includes(i.id)&&!depot.orders.some(o=>o.instrumentId===i.id&&isOpenInvestmentOrder(o));
  let choice:any=null;
  if(policy.allowSell){
   for(const inst of instruments as any[]){
    const pos=depot.positions[inst.id];
    if(!freeInstrument(inst)||!pos?.availableQty||!pos.qty||!pos.totalCostCents)continue;
    const pnl=(inst.currentQuote.bid*pos.qty/pos.totalCostCents-1)*100;
    if(pnl<=-policy.stopLossPct||pnl>=policy.takeProfitPct){
     choice={instrumentId:inst.id,side:"sell",qty:roundQty(pos.availableQty,inst.type),closePosition:true,reason:pnl<0?"Verlustgrenze erreicht":"Gewinnziel erreicht"};break;
    }
   }
  }
  if(!choice&&policy.allowBuy){
   const budget=Math.floor(Math.min(policy.dailyBudgetCents-rt.spentCents,getFreeSettlement(state,id)-policy.reserveCents));
   const equity=totalValue(state,id);
   const candidates=(instruments as any[]).filter(i=>freeInstrument(i)&&
    (policy.strategy!=="defensive"||i.riskClass==="niedrig")&&
    (policy.strategy!=="balanced"||i.riskClass!=="hoch"))
    .map(i=>{const history=i.priceHistory||[];const first=history[Math.max(0,history.length-7)]||i.currentQuote.mid;return {i,momentum:i.currentQuote.mid/first-1};})
    .filter(c=>policy.strategy!=="growth"||c.momentum>0)
    .sort((a,b)=>b.momentum-a.momentum||a.i.id.localeCompare(b.i.id));
   for(const {i} of candidates){
    const exposure=Math.round((depot.positions[i.id]?.qty||0)*i.currentQuote.ask);
    const cap=Math.floor(equity*policy.maxPositionPct/100)-exposure;
    const amount=Math.min(budget,cap);
    if(amount<1000)continue;
    choice={instrumentId:i.id,side:"buy",budgetCents:amount,reason:policy.strategy==="defensive"?"Streuung in niedriger Risikoklasse":policy.strategy==="growth"?"Positiver Kurstrend":"Aufbau eines gestreuten Depots"};break;
   }
  }
  if(!choice){rt.lastSummary="Keine passende Order innerhalb des Mandats, der Reserven und Handelszeiten.";continue;}
  try{
   const result=placeOrder(state,{depotId:id,...choice,orderType:"market",timeInForce:"DAY"});
   result.order.advisorManaged=true;
   rt.trades++;rt.touched.push(choice.instrumentId);
   if(choice.side==="buy")rt.spentCents+=choice.budgetCents;
   rt.lastSummary=(choice.side==="buy"?"Kauf":"Verkauf")+" "+choice.instrumentId+": "+choice.reason;
   record(state,a,id,result.order,choice.reason,choice.budgetCents);
   // One digest notice per depot/day; all individual orders remain in the order history.
   note(state,"Investmentberater · "+label(id),rt.lastSummary+". Weitere Geschäfte dieses Tages stehen im Beraterprotokoll und in den Orders.","advisor_activity:"+id+":"+day);
  }catch(error){rt.lastSummary=error.message;}
 }
}
export function getAdvisorPhoneData(state){
 const a=state.investment?.advisor;if(!a?.hired)return null;
 const report=[{label:"Honorar",value:"50 EUR je Spieltag · Firmenkonto"},{label:"Status",value:a.suspended?"Pausiert: Honorar offen":"Beauftragt"}];
 const actions=[];
 for(const id of ["company","private"]){
  const p=getAdvisorPolicy(state,id),rt=a.runtime?.[id];
  report.push({label:label(id)+" · Mandat",value:p.enabled?"Autonom":"Pausiert"},{label:label(id)+" · Freie Depotmittel",value:money(getFreeSettlement(state,id))},{label:label(id)+" · Kaufbudget/Tag",value:money(p.dailyBudgetCents)},{label:label(id)+" · Letzte Prüfung",value:rt?.lastSummary||"Noch nicht geprüft"});
  actions.push({id:"advisor:"+id,label:(p.enabled?"Handel pausieren: ":"Handel freigeben: ")+label(id),description:"Gilt für dieses Depot mit dem aktuell eingestellten Mandat. Keine Banküberweisungen. Verkäufe können Verluste realisieren. Beim Pausieren werden offene Beraterorders storniert.",
   params:{action:"advisor_policy",depotId:id,policy:{enabled:!p.enabled},expectedRevision:a.revision}});
 }
 return {contact:{id:ADVISOR_ID,name:"Robin Weber",role:"investment_advisor",label:"Investmentberater · Firma & Privat",available:true},report,actions,tasks:[]};
}
