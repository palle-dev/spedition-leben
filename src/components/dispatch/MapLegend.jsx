import React, { useState } from "react";
import { TRAFFIC_LEVELS } from "@/lib/trafficSystem";
import { ChevronDown, TrafficCone } from "lucide-react";

// Kompakte Legende für die Kartenansicht — Verkehrslage und Routentypen.
export default function MapLegend({ showTraffic }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="absolute bottom-3 left-3 z-10 max-w-[220px]">
      <div className="glass border border-white/10 rounded-xl overflow-hidden">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-foreground hover:bg-white/5 transition"
        >
          <span className="flex items-center gap-1.5">
            <TrafficCone className="w-3.5 h-3.5 text-amber-300" />
            Legende
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {expanded && (
          <div className="px-3 pb-3 pt-1 space-y-2.5">
            {showTraffic && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Verkehrslage</div>
                <div className="space-y-1">
                  {TRAFFIC_LEVELS.map(l => (
                    <div key={l.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: l.color }} />
                      <span className="text-foreground/80">{l.label}</span>
                      {l.delayPct > 0 && <span className="text-muted-foreground ml-auto tabular-nums">+{l.delayPct}%</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Routen</div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-6 h-0.5 rounded-full bg-lime shrink-0" />
                  <span className="text-foreground/80">Beladene Fahrt</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-6 h-0.5 rounded-full shrink-0 border-t-2 border-dashed border-coral" style={{ borderStyle: "dashed" }} />
                  <span className="text-foreground/80">Leerfahrt</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-3 h-3 rounded-full bg-lime shrink-0" />
                  <span className="text-foreground/80">Hauptsitz</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-3 h-3 rounded-full bg-amber-300 shrink-0" />
                  <span className="text-foreground/80">Unterwegs</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}