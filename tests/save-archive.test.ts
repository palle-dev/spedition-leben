import { describe, it, expect, vi } from 'vitest';
import { compactHistory, restoreHistory, portableHistory, archiveStats, readLimited } from '@/lib/historyArchive';
import { runSaveFileTask } from '@/lib/saveFileTasks';
import { exportSave, importSave } from '@/lib/persistence';
import { writeRecoverySave } from '@/lib/saveSafety';
const offer = (id, patch = {}) => ({ id, status: 'expired', acceptedAtMin: null, startedAtMin: null, acceptDeadlineMin: 100, ...patch });
const state = () => ({ gameTime: 14400, meta: {partyId:'private-party'}, company: {}, private: {}, vehicles: [], drivers: [], orders: [offer('old')], accounting: { journal: [{id:'j',amount:7}], accountBalances:{1000:9}, taskQueue:[{id:'done',status:'done',completedAtMin:100},{id:'pending',status:'pending'}] } });
async function rows(c) { return JSON.parse(await (await readLimited(c.data.stream().pipeThrough(new DecompressionStream('gzip')))).text()); }

describe('Verlustfreies Spielstandsarchiv', () => {
 it('lagert nur alte ungebundene Angebote und erledigte Aufgaben aus', async () => {
  const s:any=state(); s.orders.push(offer('active',{status:'angenommen'}),offer('accepted',{acceptedAtMin:0}),offer('recent',{acceptDeadlineMin:14300}),offer('bound'),offer('contract',{contractId:'c'}));
  s.tours=[{deployments:[{orderId:'bound'}]}];
  const c=await compactHistory(s);
  expect(c.orders.map(o=>o.id)).toEqual(['active','accepted','recent','bound','contract']);
  expect(c.accounting.taskQueue.map(t=>t.id)).toEqual(['pending']);
  expect(c.accounting.journal).toEqual(s.accounting.journal);
  expect(c.accounting.accountBalances).toEqual(s.accounting.accountBalances);
  expect(s.orders).toHaveLength(6); expect(s.accounting.taskQueue).toHaveLength(2);
  expect(await rows(c.historyArchive.chunks[0])).toEqual([s.orders[0]]);
  expect(archiveStats(c).records).toBe(2);
  expect(await compactHistory(c)).toBe(c);
 });
 it('behält Referenzen in Verträgen, Freigaben und Buchhaltungsbelegen', async () => {
  const s:any=state();s.orders=[offer('a'),offer('b'),offer('c')];
  s.contracts=[{orderIds:['a']}];s.approvals={pending:[{params:{orderId:'b'}}]};s.accounting.journal=[{orderId:'c'}];
  expect((await compactHistory(s)).orders).toEqual(s.orders);
 });
 it('stellt ausgelagerte Originaldaten als lesbaren Archivdownload bereit', async () => {
  const s=state(), c=await compactHistory(s);
  const download=JSON.parse(await (await runSaveFileTask('archive',c)).text());
  expect(download.chunks[0]).toEqual({kind:'expiredOffers',records:s.orders});
  expect(download.chunks[1].records).toEqual([s.accounting.taskQueue[0]]);
 });
 it('hält Archivblöcke in Snapshots unabhängig und lädt sie für die Simulation nicht aus', async () => {
  const a=await compactHistory(state()), b=structuredClone(a);
  b.gameTime+=1440;b.orders.push(offer('next'));
  const next=await compactHistory(b);
  expect(archiveStats(next).records).toBe(3);expect(archiveStats(a).records).toBe(2);
  expect(next.historyArchive.chunks[0].data).toBeInstanceOf(Blob);
  expect(await rows(next.historyArchive.chunks[0])).toEqual(await rows(a.historyArchive.chunks[0]));
 });
 it('überträgt Archive in der Cloud vollständig und überprüft Beschädigungen', async () => {
  const c=await compactHistory(state()), wire=JSON.parse(JSON.stringify(await portableHistory(c)));
  expect(typeof wire.historyArchive.chunks[0].data).toBe('string');
  expect(await rows((await restoreHistory(wire)).historyArchive.chunks[0])).toEqual(await rows(c.historyArchive.chunks[0]));
  wire.historyArchive.chunks[0].data='AAAA';
  await expect(restoreHistory(wire)).rejects.toThrow(/Prüfsumme/);
 });
 it('importiert gzip und alte JSON-Exporte mit gleicher Nutzlast und neuer Partei', async () => {
  const s=state(), c=await runSaveFileTask('import',new Blob([exportSave(s)]));
  const file=await runSaveFileTask('export',c);
  expect(file.type).toBe('application/gzip');
  const loaded=await runSaveFileTask('import',file);
  expect(loaded.meta.partyId).toBeUndefined();expect(loaded.meta.cloudId).toBeNull();
  expect(loaded.accounting).toEqual(c.accounting);
  expect(loaded.orders).toEqual(c.orders);
  expect(await rows(loaded.historyArchive.chunks[0])).toEqual([s.orders[0]]);
 });
 it('verweigert stille JSON-Verluste von Blob-Archiven und unvollständige Archive', async () => {
  const c=await compactHistory(state());
  expect(()=>exportSave(c)).toThrow(/einbetten/);
  expect(()=>writeRecoverySave('alice',c)).toThrow(/IndexedDB/);
  c.historyArchive.chunks[0].data={};
  await expect(restoreHistory(c)).rejects.toThrow();
 });
 it('erhält bei Kompressionsfehlern die komplette Quelle', async () => {
  const s=state(), copy=structuredClone(s);
  vi.stubGlobal('CompressionStream',class {constructor(){throw Error('storage-pressure');}});
  try {await expect(compactHistory(s)).rejects.toThrow('storage-pressure');expect(s).toEqual(copy);}
  finally {vi.unstubAllGlobals();}
 });
 it('begrenzt entpackte Daten vor dem vollständigen Einlesen', async () => {
  await expect(readLimited(new Blob(['123456789']).stream(),8)).rejects.toThrow(/zu groß/);
 });
 it('prüft weiter die Prüfsumme alter Exporte', () => {
  const parsed=JSON.parse(exportSave(state()));parsed.state.gameTime++;
  expect(()=>importSave(JSON.stringify(parsed))).toThrow(/Prüfsumme/);
 });
 it('akzeptiert eine echte JSON-Datei über der alten 50-MiB-Grenze', async () => {
  const s:any=state();s.testPadding='x'.repeat(51*1024*1024);
  const file=new Blob([exportSave(s)]);
  expect(file.size).toBeGreaterThan(50*1024*1024);
  const imported=await runSaveFileTask('import',file);
  expect(imported.testPadding.length).toBe(s.testPadding.length);
  expect(imported.orders).toEqual([]);
 },60000);
});
