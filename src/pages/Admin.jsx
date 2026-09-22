import React, { useState, useEffect, useCallback } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { formatEuro, dayOf, clockOf } from "@/lib/gameData";
import { Shield, ArrowLeft, LogOut, RefreshCw, Users, HardDrive, AlertCircle, Trash2 } from "lucide-react";

export default function Admin() {
  const { user, isLoadingAuth } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("adminDashboard", { command: "list" });
      setData(res.data);
    } catch (e) {
      setError(e?.message || e?.data?.error || "Daten konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "save") {
        await base44.functions.invoke("adminDashboard", { command: "deleteSave", stateId: deleteTarget.id });
      } else {
        await base44.functions.invoke("adminDashboard", { command: "deleteUser", userId: deleteTarget.id });
      }
      setDeleteTarget(null);
      await loadData();
    } catch (e) {
      setError(e?.message || e?.data?.error || "Löschen fehlgeschlagen.");
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (isLoadingAuth || !user || user.role !== "admin") return;
    loadData();
  }, [user?.id, isLoadingAuth, loadData]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen grid place-items-center bg-ink">
        <div className="w-8 h-8 border-4 border-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;

  const usersById = new Map((data?.users || []).map(u => [u.id, u]));
  const saves = data?.saves || [];
  const statsOk = saves.filter(s => s.stats);
  const statsFail = saves.filter(s => !s.stats);

  return (
    <div className="min-h-screen bg-ink text-foreground">
      {/* Header */}
      <header className="border-b border-white/10 px-4 lg:px-6 py-3 flex items-center justify-between sticky top-0 bg-ink/95 backdrop-blur-xl z-30">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Zurück</span>
          </Link>
          <div className="w-px h-6 bg-white/10" />
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-lime" /> Admin
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:border-white/20 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Aktualisieren
          </button>
          <button
            onClick={() => base44.auth.logout("/login")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-white/10 bg-white/5 text-muted-foreground hover:text-coral transition"
          >
            <LogOut className="w-3.5 h-3.5" /> Abmelden
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="px-4 lg:px-6 py-6 max-w-[1800px] mx-auto space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon={Users} label="Spieler" value={data?.users?.length ?? "—"} />
          <SummaryCard icon={HardDrive} label="Spielstände" value={saves.length} />
          <SummaryCard icon={Shield} label="Admins" value={(data?.users || []).filter(u => u.role === "admin").length} />
          {statsFail.length > 0 && (
            <SummaryCard icon={AlertCircle} label="Nicht ladbar" value={statsFail.length} tone="coral" />
          )}
        </div>

        {/* Spieler */}
        {!loading && !error && (data?.users || []).length > 0 && (
          <div className="glass border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
              <Users className="w-4 h-4 text-lime/70" />
              <h2 className="text-sm font-medium">Spieler</h2>
              <span className="text-xs text-muted-foreground">· {data.users.length} registriert</span>
            </div>
            <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
              {data.users.map(u => {
                const userSaves = saves.filter(s => s.owner_id === u.id);
                return (
                  <div key={u.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{u.full_name || "—"}</span>
                        {u.role === "admin" && <span className="text-[10px] bg-lime/15 text-lime px-1.5 py-0.5 rounded">Admin</span>}
                        {u.id === user.id && <span className="text-[10px] bg-white/10 text-muted-foreground px-1.5 py-0.5 rounded">Du</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">{userSaves.length} Spielstand{userSaves.length !== 1 ? "stände" : ""}</span>
                      <button
                        onClick={() => setDeleteTarget({ type: "user", id: u.id, name: u.full_name || u.email })}
                        disabled={u.id === user.id}
                        className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:text-coral hover:border-coral/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title={u.id === user.id ? "Du kannst dich nicht selbst löschen" : "Spieler und alle Spielstände löschen"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-muted-foreground text-sm">Lade Spieler und Spielstände…</div>
        ) : error ? (
          <div className="glass border border-coral/30 rounded-xl p-6 text-center">
            <AlertCircle className="w-8 h-8 text-coral mx-auto mb-3" />
            <p className="text-sm text-coral">{error}</p>
            <button onClick={loadData} className="mt-4 text-xs text-lime hover:text-lime/80 transition">
              Erneut versuchen
            </button>
          </div>
        ) : saves.length === 0 ? (
          <div className="glass border border-white/10 rounded-xl p-12 text-center">
            <HardDrive className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Keine Spielstände vorhanden.</p>
          </div>
        ) : (
          <div className="glass border border-white/10 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-white/10">
                    <th className="text-left font-medium px-4 py-3 whitespace-nowrap">Spieler</th>
                    <th className="text-left font-medium px-3 py-3 whitespace-nowrap hidden md:table-cell">E-Mail</th>
                    <th className="text-left font-medium px-3 py-3 whitespace-nowrap">Firma</th>
                    <th className="text-right font-medium px-3 py-3 whitespace-nowrap">Tag</th>
                    <th className="text-right font-medium px-3 py-3 whitespace-nowrap hidden lg:table-cell">Zeit</th>
                    <th className="text-right font-medium px-3 py-3 whitespace-nowrap">Privat</th>
                    <th className="text-right font-medium px-3 py-3 whitespace-nowrap">Unternehmen</th>
                    <th className="text-right font-medium px-3 py-3 whitespace-nowrap">LKW</th>
                    <th className="text-right font-medium px-3 py-3 whitespace-nowrap hidden md:table-cell">Standorte</th>
                    <th className="text-right font-medium px-3 py-3 whitespace-nowrap hidden md:table-cell">Mitarbeiter</th>
                    <th className="text-right font-medium px-3 py-3 whitespace-nowrap hidden lg:table-cell">Letzte Sicherung</th>
                    <th className="text-right font-medium px-3 py-3 whitespace-nowrap">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {saves.map(save => {
                    const u = usersById.get(save.owner_id);
                    const s = save.stats;
                    return (
                      <tr key={save.id} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="font-medium text-foreground">{u?.full_name || "—"}</div>
                          <div className="text-[10px] text-muted-foreground md:hidden">{u?.email || "—"}</div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground whitespace-nowrap hidden md:table-cell">{u?.email || "—"}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {save.company_name || s?.companyName || (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                          {save.save_label && (
                            <div className="text-[10px] text-muted-foreground/60">{save.save_label}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{save.game_day || 0}</td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground hidden lg:table-cell">
                          {clockOf(save.game_time_min || 0)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {s ? <span className="text-coral">{formatEuro(s.privateAccountCents)}</span> : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {s ? <span className="text-lime">{formatEuro(s.companyAccountCents)}</span> : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {s?.vehicles ?? <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap hidden md:table-cell">
                          {s?.branches ?? <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap hidden md:table-cell">
                          {s?.employees ?? <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-xs text-muted-foreground whitespace-nowrap hidden lg:table-cell">
                          {save.cloud_saved_at ? new Date(save.cloud_saved_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "—"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            onClick={() => setDeleteTarget({ type: "save", id: save.id, name: save.company_name || save.save_label || save.id })}
                            className="w-8 h-8 grid place-items-center rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:text-coral hover:border-coral/30 transition inline-flex"
                            title="Spielstand löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {statsFail.length > 0 && !loading && !error && (
          <div className="text-xs text-muted-foreground/60 text-center">
            {statsFail.length} Spielstand/Spielstände konnten nicht hydratisiert werden (evtl. beschädigt oder in Migration).
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="glass border border-white/15 rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-coral/10 grid place-items-center">
                <Trash2 className="w-5 h-5 text-coral" />
              </div>
              <div>
                <h3 className="text-base font-medium">{deleteTarget.type === "user" ? "Spieler löschen" : "Spielstand löschen"}</h3>
                <p className="text-xs text-muted-foreground">{deleteTarget.name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              {deleteTarget.type === "user"
                ? "Dieser Spieler und alle seine Spielstände werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
                : "Dieser Spielstand wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 rounded-lg py-2.5 text-sm font-medium bg-coral text-ink hover:brightness-110 disabled:opacity-50 transition">
                {deleting ? "Lösche…" : "Endgültig löschen"}
              </button>
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 rounded-lg py-2.5 text-sm border border-white/10 text-muted-foreground hover:text-foreground disabled:opacity-50 transition">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  const color = tone === "coral" ? "text-coral" : "text-foreground";
  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}