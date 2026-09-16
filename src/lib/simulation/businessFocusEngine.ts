// Business-Focus-Engine für FERNWERK.
// Steuert die betriebliche Ausrichtung: Mischbetrieb, Regional, Express, Gefahrgut.
// Der Fokus beeinflusst die Marktwellen-Erzeugung (Anteile der Segmente) und
// die Dispatcher-Priorisierung (welche Aufträge bevorzugt werden).

import { getOrderSegments, getOrderCharacteristics, REGIONAL_DISTANCE_KM, EXPRESS_DEADLINE_MIN } from "./segmentEngine.ts";

export const BUSINESS_FOCI = [
  {
    id: "mixed",
    label: "Mischbetrieb",
    desc: "Ausgewogene Auftragsstruktur ohne Spezialisierung.",
    marketWeights: { regional: 0.35, express: 0.20, dangerousGoods: 0.10, standard: 0.35 },
  },
  {
    id: "regional",
    label: "Regionalverkehr",
    desc: "Kurze Distanzen, hohe Frequenz, geringere Margen.",
    marketWeights: { regional: 0.60, express: 0.10, dangerousGoods: 0.05, standard: 0.25 },
  },
  {
    id: "express",
    label: "Express",
    desc: "Zeitkritische Transporte, höhere Margen, höhere Stress.",
    marketWeights: { regional: 0.15, express: 0.55, dangerousGoods: 0.05, standard: 0.25 },
  },
  {
    id: "dangerousGoods",
    label: "Gefahrgut",
    desc: "Spezialisierte Transporte mit Ausrüstung und Schulung.",
    marketWeights: { regional: 0.15, express: 0.10, dangerousGoods: 0.50, standard: 0.25 },
  },
];

export function migrateBusinessFocus(state) {
  if (!state.businessFocus) {
    state.businessFocus = {
      companyFocus: "mixed",
      branchOverrides: {},
    };
  }
  if (!state.businessFocus.companyFocus) state.businessFocus.companyFocus = "mixed";
  if (!state.businessFocus.branchOverrides) state.businessFocus.branchOverrides = {};
}

export function setBusinessFocus(state, focusId) {
  migrateBusinessFocus(state);
  const valid = BUSINESS_FOCI.some(f => f.id === focusId);
  if (!valid) throw new Error("Unbekannter Geschäftsfokus: " + focusId);
  state.businessFocus.companyFocus = focusId;
  return { ok: true, focusId };
}

export function setBranchBusinessFocus(state, branchId, focusId) {
  migrateBusinessFocus(state);
  const valid = BUSINESS_FOCI.some(f => f.id === focusId);
  if (!valid) throw new Error("Unbekannter Geschäftsfokus: " + focusId);
  state.businessFocus.branchOverrides[branchId] = focusId;
  return { ok: true, branchId, focusId };
}

export function getBusinessFocus(state) {
  migrateBusinessFocus(state);
  return {
    companyFocus: state.businessFocus.companyFocus,
    branchOverrides: { ...state.businessFocus.branchOverrides },
    foci: BUSINESS_FOCI,
  };
}

export function getEffectiveFocusForBranch(state, branchId) {
  migrateBusinessFocus(state);
  const override = state.businessFocus.branchOverrides[branchId];
  return override || state.businessFocus.companyFocus;
}

export function getMarketWeightsForBranch(state, branchId) {
  const focusId = getEffectiveFocusForBranch(state, branchId);
  const focus = BUSINESS_FOCI.find(f => f.id === focusId);
  return focus ? focus.marketWeights : BUSINESS_FOCI[0].marketWeights;
}

// Prüft, ob ein Auftrag zum Fokus der Filiale passt
export function orderMatchesFocus(state, order, branchId) {
  const focusId = getEffectiveFocusForBranch(state, branchId);
  if (focusId === "mixed") return true;
  const segments = getOrderSegments(order);
  if (focusId === "regional") return segments.includes("regional");
  if (focusId === "express") return segments.includes("express");
  if (focusId === "dangerousGoods") return segments.includes("dangerousGoods");
  return true;
}

// Prioritäts-Score für Dispatcher: höhere Werte = bevorzugt
export function getFocusPriority(state, order, branchId) {
  const focusId = getEffectiveFocusForBranch(state, branchId);
  if (focusId === "mixed") return 1.0;
  const segments = getOrderSegments(order);
  if (focusId === "regional") return segments.includes("regional") ? 2.0 : 0.5;
  if (focusId === "express") return segments.includes("express") ? 2.0 : 0.5;
  if (focusId === "dangerousGoods") return segments.includes("dangerousGoods") ? 2.0 : 0.5;
  return 1.0;
}