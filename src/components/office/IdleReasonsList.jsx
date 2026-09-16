import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getIdleReasonSummary } from "@/lib/officeData";
import { AlertTriangle, Wrench, Users, Clock, Package, ArrowRight } from "lucide-react";

// Zeigt kompakt, warum freie Fahrzeuge nicht automatisch disponiert wurden.
// Gruppiert nach Grund, priorisiert nach Dringlichkeit.
export default function IdleReasonsList({ state }) {
  const navigate = useNavigate();
  const reasons = useMemo(() => getIdleReasonSummary(state), [state]);

  if (reasons.length === 0) return null;

  const iconFor = (reason) => {
    if (reason.includes("Wartung")) return <Wrench className="w-3.5 h-3.5 text-coral" />;
    if (reason.includes("Gefahrgut")) return <AlertTriangle className="w-3.5 h-3.5 text-coral" />;
    if (reason.includes("Freigabe")) return <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />;
    if (reason.includes("Fahrer")) return <Users className="w-3.5 h-3.5 text-amber-300" />;
    if (reason.includes("ruhen")) return <Clock className="w-3.5 h-3.5 text-sky-300" />;
    if (reason.includes("Bestätigung")) return <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />;
    if (reason.includes("nicht profitab")) return <Package className="w-3.5 h-3.5 text-muted-foreground" />;
    return <Package className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <div className="glass border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-300/80" /> Stillstandgründe
        </h3>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {reasons.reduce((s, r) => s + r.count, 0)} Lkw blockiert
        </span>
      </div>

      <div className="space-y-2">
        {reasons.map((r, i) => (
          <div key={i} className="flex items-start gap-2.5 bg-surface-2/30 rounded-lg px-3 py-2.5 border border-white/5">
            <div className="mt-0.5 shrink-0">{iconFor(r.reason)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground/90">{r.reason}</span>
                <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">×{r.count}</span>
              </div>
              <div className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
                {r.vehicles.join(", ")}
                {r.more > 0 && <span className="text-muted-foreground/50"> +{r.more}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate("/disposition")}
        className="w-full mt-3 flex items-center justify-center gap-1.5 text-[11px] text-lime/80 hover:text-lime transition py-1.5"
      >
        Disposition öffnen <ArrowRight className="w-3 h-3" />
      </button>
    </div>
  );
}