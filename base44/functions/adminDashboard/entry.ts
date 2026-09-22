// Admin-Dashboard: Übersicht über alle Spieler und deren Spielstände.
// Nur für Admins (user.role === "admin") – sonst 403.
// Verwendet asServiceRole, um RLS zu umgehen und alle User + GameStates zu lesen.
// Hydratisiert URI-basierte Spielstände aus privatem Datei-Speicher.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { hydrateState } from "../../shared/cloudArchiveStore.ts";

function extractStats(state: any) {
  if (!state || typeof state !== "object") return null;
  return {
    gameTime: state.gameTime || 0,
    companyName: state.company?.name || null,
    companyAccountCents: state.company?.accountCents ?? 0,
    privateAccountCents: state.private?.accountCents ?? 0,
    vehicles: (state.vehicles || []).filter((v: any) => v.status !== "sold" && v.status !== "archived").length,
    branches: (state.branches || []).filter((b: any) => b.status === "active").length,
    employees: (state.employees || []).filter((e: any) => e.employmentStatus === "employed").length,
    drivers: (state.drivers || []).filter((d: any) => d.employmentStatus === "employed").length,
  };
}

async function processWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export default async function handleAdminDashboard(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Admin-Berechtigung erforderlich" }, { status: 403 });

    const body = await req.json();
    const { command } = body || {};

    const storage = {
      createSignedUrl: async (args: any) => base44.asServiceRole.integrations.Core.CreateFileSignedUrl(args),
    };

    if (command === "list") {
      const [users, states] = await Promise.all([
        base44.asServiceRole.entities.User.list("-created_date", 1000),
        base44.asServiceRole.entities.GameState.filter({}, "-cloud_saved_at", 1000),
      ]);

      const saves = await processWithConcurrency(states || [], 3, async (rec: any) => {
        const base = {
          id: rec.id,
          owner_id: rec.owner_id,
          revision: rec.revision,
          company_name: rec.company_name,
          game_day: rec.game_day,
          game_time_min: rec.game_time_min,
          scenario_id: rec.scenario_id,
          save_label: rec.save_label,
          save_type: rec.save_type,
          cloud_saved_at: rec.cloud_saved_at,
          created_date: rec.created_date,
        };
        try {
          const state = await hydrateState(storage, rec.state);
          return { ...base, stats: extractStats(state) };
        } catch (e) {
          return { ...base, stats: null, error: e.message || "Hydratisierung fehlgeschlagen" };
        }
      });

      return Response.json({
        users: (users || []).map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          role: u.role,
          created_date: u.created_date,
        })),
        saves,
      });
    }

    if (command === "deleteSave") {
      const { stateId } = body;
      if (!stateId) return Response.json({ error: "stateId erforderlich" }, { status: 400 });
      await base44.asServiceRole.entities.GameState.delete(stateId);
      return Response.json({ ok: true, stateId });
    }

    if (command === "deleteUser") {
      const { userId } = body;
      if (!userId) return Response.json({ error: "userId erforderlich" }, { status: 400 });
      if (userId === user.id) return Response.json({ error: "Du kannst dich nicht selbst löschen" }, { status: 400 });
      const userStates = await base44.asServiceRole.entities.GameState.filter({ owner_id: userId }, "-cloud_saved_at", 1000);
      const saveCount = (userStates || []).length;
      if (saveCount > 0) {
        await base44.asServiceRole.entities.GameState.deleteMany({ owner_id: userId });
      }
      await base44.asServiceRole.entities.User.delete(userId);
      return Response.json({ ok: true, userId, deletedSaves: saveCount });
    }

    return Response.json({ error: "Unbekannter Befehl: " + command }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || "Unbekannter Fehler" }, { status: 500 });
  }
}

if (typeof Deno !== "undefined") {
  Deno.serve(handleAdminDashboard);
}