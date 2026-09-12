import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { ACHIEVEMENT_CATEGORIES, ACHIEVEMENTS, GOAL_TEMPLATES } from "@/lib/achievementCatalog.js";
import { computeCompanyValue, getExperienceLevel, getDevelopmentStage } from "@/lib/progressEngine.js";
import { formatEuro } from "@/lib/gameData";
import XPBar from "@/components/achievements/XPBar";
import AchievementCard from "@/components/achievements/AchievementCard";
import GoalCard from "@/components/achievements/GoalCard";
import { motion, AnimatePresence } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Trophy, Target, Plus, Building2, TrendingUp, X } from "lucide-react";

export default function Achievements() {
  const { state, send, showToast } = useGame();
  const [activeCategory, setActiveCategory] = useState("unternehmen");
  const [showGoalPicker, setShowGoalPicker] = useState(false);
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

  const filteredAchievements = ACHIEVEMENTS.filter(a => a.category === activeCategory);
  const availableTemplates = GOAL_TEMPLATES.filter(t => !goals.some(g => g.templateId === t.id));

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1400px] mx-auto space-y-6">
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
        <div className="flex items-baseline gap-3">
          <span className="text-2xl lg:text-3xl font-medium tabular-nums">{formatEuro(companyValue)}</span>
          <span className="text-sm text-lime">{stage.name}</span>
        </div>
        <div className="flex gap-1 mt-4">
          {["gruendung", "aufbau", "millionengeschaeft", "grossunternehmen"].map((sid, i) => {
            const reached = companyValue >= [0, 25000000, 100000000, 500000000][i];
            return (
              <div key={sid} className={`flex-1 h-1.5 rounded-full ${reached ? "bg-lime" : "bg-white/10"}`} />
            );
          })}
        </div>
        <div className="grid grid-cols-4 gap-1 mt-2 text-[9px] text-muted-foreground/60">
          <span>Gründung</span>
          <span className="text-center">250k</span>
          <span className="text-center">1 Mio.</span>
          <span className="text-right">5 Mio.</span>
        </div>
      </div>

      {/* Ziele */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-coral/70" />
            <span className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Persönliche Ziele</span>
            <span className="text-[10px] text-muted-foreground/50">{goals.length}/3</span>
          </div>
          {goals.length < 3 && (
            <button
              onClick={() => setShowGoalPicker(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-coral/10 border border-coral/30 text-coral text-xs font-medium hover:border-coral/50 transition active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" /> Ziel hinzufügen
            </button>
          )}
        </div>
        {goals.length === 0 ? (
          <div className="glass border border-white/10 rounded-xl p-5 text-center">
            <Target className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Noch kein Ziel angeheftet. Wähle bis zu drei Ziele, die du verfolgen möchtest.</p>
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
        <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-none">
          {ACHIEVEMENT_CATEGORIES.map(cat => {
            const count = ACHIEVEMENTS.filter(a => a.category === cat.id).length;
            const unlocked = (state.achievements || []).filter(a => a.unlocked && ACHIEVEMENTS.find(d => d.id === a.id)?.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  activeCategory === cat.id ? "bg-lime/15 text-lime border border-lime/30" : "text-muted-foreground hover:text-foreground border border-white/10"
                }`}
              >
                {cat.label} <span className="text-[10px] opacity-60">{unlocked}/{count}</span>
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
                <button onClick={() => setShowGoalPicker(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
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
                      className="w-full text-left rounded-xl p-3 border border-white/10 hover:border-coral/30 bg-surface/30 transition active:scale-[0.99] disabled:opacity-50"
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
    </div>
  );
}