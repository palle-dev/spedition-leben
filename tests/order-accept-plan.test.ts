// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createInitialState } from '@/lib/simulation/simulationEngine';
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
