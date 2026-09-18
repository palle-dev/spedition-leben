import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { Button } from "@/components/ui/button";
import { Loader2, Cloud, CloudOff, RefreshCw, AlertTriangle, Download, Trash2, Check } from "lucide-react";

// Cloud-Synchronisations-Sektion für den Spielstände-Dialog.
// Zeigt Sync-Status, Cloud-Spielstände (geräteübergreifendes Fortsetzen)
// und Konflikt-Lösungs-Optionen.
export default function CloudSyncSection() {
  const {
    syncMeta, cloudSaves, cloudLoading,
    refreshCloudSaves, loadCloudGame, deleteCloudGame,
    resolveConflictKeepBoth, resolveConflictKeepLocal, resolveConflictKeepCloud,
  } = useGame();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const status = syncMeta?.status || "idle";
  const isConflict = status === "conflict";

  const fmt = (ts) => ts
    ? new Date(ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

  const handleLoad = async (id) => {
    setBusy("load:" + id); setError(null);
    const r = await loadCloudGame(id);
    setBusy(null);
    if (!r.ok) setError(r.error);
  };

  const handleDelete = async (id) => {
    setBusy("del:" + id); setError(null);
    const r = await deleteCloudGame(id);
    setBusy(null);
    if (!r.ok) setError(r.error);
  };

  const handleResolve = async (mode) => {
    setBusy("resolve:" + mode); setError(null);
    let r;
    if (mode === "both") r = await resolveConflictKeepBoth();
    else if (mode === "local") r = await resolveConflictKeepLocal();
    else if (mode === "cloud") r = await resolveConflictKeepCloud();
    setBusy(null);
    if (r?.error) setError(r.error);
  };

  const statusConfig = {
    idle: { icon: Cloud, label: "Bereit", color: "text-muted-foreground" },
    uploading: { icon: Loader2, label: "Wird synchronisiert …", color: "text-lime", spin: true },
    synced: { icon: Check, label: "Synchronisiert", color: "text-lime" },
    offline: { icon: CloudOff, label: "Offline — Änderungen werden lokal gespeichert", color: "text-muted-foreground" },
    conflict: { icon: AlertTriangle, label: "Konflikt — Cloud-Stand wurde auf anderem Gerät geändert", color: "text-coral" },
    error: { icon: AlertTriangle, label: "Synchronisationsfehler", color: "text-destructive" },
  };
  const cfg = statusConfig[status] || statusConfig.idle;
  const StatusIcon = cfg.icon;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1.5"><Cloud className="w-3.5 h-3.5" /> Cloud-Synchronisation</span>
        <button
          onClick={refreshCloudSaves}
          disabled={cloudLoading}
          className="text-muted-foreground hover:text-lime transition disabled:opacity-30"
          title="Aktualisieren"
        >
          {cloudLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Sync-Status */}
      <div className={`flex items-center gap-2 rounded-lg border border-white/10 bg-ink/40 px-3 py-2 text-sm ${cfg.color}`}>
        <StatusIcon className={`w-4 h-4 shrink-0 ${cfg.spin ? "animate-spin" : ""}`} />
        <span className="flex-1">{cfg.label}</span>
        {syncMeta?.lastCloudSyncAt && status === "synced" && (
          <span className="text-[11px] text-muted-foreground">{fmt(syncMeta.lastCloudSyncAt)}</span>
        )}
      </div>

      {/* Konflikt-Lösung */}
      {isConflict && (
        <div className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-3 space-y-2">
          <div className="text-sm text-coral font-medium">Konflikt erkannt</div>
          <p className="text-[12px] text-muted-foreground leading-relaxed">
            Der Cloud-Stand wurde auf einem anderen Gerät geändert, während Sie offline waren.
            Wählen Sie, wie fortgefahren werden soll:
          </p>
          <div className="flex flex-col gap-1.5">
            <Button
              size="sm" variant="outline"
              onClick={() => handleResolve("cloud")}
              disabled={!!busy}
              className="justify-start border-coral/20 bg-coral/5 text-coral hover:bg-coral/10 hover:text-coral"
            >
              {busy === "resolve:cloud" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Cloud-Stand laden (lokal wird als Backup gesichert)
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => handleResolve("local")}
              disabled={!!busy}
              className="justify-start border-white/10 bg-ink/40 hover:bg-ink/60"
            >
              {busy === "resolve:local" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
              Lokalen Stand hochladen (Cloud überschreiben)
            </Button>
            <Button
              size="sm" variant="outline"
              onClick={() => handleResolve("both")}
              disabled={!!busy}
              className="justify-start border-white/10 bg-ink/40 hover:bg-ink/60"
            >
              {busy === "resolve:both" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Beide behalten (lokal als neue Partie in Cloud)
            </Button>
          </div>
        </div>
      )}

      {/* Cloud-Spielstände */}
      {!isConflict && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {cloudSaves.length === 0 && !cloudLoading ? (
            <p className="text-sm text-muted-foreground py-2 text-center">Keine Cloud-Spielstände.</p>
          ) : cloudLoading ? (
            <div className="flex items-center justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : (
            cloudSaves.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-ink/40 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {s.save_label || s.company_name || "Unbenannter Stand"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.company_name ? s.company_name + " · " : ""}
                    Tag {s.game_time_min != null ? Math.floor(s.game_time_min / 1440) + 1 : (s.game_day ?? "—")}
                    {s.scenario_id ? " · Szenario" : ""}
                    {s.cloud_saved_at ? " · " + fmt(s.cloud_saved_at) : ""}
                  </div>
                </div>
                <Button size="sm" variant="ghost" aria-label={`Cloud-Spielstand „${s.save_label || s.company_name || "Unbenannter Stand"}“ laden`} title="Cloud-Spielstand laden" onClick={() => handleLoad(s.id)} disabled={!!busy} className="h-8 px-2 text-lime hover:text-lime hover:bg-lime/10">
                  {busy === "load:" + s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Cloud-Spielstand „${s.save_label || s.company_name || "Unbenannter Stand"}“ löschen`} title="Cloud-Spielstand löschen" onClick={() => handleDelete(s.id)} disabled={!!busy} className="h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                  {busy === "del:" + s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {error && (
        <div className="text-[12px] text-destructive-foreground bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-1.5">
          {error}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Cloud-Spielstände ermöglichen geräteübergreifendes Fortsetzen. Es werden nur manuelle Speicherpunkte synchronisiert, nicht jeder Spielschritt.
      </p>
    </div>
  );
}