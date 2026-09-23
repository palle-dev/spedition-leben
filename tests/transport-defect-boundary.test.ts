// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { mulberry32 } from "../src/lib/simulation/gameRules";

const fixture = vi.hoisted(() => ({
  initial: null as any, saved: null as any, context: null as any,
  saveNow: vi.fn(async (state) => { fixture.saved = structuredClone(state); return { ok: true }; }),
  cloud: { cloudSaves: [], cloudLoading: false, resetCloudState: vi.fn(),
    checkCloudRevision: vi.fn(async () => {}), refreshCloudSaves: vi.fn() },
}));
vi.mock("@/lib/AuthContext", () => ({ useAuth: () => ({ user: { id: "defect-test" } }) }));
vi.mock("@/lib/persistence", () => ({
  loadCurrent: async () => structuredClone(fixture.initial),
  getAllAutosaveMetas: async () => [], getSyncMeta: async () => null,
}));
vi.mock("@/lib/historyRepository", () => ({ stageHistory: async (_uid, state) => state }));
vi.mock("@/lib/saveFileClient", () => ({ processSaveFile: async (_name, state) => state, resetHistoryQueries: vi.fn() }));
vi.mock("@/lib/tabLock", () => ({ acquireLock: () => true, refreshLock: () => true, releaseLock: vi.fn(), LOCK_REFRESH: 60000 }));
vi.mock("@/lib/useLocalSaveWriter", () => ({ useLocalSaveWriter: () => ({ saveNow: fixture.saveNow }) }));
vi.mock("@/lib/useGameSaveActions", () => ({ useGameSaveActions: () => ({}) }));
vi.mock("@/lib/useCloudGameSync", () => ({ useCloudGameSync: () => fixture.cloud }));
vi.mock("@/lib/cloudSync", () => ({ generatePartyId: () => "defect-party", makeSyncMeta: partyId => ({ partyId }) }));
vi.mock("@/lib/experienceSound", () => ({ playExperienceSound: vi.fn() }));
vi.mock("@/lib/eventLogClient", () => ({ getUnseenEventCount: () => 0 }));
// Real adapter, worker protocol and client; only the browser's message channel is emulated.
// structuredClone is essential: an exception must not leak mutations back to the UI.
vi.mock("@/lib/simulationWorkerClient", async (importOriginal) => {
  const { createSimulationClient } = await importOriginal<any>();
  const { createSimulationRuntime } = await import("../src/lib/simulationWorkerRuntime");
  const { executeCommand } = await import("../src/lib/simulationAdapter");
  return { createSimulationClient: () => createSimulationClient(() => {
    const worker: any = {
      queue: Promise.resolve(), run: createSimulationRuntime(executeCommand, async s => s),
      postMessage(message) {
        const request = structuredClone(message);
        this.queue = this.queue.then(async () => {
          const response = structuredClone(await this.run(request));
          this.onmessage?.({ data: response });
        });
      },
      terminate() {},
    };
    return worker;
  }) };
});
import { GameProvider, useGame } from "../src/lib/gameContext";
let container, root;
function Capture() { fixture.context = useGame(); return null; }
const params = { orderId: "storm_night_own", vehicleId: "v1", driverId: "d1" };
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const s: any = createInitialState({ onboarding: true }).state;
  applyCommand(s, "startWorld", {});
  Object.assign(s.world.stories.harbor, { stage: 2, status: "decision", decisions: [{ stage: 0, choiceId: "help" }, { stage: 1, choiceId: "quality" }] });
  applyCommand(s, "startStormNight", { choiceId: "own" });
  let seed = 1;
  while (mulberry32(seed)() >= 0.001) seed++;
  s.rngSeed = seed;
  fixture.initial = s; fixture.saved = null; fixture.context = null; fixture.saveNow.mockClear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(React.createElement(GameProvider, {}, React.createElement(Capture))));
  expect(fixture.context.loading).toBe(false);
  expect(fixture.context.localSaveError).toBeNull();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("commits a generated defect through the worker and provider while rejecting the UI start, then permits a replacement", async () => {
  const before = structuredClone(fixture.context.state);
  const server = serverCommand(structuredClone(before), "startTransport", params);
  expect(server.result).toMatchObject({ ok: false, blockedByDisruption: true });
  await act(async () => {
    await expect(fixture.context.send("startTransport", params)).rejects.toThrow(/Technischer Defekt/);
  });
  const s = fixture.context.state;
  expect(s.disruptions.items).toHaveLength(before.disruptions.items.length + 1);
  expect(s.disruptions.items.at(-1)).toMatchObject({ type: "technical_defect", vehicleId: "v1", orderIds: ["storm_night_own"] });
  expect(s.vehicles.find(v => v.id === "v1").status).toBe("maintenance");
  expect(s.drivers.find(d => d.id === "d1").status).toBe(before.drivers.find(d => d.id === "d1").status);
  expect(s.rngSeed).not.toBe(before.rngSeed);
  expect(s.company.accountCents).toBe(before.company.accountCents);
  expect(s.accounting.journal).toEqual(before.accounting.journal);
  expect(s.trips).toEqual(before.trips);
  expect(s.orders.find(o => o.id === params.orderId).status).toBe("angenommen");
  expect(s.world.stormNight.status).toBe("running");
  expect(s.world.stormNight.results).toEqual({});
  expect(fixture.context.toast).toMatchObject({ kind: "error", msg: expect.stringContaining("Technischer Defekt") });
  expect(fixture.context.overlay?.type).not.toBe("transportStart");
  expect(fixture.initial.rngSeed).toBe(before.rngSeed);
  // Public save action must use the adopted state despite the rejected UI promise.
  await act(async () => { await fixture.context.save(); });
  expect(fixture.saved.disruptions.items).toEqual(s.disruptions.items);
  expect(fixture.saved.rngSeed).toBe(s.rngSeed);
  let started;
  await act(async () => { started = await fixture.context.send("startTransport", { ...params, vehicleId: "v2" }); });
  expect(started.fuelCents).toBeGreaterThan(0);
  expect(fixture.context.state.trips).toHaveLength(before.trips.length + 1);
  expect(fixture.context.state.disruptions.items).toHaveLength(s.disruptions.items.length);
  expect(fixture.context.state.company.accountCents).toBe(before.company.accountCents - started.fuelCents - started.tollCents);
  expect(fixture.context.overlay?.type).toBe("transportStart");
});

it("still rejects an invalid command without adopting any worker mutations", async () => {
  const before = structuredClone(fixture.context.state);
  await act(async () => {
    await expect(fixture.context.send("startTransport", { ...params, orderId: "missing" })).rejects.toThrow();
  });
  expect(fixture.context.state).toEqual(before);
  expect(fixture.context.overlay?.type).not.toBe("transportStart");
});
