// Admin-Dashboard: Übersicht über alle Spieler und deren Spielstände.
// Nur für Admins (user.role === "admin") – sonst 403.
// Verwendet asServiceRole, um RLS zu umgehen und alle User + GameStates zu lesen.
// Statistiken werden aus Entity-Feldern gelesen (vorberechnet durch cloudSync +
// refreshAdminStats-Hintergrunddienst) — keine Hydratisierung beim Auflisten.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";

export default async function handleAdminDashboard(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Admin-Berechtigung erforderlich" }, { status: 403 });

    const body = await req.json();
    const { command } = body || {};

    if (command === "list") {
      const [users, states] = await Promise.all([
        base44.asServiceRole.entities.User.list("-created_date", 1000),
        base44.asServiceRole.entities.GameState.filter({}, "-cloud_saved_at", 1000),
      ]);

      return Response.json({
        users: (users || []).map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          role: u.role,
          created_date: u.created_date,
        })),
        saves: (states || []).map((rec: any) => ({
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
          stats: rec.stats_updated_at ? {
            companyAccountCents: rec.stats_company_cents ?? 0,
            privateAccountCents: rec.stats_private_cents ?? 0,
            vehicles: rec.stats_vehicles ?? 0,
            branches: rec.stats_branches ?? 0,
            employees: rec.stats_employees ?? 0,
            drivers: rec.stats_drivers ?? 0,
          } : null,
        })),
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