import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { formatEuro, clockOf } from "@/lib/gameData";
import { Shield, ArrowLeft, LogOut, RefreshCw, Users, HardDrive, Trash2, Search, X } from "lucide-react";

export default function Admin() {
  const { user, isLoadingAuth } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);

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

  useEffect(() => {
    if (isLoadingAuth || !user || user.role !== "admin") return;
    loadData();
  }, [user?.id, isLoadingAuth, loadData]);

  async function refreshStats() {
    setRefreshing(true);
    try {
      await base44.functions.invoke("refreshAdminStats", { limit: 50 });
      await loadData();
    } catch (e) {
      setError(e?.message || e?.data?.error || "Aktualisierung fehlgeschlagen.");
    } finally {
      setRefreshing(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "save") {
        await base44.functions.invoke("adminDashboard", { command: "deleteSave", stateId: deleteTarget.id });
        await loadData();
        if (selectedUser) {
          const updated = (data?.saves || []).filter(s => s.id !== deleteTarget.id);
          setData(prev => ({ ...prev, saves: updated }));
        }
      } else {
        await base44.functions.invoke("adminDashboard", { command: "deleteUser", userId: deleteTarget.id });
        setSelectedUser(null);
        await loadData();
      }
      setDeleteTarget(null);
    } catch (e) {
      setError(e?.message || e?.data?.error || "Löschen fehlgeschlagen.");
    } finally {
      setDeleting(false);
    }
  }

  // Spieler + aggregierte Daten zusammenführen
  const players = useMemo(() => {
    if (!data?.users) return [];
    const savesByOwner = new Map();
    for (const s of data.saves || []) {
      if (!savesByOwner.has(s.owner_id)) savesByOwner.set(s.owner_id, []);
      savesByOwner.get(s.owner_id).push(s);
    }
    return data.users.map(u => {
      const userSaves = savesByOwner.get(u.id) || [];
      const lastSave = userSaves.length > 0
        ? userSaves.reduce((max, s) => (s.cloud_saved_at > max.cloud_saved_at ? s : max))
        : null;
      const hasStats = userSaves.some(s => s.stats);
      return {
        ...u,
        saveCount: userSaves.length,
        lastPlayed: lastSave?.cloud_saved_at || null,
        lastDay: lastSave?.game_day || 0,
        statsReady: hasStats,
      };
    });
  }, [data]);

  // Suche + Filter
  const filteredPlayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter(p => {
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (!q) return true;
      return (p.full_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q);
    });
  }, [players, query, roleFilter]);

  // Spielstände für ausgewählten Spieler
  const selectedUserSaves = useMemo(() => {
    if (!selectedUser || !data?.saves) return [];
    return data.saves.filter(s => s.owner_id === selectedUser.id);
  }, [selectedUser, data?.saves]);

  if (isLoadingAuth) {
    return (
      <div className="min-h-screen grid place-items-center bg-ink">
        <div className="w-8 h-8 border-4 border-lime border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;

  const statsReady = (data?.saves || []).filter(s => s.stats).length;
  const totalSaves = data?.saves?.length || 0;

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
            onClick={refreshStats}
            disabled={refreshing || loading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:border-white/20 disabled:opacity-50 transition"
            title="Statistiken im Hintergrund neu berechnen"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Stats aktualisieren
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:border-white/20 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Liste laden
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
      <div className="px-4 lg:px-6 py-6 max-w-[1400px] mx-auto space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard icon={Users} label="Spieler" value={data?.users?.length ?? "—"} />
          <SummaryCard icon={HardDrive} label="Spielstände" value={totalSaves} />
          <SummaryCard icon={Shield} label="Admins" value={(data?.users || []).filter(u => u.role === "admin").length} />
          <SummaryCard icon={RefreshCw} label="Stats bereit" value={loading ? "…" : `${statsReady}/${totalSaves}`} />
        </div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground text-sm">Lade Spieler und Spielstände…</div>
        ) : error ? (
          <div className="glass border border-coral/30 rounded-xl p-6 text-center">
            <p className="text-sm text-coral">{error}</p>
            <button onClick={loadData} className="mt-4 text-xs text-lime hover:text-lime/80 transition">
              Erneut versuchen
            </button>
          </div>
        ) : (
          <>
            {/* Spielerliste mit Suche + Filter */}
            <div className="glass border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="flex items-center gap-2 shrink-0">
                  <Users className="w-4 h-4 text-lime/70" />
                  <h2 className="text-sm font-medium">Spieler</h2>
                  <span className="text-xs text-muted-foreground">· {filteredPlayers.length} von {players.length}</span>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                    <input
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Name oder E-Mail suchen…"
                      className="w-full bg-surface-2/50 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-lime/30 transition"
                    />
                  </div>
                  <select
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    className="bg-surface-2/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-lime/30 transition shrink-0"
                  >
                    <option value="all">Alle Rollen</option>
                    <option value="admin">Admins</option>
                    <option value="user">Spieler</option>
                  </select>
                </div>
              </div>

              {filteredPlayers.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted-foreground/50">
                  Keine Spieler gefunden.
                </div>
              ) : (
                <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
                  {filteredPlayers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedUser(p)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition text-left group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 grid place-items-center shrink-0 text-xs font-semibold text-muted-foreground">
                          {(p.full_name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{p.full_name || "—"}</span>
                            {p.role === "admin" && <span className="text-[10px] bg-lime/15 text-lime px-1.5 py-0.5 rounded shrink-0">Admin</span>}
                            {p.id === user.id && <span className="text-[10px] bg-white/10 text-muted-foreground px-1.5 py-0.5 rounded shrink-0">Du</span>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Zuletzt gespielt</div>
                          <div className="text-xs text-foreground/80 tabular-nums">
                            {p.lastPlayed ? new Date(p.lastPlayed).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—"}
                            {p.lastDay > 0 && <span className="text-muted-foreground/50"> · Tag {p.lastDay}</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Spiele</div>
                          <div className="text-xs text-foreground/80 tabular-nums">{p.saveCount}</div>
                        </div>
                        <div className="text-right hidden xs:block">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/50">Sicherungen</div>
                          <div className="text-xs text-foreground/80 tabular-nums">{p.saveCount}</div>
                        </div>
                        <Trash2
                          className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-coral transition shrink-0"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "user", id: p.id, name: p.full_name || p.email }); }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {statsReady < totalSaves && !loading && (
              <div className="text-xs text-muted-foreground/60 text-center">
                {totalSaves - statsReady} Spielstand/Spielstände werden noch im Hintergrund berechnet (nächster Workflow-Durchlauf).
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal: Spielstände eines Spielers */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={() => setSelectedUser(null)}>
          <div className="glass border border-white/15 rounded-2xl max-w-5xl w-full max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-sm font-semibold text-muted-foreground">
                  {(selectedUser.full_name || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-medium">{selectedUser.full_name || "—"}</h3>
                  <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="w-9 h-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content: Spielstände */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {selectedUserSaves.length === 0 ? (
                <div className="p-12 text-center">
                  <HardDrive className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Keine Spielstände vorhanden.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface/95 backdrop-blur-xl">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-white/10">
                      <th className="text-left font-medium px-5 py-3 whitespace-nowrap">Firma</th>
                      <th className="text-right font-medium px-3 py-3 whitespace-nowrap">Tag</th>
                      <th className="text-right font-medium px-3 py-3 whitespace-nowrap hidden lg:table-cell">Zeit</th>
                      <th className="text-right font-medium px-3 py-3 whitespace-nowrap">Privat</th>
                      <th className="text-right font-medium px-3 py-3 whitespace-nowrap">Unternehmen</th>
                      <th className="text-right font-medium px-3 py-3 whitespace-nowrap">LKW</th>
                      <th className="text-right font-medium px-3 py-3 whitespace-nowrap hidden md:table-cell">Standorte</th>
                      <th className="text-right font-medium px-3 py-3 whitespace-nowrap hidden md:table-cell">Mitarbeiter</th>
                      <th className="text-right font-medium px-3 py-3 whitespace-nowrap hidden lg:table-cell">Sicherung</th>
                      <th className="text-right font-medium px-3 py-3 whitespace-nowrap">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedUserSaves.map(save => {
                      const s = save.stats;
                      return (
                        <tr key={save.id} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                          <td className="px-5 py-3 whitespace-nowrap">
                            {save.company_name || <span className="text-muted-foreground/40">—</span>}
                            {save.save_label && <div className="text-[10px] text-muted-foreground/60">{save.save_label}</div>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{save.game_day || 0}</td>
                          <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground hidden lg:table-cell">
                            {clockOf(save.game_time_min || 0)}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                            <StatCell value={s?.privateAccountCents} format={formatEuro} tone="coral" />
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                            <StatCell value={s?.companyAccountCents} format={formatEuro} tone="lime" />
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                            <StatCell value={s?.vehicles} />
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap hidden md:table-cell">
                            <StatCell value={s?.branches} />
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap hidden md:table-cell">
                            <StatCell value={s?.employees} />
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
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={() => !deleting && setDeleteTarget(null)}>
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

function StatCell({ value, format = null, tone = null }) {
  if (value == null) return <span className="text-muted-foreground/40">—</span>;
  const formatted = format ? format(value) : value;
  const cls = tone === "coral" ? "text-coral" : tone === "lime" ? "text-lime" : "";
  return <span className={cls}>{formatted}</span>;
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}