import React from "react";
import { motion } from "framer-motion";
import { Trophy, Lock, Star, Check } from "lucide-react";
import { EASE } from "@/lib/motion";
import { getAchievementProgress } from "@/lib/progressEngine";
import { formatEuro } from "@/lib/gameData";

export default function AchievementCard({ achievement, state }) {
  const entry = (state.achievements || []).find(a => a.id === achievement.id);
  const unlocked = entry?.unlocked;
  const prog = getAchievementProgress(state, achievement.id);
  const pct = Math.min(100, (prog.current / prog.target) * 100);
  const isMoney = prog.target >= 100000;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className={`rounded-xl p-4 border transition-all duration-200 ${
        unlocked
          ? "border-lime/25 bg-lime/[0.04] hover:border-lime/40"
          : "border-white/10 bg-surface/30 hover:border-white/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 transition ${
          unlocked ? "bg-lime/15 text-lime" : "bg-white/5 text-muted-foreground/40"
        }`}>
          {unlocked ? <Trophy className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium truncate">{achievement.title}</span>
            <span className={`text-[10px] font-semibold tabular-nums shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${
              unlocked ? "bg-lime/10 text-lime" : "bg-white/5 text-muted-foreground/60"
            }`}>
              <Star className="w-3 h-3" /> {achievement.xp}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{achievement.desc}</p>
          {!unlocked && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                <div className="h-full bg-lime/60 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[10px] text-muted-foreground/70 mt-1.5 tabular-nums">
                {isMoney ? formatEuro(prog.current) : prog.current.toLocaleString("de-DE")} / {isMoney ? formatEuro(prog.target) : prog.target.toLocaleString("de-DE")}
              </div>
            </div>
          )}
          {unlocked && (
            <div className="text-[10px] text-lime/80 mt-2 flex items-center gap-1">
              <Check className="w-3 h-3" /> Freigeschaltet
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}