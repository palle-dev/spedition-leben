// Erklärt Hindernisse bei der Disposition in natürlicher Sprache.
// Reine Berechnung aus dem Spielzustand — keine Zustandsänderung.

import { getDistance, fuelEur, tollEur } from "./gameData";

// Bewertet einen Auftrag gegen die Flotte und liefert konkrete Hindernisse.
// Gibt ein Array von { reason, severity } zurück — leer wenn disponierbar.
export function getOrderObstacles(state, order) {
  const gameTime = state.gameTime;
  const obstacles = [];

  // 1. Freie Fahrzeuge mit ausreichender Kapazität
  const freeVehicles = (state.vehicles || []).filter(v =>
    v.status === "free" && v.capacityTons >= order.tons
  );

  if (freeVehicles.length === 0) {
    // Kein freies Fahrzeug — prüfen ob Fahrzeuge existieren aber blockiert sind
    const allVehicles = (state.vehicles || []).filter(v =>
      v.status !== "sold" && v.status !== "archived" && v.capacityTons >= order.tons
    );
    if (allVehicles.length === 0) {
      obstacles.push({ reason: `Kein Lkw mit ${order.tons} t Kapazität im Bestand`, severity: "hard" });
    } else {
      const onTrip = allVehicles.filter(v => v.status === "on_trip").length;
      const inMaintenance = allVehicles.filter(v => v.status === "maintenance").length;
      const lowCondition = allVehicles.filter(v => v.condition < 20).length;
      const parts = [];
      if (onTrip > 0) parts.push(`${onTrip} auf Tour`);
      if (inMaintenance > 0) parts.push(`${inMaintenance} in Wartung`);
      if (lowCondition > 0) parts.push(`${lowCondition} mit zu schlechtem Zustand`);
      obstacles.push({ reason: `Alle passenden Lkw belegt: ${parts.join(", ")}`, severity: "soft" });
    }
    return obstacles; // Ohne Fahrzeug können weitere Prüfungen entfallen
  }

  // 2. Freie Fahrer am Standort eines freien Fahrzeugs
  const freeDrivers = (state.drivers || []).filter(d =>
    d.status === "free" && d.employmentStatus === "employed" && (!d.restUntil || d.restUntil <= gameTime)
  );

  const vehiclesWithDriver = freeVehicles.filter(v =>
    freeDrivers.some(d => d.locationCity === v.locationCity)
  );

  if (vehiclesWithDriver.length === 0) {
    // Prüfen: Gibt es freie Fahrer, aber am falschen Ort?
    if (freeDrivers.length > 0) {
      const driverCities = [...new Set(freeDrivers.map(d => d.locationCity))];
      const vehicleCities = [...new Set(freeVehicles.map(v => v.locationCity))];
      const noOverlap = !driverCities.some(c => vehicleCities.includes(c));
      if (noOverlap) {
        obstacles.push({
          reason: `Freie Fahrer in ${driverCities.join(", ")}, aber freie Lkw in ${vehicleCities.join(", ")} — Standort passt nicht`,
          severity: "soft",
        });
      }
    } else {
      // Keine freien Fahrer — warum?
      const employedDrivers = (state.drivers || []).filter(d => d.employmentStatus === "employed");
      if (employedDrivers.length === 0) {
        obstacles.push({ reason: "Keine eingestellten Fahrer", severity: "hard" });
      } else {
        const onTrip = employedDrivers.filter(d => d.status === "on_trip").length;
        const resting = employedDrivers.filter(d => d.status === "resting").length;
        const sick = employedDrivers.filter(d => d.attendance === "sick").length;
        const vacation = employedDrivers.filter(d => d.attendance === "vacation").length;
        const released = employedDrivers.filter(d => d.attendance === "released").length;
        const parts = [];
        if (onTrip > 0) parts.push(`${onTrip} auf Tour`);
        if (resting > 0) parts.push(`${resting} in Ruhepause`);
        if (sick > 0) parts.push(`${sick} krankgemeldet`);
        if (vacation > 0) parts.push(`${vacation} im Urlaub`);
        if (released > 0) parts.push(`${released} freigestellt`);
        obstacles.push({ reason: `Alle Fahrer belegt: ${parts.join(", ")}`, severity: "soft" });
      }
    }
    return obstacles;
  }

  // 3. Fahrzeug am Beladungsort? Leerfahrt nötig?
  const atPickup = vehiclesWithDriver.filter(v => v.locationCity === order.fromCity);
  if (atPickup.length === 0) {
    const nearest = vehiclesWithDriver
      .map(v => ({ v, km: v.locationCity === order.fromCity ? 0 : getDistance(v.locationCity, order.fromCity) }))
      .sort((a, b) => a.km - b.km)[0];
    if (nearest && nearest.km > 0) {
      obstacles.push({
        reason: `Nächster Lkw ${nearest.km} km entfernt — Leerfahrt nötig`,
        severity: "info",
      });
    }
  }

  // 4. Finanzen: Kraftstoff und Maut
  const loadedKm = getDistance(order.fromCity, order.toCity);
  const nearestWithDriver = vehiclesWithDriver
    .map(v => ({ v, emptyKm: v.locationCity === order.fromCity ? 0 : getDistance(v.locationCity, order.fromCity) }))
    .sort((a, b) => a.emptyKm - b.emptyKm)[0];

  if (nearestWithDriver) {
    const totalKm = nearestWithDriver.emptyKm + loadedKm;
    const fuel = fuelEur(totalKm, nearestWithDriver.v.consumptionPer100km);
    const toll = tollEur(totalKm);
    const totalCost = fuel + toll;
    if (state.company.accountCents < totalCost * 100) {
      obstacles.push({
        reason: `Firmenkonto reicht nicht für Kraftstoff und Maut (${totalCost.toFixed(0)} €)`,
        severity: "hard",
      });
    }
  }

  // 5. Gefahrgut-Prüfung (vereinfacht)
  if (order.isDangerousGoods) {
    const dgVehicles = vehiclesWithDriver.filter(v => v.dgEquipment || v.tankTruck);
    if (order.dgTransportType === "tank" && !dgVehicles.some(v => v.tankTruck)) {
      obstacles.push({ reason: "Gefahrgut-Tanktransport benötigt einen Tanklkw", severity: "hard" });
    } else if (order.dgTransportType !== "tank" && dgVehicles.length === 0) {
      obstacles.push({ reason: "Gefahrgut-Transport benötigt ADR-Ausrüstung am Fahrzeug", severity: "soft" });
    }
  }

  // 6. Lieferfrist bereits überschritten
  if (order.deliveryDeadlineMin <= gameTime) {
    obstacles.push({ reason: "Lieferfrist bereits überschritten", severity: "hard" });
  }

  return obstacles;
}

// Formatiert Hindernisse für die Anzeige — gibt die wichtigsten 2-3 zurück.
export function summarizeObstacles(obstacles) {
  if (!obstacles || obstacles.length === 0) return null;
  const hard = obstacles.filter(o => o.severity === "hard");
  const soft = obstacles.filter(o => o.severity === "soft");
  const info = obstacles.filter(o => o.severity === "info");
  // Harte Hindernisse zuerst, dann weiche, dann Info
  const ordered = [...hard, ...soft, ...info];
  return ordered.slice(0, 3);
}