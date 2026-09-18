import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ client: null }));
vi.mock("@base44/sdk", () => ({ createClientFromRequest: () => mock.client }));
import cloud from "../base44/functions/cloudSync/entry";
import commands from "../base44/functions/gameCommand/entry";
import saveState from "../base44/functions/saveGameState/entry";
import { createInitialState } from "../base44/shared/simulationEngine";

let records, entities;
const snapshot = (partyId = "A") => {
  const state = createInitialState({ companyName: "Speichertest", playerName: "Test", partnerName: "Test" }).state;
  state.meta = { ...state.meta, partyId };
  return state;
};
const req = body => new Request("https://local.invalid/test", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  records = new Map([
    ["own", { id: "own", owner_id: "alice", revision: 3, party_id: "A", state: snapshot() }],
    ["foreign", { id: "foreign", owner_id: "bob", revision: 9, party_id: "B", state: snapshot("B") }],
  ]);
  entities = {
    get: vi.fn(async id => structuredClone(records.get(id))),
    filter: vi.fn(async query => structuredClone([...records.values()].filter(r => Object.entries(query).every(([k, v]) => r[k] === v)))),
    create: vi.fn(async data => {
      const record = structuredClone({ ...data, id: "created-" + records.size });
      records.set(record.id, record); return structuredClone(record);
    }),
    updateMany: vi.fn(async (query, op) => {
      const record = records.get(query.id);
      if (!record || !Object.entries(query).every(([key, value]) => record[key] === value)) return { updated: 0 };
      Object.assign(record, structuredClone(op.$set)); return { updated: 1 };
    }),
  };
  mock.client = { auth: { me: vi.fn(async () => ({ id: "alice" })) }, asServiceRole: { entities: { GameState: entities } } };
});
const savePaths = [
  ["cloudSync", (state, revision = 3, stateId = "own") => cloud(req({ command: "save", state, stateId, expected_revision: revision }))],
  ["saveGameState", (state, revision = 3, stateId = "own") => saveState(req({ state, stateId, expected_revision: revision }))],
  ["saveBackup", (state, revision = 3, stateId = "own") => commands(req({ command: "saveBackup", params: { state }, stateId, expected_revision: revision }))],
];

describe.each(savePaths)("%s schützt gespeicherte Partien", (_name, save) => {
  it("verwirft unvollständige Snapshots ohne den gültigen Stand zu überschreiben", async () => {
    const before = structuredClone(records.get("own"));
    const invalidStates = [undefined, null, {}, [], { gameTime: 10 }, { ...snapshot(), company: [] },
      { ...snapshot(), private: null }, { ...snapshot(), orders: {} }, { ...snapshot(), trips: {} },
      { ...snapshot(), gameTime: -1 }, { ...snapshot(), meta: { partyId: { $ne: null } } }];
    for (const state of invalidStates) expect((await save(state)).status).toBe(400);
    expect(entities.updateMany).not.toHaveBeenCalled();
    expect(records.get("own")).toEqual(before);
  });
  it("verwirft ungültige Revisionswerte vor jedem Datenbankzugriff", async () => {
    for (const revision of [null, "3", 0, -1, 1.5, Number.MAX_SAFE_INTEGER, { $gte: 0 }]) {
      expect((await save(snapshot(), revision)).status).toBe(400);
    }
    expect(entities.get).not.toHaveBeenCalled(); expect(entities.updateMany).not.toHaveBeenCalled();
  });
  it("blockiert das Überschreiben durch eine andere Partie", async () => {
    const response = await save(snapshot("B"));
    expect(response.status).toBe(409); expect((await response.json()).code).toBe("PARTY_MISMATCH");
    expect(entities.updateMany).not.toHaveBeenCalled(); expect(records.get("own").revision).toBe(3);
  });
  it("erkennt die Partiekennung auch im älteren Zustand ohne Entity-Metadaten", async () => {
    delete records.get("own").party_id;
    expect((await save(snapshot("B"))).status).toBe(409);
    expect(entities.updateMany).not.toHaveBeenCalled();
  });
  it("speichert gültige Daten mit atomarer Eigentümer-, Revisions- und Partieprüfung", async () => {
    const state = snapshot(); state.company.accountCents += 1234;
    const response = await save(state);
    expect(response.status).toBe(200); expect((await response.json()).revision).toBe(4);
    expect(entities.updateMany.mock.calls[0][0]).toEqual({ id: "own", owner_id: "alice", revision: 3, party_id: "A" });
    expect(records.get("own").state.company.accountCents).toBe(state.company.accountCents);
  });
  it("übernimmt eine Kennung beim Speichern einer bislang ungebundenen Altpartie", async () => {
    delete records.get("own").party_id; delete records.get("own").state.meta.partyId;
    expect((await save(snapshot())).status).toBe(200);
    expect(records.get("own").party_id).toBe("A");
  });
  it("bewahrt gültige ältere Spielstände ohne Partiekennung", async () => {
    delete records.get("own").party_id; delete records.get("own").state.meta.partyId;
    const oldState = snapshot(); delete oldState.meta.partyId;
    expect((await save(oldState)).status).toBe(200);
    expect(records.get("own").revision).toBe(4);
  });
  it("weist eine veraltete Revision zurück und bewahrt den aktuellen Stand", async () => {
    const before = structuredClone(records.get("own"));
    const response = await save(snapshot(), 2);
    expect(response.status).toBe(409); expect((await response.json()).current_revision).toBe(3);
    expect(records.get("own")).toEqual(before);
  });
  it("verweigert fremde Spielstände", async () => {
    expect((await save(snapshot("B"), 9, "foreign")).status).toBe(403);
    expect(entities.updateMany).not.toHaveBeenCalled();
  });
  it("verlangt Anmeldung", async () => {
    mock.client.auth.me.mockResolvedValue(null);
    expect((await save(snapshot())).status).toBe(401); expect(entities.get).not.toHaveBeenCalled();
  });
  it("gibt bei einem Konflikt keine Revision eines inzwischen fremden Datensatzes preis", async () => {
    entities.updateMany.mockImplementationOnce(async () => {
      records.get("own").owner_id = "bob"; return { updated: 0 };
    });
    const response = await save(snapshot());
    expect(response.status).toBe(403); expect(await response.json()).not.toHaveProperty("current_revision");
  });
});

describe("Backup-Wiederholungen", () => {
  it("legt ohne vollständigen Snapshot keinen leeren Backup-Datensatz an", async () => {
    for (const state of [undefined, {}, { gameTime: 0 }]) {
      expect((await commands(req({ command: "createBackup", params: { state } }))).status).toBe(400);
    }
    expect(entities.create).not.toHaveBeenCalled();
  });
  it("wiederholt die gleiche Erstellung ohne zweites Backup und verweigert geänderten Inhalt", async () => {
    const body = { command: "createBackup", action_id: "backup-1", params: { state: snapshot() } };
    const first = await commands(req(body)); const firstData = await first.json();
    const retry = await commands(req(body));
    expect(first.status).toBe(200); expect(retry.status).toBe(200);
    expect((await retry.json()).stateId).toBe(firstData.stateId);
    body.params.state.gameTime++;
    expect((await commands(req(body))).status).toBe(409);
    expect(entities.create).toHaveBeenCalledTimes(1);
    expect(records.get(firstData.stateId).party_id).toBe("A");
  });
  it("verwechselt eine bestehende newGame-ID nicht mit einer erfolgreichen Backup-Erstellung", async () => {
    await commands(req({ command: "newGame", action_id: "collision", params: {} }));
    expect((await commands(req({ command: "createBackup", action_id: "collision", params: { state: snapshot() } }))).status).toBe(409);
    expect(entities.create).toHaveBeenCalledTimes(1);
  });
  it("bestätigt die Wiederholung einer verlorenen Speicherantwort ohne erneute Änderung", async () => {
    const body = { command: "saveBackup", stateId: "own", expected_revision: 3, action_id: "save-1", params: { state: snapshot() } };
    const first = await commands(req(body)), retry = await commands(req(body));
    expect(first.status).toBe(200); expect(retry.status).toBe(200);
    expect((await retry.json()).revision).toBe(4);
    expect(entities.updateMany).toHaveBeenCalledTimes(1);
    body.expected_revision = 4; body.params.state.gameTime++;
    expect((await commands(req(body))).status).toBe(409);
    expect(entities.updateMany).toHaveBeenCalledTimes(1);
  });
  it("vergleicht bei Alt-Backups ohne Inhaltsfingerabdruck den gespeicherten Snapshot", async () => {
    const record = records.get("own");
    record.last_action_id = "old-backup"; record.last_result = { command: "createBackup", ok: true };
    record.last_command_hash = '{"command":"createBackup","params":{}}';
    const body = { command: "createBackup", action_id: "old-backup", params: { state: structuredClone(record.state) } };
    expect((await commands(req(body))).status).toBe(200);
    body.params.state.gameTime++;
    expect((await commands(req(body))).status).toBe(409); expect(entities.create).not.toHaveBeenCalled();
  });
});

describe("Eingabegrenzen der Serverbefehle", () => {
  it("nimmt keine Filterobjekte als Datensatz- oder Aktionskennung entgegen", async () => {
    expect((await cloud(req({ command: "load", stateId: { $ne: null } }))).status).toBe(400);
    expect((await saveState(req({ stateId: { $ne: null }, state: snapshot(), expected_revision: 3 }))).status).toBe(400);
    expect((await commands(req({ command: "createBackup", action_id: { $ne: null }, params: { state: snapshot() } }))).status).toBe(400);
    expect(entities.get).not.toHaveBeenCalled(); expect(entities.filter).not.toHaveBeenCalled();
  });
  it("verlangt auch für Spielbefehle eine sichere numerische Revision", async () => {
    for (const expected_revision of ["3", { $gte: 0 }, Number.MAX_SAFE_INTEGER]) {
      expect((await commands(req({ command: "advanceTime", stateId: "own", action_id: "advance", expected_revision, params: { minutes: 1 } }))).status).toBe(400);
    }
    expect(entities.get).not.toHaveBeenCalled(); expect(entities.updateMany).not.toHaveBeenCalled();
  });
});
