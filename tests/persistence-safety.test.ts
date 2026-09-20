
import { beforeEach, describe, expect, it, vi } from "vitest";

// Kleiner IndexedDB-Vertragsadapter: Transaktionen übernehmen ihre Schreibmenge
// zusammen beim Commit; produktive Browserprüfung bleibt separat.
let records, storage, failTransactions, reads, failPutKey;
function installStore() {
  const db = {
    transaction() {
      const pending = []; let requests = 0;
      const tx = {
        aborted: false, abort() { this.aborted = true; },
        objectStore: () => ({
          get(key) { reads.push(key); requests++; const req = {}; setTimeout(() => { req.result = structuredClone(records.get(key)); req.onsuccess?.(); requests--; }, 0); return req; },
          getAllKeys() { const req = {}; setTimeout(() => { req.result = [...records.keys()]; req.onsuccess?.(); }, 0); return req; },
          put(value, key) { if (key === failPutKey) throw Error("DataCloneError"); pending.push(() => records.set(key, structuredClone(value))); },
          delete(key) { pending.push(() => records.delete(key)); },
        }),
      };
      const complete = () => {
        if (requests) { setTimeout(complete, 0); return; }
        if (failTransactions || tx.aborted) { tx.error = new Error("QuotaExceededError"); tx.onabort?.(); return; }
        pending.forEach(apply => apply()); tx.oncomplete?.();
      };
      setTimeout(complete, 0);
      return tx;
    },
  };
  vi.stubGlobal("indexedDB", { open: () => {
    const request = {};
    setTimeout(() => { request.result = db; request.onsuccess?.(); }, 0);
    return request;
  } });
  vi.stubGlobal("localStorage", {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  });
}
const state = (party, scenario = false) => ({
  gameTime: 480, company: { name: party }, private: {}, vehicles: [], drivers: [], orders: [],
  meta: { partyId: party }, ...(scenario ? { scenario: { id: "scenario" } } : {}),
});
beforeEach(() => {
  vi.resetModules(); records = new Map(); reads = []; storage = new Map(); failTransactions = false; failPutKey = null; installStore();
});
describe("Aktive Partie und getrennte Sync-Metadaten", () => {
  it("lädt nach einem Szenario die zuletzt aktivierte freie Partie", async () => {
    const p = await import("@/lib/persistence");
    await p.saveCurrent("alice", state("scenario", true), null, 10);
    await p.saveCurrent("alice", state("free"), null, 20);
    expect((await p.loadCurrent("alice")).meta.partyId).toBe("free");
    expect(records.get("user_alice:scenario_current").state.meta.partyId).toBe("scenario");
  });
  it("wählt bei alten Speicherformaten das neuere Datum statt immer das Szenario", async () => {
    records.set("user_alice:scenario_current", { state: state("old", true), savedAt: 10 });
    records.set("user_alice:current", { state: state("new"), savedAt: 20 });
    const p = await import("@/lib/persistence");
    expect((await p.loadCurrent("alice")).meta.partyId).toBe("new");
  });
  it("bevorzugt eine neuere Sicherheitskopie desselben Nutzers", async () => {
    records.set("user_alice:active_current", { state: state("old"), savedAt: 10 });
    storage.set("spedition_leben_state:user:alice", JSON.stringify({ userId: "alice", state: state("new"), savedAt: 20 }));
    const p = await import("@/lib/persistence");
    expect((await p.loadCurrent("alice")).meta.partyId).toBe("new");
    expect(await p.loadCurrent("bob")).toBeNull();
  });
  it("behält Metadaten je Partie und übernimmt keine fremde Legacy-Zuordnung", async () => {
    const p = await import("@/lib/persistence");
    await p.setSyncMeta("alice", { partyId: "A", cloudId: "cloud-A" });
    await p.setSyncMeta("alice", { partyId: "B", cloudId: "cloud-B" });
    records.set("user_alice:sync_meta", { partyId: "C", cloudId: "cloud-C" });
    expect((await p.getSyncMeta("alice", "A")).cloudId).toBe("cloud-A");
    expect((await p.getSyncMeta("alice", "B")).cloudId).toBe("cloud-B");
    expect(await p.getSyncMeta("alice", "D")).toBeNull();
    expect(await p.getSyncMeta("bob", "A")).toBeNull();
  });
  it("ein Transaktionsabbruch meldet einen Fehler und überschreibt keine aktive Partie", async () => {
    const p = await import("@/lib/persistence");
    await p.saveCurrent("alice", state("A"));
    failTransactions = true;
    await expect(p.saveCurrent("alice", state("B"))).rejects.toThrow("QuotaExceededError");
    expect(records.get("user_alice:active_current").partyId).toBe("A");
  });
  it("Import entfernt alte Partei- und Cloud-Kennungen", async () => {
    const p = await import("@/lib/persistence");
    const original = state("A"); original.meta.cloudId = "cloud-A";
    const imported = p.importSave(p.exportSave(original));
    expect(imported.meta.partyId).toBeUndefined();
    expect(imported.meta.cloudId).toBeNull();
    expect(original.meta.partyId).toBe("A");
  });
});

it("speichert Blob-Archive atomar mit dem Spielstand und benutzergetrennt", async () => {
 const {compactHistory}=await import("@/lib/historyArchive");
 const p=await import("@/lib/persistence");
 const original={...state("A"),gameTime:14400,orders:[{id:"old",status:"expired",acceptDeadlineMin:1}]};
 const archived=await compactHistory(original);
 await p.saveCurrent("alice",archived);
 const loaded=await p.loadCurrent("alice");
 const {readHistoryBlock}=await import("@/lib/historyRepository");
 expect(loaded.historyArchive.chunks[0].data).toBeUndefined();
 expect(await (await readHistoryBlock("alice",loaded.historyArchive.chunks[0])).arrayBuffer()).toEqual(await archived.historyArchive.chunks[0].data.arrayBuffer());
 expect(await p.loadCurrent("bob")).toBeNull();
 failTransactions=true;
 await expect(p.saveCurrent("alice",state("B"))).rejects.toThrow();
 expect((await p.loadCurrent("alice")).historyArchive.chunks).toHaveLength(1);
});


describe("Kleine Sicherungsmetadaten", () => {
 it("liest drei aktuelle Autosave-Daten ohne die Spielstände", async () => {
  const p=await import("@/lib/persistence");
  for(let i=0;i<3;i++)await p.saveAutosave("alice",i,state("A"));
  reads.length=0;
  const metas=await p.getAllAutosaveMetas("alice",false);
  expect(metas.every(m=>Number.isFinite(m.savedAt))).toBe(true);
  expect(reads).toHaveLength(3);
  expect(reads.every(k=>k.startsWith("snapshot_metadata:"))).toBe(true);
 });
 it("listet neue Slots ohne Snapshot und liest alte Slots kompatibel", async () => {
  const p=await import("@/lib/persistence");
  records.set("user_alice:autosave_0",{state:state("old"),savedAt:12});
  expect(await p.getAutosaveMeta("alice",0,false)).toEqual({savedAt:12});
  await p.saveManualSlot("alice","Test",state("new"));
  const meta=records.get("snapshot_metadata:user_alice:slot_Test");
  expect(meta.name).toBe("Test");expect(meta.state).toBeUndefined();
  reads.length=0;
  expect((await p.listManualSlots("alice",false)).map(s=>s.name)).toEqual(["Test"]);
  expect(reads).toEqual(["snapshot_metadata:user_alice:slot_Test"]);
  expect((await p.loadManualSlot("alice","Test",false)).meta.partyId).toBe("new");
 });
 it("übernimmt neue Metadaten nur gemeinsam mit dem Snapshot und löscht beide", async () => {
  const p=await import("@/lib/persistence");
  await p.saveManualSlot("alice","Test",state("A"));
  const old=structuredClone(records.get("snapshot_metadata:user_alice:slot_Test"));
  failTransactions=true;
  await expect(p.saveManualSlot("alice","Test",state("B"))).rejects.toThrow();
  expect(records.get("snapshot_metadata:user_alice:slot_Test")).toEqual(old);
  expect(records.get("user_alice:slot_Test").state.meta.partyId).toBe("A");
  failTransactions=false;await p.deleteManualSlot("alice","Test",false);
  expect(records.has("user_alice:slot_Test")).toBe(false);
  expect(records.has("snapshot_metadata:user_alice:slot_Test")).toBe(false);
 });
 it("trennt Benutzer und Szenarien auch in den Metadaten", async () => {
  const p=await import("@/lib/persistence");
  await p.saveAutosave("alice",0,state("scenario",true));
  expect(await p.getAutosaveMeta("alice",0,false)).toBeNull();
  expect(await p.getAutosaveMeta("bob",0,true)).toBeNull();
  expect((await p.getAutosaveMeta("alice",0,true)).savedAt).toBeGreaterThan(0);
 });
});


it("bricht bei synchronem Metadatenfehler auch den schon vorgemerkten Snapshot ab",async()=>{
 const p=await import("@/lib/persistence");
 await p.saveAutosave("alice",0,state("A"));
 const before=structuredClone(records);
 failPutKey="snapshot_metadata:user_alice:autosave_0";
 await expect(p.saveAutosave("alice",0,state("B"))).rejects.toThrow("DataCloneError");
 await new Promise(r=>setTimeout(r,5));
 expect(records).toEqual(before);
});


describe("Atomarer Verweis auf die aktive Partie",()=>{
 it("schreibt nur einen Vollzustand und lädt denselben Zustand vollständig",async()=>{
  const p=await import("@/lib/persistence"),s=state("A");
  await p.saveCurrent("alice",s,{partyId:"A",localBaseRevision:7},100);
  expect([...records.values()].filter(r=>r.state)).toHaveLength(1);
  expect(records.get("user_alice:active_current")).toEqual({format:"active-save-reference-v1",target:"current",partyId:"A",savedAt:100});
  expect(await p.loadCurrent("alice")).toEqual(s);
  expect(records.get("user_alice:sync_meta_A").localBaseRevision).toBe(7);
 });
 it.each(["missing","timestamp","party","foreignTarget","unknownFormat"])("weist einen %s-Verweis zurück",async mode=>{
  const p=await import("@/lib/persistence");await p.saveCurrent("alice",state("A"),null,100);
  const ref=records.get("user_alice:active_current");
  if(mode==="missing")records.delete("user_alice:current");
  if(mode==="timestamp")ref.savedAt=101;
  if(mode==="party")ref.partyId="B";
  if(mode==="foreignTarget")ref.target="user_bob:current";
  if(mode==="unknownFormat")ref.format="future-format";
  await expect(p.loadCurrent("alice")).rejects.toThrow();
 });
 it("liest alte eingebettete Auswahlen und ersetzt sie erst bei erfolgreichem Speichern",async()=>{
  const p=await import("@/lib/persistence");
  records.set("user_alice:active_current",{state:state("old"),savedAt:10});
  expect((await p.loadCurrent("alice")).meta.partyId).toBe("old");
  failTransactions=true;
  await expect(p.saveCurrent("alice",state("new"))).rejects.toThrow();
  failTransactions=false;expect((await p.loadCurrent("alice")).meta.partyId).toBe("old");
  await p.saveCurrent("alice",state("new"));
  expect((await p.loadCurrent("alice")).meta.partyId).toBe("new");
 });
 it("entfernt beim Szenariolöschen dessen Auswahl und erhält die freie Partie",async()=>{
  const p=await import("@/lib/persistence");
  await p.saveCurrent("alice",state("free"),null,10);
  await p.saveCurrent("alice",state("scenario",true),null,20);
  await p.clearScenarioCurrent("alice");
  expect((await p.loadCurrent("alice")).meta.partyId).toBe("free");
  expect(records.has("user_alice:scenario_current")).toBe(false);
 });
 it("behält bei synchronem Fehler an der Auswahl den bisherigen Snapshot und die Metadaten",async()=>{
  const p=await import("@/lib/persistence");
  await p.saveCurrent("alice",state("A"),{partyId:"A",localBaseRevision:7},100);
  const old=structuredClone(records);
  failPutKey="user_alice:active_current";
  await expect(p.saveCurrent("alice",state("B"),{partyId:"B",localBaseRevision:9},200)).rejects.toThrow();
  await new Promise(r=>setTimeout(r,5));expect(records).toEqual(old);
 });
});

function financialState(party){const s=state(party);s.accounting={journal:[],journalProjection:{version:1,count:1000,days:Object.fromEntries(Array.from({length:1000},(_,i)=>[i,{total:{accounts:{'1000':i},cash:[i,0,0],branches:{}},minutes:{[i*1440]:{accounts:{'1000':i},cash:[i,0,0],branches:{}}}}]))}};return s;}
it('stores and restores compressed history through current, autosave and manual paths',async()=>{
 const p=await import('@/lib/persistence');const s=financialState('financial');
 await p.saveCurrent('alice',s,null,123);expect(records.get('user_alice:current').localFinancialProjection.data).toBeInstanceOf(Blob);
 expect(await p.loadCurrent('alice')).toEqual(s);expect(await p.loadCurrentFree('alice')).toEqual(s);
 await p.saveAutosave('alice',0,s);expect(await p.loadAutosave('alice',0,false)).toEqual(s);
 await p.saveManualSlot('alice','Finance',s);expect(await p.loadManualSlot('alice','Finance',false)).toEqual(s);
 expect((await p.listManualSlots('alice',false))[0].name).toBe('Finance');expect(await p.loadCurrent('bob')).toBeNull();
});
it('keeps the previous financial snapshot and active selector after failed commit',async()=>{
 const p=await import('@/lib/persistence');const old=financialState('old');await p.saveCurrent('alice',old,null,1);failTransactions=true;
 await expect(p.saveCurrent('alice',financialState('new'),null,2)).rejects.toThrow();failTransactions=false;
 expect(await p.loadCurrent('alice')).toEqual(old);
});
it('rejects missing local history and reads compressed scenario fallback',async()=>{
 const p=await import('@/lib/persistence');const s=financialState('scenario');s.scenario={id:'s'};await p.saveCurrent('alice',s,null,1);
 records.delete('user_alice:active_current');expect(await p.loadCurrent('alice')).toEqual(s);
 delete records.get('user_alice:scenario_current').localFinancialProjection;await expect(p.loadCurrent('alice')).rejects.toThrow(/Finanzhistorienblock/);
});

it('selects the newer intact fallback without decoding an older corrupt financial snapshot',async()=>{
 const p=await import('@/lib/persistence');const newer=financialState('newer');newer.scenario={id:'s'};
 await p.saveCurrent('alice',financialState('older'),null,10);await p.saveCurrent('alice',newer,null,20);
 records.delete('user_alice:active_current');delete records.get('user_alice:current').localFinancialProjection;
 expect(await p.loadCurrent('alice')).toEqual(newer);
});
it('does not silently replace the selected corrupt newer snapshot with an older one',async()=>{
 const p=await import('@/lib/persistence');const newer=financialState('newer');newer.scenario={id:'s'};
 await p.saveCurrent('alice',financialState('older'),null,10);await p.saveCurrent('alice',newer,null,20);
 records.delete('user_alice:active_current');delete records.get('user_alice:scenario_current').localFinancialProjection;
 await expect(p.loadCurrent('alice')).rejects.toThrow(/Finanzhistorienblock/);
});
it('inflates only the chosen fallback and avoids all inflation for a newer recovery save',async()=>{
 const p=await import('@/lib/persistence');const older=financialState('old'),newer=financialState('new');newer.scenario={id:'s'};
 await p.saveCurrent('alice',older,null,10);await p.saveCurrent('alice',newer,null,20);records.delete('user_alice:active_current');
 const Original=globalThis.DecompressionStream;let count=0;vi.stubGlobal('DecompressionStream',class extends Original {constructor(format){super(format);count++;}});
 try{
  expect(await p.loadCurrent('alice')).toEqual(newer);expect(count).toBe(1);
  storage.set('spedition_leben_state:user:alice',JSON.stringify({userId:'alice',state:state('recovery'),savedAt:30}));
  expect((await p.loadCurrent('alice')).meta.partyId).toBe('recovery');expect(count).toBe(1);
 }finally{vi.stubGlobal('DecompressionStream',Original);}
});
