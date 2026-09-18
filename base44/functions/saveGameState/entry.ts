// Speichert einen clientseitig berechneten Spielstand atomar in die Datenbank.
// Der Client wendet Befehle lokal an (Echtzeit-Anzeige) und persistiert bei Bedarf
// über diese Funktion. Konfliktbehandlung über bedingtes updateMany (Revisionssicherung).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { migrateState } from "../../shared/progressEngine.ts";

export default async function handleSaveGameState(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const { stateId, state, expected_revision } = body || {};
    if (!stateId || !state) return Response.json({ error: "stateId und state erforderlich" }, { status: 400 });
    if (expected_revision === undefined) return Response.json({ error: "expected_revision erforderlich" }, { status: 400 });

    const S = base44.asServiceRole.entities.GameState;
    const migrated = migrateState(state);
    const newRev = expected_revision + 1;
    const updateSet = {
      state: migrated,
      revision: newRev,
      last_action_id: "save_" + Date.now(),
      last_result: { ok: true, command: "save" },
      automation_enabled: !!migrated.timeControl?.enabled,
    };

    // Atomares Update ohne vorherigen Lesezugriff – der Filter
    // (id + owner_id + revision) stellt sicher, dass nur der berechtigte
    // Nutzer mit der richtigen Revision schreibt. Bei 0 Treffern (Konflikt)
    // ist ein Lesezugriff nötig, um die aktuelle Revision zu melden.
    const upd = await S.updateMany(
      { id: stateId, owner_id: user.id, revision: expected_revision },
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
