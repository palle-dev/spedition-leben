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

// Natürliche Erklärung, WARUM eine Freigabe nötig ist — für Spieler verständlich.
export function getApprovalExplanation(req) {
  if (!req) return null;
  const rule = req.violatedRule;
  const cost = req.costCents || 0;
  const costStr = cost > 0 ? formatCents(cost) : "";

  if (rule === "maxSpendPerAction") {
    return `Diese Aktion kostet ${costStr} und überschreitet das Limit für Einzelausgaben, das du in den Mitarbeiterbefugnissen festgelegt hast.`;
  }
  if (rule === "dailyBudget") {
    return `Das Tagesbudget für diese Filiale ist erschöpft. Weitere Ausgaben brauchen deine Freigabe.`;
  }
  if (rule === "minLiquidity") {
    return `Die Firmenliquidität ist unter den von dir festgelegten Kontopuffer gefallen. Ausgaben brauchen jetzt deine Freigabe, um die Liquidität zu schützen.`;
  }
  if (rule === "role_authority") {
    return `Diese Aktion ist in den Mitarbeiterbefugnissen für diese Rolle nicht vorgesehen und braucht deine Zustimmung.`;
  }
  // Fallback: Begründung des Mitarbeiters verwenden
  if (req.reasoning) return req.reasoning;
  return "Diese Aktion überschreitet die festgelegten Befugnisse und braucht deine Freigabe.";
}

export { PRESETS, ROLE_AUTHORITY };