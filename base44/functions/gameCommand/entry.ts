// Zentraler serverseitiger Einstieg für alle Spielbefehle in "Spedition & Leben".
// Prüft Anmeldung, Eigentum und alle Spielregeln. Der Browser sendet Absichten und IDs,
// keine verbindlichen Preise/Kontostände. Atomare Konfliktbehandlung über bedingtes updateMany
// (Filter nach Spielstand-ID, Eigentümer und bisheriger Revision).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { applyCommand, createInitialState } from "../../shared/simulationEngine.ts";

function hash(obj) { return JSON.stringify(obj); }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const { stateId, action_id, expected_revision, command, params } = body || {};
    const S = base44.asServiceRole.entities.GameState;
    const SU = base44.entities.GameState; // nutzerspezifisch – stamped created_by_id automatisch

    // ---- Neues Spiel ----
    if (command === "newGame") {
      // Idempotenz: gleiche action_id liefert vorhandenes Ergebnis, kein Duplikat.
      if (action_id) {
        const existing = await S.filter({ created_by_id: user.id, last_action_id: action_id }, "-created_date", 1);
        if (existing && existing.length) {
          return Response.json({ state: existing[0].state, revision: existing[0].revision, stateId: existing[0].id, result: existing[0].last_result || { ok: true, command: "newGame" } });
        }
      }
      const init = createInitialState(params || {});
      // Nutzerbezogen anlegen, damit created_by_id korrekt gesetzt wird.
      const rec = await SU.create({
        state: init.state, revision: 1,
        last_action_id: action_id || null,
        last_result: { ok: true, command: "newGame" },
        last_command_hash: hash({ command, params })
      });
      return Response.json({ state: rec.state, revision: rec.revision, stateId: rec.id, result: { ok: true, command: "newGame" } });
    }

    // ---- Spielstände auflisten ----
    if (command === "list") {
      const list = await S.filter({ created_by_id: user.id }, "-created_date", 50);
      return Response.json({
        games: list.map(r => ({
          id: r.id, revision: r.revision, created_date: r.created_date,
          company: r.state && r.state.company ? r.state.company.name : null,
          gameTime: r.state ? r.state.gameTime : null
        }))
      });
    }

    // ---- Spielstand laden ----
    if (command === "load") {
      if (!stateId) return Response.json({ error: "stateId erforderlich" }, { status: 400 });
      const rec = await S.get(stateId);
      if (!rec || rec.created_by_id !== user.id) return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
      return Response.json({ state: rec.state, revision: rec.revision, stateId: rec.id });
    }

    // ---- Spielbefehle ----
    if (!stateId || !action_id || expected_revision === undefined) {
      return Response.json({ error: "action_id, stateId und expected_revision erforderlich" }, { status: 400 });
    }
    const rec = await S.get(stateId);
    if (!rec || rec.created_by_id !== user.id) {
      return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
    }
    const state = rec.state || {};
    const cmdHash = hash({ command, params });

    // Idempotenz: gleiche action_id + gleicher Inhalt -> vorhandenes Ergebnis.
    if (state.processedActions && state.processedActions[action_id]) {
      const entry = state.processedActions[action_id];
      if (entry.hash !== cmdHash) {
        return Response.json({ error: "Aktion mit dieser ID und anderem Inhalt bereits verarbeitet" }, { status: 409 });
      }
      return Response.json({ state, revision: rec.revision, stateId, result: entry.result, replayed: true });
    }

    // Revisionssicherung: veraltete verschiedene Aktion darf keinen neueren Zustand überschreiben.
    if (rec.revision !== expected_revision) {
      return Response.json({ error: "Veraltete Revision", conflict: true, current_revision: rec.revision }, { status: 409 });
    }

    // Regelprüfung und Zustandsänderung.
    let newState, result;
    try {
      const r = applyCommand(state, command, params || {});
      newState = r.state; result = r.result;
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    // Nachweis der verarbeiteten Aktion zusammen mit Zustand speichern.
    newState.processedActions = newState.processedActions || {};
    newState.processedActions[action_id] = { hash: cmdHash, revision: rec.revision + 1, result, ts: Date.now() };
    const keys = Object.keys(newState.processedActions);
    if (keys.length > 200) { for (let i = 0; i < keys.length - 200; i++) delete newState.processedActions[keys[i]]; }

    const newRev = rec.revision + 1;

    // Atomares bedingtes Update: nur wenn Eigentümer und bisherige Revision noch stimmen.
    const upd = await S.updateMany(
      { id: stateId, created_by_id: user.id, revision: expected_revision },
      { $set: { state: newState, revision: newRev, last_action_id: action_id, last_result: result, last_command_hash: cmdHash } }
    );

    // Erfolgsnachweis: neue Revision muss gesetzt sein.
    const check = await S.get(stateId);
    if (!check || check.revision !== newRev) {
      return Response.json({ error: "Konflikt: Zustand wurde gleichzeitig geändert", conflict: true, current_revision: check ? check.revision : 0 }, { status: 409 });
    }

    return Response.json({ state: newState, revision: newRev, stateId, result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}