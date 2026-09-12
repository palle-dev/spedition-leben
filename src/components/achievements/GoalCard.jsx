import React from "react";
import { Target, X, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { getGoalProgress } from "@/lib/progressEngine";
import { formatEuro } from "@/lib/gameData";

export default function GoalCard({ goal, state, onRemove }) {
  const prog = getGoalProgress(state, goal);
  const pct = Math.min(100, (prog.current / prog.target) * 100);
  const isMoney = prog.target >= 100000;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={`rounded-xl p-4 border ${prog.completed ? "border-lime/30 bg-lime/5" : "border-coral/20 bg-coral/5"}`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${prog.completed ? "bg-lime/15 text-lime" : "bg-coral/15 text-coral"}`}>
          {prog.completed ? <CheckCircle2 className="w-4 h-4" /> : <Target className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate">{goal.title || goal.templateId}</span>
            <button onClick={() => onRemove(goal.id)} className="text-muted-foreground hover:text-red-300 transition shrink-0" aria-label="Ziel entfernen">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5">{goal.desc || ""}</p>
          <div className="mt-2.5">
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${prog.completed ? "bg-lime" : "bg-coral"}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                {isMoney ? formatEuro(prog.current) : prog.current.toLocaleString("de-DE")} / {isMoney ? formatEuro(prog.target) : prog.target.toLocaleString("de-DE")}
              </span>
              {prog.remaining != null && prog.remaining > 0 && (
                <span className="text-[10px] text-coral/70 tabular-nums">noch {formatEuro(prog.remaining)}</span>
              )}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground/60 mt-1.5">Nächster Schritt: {prog.nextAction}</div>
        </div>
      </div>
    </motion.div>
  );
}