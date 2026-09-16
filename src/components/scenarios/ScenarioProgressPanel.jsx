import React from "react";
import { useGame } from "@/lib/gameContext";
import { getScenarioProgress } from "@/lib/scenarios/scenarioEngine";
import { Clock, Target, AlertTriangle, CheckCircle2, XCircle, Calendar, Activity } from "lucide-react";
import { formatGameTime } from "@/lib/gameData";

// Szenario-Fortschritts-Panel für das Büro.
// Zeigt verbleibende Zeit, Ziele, Verpflichtungen und Risiken.
export default function ScenarioProgressPanel() {
  const { state } = useGame();
  if (!state?.scenario || state.scenario.status !== "active") return null;

  const progress = getScenarioProgress(state);
  if (!progress) return null;

  const fmtCents = (c) => (c / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " €";
  const fmtMin = (m) => {
    const day = Math.floor(m / 1440) + 1;
    const h = Math.floor((m % 1440) / 60);
    return `Tag ${day}, ${String(h).padStart(2, "0")}:00`;
  };

  return (
    <div className="glass border border-white/10 rounded-2xl p-5 space-y-4">
      {/* Kopfzeile */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-lime" />
          <h2 className="text-lg font-semibold text-foreground">{progress.title}</h2>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-lime/10 border border-lime/20">
          <Clock className="w-4 h-4 text-lime" />
          <span className="text-sm font-medium text-lime">
            {progress.remainingDays > 0 ? `Noch ${progress.remainingDays} Tag${progress.remainingDays === 1 ? "" : "e"}` : "Stichtag erreicht"}
          </span>
        </div>
      </div>

      {/* Auszeit-Banner (nur bei aktivem Szenario 3) */}
      {progress.isTimeoffActive && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-coral/10 border border-coral/30">
          <Activity className="w-4 h-4 text-coral shrink-0" />
          <span className="text-sm text-coral">
            Private Auszeit aktiv — {progress.interventions} operative Eingriff{progress.interventions === 1 ? "" : "e"} (max. 3), {progress.deliveriesDuringTimeoff} Lieferung{progress.deliveriesDuringTimeoff === 1 ? "" : "en"} (min. 5)
          </span>
        </div>
      )}

      {/* Verbindliche Ziele */}
      <div className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Verbindliche Ziele</h3>
        {progress.mandatoryGoals.map((goal) => (
          <div key={goal.id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-surface-2/50 border border-white/5">
            <div className="flex items-center gap-2 min-w-0">
              {goal.met ? (
                <CheckCircle2 className="w-4 h-4 text-lime shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-muted-foreground/40 shrink-0" />
              )}
              <span className={`text-sm truncate ${goal.met ? "text-foreground" : "text-muted-foreground"}`}>
                {goal.label}
              </span>
            </div>
            {goal.display && (
              <span className={`text-xs font-medium shrink-0 ${goal.met ? "text-lime" : "text-muted-foreground"}`}>
                {goal.display}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Optionale Ziele */}
      {progress.optionalGoals.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Optionale Ziele</h3>
          {progress.optionalGoals.map((goal) => (
            <div key={goal.id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-surface-2/30 border border-white/5">
              <div className="flex items-center gap-2 min-w-0">
                {goal.met ? (
                  <CheckCircle2 className="w-4 h-4 text-invest-cyan shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" />
                )}
                <span className={`text-sm truncate ${goal.met ? "text-foreground" : "text-muted-foreground"}`}>
                  {goal.label}
                </span>
              </div>
              {goal.display && (
                <span className={`text-xs shrink-0 ${goal.met ? "text-invest-cyan" : "text-muted-foreground"}`}>
                  {goal.display}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Anstehende Verpflichtungen */}
      {progress.obligations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Anstehende Verpflichtungen</h3>
          {progress.obligations.slice(0, 5).map((ob, i) => (
            <div key={i} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg bg-surface-2/30 border border-white/5">
              <div className="flex items-center gap-2 min-w-0">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground truncate">{ob.label}</span>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-muted-foreground">{fmtMin(ob.atMin)}</div>
                {ob.amountCents != null && <div className="text-xs font-medium text-coral">{fmtCents(ob.amountCents)}</div>}
                {ob.total != null && <div className="text-xs text-muted-foreground">{ob.timely}/{ob.total} pünktlich</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Zielrisiken */}
      {progress.risks.length > 0 && (
        <div className="space-y-1.5">
          {progress.risks.map((risk, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm text-amber-300">{risk}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}