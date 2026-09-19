import {createInitialState, applyCommand} from '../../src/lib/simulation/simulationEngine.ts';

// Kontrollierter Lasttest, kein produktiver Spielstand. Fahrzeuge/Fahrer und
// Marktangebote werden direkt vervielfacht; Einsätze starten über confirmTour.
export function makeLargeFleet(count = 100, historicalMessages = 0) {
  const state: any = createInitialState({companyName:'Testspedition',playerName:'Tester',partnerName:'Mara'}).state;
  applyCommand(state, 'advanceTime', {minutes:0});
  state.company.accountCents = 1000000000;
  const vehicle = state.vehicles[0], driver = state.drivers[0], order = state.orders[0];
  state.vehicles = Array.from({length:count}, (_,i) => ({...structuredClone(vehicle), id:'fleet_v'+i}));
  state.drivers = Array.from({length:count}, (_,i) => ({...structuredClone(driver), id:'fleet_d'+i, name:'Fahrer '+i}));
  state.orders = Array.from({length:count*5}, (_,i) => ({...structuredClone(order), id:'fleet_o'+i,
    fromCity:i<count?'Hamburg':i%2?'Bremen':'Hamburg', toCity:i<count?'Bremen':i%2?'Hamburg':'Bremen',
    acceptDeadlineMin:3000, latestLoadStartMin:3000, deliveryDeadlineMin:3500+(i%13)*15,
    earliestPickupMin:480+(i%7)*5, status:'offered'}));
  state.delegation.rules.maxSpendPerActionCents = 100000000;
  state.delegation.rules.dailyBudgetCents = 100000000;
  const applicant = state.availableApplicants.find(a => a.role === 'dispatcher');
  applyCommand(state, 'hireEmployee', {applicantId:applicant.id});
  state.employees[0].workMode = 'autonomous';
  state.employees = Array.from({length:Math.ceil(count/10)}, (_,i) => ({...structuredClone(state.employees[0]),
    id:'fleet_emp'+i, assignedBranchId:'b1', suggestions:[]}));
  for (let i=0;i<count;i++) applyCommand(state,'confirmTour',{
    vehicleId:state.vehicles[i].id,driverId:state.drivers[i].id,orderIds:[state.orders[i].id]});
  if (state.vehicles.filter(v => v.status === 'on_trip').length !== count) throw new Error('Lasttest-Flotte nicht vollständig im Einsatz');
  for (let i=0;i<historicalMessages;i++) state.mail.messages.push({
    id:'history_'+i,fromId:'system',toId:'player',subject:'Betriebsbericht',body:'Historische Betriebsnachricht',
    read:true,gameTime:0,category:'operations',linkedRefs:[],dedupKey:'history_'+i,
  });
  return state;
}
