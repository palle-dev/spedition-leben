// UI-Daten-Helper für Geschichten und Chronik.
// Reine Lesefunktionen – verändern keinen Spielzustand.

import { formatGameTime, dayOf } from "@/lib/gameData";

export function formatStoryDeadline(min) {
  if (min == null) return "Keine Frist";
  return "Frist: " + formatGameTime(min);
}

export function formatChronicleDay(min) {
  return "Tag " + dayOf(min);
}

export function getStoryUrgency(run) {
  if (run.status === "offered") return "offer";
  if (run.status === "active") return "active";
  return "done";
}

export function getChronicleTypeLabel(type) {
  const labels = {
    story: "Geschichte",
    milestone: "Meilenstein",
    achievement: "Erfolg",
  };
  return labels[type] || type;
}

export function getChronicleTypeIcon(type) {
  const icons = {
    story: "BookOpen",
    milestone: "Heart",
    achievement: "Trophy",
  };
  return icons[type] || "BookOpen";
}