import React from "react";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";

export default function XPBar({ xp, level }) {
  const pct = level.nextMinXp != null
    ? Math.min(100, ((xp - level.minXp) / (level.nextMinXp - level.minXp)) * 100)
    : 100;
  return (
    <div className="glass border border-white/10 rounded-2xl p-5 lg:p-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Erfahrungsstufe</div>
          <div className="text-lg font-medium mt-1">Stufe {level.level} · {level.title}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-medium tabular-nums text-lime">{xp.toLocaleString("de-DE")}</div>
          <div className="text-[10px] text-muted-foreground">XP gesamt</div>
        </div>
      </div>
      <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full bg-lime rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </div>
      {level.nextMinXp != null ? (
        <div className="text-[11px] text-muted-foreground mt-2 tabular-nums">
          Noch {(level.nextMinXp - xp).toLocaleString("de-DE")} XP bis Stufe {level.level + 1} · {level.nextTitle}
        </div>
      ) : (
        <div className="text-[11px] text-lime mt-2">Höchste Stufe erreicht.</div>
      )}
    </div>
  );
}