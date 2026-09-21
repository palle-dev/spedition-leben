// Speichert einen clientseitig berechneten Spielstand atomar in die Datenbank.
// Der Client wendet Befehle lokal an (Echtzeit-Anzeige) und persistiert bei Bedarf
// über diese Funktion. Konfliktbehandlung über bedingtes updateMany (Revisionssicherung).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { isCompleteSnapshot, isWritableRevision } from "../../shared/snapshotValidation.ts";
import { migrateState } from "../../shared/progressEngine.ts";
import { stageState } from "../../shared/cloudArchiveStore.ts";

export default async function handleSaveGameState(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const { stateId, state, expected_revision } = body || {};
    if (typeof stateId !== "string" || !stateId.trim()) return Response.json({ error: "stateId erforderlich" }, { status: 400 });
    if (!isCompleteSnapshot(state)) return Response.json({ error: "Ungültiger oder unvollständiger Spielstand" }, { status: 400 });
    if (!isWritableRevision(expected_revision)) return Response.json({ error: "Gültige expected_revision erforderlich" }, { status: 400 });

    const S = base44.asServiceRole.entities.GameState;
    const storage = {
      uploadPrivateFile: (args: any) => base44.asServiceRole.integrations.Core.UploadPrivateFile(args),
    };
    const rec = await S.get(stateId);
    if (!rec || rec.owner_id !== user.id) return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
    const partyId = rec.party_id || rec.state?.meta?.partyId;
    if (partyId && state.meta?.partyId !== partyId) {
      return Response.json({ error: "Der Spielstand gehört zu einer anderen Partie.", code: "PARTY_MISMATCH" }, { status: 409 });
    }
    const migrated = migrateState(state);
    const newRev = expected_revision + 1;
    const stateRef = await stageState(storage, migrated);
    const updateSet = {
      state: stateRef,
      revision: newRev,
      ...(migrated.meta?.partyId ? { party_id: migrated.meta.partyId } : {}),
      last_action_id: "save_" + Date.now(),
      last_result: { ok: true, command: "save" },
      automation_enabled: !!migrated.timeControl?.enabled,
    };

    // Der Lesezugriff prüft die Partie; das bedingte Update prüft Eigentümer,
    // Revision und vorhandene Partiekennung erneut in derselben Schreiboperation.
    const upd = await S.updateMany(
      { id: stateId, owner_id: user.id, revision: expected_revision, ...(rec.party_id ? { party_id: rec.party_id } : {}) },
      { $set: updateSet }
    );

    if (!upd || upd.updated !== 1) {
      const cur = await S.get(stateId);
      if (!cur || cur.owner_id !== user.id) {
        return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
      }
      return Response.json({ error: "Konflikt: Zustand wurde gleichzeitig geändert", conflict: true, current_revision: cur.revision }, { status: 409 });
    }

    return Response.json({ ok: true, revision: newRev, stateId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Register the HTTP entrypoint in Base44; keep the export for contract tests.
if (typeof Deno !== "undefined") {
  Deno.serve(handleSaveGameState);
}