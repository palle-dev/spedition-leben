// Cloud-Synchronisation für FERNWERK-Spielstände.
// Verwendet die vorhandene GameState-Entity (keine zweite Cloud-Speicherung).
// Der Client ist die einzige Simulationsinstanz — die Cloud speichert nur
// bestätigte Snapshots mit Revisionsprüfung. Keine serverseitige Zeitautomatik.
//
// Befehle: list, load, create, save, delete
// Alle Operationen prüfen Eigentum über base44.auth.me() + owner_id-Vergleich.
// Der Service-Role-Zugriff umgeht RLS (create/update/delete sind RLS-gesperrt),
// die Eigentümerprüfung erfolgt manuell im Filter und im Code.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { resolveCloudArchive } from "../../shared/cloudArchive.ts";
import { isCompleteSnapshot, isWritableRevision } from "../../shared/snapshotValidation.ts";

// Extrahiert Synchron-Metadaten aus dem Spielzustand (read-only).
// Verändert state nicht — Metadaten werden in separaten Entity-Feldern gespeichert.
function extractMeta(state) {
  const s = state || {};
  const gameTime = s.gameTime || 0;
  const day = Math.floor(gameTime / 1440) + 1;
  return {
    company_name: s.company?.name || null,
    game_day: day,
    game_time_min: gameTime,
    scenario_id: s.scenario?.id || null,
    difficulty_profile: s.difficultyProfile || s.meta?.difficultyProfile || "standard",
  };
}

export default async function handleCloudSync(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const { command } = body || {};
    const S = base44.asServiceRole.entities.GameState;
    if (body?.stateId != null && (typeof body.stateId !== "string" || !body.stateId.trim())) {
      return Response.json({ error: "Ungültige stateId" }, { status: 400 });
    }
    if (command === "create" || command === "save") {
      const state = body.state;
      if (!isCompleteSnapshot(state)) {
        return Response.json({ error: "Ungültiger oder unvollständiger Spielstand" }, { status: 400 });
      }
    }

    // ---- Cloud-Spielstände auflisten ----
    if (command === "list") {
      const list = await S.filter({ owner_id: user.id }, "-cloud_saved_at", 100);
      return Response.json({
        saves: list.map(r => ({
          id: r.id,
          revision: r.revision,
          party_id: r.party_id || null,
          company_name: r.company_name || null,
          game_day: r.game_day || 0,
          game_time_min: r.game_time_min || 0,
          scenario_id: r.scenario_id || null,
          difficulty_profile: r.difficulty_profile || "standard",
          save_label: r.save_label || null,
          save_type: r.save_type || null,
          cloud_saved_at: r.cloud_saved_at || null,
          created_date: r.created_date,
          automation_enabled: r.automation_enabled || false,
        })),
      });
    }

    // ---- Spielstand laden ----
    if (command === "load") {
      const { stateId } = body;
      if (!stateId) return Response.json({ error: "stateId erforderlich" }, { status: 400 });
      const rec = await S.get(stateId);
      if (!rec || rec.owner_id !== user.id) {
        return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
      }
      return Response.json({
        archive_delta: 1,
        state: rec.state || {},
        revision: rec.revision,
        stateId: rec.id,
        party_id: rec.party_id || null,
        metadata: {
          company_name: rec.company_name || null,
          game_day: rec.game_day || 0,
          game_time_min: rec.game_time_min || 0,
          scenario_id: rec.scenario_id || null,
          difficulty_profile: rec.difficulty_profile || "standard",
          save_label: rec.save_label || null,
          save_type: rec.save_type || null,
          cloud_saved_at: rec.cloud_saved_at || null,
        },
      });
    }

    // ---- Neuen Cloud-Spielstand erstellen (neue Partie) ----
    if (command === "create") {
      const { party_id, save_label, save_type } = body;
      let state = body.state;
      try { state = resolveCloudArchive(state, null); }
      catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
      if (!state) return Response.json({ error: "state erforderlich" }, { status: 400 });
      if (typeof party_id !== "string" || !party_id || state.meta?.partyId !== party_id) {
        return Response.json({ error: "Partiekennung fehlt oder passt nicht zum Spielstand" }, { status: 400 });
      }
      // Eine wiederholte Anlage darf eine bestehende Partie nicht still ersetzen.
      const existing = await S.filter({ owner_id: user.id, party_id }, "-cloud_saved_at", 1);
      if (existing?.length) {
        return Response.json({
          error: "Diese Partie existiert bereits in der Cloud", conflict: true,
          stateId: existing[0].id, current_revision: existing[0].revision,
        }, { status: 409 });
      }
      const meta = extractMeta(state);
      const rec = await S.create({
        state,
        revision: 1,
        owner_id: user.id,
        party_id,
        ...meta,
        save_label: save_label || null,
        save_type: save_type || "new",
        cloud_saved_at: Date.now(),
        last_action_id: "create_" + Date.now(),
        last_result: { ok: true, command: "cloudSync_create" },
        automation_enabled: false,
      });
      return Response.json({ ok: true, archive_delta: 1, stateId: rec.id, revision: 1, party_id });
    }

    // ---- Spielstand mit Revisionsprüfung aktualisieren (atomar) ----
    if (command === "save") {
      const { stateId, expected_revision, save_label, save_type } = body;
      let state = body.state;
      if (!stateId || !state) return Response.json({ error: "stateId und state erforderlich" }, { status: 400 });
      if (!isWritableRevision(expected_revision)) return Response.json({ error: "Gültige expected_revision erforderlich" }, { status: 400 });

      const rec = await S.get(stateId);
      if (!rec || rec.owner_id !== user.id) {
        return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
      }
      const partyId = rec.party_id || rec.state?.meta?.partyId;
      if (partyId && state.meta?.partyId !== partyId) {
        return Response.json({
          error: "Der Spielstand gehört zu einer anderen Partie. Bitte die passende Partie neu laden.",
          code: "PARTY_MISMATCH",
        }, { status: 409 });
      }
      // Only reuse the owner's exact expected revision; never merge a stale save.
      if (rec.revision !== expected_revision) {
        return Response.json({ conflict: true, current_revision: rec.revision,
          error: "Konflikt: Cloud-Stand wurde zwischenzeitlich geändert",
          cloud_meta: { company_name: rec.company_name || null, game_day: rec.game_day || 0,
            game_time_min: rec.game_time_min || 0, scenario_id: rec.scenario_id || null,
            difficulty_profile: rec.difficulty_profile || "standard", save_label: rec.save_label || null,
            save_type: rec.save_type || null, cloud_saved_at: rec.cloud_saved_at || null },
        }, { status: 409 });
      }
      try { state = resolveCloudArchive(state, rec.state); }
      catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
      const meta = extractMeta(state);
      const newRev = expected_revision + 1;
      const updateSet = {
        state,
        revision: newRev,
        ...meta,
        cloud_saved_at: Date.now(),
        last_action_id: "save_" + Date.now(),
        last_result: { ok: true, command: "cloudSync_save" },
        automation_enabled: false,
      };
      if (state.meta?.partyId) updateSet.party_id = state.meta.partyId;
      // save_label nur überschreiben wenn explizit angegeben —
      // verhindert dass Auto-Sync den Namen eines manuellen Speicherpunkts löscht.
      if (save_label) updateSet.save_label = save_label;
      if (save_type) updateSet.save_type = save_type;

      // Atomares bedingtes Update: Filter prüft id + owner_id + revision.
      // updateMany führt die Prüfung und Schreibung in einer Operation aus —
      // keine getrennte Lese- dann Schreiboperation.
      const upd = await S.updateMany(
        { id: stateId, owner_id: user.id, revision: expected_revision, ...(rec.party_id ? { party_id: rec.party_id } : {}) },
        { $set: updateSet }
      );

      if (!upd || upd.updated !== 1) {
        // Konflikt: aktueller Cloud-Stand abrufen für Konflikt-Dialog
        const cur = await S.get(stateId);
        if (!cur || cur.owner_id !== user.id) {
          return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
        }
        return Response.json({
          error: "Konflikt: Cloud-Stand wurde zwischenzeitlich geändert",
          conflict: true,
          current_revision: cur.revision,
          cloud_meta: {
            company_name: cur.company_name || null,
            game_day: cur.game_day || 0,
            game_time_min: cur.game_time_min || 0,
            scenario_id: cur.scenario_id || null,
            difficulty_profile: cur.difficulty_profile || "standard",
            save_label: cur.save_label || null,
            save_type: cur.save_type || null,
            cloud_saved_at: cur.cloud_saved_at || null,
          },
        }, { status: 409 });
      }

      return Response.json({ ok: true, archive_delta: 1, revision: newRev, stateId });
    }

    // ---- Cloud-Spielstand löschen ----
    if (command === "delete") {
      const { stateId } = body;
      if (!stateId) return Response.json({ error: "stateId erforderlich" }, { status: 400 });
      // Eigentum prüfen vor dem Löschen
      const rec = await S.get(stateId);
      if (!rec || rec.owner_id !== user.id) {
        return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
      }
      await S.delete(stateId);
      return Response.json({ ok: true, stateId });
    }

    return Response.json({ error: "Unbekannter Befehl: " + command }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Base44 starts this file in Deno; exporting a handler alone does not open the HTTP server.
// Keep the export for contract tests, which run without the Deno runtime.
if (typeof Deno !== "undefined") {
  Deno.serve(handleCloudSync);
}