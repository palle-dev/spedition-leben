import {describe,it,expect,vi} from "vitest";
import {createInitialState,applyCommand} from "@/lib/simulation/simulationEngine";
import {getDisruptionDetail} from "@/lib/simulation/disruptionEngine";
import {getPhoneProposals} from "@/lib/simulation/phoneProposals";
import {processPhoneCommunications} from "@/lib/simulation/phoneCommunications";
describe("Telefonprüfungen ohne spekulative Simulation",()=>{
 it("prüft wiederholt ohne den Spielstand zu kopieren und hält Reparaturen ausführbar",()=>{
  const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});
  const d={id:"perf-defect",type:"technical_defect",status:"decision_open",vehicleId:s.vehicles[0].id,orderIds:[],createdAtMin:s.gameTime,delayMin:0,history:[],options:[]};
  s.disruptions.items.push(d);d.options=getDisruptionDetail(s,d.id).options;
  const before=JSON.stringify(s);
  const spy=vi.spyOn(globalThis,"structuredClone");
  let proposals;
  try {
   proposals=getPhoneProposals(s,{id:d.id,type:"disruption"});
   expect(JSON.stringify(s)).toBe(before);
   for(let i=0;i<30;i++)processPhoneCommunications(s,true);
   expect(spy).not.toHaveBeenCalled();
  }finally{spy.mockRestore();}
  expect(s.missedPhoneCalls.filter(c=>c.id===d.id)).toHaveLength(1);
  for(const proposal of proposals) {
   const copy=structuredClone(s);
   expect(applyCommand(copy,proposal.command,proposal.params).result.ok).toBe(true);
  }
 });
 it("bietet keine Tourmaßnahme für eine fehlende Tour und keine Reparatur ohne Fahrzeug an",()=>{
  const s=createInitialState({}).state;applyCommand(s,"advanceTime",{minutes:0});
  const d={id:"missing",type:"technical_defect",status:"decision_open",vehicleId:"missing",tourId:"missing",orderIds:[],createdAtMin:s.gameTime,delayMin:0,history:[],options:[]};
  s.disruptions.items.push(d);d.options=getDisruptionDetail(s,d.id).options;
  const proposals=getPhoneProposals(s,{id:d.id,type:"disruption"});
  expect(proposals.some(p=>["postpone","cancel_tour","emergency_repair","replace_vehicle"].includes(p.id))).toBe(false);
 });
});
