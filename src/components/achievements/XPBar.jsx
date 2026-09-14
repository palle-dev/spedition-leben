import React from "react";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Sparkles } from "lucide-react";

export default function XPBar({ xp, level }) {
  const pct = level.nextMinXp != null
    ? Math.min(100, ((xp - level.minXp) / (level.nextMinXp - level.minXp)) * 100)
    : 100;

  return (
    <div className="glass border border-white/10 rounded-2xl p-5 lg:p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Erfahrungsstufe</div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="grid place-items-center w-7 h-7 rounded-lg bg-lime/15 border border-lime/20 text-lime text-sm font-semibold tabular-nums">
              {level.level}
            </span>
            <span className="text-base font-medium">{level.title}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-medium tabular-nums text-lime">{xp.toLocaleString("de-DE")}</div>
          <div className="text-[10px] text-muted-foreground">XP gesamt</div>
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-white/8 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-lime/70 to-lime rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </div>
      {level.nextMinXp != null ? (
        <div className="text-[11px] text-muted-foreground mt-2.5 tabular-nums flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-lime/50" />
          Noch {(level.nextMinXp - xp).toLocaleString("de-DE")} XP bis Stufe {level.level + 1} · {level.nextTitle}
        </div>
      ) : (
        <div className="text-[11px] text-lime mt-2.5 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Höchste Stufe erreicht.
        </div>
      )}
    </div>
  );
}