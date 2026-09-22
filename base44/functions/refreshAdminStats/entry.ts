// Hintergrund-Dienst: Aktualisiert vorberechnete Statistiken für Spielstände.
// Wird vom AdminStatsRefresh-Workflow stündlich aufgerufen.
// Findet Spielstände mit veralteten oder fehlenden Statistiken und aktualisiert sie.
// Nur Lese- und Stats-Update-Operationen — keine sensiblen Daten, keine Löschungen.
// Auth: Admins dürfen manuell triggern; Workflow-Aufrufe (keine User-Session) werden
// zugelassen; authentifizierte Nicht-Admins werden abgewiesen.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { hydrateState } from "../../shared/cloudArchiveStore.ts";
import { extractStats } from "../../shared/adminStats.ts";

const STALE_AFTER_MS = 2 * 60 * 60 * 1000; // 2 Stunden
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const QUERY_BATCH = 200;

export default async function handleRefreshAdminStats(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== "admin") {
      return Response.json({ error: "Admin-Berechtigung erforderlich" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(body.limit || DEFAULT_LIMIT, MAX_LIMIT);

    const S = base44.asServiceRole.entities.GameState;
    const cutoff = Date.now() - STALE_AFTER_MS;

    // Zuletzt gespeicherte Spielstände laden und veraltete Stats herausfiltern.
    const all = await S.filter({}, "-cloud_saved_at", QUERY_BATCH);
    const stale = (all || [])
      .filter(r => !r.stats_updated_at || r.stats_updated_at < cutoff)
      .slice(0, limit);

    const storage = {
      createSignedUrl: async (args: any) => base44.asServiceRole.integrations.Core.CreateFileSignedUrl(args),
    };

    let updated = 0;
    let failed = 0;
    for (const rec of stale) {
      try {
        const state = await hydrateState(storage, rec.state);
        const stats = extractStats(state);
        await S.update(rec.id, {
          stats_company_cents: stats?.companyAccountCents ?? 0,
          stats_private_cents: stats?.privateAccountCents ?? 0,
          stats_vehicles: stats?.vehicles ?? 0,
          stats_branches: stats?.branches ?? 0,
          stats_employees: stats?.employees ?? 0,
          stats_drivers: stats?.drivers ?? 0,
          stats_updated_at: Date.now(),
        });
        updated++;
      } catch (e) {
        failed++;
      }
    }

    return Response.json({ ok: true, processed: stale.length, updated, failed });
  } catch (error) {
    return Response.json({ error: error.message || "Unbekannter Fehler" }, { status: 500 });
  }
}

if (typeof Deno !== "undefined") {
  Deno.serve(handleRefreshAdminStats);
}