import { describe, it, expect, vi, beforeEach } from 'vitest';
const mock = vi.hoisted(() => ({ client: null }));
vi.mock('@base44/sdk', () => ({ createClientFromRequest: () => mock.client }));
import cloud from '../base44/functions/cloudSync/entry';
import commands from '../base44/functions/gameCommand/entry';
import tick from '../base44/functions/processAutomationTick/entry';

const snapshot = (gameTime, meta?) => ({
  gameTime, company: {}, private: {}, vehicles: [], drivers: [], orders: [],
  ...(meta ? { meta } : {}),
});

// Diese Tests prüfen Handler-Verträge mit einem Datenbankersatz.
// Sie belegen keine produktive RLS-Konfiguration oder Datenbank-Atomarität.
let records, entities;
beforeEach(() => {
  records = new Map([
    ['own', { id: 'own', owner_id: 'alice', revision: 3, state: snapshot(41135) }],
    ['foreign', { id: 'foreign', owner_id: 'bob', revision: 3, state: { secret: 'unrelated' } }],
  ]);
  entities = {
    get: vi.fn(async id => records.get(id)),
    filter: vi.fn(async query => [...records.values()].filter(r => Object.entries(query).every(([k, v]) => r[k] === v))),
    create: vi.fn(async data => { const r = { ...data, id: 'created-' + records.size }; records.set(r.id, r); return r; }),
    delete: vi.fn(async id => records.delete(id)),
    updateMany: vi.fn(async (query, op) => {
      const r = records.get(query.id);
      if (!r || !Object.entries(query).every(([key, value]) => r[key] === value)) return { updated: 0 };
      Object.assign(r, op.$set); return { updated: 1 };
    }),
  };
  mock.client = { auth: { me: vi.fn(async () => ({ id: 'alice' })) }, asServiceRole: { entities: { GameState: entities } } };
});
const req = body => new Request('https://local.invalid/test', { method: 'POST', body: JSON.stringify(body) });

describe('Cloud-Handler-Verträge', () => {
  it.each([null, { id: 'alice', role: 'user' }])('globale Zeitautomatik benötigt einen belegten Admin', async user => {
    mock.client.auth.me.mockResolvedValue(user);
    expect((await tick(req({}))).status).toBe(403);
    expect(entities.filter).not.toHaveBeenCalled();
  });
  it('Anmeldung ist für jede Cloud-Aktion erforderlich', async () => {
    mock.client.auth.me.mockResolvedValue(null);
    for (const command of ['list', 'load', 'create', 'save', 'delete']) expect((await cloud(req({ command }))).status).toBe(401);
    expect(entities.create).not.toHaveBeenCalled();
  });
  it('Listen enthalten ausschließlich eigene Spielstände', async () => {
    const response = await cloud(req({ command: 'list' }));
    expect((await response.json()).saves.map(s => s.id)).toEqual(['own']);
  });
  it.each(['load', 'save', 'delete'])('Fremder Spielstand bleibt für %s gesperrt', async command => {
    const response = await cloud(req({ command, stateId: 'foreign', expected_revision: 3, state: snapshot(5) }));
    expect(response.status).toBe(403);
    expect(records.get('foreign').state.secret).toBe('unrelated');
    expect(entities.delete).not.toHaveBeenCalled();
  });
  it('veraltete Revision meldet 409 und verändert den Zustand nicht', async () => {
    const response = await cloud(req({ command: 'save', stateId: 'own', expected_revision: 2, state: snapshot(100) }));
    expect(response.status).toBe(409);
    expect((await response.json()).current_revision).toBe(3);
    expect(records.get('own').state.gameTime).toBe(41135);
  });
  it('Speichern filtert auf Eigentümer und Revision und zeigt denselben Spieltag', async () => {
    const response = await cloud(req({ command: 'save', stateId: 'own', expected_revision: 3, state: snapshot(41135) }));
    expect(response.status).toBe(200);
    expect(entities.updateMany.mock.calls[0][0]).toEqual({ id: 'own', owner_id: 'alice', revision: 3 });
    expect(records.get('own').revision).toBe(4); expect(records.get('own').game_day).toBe(29);
  });
  it.each([null, '3', -1, 1.5])('ungültige Revision %s wird vor dem Schreiben abgewiesen', async revision => {
    const response = await cloud(req({ command: 'save', stateId: 'own', expected_revision: revision, state: snapshot(100) }));
    expect(response.status).toBe(400); expect(entities.updateMany).not.toHaveBeenCalled();
  });
  it('gleiche newGame-Aktion erzeugt bei sequenzieller Wiederholung kein Duplikat', async () => {
    const body = { command: 'newGame', action_id: 'same-action', params: { companyName: 'Test' } };
    const a = await commands(req(body)), b = await commands(req(body));
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect((await a.json()).stateId).toBe((await b.json()).stateId);
    expect(entities.create).toHaveBeenCalledTimes(1);
  });
  it('dieselbe newGame-ID mit anderem Inhalt wird als Konflikt abgewiesen', async () => {
    await commands(req({ command: 'newGame', action_id: 'same-action', params: { companyName: 'A' } }));
    const response = await commands(req({ command: 'newGame', action_id: 'same-action', params: { companyName: 'B' } }));
    expect(response.status).toBe(409);
  });
});

describe("Cloud-Partiebindung", () => {
  it("verhindert das Überschreiben mit dem Snapshot einer anderen Partie", async () => {
    records.get("own").party_id = "A";
    records.get("own").state.meta = { partyId: "A" };
    const response = await cloud(req({ command: "save", stateId: "own", expected_revision: 3, state: snapshot(100, { partyId: "B" }) }));
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("PARTY_MISMATCH");
    expect(entities.updateMany).not.toHaveBeenCalled();
    expect(records.get("own").state.gameTime).toBe(41135);
  });
  it("bindet das atomare Update zusätzlich an die Partiekennung", async () => {
    records.get("own").party_id = "A";
    const response = await cloud(req({ command: "save", stateId: "own", expected_revision: 3, state: snapshot(100, { partyId: "A" }) }));
    expect(response.status).toBe(200);
    expect(entities.updateMany.mock.calls[0][0].party_id).toBe("A");
  });
  it("ein verlorenes create-Ergebnis führt beim Wiederholen zum vorhandenen Cloud-Ziel", async () => {
    const payload = { command: "create", party_id: "A", state: snapshot(100, { partyId: "A" }) };
    const first = await cloud(req(payload));
    const firstBody = await first.json();
    const repeated = await cloud(req(payload));
    expect(first.status).toBe(200);
    expect(repeated.status).toBe(409);
    expect((await repeated.json()).stateId).toBe(firstBody.stateId);
    expect(entities.create).toHaveBeenCalledTimes(1);
  });
  it.each([null, [], "state", { gameTime: -1 }])("weist fehlerhafte Snapshots ab", async state => {
    const response = await cloud(req({ command: "create", party_id: "A", state }));
    expect(response.status).toBe(400);
    expect(entities.create).not.toHaveBeenCalled();
  });
});