import React, { useEffect, useState } from "react";
import { formatGameTime, dayOf } from "@/lib/gameData";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { BookOpen, Heart, Trophy, Clock, Calendar } from "lucide-react";

// Persönliche Chronik – wichtige Erinnerungen, abgeschlossene Vorhaben,
// Beziehungs- und Familienmeilensteine. Bleibt nach Historienbereinigung erhalten.
export default function ChroniclePanel({ state, send }) {
  const [chronicle, setChronicle] = useState(null);
  const [promises, setPromises] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const chr = await send("getChronicle", {});
        setChronicle(chr.chronicle);
        const pr = await send("getPromises", {});
        setPromises(pr.promises);
      } catch (e) {}
    })();
  }, [state.gameTime, state.private?.chronicle?.length]);

  if (!chronicle) return null;

  const iconFor = (type) => {
    if (type === "milestone") return <Heart className="w-3.5 h-3.5 text-coral" />;
    if (type === "achievement") return <Trophy className="w-3.5 h-3.5 text-lime" />;
    return <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <div className="space-y-5">
      {/* Offene Versprechen */}
      {promises && promises.length > 0 && (
        <div className="glass rounded-2xl border border-amber-400/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-amber-300" />
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Zugesagte Versprechen</span>
          </div>
          <div className="space-y-2">
            {promises.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs border border-white/10 rounded-lg px-3 py-2 bg-surface/40">
                <span className="text-foreground/80">{p.description}</span>
                <span className="text-muted-foreground tabular-nums flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {formatGameTime(p.dueMin)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chronik */}
      <div className="glass rounded-2xl border border-white/10 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-coral" />
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Persönliche Chronik</span>
        </div>
        {chronicle.length === 0 ? (
          <div className="text-sm text-muted-foreground/50">Noch keine Erinnerungen festgehalten.</div>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto scrollbar-none">
            {chronicle.map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: EASE, delay: Math.min(i * 0.03, 0.3) }}
                className="flex gap-3 pb-3 border-b border-white/5 last:border-0"
              >
                <div className="shrink-0 mt-0.5">{iconFor(entry.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground/90">{entry.title}</span>
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                      Tag {dayOf(entry.min)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{entry.text}</p>
                  {entry.participants && entry.participants.length > 0 && (
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/60">
                      <Heart className="w-2.5 h-2.5" />
                      {entry.participants.join(", ")}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}