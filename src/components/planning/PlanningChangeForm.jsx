import React, { useState, useMemo } from "react";
import { X, ArrowRight, AlertTriangle, CheckCircle, Clock, MapPin, Truck, User } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { formatPlanningTime } from "@/lib/planningData";

// Formular-Alternative für Planungsänderungen.
// Zeigt eine Vorschau mit Hindernissen vor der Bestätigung.
// Prüft bei Bestätigung erneut gegen den aktuellen Spielstand.
export default function PlanningChangeForm({ open, onClose, tourId }) {
  const { state, send } = useGame();
  const [newVehicleId, setNewVehicleId] = useState("");
  const [newDriverId, setNewDriverId] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const tour = useMemo(() => {
    return (state.tours || []).find(t => t.id === tourId);
  }, [state.tours, tourId]);

  async function runPreview() {
    if (!tourId || !newVehicleId || !newDriverId) return;
    setLoading(true);
    setError("");
    try {
      const res = await send("previewReassignTour", { tourId, newVehicleId, newDriverId });
      setPreview(res);
    } catch (e) {
      setError(e.message);
      setPreview(null);
    }
    setLoading(false);
  }

  async function confirmChange() {
    if (!preview?.canConfirm) return;
    setConfirming(true);
    setError("");
    try {
      // Erneute Prüfung bei Bestätigung — veraltete Vorschau darf keine
      // andere Planung überschreiben.
      const freshPreview = await send("previewReassignTour", { tourId, newVehicleId, newDriverId });
      if (!freshPreview?.canConfirm) {
        setError("Die Situation hat sich geändert. Bitte Vorschau erneut prüfen: " + (freshPreview?.obstacles?.hard?.[0]?.message || "Neue Hindernisse aufgetreten."));
        setPreview(freshPreview);
        setConfirming(false);
        return;
      }
      await send("reassignTour", { tourId, newVehicleId, newDriverId });
      onClose();
    } catch (e) {
      setError(e.message);
    }
    setConfirming(false);
  }

  if (!open || !tour) return null;

  const orderIds = (tour.deployments || [])
    .filter(d => d.orderId && d.status !== "cancelled")
    .map(d => d.orderId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-white/15 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-lime" />
            Tour neu zuweisen
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Aktuelle Zuweisung */}
          <div className="rounded-lg border border-white/10 bg-white/3 p-3 space-y-1">
            <div className="text-[11px] text-muted-foreground">Aktuelle Tour</div>
            <div className="text-sm font-medium">{orderIds.length} Auftrag/-aufträge</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Truck className="w-3 h-3" /> {tour.vehicleId}
              <User className="w-3 h-3 ml-2" /> {(state.drivers || []).find(d => d.id === tour.driverId)?.name || tour.driverId}
            </div>
          </div>

          {/* Neue Zuweisung */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground block">Neues Fahrzeug</label>
            <select
              value={newVehicleId}
              onChange={e => { setNewVehicleId(e.target.value); setPreview(null); }}
              className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm"
            >
              <option value="">— Fahrzeug wählen —</option>
              {(state.vehicles || []).filter(v => v.status !== "sold" && v.status !== "archived" && !v.markedForSale).map(v => {
                const n = parseInt(String(v.id).replace(/[^0-9]/g, ""), 10);
                const label = isNaN(n) ? v.id : "Lkw " + String(n).padStart(2, "0");
                return <option key={v.id} value={v.id}>{label} — {v.capacityTons}t, Zustand {v.condition}, {v.locationCity}</option>;
              })}
            </select>

            <label className="text-xs text-muted-foreground block">Neuer Fahrer</label>
            <select
              value={newDriverId}
              onChange={e => { setNewDriverId(e.target.value); setPreview(null); }}
              className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm"
            >
              <option value="">— Fahrer wählen —</option>
              {(state.drivers || []).filter(d => d.employmentStatus === "employed" && d.attendance !== "released").map(d => (
                <option key={d.id} value={d.id}>{d.name} — {d.locationCity}, {d.status}</option>
              ))}
            </select>

            <button
              onClick={runPreview}
              disabled={loading || !newVehicleId || !newDriverId}
              className="w-full rounded-md border border-lime/30 text-lime text-sm font-medium py-2 disabled:opacity-40 hover:bg-lime/10 transition"
            >
              {loading ? "Prüfe…" : "Vorschau prüfen"}
            </button>
          </div>

          {/* Fehler */}
          {error && (
            <div className="text-xs text-red-400 rounded border border-red-500/20 bg-red-500/5 p-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Vorschau */}
          {preview?.ok && (
            <div className="space-y-2">
              {/* Vergleich */}
              <div className="rounded-lg border border-white/10 bg-white/3 p-3 space-y-1.5">
                <div className="text-xs font-medium">Vergleich</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[10px] text-muted-foreground">Vorher</div>
                    <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatPlanningTime(preview.comparison.oldStart)}</div>
                    <div className="text-[10px] text-muted-foreground">bis {formatPlanningTime(preview.comparison.oldEnd)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">Nachher</div>
                    <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatPlanningTime(preview.comparison.newStart)}</div>
                    <div className="text-[10px] text-muted-foreground">bis {formatPlanningTime(preview.comparison.newEnd)}</div>
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground pt-1">
                  Deckungsbeitrag: {(preview.comparison.totalContributionCents / 100).toFixed(0)} €
                </div>
              </div>

              {/* Harte Hindernisse */}
              {preview.obstacles.hard.length > 0 && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2 space-y-1">
                  <div className="text-xs font-medium text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Harte Hindernisse — Bestätigung nicht möglich
                  </div>
                  {preview.obstacles.hard.map((o, i) => (
                    <div key={i} className="text-[11px] text-red-300/80 flex items-start gap-1.5">
                      <span className="mt-0.5">•</span>
                      <span>{o.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Unsichere Prognosen */}
              {preview.obstacles.soft.length > 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 space-y-1">
                  <div className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Unsichere Prognosen
                  </div>
                  {preview.obstacles.soft.map((o, i) => (
                    <div key={i} className="text-[11px] text-amber-300/80 flex items-start gap-1.5">
                      <span className="mt-0.5">•</span>
                      <span>{o.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Bestätigen */}
              {preview.canConfirm && (
                <button
                  onClick={confirmChange}
                  disabled={confirming}
                  className="w-full rounded-md bg-lime text-ink text-sm font-medium py-2 disabled:opacity-40 hover:brightness-110 transition flex items-center justify-center gap-2"
                >
                  {confirming ? "Bestätige…" : <><CheckCircle className="w-4 h-4" /> Änderung bestätigen</>}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}