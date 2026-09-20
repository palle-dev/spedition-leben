
import { beforeEach, describe, expect, it, vi } from "vitest";

// Kleiner IndexedDB-Vertragsadapter: Transaktionen übernehmen ihre Schreibmenge
// zusammen beim Commit; produktive Browserprüfung bleibt separat.
let records, storage, failTransactions;
function installStore() {
  const db = {
    transaction() {
      const pending = [];
      const tx = {
        objectStore: () => ({
          get(key) { const req = {}; setTimeout(() => { req.result = structuredClone(records.get(key)); req.onsuccess?.(); }, 0); return req; },
          put(value, key) { pending.push(() => records.set(key, structuredClone(value))); },
          delete(key) { pending.push(() => records.delete(key)); },
        }),
      };
      setTimeout(() => {
        if (failTransactions) { tx.error = new Error("QuotaExceededError"); tx.onabort?.(); return; }
        pending.forEach(apply => apply()); tx.oncomplete?.();
      }, 0);
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
  vi.resetModules(); records = new Map(); storage = new Map(); failTransactions = false; installStore();
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
    expect(records.get("user_alice:active_current").state.meta.partyId).toBe("A");
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
 expect(await loaded.historyArchive.chunks[0].data.arrayBuffer()).toEqual(await archived.historyArchive.chunks[0].data.arrayBuffer());
 expect(await p.loadCurrent("bob")).toBeNull();
 failTransactions=true;
 await expect(p.saveCurrent("alice",state("B"))).rejects.toThrow();
 expect((await p.loadCurrent("alice")).historyArchive.chunks).toHaveLength(1);
});
