import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { stageCloudArchive, hydrateCloudArchive } from '../base44/shared/cloudArchiveStore';
import { projectJournal, projectionRange } from '../base44/shared/financialProjection';
import { privateStorageFixture } from './fixtures/privateStorage';

const block = (text = 'original', kind = 'expiredOffers') => {
  const bytes = gzipSync(Buffer.from(text));
  return { id: createHash('sha256').update(bytes).digest('hex'), kind, count: 1,
    rawBytes: Buffer.byteLength(text), data: bytes.toString('base64') };
};
const snapshot = (...items) => ({ gameTime: 480, company: {}, private: {},
  vehicles: [], drivers: [], orders: [], historyArchive: { version: 1, chunks: items } });
let files, db;
beforeEach(() => {
  files = privateStorageFixture();
  db = { filter: vi.fn(async () => []), get: vi.fn(async () => undefined), bulkCreate: vi.fn() };
});
afterEach(() => vi.unstubAllGlobals());

it('roundtrips complete files without reading or writing archive entities', async () => {
  const original = snapshot(block());
  const staged = await stageCloudArchive(db, 'alice', original, null, {}, files.storage);
  expect(staged.state).toMatch(/^uri:/);
  expect(staged.archive_blocks).toEqual({});
  expect(await hydrateCloudArchive(db, 'alice', staged.state, {}, files.storage)).toEqual(original);
  expect(db.filter).not.toHaveBeenCalled();
  expect(db.get).not.toHaveBeenCalled();
  expect(db.bulkCreate).not.toHaveBeenCalled();
});

it('rejects corrupt embedded originals both before upload and during load', async () => {
  const bad = snapshot({ ...block(), data: btoa('corrupt') });
  await expect(stageCloudArchive(db, 'alice', bad, null, {}, files.storage)).rejects.toThrow('Prüfsumme');
  await expect(hydrateCloudArchive(db, 'alice', bad, {}, files.storage)).rejects.toThrow('Prüfsumme');
  expect(files.core.UploadPrivateFile).not.toHaveBeenCalled();
});

it.each(['missing', 'foreign', 'descriptor', 'corrupt'])('fails closed on a %s journal block without changing counts or balances', async mode => {
  const entries = [{ entryNo: 1, gameTime: 480, type: 'revenue', lines: [
    { account: '1000', debitCents: 12345, creditCents: 0 },
    { account: '4000', debitCents: 0, creditCents: 12345 },
  ] }];
  const c = { ...block(JSON.stringify(entries), 'accountingJournal'), minEntryNo: 1, maxEntryNo: 1 };
  const { data, ...ref } = c;
  const original = { ...snapshot(ref), accounting: { journalProjection: projectJournal(null, entries,
    { '1000': { type: 'asset' }, '4000': { type: 'revenue' } }) } };
  const before = structuredClone(original);
  const row = { id: 'r1', owner_id: 'alice', content_hash: c.id, descriptor: ref, data };
  if (mode === 'foreign') row.owner_id = 'bob';
  if (mode === 'descriptor') row.descriptor = { ...ref, count: 2 };
  if (mode === 'corrupt') row.data = btoa('bad');
  db.get.mockResolvedValue(mode === 'missing' ? undefined : row);
  await expect(hydrateCloudArchive(db, 'alice', original, { [c.id]: 'r1' }, files.storage)).rejects.toThrow();
  expect(original).toEqual(before);
  expect(original.accounting.journalProjection.count).toBe(1);
  expect(projectionRange(original.accounting.journalProjection).accounts['1000']).toBe(12345);
});

it('loads old private archive blocks while preserving the exact descriptor and bytes', async () => {
  const c = block(), { data, ...ref } = c;
  const { file_uri } = await files.core.UploadPrivateFile({ file: new File([Buffer.from(data, 'base64')], 'old.gz') });
  db.get.mockResolvedValue({ owner_id: 'alice', content_hash: c.id, descriptor: ref, data: 'uri:' + file_uri });
  const original = snapshot(ref);
  expect(await hydrateCloudArchive(db, 'alice', original, { [c.id]: 'old-block' }, files.storage)).toEqual(snapshot(c));
});

it('migrates reference-only requests against the exact previous private-file snapshot', async () => {
  const c = block(), { data, ...ref } = c;
  const first = await stageCloudArchive(db, 'alice', snapshot(c), null, {}, files.storage);
  const second = await stageCloudArchive(db, 'alice', snapshot(ref), first.state, {}, files.storage);
  expect(await hydrateCloudArchive(db, 'alice', second.state, {}, files.storage)).toEqual(snapshot(c));
  expect(db.filter).not.toHaveBeenCalled();
});

it.each(['absent', 'changed'])('rejects an %s previous descriptor before uploading a reference-only save', async mode => {
  const c = block(), { data, ...ref } = c;
  const previous = snapshot(...(mode === 'absent' ? [] : [{ ...c, count: 2 }]));
  await expect(stageCloudArchive(db, 'alice', snapshot(ref), previous, {}, files.storage)).rejects.toThrow('Archivreferenz');
  expect(files.core.UploadPrivateFile).not.toHaveBeenCalled();
});

it('never adjusts a mismatched journal count to make a broken snapshot loadable', async () => {
  const source = { ...snapshot(block()), accounting: { journalProjection: { count: 1, days: {} } } };
  await expect(hydrateCloudArchive(db, 'alice', source, {}, files.storage)).rejects.toThrow('unvollständig');
  await expect(stageCloudArchive(db, 'alice', source, null, {}, files.storage)).rejects.toThrow('unvollständig');
  expect(source.accounting.journalProjection.count).toBe(1);
  expect(files.core.UploadPrivateFile).not.toHaveBeenCalled();
});

it('requires a confirmed private-file URI before acknowledging an upload', async () => {
  files.core.UploadPrivateFile.mockResolvedValueOnce({});
  await expect(stageCloudArchive(db, 'alice', snapshot(), null, {}, files.storage)).rejects.toThrow('nicht bestätigt');
});

it('does not acknowledge a partially confirmed legacy block batch', async () => {
  db.bulkCreate.mockResolvedValueOnce([]);
  await expect(stageCloudArchive(db, 'alice', snapshot(block()))).rejects.toThrow('nicht bestätigt');
});
