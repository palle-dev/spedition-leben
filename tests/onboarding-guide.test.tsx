// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ONBOARDING_STEPS, detectOnboardingStep } from '@/lib/developmentEngine';
import { ONBOARDING_STEPS as engineSteps, detectOnboardingStep as engineStep } from '@/lib/simulation/developmentEngine';
const fixture = vi.hoisted(() => ({ game: {} as any, navigate: vi.fn() }));
vi.mock('@/lib/gameContext', () => ({ useGame: () => fixture.game }));
vi.mock('react-router-dom', () => ({ useNavigate: () => fixture.navigate }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children, initial, animate, exit, transition, ...props }) => <div {...props}>{children}</div> } }));
import Guide from '@/components/OnboardingGuide';
let container, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  fixture.navigate.mockReset();
  fixture.game = { state: { gameTime: 480, onboarding: { active: true, paused: false }, orders: [] },
    send: vi.fn(async () => ({ ok: true })), showToast: vi.fn() };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render() { await act(async () => root.render(<Guide />)); }
function button(text) {
  const found = Array.from(container.querySelectorAll('button')).find((b: HTMLButtonElement) => b.textContent.includes(text));
  expect(found, text).toBeTruthy(); return found as HTMLButtonElement;
}
it('führt zustandsbasiert durch fünf erreichbare Schritte, auch bei abweichender Aktionsreihenfolge', () => {
  const stages = [
    [{}, 'choose_order'],
    [{ orders: [{ status: 'angenommen' }] }, 'assign_vehicle'],
    [{ trips: [{ status: 'in_progress' }] }, 'await_delivery'],
    [{ stats: { totalDeliveries: 1 }, trips: [{ status: 'in_progress' }] }, 'review_delivery'],
    [{ stats: { totalDeliveries: 1 }, onboarding: { reviewedDelivery: true } }, 'next_decision'],
  ];
  expect(ONBOARDING_STEPS).toEqual(engineSteps);
  expect(ONBOARDING_STEPS.map(s => s.id)).toEqual(stages.map(([, id]) => id));
  for (const [state, id] of stages) {
    expect(detectOnboardingStep(state)).toBe(id);
    expect(engineStep(state)).toBe(id);
  }
});
it('pausiert bei fehlenden Angeboten, ohne einen Fortschritt vorzutäuschen', async () => {
  await render();
  expect(container.textContent).toContain('Schritt 1 / 5');
  expect(container.textContent).toContain('Keine offenen Angebote');
  expect(container.textContent).not.toContain('Überspringen');
  await act(async () => button('Begleitung pausieren').click());
  expect(fixture.game.send).toHaveBeenCalledExactlyOnceWith('pauseOnboarding', {});
  expect(fixture.navigate).not.toHaveBeenCalled();
});
it('bietet nach der ersten ausgewerteten Lieferung einen ausdrücklichen Abschluss', async () => {
  fixture.game.state.stats = { totalDeliveries: 1 };
  fixture.game.state.onboarding.reviewedDelivery = true;
  await render();
  expect(container.textContent).toContain('Schritt 5 / 5');
  await act(async () => button('Begleitung abschließen').click());
  expect(fixture.game.send).toHaveBeenCalledExactlyOnceWith('dismissOnboarding', {});
});
it('meldet einen Fehler beim Bestätigen der Auswertung und bleibt im bisherigen Schritt', async () => {
  fixture.game.state.stats = { totalDeliveries: 1 };
  fixture.game.send.mockRejectedValueOnce(Error('Sitzung wurde gewechselt'));
  await render();
  await act(async () => button('Als gesehen markieren').click());
  expect(fixture.game.showToast).toHaveBeenCalledWith('Sitzung wurde gewechselt', 'error');
  expect(container.textContent).toContain('Schritt 4 / 5');
});
it('blendet eine pausierte Begleitung aus', async () => {
  fixture.game.state.onboarding.paused = true;
  await render();
  expect(container.textContent).toBe('');
});
