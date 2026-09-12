// Client-Seite Fahrerzeit-Engine für FERNWERK (Regeländerung 16).
// Spiegelt base44/shared/driverTimeEngine.ts für Vorschau-Berechnungen in der UI.
// Phasenbasierte Planung mit Fahrpausen (45 Min) und Ruhezeiten (720 Min).

import {
  WORK_BUDGET_MIN, DRIVE_BUDGET_MIN, BREAK_MIN, REST_MIN,
  LOAD_MIN, UNLOAD_MIN, getDistance, driveMinutes
} from "./gameData";

// ---------- Arbeitsschritte ----------

export function buildWorkSteps(startCity, order) {
  const steps = [];
  if (startCity !== order.fromCity) {
    const d = getDistance(startCity, order.fromCity);
    steps.push({ type: "empty_drive", fromCity: startCity, toCity: order.fromCity, distanceKm: d, durationMin: driveMinutes(d) });
  }
  steps.push({ type: "loading", fromCity: order.fromCity, toCity: order.fromCity, distanceKm: 0, durationMin: LOAD_MIN });
  const d = getDistance(order.fromCity, order.toCity);
  steps.push({ type: "loaded_drive", fromCity: order.fromCity, toCity: order.toCity, distanceKm: d, durationMin: driveMinutes(d) });
  steps.push({ type: "unloading", fromCity: order.toCity, toCity: order.toCity, distanceKm: 0, durationMin: UNLOAD_MIN });
  return steps;
}

export function buildEmptyWorkSteps(fromCity, toCity) {
  const d = getDistance(fromCity, toCity);
  return [{ type: "empty_drive", fromCity, toCity, distanceKm: d, durationMin: driveMinutes(d) }];
}

// ---------- Phasen-Planung ----------

export function buildPhases(workSteps, counters, earliestStart) {
  const phases = [];
  let t = earliestStart;
  let workMin = counters.workMin || 0;
  let driveMin = counters.driveMin || 0;

  for (const step of workSteps) {
    let remainingDur = step.durationMin;
    let remainingDist = step.distanceKm || 0;
    const isDriving = step.type === "empty_drive" || step.type === "loaded_drive";

    while (remainingDur > 0) {
      if (workMin >= WORK_BUDGET_MIN) {
        phases.push({ type: "daily_rest", startMin: t, endMin: t + REST_MIN, durationMin: REST_MIN });
        t += REST_MIN;
        workMin = 0;
        driveMin = 0;
        continue;
      }
      if (isDriving && driveMin >= DRIVE_BUDGET_MIN) {
        phases.push({ type: "break", startMin: t, endMin: t + BREAK_MIN, durationMin: BREAK_MIN });
        t += BREAK_MIN;
        driveMin = 0;
        continue;
      }

      const workBudget = WORK_BUDGET_MIN - workMin;
      let budget = workBudget;
      if (isDriving) {
        const driveBudget = DRIVE_BUDGET_MIN - driveMin;
        budget = Math.min(workBudget, driveBudget);
      }

      const chunk = Math.min(remainingDur, budget);
      if (chunk <= 0) break;

      const phase = {
        type: step.type,
        startMin: t,
        endMin: t + chunk,
        durationMin: chunk,
        fromCity: step.fromCity,
        toCity: step.toCity,
      };

      if (isDriving) {
        const chunkKm = remainingDur === chunk ? remainingDist : Math.round(remainingDist * chunk / remainingDur);
        phase.distanceKm = chunkKm;
        remainingDist -= chunkKm;
      } else {
        phase.totalDurationMin = step.durationMin;
        phase.completedMin = chunk;
      }

      phases.push(phase);
      t += chunk;
      remainingDur -= chunk;
      workMin += chunk;
      if (isDriving) driveMin += chunk;
    }
  }

  return { phases, endMin: t, finalWorkMin: workMin, finalDriveMin: driveMin };
}

// ---------- Zähler nach Trip-Ende ----------

export function computeFinalCounters(phases) {
  let lastRestIndex = -1;
  for (let i = phases.length - 1; i >= 0; i--) {
    if (phases[i].type === "daily_rest") { lastRestIndex = i; break; }
  }
  let workMin = 0, driveMin = 0;
  for (let i = lastRestIndex + 1; i < phases.length; i++) {
    const p = phases[i];
    if (p.type === "break" || p.type === "daily_rest") continue;
    workMin += p.durationMin;
    if (p.type === "empty_drive" || p.type === "loaded_drive") driveMin += p.durationMin;
  }
  return { workMin, driveMin };
}

// ---------- Zusammenfassung für Anzeige ----------

export function summarizePhases(phases) {
  let workMin = 0, driveMin = 0, breakCount = 0, restCount = 0;
  for (const p of phases) {
    if (p.type === "break") { breakCount++; continue; }
    if (p.type === "daily_rest") { restCount++; continue; }
    workMin += p.durationMin;
    if (p.type === "empty_drive" || p.type === "loaded_drive") driveMin += p.durationMin;
  }
  return {
    workMin, driveMin, breakCount, restCount,
    totalDurationMin: phases.length > 0 ? phases[phases.length - 1].endMin - phases[0].startMin : 0,
  };
}

// ---------- Phasen-Label ----------

export function phaseLabel(type) {
  const labels = {
    empty_drive: "Leerfahrt",
    loading: "Laden",
    loaded_drive: "Beladene Fahrt",
    break: "Fahrpause",
    daily_rest: "Ruhezeit",
    unloading: "Entladen",
  };
  return labels[type] || type;
}

export function phaseShortLabel(type) {
  const labels = {
    empty_drive: "Leer",
    loading: "Laden",
    loaded_drive: "Fahrt",
    break: "Pause",
    daily_rest: "Ruhe",
    unloading: "Entladen",
  };
  return labels[type] || type;
}