import React, { useState, useMemo } from "react";
import { Search, Wrench, AlertTriangle, X, CheckCircle, Clock, MapPin } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { formatPlanningTime } from "@/lib/planningData";

// Planungs-Hilfen: Drei Hilfsdialoge
// A) Passende Ressourcen finden
// B) Wartungsfenster suchen
// C) Konflikte prüfen
export default function PlanningHelpers({ open, onClose, initialHelper, initialOrderId, initialVehicleId }) {
  const { state, send } = useGame();
  const [activeHelper, setActiveHelper] = useState(initialHelper || "resources");
  const [orderId, setOrderId] = useState(initialOrderId || "");
  const [vehicleId, setVehicleId] = useState(initialVehicleId || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Bei Öffnung: initiale Werte setzen
  React.useEffect(() => {
    if (open) {
      setActiveHelper(initialHelper || "resources");
      setOrderId(initialOrderId || "");
      setVehicleId(initialVehicleId || "");
      setResult(null);
    }
  }, [open, initialHelper, initialOrderId, initialVehicleId]);

  async function runHelper() {
    setLoading(true);
    try {
      let cmd, params;
      if (activeHelper === "resources") {
        cmd = "findResourcesForOrder";
        params = { orderId };
      } else if (activeHelper === "maintenance") {
        cmd = "findMaintenanceWindows";
        params = { vehicleId };
      } else if (activeHelper === "conflicts") {
        // Konflikte werden lokal berechnet (kein Befehl nötig)
        setResult({ conflicts: state.conflicts || [] });
        setLoading(false);
        return;
      }
      const res = await send(cmd, params);
      setResult(res);
    } catch (e) {
      setResult({ error: e.message });
    }
    setLoading(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-white/15 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium flex items-center gap-2">
            {activeHelper === "resources" && <><Search className="w-4 h-4 text-lime" /> Passende Ressourcen finden</>}
            {activeHelper === "maintenance" && <><Wrench className="w-4 h-4 text-orange-400" /> Wartungsfenster suchen</>}
            {activeHelper === "conflicts" && <><AlertTriangle className="w-4 h-4 text-red-400" /> Konflikte prüfen</>}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {/* Tab-Umschaltung */}
        <div className="flex border-b border-white/10">
          {[
            { id: "resources", label: "Ressourcen", icon: Search },
            { id: "maintenance", label: "Wartung", icon: Wrench },
            { id: "conflicts", label: "Konflikte", icon: AlertTriangle },
          ].map(h => {
            const Icon = h.icon;
            return (
              <button
                key={h.id}
                onClick={() => { setActiveHelper(h.id); setResult(null); }}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition ${
                  activeHelper === h.id ? "bg-white/5 text-foreground border-b-2 border-lime" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {h.label}
              </button>
            );
          })}
        </div>

        {/* Inhalt */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Eingabe */}
          {activeHelper === "resources" && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground block">Auftrag wählen</label>
              <select
                value={orderId}
                onChange={e => setOrderId(e.target.value)}
                className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm"
              >
                <option value="">— Auftrag wählen —</option>
                {(state.orders || []).filter(o => o.status === "angenommen" || o.status === "offered").map(o => (
                  <option key={o.id} value={o.id}>{o.customer}: {o.fromCity} → {o.toCity}</option>
                ))}
              </select>
            </div>
          )}
          {activeHelper === "maintenance" && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground block">Fahrzeug wählen</label>
              <select
                value={vehicleId}
                onChange={e => setVehicleId(e.target.value)}
                className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm"
              >
                <option value="">— Fahrzeug wählen —</option>
                {(state.vehicles || []).filter(v => v.status !== "sold" && v.status !== "archived").map(v => {
                  const n = parseInt(String(v.id).replace(/[^0-9]/g, ""), 10);
                  const label = isNaN(n) ? v.id : "Lkw " + String(n).padStart(2, "0");
                  return <option key={v.id} value={v.id}>{label} (Zustand {v.condition})</option>;
                })}
              </select>
            </div>
          )}

          {/* Ausführen-Button */}
          {activeHelper !== "conflicts" && (
            <button
              onClick={runHelper}
              disabled={loading || (activeHelper === "resources" && !orderId) || (activeHelper === "maintenance" && !vehicleId)}
              className="w-full rounded-md bg-lime text-ink text-sm font-medium py-2 disabled:opacity-40 hover:brightness-110 transition"
            >
              {loading ? "Berechne…" : "Hilfe ausführen"}
            </button>
          )}

          {/* Ergebnis */}
          {result?.error && (
            <div className="text-xs text-red-400 rounded border border-red-500/20 bg-red-500/5 p-2">
              {result.error}
            </div>
          )}

          {activeHelper === "resources" && result?.ok && (
            <ResourcesResult result={result} state={state} />
          )}
          {activeHelper === "maintenance" && result?.ok && (
            <MaintenanceResult result={result} />
          )}
          {activeHelper === "conflicts" && (
            <ConflictsResult conflicts={(state.conflicts || []).length > 0 ? state.conflicts : (result?.conflicts || [])} />
          )}
        </div>
      </div>
    </div>
  );
}

function ResourcesResult({ result, state }) {
  if (!result.candidates || result.candidates.length === 0) {
    return <div className="text-xs text-muted-foreground py-4 text-center">Keine passenden Ressourcen gefunden.</div>;
  }
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">
        {result.candidates.length} passende Kombinationen für {result.order.customer}: {result.order.fromCity} → {result.order.toCity}
      </div>
      {result.candidates.map((c, i) => (
        <div key={i} className={`rounded border px-2 py-1.5 ${c.feasible ? "border-green-500/20 bg-green-500/5" : "border-white/10 bg-white/3"}`}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium">
              {c.vehicleLabel} + {c.driverLabel}
            </div>
            {c.feasible ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            )}
          </div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
            <Clock className="w-3 h-3" />
            Start: {formatPlanningTime(c.startMin)}
            <span>·</span>
            Deckungsbeitrag: {(c.contributionCents / 100).toFixed(0)} €
          </div>
          {c.obstacles.length > 0 && (
            <div className="text-[10px] text-amber-400 mt-0.5">
              {c.obstacles.join(" · ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function MaintenanceResult({ result }) {
  if (!result.windows || result.windows.length === 0) {
    return <div className="text-xs text-muted-foreground py-4 text-center">Keine Wartungsfenster gefunden. Fahrzeug ist vollständig ausgelastet.</div>;
  }
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">
        {result.windows.length} Wartungsfenster für {result.vehicleLabel} (Zustand {result.condition})
      </div>
      {result.windows.map((w, i) => (
        <div key={i} className={`rounded border px-2 py-1.5 ${
          w.quality === "good" ? "border-green-500/20 bg-green-500/5" : "border-amber-500/20 bg-amber-500/5"
        }`}>
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {formatPlanningTime(w.startMin)} — {formatPlanningTime(w.endMin)}
            </div>
            <span className={`text-[10px] ${w.quality === "good" ? "text-green-400" : "text-amber-400"}`}>
              {w.quality === "good" ? "Gut" : "Knapp"} ({Math.round(w.durationMin / 60)}h)
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{w.reason}</div>
        </div>
      ))}
    </div>
  );
}

function ConflictsResult({ conflicts }) {
  if (!conflicts || conflicts.length === 0) {
    return (
      <div className="text-xs text-green-400 py-4 text-center flex items-center justify-center gap-2">
        <CheckCircle className="w-4 h-4" />
        Keine Konflikte erkannt.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-muted-foreground">{conflicts.length} Konflikte erkannt:</div>
      {conflicts.map((c, i) => (
        <div key={i} className={`rounded border px-2 py-1.5 ${
          c.severity === "hard" ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"
        }`}>
          <div className="flex items-start gap-1.5">
            {c.severity === "hard"
              ? <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
              : <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            }
            <div className="text-xs">{c.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}