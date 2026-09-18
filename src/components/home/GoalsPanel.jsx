import React, { useState } from "react";
import { formatEuro } from "@/lib/gameData";
import { GOAL_TEMPLATES } from "@/lib/achievementCatalog";
import { getGoalProgress as computeGoalProgress } from "@/lib/progressEngine";
import Drawer from "@/components/ui/Drawer";
import { Target, Plus, X, Check, ChevronRight } from "lucide-react";

export default function GoalsPanel({ state, send, showToast }) {
  const [showCatalog, setShowCatalog] = useState(false);
  const goals = state.goals || [];

  async function handleAttach(templateId) {
    try {
      await send("attachGoal", { templateId });
      showToast("Ziel angeheftet.", "success");
      setShowCatalog(false);
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleRemove(goalId) {
    try {
      await send("removeGoal", { goalId });
      showToast("Ziel entfernt.", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  function getGoalProgress(goal) {
    const tpl = GOAL_TEMPLATES.find(t => t.id === goal.templateId);
    if (!tpl) return { current: 0, target: 1, pct: 0, isPurchase: false };
    const progress = computeGoalProgress(state, goal);
    return { ...progress, pct: progress.target > 0 ? Math.max(0, Math.min(100, progress.current / progress.target * 100)) : 0,
      isPurchase: tpl.type === "purchase" || tpl.statKey === "companyValue" || tpl.statKey === "totalRevenueCents" };

  }

  return (
    <div className="space-y-3">
      {goals.length === 0 ? (
        <div className="text-center py-6">
          <Target className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">Keine Ziele angeheftet.</div>
          <div className="text-[10px] text-muted-foreground/70 mt-1">Hefte bis zu drei persönliche Ziele an.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {goals.map(goal => {
            const tpl = GOAL_TEMPLATES.find(t => t.id === goal.templateId);
            const prog = getGoalProgress(goal);
            const done = prog.current >= prog.target;
            return (
              <div key={goal.id} className="glass border border-white/10 rounded-xl p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      {done && <Check className="w-3.5 h-3.5 text-lime" />}
                      {goal.title}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{goal.desc}</div>
                  </div>
                  <button onClick={() => handleRemove(goal.id)} className="shrink-0 p-1 text-muted-foreground/50 hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                    <span>{prog.isPurchase ? `${formatEuro(prog.current)} / ${formatEuro(prog.target)}` : `${prog.current} / ${prog.target}`}</span>
                    <span>{Math.round(prog.pct)}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className={`h-full rounded-full ${done ? "bg-lime" : "bg-coral"}`} style={{ width: `${prog.pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground/70 mt-1.5">{tpl?.nextAction}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {goals.length < 3 && (
        <button
          onClick={() => setShowCatalog(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/15 text-muted-foreground hover:text-foreground hover:border-white/25 text-xs transition"
        >
          <Plus className="w-3.5 h-3.5" /> Ziel anheften
        </button>
      )}

      <Drawer open={showCatalog} onClose={() => setShowCatalog(false)} title="Ziel auswählen" maxWidth="max-w-md">
        <div className="space-y-2">
          {GOAL_TEMPLATES.filter(t => !goals.some(g => g.templateId === t.id)).map(tpl => (
            <button
              key={tpl.id}
              onClick={() => handleAttach(tpl.id)}
              className="w-full text-left glass border border-white/10 rounded-xl p-3 hover:border-coral/30 transition"
            >
              <div className="text-sm font-medium">{tpl.title}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{tpl.desc}</div>
              <div className="text-[10px] text-coral/70 mt-1 flex items-center gap-1">
                <ChevronRight className="w-2.5 h-2.5" /> {tpl.nextAction}
              </div>
            </button>
          ))}
        </div>
      </Drawer>
    </div>
  );
}