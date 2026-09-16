import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { DEVELOPMENT_FOCI, DEVELOPMENT_MILESTONES } from "@/lib/developmentEngine.js";
import { getMilestoneSummary, getDevelopmentHistory, getFocusLabel, getSuggestedGoalIds } from "@/lib/developmentData.js";
import { GOAL_TEMPLATES } from "@/lib/achievementCatalog.js";
import { getGoalProgress } from "@/lib/progressEngine.js";
import { Target, Compass, Flag, TrendingUp, ChevronRight, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { EASE } from "@/lib/motion";

// Entwicklungs-Panel für die Büro-Seite.
// Zeigt Schwerpunkt, aktive Ziele, Meilensteine und Entwicklungsgeschichte.
export default function DevelopmentPanel({ state }) {
  const { send, showToast } = useGame();
  const navigate = useNavigate();
  const [showFocusPicker, setShowFocusPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const focusId = state.developmentFocus;
  const goals = state.goals || [];
  const milestones = getMilestoneSummary(state);
  const history = getDevelopmentHistory(state);
  const suggestedIds = focusId ? getSuggestedGoalIds(focusId) : [];
  const suggestedTemplates = GOAL_TEMPLATES.filter(t => suggestedIds.includes(t.id) && !goals.some(g => g.templateId === t.id)).slice(0, 3);

  async function selectFocus(fid) {
    setBusy(true);
    try {
      await send("setDevelopmentFocus", { focusId: fid });
      setShowFocusPicker(false);
      showToast("Schwerpunkt gesetzt: " + getFocusLabel(fid), "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusy(false); }
  }

  async function attachGoal(templateId) {
    setBusy(true);
    try {
      await send("attachGoal", { templateId });
      showToast("Ziel angeheftet", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusy(false); }
  }

  return (
    <div className="glass border border-white/10 rounded-2xl p-5 space-y-5">
      {/* Schwerpunkt */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Compass className="w-4 h-4 text-lime/70" />
          <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Entwicklungsschwerpunkt</span>
        </div>
        {focusId ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{getFocusLabel(focusId)}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{DEVELOPMENT_FOCI.find(f => f.id === focusId)?.desc}</div>
            </div>
            <button onClick={() => setShowFocusPicker(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/20">
              Wechseln <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button onClick={() => setShowFocusPicker(true)}
            className="w-full text-left px-3 py-2.5 rounded-lg border border-dashed border-white/15 hover:border-lime/30 hover:bg-lime/5 transition text-sm text-muted-foreground">
            Schwerpunkt wählen — beeinflusst vorgeschlagene Ziele und hervorgehobene Informationen.
          </button>
        )}
      </div>

      {/* Aktive Ziele (kompakt) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-coral/70" />
            <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Aktive Ziele</span>
            <span className="text-[10px] text-muted-foreground/50 tabular-nums">{goals.length}/3</span>
          </div>
          <button onClick={() => navigate("/erfolge")}
            className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1">
            Alle <ChevronRight className="w-3 h-3" />
          </button>
        </div>
        {goals.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">Keine Ziele aktiv. Wähle bis zu drei auf der Erfolgs-Seite.</p>
        ) : (
          <div className="space-y-2">
            {goals.map(g => {
              const tpl = GOAL_TEMPLATES.find(t => t.id === g.templateId);
              const prog = getGoalProgress(state, g);
              const pct = Math.min(100, (prog.current / prog.target) * 100);
              return (
                <div key={g.id} className={`rounded-lg p-2.5 border ${prog.completed ? "border-lime/20 bg-lime/[0.03]" : "border-white/8 bg-white/[0.02]"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{tpl?.title || g.templateId}</span>
                    {prog.completed && <Check className="w-3.5 h-3.5 text-lime shrink-0" />}
                  </div>
                  <div className="h-1 rounded-full bg-white/8 overflow-hidden mt-2">
                    <div className={`h-full rounded-full transition-all duration-500 ${prog.completed ? "bg-lime" : "bg-coral"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                      {prog.progressDetail || (prog.current + " / " + prog.target)}
                    </span>
                    {prog.linkPath && (
                      <button onClick={() => navigate(prog.linkPath)}
                        className="text-[10px] text-muted-foreground/50 hover:text-foreground transition">Öffnen</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Empfohlene Ziele */}
      {suggestedTemplates.length > 0 && goals.length < 3 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-3.5 h-3.5 text-lime/50" />
            <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground/70">Passende Ziele</span>
          </div>
          <div className="space-y-1.5">
            {suggestedTemplates.map(t => (
              <button key={t.id} onClick={() => attachGoal(t.id)} disabled={busy}
                className="w-full text-left rounded-lg px-2.5 py-2 border border-white/8 hover:border-coral/25 bg-white/[0.02] hover:bg-coral/[0.03] transition active:scale-[0.99] disabled:opacity-50">
                <div className="text-xs font-medium">{t.title}</div>
                <div className="text-[10px] text-muted-foreground/60 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Meilensteine */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Flag className="w-4 h-4 text-lime/70" />
          <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Unternehmensmeilensteine</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {milestones.map(m => (
            <div key={m.id} className={`rounded-lg p-2.5 border ${m.achieved ? "border-lime/20 bg-lime/[0.04]" : "border-white/8 bg-white/[0.02]"}`}>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${m.achieved ? "bg-lime" : "bg-white/20"}`} />
                <span className={`text-xs font-medium ${m.achieved ? "text-foreground" : "text-muted-foreground"}`}>{m.label}</span>
              </div>
              {!m.achieved && (
                <div className="text-[10px] text-muted-foreground/50 mt-1 tabular-nums">{m.current} / {m.target}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Entwicklungsgeschichte (kompakt) */}
      {history.length > 0 && (
        <div>
          <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground/70">Entwicklungsgeschichte</span>
          <div className="mt-2 space-y-1">
            {history.slice(-4).map((h, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <div className="w-1 h-1 rounded-full bg-lime/50" />
                <span className="text-foreground/80">{h.label}</span>
                {h.day && <span className="text-muted-foreground/50">· Tag {h.day}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Focus-Picker Modal */}
      <AnimatePresence>
        {showFocusPicker && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowFocusPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="glass border border-white/15 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-medium mb-1">Schwerpunkt wählen</h3>
              <p className="text-xs text-muted-foreground mb-4">Der Schwerpunkt beeinflusst vorgeschlagene Ziele. Er verändert keine Preise oder Regeln. Ein Wechsel erhält alle Fortschritte.</p>
              <div className="space-y-2">
                {DEVELOPMENT_FOCI.map(f => (
                  <button key={f.id} onClick={() => selectFocus(f.id)} disabled={busy}
                    className={`w-full text-left rounded-xl p-3 border transition active:scale-[0.99] disabled:opacity-50 ${
                      focusId === f.id ? "border-lime/30 bg-lime/5" : "border-white/10 hover:border-lime/20 bg-surface/30 hover:bg-surface/50"
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{f.label}</span>
                      {focusId === f.id && <Check className="w-4 h-4 text-lime" />}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{f.desc}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}