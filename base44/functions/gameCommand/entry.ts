// Zentraler serverseitiger Einstieg für alle Spielbefehle in "Spedition & Leben".
// Prüft Anmeldung, Eigentum und alle Spielregeln. Der Browser sendet Absichten und IDs,
// keine verbindlichen Preise/Kontostände. Atomare Konfliktbehandlung über bedingtes updateMany
// (Filter nach Spielstand-ID, Eigentümer und bisheriger Revision).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { applyCommand, createInitialState } from "../../shared/simulationEngine.ts";
import { migrateState } from "../../shared/progressEngine.ts";

// Stabilisierter Hash: sortiert JSON-Schlüssel rekursiv, sodass die
// Einfügereihenfolge der Schlüssel das Ergebnis nicht beeinflusst.
// params fehlt und params:{} sind gleichbedeutend (beide werden vor dem Hash zu {}).
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(k => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}
function hash(obj) { return stableStringify(obj); }

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const { stateId, action_id, expected_revision, command, params } = body || {};
    const S = base44.asServiceRole.entities.GameState; // Service-Rolle umgeht RLS; Eigentümerprüfung erfolgt manuell.

    // ---- Neues Spiel ----
    if (command === "newGame") {
      // Idempotenz: gleiche action_id liefert vorhandenes Ergebnis, kein Duplikat.
      if (action_id) {
        const existing = await S.filter({ owner_id: user.id, last_action_id: action_id }, "-created_date", 1);
        if (existing && existing.length) {
          if (existing[0].last_command_hash !== hash({ command, params: params || {} })) {
            return Response.json({ error: "Aktion mit dieser ID und anderem Inhalt bereits verarbeitet" }, { status: 409 });
          }
          return Response.json({ state: existing[0].state, revision: existing[0].revision, stateId: existing[0].id, result: existing[0].last_result || { ok: true, command: "newGame" } });
        }
      }
      const init = createInitialState(params || {});
      // Service-Rolle legt an (RLS sperrt direkte Client-Schreibzugriffe).
      // Eigentümer wird explizit auf den angemeldeten Nutzer gesetzt.
      const rec = await S.create({
        state: init.state, revision: 1, owner_id: user.id,
        last_action_id: action_id || null,
        last_result: { ok: true, command: "newGame" },
        last_command_hash: hash({ command, params: params || {} })
      });
      return Response.json({ state: rec.state, revision: rec.revision, stateId: rec.id, result: { ok: true, command: "newGame" } });
    }

    // ---- Spielstände auflisten ----
    if (command === "list") {
      const list = await S.filter({ owner_id: user.id }, "-created_date", 50);
      return Response.json({
        games: list.map(r => ({
          id: r.id, revision: r.revision, created_date: r.created_date,
          company: r.state && r.state.company ? r.state.company.name : null,
          gameTime: r.state ? r.state.gameTime : null,
          automationEnabled: r.automation_enabled || false,
          timeControl: r.state?.timeControl || null,
        }))
      });
    }

    // ---- Spielstand laden ----
    if (command === "load") {
      if (!stateId) return Response.json({ error: "stateId erforderlich" }, { status: 400 });
      const rec = await S.get(stateId);
      if (!rec || rec.owner_id !== user.id) return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
      return Response.json({ state: migrateState(rec.state || {}), revision: rec.revision, stateId: rec.id });
    }

    // ---- Backup erstellen (Hybrid-Modell: Client erstellt State, Server speichert Kopie) ----
    if (command === "createBackup") {
      if (action_id) {
        const existing = await S.filter({ owner_id: user.id, last_action_id: action_id }, "-created_date", 1);
        if (existing && existing.length) {
          return Response.json({ stateId: existing[0].id, revision: existing[0].revision });
        }
      }
      const backupState = params?.state || {};
      const rec = await S.create({
        state: backupState, revision: 1, owner_id: user.id,
        last_action_id: action_id || null,
        last_result: { ok: true, command: "createBackup" },
        last_command_hash: hash({ command, params: {} }),
        automation_enabled: false, // Hybrid-Modell: Client steuert die Zeit
      });
      return Response.json({ stateId: rec.id, revision: 1 });
    }

    // ---- Backup aktualisieren (Hybrid-Modell: Client speichert periodisch) ----
    if (command === "saveBackup") {
      if (!stateId) return Response.json({ error: "stateId erforderlich" }, { status: 400 });
      if (expected_revision === undefined) return Response.json({ error: "expected_revision erforderlich" }, { status: 400 });
      const rec = await S.get(stateId);
      if (!rec || rec.owner_id !== user.id) return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
      const backupState = params?.state || {};
      const newRev = expected_revision + 1;
      const upd = await S.updateMany(
        { id: stateId, owner_id: user.id, revision: expected_revision },
        { $set: {
          state: backupState, revision: newRev,
          last_action_id: action_id || ("save_" + Date.now()),
          last_result: { ok: true, command: "saveBackup" },
          last_command_hash: hash({ command, params: {} }),
          automation_enabled: false, // Hybrid-Modell: Client steuert die Zeit
        }}
      );
      if (!upd || upd.updated !== 1) {
        const cur = await S.get(stateId);
        return Response.json({ error: "Konflikt: Zustand wurde gleichzeitig geändert", conflict: true, current_revision: cur ? cur.revision : 0 }, { status: 409 });
      }
      return Response.json({ ok: true, revision: newRev, stateId });
    }

    // ---- Spielbefehle ----
    if (!stateId || !action_id || expected_revision === undefined) {
      return Response.json({ error: "action_id, stateId und expected_revision erforderlich" }, { status: 400 });
    }
    const rec = await S.get(stateId);
    if (!rec || rec.owner_id !== user.id) {
      return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
    }
    const state = rec.state || {};
    const cmdHash = hash({ command, params: params || {} });

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

    // Spielzeit vor der Ausführung sichern, um echten Zeitfortschritt zu erkennen.
    const oldGameTime = state.gameTime || 0;
    const oldProcessedMin = state.timeControl?.processedGameMinute || 0;

    // Regelprüfung und Zustandsänderung.
    // serverNowMs für Zeitautomatik-Befehle ergänzen (serverseitige Zeitautorität).
    const isTimeCommand = ["enableAutomation", "pauseAutomation", "syncAutomation", "getAutomationStatus"].includes(command);
    const paramsWithTime = isTimeCommand ? { ...(params || {}), serverNowMs: Date.now() } : (params || {});
    let newState, result;
    try {
      const r = applyCommand(state, command, paramsWithTime);
      newState = r.state; result = r.result;
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    // Idle-Erkennung: nur überspringen, wenn KEINE Spielzeit vergangen ist
    // (processedGameMinute unverändert und keine Ereignisse). Wenn Zeit vergangen
    // ist, MUSS gespeichert werden, sonst springt die Zeit bei der nächsten
    // Aktion zurück, weil der alte Zustand ohne Zeitfortschritt geladen wird.
    const newProcessedMin = newState.timeControl?.processedGameMinute || 0;
    const timeAdvanced = newProcessedMin !== oldProcessedMin || (newState.gameTime || 0) !== oldGameTime;
    if (command === "syncAutomation" && !timeAdvanced && (!result.events || result.events.length === 0)) {
      return Response.json({ state: newState, revision: rec.revision, stateId, result, idle: true });
    }

    // Nachweis der verarbeiteten Aktion zusammen mit Zustand speichern.
    // Performance: events-Array aus dem Result entfernen – Ereignisse liegen
    // bereits dauerhaft in state.events. Verhindert Speicherblähung bei
    // advanceTime/syncAutomation mit hunderten Log-Einträgen pro Aktion.
    newState.processedActions = newState.processedActions || {};
    const storedResult = (result && Array.isArray(result.events) && result.events.length > 0)
      ? { ...result, events: [] }
      : result;
    newState.processedActions[action_id] = { hash: cmdHash, revision: rec.revision + 1, result: storedResult, ts: Date.now() };
    const keys = Object.keys(newState.processedActions);
    if (keys.length > 100) { for (let i = 0; i < keys.length - 100; i++) delete newState.processedActions[keys[i]]; }

    const newRev = rec.revision + 1;

    // Atomares bedingtes Update: nur wenn Eigentümer und bisherige Revision noch stimmen.
    const updateSet = { state: newState, revision: newRev, last_action_id: action_id, last_result: result, last_command_hash: cmdHash };
    // automation_enabled-Feld für Filterung durch Hintergrunddienst setzen.
    if (command === "enableAutomation") updateSet.automation_enabled = true;
    else if (command === "pauseAutomation") updateSet.automation_enabled = false;
    const upd = await S.updateMany(
      { id: stateId, owner_id: user.id, revision: expected_revision },
      { $set: updateSet }
    );

    // Erfolgsnachweis: updateMany gibt die Anzahl geschriebener Dokumente zurück.
    // Bei 0 Treffern wurde der Zustand gleichzeitig von einer anderen Aktion geändert
    // – nur dann ist ein erneuter Lesezugriff nötig, um die aktuelle Revision zu melden.
    if (!upd || upd.updated !== 1) {
      const cur = await S.get(stateId);
      return Response.json({ error: "Konflikt: Zustand wurde gleichzeitig geändert", conflict: true, current_revision: cur ? cur.revision : 0 }, { status: 409 });
    }

    return Response.json({ state: newState, revision: newRev, stateId, result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
