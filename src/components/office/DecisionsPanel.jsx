import React from "react";
import { useNavigate } from "react-router-dom";
import { getDecisions } from "@/lib/officeData";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock } from "lucide-react";

// Priorisierte Entscheidungsliste mit konkreten Aktionen.
export default function DecisionsPanel({ state }) {
  const navigate = useNavigate();
  const decisions = getDecisions(state);

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Deine Entscheidungen
        </h3>
        <span className="text-[10px] text-muted-foreground tabular-nums">{decisions.length} offen</span>
      </div>

      {decisions.length === 0 ? (
        <div className="text-center py-6">
          <CheckCircle2 className="w-6 h-6 text-lime/40 mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">Alles erledigt.</div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">
            Neue Aufträge oder Entwicklungsmöglichkeiten warten auf der Auftragsseite.
          </div>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-none">
          {decisions.map(d => (
            <div key={d.id} className="border border-white/10 rounded-lg p-2.5 hover:border-white/20 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{d.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{d.resource}</div>
                  <div className="text-[10px] text-muted-foreground/80 mt-0.5 leading-relaxed">{d.detail}</div>
                  <div className="flex items-center gap-1 text-[10px] text-amber-300 mt-1">
                    <Clock className="w-2.5 h-2.5" /> {d.deadline}
                  </div>
                </div>
                {d.action && (
                  <button
                    onClick={() => navigate(d.action.to)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-lime hover:text-lime/80 transition px-2 py-1 rounded bg-lime/10 border border-lime/20"
                  >
                    {d.action.label} <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}