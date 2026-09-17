import { describe, it, expect } from 'vitest';
import { createInitialState, applyCommand } from '@/lib/simulation/simulationEngine';
import { buildPhases, buildWorkSteps, computeFinalCounters } from '@/lib/simulation/driverTimeEngine';
import { buildDeployment, confirmTour, processTours, cancelTour, _clearPlanCache } from '@/lib/simulation/tourEngine';
import { postJournal, getBalanceSheet, getPnL, getAccountBalance } from '@/lib/simulation/accountingEngine';
import { buildWorkshopSlot, createMaintenanceOrder, processWorkshop } from '@/lib/simulation/workshopEngine';
import { openBranch } from '@/lib/simulation/branchEngine';
import { processContractDay, generateContractOffer, acceptContract, getCustomerRelation } from '@/lib/simulation/customerEngine';
import { getDistance, CITIES } from '@/lib/simulation/gameRules';
import { getDistance as uiDistance } from '@/lib/gameData';
import { buildPhases as uiPhases, buildWorkSteps as uiSteps } from '@/lib/driverTimeEngine';
import { getBalanceSheet as uiBalance } from '@/lib/accountingData';
import { executeCommand } from '@/lib/simulationAdapter';

function base() {
  _clearPlanCache();
  const s = createInitialState({ companyName: 'Regression', playerName: 'Test', partnerName: 'Test' }).state;
  applyCommand(s, 'advanceTime', { minutes: 0 });
  return s;
}
function order(s, extra = {}) {
  const o = { ...s.orders[0], id: 'audit-order', customerId: 'c01', status: 'angenommen',
    fromCity: 'Hamburg', toCity: 'Kiel', tons: 1, paymentCents: 50000,
    earliestPickupMin: s.gameTime, latestLoadStartMin: s.gameTime + 1440,
    deliveryDeadlineMin: s.gameTime + 2400, acceptedAtMin: s.gameTime,
    history: [], ...extra };
  s.orders = [o];
  return o;
}
function sick(s, id, start = s.gameTime) {
  s.absences.sicknesses.push({ id: 'audit-sick', personId: id, startMin: start,
    expectedEndMin: start + 2880, status: 'active' });
}
function schedule(s, extra = {}) {
  const o = order(s);
  return confirmTour(s, { vehicleId: s.vehicles[0].id, driverId: s.drivers[0].id,
    orderIds: [o.id], minStartTime: s.gameTime + 60, ...extra });
}

describe('Nachgewiesene Simulationseigenschaften', () => {
  it('Freigabe-Stopp meldet den tatsächlichen Grund und keinen abgeschlossenen Tag', () => {
    const s = base(); s.delegation.rules.approvalMode = 'stop';
    s.approvals.pending.push({ id: 'pending', status: 'pending' });
    const before = s.gameTime;
    const r = applyCommand(s, 'advanceTime', { minutes: 1440 });
    expect(r.result.stopped).toBe(true); expect(r.result.stopReason).toBe('pending_approval');
    expect(s.gameTime).toBe(before);
  });
  it('ein Auftrag wird auch bei zwei importierten Fahrten nur einmal vergütet', () => {
    const s = base(); const o = order(s, { status: 'unterwegs' });
    for (let i = 0; i < 2; i++) {
      const v = s.vehicles[i], d = s.drivers[i];
      const id = 'duplicate-' + i;
      s.trips.push({ id, orderId: o.id, vehicleId: v.id, driverId: d.id, type: 'loaded',
        status: 'in_progress', startMin: 480, endMin: 490, currentPhase: 0,
        paymentCents: 50000, fuelCents: 0, tollCents: 0,
        phases: [{ type: 'unloading', startMin: 480, endMin: 490, durationMin: 10 }] });
      v.status = d.status = 'on_trip'; v.tripId = id;
    }
    const money = s.company.accountCents;
    applyCommand(s, 'advanceTime', { minutes: 10 });
    expect(s.company.accountCents - money).toBe(50000);
    expect(s.stats.totalDeliveries).toBe(1);
    expect(o.history.filter(h => h.type === 'delivered')).toHaveLength(1);
  });

  it('eine geplante Tour startet einen inzwischen stornierten Auftrag nicht', () => {
    const s = base(); schedule(s); s.orders[0].status = 'storniert';
    s.gameTime += 60; processTours(s, s.gameTime, []);
    expect(s.trips).toHaveLength(0);
  });
  it('derselbe Auftrag kann nicht zweimal in einer Tour stehen', () => {
    const s = base(); const o = order(s);
    expect(() => schedule(s, { orderIds: [o.id, o.id] })).toThrow();
  });
  it('Tourauflösung gibt auch bei laufender erster Fahrt alle zukünftigen Aufträge frei', () => {
    const s = base(); const first = order(s);
    s.orders.push({ ...first, id: 'second', fromCity: 'Kiel', toCity: 'Hamburg', history: [] });
    const r = confirmTour(s, { vehicleId: 'v1', driverId: 'd1', orderIds: [first.id, 'second'] });
    cancelTour(s, r.tourId);
    expect(s.orders[1].reservedByTourId).toBeFalsy();
  });
  it('Krankheit verhindert den manuellen Start', () => {
    const s = base(); const o = order(s); sick(s, 'd1');
    expect(() => applyCommand(s, 'startTransport', { orderId: o.id, vehicleId: 'v1', driverId: 'd1' })).toThrow();
    expect(s.trips).toHaveLength(0);
  });
  it('eine nach Planung eingetretene Krankheit verhindert den automatischen Start', () => {
    const s = base(); schedule(s); sick(s, 'd1');
    s.gameTime += 60; processTours(s, s.gameTime, []);
    expect(s.trips).toHaveLength(0);
  });
  it('veraltete Planung versetzt keinen Fahrer an einen anderen Ort', () => {
    const s = base(); schedule(s); s.drivers[0].locationCity = 'Dresden';
    s.gameTime += 60; processTours(s, s.gameTime, []);
    expect(s.trips).toHaveLength(0);
  });
  it('Fahrerzeit enthält vorherige Arbeit und setzt Lenkzeit an Pausen zurück', () => {
    const steps = [{ type: 'loaded_drive', fromCity: 'Hamburg', toCity: 'Berlin', durationMin: 40, distanceKm: 40 }];
    const initial = { workMin: 300, driveMin: 260 };
    const p = buildPhases(steps, initial, 480);
    expect(computeFinalCounters(p.phases, initial)).toEqual({ workMin: 340, driveMin: 30 });
  });
  it('ein zweiter Trip vergisst das vorherige Arbeitsbudget nicht', () => {
    const s = base(); const o = order(s);
    s.drivers[0].workMinutesSinceRest = 120;
    const r = applyCommand(s, 'startTransport', { orderId: o.id, vehicleId: 'v1', driverId: 'd1' });
    const trip = s.trips.find(t => t.id === r.result.tripId);
    const expected = buildPhases(buildWorkSteps('Hamburg', o), { workMin: 120, driveMin: 0 }, 480);
    applyCommand(s, 'advanceTime', { minutes: trip.endMin - s.gameTime });
    expect(s.drivers[0].workMinutesSinceRest).toBe(expected.finalWorkMin);
  });
  it('Vorschau und Engine verwenden für jedes Städtepaar dieselbe Entfernung', () => {
    const mismatches = CITIES.flatMap(a => CITIES.filter(b => uiDistance(a, b) !== getDistance(a, b)).map(b => [a, b]));
    expect(mismatches).toEqual([]);
  });
  it('Vorschau und Engine berücksichtigen dasselbe Ladefenster', () => {
    const s = base(), o = order(s, { earliestPickupMin: 1000 });
    expect(uiPhases(uiSteps('Hamburg', o), {}, 480)).toEqual(buildPhases(buildWorkSteps('Hamburg', o), {}, 480));
  });
  it('neue Marktangebote haben geordnete Abhol- und Lieferfenster', () => {
    const s = base(); applyCommand(s, 'advanceTime', { minutes: 1440 });
    expect(s.orders.filter(o => o.status === 'offered' &&
      (o.earliestPickupMin > o.latestLoadStartMin || o.latestLoadStartMin > o.deliveryDeadlineMin))).toEqual([]);
  });
  it('Vertragsfristen lassen eine Lieferung nach Beginn des Ladefensters zu', () => {
    const s = base(); const relation = getCustomerRelation(s, 'c01');
    relation.completedTransports = 5; relation.trust = 80;
    const { contract } = generateContractOffer(s, 'c01'); acceptContract(s, contract.id);
    processContractDay(s, contract.startMin, []);
    const o = s.orders.find(o => o.contractId === contract.id);
    expect(o.latestLoadStartMin + contract.opMin).toBeLessThanOrEqual(o.deliveryDeadlineMin);
  });
});

describe('Buchhaltung', () => {
  it('Werkstattkauf stimmt zwischen Firmenkonto, Journal und Anlagen überein', () => {
    const s = base(); buildWorkshopSlot(s, { branchId: 'b1' });
    expect(getAccountBalance(s, '1000')).toBe(s.company.accountCents);
    expect(getAccountBalance(s, '1210')).toBe(500000);
  });
  it('Filialpaket bucht enthaltenen Lkw und übrige Eröffnungskosten', () => {
    const s = base(); s.gameTime = 30 * 1440;
    postJournal(s, { text: 'Einlage', lines: [{ account: '1000', debit: 10000000 }, { account: '2020', credit: 10000000 }] });
    const r = openBranch(s, { city: 'Kiel' });
    expect(getAccountBalance(s, '1000')).toBe(s.company.accountCents);
    expect(s.accounting.assets.some(a => a.vehicleId === r.vehicleId)).toBe(true);
    expect(getBalanceSheet(s).total.balanced).toBe(true);
  });
  it('Private Entnahme senkt das Eigenkapital und die Bilanz bleibt ausgeglichen', () => {
    const s = base();
    postJournal(s, { text: 'Entnahme', lines: [{ account: '2010', debit: 10000 }, { account: '1000', credit: 10000 }] });
    expect(getBalanceSheet(s).total.balanced).toBe(true);
    expect(uiBalance(s)).toEqual(getBalanceSheet(s));
  });
  it('Erlösschmälerungen vermindern den Umsatz', () => {
    const s = base();
    postJournal(s, { text: 'Erlös', lines: [{ account: '1000', debit: 10000 }, { account: '4000', credit: 10000 }] });
    postJournal(s, { text: 'Rabatt', lines: [{ account: '4090', debit: 1000 }, { account: '1000', credit: 1000 }] });
    expect(getPnL(s, 0, Infinity).revenue).toBe(9000);
  });
  it('Periodenberichte bleiben nach Ablauf der Journal-Aufbewahrungsfrist korrekt', () => {
    const s = base();
    postJournal(s, { text: 'Früher Erlös', gameTime: 500, lines: [{ account: '1000', debit: 12345 }, { account: '4000', credit: 12345 }] });
    const then = getBalanceSheet(s, 600);
    s.gameTime = 40 * 1440;
    postJournal(s, { text: 'Später Erlös', lines: [{ account: '1000', debit: 111 }, { account: '4000', credit: 111 }] });
    expect(getPnL(s, 0, 1440).revenue).toBe(12345);
    expect(getBalanceSheet(s, 600)).toEqual(then);
    expect(uiBalance(s)).toEqual(getBalanceSheet(s));
  });
  it('ungültige Centbeträge werden vor jeder Zustandsänderung abgewiesen', () => {
    const s = base(); const before = structuredClone(s.accounting);
    expect(() => postJournal(s, { text: 'Ungültig', lines: [{ account: '1000', debit: 0.5 }, { account: '4000', credit: 0.5 }] })).toThrow();
    expect(s.accounting).toEqual(before);
  });
});

describe('Werkstatt und tatsächlicher Adapter-Pfad', () => {
  it('Werkstatt zeigt das Ende der laufenden Schicht korrekt an', () => {
    const s = base(); buildWorkshopSlot(s, { branchId: 'b1' });
    s.employees.push({ id: 'mechanic-test', role: 'mechanic', name: 'Test', locationCity: 'Hamburg',
      branchId: 'b1', employmentStatus: 'employed', attendance: 'present' });
    const { orderId } = createMaintenanceOrder(s, { vehicleId: 'v1', branchId: 'b1' });
    processWorkshop(s, 480, []);
    expect(s.vehicles[0].maintenanceUntil).toBe(960);
    const o = s.workshop.maintenanceOrders.find(o => o.id === orderId);
    expect(o.mechanicId).toBe('mechanic-test');
  });
  it('Tages- und Stunden-Vorlauf bereinigen auch im Adapter dieselben Daten', async () => {
    const initial = base();
    const a = await executeCommand(structuredClone(initial), 'advanceTime', { minutes: 1440 });
    let b = structuredClone(initial);
    for (let i = 0; i < 24; i++) {
      const r = await executeCommand(b, 'advanceTime', { minutes: 60 });
      expect(r.error).toBeUndefined(); b = r.state;
    }
    expect(a.error).toBeUndefined();
    for (const key of ['gameTime', 'company', 'private', 'rngSeed', 'orders', 'trips', 'tours', 'bookings'])
      expect(b[key], key).toEqual(a.state[key]);
  });
});
