import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getDecisions } from "@/lib/officeData";
import { ArrowRight, CheckCircle2, Clock, CircleAlert } from "lucide-react";

// Priorisierte Aktionsliste mit klarer visueller Gewichtung.
// Jede Entscheidung ist eine eigenständige Karte mit Aktion-Button.
export default function DecisionsPanel({ state }) {
  const navigate = useNavigate();
  const decisions = useMemo(() => getDecisions(state), [state]);

  const priorityColor = (p) => {
    if (p >= 75) return { border: "border-red-400/20", bg: "bg-red-500/5", text: "text-red-300", dot: "bg-red-400" };
    if (p >= 55) return { border: "border-amber-400/20", bg: "bg-amber-500/5", text: "text-amber-300", dot: "bg-amber-400" };
    return { border: "border-white/10", bg: "bg-surface-2/30", text: "text-muted-foreground", dot: "bg-muted-foreground/40" };
  };

  return (
    <div className="glass border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
          <CircleAlert className="w-4 h-4 text-amber-300/80" /> Aktionsliste
        </h3>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {decisions.length > 0 ? `${decisions.length} offen` : "Aktuell"}
        </span>
      </div>

      {decisions.length === 0 ? (
        <div className="text-center py-8">
          <CheckCircle2 className="w-8 h-8 text-lime/30 mx-auto mb-3" />
          <div className="text-sm text-foreground/80 font-medium">Alles erledigt.</div>
          <div className="text-xs text-muted-foreground/60 mt-1">
            Neue Aufträge und Entwicklungsmöglichkeiten findest du auf der Auftragsseite.
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-none -mr-1 pr-1">
          {decisions.map(d => {
            const c = priorityColor(d.priority);
            return (
              <div key={d.id} className={`rounded-lg border ${c.border} ${c.bg} p-3`}>
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`} />
                      <span className="text-sm font-medium text-foreground">{d.title}</span>
                    </div>
                    <div className="text-xs text-foreground/70 ml-3">{d.resource}</div>
                    <div className="text-[11px] text-muted-foreground/80 mt-1 ml-3 leading-relaxed">{d.detail}</div>
                    <div className={`flex items-center gap-1 text-[10px] ${c.text} mt-1.5 ml-3`}>
                      <Clock className="w-2.5 h-2.5" /> {d.deadline}
                    </div>
                  </div>
                  {d.action && (
                    <button
                      onClick={() => navigate(d.action.to)}
                      className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-lime hover:text-lime/80 transition px-2.5 py-1.5 rounded-md bg-lime/10 border border-lime/20 whitespace-nowrap"
                    >
                      {d.action.label} <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}