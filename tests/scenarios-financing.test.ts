import { it, expect } from 'vitest';
import { SCENARIOS } from '@/lib/scenarios/scenarioCatalog';
import { executeCommand } from '@/lib/simulationAdapter';
import { getAccountBalance, getBalanceSheet } from '@/lib/simulation/accountingEngine';
import { takeLoan, leaseTruck, processFinancingEvents } from '@/lib/simulation/financingEngine';
import { depositToDepot } from '@/lib/simulation/investmentEngine';
import { createInitialState, applyCommand } from '@/lib/simulation/simulationEngine';

it.each(SCENARIOS.map(s => [s.id]))('Szenario %s startet und bleibt nach einem Tag buchhalterisch konsistent', async id => {
  const r = await executeCommand(null, 'newScenarioGame', { scenarioId: id });
  expect(r.error).toBeUndefined();
  const s = r.state;
  expect(getAccountBalance(s, '1000')).toBe(s.company.accountCents);
  expect(getBalanceSheet(s).total.balanced).toBe(true);
  expect(s.accounting.assets).toHaveLength(s.vehicles.length);
  const advanced = await executeCommand(s, 'advanceTime', { minutes: 1440 });
  expect(advanced.error).toBeUndefined();
  expect(getAccountBalance(advanced.state, '1000')).toBe(advanced.state.company.accountCents);
  expect(getBalanceSheet(advanced.state).total.balanced).toBe(true);
});

it('Kredit und Leasing buchen die erste fällige Rate genau einmal', () => {
  const s = createInitialState({ companyName: 'Finanzierung' }).state;
  applyCommand(s, 'advanceTime', { minutes: 0 });
  takeLoan(s, { amountCents: 1000000, termMonths: 12 });
  leaseTruck(s, { offerId: 'standard', branchId: 'b1' });
  s.gameTime += 30 * 1440;
  processFinancingEvents(s, s.gameTime, []);
  const after = structuredClone(s.accounting);
  processFinancingEvents(s, s.gameTime, []);
  expect(s.loans[0].paidInstallments).toBe(1);
  expect(s.leasingContracts[0].paidRates).toBe(1);
  expect(s.accounting).toEqual(after);
  expect(getAccountBalance(s, '1000')).toBe(s.company.accountCents);
  expect(getBalanceSheet(s).total.balanced).toBe(true);
  s.gameTime += 30 * 1440;
  processFinancingEvents(s, s.gameTime, []);
  expect(s.leasingContracts[0].paidRates).toBe(2);
});

it.each([NaN, Infinity, -10, 0.5])('ungültige Depotüberweisung %s verändert kein Konto', amountCents => {
  const s = createInitialState({ companyName: 'Validierung' }).state;
  const before = structuredClone(s);
  expect(() => depositToDepot(s, { depotId: 'private', amountCents })).toThrow();
  expect(s).toEqual(before);
});
