// Client-Seite Spiegel der Tourenketten-Engine für FRACHTFIEBER.
// Berechnet Vorschauen ohne Backend-Aufruf. Die Bestätigung läuft über gameCommand.
// Logik identisch zu base44/shared/tourEngine.ts — gleiche Planungsgrundlage
// für Vorschau und Start, damit keine Abweichungen entstehen.

import {
  CITIES, getDistance, driveMinutes, fuelCents, tollCents, roundCents,
  LOAD_MIN, UNLOAD_MIN, MAX_DUTY_MIN, REST_MIN, WORK_BUDGET_MIN, formatGameTime,
  checkBodyTypeCompatibility, computeBodyBonusFactor,
} from "@/lib/gameData";
import {
  buildPhases, buildWorkSteps, buildEmptyWorkSteps, computeFinalCounters,
} from "@/lib/driverTimeEngine";

// ---------- Hilfsfunktionen ----------

// Frühester verfügbarer Zeitpunkt für ein Fahrzeug/Fahrer-Paar.
// Gibt die aktuelle Spielzeit zurück, wenn Fahrzeug/Fahrer frei sind.
export function earliestAvailable(state, vehicle, driver) {
  let t = state.gameTime;
  if (vehicle.status === "on_trip") {
    const trip = state.trips.find(tr => tr.id === vehicle.tripId);
    if (trip) t = Math.max(t, trip.endMin);
  }
  if (vehicle.status === "maintenance" && vehicle.maintenanceUntil) {
    t = Math.max(t, vehicle.maintenanceUntil);
  }
  if (driver.status === "resting" && driver.restUntil) {
    t = Math.max(t, driver.restUntil);
  }
  if (driver.status === "on_trip") {
    const trip = state.trips.find(tr => tr.id === driver.tripId || tr.driverId === driver.id);
    if (trip) t = Math.max(t, trip.endMin);
  }
  return t;
}

// Nächste Vorausplanung: frühester Start eines geplanten Einsatzes in einer
// aktiven Tour für dieses Fahrzeug/diesen Fahrer.
export function nextReservationStart(state, vehicle, driver) {
  let earliest = null;
  for (const tour of state.tours || []) {
    if (tour.status !== "active" && tour.status !== "planned") continue;
    if (tour.pauseReason) continue;
    if (tour.vehicleId !== vehicle.id && tour.driverId !== driver.id) continue;
    for (const dep of (tour.deployments || [])) {
      if (dep.status !== "planned") continue;
      if (dep.startMin <= state.gameTime) continue;
      if (earliest === null || dep.startMin < earliest) earliest = dep.startMin;
    }
  }
  return earliest;
}

// Ermittelt die zukünftige Stadt eines Fahrzeugs nach Abschluss aller
// laufenden Touren.
export function futureLocation(state, vehicle) {
  if (vehicle.status === "on_trip" && vehicle.tripId) {
    const trip = state.trips.find(t => t.id === vehicle.tripId);
    if (trip && trip.phases) {
      for (let i = trip.phases.length - 1; i >= 0; i--) {
        const p = trip.phases[i];
        if (p.type === "empty_drive" || p.type === "loaded_drive") return p.toCity;
      }
    }
  }
  for (const tour of state.tours || []) {
    if (tour.status !== "active") continue;
    if (tour.vehicleId !== vehicle.id) continue;
    const allDeps = [...(tour.deployments || []), tour.returnDeployment].filter(Boolean);
    for (let i = allDeps.length - 1; i >= 0; i--) {
      if (allDeps[i].status !== "completed" && allDeps[i].status !== "cancelled") {
        return allDeps[i].toCity || vehicle.locationCity;
      }
    }
  }
  return vehicle.locationCity;
}

// Ermittelt die zukünftige Stadt eines Fahrers nach Abschluss aller
// laufenden Touren.
export function futureDriverLocation(state, driver) {
  if (driver.status === "on_trip") {
    const trip = state.trips.find(t => t.driverId === driver.id && t.status === "in_progress");
    if (trip && trip.phases) {
      for (let i = trip.phases.length - 1; i >= 0; i--) {
        const p = trip.phases[i];
        if (p.type === "empty_drive" || p.type === "loaded_drive") return p.toCity;
      }
    }
  }
  for (const tour of state.tours || []) {
    if (tour.status !== "active") continue;
    if (tour.driverId !== driver.id) continue;
    const allDeps = [...(tour.deployments || []), tour.returnDeployment].filter(Boolean);
    for (let i = allDeps.length - 1; i >= 0; i--) {
      if (allDeps[i].status !== "completed" && allDeps[i].status !== "cancelled") {
        return allDeps[i].toCity || driver.locationCity;
      }
    }
  }
  return driver.locationCity;
}

// ---------- Deployment-Planung ----------

// Plant einen einzelnen Einsatz mit phasenbasierter Fahrerzeitplanung.
function buildDeployment(state, order, vehicle, startCity, earliestStart, counters) {
  const workSteps = buildWorkSteps(startCity, order);
  const result = buildPhases(workSteps, counters || { workMin: 0, driveMin: 0 }, earliestStart);

  const totalKm = workSteps.reduce((s, step) => s + (step.distanceKm || 0), 0);
  const emptyKm = startCity !== order.fromCity ? getDistance(startCity, order.fromCity) : 0;
  const loadedKm = getDistance(order.fromCity, order.toCity);
  const fuel = fuelCents(totalKm, vehicle.consumptionPer100km);
  const toll = tollCents(totalKm);

  // Aufbau-Bonus: passender Spezial-Lkw erhält höhere Vergütung.
  const bodyBonusFactor = computeBodyBonusFactor(order, vehicle);
  const adjustedPayment = Math.round(order.paymentCents * bodyBonusFactor);

  return {
    orderId: order.id,
    orderStatus: order.status,
    customer: order.customer,
    cargo: order.cargo,
    tons: order.tons,
    fromCity: order.fromCity,
    toCity: order.toCity,
    emptyFromCity: startCity !== order.fromCity ? startCity : null,
    phases: result.phases,
    emptyKm,
    loadedKm,
    totalKm,
    durationMin: result.endMin - earliestStart,
    startMin: earliestStart,
    endMin: result.endMin,
    finalWorkMin: result.finalWorkMin,
    finalDriveMin: result.finalDriveMin,
    fuelCents: fuel,
    tollCents: toll,
    variableCostCents: fuel + toll,
    paymentCents: adjustedPayment,
    bodyBonusFactor,
    contributionCents: adjustedPayment - fuel - toll,
    deliveryDeadlineMin: order.deliveryDeadlineMin,
    deadlineBufferMin: order.deliveryDeadlineMin - result.endMin,
  };
}

// Plant eine Leerfahrt als eigenen Einsatz.
function buildEmptyDeployment(state, fromCity, toCity, vehicle, earliestStart, counters) {
  const workSteps = buildEmptyWorkSteps(fromCity, toCity);
  const result = buildPhases(workSteps, counters || { workMin: 0, driveMin: 0 }, earliestStart);
  const d = getDistance(fromCity, toCity);
  const fuel = fuelCents(d, vehicle.consumptionPer100km);
  const toll = tollCents(d);
  return {
    orderId: null,
    orderStatus: null,
    customer: "Leerfahrt",
    cargo: null,
    tons: 0,
    fromCity,
    toCity,
    emptyFromCity: fromCity,
    phases: result.phases,
    emptyKm: d,
    loadedKm: 0,
    totalKm: d,
    durationMin: result.endMin - earliestStart,
    startMin: earliestStart,
    endMin: result.endMin,
    finalWorkMin: result.finalWorkMin,
    finalDriveMin: result.finalDriveMin,
    fuelCents: fuel,
    tollCents: toll,
    variableCostCents: fuel + toll,
    paymentCents: 0,
    contributionCents: -(fuel + toll),
    deliveryDeadlineMin: null,
    deadlineBufferMin: null,
  };
}

// ---------- Tourenplanung ----------

// Plant eine komplette Tourenkette aus geordneten Auftrags-IDs.
export function buildTourPlan(state, opts) {
  const { vehicleId, driverId, orderIds, desiredEndCity, latestReturnMin, minStartTime } = opts;
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);
  if (!vehicle || !driver) return { error: "Fahrzeug oder Fahrer nicht gefunden." };

  // Zukünftige Städte nach Abschluss aller laufenden Touren
  const vehicleFutureCity = futureLocation(state, vehicle);
  const driverFutureCity = futureDriverLocation(state, driver);
  // Fahrer-Repositionierung: Wenn Fahrer und Lkw an verschiedenen Orten sind,
  // reist der Fahrer per Bahn/Bus zum Fahrzeug. Das kostet Zeit, aber keinen
  // Kraftstoff/Maut.
  let driverTravelMin = 0;
  if (vehicleFutureCity !== driverFutureCity) {
    driverTravelMin = driveMinutes(getDistance(driverFutureCity, vehicleFutureCity));
  }

  const _calcStart = earliestAvailable(state, vehicle, driver) + driverTravelMin;
  const earliestStart = minStartTime ? Math.max(_calcStart, minStartTime) : _calcStart;

  // Natürliche Ruhe-Rücksetzung
  if (driver.status === "free") {
    if (!driver.freeSinceMin || state.gameTime - driver.freeSinceMin >= REST_MIN) {
      driver.workMinutesSinceRest = 0;
      driver.driveMinutesSinceBreak = 0;
      if (!driver.freeSinceMin) driver.freeSinceMin = state.gameTime;
    }
  }
  const initCounters = {
    workMin: driver.status === "resting" ? 0 : (driver.workMinutesSinceRest || 0),
    driveMin: driver.status === "resting" ? 0 : (driver.driveMinutesSinceBreak || 0),
  };

  // Planungslogik als lokale Funktion für Neu-Planung mit Ruhe-voraus-Strategie.
  function _tryPlan(planStart, initCounters) {
    let currentCity = vehicleFutureCity;
    let t = planStart;
    const deployments = [];
    const acceptedOrderIds = [];
    let totalKm = 0, emptyKm = 0, loadedKm = 0;
    let totalFuel = 0, totalToll = 0, totalPayment = 0;
    let minBuffer = Infinity;
    let counters = { ...initCounters };

    for (const orderId of orderIds) {
      const order = state.orders.find(o => o.id === orderId);
      if (!order) return { error: "Auftrag nicht gefunden: " + orderId };
      if (order.status !== "offered" && order.status !== "angenommen") {
        return { error: "Auftrag " + order.customer + " ist nicht verfügbar (Status: " + order.status + ")." };
      }
      if (order.tons > vehicle.capacityTons) {
        return { error: "Überladung: " + order.tons + " t überschreiten Kapazität von " + vehicle.capacityTons + " t." };
      }
      const bodyCheck = checkBodyTypeCompatibility(order, vehicle);
      if (!bodyCheck.ok) return { error: bodyCheck.error };
      const dep = buildDeployment(state, order, vehicle, currentCity, t, counters);
      // Spätlieferung-Toleranz: 4h Gnadenfrist.
      const LATE_GRACE_MIN = 240;
      if (dep.endMin > order.deliveryDeadlineMin + LATE_GRACE_MIN) {
        return { error: "Lieferung von " + order.customer + " würde die Lieferfrist überschreiten (Ankunft " + formatGameTime(dep.endMin) + ", Frist " + formatGameTime(order.deliveryDeadlineMin) + ")." };
      }
      if (order.status === "offered" && order.acceptDeadlineMin <= state.gameTime) {
        return { error: "Annahmefrist für " + order.customer + " ist abgelaufen." };
      }
      if (order.status === "offered") acceptedOrderIds.push(orderId);
      deployments.push(dep);
      totalKm += dep.totalKm; emptyKm += dep.emptyKm; loadedKm += dep.loadedKm;
      totalFuel += dep.fuelCents; totalToll += dep.tollCents; totalPayment += dep.paymentCents;
      if (dep.deadlineBufferMin !== null && dep.deadlineBufferMin < minBuffer) minBuffer = dep.deadlineBufferMin;
      currentCity = order.toCity;
      counters = { workMin: dep.finalWorkMin, driveMin: dep.finalDriveMin };
      t = dep.endMin;
    }

    let returnDeployment = null;
    if (desiredEndCity && currentCity !== desiredEndCity) {
      const dep = buildEmptyDeployment(state, currentCity, desiredEndCity, vehicle, t, counters);
      returnDeployment = dep;
      totalKm += dep.totalKm; emptyKm += dep.emptyKm;
      totalFuel += dep.fuelCents; totalToll += dep.tollCents;
      counters = { workMin: dep.finalWorkMin, driveMin: dep.finalDriveMin };
      t = dep.endMin;
    }

    const lastDeliveryEnd = deployments.length > 0 ? deployments[deployments.length - 1].endMin : planStart;
    const tourEndMin = returnDeployment ? returnDeployment.endMin : lastDeliveryEnd;
    let driverFreeMin = t;
    if (counters.workMin >= WORK_BUDGET_MIN) driverFreeMin = t + REST_MIN;
    if (latestReturnMin && tourEndMin > latestReturnMin) {
      return { error: "Tour endet zu spät (" + formatGameTime(tourEndMin) + "), späteste Rückkehr " + formatGameTime(latestReturnMin) + "." };
    }
    const reservationStart = nextReservationStart(state, vehicle, driver);
    if (reservationStart !== null && driverFreeMin > reservationStart) {
      return { error: "Tour überschneidet sich mit Vorausplanung (Tour endet " + formatGameTime(driverFreeMin) + ", nächste Reservierung startet " + formatGameTime(reservationStart) + ")." };
    }
    const liquidityCheck = checkTourLiquidity(state, deployments, returnDeployment, planStart);
    if (!liquidityCheck.ok) return { error: "Liquidität reicht nicht: " + liquidityCheck.reason };
    const hasMidTourRest = deployments.some(d => (d.phases || []).some(p => p.type === "daily_rest"));
    return {
      ok: true, hasMidTourRest,
      deployments, returnDeployment, acceptedOrderIds,
      totalKm, emptyKm, loadedKm,
      totalFuelCents: totalFuel, totalTollCents: totalToll,
      totalVariableCostCents: totalFuel + totalToll,
      totalPaymentCents: totalPayment,
      totalContributionCents: totalPayment - totalFuel - totalToll,
      earliestStartMin: planStart,
      lastDeliveryEndMin: lastDeliveryEnd,
      tourEndMin, driverFreeMin,
      minDeadlineBufferMin: minBuffer === Infinity ? null : minBuffer,
      reservedUntil: driverFreeMin,
    };
  }

  // Erster Versuch: mit aktuellen Fahrer-Zählern planen.
  let planResult = _tryPlan(earliestStart, initCounters);

  // Ruhe-voraus-Strategie: Wenn der Fahrer bereits Arbeitszeit angesammelt hat,
  // kann die erste Planung eine mid-tour-Ruhe einbauen oder an einer Frist
  // scheitern. Dann: Fahrer ruht zuerst (720 Min), dann startet die Tour mit
  // frischen Zählern.
  const needsRestFirst = initCounters.workMin > 0 && (
    planResult.error || (planResult.ok && planResult.hasMidTourRest)
  );
  if (needsRestFirst) {
    const restFirstResult = _tryPlan(earliestStart + REST_MIN, { workMin: 0, driveMin: 0 });
    if (restFirstResult.ok) planResult = restFirstResult;
  }

  if (planResult.error) return { error: planResult.error };

  return {
    ...planResult,
    ok: true,
    vehicleId, driverId,
    startCity: vehicle.locationCity,
    desiredEndCity: desiredEndCity || null,
    latestReturnMin: latestReturnMin || null,
    driverTravelMin,
    driverTravelFromCity: driverTravelMin > 0 ? driverFutureCity : null,
  };
}

// Simuliert den Firmenkontoverlauf für eine Tour.
function checkTourLiquidity(state, deployments, returnDeployment, startMin) {
  let balance = state.company.accountCents;
  const openCompany = (state.openCosts || []).filter(o => o.account === "company").reduce((s, o) => s + o.amountCents, 0);
  balance -= openCompany;

  const events = [];
  for (const dep of deployments) {
    events.push({ min: dep.startMin, type: "cost", amount: dep.fuelCents + dep.tollCents, label: "Einsatz " + (dep.customer || "Leer") });
    events.push({ min: dep.endMin, type: "income", amount: dep.paymentCents, label: "Vergütung " + (dep.customer || "") });
  }
  if (returnDeployment) {
    events.push({ min: returnDeployment.startMin, type: "cost", amount: returnDeployment.fuelCents + returnDeployment.tollCents, label: "Rückkehr" });
  }
  const tourEnd = returnDeployment ? returnDeployment.endMin : (deployments.length > 0 ? deployments[deployments.length - 1].endMin : startMin);
  const startDay = Math.floor(startMin / 1440);
  const endDay = Math.floor(tourEnd / 1440);
  const dailyCosts = (state.drivers.length * 10000 + state.branches.length * 10000);
  for (let day = startDay; day <= endDay; day++) {
    const midnight = day * 1440;
    if (midnight > startMin && midnight <= tourEnd) {
      events.push({ min: midnight, type: "cost", amount: dailyCosts, label: "Tageskosten" });
    }
  }
  events.sort((a, b) => a.min - b.min || (a.type === "cost" ? -1 : 1));

  for (const ev of events) {
    if (ev.type === "cost") {
      balance -= ev.amount;
      if (balance < 0) {
        return { ok: false, reason: "Firmenkonto wird bei '" + ev.label + "' (" + formatGameTime(ev.min) + ") negativ (" + (balance / 100).toFixed(2) + " €)." };
      }
    } else {
      balance += ev.amount;
    }
  }
  return { ok: true, finalBalance: balance };
}

// ---------- Rückladungs-Suche ----------

export function findReturnLoads(state, primaryOrderId, vehicleId, driverId) {
  const order = state.orders.find(o => o.id === primaryOrderId);
  if (!order) return { error: "Auftrag nicht gefunden." };
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);
  if (!vehicle || !driver) return { error: "Fahrzeug/Fahrer nicht gefunden." };

  const destCity = order.toCity;
  const candidates = [];

  // 1. Direkte Rückladungen ab Zielort
  for (const o of state.orders) {
    if (o.id === primaryOrderId) continue;
    if (o.status !== "offered" && o.status !== "angenommen") continue;
    if (o.fromCity !== destCity) continue;
    if (o.tons > vehicle.capacityTons) continue;
    if (!checkBodyTypeCompatibility(o, vehicle).ok) continue;

    const plan = buildTourPlan(state, {
      vehicleId, driverId,
      orderIds: [primaryOrderId, o.id],
      desiredEndCity: null, latestReturnMin: null,
    });
    if (plan.ok) {
      candidates.push({ order: o, type: "direct_return", plan, description: "Direkte Rückladung " + o.fromCity + " → " + o.toCity + " (" + o.customer + ")" });
    } else {
      candidates.push({ order: o, type: "direct_return", plan: null, error: plan.error, description: o.fromCity + " → " + o.toCity + " – nicht ausführbar" });
    }
  }

  // 2. Rückladungen mit Leerfahrt zum Abholort
  for (const o of state.orders) {
    if (o.id === primaryOrderId) continue;
    if (o.status !== "offered" && o.status !== "angenommen") continue;
    if (o.fromCity === destCity) continue;
    if (o.toCity !== order.fromCity && o.toCity !== "Hamburg") continue;
    if (o.tons > vehicle.capacityTons) continue;
    if (!checkBodyTypeCompatibility(o, vehicle).ok) continue;

    const plan = buildTourPlan(state, {
      vehicleId, driverId,
      orderIds: [primaryOrderId, o.id],
      desiredEndCity: null, latestReturnMin: null,
    });
    if (plan.ok) {
      candidates.push({ order: o, type: "empty_then_return", plan, description: "Leerfahrt " + destCity + " → " + o.fromCity + ", dann " + o.fromCity + " → " + o.toCity + " (" + o.customer + ")" });
    }
  }

  return { candidates: candidates.sort((a, b) => {
    if (!a.plan && !b.plan) return 0;
    if (!a.plan) return 1;
    if (!b.plan) return -1;
    return (b.plan.totalContributionCents || 0) - (a.plan.totalContributionCents || 0);
  })};
}

// ---------- Assistent: Flotten-Verplanung ----------

export function suggestTours(state, opts) {
  const { vehicleIds, earliestStart, horizonMin, desiredEndCity, latestReturnMin, mode, acceptNew } = opts;
  const suggestions = [];
  const startMin = earliestStart || state.gameTime;
  const maxMin = startMin + (horizonMin || 2880);
  const usedDriverIds = new Set();
  const usedOrderIds = new Set();

  for (const vehicleId of vehicleIds || state.vehicles.map(v => v.id)) {
    const vehicle = state.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) continue;
    if (vehicle.status !== "free" && vehicle.status !== "resting") continue;
    if (vehicle.condition < 20) continue;

    const vehicleFutureCity = futureLocation(state, vehicle);
    const sameCityDrivers = state.drivers.filter(d => {
      if (d.employmentStatus !== "employed") return false;
      if (usedDriverIds.has(d.id)) return false;
      if (d.status !== "free" && d.status !== "resting") return false;
      return futureDriverLocation(state, d) === vehicleFutureCity;
    });
    const crossCityDrivers = sameCityDrivers.length < 4 ? state.drivers.filter(d => {
      if (d.employmentStatus !== "employed") return false;
      if (usedDriverIds.has(d.id)) return false;
      if (d.status !== "free") return false;
      return futureDriverLocation(state, d) !== vehicleFutureCity;
    }) : [];
    const candidateDrivers = [...sameCityDrivers, ...crossCityDrivers]
      .sort((a, b) => (a.workMinutesSinceRest || 0) - (b.workMinutesSinceRest || 0))
      .slice(0, 4);
    if (candidateDrivers.length === 0) continue;

    const acceptedOrders = state.orders.filter(o =>
      o.status === "angenommen" &&
      o.deliveryDeadlineMin > startMin - 240 &&
      o.tons <= vehicle.capacityTons &&
      checkBodyTypeCompatibility(o, vehicle).ok &&
      !usedOrderIds.has(o.id)
    ).sort((a, b) => a.deliveryDeadlineMin - b.deliveryDeadlineMin);

    const offeredOrders = acceptNew ? state.orders.filter(o =>
      o.status === "offered" &&
      o.acceptDeadlineMin > startMin &&
      o.deliveryDeadlineMin > startMin &&
      o.tons <= vehicle.capacityTons &&
      checkBodyTypeCompatibility(o, vehicle).ok &&
      !usedOrderIds.has(o.id)
    ) : [];

    const allOrders = [...acceptedOrders, ...offeredOrders];
    if (allOrders.length > 12) {
      const scored = allOrders.map(o => {
        const emptyKm = getDistance(vehicleFutureCity, o.fromCity);
        const loadedKm = getDistance(o.fromCity, o.toCity);
        const totalKm = (emptyKm + loadedKm) || 1;
        return { o, score: (o.paymentCents || 0) / totalKm };
      });
      scored.sort((a, b) => b.score - a.score);
      allOrders.length = 0;
      for (const s of scored.slice(0, 12)) allOrders.push(s.o);
    }

    let bestPlan = null;
    let bestOrders = null;
    let bestDriver = null;

    for (const driver of candidateDrivers) {
      let driverBestPlan = null;
      let driverBestOrders = null;

      for (const o of allOrders) {
        const plan = buildTourPlan(state, {
          vehicleId, driverId: driver.id,
          orderIds: [o.id], desiredEndCity, latestReturnMin,
        });
        if (plan.ok && plan.tourEndMin <= maxMin) {
          const isNew = o.status === "offered";
          if (isNew && plan.totalContributionCents <= 0) continue;
          if (!driverBestPlan || comparePlans(plan, driverBestPlan, mode) < 0) {
            driverBestPlan = plan;
            driverBestOrders = [o.id];
          }
        }
      }

      // Doppel-Touren
      const chainMap = new Map();
      for (const o of allOrders) {
        if (!chainMap.has(o.fromCity)) chainMap.set(o.fromCity, []);
        chainMap.get(o.fromCity).push(o);
      }
      for (const o1 of allOrders) {
        const chainable = chainMap.get(o1.toCity) || [];
        for (const o2 of chainable) {
          if (o1.id === o2.id) continue;
          const plan = buildTourPlan(state, {
            vehicleId, driverId: driver.id,
            orderIds: [o1.id, o2.id], desiredEndCity, latestReturnMin,
          });
          if (plan.ok && plan.tourEndMin <= maxMin) {
            const hasNew = o1.status === "offered" || o2.status === "offered";
            if (hasNew && plan.totalContributionCents <= 0) continue;
            if (!driverBestPlan || comparePlans(plan, driverBestPlan, mode) < 0) {
              driverBestPlan = plan;
              driverBestOrders = [o1.id, o2.id];
            }
          }
        }
      }

      if (driverBestPlan && (!bestPlan || comparePlans(driverBestPlan, bestPlan, mode) < 0)) {
        bestPlan = driverBestPlan;
        bestOrders = driverBestOrders;
        bestDriver = driver;
      }
    }

    if (bestPlan) {
      usedDriverIds.add(bestDriver.id);
      bestOrders.forEach(oid => usedOrderIds.add(oid));
      suggestions.push({
        vehicleId, driverId: bestDriver.id,
        vehicle, driver: bestDriver,
        orderIds: bestOrders, plan: bestPlan, mode,
      });
    }
  }

  return { suggestions };
}

function comparePlans(a, b, mode) {
  if (mode === "high_margin") return (b.totalContributionCents || 0) - (a.totalContributionCents || 0);
  if (mode === "low_empty") {
    const aOrders = a.deployments.length;
    const bOrders = b.deployments.length;
    if (aOrders !== bOrders) return bOrders - aOrders;
    return (a.emptyKm || 0) - (b.emptyKm || 0);
  }
  const aScore = (a.totalContributionCents || 0) / Math.max(1, a.totalKm || 1);
  const bScore = (b.totalContributionCents || 0) / Math.max(1, b.totalKm || 1);
  if (Math.abs(aScore - bScore) > 0.01) return bScore - aScore;
  return (a.minDeadlineBufferMin || 0) - (b.minDeadlineBufferMin || 0);
}