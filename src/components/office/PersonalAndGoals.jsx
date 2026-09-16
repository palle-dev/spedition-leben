import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getPersonalAppointments, getNextReachableGoal } from "@/lib/dailyOverviewData";
import { formatGameTime, dayOf } from "@/lib/gameData";
import { Heart, Target, Clock, ArrowRight, Check } from "lucide-react";

// Persönliche Termine und nächstes erreichbares Ziel.
// Kompakte Ansicht für die Büro-Tagesübersicht.
export default function PersonalAndGoals({ state }) {
  const navigate = useNavigate();
  const appointments = useMemo(() => getPersonalAppointments(state), [state]);
  const nextGoal = useMemo(() => getNextReachableGoal(state), [state]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Persönliche Termine */}
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
            <Heart className="w-4 h-4 text-coral/70" /> Persönliche Termine
          </h3>
          <button onClick={() => navigate("/zuhause")}
            className="text-[10px] text-coral/70 hover:text-coral transition flex items-center gap-0.5">
            Zuhause <ArrowRight className="w-2.5 h-2.5" />
          </button>
        </div>

        {appointments.length === 0 ? (
          <div className="text-xs text-muted-foreground/50 py-4 text-center">
            Keine anstehenden Termine.
          </div>
        ) : (
          <div className="space-y-2">
            {appointments.slice(0, 4).map(a => (
              <div key={a.id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
                a.isToday ? "border-coral/20 bg-coral/5" : "border-white/5 bg-surface-2/30"
              }`}>
                <Clock className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${a.isToday ? "text-coral" : "text-muted-foreground/60"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-foreground/90 truncate">{a.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{a.text}</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {a.isToday ? "Heute" : a.isTomorrow ? "Morgen" : `Tag ${dayOf(a.startMin)}`} · {formatGameTime(a.startMin)}
                  </div>
                </div>
                {a.status === "pending" && (
                  <span className="text-[9px] text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">Offen</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nächstes erreichbares Ziel */}
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
            <Target className="w-4 h-4 text-lime/70" /> Nächstes Ziel
          </h3>
          <button onClick={() => navigate("/erfolge")}
            className="text-[10px] text-lime/70 hover:text-lime transition flex items-center gap-0.5">
            Alle Ziele <ArrowRight className="w-2.5 h-2.5" />
          </button>
        </div>

        {!nextGoal ? (
          <div className="text-xs text-muted-foreground/50 py-4 text-center">
            Keine aktiven Ziele. Wähle bis zu drei auf der Erfolgs-Seite.
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground/90">{nextGoal.template.title}</span>
                <span className="text-xs font-medium text-lime tabular-nums">{nextGoal.pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                <div
                  className="h-full rounded-full bg-lime"
                  style={{ width: `${Math.min(100, nextGoal.pct)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                  {nextGoal.progress.progressDetail || (nextGoal.progress.current + " / " + nextGoal.progress.target)}
                </span>
                {nextGoal.progress.linkPath && (
                  <button onClick={() => navigate(nextGoal.progress.linkPath)}
                    className="text-[10px] text-lime/70 hover:text-lime transition">
                    Öffnen
                  </button>
                )}
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground/60 leading-relaxed">
              {nextGoal.template.desc}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}