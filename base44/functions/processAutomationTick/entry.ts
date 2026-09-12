// Hintergrund-Verarbeitung für die Zeitautomatik (Auftrag 20).
// Wird vom Workflow-Scheduler alle 5 Minuten aufgerufen.
// Findet alle Spielstände mit aktivierter Automatik und verarbeitet fällige Ereignisse.
// Verwendet Service-Role (keine Nutzer-Auth erforderlich für Scheduler-Aufrufe).
// Bei direktem HTTP-Aufruf durch Nutzer: Admin-Rolle erforderlich.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { applyCommand } from "../../shared/simulationEngine.ts";
import { migrateState } from "../../shared/progressEngine.ts";
import { computeTargetGameMinute } from "../../shared/timeControlEngine.ts";

const PROCESSING_BUDGET_MS = 25000; // 25 Sekunden Zeitbudget pro Lauf
const MAX_GAMES_PER_RUN = 50;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    // Bei direktem Nutzer-Aufruf: Admin-Rolle prüfen.
    // Scheduler-Aufrufe ohne Nutzer-Auth sind erlaubt.
    if (user && user.role !== "admin") {
      return Response.json({ error: "Admin erforderlich" }, { status: 403 });
    }

    const S = base44.asServiceRole.entities.GameState;
    const serverNowMs = Date.now();
    const startTime = Date.now();

    // Alle Spielstände mit aktivierter Automatik finden.
    let activeGames;
    try {
      activeGames = await S.filter({ automation_enabled: true }, "-created_date", MAX_GAMES_PER_RUN);
    } catch (e) {
      // Fallback: alle Spielstände laden und client-seitig filtern.
      const all = await S.list("-created_date", 100);
      activeGames = (all || []).filter(r => r.automation_enabled === true).slice(0, MAX_GAMES_PER_RUN);
    }

    const results = [];
    let processed = 0;
    let skipped = 0;
    let conflicts = 0;
    let errors = 0;

    for (const rec of activeGames) {
      // Zeitbudget prüfen: rechtzeitig anhalten, damit Folgelauf weitermacht.
      if (Date.now() - startTime > PROCESSING_BUDGET_MS) break;

      try {
        const state = migrateState(rec.state || {});
        const tc = state.timeControl;
        if (!tc || !tc.enabled) { skipped++; continue; }

        // Ziel-Spielminute berechnen.
        const targetMin = computeTargetGameMinute(tc, serverNowMs);
        if (targetMin <= tc.processedGameMinute) { skipped++; continue; }

        // Ereignisse verarbeiten (nutzt denselben Ereignismotor wie manuelles Vorspulen).
        const r = applyCommand(state, "syncAutomation", { serverNowMs });
        const newState = r.state;
        const newRev = rec.revision + 1;

        // Atomar speichern mit Revisionssicherung (verhindert doppelte Verarbeitung).
        // updateMany gibt die Anzahl geschriebener Dokumente zurück – ein erneuter
        // Lesezugriff pro Spielstand entfällt (halbiert die Entity-Reads pro Lauf).
        const upd = await S.updateMany(
          { id: rec.id, revision: rec.revision },
          { $set: { state: newState, revision: newRev, last_result: r.result } }
        );

        if (upd && upd.updated === 1) {
          processed++;
          results.push({
            id: rec.id,
            ok: true,
            gameTime: newState.gameTime,
            targetMin,
            events: (r.result.events || []).length,
          });
        } else {
          conflicts++;
          results.push({ id: rec.id, ok: false, reason: "conflict" });
        }
      } catch (e) {
        errors++;
        results.push({ id: rec.id, ok: false, error: e.message });
      }
    }

    return Response.json({
      ok: true,
      serverNowMs,
      total: activeGames.length,
      processed,
      skipped,
      conflicts,
      errors,
      elapsedMs: Date.now() - startTime,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}