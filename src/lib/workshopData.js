// Frontend-Spiegel der Werkstatt-Engine (Auftrag 27).

export const WORKSHOP_SLOT_PRICE = 500000; // 5.000 €
export const INTERNAL_MAINT_PARTS = 90000; // 900 €
export const INTERNAL_MAINT_WORK_MIN = 480; // 8 Arbeitsstunden
export const AUTOMATION_DEFAULT_MAX_COST = 150000; // 1.500 €

export const ORDER_STATUS_LABELS = {
  planned: "Geplant",
  waiting: "Wartet",
  in_progress: "In Arbeit",
  interrupted: "Unterbrochen",
  completed: "Abgeschlossen",
  cancelled: "Storniert",
};

export const ORDER_STATUS_COLORS = {
  planned: "text-sky-300 bg-sky-400/10 border-sky-400/20",
  waiting: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  in_progress: "text-lime bg-lime/10 border-lime/20",
  interrupted: "text-red-300 bg-red-400/10 border-red-400/20",
  completed: "text-muted-foreground bg-white/5 border-white/10",
  cancelled: "text-muted-foreground bg-white/5 border-white/10",
};

export function formatWorkHours(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

export function computeEstimatedEnd(state, order) {
  if (order.status === "completed") return order.completedAtMin;
  if (order.status === "in_progress" && order.working) {
    const remaining = order.requiredMinutes - order.completedMinutes;
    return state.gameTime + remaining;
  }
  // Grobe Schätzung: verbleibende Arbeitsstunden ab nächstem Dienstbeginn
  const remaining = order.requiredMinutes - order.completedMinutes;
  const clock = state.gameTime % 1440;
  let nextStart = state.gameTime;
  if (clock >= 960) {
    // Nach Dienstende: nächster Tag 08:00
    nextStart = Math.floor(state.gameTime / 1440) * 1440 + 1440 + 480;
  } else if (clock < 480) {
    // Vor Dienstbeginn: heute 08:00
    nextStart = Math.floor(state.gameTime / 1440) * 1440 + 480;
  }
  // Arbeitsminuten auf Dienstzeiten verteilen (8h/Tag = 480 Min.)
  const workDays = Math.ceil(remaining / 480);
  const fullDays = Math.floor(remaining / 480);
  const lastDayMinutes = remaining % 480;
  let endMin = nextStart + fullDays * 1440;
  if (lastDayMinutes > 0) endMin += lastDayMinutes;
  else if (fullDays > 0) endMin = nextStart + (fullDays - 1) * 1440 + 480;
  return endMin;
}