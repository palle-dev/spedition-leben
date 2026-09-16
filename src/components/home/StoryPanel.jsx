import React, { useState, useEffect } from "react";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import { motion, AnimatePresence } from "framer-motion";
import { EASE } from "@/lib/motion";
import { BookOpen, Clock, Check, X, Users, Heart, Calendar, AlertCircle } from "lucide-react";
import StoryStatusOverview from "@/components/home/StoryStatusOverview";

// Zeigt aktive Geschichten mit Entscheidungen und anstehende Versprechen.
export default function StoryPanel({ state, send, showToast }) {
  const [busyKey, setBusyKey] = useState(null);
  const [stories, setStories] = useState(null);

  // Geschichten laden (lazy)
  async function loadStories() {
    try {
      const result = await send("getStories", {});
      setStories(result.stories);
    } catch (e) { showToast(e.message, "error"); }
  }

  useEffect(() => { loadStories(); }, [state.gameTime, state.appointments?.length]);

  async function decide(runId, choiceId) {
    setBusyKey(runId + choiceId);
    try {
      await send("makeStoryDecision", { storyRunId: runId, choiceId });
      showToast("Entscheidung getroffen.", "success");
      await loadStories();
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyKey(null); }
  }

  const hasStories = stories && stories.length > 0;
  const openPromises = ((state.private?.promises) || []).filter(pr => pr.status === "open");
  if (!hasStories && openPromises.length === 0) return null;

  return (
    <div className="space-y-4">
      <StoryStatusOverview state={state} />
      {hasStories && stories.map(run => (
        <StoryCard key={run.runId} run={run} onDecide={decide} busyKey={busyKey} state={state} />
      ))}
    </div>
  );
}

function StoryCard({ run, onDecide, busyKey, state }) {
  const urgencyColor = run.status === "offered" ? "text-coral" : "text-lime";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="glass rounded-2xl border border-white/10 p-5 lg:p-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="w-4 h-4 text-coral" />
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{run.status === "offered" ? "Angebot" : "Aktiv"}</span>
        {run.nextDeadlineMin && (
          <span className={`text-[10px] ml-auto flex items-center gap-1 ${urgencyColor}`}>
            <Clock className="w-3 h-3" /> {formatGameTime(run.nextDeadlineMin)}
          </span>
        )}
      </div>

      <h3 className="text-lg lg:text-xl font-medium tracking-tight">{run.title}</h3>

      {/* Beteiligte Personen */}
      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
        {run.participants.map(p => (
          <span key={p.id} className="flex items-center gap-1">
            {p.role === "partner" ? <Heart className="w-3 h-3 text-coral" /> : <Users className="w-3 h-3" />}
            {p.name}
          </span>
        ))}
      </div>

      {/* Erzähltext */}
      <p className="text-sm text-foreground/80 mt-4 leading-relaxed">{run.text}</p>

      {/* Entscheidungen */}
      {run.needsDecision && run.choices.length > 0 && (
        <div className="mt-5 space-y-2">
          {run.choices.map(choice => {
            const disabled = busyKey === run.runId + choice.id;
            const tooExpensive = choice.costCents > 0 && state.private.accountCents < choice.costCents;
            return (
              <button
                key={choice.id}
                onClick={() => onDecide(run.runId, choice.id)}
                disabled={disabled || tooExpensive}
                className="w-full text-left p-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 disabled:opacity-40 transition group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{choice.label}</span>
                  {choice.costCents > 0 && (
                    <span className={`text-xs tabular-nums ${tooExpensive ? "text-red-300" : "text-muted-foreground"}`}>
                      {formatEuro(choice.costCents)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{choice.description}</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Wartet auf Termin */}
      {!run.needsDecision && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground border-t border-white/10 pt-4">
          <Calendar className="w-3.5 h-3.5" />
          {run.status === "active"
            ? "Die Geschichte wird fortgesetzt, sobald der Termin abgeschlossen ist."
            : "Warte auf Entscheidung."}
        </div>
      )}
    </motion.div>
  );
}