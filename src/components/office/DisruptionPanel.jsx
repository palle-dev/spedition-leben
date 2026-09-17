import React, { useState, useMemo, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { AlertTriangle, Wrench, Clock, UserX, ChevronRight, CheckCircle2, Loader2, Zap } from "lucide-react";
import DisruptionDialog from "@/components/office/DisruptionDialog";

// Merkt sich, welche Störungen bereits auto-geöffnet wurden (Session-Scope).
const autoShownIds = new Set();

const TYPE_CONFIG = {
  technical_defect: { icon: Wrench, label: "Technischer Defekt", color: "text-coral", bg: "bg-coral/10", border: "border-coral/20" },
  loading_delay: { icon: Clock, label: "Ladeverzögerung", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  personnel_absence: { icon: UserX, label: "Personalausfall", color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" },
};

const STATUS_LABEL = {
  decision_open: "Entscheidung offen",
  measure_running: "Maßnahme läuft",
  completed: "Abgeschlossen",
};

// Kompaktes Panel für die Büroübersicht: zeigt aktive Störungen an.
// Liest Störungen direkt aus dem State — kein send-Aufruf nötig, der
// bei jedem gameTime-Wechsel zusätzliche Re-Renders auslösen würde.
export default function DisruptionPanel() {
  const { state } = useGame();
  const [selectedId, setSelectedId] = useState(null);

  const disruptions = useMemo(
    () => (state.disruptions?.items || [])
      .filter(d => d.status !== "completed")
      .sort((a, b) => a.createdAtMin - b.createdAtMin),
    [state.disruptions]
  );

  // Auto-Öffnen: Neue Störungen mit offener Entscheidung direkt als Modal anzeigen.
  const openIdsKey = disruptions
    .filter(d => d.status === "decision_open")
    .map(d => d.id)
    .join(",");

  useEffect(() => {
    if (selectedId) return;
    const next = disruptions.find(d => d.status === "decision_open" && !autoShownIds.has(d.id));
    if (next) {
      autoShownIds.add(next.id);
      setSelectedId(next.id);
    }
  }, [openIdsKey, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!disruptions || disruptions.length === 0) return null;

  return (
    <div className="glass border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-coral" />
        <h3 className="text-sm font-semibold">Aktive Störungen</h3>
        <span className="text-xs text-muted-foreground ml-auto">{disruptions.length} offen</span>
      </div>

      <div className="space-y-2">
        {disruptions.map(d => {
          const cfg = TYPE_CONFIG[d.type] || TYPE_CONFIG.technical_defect;
          const Icon = cfg.icon;
          const isRunning = d.status === "measure_running";
          return (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`w-full text-left rounded-lg border ${cfg.border} ${cfg.bg} p-3 hover:brightness-125 transition flex items-start gap-3`}
            >
              <div className={`shrink-0 mt-0.5 ${cfg.color}`}>
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{cfg.label}</span>
                  {d.autoResolved && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Zap className="w-3 h-3" /> auto
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{d.cause}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${d.status === "decision_open" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}>
                    {STATUS_LABEL[d.status] || d.status}
                  </span>
                  {d.orderIds?.length > 0 && (
                    <span className="text-[10px] text-muted-foreground">{d.orderIds.length} Auftrag{d.orderIds.length > 1 ? "e" : ""}</span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 self-center" />
            </button>
          );
        })}
      </div>

      {selectedId && (
        <DisruptionDialog disruptionId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}