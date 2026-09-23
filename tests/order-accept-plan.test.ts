// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createInitialState, applyCommand } from '@/lib/simulation/simulationEngine';
const fixture = vi.hoisted(() => ({ game: {} as any, navigate: vi.fn() }));
vi.mock('@/lib/gameContext', () => ({ useGame: () => fixture.game }));
vi.mock('react-router-dom', () => ({ useNavigate: () => fixture.navigate }));
vi.mock('@/components/help/PageHint', () => ({ default: () => null }));
import Orders from '@/pages/Orders';
let root, container, offer;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  fixture.navigate.mockReset();
  const state = createInitialState({ companyName: 'Planprüfung' }).state;
  applyCommand(state, 'advanceTime', {minutes:0});
  offer = state.orders.find(o => o.status === 'offered');
  state.orders = [offer];
  fixture.game = { state, send: vi.fn(async () => ({ ok: true })), showToast: vi.fn() };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render() { await act(async () => root.render(React.createElement(Orders))); }
function button(label) { return Array.from(container.querySelectorAll('button')).find((b: HTMLButtonElement) => b.textContent.includes(label)) as HTMLButtonElement; }
it('nimmt vor dem Wechsel zur Planung genau einmal an und wartet auf die Bestätigung', async () => {
  let finish;
  fixture.game.send = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  await render();
  await act(async () => button('Annehmen & planen').click());
  expect(fixture.game.send).toHaveBeenCalledExactlyOnceWith('acceptOrder', { orderId: offer.id });
  expect(fixture.navigate).not.toHaveBeenCalled();
  expect(button('Annehmen & planen').disabled).toBe(true);
  await act(async () => button('Annehmen & planen').click());
  expect(fixture.game.send).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ok: true }));
  expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith('/disposition?order=' + encodeURIComponent(offer.id));
});
it('bleibt bei fehlgeschlagener Annahme auf dem Markt und ermöglicht einen neuen Versuch', async () => {
  fixture.game.send.mockRejectedValueOnce(Error('Annahmefrist abgelaufen'));
  await render();
  await act(async () => button('Annehmen & planen').click());
  expect(fixture.navigate).not.toHaveBeenCalled();
  expect(fixture.game.showToast).toHaveBeenCalledWith('Annahmefrist abgelaufen', 'error');
  expect(button('Annehmen & planen').disabled).toBe(false);
  await act(async () => button('Annehmen & planen').click());
  expect(fixture.navigate).toHaveBeenCalledTimes(1);
});
it('Nur annehmen bestätigt den Auftrag ohne Seitenwechsel', async () => {
  await render();
  await act(async () => button('Nur annehmen').click());
  expect(fixture.game.send).toHaveBeenCalledExactlyOnceWith('acceptOrder', { orderId: offer.id });
  expect(fixture.navigate).not.toHaveBeenCalled();
});
it('filtert nach aktueller Fristprüfung und erneuert die Treffer nach Zeitfortschritt', async () => {
  const s = fixture.game.state;
  const usable = {...offer, id:'usable', customer:'Planbare Fracht', fromCity:'Hamburg', toCity:'Bremen', tons:4, cargo:'Stückgut',
    status:'offered', isDangerousGoods:false, windowVersion:2, earliestPickupMin:s.gameTime,
    latestLoadStartMin:5000, deliveryDeadlineMin:5000, acceptDeadlineMin:s.gameTime+15, feasible:false};
  s.orders = [usable, {...usable, id:'expired-window', customer:'Verstrichenes Ladefenster', latestLoadStartMin:s.gameTime-1, feasible:true}];
  await render();
  const badges = Array.from(container.querySelectorAll('span[title]')).map((e:HTMLElement) => e.textContent);
  expect(badges).toContain('Fristgerecht planbar');
  expect(badges).toContain('Derzeit nicht planbar');
  const select = container.querySelector('option[value="on_time"]').closest('select');
  await act(async () => {select.value='on_time'; select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(container.textContent).toContain('Planbare Fracht');
  expect(container.textContent).not.toContain('Verstrichenes Ladefenster');
  fixture.game.state = {...s, gameTime:s.gameTime+15};
  await render();
  expect(container.textContent).not.toContain('Planbare Fracht');
  expect(container.textContent).toContain('0 Treffer');
});
