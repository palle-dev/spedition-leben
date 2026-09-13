// Speichert einen clientseitig berechneten Spielstand atomar in die Datenbank.
// Der Client wendet Befehle lokal an (Echtzeit-Anzeige) und persistiert bei Bedarf
// über diese Funktion. Konfliktbehandlung über bedingtes updateMany (Revisionssicherung).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { migrateState } from "../../shared/progressEngine.ts";

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });

    const body = await req.json();
    const { stateId, state, expected_revision } = body || {};
    if (!stateId || !state) return Response.json({ error: "stateId und state erforderlich" }, { status: 400 });

    const S = base44.asServiceRole.entities.GameState;
    const rec = await S.get(stateId);
    if (!rec || rec.owner_id !== user.id) {
      return Response.json({ error: "Kein Zugriff auf diesen Spielstand" }, { status: 403 });
    }

    if (expected_revision !== undefined && rec.revision !== expected_revision) {
      return Response.json({ error: "Konflikt: Spielstand wurde gleichzeitig geändert", conflict: true, current_revision: rec.revision }, { status: 409 });
    }

    const migrated = migrateState(state);
    const newRev = rec.revision + 1;
    const updateSet = {
      state: migrated,
      revision: newRev,
      last_action_id: "save_" + Date.now(),
      last_result: { ok: true, command: "save" },
      automation_enabled: !!migrated.timeControl?.enabled,
    };

    const upd = await S.updateMany(
      { id: stateId, owner_id: user.id, revision: expected_revision },
      { $set: updateSet }
    );

    if (!upd || upd.updated !== 1) {
      const cur = await S.get(stateId);
      return Response.json({ error: "Konflikt: Zustand wurde gleichzeitig geändert", conflict: true, current_revision: cur ? cur.revision : 0 }, { status: 409 });
    }

    return Response.json({ ok: true, revision: newRev, stateId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}