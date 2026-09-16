import React from "react";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { formatGameTime } from "@/lib/gameData";
import { Heart, Smile, AlertTriangle, Clock, CheckCircle2, XCircle, Hourglass } from "lucide-react";

// Kompakte Status-Übersicht für das StoryPanel.
// Zeigt Beziehungs-Indikatoren und offene Versprechen.
export default function StoryStatusOverview({ state }) {
  const p = state.private || {};
  const relationship = Math.round(p.relationship || 0);
  const happiness = Math.round(p.happiness || 0);
  const stress = Math.round(p.stress || 0);
  const promises = (p.promises || []).filter(pr => pr.status === "open");
  const gameTime = state.gameTime || 0;

  return (
    <div className="space-y-3">
      {/* Beziehungs-Indikatoren */}
      <div className="glass rounded-xl border border-white/10 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Heart className="w-3.5 h-3.5 text-coral/70" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Lebensindikatoren</span>
        </div>
        <div className="space-y-2.5">
          <LifeBar icon={Heart} label="Beziehung" value={relationship} max={100} colorClass="bg-coral" iconColor="text-coral" />
          <LifeBar icon={Smile} label="Zufriedenheit" value={happiness} max={100} colorClass="bg-lime" iconColor="text-lime" />
          <LifeBar icon={AlertTriangle} label="Belastung" value={stress} max={100} colorClass="bg-amber-400" iconColor="text-amber-300" inverted />
        </div>
      </div>

      {/* Offene Versprechen */}
      {promises.length > 0 && (
        <div className="glass rounded-xl border border-amber-500/20 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Hourglass className="w-3.5 h-3.5 text-amber-300/80" />
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Offene Versprechen</span>
            <span className="text-[10px] text-muted-foreground/50 tabular-nums ml-auto">{promises.length}</span>
          </div>
          <div className="space-y-2">
            {promises.map(pr => {
              const overdue = pr.dueMin != null && pr.dueMin < gameTime;
              const dueSoon = pr.dueMin != null && pr.dueMin < gameTime + 480 && !overdue;
              return (
                <div key={pr.id} className={`rounded-lg border px-3 py-2.5 ${
                  overdue ? "border-red-500/30 bg-red-500/5" : dueSoon ? "border-amber-500/25 bg-amber-500/5" : "border-white/8 bg-white/[0.02]"
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium leading-snug">{pr.description}</div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5">
                          {pr.personName ? (
                            <>
                              <Heart className="w-2.5 h-2.5 text-coral/50" />
                              {pr.personName}
                            </>
                          ) : (
                            <>
                              <Clock className="w-2.5 h-2.5" />
                              Versprechen
                            </>
                          )}
                        </span>
                        {pr.dueMin != null && (
                          <span className={`flex items-center gap-0.5 tabular-nums ${overdue ? "text-red-300" : dueSoon ? "text-amber-300" : ""}`}>
                            <Clock className="w-2.5 h-2.5" />
                            {overdue ? "Überfällig seit " : "Frist: "}{formatGameTime(pr.dueMin)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {overdue ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-red-300">
                          <XCircle className="w-3 h-3" /> überfällig
                        </span>
                      ) : dueSoon ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-300">
                          <AlertTriangle className="w-3 h-3" /> bald
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                          <CheckCircle2 className="w-3 h-3" /> offen
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LifeBar({ icon: Icon, label, value, max, colorClass, iconColor, inverted }) {
  const pct = Math.min(100, (value / max) * 100);
  const displayValue = inverted ? value : value;
  const statusLabel = inverted
    ? value >= 70 ? "hoch" : value >= 40 ? "mittel" : "niedrig"
    : value >= 70 ? "gut" : value >= 40 ? "mittel" : "niedrig";

  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Icon className={`w-2.5 h-2.5 ${iconColor}`} />
          {label}
        </span>
        <span className="tabular-nums text-muted-foreground/70">{displayValue}/{max} · {statusLabel}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${colorClass}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: EASE }}
        />
      </div>
    </div>
  );
}