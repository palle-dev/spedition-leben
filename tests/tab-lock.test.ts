
import { beforeEach, describe, expect, it, vi } from "vitest";
let store, now, serial;
beforeEach(() => {
  vi.resetModules(); store = new Map(); now = 10000; serial = 0;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  vi.stubGlobal("crypto", { randomUUID: () => "tab-" + ++serial });
  vi.stubGlobal("localStorage", {
    getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key),
  });
});
describe("Tab-Schreibsperre", () => {
  it("verwendet pro Dokument eine eigene Kennung", async () => {
    const a = await import("@/lib/tabLock");
    vi.resetModules();
    const b = await import("@/lib/tabLock");
    expect(a.getTabId()).not.toBe(b.getTabId());
    expect(a.acquireLock()).toBe(true);
    expect(b.acquireLock()).toBe(false);
  });
  it("erkennt eine Übernahme und erwirbt eine verlorene Sperre nicht still erneut", async () => {
    const a = await import("@/lib/tabLock");
    expect(a.acquireLock()).toBe(true);
    vi.resetModules();
    const b = await import("@/lib/tabLock");
    now += 6000;
    expect(b.acquireLock()).toBe(true);
    expect(a.refreshLock()).toBe(false);
    b.releaseLock();
    expect(a.refreshLock()).toBe(false);
  });
});
