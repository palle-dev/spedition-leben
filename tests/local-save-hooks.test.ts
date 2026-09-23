// @vitest-environment happy-dom
import React from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { useLocalSaveWriter } from "@/lib/useLocalSaveWriter";
import { useGameSaveActions } from "@/lib/useGameSaveActions";

const io = vi.hoisted(() => ({
  saveCurrent: vi.fn(), saveAutosave: vi.fn(), getAllAutosaveMetas: vi.fn(),
  writeRecoverySave: vi.fn(), releaseLock: vi.fn(), saveManualSlot: vi.fn(),
  loadManualSlot: vi.fn(), loadAutosave: vi.fn(), loadCurrent: vi.fn(),
  listManualSlots: vi.fn(), deleteManualSlot: vi.fn(),
  processSaveFile: vi.fn(), hydrateHistory: vi.fn(),
}));
vi.mock("@/lib/persistence", () => io);
vi.mock("@/lib/saveSafety", () => ({ writeRecoverySave: io.writeRecoverySave }));
vi.mock("@/lib/tabLock", () => ({ releaseLock: io.releaseLock }));
vi.mock("@/lib/saveFileClient", () => ({ processSaveFile: io.processSaveFile }));
vi.mock("@/lib/historyRepository", () => ({ hydrateHistory: io.hydrateHistory }));
const ref = current => ({ current });
const state = () => ({ meta: { partyId: "A" }, company: { name: "Test", accountCents: 12345 }, gameTime: 480 });
let root, node, api, env, generation;
function Harness() {
  api = { ...useLocalSaveWriter(env), ...useGameSaveActions(env) };
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.values(io).forEach(mock => mock.mockReset());
  io.getAllAutosaveMetas.mockResolvedValue([]);
  generation = 1;
  env = {
    sessionToken: () => ({ userId: "alice", generation }),
    isCurrentSession: token => token.generation === generation,
    assertWritable: vi.fn(), beginStateChange: vi.fn(() => env.sessionToken()),
    activateState: vi.fn(async () => ({ ok: true })), ensurePartyId: vi.fn(),
    stateRef: ref(state()), syncMetaRef: ref({ partyId: "A", cloudId: "cloud-A" }),
    changingStateRef: ref(false), hasLockRef: ref(true), lockRequiresReloadRef: ref(false),
    userIdRef: ref("alice"), changeVersionRef: ref(1), dirtySaveRef: ref(false),
    dirtyAutosaveRef: ref(false), localSaveQueueRef: ref(Promise.resolve()), autosaveIndexRef: ref(0),
    setLocalSaveError: vi.fn(), setAutosaveMetas: vi.fn(), showToast: vi.fn(),
    uploadToCloud: vi.fn(async () => ({ ok: true })), refreshCloudSaves: vi.fn(),
  };
  node = document.createElement("div"); document.body.appendChild(node);
  root = createRoot(node);
  act(() => root.render(React.createElement(Harness)));
});
afterEach(() => {
  act(() => root.unmount()); node.remove();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it("serialisiert lokale Schreibvorgänge und speichert den Snapshot vom Aufrufzeitpunkt", async () => {
  let finish;
  io.saveCurrent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = api.saveNow(env.stateRef.current);
  await Promise.resolve();
  env.stateRef.current.company.accountCents = 23456;
  const second = api.saveNow(env.stateRef.current);
  env.stateRef.current.company.accountCents = 34567;
  expect(io.saveCurrent).toHaveBeenCalledTimes(1);
  finish();
  await Promise.all([first, second]);
  expect(io.saveCurrent.mock.calls.map(call => call[1].company.accountCents)).toEqual([12345, 23456]);
  expect(io.saveCurrent.mock.calls.map(call => call[2].cloudId)).toEqual(["cloud-A", "cloud-A"]);
});

it("verwirft wartende Schreibaufträge und alte Antworten nach einem Sitzungswechsel", async () => {
  let finish;
  io.saveCurrent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const first = api.saveNow(env.stateRef.current);
  await Promise.resolve();
  const queued = api.saveNow(env.stateRef.current);
  generation++;
  env.stateRef.current = { ...state(), meta: { partyId: "B" } };
  finish();
  expect(await first).toEqual({ skipped: true });
  expect(await queued).toEqual({ skipped: true });
  expect(io.saveCurrent).toHaveBeenCalledTimes(1);
  expect(env.setLocalSaveError).not.toHaveBeenCalled();
});

it("behält neue Änderungen während eines laufenden Schreibvorgangs zum Nachspeichern", async () => {
  let finish;
  io.saveCurrent.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  env.dirtySaveRef.current = true;
  const pending = api.saveNow(env.stateRef.current);
  await Promise.resolve();
  env.changeVersionRef.current++;
  finish(); await pending;
  expect(env.dirtySaveRef.current).toBe(true);
  expect(env.dirtyAutosaveRef.current).toBe(true);
});

it("wiederholt fehlgeschlagene Autosaves und entfernt Timer und Listener beim Unmount", async () => {
  io.saveAutosave.mockRejectedValueOnce(Error("Speicher voll")).mockResolvedValue(undefined);
  env.dirtyAutosaveRef.current = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(env.autosaveIndexRef.current).toBe(0);
  expect(env.dirtyAutosaveRef.current).toBe(true);
  expect(env.setLocalSaveError).toHaveBeenCalledWith(expect.stringContaining("Automatische Sicherung fehlgeschlagen"));
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(env.autosaveIndexRef.current).toBe(1);
  expect(env.dirtyAutosaveRef.current).toBe(false);
  act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
  window.dispatchEvent(new Event("beforeunload"));
  expect(io.writeRecoverySave).not.toHaveBeenCalled();
});

it("sichert die bisherige Partie vor dem Aktivieren eines manuellen Speicherplatzes", async () => {
  const loaded = { ...state(), meta: { partyId: "B" } };
  io.loadManualSlot.mockResolvedValue(loaded);
  expect(await api.loadSlot("Ziel")).toEqual({ ok: true });
  expect(io.saveManualSlot).toHaveBeenCalledWith("alice", expect.stringContaining("Partie · Test · A"), state());
  expect(io.saveManualSlot.mock.invocationCallOrder[0]).toBeLessThan(env.activateState.mock.invocationCallOrder[0]);
  expect(env.activateState).toHaveBeenCalledWith(loaded, { userId: "alice", generation: 1 });
  expect(env.changingStateRef.current).toBe(false);
});

it("behält stabile Aktionen beim Rendern und übernimmt den neuesten Spielstand aus den Refs", async () => {
  const before = api;
  act(() => root.render(React.createElement(Harness)));
  expect(api.saveNow).toBe(before.saveNow);
  expect(api.loadSlot).toBe(before.loadSlot);
  expect(api.importGame).toBe(before.importGame);
  env.stateRef.current = { ...state(), scenario: { scenarioId: "test" } };
  await api.loadAutosaveSlot(2);
  expect(io.loadAutosave).toHaveBeenCalledWith("alice", 2, true);
});
