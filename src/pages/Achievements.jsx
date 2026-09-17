import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS, GOAL_TEMPLATES } from "@/lib/achievementCatalog.js";
import { computeCompanyValue, getExperienceLevel, getDevelopmentStage } from "@/lib/progressEngine.js";
import { formatEuro } from "@/lib/gameData";
import { DEVELOPMENT_FOCI } from "@/lib/developmentEngine.js";
import { getMilestoneSummary, getFocusLabel } from "@/lib/developmentData.js";
import { Compass, Flag, Check, ChevronRight } from "lucide-react";
import XPBar from "@/components/achievements/XPBar";
import AchievementCard from "@/components/achievements/AchievementCard";
import GoalCard from "@/components/achievements/GoalCard";
import { motion, AnimatePresence } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Trophy, Target, Plus, Building2, TrendingUp, X } from "lucide-react";

const STAGES = [
  { id: "gruendung", label: "Gründung", threshold: 0 },
  { id: "aufbau", label: "250k", threshold: 25000000 },
  { id: "millionengeschaeft", label: "1 Mio.", threshold: 100000000 },
  { id: "grossunternehmen", label: "5 Mio.", threshold: 500000000 },
];

export default function Achievements() {
  const { state, send, showToast } = useGame();
  const [activeCategory, setActiveCategory] = useState("unternehmen");
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [showFocusPicker, setShowFocusPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const xp = state.xp || 0;
  const level = getExperienceLevel(xp);
  const companyValue = computeCompanyValue(state);
  const stage = getDevelopmentStage(companyValue);
  const goals = state.goals || [];
  const unlockedCount = (state.achievements || []).filter(a => a.unlocked).length;

  async function attachGoal(templateId) {
    setBusy(true);
    try {
      await send("attachGoal", { templateId });
      setShowGoalPicker(false);
      showToast("Ziel angeheftet.", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusy(false); }
  }

  async function removeGoal(goalId) {
    try {
      await send("removeGoal", { goalId });
      showToast("Ziel entfernt.", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function selectFocus(focusId) {
    setBusy(true);
    try {
      await send("setDevelopmentFocus", { focusId });
      setShowFocusPicker(false);
      showToast("Schwerpunkt gesetzt: " + getFocusLabel(focusId), "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusy(false); }
  }

  const filteredAchievements = ACHIEVEMENTS.filter(a => a.category === activeCategory);
  const availableTemplates = GOAL_TEMPLATES.filter(t => !goals.some(g => g.templateId === t.id));

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 items-start">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-7 h-px bg-lime" />
            <span className="text-[10px] lg:text-xs tracking-[0.2em] uppercase text-muted-foreground">Erfolge & Ziele</span>
          </div>
          <h1 className="text-2xl lg:text-4xl font-medium tracking-tight">
            Dein Fortschritt.<br /><em className="text-lime not-italic">Sichtbar und dauerhaft.</em>
          </h1>
          <p className="text-sm text-muted-foreground mt-3 max-w-md">
            {unlockedCount} von {ACHIEVEMENTS.length} Erfolgen freigeschaltet · {xp.toLocaleString("de-DE")} XP gesammelt.
          </p>
        </div>
        <div className="w-full lg:w-[400px] shrink-0">
          <XPBar xp={xp} level={level} />
        </div>
      </div>

      {/* Unternehmensentwicklung */}
      <div className="glass border border-white/10 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-lime/70" />
          <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Unternehmensentwicklung</span>
        </div>
        <div className="flex items-baseline gap-3 mb-5">
          <span className="text-2xl lg:text-3xl font-medium tabular-nums">{formatEuro(companyValue)}</span>
          <span className="text-sm text-lime">{stage.name}</span>
        </div>
        {/* Stufen-Track mit Tick-Marks */}
        <div className="relative">
          <div className="flex gap-1">
            {STAGES.map((s, i) => {
              const reached = companyValue >= s.threshold;
              return (
                <div key={s.id} className="flex-1 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 border-2 transition ${
                      reached ? "bg-lime border-lime" : "bg-transparent border-white/20"
                    }`} />
                    {i < STAGES.length - 1 && (
                      <div className={`flex-1 h-0.5 rounded-full ${reached && companyValue >= STAGES[i + 1].threshold ? "bg-lime" : "bg-white/10"}`} />
                    )}
                  </div>
                  <span className={`text-[9px] ${reached ? "text-lime/80" : "text-muted-foreground/50"}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Entwicklungsschwerpunkt + Meilensteine */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Schwerpunkt */}
        <div className="glass border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Compass className="w-4 h-4 text-lime/70" />
            <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Schwerpunkt</span>
          </div>
          {state.developmentFocus ? (
            <div>
              <div className="text-sm font-medium">{getFocusLabel(state.developmentFocus)}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{DEVELOPMENT_FOCI.find(f => f.id === state.developmentFocus)?.desc}</div>
              <button onClick={() => setShowFocusPicker(true)}
                className="mt-3 text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-white/20">
                Wechseln <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button onClick={() => setShowFocusPicker(true)}
              className="w-full text-left px-3 py-2.5 rounded-lg border border-dashed border-white/15 hover:border-lime/30 hover:bg-lime/5 transition text-sm text-muted-foreground">
              Schwerpunkt wählen — beeinflusst vorgeschlagene Ziele.
            </button>
          )}
        </div>

        {/* Meilensteine */}
        <div className="glass border border-white/10 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Flag className="w-4 h-4 text-lime/70" />
            <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Meilensteine</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {getMilestoneSummary(state).map(m => (
              <div key={m.id} className={`rounded-lg p-2.5 border ${m.achieved ? "border-lime/20 bg-lime/[0.04]" : "border-white/8 bg-white/[0.02]"}`}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${m.achieved ? "bg-lime" : "bg-white/20"}`} />
                  <span className={`text-xs font-medium ${m.achieved ? "text-foreground" : "text-muted-foreground"}`}>{m.label}</span>
                  {m.achieved && <Check className="w-3 h-3 text-lime ml-auto" />}
                </div>
                {!m.achieved && <div className="text-[10px] text-muted-foreground/50 mt-1 tabular-nums">{m.current} / {m.target}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ziele */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-coral/70" />
            <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Persönliche Ziele</span>
            <span className="text-[10px] text-muted-foreground/50 tabular-nums">{goals.length}/3</span>
          </div>
          {goals.length < 3 && (
            <button
              onClick={() => setShowGoalPicker(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-coral/10 border border-coral/30 text-coral text-xs font-medium hover:border-coral/50 hover:bg-coral/15 transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" /> Ziel hinzufügen
            </button>
          )}
        </div>
        {goals.length === 0 ? (
          <div className="glass border border-white/10 rounded-xl p-10 text-center">
            <div className="grid place-items-center w-12 h-12 rounded-2xl bg-white/5 mx-auto mb-3">
              <Target className="w-6 h-6 text-muted-foreground/30" />
            </div>
            <p className="text-sm text-muted-foreground">Noch kein Ziel angeheftet.</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Wähle bis zu drei Ziele, die du verfolgen möchtest.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            <AnimatePresence mode="popLayout">
              {goals.map(g => (
                <GoalCard key={g.id} goal={g} state={state} onRemove={removeGoal} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Erfolge nach Kategorie */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-4 h-4 text-lime/70" />
          <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Erfolge</span>
        </div>
        {/* Kategorie-Tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto scrollbar-none">
          {ACHIEVEMENT_CATEGORIES.map(cat => {
            const count = ACHIEVEMENTS.filter(a => a.category === cat.id).length;
            const unlocked = (state.achievements || []).filter(a => a.unlocked && ACHIEVEMENTS.find(d => d.id === a.id)?.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200 ${
                  activeCategory === cat.id
                    ? "bg-lime/15 text-lime border border-lime/30"
                    : "text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20"
                }`}
              >
                {cat.label}
                <span className={`tabular-nums text-[10px] ${activeCategory === cat.id ? "text-lime/60" : "opacity-50"}`}>{unlocked}/{count}</span>
              </button>
            );
          })}
        </div>
        {/* Karten */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredAchievements.map(a => (
            <AchievementCard key={a.id} achievement={a} state={state} />
          ))}
        </div>
      </div>

      {/* Ziel-Auswahl */}
      <AnimatePresence>
        {showGoalPicker && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowGoalPicker(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="glass border border-white/15 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Ziel wählen</h3>
                <button onClick={() => setShowGoalPicker(false)} className="text-muted-foreground hover:text-foreground p-1"><X className="w-5 h-5" /></button>
              </div>
              {availableTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Alle Ziele bereits angeheftet.</p>
              ) : (
                <div className="space-y-2">
                  {availableTemplates.map(t => (
                    <button
                      key={t.id}
                      onClick={() => attachGoal(t.id)}
                      disabled={busy}
                      className="w-full text-left rounded-xl p-3 border border-white/10 hover:border-coral/30 bg-surface/30 hover:bg-surface/50 transition active:scale-[0.99] disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t.title}</span>
                        <TrendingUp className="w-3.5 h-3.5 text-coral/60" />
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{t.desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Schwerpunkt-Wähler */}
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
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium">Schwerpunkt wählen</h3>
                <button onClick={() => setShowFocusPicker(false)} className="text-muted-foreground hover:text-foreground p-1"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-xs text-muted-foreground mb-4">Der Schwerpunkt beeinflusst vorgeschlagene Ziele. Er verändert keine Preise oder Regeln.</p>
              <div className="space-y-2">
                {DEVELOPMENT_FOCI.map(f => (
                  <button key={f.id} onClick={() => selectFocus(f.id)} disabled={busy}
                    className={`w-full text-left rounded-xl p-3 border transition active:scale-[0.99] disabled:opacity-50 ${
                      state.developmentFocus === f.id ? "border-lime/30 bg-lime/5" : "border-white/10 hover:border-lime/20 bg-surface/30 hover:bg-surface/50"
                    }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{f.label}</span>
                      {state.developmentFocus === f.id && <Check className="w-4 h-4 text-lime" />}
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