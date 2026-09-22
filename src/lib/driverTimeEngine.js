// Die Vorschau verwendet dieselbe Fahrerzeitlogik wie der Worker.
export { buildWorkSteps, buildEmptyWorkSteps, buildPhases, computeFinalCounters,
  summarizePhases } from "./simulation/driverTimeEngine.ts";

// ---------- Phasen-Label ----------

export function phaseLabel(type) {
  const labels = {
    empty_drive: "Leerfahrt",
    loading: "Laden",
    charging: "Batterie laden", customs: "Zollabwicklung",
    loaded_drive: "Beladene Fahrt",
    break: "Fahrpause",
    daily_rest: "Ruhezeit",
    unloading: "Entladen",
    wait: "Wartezeit / Fahrverbot",
  };
  return labels[type] || type;
}

export function phaseShortLabel(type) {
  const labels = {
    empty_drive: "Leer",
    loading: "Laden",
    charging: "Batterie laden", customs: "Zollabwicklung",
    loaded_drive: "Fahrt",
    break: "Pause",
    daily_rest: "Ruhe",
    unloading: "Entladen",
    wait: "Wartezeit / Fahrverbot",
  };
  return labels[type] || type;
}