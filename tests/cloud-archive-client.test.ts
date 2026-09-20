import { expect, it, vi, beforeEach } from 'vitest';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), read: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: mock.invoke } } }));
vi.mock('@/lib/historyRepository', () => ({ readHistoryBlock: mock.read }));
import { saveCloudSave } from '@/lib/cloudSync';
let state, data;
beforeEach(async () => {
  vi.resetAllMocks();
  data = new Blob(['preserved bytes']);
  const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await data.arrayBuffer())),
    b => b.toString(16).padStart(2, '0')).join('');
  state = { meta: { partyId: 'p' }, historyArchive: { version: 1, storage: 'indexeddb',
    chunks: [{ id, kind: 'expiredOffers', rawBytes: 15, count: 1 }] } };
  mock.read.mockResolvedValue(data);
  mock.invoke.mockImplementation(async (_, body) => ({ data: { ok: true, archive_delta: 1, revision: body.expected_revision + 1 } }));
});
it('reads and encodes a block only for the initial acknowledged save', async () => {
  await saveCloudSave('incremental', state, 1, null, null, 'u');
  expect(mock.invoke.mock.calls[0][1].state.historyArchive.chunks[0].data).toBe(btoa('preserved bytes'));
  await saveCloudSave('incremental', state, 2, null, null, 'u');
  expect(mock.read).toHaveBeenCalledTimes(1);
  expect(mock.invoke.mock.calls[1][1].state.historyArchive.chunks[0].data).toBeUndefined();
  expect(state.historyArchive.storage).toBe('indexeddb');
});
it.each(['revision', 'owner', 'party', 'descriptor'])('does not reuse after a %s change', async change => {
  await saveCloudSave(change, state, 1, null, null, 'u');
  if (change === 'party') state.meta.partyId = 'another';
  if (change === 'descriptor') state.historyArchive.chunks[0].count++;
  await saveCloudSave(change, state, change === 'revision' ? 3 : 2, null, null, change === 'owner' ? 'other' : 'u');
  expect(mock.read).toHaveBeenCalledTimes(2);
});
it('never infers delta support from a legacy success or conflict', async () => {
  mock.invoke.mockResolvedValueOnce({ data: { ok: true, revision: 2 } });
  await saveCloudSave('legacy', state, 1, null, null, 'u');
  await saveCloudSave('legacy', state, 2, null, null, 'u');
  mock.invoke.mockResolvedValueOnce({ data: { conflict: true, current_revision: 4 } });
  await saveCloudSave('legacy', state, 3, null, null, 'u');
  await saveCloudSave('legacy', state, 4, null, null, 'u');
  expect(mock.read).toHaveBeenCalledTimes(3);
});
it('sends newly archived content while retaining acknowledged references', async () => {
  await saveCloudSave('mixed', state, 1, null, null, 'u');
  const blob = new Blob(['new preserved bytes']);
  const id = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())),
    b => b.toString(16).padStart(2, '0')).join('');
  state.historyArchive.chunks.push({ id, kind: 'expiredOffers', rawBytes: 19, count: 1 });
  mock.read.mockResolvedValue(blob);
  await saveCloudSave('mixed', state, 2, null, null, 'u');
  const chunks = mock.invoke.mock.calls[1][1].state.historyArchive.chunks;
  expect(chunks[0].data).toBeUndefined();
  expect(chunks[1].data).toBe(btoa('new preserved bytes'));
  expect(mock.read).toHaveBeenCalledTimes(2);
});
it('does not invoke a save when a new local block is corrupt', async () => {
  mock.read.mockResolvedValue(new Blob(['corrupt']));
  await expect(saveCloudSave('corrupt', state, 1, null, null, 'u')).rejects.toThrow('Prüfsumme');
  expect(mock.invoke).not.toHaveBeenCalled();
});
