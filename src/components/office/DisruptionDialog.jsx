import React, { useState, useMemo } from "react";
import { getDisruptionDetail } from "@/lib/simulation/disruptionEngine";
import { createPortal } from "react-dom";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import { X, Wrench, Clock, UserX, CheckCircle2, Zap, Info, Truck, User, FileText } from "lucide-react";

const TYPE_CONFIG = {
  technical_defect: { icon: Wrench, label: "Technischer Defekt" },
  loading_delay: { icon: Clock, label: "Ladeverzögerung" },
  personnel_absence: { icon: UserX, label: "Personalausfall" },
};

const STATUS_CONFIG = {
  decision_open: { label: "Entscheidung offen", color: "text-amber-300", bg: "bg-amber-500/20" },
  measure_running: { label: "Maßnahme läuft", color: "text-blue-300", bg: "bg-blue-500/20" },
  completed: { label: "Abgeschlossen", color: "text-lime", bg: "bg-lime/20" },
};

// Detail-Dialog für Störungen: zeigt Ursache, betroffene Ressourcen,
// verfügbare Handlungsoptionen mit Kosten-/Zeitvergleich und Historie.
export default function DisruptionDialog({ disruptionId, onClose }) {
  const { state, send, showToast } = useGame();
  const detail = useMemo(() => getDisruptionDetail(state, disruptionId), [state, disruptionId]);
  const [resolving, setResolving] = useState(false);

  async function handleResolve(optionId) {
    setResolving(true);
    try {
      const r = await send("resolveDisruption", { disruptionId, optionId });
      if (r.ok) {
        showToast(r.informationOnly ? "Kunde informiert." : "Störung bearbeitet.", "success");
        // Ergebnis bleibt sichtbar; Optionen aktualisieren sich aus dem Spielzustand.
      }
    } catch (e) { showToast(e.message, "error"); }
    finally { setResolving(false); }
  }

  if (!detail) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm" onClick={onClose}>
        <div className="text-muted-foreground text-sm">Störung nicht gefunden.</div>
      </div>,
      document.body
    );
  }

  const typeCfg = TYPE_CONFIG[detail.type] || TYPE_CONFIG.technical_defect;
  const TypeIcon = typeCfg.icon;
  const statusCfg = STATUS_CONFIG[detail.status] || STATUS_CONFIG.decision_open;
  const isCompleted = detail.status === "completed";
  const canResolve = detail.status === "decision_open";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="Funkmeldung und Entscheidung"
        className="glass border border-white/15 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto scrollbar-none"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-white/10">
          <div className="shrink-0 mt-1 text-coral"><TypeIcon className="w-5 h-5" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{typeCfg.label}</h2>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</span>
              {detail.autoResolved && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Zap className="w-3 h-3" /> auto durch {detail.autoResolvedBy}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{detail.cause}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Entstanden am {formatGameTime(detail.createdAtMin)}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3"><p className="text-sm font-medium">{isCompleted ? "Deine Entscheidung zeigt Wirkung." : canResolve ? (detail.driverName ? `${detail.driverName} braucht eine Entscheidung.` : "Die Leitstelle meldet Handlungsbedarf.") : "Die gewählte Maßnahme läuft."}</p><p className="text-xs text-muted-foreground mt-1">Fristen laufen ausschließlich mit der Spielzeit. Vergleiche Kosten und Verzögerung, bevor du handelst.</p></div>
          {/* Betroffene Ressourcen */}
          <div className="grid grid-cols-2 gap-3">
            {detail.vehicleLabel && (
              <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 p-2.5">
                <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fahrzeug</div>
                  <div className="text-sm font-medium truncate">{detail.vehicleLabel}</div>
                  {detail.vehicleCondition != null && (
                    <div className="text-[10px] text-muted-foreground">Zustand {detail.vehicleCondition}</div>
                  )}
                </div>
              </div>
            )}
            {detail.driverName && (
              <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 p-2.5">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Fahrer</div>
                  <div className="text-sm font-medium truncate">{detail.driverName}</div>
                </div>
              </div>
            )}
            {detail.delayMin > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Verzögerung</div>
                  <div className="text-sm font-medium">{detail.delayMin} Min</div>
                </div>
              </div>
            )}
            {detail.actualCostCents > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 p-2.5">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Tatsächliche Kosten</div>
                  <div className="text-sm font-medium">{formatEuro(detail.actualCostCents)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Betroffene Aufträge */}
          {detail.orders && detail.orders.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Betroffene Aufträge</div>
              <div className="space-y-1.5">
                {detail.orders.map(o => {
                  const buffer = o.deadlineBufferMin;
                  const urgent = buffer < 240;
                  return (
                    <div key={o.id} className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 p-2.5 text-xs">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{o.customer}</span>
                        <span className="text-muted-foreground"> · {o.fromCity} → {o.toCity} · {o.tons}t</span>
                      </div>
                      <div className={`shrink-0 ${urgent ? "text-coral" : "text-muted-foreground"}`}>
                        {buffer > 0 ? `Noch ${Math.floor(buffer / 60)}h ${Math.floor(buffer % 60)}min Spielzeit` : "Frist abgelaufen"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Abschlussmeldung */}
          {isCompleted && detail.completionSummary && (
            <div className="flex items-start gap-2 rounded-lg bg-lime/10 border border-lime/20 p-3">
              <CheckCircle2 className="w-4 h-4 text-lime shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-lime">Störung abgeschlossen</div>
                <p className="text-xs text-muted-foreground mt-0.5">{detail.completionSummary}</p>
              </div>
            </div>
          )}

          {/* Handlungsoptionen */}
          {canResolve && detail.options && detail.options.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Handlungsoptionen</div>
              <div className="space-y-2">
                {detail.options.map(opt => (
                  <div
                    key={opt.id}
                    className={`rounded-lg border p-3 transition ${opt.available ? "border-white/10 bg-white/5 hover:border-lime/30" : "border-white/5 bg-white/[0.02] opacity-50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{opt.label}</span>
                          {opt.requiresApproval && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Freigabe nötig</span>
                          )}
                          {opt.isEstimate && (
                            <span className="text-[9px] text-muted-foreground/60 flex items-center gap-0.5">
                              <Info className="w-2.5 h-2.5" /> geschätzt
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                        {opt.unavailableReason && (
                          <p className="text-xs text-coral mt-1">{opt.unavailableReason}</p>
                        )}
                      </div>
                      {opt.available && (
                        <button
                          onClick={() => handleResolve(opt.id)}
                          disabled={resolving}
                          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium bg-lime text-ink hover:brightness-110 transition disabled:opacity-40 active:scale-95"
                        >
                          {resolving ? "…" : "Ausführen"}
                        </button>
                      )}
                    </div>
                    {/* Kosten-/Zeit-Vergleich */}
                    {opt.available && (opt.costCents > 0 || opt.estimatedDurationMin > 0 || opt.deadlineImpactMin > 0) && (
                      <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-white/5 text-[10px]">
                        {opt.costCents > 0 && (
                          <span className="text-muted-foreground">Kosten: <span className="text-foreground font-medium">{formatEuro(opt.costCents)}</span></span>
                        )}
                        {opt.estimatedDurationMin > 0 && (
                          <span className="text-muted-foreground">Dauer: <span className="text-foreground font-medium">~{opt.estimatedDurationMin} Min</span></span>
                        )}
                        {opt.deadlineImpactMin > 0 && (
                          <span className="text-muted-foreground">Fristauswirkung: <span className="text-amber-300 font-medium">+{opt.deadlineImpactMin} Min</span></span>
                        )}
                        {opt.affectedOrders?.length > 0 && (
                          <span className="text-muted-foreground">Aufträge: <span className="text-foreground font-medium">{opt.affectedOrders.length}</span></span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historie */}
          {detail.history && detail.history.length > 1 && (
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer hover:text-foreground transition">Ablauf ({detail.history.length} Einträge)</summary>
              <div className="mt-2 space-y-1 pl-2 border-l border-white/10">
                {detail.history.map((h, i) => (
                  <div key={i} className="text-muted-foreground">
                    <span className="text-foreground/70">{formatGameTime(h.atMin)}</span> — {h.type.replace(/_/g, " ")}
                    {h.by && ` durch ${h.by}`}
                    {h.option && ` (${h.option.replace(/_/g, " ")})`}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}