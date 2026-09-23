// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createInitialState, applyCommand } from '@/lib/simulation/simulationEngine';
const fixture = vi.hoisted(() => ({ game: {} as any, setSlot: vi.fn() }));
vi.mock('@/lib/gameContext', () => ({ useGame: () => fixture.game }));
vi.mock('@/lib/headerSlot', () => ({ useHeaderSlot: () => ({ setSlot: fixture.setSlot }) }));
vi.mock('@/lib/geoData', async (importOriginal) => ({ ...await importOriginal<typeof import('@/lib/geoData')>(), loadRouteGeometries: async () => null }));
vi.mock('@/components/dispatch/DispatchMap', () => ({ default: () => null }));
vi.mock('@/components/dispatch/AutoOptimizePanel', () => ({ default: () => null }));
import Dispatch from '@/pages/Dispatch';
let root, container;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const state = createInitialState({ companyName: 'Rückladungsprüfung' }).state;
  const template = state.orders.find(o => o.status === 'offered');
  state.orders = [
    { ...template, id: 'out', customer: 'Hinladung Test', fromCity: 'Hamburg', toCity: 'Bremen', tons: 4, cargo: 'Stückgut', paymentCents: 100000, acceptDeadlineMin: 5000, deliveryDeadlineMin: 5000, isDangerousGoods: false },
    { ...template, id: 'back', customer: 'Rückladung Test', fromCity: 'Bremen', toCity: 'Hamburg', tons: 4, cargo: 'Stückgut', paymentCents: 90000, acceptDeadlineMin: 5000, deliveryDeadlineMin: 5000, isDangerousGoods: false },
  ];
  fixture.game = { state, send: vi.fn(async () => ({ tourId: 'tour-test' })), showToast: vi.fn() };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function RouteHarness() {
  const navigate = useNavigate();
  return React.createElement(React.Fragment, null,
    React.createElement('button', { onClick: () => navigate('/disposition?order=back&action=return') }, 'Andere Hinladung öffnen'),
    React.createElement(Dispatch));
}
async function render(path = '/disposition?order=out&action=return') {
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(RouteHarness))));
}
function button(text) { return Array.from(container.querySelectorAll('button')).find((b: HTMLButtonElement) => b.textContent.includes(text)) as HTMLButtonElement; }
it('öffnet die Rückladungssuche für ein Marktangebot ohne eine Annahme auszulösen', async () => {
  await render();
  expect(container.textContent).toContain('Tour planen');
  expect(container.textContent).toContain('Rückladung in Bremen');
  expect(container.textContent).toContain('Rückladung Test');
  expect(fixture.game.send).not.toHaveBeenCalled();
  expect(fixture.game.state.orders.every(o => o.status === 'offered')).toBe(true);
});
it('bestätigt Hin- und Rückladung erst nach Auswahl und zeigt die gestartete Tour', async () => {
  fixture.game.send = vi.fn(async (command, params) => applyCommand(fixture.game.state, command, params).result);
  await render();
  await act(async () => button('Rückladung Test').click());
  expect(fixture.game.send).not.toHaveBeenCalled();
  const start = button('Tour bestätigen und starten');
  expect(start.disabled).toBe(false);
  await act(async () => start.click());
  expect(fixture.game.send).toHaveBeenCalledExactlyOnceWith('confirmTour', expect.objectContaining({ orderIds: ['out', 'back'] }));
  expect(container.textContent).toContain('Hinladung Test');
  expect(container.textContent).not.toContain('Tour bestätigen und starten');
  expect(fixture.game.state.orders.map(o => o.status)).toEqual(['unterwegs', 'angenommen']);
  await act(async () => { applyCommand(fixture.game.state, 'advanceTime', { minutes: 1440 }); });
  expect(fixture.game.state.stats.totalDeliveries).toBe(2);
  expect(fixture.game.state.tours[0].status).toBe('completed');
});
it('kann die Suche ohne Annahme verlassen und eine andere Hinladung öffnen', async () => {
  await render();
  await act(async () => button('Zurück').click());
  expect(container.textContent).not.toContain('Tour planen');
  expect(fixture.game.send).not.toHaveBeenCalled();
  await act(async () => button('Andere Hinladung öffnen').click());
  expect(container.textContent).toContain('Tour planenRückladung Test');
  expect(Array.from(container.querySelectorAll('select')).slice(0, 2).map((s: HTMLSelectElement) => s.value)).toEqual(['', '']);
  expect(fixture.game.send).not.toHaveBeenCalled();
});
it('öffnet einen angenommenen Auftrag ohne Rückladungsaktion weiterhin im Einzelplaner', async () => {
  fixture.game.state.orders[0].status = 'angenommen';
  await render('/disposition?order=out');
  expect(container.textContent).toContain('Transport starten');
  expect(container.textContent).not.toContain('Tour bestätigen und starten');
});
