import { describe, it, expect } from 'vitest';
import { createInitialState, applyCommand } from '@/lib/simulation/simulationEngine';
import { validateTourConfirmation } from '@/lib/simulation/tourEngine';
import { assessMarketOffers } from '@/lib/marketFeasibility';

function setup() {
  const state: any = createInitialState({ companyName: 'Marktprüfung' }).state;
  applyCommand(state, 'advanceTime', {minutes:0});
  state.vehicles = [state.vehicles[0]];
  state.drivers = [state.drivers[0]];
  state.orders = [{ ...state.orders[0], id: 'market-test', status: 'offered',
    fromCity: 'Hamburg', toCity: 'Bremen', tons: 4, cargo: 'Stückgut',
    isDangerousGoods: false, windowVersion: 2, earliestPickupMin: state.gameTime,
    latestLoadStartMin: 5000, acceptDeadlineMin: 5000, deliveryDeadlineMin: 5000,
    feasible: false }];
  return state;
}
const status = s => assessMarketOffers(s).get('market-test')?.status;
describe('Aktuelle Machbarkeit im Auftragsmarkt', () => {
  it('ersetzt die alte Generatorbewertung durch einen bestätigbaren Plan ohne den Stand zu ändern', () => {
    const s = setup(), before = JSON.stringify(s);
    expect(status(s)).toBe('on_time');
    expect(JSON.stringify(s)).toBe(before);
    expect(validateTourConfirmation(s, {vehicleId:s.vehicles[0].id, driverId:s.drivers[0].id, orderIds:['market-test']}).plan.ok).toBe(true);
  });
  it('erkennt ein verstrichenes Ladefenster trotz gespeicherter positiver Bewertung', () => {
    const s = setup(); s.orders[0].feasible = true;
    s.orders[0].latestLoadStartMin = s.gameTime - 1;
    expect(status(s)).toBe('unavailable');
  });
  it('bewertet Fristen nach Zeitfortschritt neu', () => {
    const s = setup(); s.orders[0].acceptDeadlineMin = s.gameTime + 15;
    expect(status(s)).toBe('on_time');
    s.gameTime += 15;
    expect(status(s)).toBe('unavailable');
  });
  it('kennzeichnet eine zulässige Spätlieferung nicht als fristgerecht', () => {
    const s = setup();
    const {plan} = validateTourConfirmation(s, {vehicleId:s.vehicles[0].id, driverId:s.drivers[0].id, orderIds:['market-test']});
    s.orders[0].deliveryDeadlineMin = plan.deployments[0].endMin - 10;
    expect(status(s)).toBe('late');
  });
  it('berücksichtigt Abwesenheit und findet eine andere verfügbare Person', () => {
    const s = setup();
    s.drivers.push({...s.drivers[0], id:'replacement'});
    s.absences.vacationRequests = [{personId:s.drivers[0].id, status:'approved', startMin:0, endMin:6000}];
    expect(status(s)).toBe('on_time');
    s.drivers.pop();
    expect(status(s)).toBe('unavailable');
  });
  it('verwendet reservierte Ressourcen nicht für ein zweites Versprechen', () => {
    const s = setup();
    s.tours = [{id:'reserved', status:'planned', vehicleId:s.vehicles[0].id, driverId:s.drivers[0].id,
      deployments:[{status:'planned', startMin:s.gameTime+60}]}];
    expect(status(s)).toBe('unavailable');
  });
  it('beachtet Fahrzeugkapazität und ausgeschiedene Fahrer', () => {
    const s = setup(); s.orders[0].tons = 100;
    expect(status(s)).toBe('unavailable');
    s.orders[0].tons = 4; s.drivers[0].employmentStatus = 'terminated';
    expect(status(s)).toBe('unavailable');
  });
  it('weist Gefahrgut ohne geeigneten Tank und Qualifikation zurück', () => {
    const s = setup(); Object.assign(s.orders[0], {isDangerousGoods:true, dgClass:'3', dgTransportType:'tank'});
    expect(status(s)).toBe('unavailable');
  });
  it('begrenzt auch die gesamte Marktprüfung, ohne ungeprüfte Angebote als unmöglich auszugeben', () => {
    const s = setup(), template = s.drivers[0];
    s.drivers = Array.from({length:64}, (_,i) => ({...template, id:'driver-'+i}));
    s.absences.vacationRequests = s.drivers.map(d => ({personId:d.id, status:'approved', startMin:0, endMin:6000}));
    s.orders = Array.from({length:17}, (_,i) => ({...s.orders[0], id:'offer-'+i}));
    const results = assessMarketOffers(s);
    expect(results.get('offer-15')?.status).toBe('unavailable');
    expect(results.get('offer-16')?.status).toBe('unchecked');
  });
  it('bezeichnet eine begrenzte Suche als ungeprüft, obwohl später noch ein passendes Paar existiert', () => {
    const s = setup(), template = s.drivers[0];
    s.drivers = Array.from({length:65}, (_,i) => ({...template, id:'driver-'+i}));
    s.absences.vacationRequests = s.drivers.slice(0,64).map(d => ({personId:d.id, status:'approved', startMin:0, endMin:6000}));
    expect(status(s)).toBe('unchecked');
    s.drivers = [s.drivers[64]];
    expect(status(s)).toBe('on_time');
  });
});
