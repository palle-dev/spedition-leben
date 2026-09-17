import { describe, it, expect } from 'vitest';
import { createInitialState, applyCommand } from '@/lib/simulation/simulationEngine';
import { postJournal, bookExpense, getAccountBalance, getBalanceSheet, processMonthEnd, registerAsset, calculateDepreciation, disposeAsset } from '@/lib/simulation/accountingEngine';
import { roundQty, depositToDepot, placeOrder, getDepot, processMarketTick } from '@/lib/simulation/investmentEngine';
import { cleanupHistory } from '@/lib/simulation/historyCleanup';
import { processPregnancy } from '@/lib/simulation/relationshipEngine';
import { generateBranchDecisions } from '@/lib/simulation/branchManagerEngine';
import { failOverdueOrders } from '@/lib/simulation/marketEngine';
import { generateContractOffer, acceptContract, processContractDay, getCustomerRelation } from '@/lib/simulation/customerEngine';
import { evaluateWorkshopAutomation, buildWorkshopSlot, processWorkshop, createMaintenanceOrder } from '@/lib/simulation/workshopEngine';

function base() {
  const s = createInitialState({ companyName: 'Test', playerName: 'Test', partnerName: 'Test' }).state;
  applyCommand(s, 'advanceTime', { minutes: 0 });
  return s;
}

describe('Finanz- und Lebenszyklusregeln', () => {
  it('Verkauf schreibt einen bereits gebuchten Monat nicht ein zweites Mal ab', () => {
    const s = base(); s.gameTime = 43200; calculateDepreciation(s, s.gameTime);
    const a = s.accounting.assets[0]; const before = a.accumulatedDepreciationCents;
    s.gameTime += 10 * 1440; disposeAsset(s, a.id, 2000000);
    expect(a.accumulatedDepreciationCents).toBe(before);
  });
  it('bei leerem Firmenkonto wird Aufwand vollständig als Verbindlichkeit gebucht', () => {
    const s = base(); const amount = s.company.accountCents;
    postJournal(s, { text: 'Entnahme', lines: [{ account: '2010', debit: amount }, { account: '1000', credit: amount }] });
    expect(() => bookExpense(s, { expenseAccount: '5300', amountCents: 90000, text: 'Reparatur' })).not.toThrow();
    expect(s.company.accountCents).toBe(0);
    expect(getAccountBalance(s, '2120')).toBe(-90000);
    expect(getBalanceSheet(s).total.balanced).toBe(true);
  });
  it('Monatsabschluss schließt den abgelaufenen Monat ab', () => {
    const s = base(); s.gameTime = 43200; processMonthEnd(s, 43200, []);
    expect(s.accounting.periods[0].month).toBe(1);
    expect(s.accounting.periods[0].startMin).toBe(0);
    expect(s.accounting.periods[0].endMin).toBe(43200);
  });
  it('Anschaffung im dritten Monat erhält eine positive zeitanteilige Abschreibung', () => {
    const s = base(); s.gameTime = 65 * 1440;
    const a = registerAsset(s, { account: '1210', name: 'Testanlage', acquisitionCostCents: 600000, acquiredAtMin: s.gameTime });
    s.accounting.lastDepreciationMonth = 2;
    calculateDepreciation(s, s.gameTime);
    expect(a.accumulatedDepreciationCents).toBe(333 * 25);
    const before = a.bookValueCents;
    calculateDepreciation(s, s.gameTime);
    expect(a.bookValueCents).toBe(before);
  });
  it('abgelaufener Vertragsauftrag zählt einschließlich Strafe genau einmal', () => {
    const s = base(); const r = getCustomerRelation(s, 'c01'); r.completedTransports = 5; r.trust = 80;
    const { contract } = generateContractOffer(s, 'c01'); acceptContract(s, contract.id);
    processContractDay(s, contract.startMin, []);
    const orders = s.orders.filter(o => o.contractId === contract.id);
    s.gameTime = Math.max(...orders.map(o => o.deliveryDeadlineMin)) + 241;
    const before = s.company.accountCents;
    failOverdueOrders(s, s.gameTime, []); failOverdueOrders(s, s.gameTime, []);
    expect(contract.failedCount).toBe(orders.length);
    expect(before - s.company.accountCents).toBe(orders.reduce((sum, o) => sum + Math.round(o.paymentCents * 0.1), 0));
    expect(getAccountBalance(s, '1000')).toBe(s.company.accountCents);
  });
  it('Kryptomenge bleibt an der kleinsten handelbaren Einheit stabil', () => {
    expect(roundQty(2.10875757, 'crypto')).toBe(2.10875757);
    expect(roundQty(2.10875757 - 2.10875756, 'crypto')).toBe(0.00000001);
  });
  it('Kryptoorder wird vollständig ausgeführt und gibt ihre Reserve frei', () => {
    const s = base(); depositToDepot(s, { depotId: 'private', amountCents: 10000 });
    const r = placeOrder(s, { depotId: 'private', instrumentId: 'FHBR', side: 'buy', orderType: 'market', qty: 2.10875757 });
    for (let n = 1; n <= 3; n++) processMarketTick(s, s.gameTime + n * 60, []);
    const o = getDepot(s, 'private').orders.find(o => o.id === r.order.id);
    expect(o.status).toBe('filled'); expect(o.filledQty).toBe(o.qty); expect(o.reservedCents).toBe(0);
  });
  it('Geburt bleibt bei gleichem gespeicherten Zufallszustand reproduzierbar', () => {
    const a = base(); a.private.pregnancy = { status: 'expecting', dueMin: 500 };
    const b = structuredClone(a);
    processPregnancy(a, 500, []); processPregnancy(b, 500, []);
    expect(a.private.children).toEqual(b.private.children);
    expect(a.rngSeed).toBe(b.rngSeed);
  });
  it('Mailboxbereinigung hinterlässt keine Nachrichten-IDs ohne Nachricht', () => {
    const s = base();
    s.mail.messages = Array.from({ length: 400 }, (_, i) => ({ id: 'm' + i, read: true }));
    s.mail.conversations = s.mail.messages.map(m => ({ id: 'c' + m.id, messageIds: [m.id] }));
    cleanupHistory(s, 1440);
    const ids = new Set(s.mail.messages.map(m => m.id));
    expect(s.mail.conversations.flatMap(c => c.messageIds).every(id => ids.has(id))).toBe(true);
    expect(s.mail.conversations).toHaveLength(300);
  });
  it('Wartungsfreigabe wird bei unverändertem Bedarf nicht minütlich dupliziert', () => {
    const s = base(); buildWorkshopSlot(s, { branchId: 'b1' });
    s.employees.push({ id: 'mech', name: 'Test', role: 'mechanic', employmentStatus: 'employed', locationCity: 'Hamburg', branchId: 'b1' });
    s.vehicles[0].condition = 40; s.workshop.automationProfile.enabled = true;
    s.delegation.rules.maxSpendPerActionCents = 50000;
    evaluateWorkshopAutomation(s, 480, []); s.gameTime = 481; evaluateWorkshopAutomation(s, 481, []);
    expect(s.approvals.pending.filter(a => a.actionData.vehicleId === 'v1')).toHaveLength(1);
  });
  it('Werkstattarbeit läuft am Folgetag mit Ersatzmechaniker ohne neue Teilekosten weiter', () => {
    const s = base(); s.gameTime = 900; buildWorkshopSlot(s, { branchId: 'b1' });
    s.employees.push({ id: 'mech', name: 'Test', role: 'mechanic', employmentStatus: 'employed', locationCity: 'Hamburg', branchId: 'b1' });
    const { orderId } = createMaintenanceOrder(s, { vehicleId: 'v1', branchId: 'b1' });
    processWorkshop(s, 900, []); processWorkshop(s, 960, []);
    const o = s.workshop.maintenanceOrders.find(o => o.id === orderId); o.mechanicId = null;
    const money = s.company.accountCents;
    processWorkshop(s, 1920, []); processWorkshop(s, 2340, []);
    expect(o.status).toBe('completed'); expect(s.company.accountCents).toBe(money);
  });
});
