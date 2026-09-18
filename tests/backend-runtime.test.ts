import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serve: vi.fn(),
  me: vi.fn(async () => null),
}));
vi.mock('@base44/sdk', () => ({ createClientFromRequest: () => ({ auth: { me: mocks.me } }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

it.each([
  ['gameCommand', () => import('../base44/functions/gameCommand/entry'), 401],
  ['applyCommandRemote', () => import('../base44/functions/applyCommandRemote/entry'), 401],
  ['saveGameState', () => import('../base44/functions/saveGameState/entry'), 401],
  ['processAutomationTick', () => import('../base44/functions/processAutomationTick/entry'), 403],
])('%s registers exactly one HTTP handler and rejects unauthenticated requests', async (_, load, status) => {
  vi.stubGlobal('Deno', { serve: mocks.serve });
  const { default: handler } = await load();
  expect(mocks.serve).toHaveBeenCalledExactlyOnceWith(handler);
  const registered = mocks.serve.mock.calls[0][0];
  const response = await registered(new Request('https://runtime.invalid/function', { method: 'POST', body: '{}' }));
  expect(response.status).toBe(status);
});
