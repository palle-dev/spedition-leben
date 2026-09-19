import {describe,it,expect} from "vitest";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {getStaffPhoneContacts,getStaffPhoneData,executeStaffPhoneCommand} from "@/lib/simulation/staffPhone";
import {processStaffTasks} from "@/lib/simulation/mailIntents";
function initial(){const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});s.gameTime=540;s.employees.push(
 {id:"phone-a",name:"Alex",role:"assistant",employmentStatus:"employed",attendance:"present"},
 {id:"phone-m",name:"Maria",role:"branch_manager",employmentStatus:"employed",attendance:"present",assignedBranchId:s.branches[0].id,managementMode:"requests_approval"});return s;}
describe("Ausgehende Teamtelefonate",()=>{
 it("listet nur beschäftigte Assistenten und Filialleiter ohne Zustandsänderung",()=>{const s=initial();s.employees.push({id:"old",role:"assistant",name:"Alt",employmentStatus:"terminated"});const before=JSON.stringify(s);expect(getStaffPhoneContacts(s).map(c=>c.id)).toEqual(["phone-a","phone-m"]);getStaffPhoneData(s,"phone-a");expect(JSON.stringify(s)).toBe(before);});
 it("führt die beauftragte Assistentenaufgabe später aus und verhindert doppelte Warteschlangeneinträge",()=>{
 const s=initial();const p={employeeId:"phone-a",action:"assistant_report"};const first=applyCommand(s,"staffPhoneCommand",p).result;expect(first.queued).toBe(true);applyCommand(s,"staffPhoneCommand",p);expect(s.mail.staffTasks.filter(t=>t.employeeId==="phone-a")).toHaveLength(1);
 processStaffTasks(s,s.gameTime+14,[]);expect(s.mail.staffTasks[0].status).toBe("pending");
 processStaffTasks(s,s.gameTime+15,[]);expect(s.mail.staffTasks[0].status).toBe("completed");expect(s.mail.staffTasks[0].result.ok).toBe(true);expect(s.mail.messages.some(m=>m.sourceEvent==="task_reply_assistant_report")).toBe(true);
 });
 it("Filialstatus zählt ausschließlich die eigene Flotte",()=>{const s=initial();s.vehicles=[{id:"local",branchId:s.branches[0].id,status:"free"},{id:"remote",branchId:"other",status:"free"}];expect(getStaffPhoneData(s,"phone-m").report[0].value).toContain("1 Lkw");});
 it("Filialleiter können ihren Modus ändern, Assistenten können es nicht",()=>{const s=initial();applyCommand(s,"staffPhoneCommand",{employeeId:"phone-m",action:"mode",mode:"autonomous"});expect(s.employees.find(e=>e.id==="phone-m").managementMode).toBe("autonomous");expect(()=>executeStaffPhoneCommand(s,{employeeId:"phone-a",action:"mode",mode:"autonomous"})).toThrow();});
 it("verbietet fremde Standortfreigaben, geänderte Kosten und Mehrfachausführung",()=>{
 const s=initial(),branchId=s.branches[0].id;s.branchDecisions=[{id:"own",managerId:"phone-m",branchId,type:"hire_driver",title:"Fahrer einstellen",costCents:10000,status:"pending"},{id:"foreign",managerId:"other",branchId:"elsewhere",type:"hire_driver",costCents:10000,status:"pending"}];
 const count=s.drivers.length;
 expect(()=>applyCommand(s,"staffPhoneCommand",{employeeId:"phone-m",action:"approve",decisionId:"foreign",expectedCostCents:10000})).toThrow();
 expect(()=>applyCommand(s,"staffPhoneCommand",{employeeId:"phone-m",action:"approve",decisionId:"own",expectedCostCents:1})).toThrow();expect(s.drivers).toHaveLength(count);
 const p={employeeId:"phone-m",action:"approve",decisionId:"own",expectedCostCents:10000};applyCommand(s,"staffPhoneCommand",p);expect(s.drivers).toHaveLength(count+1);expect(()=>applyCommand(s,"staffPhoneCommand",p)).toThrow();expect(s.drivers).toHaveLength(count+1);
 });
 it("prüft Dienstzeit, Krankheit und private Aktionssperren auch bei Bestätigung",()=>{
 const s=initial(),p={employeeId:"phone-a",action:"assistant_report"};s.gameTime=1200;expect(getStaffPhoneContacts(s)[0].available).toBe(false);expect(()=>applyCommand(s,"staffPhoneCommand",p)).toThrow();
 s.gameTime=540;s.employees.find(e=>e.id==="phone-a").attendance="sick";expect(()=>applyCommand(s,"staffPhoneCommand",p)).toThrow();
 s.employees.find(e=>e.id==="phone-a").attendance="present";s.appointments.push({status:"active",type:"private",endMin:600});expect(()=>applyCommand(s,"staffPhoneCommand",p)).toThrow(/privaten Aktivität/);
 });
 it("Aufträge und Gesprächsnotizen überstehen Speichern und Laden",()=>{const s=initial();applyCommand(s,"staffPhoneCommand",{employeeId:"phone-a",action:"assistant_dispatch"});const copy=JSON.parse(JSON.stringify(s));expect(getStaffPhoneData(copy,"phone-a").tasks[0].type).toBe("assistant_dispatch");expect(copy.mail.messages.some(m=>m.subject.includes("Telefonauftrag"))).toBe(true);});
});
