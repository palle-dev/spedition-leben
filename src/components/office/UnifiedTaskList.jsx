import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { getUnifiedTasks } from "@/lib/dailyOverviewData";
import { formatEuro } from "@/lib/gameData";
import { AlertTriangle, Clock, ArrowRight, CheckCircle2, Users, Wrench, Target } from "lucide-react";

// Vereinheitlichte Aufgaben- und Entscheidungsliste.
// Verbindet Freigaben, Einladungen, unzugewiesene Aufträge, offene Kosten,
// Urlaubsanträge, Kündigungen und Szenario-Verpflichtungen in einer Ansicht.
// Dedupliziert Vorgänge, die gleichzeitig im Postfach und in Freigaben erscheinen.
export default function UnifiedTaskList({ state }) {
  const { send, showToast } = useGame();
  const navigate = useNavigate();
  const tasks = useMemo(() => getUnifiedTasks(state), [state]);

  if (tasks.length === 0) {
    return (
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-lime/60" /> Aufgaben & Entscheidungen
          </h3>
        </div>
        <div className="text-center py-8">
          <CheckCircle2 className="w-8 h-8 text-lime/30 mx-auto mb-3" />
          <div className="text-sm text-foreground/80 font-medium">Alles erledigt.</div>
          <div className="text-xs text-muted-foreground/60 mt-1">
            Neue Aufträge und Entwicklungsmöglichkeiten findest du auf den Fachseiten.
          </div>
        </div>
      </div>
    );
  }

  async function handleAction(task) {
    if (task.action?.command) {
      try {
        await send(task.action.command, task.action.params || {});
        showToast("Erledigt", "success");
      } catch (e) {
        showToast(e.message, "error");
      }
      return;
    }
    if (task.action?.to) {
      navigate(task.action.to);
    }
  }

  const categoryIcon = (cat) => {
    const icons = {
      approval: AlertTriangle, personal: Clock, dispatch: ArrowRight,
      finance: AlertTriangle, personnel: Users, fleet: Wrench, scenario: Target,
    };
    return icons[cat] || AlertTriangle;
  };

  const categoryColor = (cat) => {
    if (cat === "approval") return "text-amber-300";
    if (cat === "personal") return "text-coral";
    if (cat === "dispatch") return "text-amber-300";
    if (cat === "finance") return "text-red-300";
    if (cat === "scenario") return "text-lime";
    return "text-muted-foreground";
  };

  return (
    <div className="glass border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-300/80" /> Aufgaben & Entscheidungen
        </h3>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {tasks.length} offen
        </span>
      </div>

      <div className="space-y-2 max-h-[480px] overflow-y-auto scrollbar-none -mr-1 pr-1">
        {tasks.map(t => {
          const Icon = categoryIcon(t.category);
          const color = categoryColor(t.category);
          return (
            <div
              key={t.dedupKey}
              className={`rounded-lg border p-3 ${
                t.overdue ? "border-red-400/30 bg-red-500/5" : "border-white/8 bg-surface-2/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`w-3.5 h-3.5 ${color} shrink-0`} />
                    <span className="text-sm font-medium text-foreground">{t.title}</span>
                  </div>
                  <div className="text-xs text-foreground/70 ml-5">
                    {t.person && <span>{t.person}</span>}
                    {t.person && t.source && <span className="text-muted-foreground/50"> · </span>}
                    {t.source && <span className="text-muted-foreground/60">{t.source}</span>}
                  </div>
                  {t.costCents > 0 && (
                    <div className="text-xs text-amber-300 ml-5 mt-0.5 tabular-nums">
                      {formatEuro(t.costCents)}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground/70 mt-1 ml-5 leading-relaxed">
                    {t.consequence}
                  </div>
                  <div className={`flex items-center gap-1 text-[10px] mt-1.5 ml-5 ${t.overdue ? "text-red-300" : "text-muted-foreground"}`}>
                    <Clock className="w-2.5 h-2.5" /> {t.deadlineLabel}
                    {t.overdue && <span className="font-medium">· überfällig</span>}
                  </div>
                </div>
                {t.action && (
                  <button
                    onClick={() => handleAction(t)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-lime hover:text-lime/80 transition px-2.5 py-1.5 rounded-md bg-lime/10 border border-lime/20 whitespace-nowrap"
                  >
                    {t.action.label} <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}