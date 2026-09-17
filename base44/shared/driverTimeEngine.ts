// Fahrerzeit-Engine für FERNWERK (Regeländerung 16).
// Phasenbasierte Planung: Zerlegt Arbeitsschritte in Abschnitte mit
// Fahrpausen (45 Min) und Ruhezeiten (720 Min) nach dem einheitlichen Fahrerzeitmodell.
// Reine Logik – keine Auth, keine Speicherung. Wird von tourEngine und simulationEngine importiert.

import {
  WORK_BUDGET_MIN, DRIVE_BUDGET_MIN, BREAK_MIN, REST_MIN,
  LOAD_MIN, UNLOAD_MIN, getDistance, driveMinutes
} from "./gameRules.ts";

// ---------- Fahrer-Zähler ----------

export function needsRest(driver) {
  return (driver.workMinutesSinceRest || 0) >= WORK_BUDGET_MIN;
}

export function needsBreak(driver) {
  return (driver.driveMinutesSinceBreak || 0) >= DRIVE_BUDGET_MIN;
}

export function remainingWorkBudget(driver) {
  return Math.max(0, WORK_BUDGET_MIN - (driver.workMinutesSinceRest || 0));
}

export function remainingDriveBudget(driver) {
  return Math.max(0, DRIVE_BUDGET_MIN - (driver.driveMinutesSinceBreak || 0));
}

export function resetCounters(driver) {
  driver.workMinutesSinceRest = 0;
  driver.driveMinutesSinceBreak = 0;
}

export function resetDriveCounter(driver) {
  driver.driveMinutesSinceBreak = 0;
}

// ---------- Arbeitsschritte ----------

export function buildWorkSteps(startCity, order) {
  const steps = [];
  if (startCity !== order.fromCity) {
    const d = getDistance(startCity, order.fromCity);
    steps.push({ type: "empty_drive", fromCity: startCity, toCity: order.fromCity, distanceKm: d, durationMin: driveMinutes(d) });
  }
  // Paket 3: earliestPickupMin als Wartemarke — Fahrzeug wartet bis Ladezeitraum öffnet
  steps.push({ type: "loading", fromCity: order.fromCity, toCity: order.fromCity, distanceKm: 0, durationMin: LOAD_MIN, waitUntilMin: order.earliestPickupMin || null });
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

/**
 * Zerlegt Arbeitsschritte in Phasen mit Pausen und Ruhezeiten.
 * Algorithmus:
 * 1. Vor weiterer Arbeit: wenn workMin >= 480 → vollständige Ruhe (720 Min)
 * 2. Vor weiterer Fahrt: wenn driveMin >= 270 → Fahrpause (45 Min)
 * 3. Nur den bis zur nächsten Grenze zulässigen Teil einplanen
 * 4. Zähler fortschreiben, Pause/Ruhe einfügen, Rest fortsetzen
 */
export function buildPhases(workSteps, counters, earliestStart) {
  const phases = [];
  let t = earliestStart;
  let workMin = counters.workMin || 0;
  let driveMin = counters.driveMin || 0;

  for (const step of workSteps) {
    let remainingDur = step.durationMin;
    let remainingDist = step.distanceKm || 0;
    const isDriving = step.type === "empty_drive" || step.type === "loaded_drive";

    // Paket 3: Warten bis Ladezeitraum öffnet (earliestPickupMin).
    // Wartezeit zählt nicht als Arbeitszeit.
    if (step.waitUntilMin && t < step.waitUntilMin) {
      phases.push({ type: "wait", startMin: t, endMin: step.waitUntilMin, durationMin: step.waitUntilMin - t });
      t = step.waitUntilMin;
    }

    while (remainingDur > 0) {
      // 1. Vollständige Ruhe vor weiterer Arbeit (auch wenn beide Grenzen erreicht)
      if (workMin >= WORK_BUDGET_MIN) {
        phases.push({ type: "daily_rest", startMin: t, endMin: t + REST_MIN, durationMin: REST_MIN });
        t += REST_MIN;
        workMin = 0;
        driveMin = 0;
        continue;
      }

      // 2. Fahrpause nur vor weiterer Fahrt
      if (isDriving && driveMin >= DRIVE_BUDGET_MIN) {
        phases.push({ type: "break", startMin: t, endMin: t + BREAK_MIN, durationMin: BREAK_MIN });
        t += BREAK_MIN;
        driveMin = 0;
        continue;
      }

      // 3. Zulässiges Budget berechnen
      const workBudget = WORK_BUDGET_MIN - workMin;
      let budget = workBudget;
      if (isDriving) {
        const driveBudget = DRIVE_BUDGET_MIN - driveMin;
        budget = Math.min(workBudget, driveBudget);
      }

      const chunk = Math.min(remainingDur, budget);
      if (chunk <= 0) break;

      // 4. Phase erzeugen
      const phase = {
        type: step.type,
        startMin: t,
        endMin: t + chunk,
        durationMin: chunk,
        fromCity: step.fromCity,
        toCity: step.toCity,
      };

      if (isDriving) {
        // Distanz proportional; letzte Teilstrecke bekommt Rest exakt
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

/**
 * Berechnet die Fahrerzähler nach Abschluss eines Trips.
 * Zählt Arbeit/Lenkzeit ab der letzten vollständigen Ruhe im Trip.
 * Enthält der Trip keine Ruhe, wird ab Start gezählt.
 */
export function computeFinalCounters(phases, initialCounters = { workMin: 0, driveMin: 0 }) {
  let workMin = initialCounters.workMin || 0;
  let driveMin = initialCounters.driveMin || 0;
  for (const p of phases) {
    if (p.type === "daily_rest") { workMin = 0; driveMin = 0; continue; }
    if (p.type === "break") { driveMin = 0; continue; }
    if (p.type === "wait") continue;
    const duration = p.durationMin ?? (p.endMin - p.startMin);
    workMin += duration;
    if (p.type === "empty_drive" || p.type === "loaded_drive") driveMin += duration;
  }
  return { workMin, driveMin };
}

// ---------- Zusammenfassung für Anzeige ----------

export function summarizePhases(phases) {
  let workMin = 0, driveMin = 0, breakCount = 0, restCount = 0;
  for (const p of phases) {
    if (p.type === "break") { breakCount++; continue; }
    if (p.type === "daily_rest") { restCount++; continue; }
    if (p.type === "wait") continue;
    workMin += p.durationMin;
    if (p.type === "empty_drive" || p.type === "loaded_drive") driveMin += p.durationMin;
  }
  return {
    workMin, driveMin, breakCount, restCount,
    totalDurationMin: phases.length > 0 ? phases[phases.length - 1].endMin - phases[0].startMin : 0,
  };
}

// ---------- Migration ----------

/**
 * Migriert alte Trips mit legs zu phases.
 * Alte Trips erhalten legacyMode = true (completeTrip verwendet altes Verhalten).
 */
export function migrateTripPhases(trip) {
  if (!trip) return trip;
  if (trip.phases && trip.phases.length > 0) return trip;
  if (!trip.legs || trip.legs.length === 0) return trip;

  trip.phases = trip.legs.map(leg => {
    const phaseType = leg.type === "empty" ? "empty_drive"
      : leg.type === "drive" ? "loaded_drive"
      : leg.type === "load" ? "loading"
      : leg.type === "unload" ? "unloading"
      : leg.type === "empty_drive" ? "empty_drive"
      : leg.type;
    return {
      type: phaseType,
      startMin: leg.startMin,
      endMin: leg.endMin,
      durationMin: leg.durationMin,
      fromCity: leg.fromCity,
      toCity: leg.toCity,
      distanceKm: leg.distanceKm || 0,
    };
  });
  trip.currentPhase = trip.currentLeg || 0;
  trip.drivenKm = 0;
  trip.legacyMode = true;
  delete trip.legs;
  delete trip.currentLeg;
  return trip;
}
