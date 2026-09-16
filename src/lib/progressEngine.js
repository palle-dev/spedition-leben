// Clientseitige Fortschritts-Engine für FERNWERK.
// Spiegelt base44/shared/progressEngine.ts für Darstellung und Vorschau.

import { ACHIEVEMENTS, XP_LEVELS, COMPANY_STAGES, GOAL_TEMPLATES } from "@/lib/achievementCatalog.js";

export function computeCompanyValue(state) {
  const vehicleValue = (state.vehicles || []).reduce((s, v) => s + (v.bookValueCents || 0), 0);
  const openCompanyCosts = (state.openCosts || []).filter(o => o.account === "company").reduce((s, o) => s + o.amountCents, 0);
  return (state.company?.accountCents || 0) + vehicleValue - openCompanyCosts;
}

export function computePrivateNetWorth(state) {
  const assetValue = 0;
  const openPrivateCosts = (state.openCosts || []).filter(o => o.account === "private").reduce((s, o) => s + o.amountCents, 0);
  return (state.private?.accountCents || 0) + assetValue - openPrivateCosts;
}

export function getExperienceLevel(xp) {
  let current = XP_LEVELS[0];
  let next = null;
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i].minXp) {
      current = XP_LEVELS[i];
      next = XP_LEVELS[i + 1] || null;
    }
  }
  return { level: current.level, title: current.title, minXp: current.minXp, nextMinXp: next ? next.minXp : null, nextTitle: next ? next.title : null };
}

export function getDevelopmentStage(companyValueCents) {
  let stage = COMPANY_STAGES[0];
  for (const s of COMPANY_STAGES) {
    if (companyValueCents >= s.minValueCents) stage = s;
  }
  return stage;
}

export function getStatValue(state, key) {
  if (key === "vehicleCount") return (state.vehicles || []).length;
  if (key === "companyValue") return computeCompanyValue(state);
  if (key === "privateNetWorth") return computePrivateNetWorth(state);
  return (state.stats && state.stats[key]) || 0;
}

export function getGoalProgress(state, goal) {
  const tpl = GOAL_TEMPLATES.find(t => t.id === goal.templateId);
  if (!tpl) return { current: 0, target: 1, completed: false, nextAction: "" };
  if (tpl.type === "purchase") {
    const cash = state.private?.accountCents || 0;
    const current = Math.min(cash, tpl.targetCents);
    const remaining = Math.max(0, tpl.targetCents - cash);
    return { current, target: tpl.targetCents, remaining, completed: cash >= tpl.targetCents, nextAction: tpl.nextAction,
      deadlineMin: null, blockedReason: null, progressDetail: null,
      linkPath: tpl.linkPath || null, criterion: tpl.criterion || null, rewardDesc: tpl.rewardDesc || null };
  }
  if (tpl.type === "stat") {
    const current = getStatValue(state, tpl.statKey);
    return { current, target: tpl.target, completed: current >= tpl.target, nextAction: tpl.nextAction,
      deadlineMin: null, blockedReason: null, progressDetail: null,
      linkPath: tpl.linkPath || null, criterion: tpl.criterion || null, rewardDesc: tpl.rewardDesc || null };
  }
  if (tpl.type === "custom" && typeof tpl.evaluate === "function") {
    const r = tpl.evaluate(state);
    return {
      current: r.current, target: r.target, completed: r.completed,
      nextAction: r.nextAction, remaining: r.target > r.current ? r.target - r.current : 0,
      deadlineMin: r.deadlineMin || null, blockedReason: r.blockedReason || null,
      progressDetail: r.progressDetail || null,
      linkPath: tpl.linkPath || null, criterion: tpl.criterion || null,
      rewardDesc: tpl.rewardDesc || null,
    };
  }
  return { current: 0, target: 1, completed: false, nextAction: "" };
}

export function getAchievementProgress(state, achievementId) {
  const def = ACHIEVEMENTS.find(a => a.id === achievementId);
  if (!def) return { current: 0, target: 1 };
  const computed = { companyValue: computeCompanyValue(state), privateNetWorth: computePrivateNetWorth(state) };
  return def.progress(state, computed);
}