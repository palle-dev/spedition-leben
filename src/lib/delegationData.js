// UI-Datenhilfsfunktionen für Führung & Delegation.
// Reine Berechnung aus dem Spielzustand — keine Zustandsänderung.

import { PRESETS, ROLE_AUTHORITY } from "@/lib/simulation/delegationEngine";
import { formatEuro } from "@/lib/customerData";

export function formatCents(c) {
  return formatEuro(c || 0);
}

export function getRuleLabel(key) {
  const labels = {
    maxSpendPerActionCents: "Max. Einzelausgabe",
    dailyBudgetCents: "Tagesbudget",
    minLiquidityCents: "Mindestliquidität (Kontopuffer)",
    allowedMaintenance: "Erlaubte Wartungsaktionen",
    allowedServices: "Erlaubte externe Services",
    approvalMode: "Verhalten bei Freigaben",
    autoAcceptOrders: "Auto-Auftragsannahme",
    autoDispatch: "Auto-Disposition",
    workshopMaxCostCents: "Werkstatt: max. Automatik-Kosten",
    autoAcceptMarginPct: "Mindestmarge für Auto-Annahme",
    trainingBudgetPerDay: "Trainingsbudget pro Tag",
  };
  return labels[key] || key;
}

export function getApprovalModeLabel(mode) {
  if (mode === "stop") return "Bei Freigabe anhalten";
  return "Weiterlaufen, Freigaben sammeln";
}

export function getUrgencyColor(urgency) {
  if (urgency === "high") return "text-coral";
  if (urgency === "medium") return "text-amber-300";
  return "text-muted-foreground";
}

export function getViolatedRuleLabel(rule) {
  const labels = {
    maxSpendPerAction: "Einzelausgabe-Limit überschritten",
    dailyBudget: "Tagesbudget erschöpft",
    minLiquidity: "Kontopuffer unterschritten",
    role_authority: "Keine Rollen-Befugnis",
    unknown: "Unbekannt",
  };
  return labels[rule] || rule;
}

export { PRESETS, ROLE_AUTHORITY };