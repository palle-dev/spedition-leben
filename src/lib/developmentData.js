// UI-Daten-Hilfsfunktionen für Entwicklungsschwerpunkte, Onboarding und Meilensteine.
// Reine Datenextraktion — keine Zustandsänderung.

import { DEVELOPMENT_FOCI, ONBOARDING_STEPS, DEVELOPMENT_MILESTONES, detectOnboardingStep, getOnboardingBlocker } from "@/lib/developmentEngine.js";

export function getFocusLabel(focusId) {
  const f = DEVELOPMENT_FOCI.find(x => x.id === focusId);
  return f ? f.label : "Kein Schwerpunkt";
}

export function getFocusDesc(focusId) {
  const f = DEVELOPMENT_FOCI.find(x => x.id === focusId);
  return f ? f.desc : "";
}

export function getSuggestedGoalIds(focusId) {
  const f = DEVELOPMENT_FOCI.find(x => x.id === focusId);
  return f ? f.suggestedGoals : [];
}

export function getOnboardingInfo(state) {
  if (!state.onboarding?.active || state.onboarding.paused) return null;
  const stepId = detectOnboardingStep(state);
  const stepIdx = ONBOARDING_STEPS.findIndex(s => s.id === stepId);
  const step = ONBOARDING_STEPS[stepIdx];
  const blocker = getOnboardingBlocker(state);
  return {
    stepId,
    stepIdx,
    stepTitle: step?.title || "",
    stepHint: step?.hint || "",
    linkPath: step?.linkPath || "/",
    totalSteps: ONBOARDING_STEPS.length,
    blocker,
  };
}

export function getMilestoneSummary(state) {
  const milestones = state.developmentMilestones || [];
  return DEVELOPMENT_MILESTONES.map(def => {
    const m = milestones.find(x => x.id === def.id) || { id: def.id, achieved: false, achievedAtMin: null };
    const prog = def.progress(state);
    return {
      id: def.id,
      label: def.label,
      achieved: m.achieved,
      achievedAtMin: m.achievedAtMin,
      current: prog.current,
      target: prog.target,
    };
  });
}

export function getDevelopmentHistory(state) {
  const milestones = (state.developmentMilestones || []).filter(m => m.achieved).sort((a, b) => a.achievedAtMin - b.achievedAtMin);
  return milestones.map(m => ({
    label: m.label,
    day: m.achievedAtMin ? Math.floor(m.achievedAtMin / 1440) + 1 : null,
    min: m.achievedAtMin,
  }));
}