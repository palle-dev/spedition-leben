import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { stageCloudArchive, hydrateCloudArchive } from '../base44/shared/cloudArchiveStore';
const chunk = (text = 'original') => ({ id: createHash('sha256').update(text).digest('hex'), kind: 'expiredOffers', count: 1, rawBytes: text.length, data: btoa(text) });
const state = (...chunks) => ({ historyArchive: { version: 1, chunks } });
let records, db;
beforeEach(() => {
  records = new Map();
  db = {
    filter: vi.fn(async q => [...records.values()].filter(r => Object.entries(q).every(([k,v]) => (v && typeof v === "object" && "$in" in v ? v.$in.includes(r[k]) : r[k] === v)))),
    get: vi.fn(async id => records.get(id)),
    create: vi.fn(async data => { const row = { ...data, id: 'r' + records.size }; records.set(row.id, row); return row; }),
  };
  db.bulkCreate = vi.fn(async rows => Promise.all(rows.map(row => db.create(row))));
});
it('roundtrips a full save and reuses a committed block without any archive I/O', async () => {
  const original = state(chunk());
  const first = await stageCloudArchive(db, 'u', original);
  expect(first.state.historyArchive.chunks[0].data).toBeUndefined();
  expect(await hydrateCloudArchive(db, 'u', first.state, first.archive_blocks)).toEqual(original);
  vi.clearAllMocks();
  const second = await stageCloudArchive(db, 'u', first.state, first.state, first.archive_blocks);
  expect(second).toEqual(first);
  expect(db.get).not.toHaveBeenCalled(); expect(db.filter).not.toHaveBeenCalled(); expect(db.create).not.toHaveBeenCalled();
});
it('migrates old embedded data without asking the client to upload it again', async () => {
  const original = state(chunk()), { data, ...ref } = chunk();
  const staged = await stageCloudArchive(db, 'u', state(ref), original);
  expect(await hydrateCloudArchive(db, 'u', staged.state, staged.archive_blocks)).toEqual(original);
});
it('writes only new blocks and keeps their originals exact', async () => {
  const first = await stageCloudArchive(db, 'u', state(chunk()));
  vi.clearAllMocks();
  const second = await stageCloudArchive(db, 'u', state(...first.state.historyArchive.chunks, chunk('new')), first.state, first.archive_blocks);
  expect(db.create).toHaveBeenCalledTimes(1);
  expect(await hydrateCloudArchive(db, 'u', second.state, second.archive_blocks)).toEqual(state(chunk(), chunk('new')));
});
it('reuses an orphan after an interrupted snapshot commit', async () => {
  const a = await stageCloudArchive(db, 'u', state(chunk()));
  const b = await stageCloudArchive(db, 'u', state(chunk()));
  expect(a).toEqual(b); expect(db.create).toHaveBeenCalledTimes(1);
});
it('does not share block IDs across owners', async () => {
  const a = await stageCloudArchive(db, 'u', state(chunk()));
  const b = await stageCloudArchive(db, 'v', state(chunk()));
  expect(a.archive_blocks).not.toEqual(b.archive_blocks);
  await expect(hydrateCloudArchive(db, 'v', a.state, a.archive_blocks)).rejects.toThrow('Zugriff');
});
it.each(['missing','corrupt','descriptor'])('fails closed when a stored block is %s', async mode => {
  const staged = await stageCloudArchive(db, 'u', state(chunk()));
  const id = Object.values(staged.archive_blocks)[0] as string;
  if (mode === 'missing') records.delete(id);
  if (mode === 'corrupt') records.get(id).data = btoa('corrupt');
  if (mode === 'descriptor') records.get(id).descriptor.count++;
  await expect(hydrateCloudArchive(db, 'u', staged.state, staged.archive_blocks)).rejects.toThrow();
});
it('does not return a snapshot when any new block write fails', async () => {
  db.create.mockRejectedValueOnce(Error('storage unavailable'));
  await expect(stageCloudArchive(db, 'u', state(chunk()))).rejects.toThrow('storage unavailable');
});
it('rejects forged references, duplicates and modified payloads before a snapshot commit', async () => {
  const { data, ...ref } = chunk();
  await expect(stageCloudArchive(db, 'u', state(ref))).rejects.toThrow();
  await expect(stageCloudArchive(db, 'u', state(chunk(), chunk()))).rejects.toThrow();
  await expect(stageCloudArchive(db, 'u', state({ ...chunk(), data: btoa('wrong') }))).rejects.toThrow();
});
