import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, TrendingDown, ArrowRight } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { computeForecastHints } from "@/lib/simulation/liquidityForecastEngine";

// Zeigt kompakte Warnhinweise bei prognostizierten Liquiditätsengpässen.
// Nur sichtbar, wenn die Engine Warnungen erzeugt (nur bei Bedarf).
// Wird im Büro platziert, damit der Spieler frühzeitig auf Engpässe reagieren kann.
export default function ForecastHints() {
  const { state } = useGame();

  const hints = useMemo(() => {
    if (!state) return [];
    return computeForecastHints(state, { horizonDays: 7, minBufferCents: 20000 });
  }, [state?.gameTime, state?.company?.accountCents, state?.private?.accountCents,
      state?.accounting?.openItems, state?.loans, state?.leasingContracts,
      state?.trips, state?.orders]);

  if (hints.length === 0) return null;

  const hasCritical = hints.some(h => h.severity === "critical");

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${
      hasCritical
        ? "border-red-500/30 bg-red-500/5"
        : "border-coral/20 bg-coral/5"
    }`}>
      <div className={`text-xs font-medium flex items-center gap-1.5 ${
        hasCritical ? "text-red-400" : "text-coral"
      }`}>
        {hasCritical
          ? <AlertTriangle className="w-3.5 h-3.5" />
          : <TrendingDown className="w-3.5 h-3.5" />
        }
        Liquiditätsvorschau
      </div>
      {hints.map((h, i) => (
        <div key={i} className="text-xs text-foreground/80 flex items-start gap-2">
          <span className={hasCritical ? "text-red-400 mt-0.5" : "text-coral mt-0.5"}>•</span>
          <div className="flex-1">
            <span className="font-medium">{h.title}:</span>{" "}
            <span>{h.message}</span>
          </div>
        </div>
      ))}
      <Link
        to="/finanzen"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
      >
        Zur Liquiditätsvorschau <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}