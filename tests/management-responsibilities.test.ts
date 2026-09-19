import {describe,it,expect} from "vitest";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {getStaffPhoneData} from "@/lib/simulation/staffPhone";
import {branchResponsibilityAllows,processManagementReports} from "@/lib/simulation/managementResponsibilities";
function initial(){const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});s.gameTime=540;s.employees.push({id:"a",name:"Alex",role:"assistant",employmentStatus:"employed",attendance:"present"},{id:"m",name:"Maria",role:"branch_manager",employmentStatus:"employed",attendance:"present",assignedBranchId:s.branches[0].id});return s;}
describe("Erweiterte Führungsverantwortung",()=>{
 it("ändert dauerhaft Assistenzaufgaben per bestätigtem Telefonauftrag und schützt vor Wiederholung",()=>{
  const s=initial();const action=getStaffPhoneData(s,"a").actions.find(a=>a.id==="responsibility:autoDispatch");
  const p={employeeId:"a",...action.params};applyCommand(s,"staffPhoneCommand",p);
  expect(s.assistantConfig.autoDispatch).toBe(true);expect(()=>applyCommand(s,"staffPhoneCommand",p)).toThrow(/geändert/);
  expect(JSON.parse(JSON.stringify(s)).assistantConfig.autoDispatch).toBe(true);
 });
 it("beschränkt Zuständigkeiten auf den angerufenen Filialleiter, einschließlich neuer Einstellungen",()=>{
  const s=initial();const action=getStaffPhoneData(s,"m").actions.find(a=>a.id==="responsibility:staff");applyCommand(s,"staffPhoneCommand",{employeeId:"m",...action.params});
  const manager=s.employees.find(e=>e.id==="m");
  expect(branchResponsibilityAllows(manager,"hire_employee:dispatcher")).toBe(false);
  expect(branchResponsibilityAllows(manager,"staff_training")).toBe(false);
  expect(branchResponsibilityAllows(manager,"maintenance")).toBe(true);
  expect(s.employees.find(e=>e.id==="a").responsibilities).toBeUndefined();
 });
 it("erstellt tägliche Lageberichte nur einmal und nur bei aktivierter Verantwortung",()=>{
  const s=initial();processManagementReports(s,540);expect(s.mail.messages.some(m=>m.dedupKey?.startsWith("management_report"))).toBe(false);
  const a=getStaffPhoneData(s,"a").actions.find(a=>a.id==="responsibility:managementReport");
  applyCommand(s,"staffPhoneCommand",{employeeId:"a",...a.params});processManagementReports(s,540);processManagementReports(s,600);
  expect(s.mail.messages.filter(m=>m.dedupKey==="management_report:a:0")).toHaveLength(1);
 });
 it("setzt Tagesbudgets ohne den Verbrauch zurückzusetzen und liefert rein lesende Lageberichte",()=>{
  const s=initial(),m=s.employees.find(e=>e.id==="m");m.autonomousSpendDay=0;m.autonomousSpentCents=40000;
  const a=getStaffPhoneData(s,"m").actions.find(a=>a.id==="management_budget:50000");applyCommand(s,"staffPhoneCommand",{employeeId:"m",...a.params});
  expect(m.autonomousDailyBudgetCents).toBe(50000);expect(m.autonomousSpentCents).toBe(40000);
  const bank=s.company.accountCents;applyCommand(s,"staffPhoneCommand",{employeeId:"m",action:"management_report"});expect(s.company.accountCents).toBe(bank);
 });
});
