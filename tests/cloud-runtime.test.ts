import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serve: vi.fn(),
  client: {
    auth: { me: vi.fn(async () => ({ id: 'runtime-user' })) },
    asServiceRole: { entities: { GameState: { filter: vi.fn(async () => [
      { id: 'existing-save', owner_id: 'runtime-user', revision: 7, party_id: 'party-1' },
    ]) } } },
  },
}));
vi.mock('@base44/sdk', () => ({ createClientFromRequest: () => mocks.client }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

it('registers the Cloud handler as the Deno HTTP entrypoint and serves the list request', async () => {
  vi.stubGlobal('Deno', { serve: mocks.serve });
  const { default: handler } = await import('../base44/functions/cloudSync/entry');
  expect(mocks.serve).toHaveBeenCalledExactlyOnceWith(handler);
  const registered = mocks.serve.mock.calls[0][0];
  const response = await registered(new Request('https://runtime.invalid/cloudSync', {
    method: 'POST', body: JSON.stringify({ command: 'list' }),
  }));
  expect(response.status).toBe(200);
  expect((await response.json()).saves).toMatchObject([{ id: 'existing-save', revision: 7 }]);
  expect(mocks.client.asServiceRole.entities.GameState.filter)
    .toHaveBeenCalledWith({ owner_id: 'runtime-user' }, '-cloud_saved_at', 100);
});
