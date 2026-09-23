// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { useCloudGameSync } from "@/lib/useCloudGameSync";

const io = vi.hoisted(() => ({
  listCloudSaves: vi.fn(), loadCloudSave: vi.fn(), createCloudSave: vi.fn(),
  saveCloudSave: vi.fn(), deleteCloudSave: vi.fn(),
  saveManualSlot: vi.fn(), setSyncMeta: vi.fn(),
}));
vi.mock("@/lib/cloudSync", async importOriginal => ({
  ...await importOriginal(), listCloudSaves: io.listCloudSaves, loadCloudSave: io.loadCloudSave,
  createCloudSave: io.createCloudSave, saveCloudSave: io.saveCloudSave, deleteCloudSave: io.deleteCloudSave,
}));
vi.mock("@/lib/persistence", () => ({ saveManualSlot: io.saveManualSlot, setSyncMeta: io.setSyncMeta }));
vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke: vi.fn() } } }));
const ref = current => ({ current });
const game = (id = "A") => ({ meta: { partyId: id }, gameTime: 480, company: { name: id, accountCents: 7500000 } });
const meta = (id = "A") => ({ partyId: id, cloudId: "cloud-" + id, localBaseRevision: 1, status: "idle" });
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
let root, node, api, env, generation;
function Harness() { api = useCloudGameSync(env); return null; }
const run = async fn => { let value; await act(async () => { value = await fn(); }); return value; };
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("navigator", { onLine: true });
  Object.values(io).forEach(mock => mock.mockReset());
  io.setSyncMeta.mockResolvedValue(undefined);
  io.saveManualSlot.mockResolvedValue(undefined);
  io.listCloudSaves.mockResolvedValue({ saves: [] });
  io.loadCloudSave.mockResolvedValue({ state: game(), party_id: "A", revision: 7 });
  io.createCloudSave.mockResolvedValue({ stateId: "new-cloud", revision: 1 });
  io.saveCloudSave.mockResolvedValue({ stateId: "cloud-A", revision: 2 });
  io.deleteCloudSave.mockResolvedValue({});
  generation = 1;
  env = {
    sessionToken: () => ({ userId: "alice", generation }),
    isCurrentSession: token => token.generation === generation,
    assertWritable: vi.fn(), stateRef: ref(game()), syncMetaRef: ref(meta()),
    cloudDirtyRef: ref(true), changingStateRef: ref(false), changeVersionRef: ref(1),
    hasLockRef: ref(true), lockRequiresReloadRef: ref(false), userIdRef: ref("alice"),
    setSyncMeta: vi.fn(), setLocalSaveError: vi.fn(), saveNow: vi.fn(async () => ({ ok: true })),
    showToast: vi.fn(), setBusy: vi.fn(), setLoading: vi.fn(), setLoadingProgress: vi.fn(), setLoadingPhase: vi.fn(),
  };
  env.beginStateChange = vi.fn(() => { generation++; env.changingStateRef.current = true; return env.sessionToken(); });
  env.activateState = vi.fn(async (s, token, providedMeta) => {
    if (!env.isCurrentSession(token)) return { skipped: true };
    env.stateRef.current = s;
    env.syncMetaRef.current = providedMeta || { ...meta(s.meta.partyId), cloudId: null, localBaseRevision: 0 };
    env.changingStateRef.current = false;
    return { ok: true };
  });
  node = document.createElement("div"); document.body.appendChild(node);
  root = createRoot(node); act(() => root.render(React.createElement(Harness)));
});
afterEach(() => {
  act(() => root.unmount()); node.remove();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it("behält Queue und Aktionen beim Rendern und legt zwei erste Uploads nur einmal an", async () => {
  env.syncMetaRef.current = { ...meta(), cloudId: null, localBaseRevision: 0 };
  const pending = deferred();
  io.createCloudSave.mockReturnValueOnce(pending.promise);
  const s = env.stateRef.current;
  const first = api.uploadToCloud(s, "Start", "manual");
  const upload = api.uploadToCloud;
  act(() => root.render(React.createElement(Harness)));
  expect(api.uploadToCloud).toBe(upload);
  const second = api.uploadToCloud(s, "Zweiter", "manual");
  pending.resolve({ stateId: "new-cloud", revision: 1 });
  await run(() => Promise.all([first, second]));
  expect(io.createCloudSave).toHaveBeenCalledTimes(1);
  expect(io.saveCloudSave).toHaveBeenCalledWith("new-cloud", s, 1, "Zweiter", "manual", "alice");
  expect(env.syncMetaRef.current.localBaseRevision).toBe(2);
});

it("verwirft verspätete Uploadantworten und wartende Aufträge nach Partiewechsel", async () => {
  const pending = deferred();
  io.saveCloudSave.mockReturnValueOnce(pending.promise);
  const first = api.uploadToCloud(env.stateRef.current);
  const second = api.uploadToCloud(env.stateRef.current);
  generation++; env.stateRef.current = game("B"); env.syncMetaRef.current = meta("B");
  pending.resolve({ stateId: "cloud-A", revision: 99 });
  expect(await run(() => Promise.all([first, second]))).toEqual([{ skipped: true }, { skipped: true }]);
  expect(io.saveCloudSave).toHaveBeenCalledTimes(1);
  expect(env.syncMetaRef.current).toEqual(meta("B"));
});

it("serialisiert Löschen hinter dem Upload und entfernt nur dessen Cloud-Zuordnung", async () => {
  const pending = deferred();
  io.listCloudSaves.mockResolvedValue({ saves: [{ id: "cloud-A" }, { id: "cloud-B" }] });
  await run(() => api.refreshCloudSaves());
  io.saveCloudSave.mockReturnValueOnce(pending.promise);
  const upload = api.uploadToCloud(env.stateRef.current);
  const deletion = api.deleteCloudGame("cloud-A");
  expect(io.deleteCloudSave).not.toHaveBeenCalled();
  pending.resolve({ stateId: "cloud-A", revision: 2 });
  await run(() => Promise.all([upload, deletion]));
  expect(api.cloudSaves).toEqual([{ id: "cloud-B" }]);
  expect(env.syncMetaRef.current.cloudId).toBeNull();
  expect(env.syncMetaRef.current.localBaseRevision).toBe(0);
  expect(env.stateRef.current.meta.partyId).toBe("A");
});

it("überschreibt Konflikte nur bei bewusster lokaler Auflösung mit aktueller Revision", async () => {
  io.saveCloudSave.mockResolvedValueOnce({ conflict: true, current_revision: 7 });
  expect((await run(() => api.uploadToCloud(env.stateRef.current))).conflict).toBe(true);
  expect((await run(() => api.retryCloudSync())).ok).toBe(false);
  expect(io.saveCloudSave).toHaveBeenCalledTimes(1);
  await run(() => api.resolveConflictKeepLocal());
  expect(io.saveCloudSave.mock.calls[1][2]).toBe(7);
  expect(env.syncMetaRef.current.status).toBe("synced");
});

it("sichert die lokale Fassung vor Konfliktauflösung mit der Cloud", async () => {
  const original = structuredClone(env.stateRef.current);
  expect(await run(() => api.resolveConflictKeepCloud())).toEqual({ ok: true });
  expect(io.saveManualSlot).toHaveBeenCalledWith("alice", expect.stringContaining("Backup_vor_Cloud_"), original);
  expect(io.saveManualSlot.mock.invocationCallOrder[0]).toBeLessThan(io.loadCloudSave.mock.invocationCallOrder[0]);
  expect(env.activateState.mock.calls[0][2]).toMatchObject({ partyId: "A", cloudId: "cloud-A", localBaseRevision: 7 });
});

it("lädt bei fehlgeschlagener lokaler Konfliktsicherung keinen Cloud-Stand", async () => {
  io.saveManualSlot.mockRejectedValueOnce(Error("Speicher voll"));
  expect(await run(() => api.resolveConflictKeepCloud())).toEqual({ ok: false, error: "Speicher voll" });
  expect(io.loadCloudSave).not.toHaveBeenCalled();
  expect(env.activateState).not.toHaveBeenCalled();
});

it("behält bei Konflikt-Kopie das Original und verwendet eine neue Partiezuordnung", async () => {
  const original = env.stateRef.current, before = structuredClone(original);
  expect((await run(() => api.resolveConflictKeepBoth())).ok).toBe(true);
  const copy = env.stateRef.current;
  expect(original).toEqual(before);
  expect(copy.meta.partyId).not.toBe("A");
  expect(copy.meta.forkedFrom).toBe("A");
  expect(io.createCloudSave).toHaveBeenCalledWith(copy, copy.meta.partyId, "Konflikt-Kopie (lokal)", "conflict_backup", "alice");
  expect(io.saveCloudSave).not.toHaveBeenCalled();
});

it("zeigt nur die jüngste Cloud-Liste und verwirft Antworten nach dem Zurücksetzen", async () => {
  const first = deferred(), second = deferred();
  io.listCloudSaves.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  let a, b;
  act(() => { a = api.refreshCloudSaves(); b = api.refreshCloudSaves(); });
  expect(api.cloudLoading).toBe(true);
  second.resolve({ saves: [{ id: "new" }] }); await run(() => b);
  first.resolve({ saves: [{ id: "old" }] }); await run(() => a);
  expect(api.cloudSaves).toEqual([{ id: "new" }]);
  const stale = deferred(); io.listCloudSaves.mockReturnValueOnce(stale.promise);
  let c; act(() => { c = api.refreshCloudSaves(); api.resetCloudState(); });
  stale.resolve({ saves: [{ id: "stale" }] }); await run(() => c);
  expect(api.cloudSaves).toEqual([]);
  expect(api.cloudLoading).toBe(false);
});

it("ignoriert verspätete Cloud-Ladevorgänge einschließlich ihrer UI-Abschlussmeldungen", async () => {
  const pending = deferred(); io.loadCloudSave.mockReturnValueOnce(pending.promise);
  const load = api.loadCloudGame("cloud-A");
  generation++; env.stateRef.current = game("B");
  env.setBusy.mockClear(); env.setLoading.mockClear(); env.setLoadingProgress.mockClear();
  pending.resolve({ state: game(), revision: 2 });
  expect(await run(() => load)).toEqual({ skipped: true });
  expect(env.activateState).not.toHaveBeenCalled();
  expect(env.setBusy).not.toHaveBeenCalled();
  expect(env.setLoading).not.toHaveBeenCalled();
  expect(env.setLoadingProgress).not.toHaveBeenCalled();
  expect(env.stateRef.current.meta.partyId).toBe("B");
});

it("meldet neue Cloud-Revisionen beim Start, ohne die lokale Partie zu ersetzen", async () => {
  await run(() => api.checkCloudRevision(env.sessionToken()));
  expect(env.syncMetaRef.current.status).toBe("conflict");
  expect(env.syncMetaRef.current.localBaseRevision).toBe(1);
  expect(env.activateState).not.toHaveBeenCalled();
});

it("wiederholt erst nach erfolgreicher lokaler Sicherung und überträgt unveränderte Snapshots", async () => {
  env.saveNow.mockResolvedValueOnce({ ok: false });
  expect((await run(() => api.retryCloudSync())).ok).toBe(false);
  expect(io.saveCloudSave).not.toHaveBeenCalled();
  const pending = deferred(); io.saveCloudSave.mockReturnValueOnce(pending.promise);
  const upload = api.uploadToCloud(env.stateRef.current);
  env.stateRef.current.company.accountCents = 100;
  env.changeVersionRef.current++;
  pending.resolve({ stateId: "cloud-A", revision: 2 });
  await run(() => upload);
  expect(io.saveCloudSave.mock.calls[0][1].company.accountCents).toBe(7500000);
  expect(env.cloudDirtyRef.current).toBe(true);
});

it("synchronisiert bei Wiederverbindung und entfernt Timer und Listener beim Unmount", async () => {
  navigator.onLine = false;
  await run(async () => window.dispatchEvent(new Event("offline")));
  expect(env.syncMetaRef.current.status).toBe("offline");
  await run(() => vi.advanceTimersByTimeAsync(180000));
  expect(io.saveCloudSave).not.toHaveBeenCalled();
  navigator.onLine = true;
  await run(async () => window.dispatchEvent(new Event("online")));
  expect(io.saveCloudSave).toHaveBeenCalledTimes(1);
  expect(env.syncMetaRef.current.status).toBe("synced");
  env.cloudDirtyRef.current = true; env.syncMetaRef.current.status = "conflict";
  await run(() => vi.advanceTimersByTimeAsync(180000));
  expect(io.saveCloudSave).toHaveBeenCalledTimes(1);
  env.syncMetaRef.current.status = "idle";
  await run(() => vi.advanceTimersByTimeAsync(180000));
  expect(io.saveCloudSave).toHaveBeenCalledTimes(2);
  act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
  io.listCloudSaves.mockClear(); env.cloudDirtyRef.current = true;
  window.dispatchEvent(new Event("online"));
  expect(io.listCloudSaves).not.toHaveBeenCalled();
});
