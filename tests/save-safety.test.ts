import { cloneSaveSnapshot } from "@/lib/simulationTransport";
import { summarizeRoutineToasts, CRITICAL_EVENT_TYPES } from "@/lib/eventNotifications";

import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import ts from "typescript";
import vm from "node:vm";
import { withCloudRetry, CloudSyncQueue, saveCloudSave } from "@/lib/cloudSync";
import { localSaveKey, readRecoverySave, writeRecoverySave, prepareLoadedState } from "@/lib/saveSafety";

const sdk = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/api/base44Client", () => ({ base44: { functions: { invoke: sdk.invoke } } }));
const sources = ["src/lib/gameContext.jsx", "src/lib/useLocalSaveWriter.js", "src/lib/useGameSaveActions.js", "src/lib/useCloudGameSync.js"]
  .map(path => ts.createSourceFile(path, fs.readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX));
// Führt die tatsächlichen Provider- und Speicher-Callbacks mit kontrollierten IO-Grenzen aus.
function callback(name, deps) {
  deps = { cloneSaveSnapshot, ...deps };
  let expression;
  for (const ast of sources) {
    function visit(n) {
      if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name &&
          ts.isCallExpression(n.initializer) && n.initializer.expression.getText(ast) === "useCallback") {
        expression = n.initializer.arguments[0].getText(ast);
      }
      ts.forEachChild(n, visit);
    }
    visit(ast);
  }
  if (!expression) throw Error("Callback fehlt: " + name);
  return Function(...Object.keys(deps), "return (" + expression + ")")(...Object.values(deps));
}
const ref = current => ({ current });
const noop = () => {};
const valid = (party = "A", gameTime = 480) => ({
  gameTime, company: { name: party }, private: {}, vehicles: [], drivers: [], orders: [],
  appointments: [], events: [], achievements: [], meta: { partyId: party },
});
let storage;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  });
  sdk.invoke.mockReset();
});

describe("Benutzertrennung und Import", () => {
  it("lädt weder den alten gemeinsamen Schlüssel noch den Speicher eines anderen Nutzers", () => {
    storage.set("spedition_leben_state", JSON.stringify(valid("legacy")));
    writeRecoverySave("alice", valid("alice"));
    expect(readRecoverySave("bob")).toBeNull();
    expect(readRecoverySave("alice").state.meta.partyId).toBe("alice");
  });
  it("verwirft eine falsch zugeordnete Sicherheitskopie", () => {
    storage.set(localSaveKey("bob"), JSON.stringify({ userId: "alice", state: valid() }));
    expect(readRecoverySave("bob")).toBeNull();
    expect(() => writeRecoverySave(null, valid())).toThrow();
  });
  it("lehnt ungültige Zustände ab, ohne vorhandene Daten zu verändern", () => {
    for (const bad of [null, [], {}, { ...valid(), orders: {} }, { ...valid(), gameTime: NaN }]) {
      expect(() => prepareLoadedState(bad)).toThrow();
    }
  });
  it("friert geladene Spielzeit ein und verändert die Quelle nicht", () => {
    const input = { ...valid(), timeControl: { enabled: true, processedGameMinute: 100 } };
    const output = prepareLoadedState(input);
    expect(output.timeControl.enabled).toBe(false);
    expect(output.timeControl.processedGameMinute).toBe(480);
    expect(input.timeControl.enabled).toBe(true);
  });
});

function uploader({ cloudId = "cloud-A", revision = 1, save, create } = {}) {
  let generation = 0, writable = true;
  const state = valid();
  const meta = ref({ partyId: "A", cloudId, localBaseRevision: revision, status: "idle" });
  const stateRef = ref(state);
  const env = {
    sessionToken: () => ({ userId: "alice", generation }),
    isCurrentSession: token => token.generation === generation,
    changingStateRef: ref(false), stateRef,
    syncMetaRef: meta,
    hasLockRef: ref(true), lockRequiresReloadRef: ref(false),
    withCloudRetry: (task, options) => withCloudRetry(task, {...options, wait: async () => {}}),
    cloudSyncQueueRef: ref(new CloudSyncQueue()),
    assertWritable: () => { if (!writable) throw Error("Sperre verloren"); },
    changeVersionRef: ref(1), cloudDirtyRef: ref(true),
    updateSyncMeta: value => { meta.current = { ...meta.current, ...value }; },
    navigator: { onLine: true },
    saveCloudSave: save || vi.fn(async () => ({ revision: 2, stateId: "cloud-A" })),
    createCloudSave: create || vi.fn(async () => ({ revision: 1, stateId: "cloud-A" })),
    loadCloudSave: vi.fn(async () => ({ revision: 7 })),
  };
  return {
    upload: callback("uploadToCloud", env), env, meta, state,
    switchParty: () => { generation++; stateRef.current = valid("B"); meta.current = { partyId: "B", cloudId: "cloud-B", localBaseRevision: 5 }; },
    loseLock: () => { writable = false; },
  };
}

describe("Cloud-Synchronisation", () => {
  it("übersetzt Axios-409 in den Konfliktvertrag", async () => {
    sdk.invoke.mockRejectedValue({ response: { status: 409, data: { conflict: true, current_revision: 2 } } });
    expect(await saveCloudSave("id", valid(), 1)).toEqual({ conflict: true, current_revision: 2 });
  });
  it("übersetzt auch Base44Error-409 und erhält andere Fehlermeldungen", async () => {
    sdk.invoke.mockRejectedValue({ status: 409, data: { conflict: true } });
    expect((await saveCloudSave("id", valid(), 1)).conflict).toBe(true);
    sdk.invoke.mockRejectedValue({ response: { status: 500, data: { error: "Speicher nicht erreichbar" } } });
    await expect(saveCloudSave("id", valid(), 1)).rejects.toThrow("Speicher nicht erreichbar");
  });
  it("serialisiert Uploads einschließlich der bestätigten Revisionsübernahme", async () => {
    let revision = 1;
    const save = vi.fn(async (id, state, expected) => {
      await Promise.resolve();
      expect(expected).toBe(revision);
      return { revision: ++revision, stateId: id };
    });
    const h = uploader({ save });
    const result = await Promise.all([h.upload(h.state), h.upload(h.state)]);
    expect(result.every(r => r.ok)).toBe(true);
    expect(save.mock.calls.map(call => call[2])).toEqual([1, 2]);
    expect(h.meta.current.localBaseRevision).toBe(3);
  });
  it("legt bei zwei ersten Uploads nur einmal an", async () => {
    const h = uploader({ cloudId: null, revision: 0 });
    await Promise.all([h.upload(h.state), h.upload(h.state)]);
    expect(h.env.createCloudSave).toHaveBeenCalledTimes(1);
    expect(h.env.saveCloudSave).toHaveBeenCalledTimes(1);
  });
  it("verwirft Antworten und wartende Uploads nach einem Partiewechsel", async () => {
    let finish;
    const save = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const h = uploader({ save });
    const first = h.upload(h.state), queued = h.upload(h.state);
    h.switchParty();
    finish({ revision: 2, stateId: "cloud-A" });
    expect((await first).skipped).toBe(true);
    expect((await queued).skipped).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(h.meta.current.partyId).toBe("B");
    expect(h.meta.current.cloudId).toBe("cloud-B");
  });
  it("zeigt Konflikte und versucht sie nicht automatisch erneut zu überschreiben", async () => {
    const save = vi.fn(async () => ({ conflict: true, current_revision: 8, error: "Konflikt" }));
    const h = uploader({ save });
    expect((await h.upload(h.state)).conflict).toBe(true);
    expect(h.meta.current.status).toBe("conflict");
    await h.upload(h.state);
    expect(save).toHaveBeenCalledTimes(1);
    expect(h.env.cloudDirtyRef.current).toBe(true);
  });
  it("verwendet bei bewusster Konfliktauflösung die aktuelle Cloud-Revision", async () => {
    const save = vi.fn(async () => ({ revision: 8, stateId: "cloud-A" }));
    const h = uploader({ save });
    h.meta.current.status = "conflict";
    expect((await h.upload(h.state, null, "manual", { resolveConflict: true })).ok).toBe(true);
    expect(save.mock.calls[0][2]).toBe(7);
  });
  it("schreibt mit verlorener Tab-Sperre nicht in die Cloud", async () => {
    const h = uploader();
    h.loseLock();
    expect((await h.upload(h.state)).ok).toBe(false);
    expect(h.env.saveCloudSave).not.toHaveBeenCalled();
  });
  it("behält die Änderungsmarkierung bei Netzwerkfehlern und neuen Änderungen", async () => {
    const h = uploader({ save: async () => { throw Error("Network Error"); } });
    await h.upload(h.state);
    expect(h.env.cloudDirtyRef.current).toBe(true);
    let finish;
    const h2 = uploader({ save: () => new Promise(resolve => { finish = resolve; }) });
    const upload = h2.upload(h2.state);
    h2.env.changeVersionRef.current++;
    finish({ revision: 2, stateId: "cloud-A" });
    await upload;
    expect(h2.env.cloudDirtyRef.current).toBe(true);
  });
});

describe("Ladepfade und Ereignisse", () => {
  it("bündelt neue Routineereignisse genau einmal und spielt nur einen Hinweis", () => {
    let toasts = [];
    const sound = vi.fn();
    const env = {
      playExperienceSound: sound, summarizeRoutineToasts, CRITICAL_EVENT_TYPES,
      isInitialLoadRef: ref(false), seenEventIdsRef: ref(new Set()), lastEventSeqRef: ref(0),
      eventToToast: e => e, setToasts: update => { toasts = update(toasts); },
      setUnseenCount: noop, getUnseenEventCount: () => 3,
    };
    const process = callback("processNewEvents", env);
    const state = { events: [1, 2, 3].map(seq => ({ seq, id: String(seq), type: "delivery_completed" })) };
    process(state); process(state);
    expect(toasts).toHaveLength(1);
    expect(JSON.stringify(toasts[0])).toContain("3× Lieferung");
    expect(sound).toHaveBeenCalledTimes(1);
    expect(env.lastEventSeqRef.current).toBe(3);
    expect([...env.seenEventIdsRef.current].sort()).toEqual(["1","2","3"]);
  });
  it("Autosaves verwenden denselben sicheren Aktivierungsweg wie manuelle Slots", async () => {
    const activateState = vi.fn(async () => ({ ok: true }));
    const token = { userId: "alice" }, state = valid("A");
    const load = callback("loadAutosaveSlot", {
      beginStateChange: () => token, stateRef: ref(valid("B")),
      loadAutosave: async () => state, activateState, isCurrentSession: () => true,
      changingStateRef: ref(true),
    });
    await load(0);
    expect(activateState).toHaveBeenCalledWith(state, token);
  });
  it("aktiviert eine andere Partie ohne die Cloud-ID der vorherigen Partie", async () => {
    const meta = ref({ partyId: "B", cloudId: "cloud-B" });
    const current = ref(valid("B"));
    let loadedStateVersion = 0;
    const env = {
      stageHistory: async (_userId, s) => s, processSaveFile: async (_command, raw) => prepareLoadedState(raw), ensurePartyId: noop,
      getSyncMeta: async () => ({ partyId: "B", cloudId: "cloud-B" }),
      isCurrentSession: () => true,
      makeSyncMeta: (partyId, cloudId, localBaseRevision, status) => ({ partyId, cloudId, localBaseRevision, status }),
      syncMetaRef: meta,
    hasLockRef: ref(true), lockRequiresReloadRef: ref(false),
    withCloudRetry: (task, options) => withCloudRetry(task, {...options, wait: async () => {}}), stateRef: current,
      setSyncMeta: noop, setState: noop, setLoadedStateVersion: update => { loadedStateVersion = update(loadedStateVersion); }, setShowStart: noop, changingStateRef: ref(true),
      setAutomationEnabled: noop, userWantsAutomationRef: ref(false),
      lastSyncGameTimeRef: ref(0), lastSyncRealMsRef: ref(0), isInitialLoadRef: ref(false),
      seenEventIdsRef: ref(new Set()), lastEventSeqRef: ref(4), setToasts: noop, setOverlay: noop,
      setBackgroundAdvance: noop, pendingAchievementsRef: ref([]), prevAchievementsRef: ref(new Set()),
      processNewEvents: noop, changeVersionRef: ref(0), dirtySaveRef: ref(false), cloudDirtyRef: ref(false),
      hasLockRef: ref(true), lockRequiresReloadRef: ref(false), saveNow: async () => ({ ok: true }),
      getAllAutosaveMetas: async () => [], setAutosaveMetas: noop,
    };
    await callback("activateState", env)(valid("A"), { userId: "alice" });
    expect(meta.current.partyId).toBe("A");
    expect(meta.current.cloudId).toBeNull();
    expect(loadedStateVersion).toBe(1);
    await callback("activateState", env)(valid("A"), { userId: "alice" });
    expect(loadedStateVersion).toBe(2);
    env.isCurrentSession = () => false;
    await callback("activateState", env)(valid("A"), { userId: "alice" });
    expect(loadedStateVersion).toBe(2);
    expect(env.isInitialLoadRef.current).toBe(true);
    expect(env.lastEventSeqRef.current).toBe(0);
  });
  it("zeigt Totalausfälle beider lokaler Speicher an und behält die Änderungsmarkierung", async () => {
    let message;
    const env = {
      sessionToken: () => ({ userId: "alice" }), isCurrentSession: () => true,
      changeVersionRef: ref(1), changingStateRef: ref(false), stateRef: ref(valid()),
      syncMetaRef: ref(null), assertWritable: noop,
      writeRecoverySave: () => { throw Error("QuotaExceededError"); },
      saveCurrent: async () => { throw Error("QuotaExceededError"); },
      dirtySaveRef: ref(true), dirtyAutosaveRef: ref(false), setLocalSaveError: text => { message = text; },
      localSaveQueueRef: ref(Promise.resolve()),
    };
    const result = await callback("saveNow", env)(valid());
    expect(result.ok).toBe(false);
    expect(message).toContain("nicht lokal gespeichert");
    expect(env.dirtySaveRef.current).toBe(true);
  });
});

describe("Service Worker", () => {
  function worker() {
    const handlers = {}, respondWith = vi.fn(), fetch = vi.fn();
    vm.runInNewContext(fs.readFileSync("public/sw.js", "utf8"), {
      URL, Response, self: { location: { origin: "https://game.test" }, addEventListener: (name, cb) => { handlers[name] = cb; } },
      caches: {}, fetch,
    });
    return { request(path, headers = {}, mode = "cors") {
      handlers.fetch({ request: { method: "GET", url: "https://game.test" + path, headers: new Headers(headers), mode }, respondWith });
    }, respondWith };
  }
  it.each(["/api/users/me", "/api/apps/id/entities/GameState", "/login", "/reset-password", "/?access_token=secret", "/?code=secret"])("übernimmt %s nicht in den Cache", path => {
    const h = worker(); h.request(path, {}, "navigate"); expect(h.respondWith).not.toHaveBeenCalled();
  });
  it("nimmt selbst Asset-Anfragen mit Authorization aus", () => {
    const h = worker(); h.request("/assets/app.js", { Authorization: "Bearer test" });
    expect(h.respondWith).not.toHaveBeenCalled();
  });
});

it("ein abgelehnter Dateiimport pausiert und ersetzt die laufende Partie nicht", async () => {
 const beginStateChange=vi.fn(),activateState=vi.fn(),preserveCurrentParty=vi.fn();
 const result=await callback("importGame",{
  sessionToken:()=>({userId:"alice",generation:1}),processSaveFile:async()=>{throw Error("Archiv beschädigt");},
  isCurrentSession:()=>true,beginStateChange,activateState,preserveCurrentParty,changingStateRef:ref(false),
 })(new Blob(["invalid"]));
 expect(result).toEqual({ok:false,error:"Archiv beschädigt"});
 expect(beginStateChange).not.toHaveBeenCalled();expect(activateState).not.toHaveBeenCalled();expect(preserveCurrentParty).not.toHaveBeenCalled();
});
