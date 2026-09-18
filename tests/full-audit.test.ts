import { autoApproveVacationRequests } from '@/lib/simulation/absenceEngine';
import { computeLiquidityForecast } from '@/lib/simulation/liquidityForecastEngine';
import { initInvestment, processMarketTick } from '@/lib/simulation/investmentEngine';
import { computeCompanyValue as uiCompanyValue, getStatValue as uiStat } from '@/lib/progressEngine';
import { computeCompanyValue as engineCompanyValue, getStatValue as engineStat } from '@/lib/simulation/progressEngine';
import { describe, it, expect } from 'vitest';
import { createInitialState, applyCommand } from '@/lib/simulation/simulationEngine';
import { processServiceContracts } from '@/lib/simulation/serviceEngine';
import { getAccountBalance } from '@/lib/simulation/accountingEngine';
import { requestVacation, approveVacation, getVacationAvailable, returnEarlyFromVacation, isPersonAvailable } from '@/lib/simulation/absenceEngine';
import { ALL_INSTRUMENT_DEFS, getFreeSettlement, placeOrder } from '@/lib/simulation/investmentEngine';
import { createSavingsPlan, cancelSavingsPlan, resumeSavingsPlan, processSavingsPlans } from '@/lib/simulation/investmentSavings';
import { placeAdvancedOrder } from '@/lib/simulation/investmentAdvancedOrders';

function base() {
  const s = createInitialState({ companyName: 'Vollprüfung', playerName: 'Test', partnerName: 'Test' }).state;
  applyCommand(s, 'advanceTime', { minutes: 0 }); return s;
}
function book(s, command, params) {
  const r = applyCommand(s, command, params).result;
  return s.serviceContracts.find(c => c.id === r.contractId);
}
describe('Dienstleistungen: bezahlte Leistung und Lebenszyklus', () => {
  it('erstattet die Vorauszahlung einmalig mit unverändertem Umsatz und ausgeglichenem Journal', () => {
    const s = base(), cash = s.company.accountCents, revenue = getAccountBalance(s, '4000');
    const c = book(s, 'bookCleaning', { branchId: 'b1', units: 2 });
    expect(s.company.accountCents).toBe(cash - 5000);
    applyCommand(s, 'cancelService', { contractId: c.id });
    expect(s.company.accountCents).toBe(cash);
    expect(getAccountBalance(s, '4000')).toBe(revenue);
    expect(getAccountBalance(s, '1000')).toBe(cash);
    expect(() => applyCommand(s, 'cancelService', { contractId: c.id })).toThrow();
    expect(s.company.accountCents).toBe(cash);
  });
  it('erneuert Reinigung wöchentlich und berechnet jeden Termin genau einmal', () => {
    const s = base(), cash = s.company.accountCents;
    const c = book(s, 'bookCleaning', { branchId: 'b1', units: 1, recurring: true, recurringIntervalDays: 7 });
    s.gameTime = c.endMin; processServiceContracts(s, s.gameTime, []);
    const next = s.serviceContracts.find(n => n.parentContractId === c.id);
    expect(next).toBeDefined(); expect(next.startMin).toBe(c.startMin + 7 * 1440);
    expect(s.company.accountCents).toBe(cash - 2500);
    s.gameTime = next.startMin; processServiceContracts(s, s.gameTime, []);
    processServiceContracts(s, s.gameTime, []);
    expect(s.company.accountCents).toBe(cash - 5000);
    expect(getAccountBalance(s, '1000')).toBe(s.company.accountCents);
  });
  it('beendet bei Kündigung die bezahlte laufende Reinigung ohne Folgetermin', () => {
    const s = base(); s.branches[0].cleanliness = 30;
    const c = book(s, 'bookCleaning', { branchId: 'b1', units: 1, recurring: true });
    s.gameTime = c.startMin; processServiceContracts(s, s.gameTime, []);
    applyCommand(s, 'cancelService', { contractId: c.id });
    s.gameTime = c.endMin; processServiceContracts(s, s.gameTime, []);
    expect(c.status).toBe('completed'); expect(s.branches[0].cleanliness).toBeGreaterThan(30);
    expect(s.serviceContracts).toHaveLength(1);
  });
  it('reserviert ein abgeschlepptes Fahrzeug und gibt es am Ziel wieder frei', () => {
    const s = base(), v = s.vehicles[0];
    const c = book(s, 'bookTowing', { vehicleId: v.id, targetCity: 'Kiel' });
    expect(v.status).not.toBe('free');
    expect(() => book(s, 'bookTowing', { vehicleId: v.id, targetCity: 'Bremen' })).toThrow();
    s.gameTime = c.handoverMin; processServiceContracts(s, s.gameTime, []);
    expect(c.status).toBe('completed'); expect(v.locationCity).toBe('Kiel'); expect(v.status).toBe('free');
  });
  it('stellt Miet-Lkw und Fremdpersonal bereit und beendet ihre Verfügbarkeit', () => {
    const s = base();
    const rental = book(s, 'bookRentalTruck', { provisionCity: 'Hamburg', blocks: 2 });
    const staff = book(s, 'bookTempStaff', { type: 'temp_driver', blocks: 2 });
    const dispo = book(s, 'bookTempStaff', { type: 'temp_dispatcher', blocks: 2 });
    const v = s.vehicles.find(v => v.serviceContractId === rental.id);
    const d = s.drivers.find(d => d.serviceContractId === staff.id);
    const e = s.employees.find(e => e.serviceContractId === dispo.id);
    expect(v?.status).toBe('free'); expect(d?.employmentStatus).toBe('employed'); expect(e?.role).toBe('dispatcher');
    expect(e.costPerDayCents).toBe(0); expect(d.costPerDayCents).toBe(0);
    expect(isPersonAvailable(s, d.id, staff.endMin)).toBe(false);
    s.gameTime = rental.endMin; processServiceContracts(s, s.gameTime, []);
    expect(v.status).toBe('archived'); expect(d.employmentStatus).toBe('left'); expect(e.employmentStatus).toBe('left');
  });
  it('wartet bei verspäteter Rückgabe bis zum Fahrtende, ohne neue Einsätze zu erlauben', () => {
    const s = base(), c = book(s, 'bookRentalTruck', { blocks: 2 });
    const v = s.vehicles.find(v => v.serviceContractId === c.id);
    expect(v).toBeDefined(); v.status = 'on_trip';
    s.gameTime = c.endMin; processServiceContracts(s, s.gameTime, []); expect(v.status).toBe('on_trip');
    v.status = 'free'; processServiceContracts(s, s.gameTime + 10, []); expect(v.status).toBe('archived');
  });
  it.each([NaN, Infinity, -1, 1.5, '2'])('verwirft ungültige Reinigungseinheiten %s', units => {
    const s = base(), cash = s.company.accountCents;
    expect(() => book(s, 'bookCleaning', { branchId: 'b1', units })).toThrow();
    expect(s.company.accountCents).toBe(cash); expect(s.serviceContracts).toHaveLength(0);
  });
});
describe('Urlaub: Genehmigung prüft den aktuellen Stand', () => {
  it('verhindert Überbuchung durch zwei vorher gestellte Anträge', () => {
    const s = base(), personId = s.drivers[0].id;
    const a = requestVacation(s, { personId, startMin: 1440, endMin: 2880 });
    const b = requestVacation(s, { personId, startMin: 4320, endMin: 5760 });
    approveVacation(s, { requestId: a.requestId });
    expect(() => approveVacation(s, { requestId: b.requestId })).toThrow();
    expect(s.absences.vacationRequests.find(r => r.id === b.requestId).status).toBe('pending');
  });
  it('verhindert überlappende Genehmigungen auch bei genügend Guthaben', () => {
    const s = base(), personId = s.drivers[0].id;
    s.drivers[0].vacationAccount.totalEarned = 20;
    const p = { personId, startMin: 1440, endMin: 2880 };
    const a = requestVacation(s, p), b = requestVacation(s, p);
    approveVacation(s, { requestId: a.requestId });
    expect(() => approveVacation(s, { requestId: b.requestId })).toThrow();
  });
  it('reserviert bereits verbrauchte Urlaubstage nicht ein zweites Mal', () => {
    const s = base(), d = s.drivers[0];
    d.vacationAccount.totalEarned = 5; d.vacationAccount.daysUsed = 1;
    s.gameTime = 3000;
    s.absences.vacationRequests.push({ id: 'r', personId: d.id, status: 'approved', startMin: 1440, endMin: 5760, days: 3, consumedDays: 1 });
    expect(getVacationAvailable(s, d.id)).toBe(2);
    expect(() => returnEarlyFromVacation(s, { requestId: 'r', returnMin: 0 })).toThrow();
  });
});
function investment() {
  const def = ALL_INSTRUMENT_DEFS.find(d => d.type === 'stock');
  const depot = { settlementCents: 10000, positions: {}, orders: [], fills: [], savingsPlans: [] };
  const s = { gameTime: 600, idCounter: 100, investment: { market: { instruments: {
    [def.id]: { tradeable: true, currentQuote: { ask: 1000, bid: 999 } }
  } }, depots: { private: depot } } };
  return { s, depot, instrumentId: def.id, params: { depotId: 'private', instrumentId: def.id } };
}
describe('Investment: Budget, Reservierungen und Endzustände', () => {
  it('hält Sparplanbudget einschließlich Mindestgebühr ein und schützt Orderreserven', () => {
    const { s, depot, params } = investment();
    depot.orders.push({ id: 'reserve', side: 'buy', status: 'open', reservedCents: 9000 });
    const { plan } = createSavingsPlan(s, { ...params, amountCents: 1000, rhythm: 'daily', nextExecuteMin: 600 });
    processSavingsPlans(s, 600, []);
    expect(plan.lastResult.ok).toBe(true);
    expect(plan.lastResult.totalCost).toBeLessThanOrEqual(1000);
    expect(depot.settlementCents).toBeGreaterThanOrEqual(9000); expect(getFreeSettlement(s, 'private')).toBeGreaterThanOrEqual(0);
  });
  it('reaktiviert keine gekündigten Sparpläne', () => {
    const { s, params } = investment();
    const { plan } = createSavingsPlan(s, { ...params, amountCents: 1000, rhythm: 'daily' });
    cancelSavingsPlan(s, { ...params, planId: plan.id });
    expect(() => resumeSavingsPlan(s, { ...params, planId: plan.id })).toThrow();
  });
  it.each([{ amountCents: NaN, rhythm: 'daily' }, { amountCents: 1000, rhythm: 'hourly' }, { amountCents: 0, rhythm: 'daily' }])('verwirft ungültige Sparpläne %j', p => {
    const { s, params } = investment(); expect(() => createSavingsPlan(s, { ...params, ...p })).toThrow();
  });
  it.each([placeOrder, placeAdvancedOrder])('verändert Verkaufsbestände bei ungültigem OCO-Partner nicht', place => {
    const { s, depot, params, instrumentId } = investment();
    depot.positions[instrumentId] = { qty: 10, availableQty: 10 };
    expect(() => place(s, { ...params, side: 'sell', qty: 1, orderType: place === placeOrder ? 'limit' : 'stop', limitCents: 1100, stopCents: 900, ocoWith: 'missing' })).toThrow();
    expect(depot.positions[instrumentId].availableQty).toBe(10);
  });
  it('verwirft keine offenen Orders, wenn das Archivlimit erreicht ist', () => {
    const { s, depot, params } = investment(); depot.settlementCents = 100000000;
    for (let i = 0; i < 200; i++) depot.orders.push({ id: 'open-' + i, side: 'buy', status: 'open', reservedCents: 100 });
    expect(() => placeOrder(s, { ...params, side: 'buy', orderType: 'limit', limitCents: 1, qty: 1 })).toThrow();
    expect(depot.orders.map(o => o.id)).toContain('open-0'); expect(depot.orders).toHaveLength(200);
  });
});

describe('Zusammenspiel, Altverträge und Geldgrenzen', () => {
  it('berechnet einen ungedeckten Reinigungstermin nicht und führt ihn nicht kostenlos aus', () => {
    const s = base(), c = book(s, 'bookCleaning', { branchId: 'b1', units: 1, recurring: true });
    s.gameTime = c.endMin; processServiceContracts(s, s.gameTime, []);
    const next = s.serviceContracts.find(n => n.parentContractId === c.id);
    s.company.accountCents = 0; const cleanliness = s.branches[0].cleanliness;
    s.gameTime = next.endMin; processServiceContracts(s, s.gameTime, []);
    expect(next.status).toBe('cancelled'); expect(s.company.accountCents).toBe(0);
    expect(s.branches[0].cleanliness).toBe(cleanliness);
  });
  it('gibt nach Abschlepp-Storno Fahrzeug und Vorauszahlung frei', () => {
    const s = base(), cash = s.company.accountCents, v = s.vehicles[0];
    const c = book(s, 'bookTowing', { vehicleId: v.id, targetCity: 'Kiel' });
    applyCommand(s, 'cancelService', { contractId: c.id });
    expect(v.status).toBe('free'); expect(v.locationCity).toBe('Hamburg'); expect(s.company.accountCents).toBe(cash);
  });
  it('beendet auch ältere Notfallmieten ohne Dienstleistungsvertrag', () => {
    const s = base(), v = s.vehicles[0]; v.ownership_type = 'rental'; v.rentalReturnMin = s.gameTime + 15;
    const r = applyCommand(s, 'advanceTime', { minutes: 60 });
    expect(r.result.stopped).toBe(false); expect(v.status).toBe('archived');
  });
  it('lehnt Leerfahrten über das Mietende vor der Abbuchung ab', () => {
    const s = base(), v = s.vehicles[0], cash = s.company.accountCents;
    v.rentalReturnMin = s.gameTime + 1;
    expect(() => applyCommand(s, 'startEmptyTrip', { vehicleId: v.id, driverId: s.drivers[0].id, fromCity: 'Hamburg', toCity: 'Kiel' })).toThrow(/Miete/);
    expect(s.company.accountCents).toBe(cash); expect(v.status).toBe('free');
  });
  it('hält Service-Ergebnisse bei großen und kleinen Zeitschritten gleich', () => {
    const s = base();
    book(s, 'bookCleaning', { branchId: 'b1', units: 1, recurring: true, recurringIntervalDays: 1 });
    book(s, 'bookRentalTruck', { blocks: 2 });
    book(s, 'bookTempStaff', { type: 'temp_driver', blocks: 2 });
    book(s, 'bookTowing', { vehicleId: s.vehicles[0].id, targetCity: 'Kiel' });
    const a = structuredClone(s), b = structuredClone(s);
    for (let day = 0; day < 3; day++) applyCommand(a, 'advanceTime', { minutes: 1440 });
    for (let i = 0; i < 72; i++) applyCommand(b, 'advanceTime', { minutes: 60 });
    expect(a.gameTime).toBe(b.gameTime); expect(a.serviceContracts).toEqual(b.serviceContracts);
    expect(a.company.accountCents).toBe(b.company.accountCents); expect(a.vehicles).toEqual(b.vehicles);
    expect(getAccountBalance(a, '1000')).toBe(a.company.accountCents);
  });
  it('beachtet das Urlaubsguthaben auch bei automatischer Genehmigung', () => {
    const s = base(), personId = s.drivers[0].id;
    const a = requestVacation(s, { personId, startMin: 1440, endMin: 2880 });
    const b = requestVacation(s, { personId, startMin: 4320, endMin: 5760 });
    s.employees.push({ id: 'assistant-test', name: 'Assistenz', role: 'assistant', employmentStatus: 'employed', attendance: 'present' });
    autoApproveVacationRequests(s, s.gameTime);
    expect(s.absences.vacationRequests.find(r => r.id === a.requestId).status).toBe('approved');
    expect(s.absences.vacationRequests.find(r => r.id === b.requestId).status).toBe('pending');
  });
  it('berechnet für vorausbezahlte Fremdfahrer keine zusätzlichen Löhne in der Vorschau', () => {
    const s = base(); s.drivers = []; s.employees = [];
    book(s, 'bookTempStaff', { type: 'temp_driver', blocks: 2 });
    const forecast = computeLiquidityForecast(s, { horizonDays: 2 });
    expect(forecast.allPositions.filter(p => p.sourceType === 'dailyPersonnel')).toHaveLength(0);
  });
  it('begrenzt beim vollständigen Restverkauf die Gebühr auf den Erlös', () => {
    const { s, depot, params, instrumentId } = investment();
    depot.realizedPnlCents = 0;
    s.investment.market.instruments[instrumentId].brokerLiquidityShares = 10000;
    depot.positions[instrumentId] = { qty: 0.01, availableQty: 0.01, totalCostCents: 10, realizedPnlCents: 0,
      lots: [{ qty: 0.01, totalCostCents: 10 }], totalFeesCents: 0 };
    const cash = depot.settlementCents;
    placeOrder(s, { ...params, side: 'sell', orderType: 'market', qty: 0.01, closePosition: true });
    expect(depot.settlementCents).toBe(cash);
    expect(depot.orders[0].feeCents).toBe(10); expect(depot.positions[instrumentId].qty).toBe(0);
  });
  it('überzieht bei einem Kurssprung weder Verrechnungskonto noch fremde Reservierungen', () => {
    const s = base(); initInvestment(s); s.gameTime = 600;
    const def = ALL_INSTRUMENT_DEFS.find(d => d.type === 'stock'), inst = s.investment.market.instruments[def.id];
    const depot = s.investment.depots.private; depot.settlementCents = 2000;
    Object.assign(inst.currentQuote, { ask: 1000, bid: 999, mid: 1000 }); inst.brokerLiquidityShares = 0;
    placeOrder(s, { depotId: 'private', instrumentId: def.id, side: 'buy', orderType: 'market', qty: 1 });
    inst.currentQuote.mid = 100000;
    processMarketTick(s, 660, []);
    expect(depot.settlementCents).toBe(2000); expect(getFreeSettlement(s, 'private')).toBeGreaterThanOrEqual(0);
    expect(depot.orders[0].status).toBe('cancelled');
  });
  it('zeigt Unternehmenswert und Fahrzeugziele wie die Simulation an', () => {
    const s = base();
    s.vehicles[1].ownership_type = 'leased'; s.vehicles[2].status = 'archived';
    s.loans = [{ status: 'active', remainingPrincipalCents: 100000, accruedInterestCents: 100 }];
    expect(uiCompanyValue(s)).toBe(engineCompanyValue(s));
    expect(uiStat(s, 'vehicleCount')).toBe(engineStat(s, 'vehicleCount'));
  });
});
