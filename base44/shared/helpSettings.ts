// Einstiegshilfen für FERNWERK.
// Unabhängig vom Schwierigkeitsprofil wählbare Hilfestellungen, die den
// Einstieg erleichtern, ohne die wirtschaftliche Herausforderung zu
// verändern. Jede Hilfe ist einzeln aktivierbar.

// ---------- Hilfs-Definitionen ----------
export const HELP_OPTIONS = [
  {
    id: "marketPreview",
    label: "Markt-Vorschau",
    description: "Zeigt zusätzliche Informationen zu Aufträgen: voraussichtliche Kosten, Deckungsbeitrag und Empfehlung.",
    defaultOn: false,
  },
  {
    id: "autoAcceptSafe",
    label: "Sichere Aufträge automatisch annehmen",
    description: "Der Assistent nimmt automatisch Aufträge an, die eindeutig profitabel und gut zur Flotte passen.",
    defaultOn: false,
  },
  {
    id: "disruptionWarnings",
    label: "Störungs-Vorwarnung",
    description: "Frühzeitige Warnung bei drohenden Störungen (z. B. kritischer Fahrzeugzustand), bevor sie eintreten.",
    defaultOn: false,
  },
  {
    id: "financialGuardrails",
    label: "Liquiditäts-Schutz",
    description: "Blockiert riskante Ausgaben, die das Firmenkonto unter eine Sicherheitsschwelle bringen würden.",
    defaultOn: false,
  },
];

export const DEFAULT_HELP_SETTINGS = {
  marketPreview: false,
  autoAcceptSafe: false,
  disruptionWarnings: false,
  financialGuardrails: false,
};

// ---------- Effektive Hilfestellungen aus dem Spielstand ----------
export function getEffectiveHelpSettings(state) {
  return {
    ...DEFAULT_HELP_SETTINGS,
    ...(state?.helpSettings || {}),
  };
}

export function isHelpEnabled(state, optionId) {
  const settings = getEffectiveHelpSettings(state);
  return !!settings[optionId];
}

// ---------- Hilfestellungen bei Spielstart anwenden ----------
export function applyHelpSettingsAtCreation(state, helpSettings) {
  state.helpSettings = {
    ...DEFAULT_HELP_SETTINGS,
    ...(helpSettings || {}),
  };
}

// ---------- Migration für bestehende Spielstände ----------
export function migrateHelpSettings(state) {
  if (!state.helpSettings) {
    state.helpSettings = { ...DEFAULT_HELP_SETTINGS };
  } else {
    state.helpSettings = { ...DEFAULT_HELP_SETTINGS, ...state.helpSettings };
  }
}