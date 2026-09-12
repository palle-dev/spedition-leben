import React from "react";
import { useNavigate } from "react-router-dom";
import { getFleetStats } from "@/lib/officeData";
import { Truck, ArrowRight, Wrench, AlertTriangle } from "lucide-react";

// Kompakte Flotten-Lage für die Büro-Übersicht.
// Zeigt aggregierte Kennzahlen statt einer detaillierten Fahrzeugtabelle.
export default function FleetSummary({ state }) {
  const navigate = useNavigate();
  const fleet = getFleetStats(state);

  const statusItems = [
    { key: "free", label: "Frei", count: fleet.byStatus.free, color: "text-lime", dot: "bg-lime" },
    { key: "on_trip", label: "Unterwegs", count: fleet.byStatus.on_trip, color: "text-amber-300", dot: "bg-amber-300" },
    { key: "maintenance", label: "Wartung", count: fleet.byStatus.maintenance, color: "text-sky-300", dot: "bg-sky-300" },
  ];

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" /> Flottenlage
          <span className="text-foreground/60">· {fleet.total} Lkw</span>
        </h3>
        <button onClick={() => navigate("/fuhrpark")}
          className="text-[11px] text-lime/70 hover:text-lime transition flex items-center gap-1">
          Fuhrpark <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Status-Verteilung */}
      <div className="grid grid-cols-3 gap-2">
        {statusItems.map(s => (
          <div key={s.key} className="rounded-lg bg-surface-2/40 border border-white/5 p-2.5 text-center">
            <div className={`text-xl font-medium tabular-nums ${s.color}`}>{s.count}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Warnungen */}
      <div className="mt-3 space-y-1.5">
        {fleet.criticalCondition > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-coral bg-coral/5 border border-coral/15 rounded-lg px-2.5 py-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {fleet.criticalCondition} Lkw im kritischen Zustand (&lt;30)
          </div>
        )}
        {fleet.byStatus.maintenance > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-sky-300 bg-sky-300/5 border border-sky-300/15 rounded-lg px-2.5 py-1.5">
            <Wrench className="w-3 h-3 shrink-0" />
            {fleet.byStatus.maintenance} Lkw in Wartung
          </div>
        )}
        {fleet.criticalCondition === 0 && fleet.byStatus.maintenance === 0 && (
          <div className="text-[11px] text-muted-foreground/70 text-center py-1">
            Alle Fahrzeuge einsatzbereit.
          </div>
        )}
      </div>

      {/* Besitz-Verteilung */}
      {fleet.byOwnership.leased > 0 && (
        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{fleet.byOwnership.owned} eigene · {fleet.byOwnership.leased} geleast</span>
        </div>
      )}
    </div>
  );
}