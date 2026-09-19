import {describe,it,expect} from 'vitest';
import {withOrderLookup,findOrder} from '../src/lib/simulation/orderLookup';
import {dispatcherVehicleIds} from '../src/lib/simulation/dispatcherQuality';
describe('Kurzlebige Planungsindizes',()=>{
 it('verwendet nach Zustandsänderung keine veralteten Auftragsobjekte',()=>{
  const old={id:'o',status:'angenommen'},state={orders:[old]};
  expect(withOrderLookup(state,state.orders,()=>findOrder(state,'o'))).toBe(old);
  state.orders[0]={id:'o',status:'geliefert'};
  expect(findOrder(state,'o')).toBe(state.orders[0]);
  expect(JSON.stringify(state)).not.toContain('Map');
 });
 it('stellt bei verschachtelten Abfragen und Fehlern den vorherigen Kontext wieder her',()=>{
  const old={id:'o',status:'old'},fresh={id:'o',status:'fresh'},state={orders:[fresh]};
  withOrderLookup(state,[old],()=>{
   expect(()=>withOrderLookup(state,[fresh],()=>{expect(findOrder(state,'o')).toBe(fresh);throw Error('abort')})).toThrow('abort');
   expect(findOrder(state,'o')).toBe(old);
  });
  expect(findOrder(state,'o')).toBe(fresh);
 });
 it('erhält Zugriff auf historische Aufträge außerhalb der aktiven Auswahl',()=>{
  const done={id:'done',status:'geliefert'},state={orders:[done]};
  expect(withOrderLookup(state,[],()=>findOrder(state,'done'))).toBe(done);
 });
 it('zählt moderne Touren ohne Historienzugriff und alte Touren mit Zuordnungsfallback',()=>{
  const state:any={tours:[{status:'active',vehicleId:'v',dispatcherId:'e'},{status:'planned',vehicleId:'v',dispatcherId:'e'},{status:'completed',vehicleId:'old',dispatcherId:'e'}]};
  Object.defineProperty(state,'orders',{get:()=>{throw Error('History must not be read')}});
  expect([...dispatcherVehicleIds(state,'e')]).toEqual(['v']);
  expect([...dispatcherVehicleIds({orders:[{id:'o',plannedById:'e'}],tours:[{status:'planned',vehicleId:'legacy',deployments:[{orderId:'o'}]}]},'e')]).toEqual(['legacy']);
 });
});
