import React, { useState, useMemo } from "react";
import { TrendingUp, AlertTriangle, Info, Eye, Calculator } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { computeLiquidityForecast, PAYMENT_RULES } from "@/lib/simulation/liquidityForecastEngine";
import { formatEuro, formatKEuro, viewLabel, viewDescription } from "@/lib/forecastData";
import ForecastChart from "@/components/finance/ForecastChart";
import ForecastTable from "@/components/finance/ForecastTable";
import DecisionComparison from "@/components/finance/DecisionComparison";

// Hauptkomponente: Liquiditätsvorschau mit Ansichts-Umschaltung,
// Kurve, Tabelle und Entscheidungsvergleich.
export default function LiquidityForecast() {
  const { state } = useGame();
  const [horizonDays, setHorizonDays] = useState(7);
  const [view, setView] = useState("known");
  const [showComparison, setShowComparison] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Konservative Annahmen
  const [assumptions, setAssumptions] = useState({
    revenueDelayDays: 1,
    costMultiplier: 1.15,
    revenueHaircut: 0.1,
  });

  // Prognose berechnen — memoized, nur bei relevanten Änderungen neu berechnet.
  // Der Berechnungszeitpunkt (state.gameTime) ist der Key-Trigger.
  const forecast = useMemo(() => {
    return computeLiquidityForecast(state, {
      horizonDays,
      view,
      assumptions: view === "conservative" ? assumptions : null,
      minBufferCents: 20000,
    });
  }, [state.gameTime, state.company?.accountCents, state.private?.accountCents,
      state.accounting?.openItems, state.loans, state.leasingContracts,
      state.trips, state.orders, state.vehicles, state.drivers, state.employees,
      state.branches, state.contracts, state.workshop?.maintenanceOrders,
      horizonDays, view, assumptions]);

  const calcTime = useMemo(() => {
    const m = forecast.calculationMin;
    const day = Math.floor(m / 1440) + 1;
    const clock = m % 1440;
    const h = Math.floor(clock / 60);
    const min = clock % 60;
    return `Tag ${day}, ${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }, [forecast.calculationMin]);

  return (
    <div className="space-y-4">
      {/* Header mit Zeitstempel */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-lime" />
            Liquiditätsvorschau
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Berechnet am {calcTime} · Prognose ohne Gewähr — keine Buchungen, keine Reservierungen
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Horizont-Auswahl */}
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {[7, 30].map(h => (
              <button
                key={h}
                onClick={() => setHorizonDays(h)}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  horizonDays === h
                    ? "bg-lime text-ink"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                {h} Tage
              </button>
            ))}
          </div>
          {/* Zahlungsregeln */}
          <button
            onClick={() => setShowRules(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 transition"
          >
            <Info className="w-3.5 h-3.5" />
            Zahlungsregeln
          </button>
          {/* Entscheidungsvergleich */}
          <button
            onClick={() => setShowComparison(s => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition ${
              showComparison
                ? "bg-lime/10 border-lime/30 text-lime"
                : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            Auswirkung prüfen
          </button>
        </div>
      </div>

      {/* Ansichts-Umschaltung */}
      <div className="flex flex-col gap-2">
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {["known", "expected", "conservative"].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 px-4 py-2 text-sm font-medium transition ${
                view === v
                  ? "bg-lime text-ink"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {viewLabel(v)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {viewDescription(view)}
        </p>
      </div>

      {/* Konservative Annahmen (nur in Ansicht C) */}
      {view === "conservative" && (
        <div className="rounded-lg border border-coral/20 bg-coral/5 p-3 space-y-3">
          <div className="text-xs font-medium text-coral flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Einstellbare Annahmen für vorsichtige Planung
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground block">Erlösverzögerung (Tage)</span>
              <input
                type="number"
                min="0"
                max="10"
                value={assumptions.revenueDelayDays}
                onChange={e => setAssumptions(a => ({ ...a, revenueDelayDays: Math.max(0, Math.min(10, +e.target.value || 0)) }))}
                className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground block">Kosten-Aufschlag (%)</span>
              <input
                type="number"
                min="0"
                max="100"
                value={Math.round((assumptions.costMultiplier - 1) * 100)}
                onChange={e => setAssumptions(a => ({ ...a, costMultiplier: 1 + Math.max(0, Math.min(100, +e.target.value || 0)) / 100 }))}
                className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground block">Erlös-Kürzung (%)</span>
              <input
                type="number"
                min="0"
                max="50"
                value={Math.round(assumptions.revenueHaircut * 100)}
                onChange={e => setAssumptions(a => ({ ...a, revenueHaircut: Math.max(0, Math.min(50, +e.target.value || 0)) / 100 }))}
                className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm tabular-nums"
              />
            </label>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Diese Annahmen verändern die laufende Simulation nicht. Sie sind ein alternatives Rechenmodell, keine garantierte Untergrenze.
          </p>
        </div>
      )}

      {/* KPI-Zusammenfassung */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Firmenkonto jetzt"
          value={formatEuro(forecast.company.startBalance)}
          sub="Aktueller Stand"
        />
        <KpiCard
          label="Firma Endsaldo"
          value={formatEuro(forecast.company.endBalance)}
          sub={`nach ${horizonDays} Tagen`}
          highlight={forecast.company.endBalance < forecast.company.startBalance ? "neg" : "pos"}
        />
        <KpiCard
          label="Firma niedrigster Stand"
          value={formatEuro(forecast.company.minBalance)}
          sub={`an Tag ${forecast.company.minBalanceDay}`}
          highlight={forecast.company.minBalance < 0 ? "neg" : forecast.company.minBalance < 20000 ? "warn" : "neutral"}
        />
        <KpiCard
          label="Privatkonto Endsaldo"
          value={formatEuro(forecast.private.endBalance)}
          sub={`niedrigster: ${formatKEuro(forecast.private.minBalance)} (T${forecast.private.minBalanceDay})`}
          highlight={forecast.private.minBalance < 0 ? "neg" : "neutral"}
        />
      </div>

      {/* Warnungen */}
      {forecast.warnings.length > 0 && (
        <div className="rounded-lg border border-coral/20 bg-coral/5 p-3 space-y-1.5">
          <div className="text-xs font-medium text-coral flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Prognostizierte Engpässe ({forecast.warnings.length})
          </div>
          {forecast.warnings.slice(0, 5).map((w, i) => (
            <div key={i} className="text-xs text-foreground/80 flex items-start gap-2">
              <span className="text-coral mt-0.5">•</span>
              <span>{w.message}</span>
            </div>
          ))}
          {forecast.warnings.length > 5 && (
            <div className="text-[11px] text-muted-foreground">
              … und {forecast.warnings.length - 5} weitere
            </div>
          )}
        </div>
      )}

      {/* Kurve */}
      <div className="rounded-lg border border-white/10 glass p-3">
        <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
          <Eye className="w-3.5 h-3.5" />
          Kontoverlauf (Prognose)
        </div>
        <ForecastChart forecast={forecast} />
        <p className="text-[11px] text-muted-foreground mt-2">
          Ein positiver Tagesendbestand beweist nicht, dass zwischenzeitlich jede Zahlung möglich ist.
          Die Auflösung erfolgt tagesweise — präzise Zahlungszeitpunkte innerhalb eines Tages sind nicht abgebildet.
        </p>
      </div>

      {/* Tabelle */}
      <div className="rounded-lg border border-white/10 glass p-3">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          Tagesübersicht — Tag anklicken für Details
        </div>
        <ForecastTable forecast={forecast} />
      </div>

      {/* Entscheidungsvergleich */}
      {showComparison && (
        <DecisionComparison state={state} horizonDays={horizonDays} assumptions={view === "conservative" ? assumptions : null} />
      )}

      {/* Zahlungsregeln */}
      {showRules && (
        <div className="rounded-lg border border-white/10 glass p-4 space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <Info className="w-4 h-4 text-lime" />
            Zugrundeliegende Zahlungsregeln
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(PAYMENT_RULES).map(([key, rule]) => (
              <div key={key} className="text-xs">
                <span className="text-muted-foreground">{key}: </span>
                <span className="text-foreground/80">{rule}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Diese Regeln wurden aus der tatsächlich implementierten Simulationslogik abgeleitet.
            Die Vorschau erfindet keine zusätzlichen Zahlungsziele.
          </p>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, sub, highlight }) {
  const colorClass = highlight === "neg" ? "text-red-400"
    : highlight === "warn" ? "text-coral"
    : highlight === "pos" ? "text-lime"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-white/10 glass p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-1 ${colorClass}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}