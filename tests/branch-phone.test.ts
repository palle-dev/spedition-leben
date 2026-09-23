import {describe,it,expect} from "vitest";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {executeCommand} from "@/lib/simulationAdapter";
import {getCommunicationQueue} from "@/lib/communicationData";
import {getPhoneProposals} from "@/lib/simulation/phoneProposals";
import {processPhoneCommunications} from "@/lib/simulation/phoneCommunications";
function fixture(){
 const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});
 const branch=s.branches[0];
 s.employees.push({id:"phone-manager",name:"Mara Hansen",role:"branch_manager",assignedBranchId:branch.id,employmentStatus:"employed"});
 s.branchDecisions=[{id:"branch-phone-test",status:"pending",type:"cost_optimization",branchId:branch.id,managerId:"phone-manager",createdAt:s.gameTime,costCents:10000,savingPerDayCents:100,title:"Abläufe verbessern",description:"Neue Abläufe am Standort.",benefitDesc:"Täglich geringere Kosten"}];
 return s;
}
describe("Filialfreigaben per Telefon",()=>{
 it("lädt bestehende Anfragen ohne Migration als Anruf und nicht als E-Mail-Entscheidung",()=>{
  const s=JSON.parse(JSON.stringify(fixture())),before=JSON.stringify(s),q=getCommunicationQueue(s);
  expect(q.calls).toHaveLength(1);expect(q.calls[0]).toMatchObject({id:"branch-phone-test",type:"branch_decision",source:"Mara Hansen",deadline:null});
  expect(q.calls[0].location).toContain(s.branches[0].city);
  expect(q.emails.some(e=>e.type==="branch_decision")).toBe(false);
  expect(getPhoneProposals(s,q.calls[0])[0]).toMatchObject({costCents:10000,benefitDesc:"Täglich geringere Kosten",rejectCommand:"rejectBranchDecision"});
  expect(JSON.stringify(s)).toBe(before);
 });
 it.each([true,false])("führt die Telefonantwort einmalig aus: Freigabe=%s",async approve=>{
  const s=fixture(),money=s.company.accountCents,p=getPhoneProposals(s,getCommunicationQueue(s).calls[0])[0];
  const command=approve?p.command:p.rejectCommand,params=approve?p.params:p.rejectParams;
  const r=await executeCommand(s,command,params);
  expect(r.result?.ok).toBe(true);
  expect(s.branchDecisions[0].status).toBe(approve?"approved":"rejected");
  expect(s.company.accountCents).toBe(money-(approve?p.costCents:0));
  expect(getCommunicationQueue(s).calls).toHaveLength(0);
  expect((await executeCommand(s,command,params)).error).toBeTruthy();
  expect(s.mail.messages.filter(m=>m.dedupKey==="branch_reply:branch-phone-test")).toHaveLength(1);
 });
 it("fehlende Mittel blockieren Freigabe, erlauben aber eine echte Ablehnung",async()=>{
  const s=fixture();s.company.accountCents=0;
  const p=getPhoneProposals(s,getCommunicationQueue(s).calls[0])[0];
  expect(p.approvalUnavailable).toContain("Geldmittel");
  expect((await executeCommand(s,p.command,p.params)).error).toBeTruthy();
  expect(s.branchDecisions[0].status).toBe("pending");
  expect((await executeCommand(s,p.rejectCommand,p.rejectParams)).result?.ok).toBe(true);
 });
 it.each([60,1440])("zeichnet im %s-Minuten-Vorlauf einen dauerhaften Rückruf auf",minutes=>{
  const s=fixture();applyCommand(s,"advanceTime",{minutes,silentPhoneAdvance:true});processPhoneCommunications(s,true);
  const restored=JSON.parse(JSON.stringify(s));
  expect(restored.missedPhoneCalls.filter(c=>c.id==="branch-phone-test")).toHaveLength(1);
  expect(getCommunicationQueue(restored).calls.some(c=>c.id==="branch-phone-test")).toBe(true);
 });
 it("Livezeit klingelt für offene Anfragen; erledigte und autonome Entscheidungen rufen nicht an",()=>{
  const s=fixture();processPhoneCommunications(s,false);expect(s.missedPhoneCalls||[]).toHaveLength(0);
  for(const status of ["approved","rejected","auto_approved"]){
   s.branchDecisions[0].status=status;expect(getCommunicationQueue(s).calls).toHaveLength(0);
  }
 });
});
