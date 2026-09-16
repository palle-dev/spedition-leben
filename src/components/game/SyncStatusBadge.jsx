import React from "react";
import { useGame } from "@/lib/gameContext";
import { Cloud, CloudOff, Loader2, AlertTriangle, Check } from "lucide-react";

// Kompakter Sync-Status-Indikator für den Header.
// Zeigt den aktuellen Cloud-Synchronisations-Status als Icon mit Tooltip.
export default function SyncStatusBadge() {
  const { syncMeta } = useGame();
  const status = syncMeta?.status || "idle";

  const config = {
    idle: { icon: Cloud, color: "text-muted-foreground/50", label: "Cloud bereit" },
    uploading: { icon: Loader2, color: "text-lime", label: "Synchronisiere …", spin: true },
    synced: { icon: Check, color: "text-lime", label: "Synchronisiert" },
    offline: { icon: CloudOff, color: "text-muted-foreground/50", label: "Offline" },
    conflict: { icon: AlertTriangle, color: "text-coral", label: "Sync-Konflikt — bitte prüfen" },
    error: { icon: AlertTriangle, color: "text-destructive", label: "Sync-Fehler" },
  };
  const cfg = config[status] || config.idle;
  const Icon = cfg.icon;

  return (
    <div
      className={`w-9 h-9 grid place-items-center rounded-full border border-white/10 bg-white/5 ${cfg.color} shrink-0`}
      title={cfg.label}
      aria-label={cfg.label}
    >
      <Icon className={`w-4 h-4 ${cfg.spin ? "animate-spin" : ""}`} />
    </div>
  );
}