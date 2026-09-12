// Client-Seite Spiegel der Tourenketten-Engine für FERNWERK.
// Berechnet Vorschauen ohne Backend-Aufruf. Die Bestätigung läuft über gameCommand.
// Logik identisch zu base44/shared/tourEngine.ts.

import {
  CITIES, getDistance, driveMinutes, fuelEur as _fe, tollEur as _te,
  LOAD_MIN, UNLOAD_MIN, MAX_DUTY_MIN, REST_MIN, WORK_BUDGET_MIN, formatGameTime
} from "@/lib/gameData";
import {
  buildPhases, buildWorkSteps, buildEmptyWorkSteps, computeFinalCounters,
} from "@/lib/driverTimeEngine";

// Cent-basierte Berechnung (gameData.js hat Euro-Funktionen, wir brauchen Cent)
function fuelCents(km, consumptionPer100km) {
  return Math.round(km * consumptionPer100km / 100 * 1.70 * 100);
}
function tollCents(km) {
  return Math.round(km * 0.20 * 100);
}

// Frühester verfügbarer Zeitpunkt für ein Fahrzeug/Fahrer-Paar.
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
  for (const tour of state.tours || []) {
    if (tour.status !== "active" && tour.status !== "planned") continue;
    if (tour.vehicleId === vehicle.id || tour.driverId === driver.id) {
      if (tour.reservedUntil) t = Math.max(t, tour.reservedUntil);
    }
  }
  return t;
}

// Plant einen einzelnen Einsatz mit phasenbasierter Fahrerzeitplanung.
function buildDeployment(state, order, vehicle, startCity, earliestStart, counters) {
  const workSteps = buildWorkSteps(startCity, order);
  const result = buildPhases(workSteps, counters || { workMin: 0, driveMin: 0 }, earliestStart);
  const totalKm = workSteps.reduce((s, step) => s + (step.distanceKm || 0), 0);
  const emptyKm = startCity !== order.fromCity ? getDistance(startCity, order.fromCity) : 0;
  const loadedKm = getDistance(order.fromCity, order.toCity);
  const fuel = fuelCents(totalKm, vehicle.consumptionPer100km);
  const toll = tollCents(totalKm);
  return {
    orderId: order.id, orderStatus: order.status, customer: order.customer, cargo: order.cargo, tons: order.tons,
    fromCity: order.fromCity, toCity: order.toCity,
    emptyFromCity: startCity !== order.fromCity ? startCity : null,
    phases: result.phases, emptyKm, loadedKm, totalKm,
    durationMin: result.endMin - earliestStart, startMin: earliestStart, endMin: result.endMin,
    finalWorkMin: result.finalWorkMin, finalDriveMin: result.finalDriveMin,
    fuelCents: fuel, tollCents: toll, variableCostCents: fuel + toll,
    paymentCents: order.paymentCents, contributionCents: order.paymentCents - fuel - toll,
    deliveryDeadlineMin: order.deliveryDeadlineMin, deadlineBufferMin: order.deliveryDeadlineMin - result.endMin,
  };
}

function buildEmptyDeployment(state, fromCity, toCity, vehicle, earliestStart, counters) {
  const workSteps = buildEmptyWorkSteps(fromCity, toCity);
  const result = buildPhases(workSteps, counters || { workMin: 0, driveMin: 0 }, earliestStart);
  const d = getDistance(fromCity, toCity);
  const fuel = fuelCents(d, vehicle.consumptionPer100km);
  const toll = tollCents(d);
  return {
    orderId: null, orderStatus: null, customer: "Leerfahrt", cargo: null, tons: 0,
    fromCity, toCity, emptyFromCity: fromCity,
    phases: result.phases, emptyKm: d, loadedKm: 0, totalKm: d,
    durationMin: result.endMin - earliestStart, startMin: earliestStart, endMin: result.endMin,
    finalWorkMin: result.finalWorkMin, finalDriveMin: result.finalDriveMin,
    fuelCents: fuel, tollCents: toll, variableCostCents: fuel + toll,
    paymentCents: 0, contributionCents: -(fuel + toll),
    deliveryDeadlineMin: null, deadlineBufferMin: null,
  };
}

// Plant eine komplette Tourenkette.
export function buildTourPlan(state, opts) {
  const { vehicleId, driverId, orderIds, desiredEndCity, latestReturnMin } = opts;
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);
  if (!vehicle || !driver) return { error: "Fahrzeug oder Fahrer nicht gefunden." };
  if (vehicle.locationCity !== driver.locationCity) {
    return { error: "Fahrer und Lkw befinden sich an unterschiedlichen Orten." };
  }

  const earliestStart = earliestAvailable(state, vehicle, driver);
  let currentCity = vehicle.locationCity;
  let t = earliestStart;
  const deployments = [];
  const acceptedOrderIds = [];
  let totalKm = 0, emptyKm = 0, loadedKm = 0;
  let totalFuel = 0, totalToll = 0, totalPayment = 0;
  let minBuffer = Infinity;

  let counters = {
    workMin: driver.workMinutesSinceRest || 0,
    driveMin: driver.driveMinutesSinceBreak || 0,
  };

  for (const orderId of orderIds) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return { error: "Auftrag nicht gefunden: " + orderId };
    if (order.status !== "offered" && order.status !== "angenommen") {
      return { error: "Auftrag " + order.customer + " ist nicht verfügbar (Status: " + order.status + ")." };
    }
    if (order.tons > vehicle.capacityTons) {
      return { error: "Überladung: " + order.tons + " t überschreiten Kapazität von " + vehicle.capacityTons + " t." };
    }

    const dep = buildDeployment(state, order, vehicle, currentCity, t, counters);
    if (dep.endMin > order.deliveryDeadlineMin) {
      return { error: "Lieferung von " + order.customer + " würde die Lieferfrist überschreiten (Ankunft " + formatGameTime(dep.endMin) + ", Frist " + formatGameTime(order.deliveryDeadlineMin) + ")." };
    }
    if (order.status === "offered" && order.acceptDeadlineMin <= t) {
      return { error: "Annahmefrist für " + order.customer + " reicht nicht für diesen Startzeitpunkt." };
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

  const lastDeliveryEnd = deployments.length > 0 ? deployments[deployments.length - 1].endMin : earliestStart;
  const tourEndMin = returnDeployment ? returnDeployment.endMin : lastDeliveryEnd;
  let driverFreeMin = t;
  if (counters.workMin >= WORK_BUDGET_MIN) {
    driverFreeMin = t + REST_MIN;
  }

  if (latestReturnMin && tourEndMin > latestReturnMin) {
    return { error: "Tour endet zu spät (" + formatGameTime(tourEndMin) + "), späteste Rückkehr " + formatGameTime(latestReturnMin) + "." };
  }

  const liquidityCheck = checkTourLiquidity(state, deployments, returnDeployment, earliestStart);
  if (!liquidityCheck.ok) {
    return { error: "Liquidität reicht nicht: " + liquidityCheck.reason };
  }

  return {
    ok: true,
    vehicleId, driverId,
    startCity: vehicle.locationCity,
    desiredEndCity: desiredEndCity || null,
    latestReturnMin: latestReturnMin || null,
    deployments,
    returnDeployment,
    acceptedOrderIds,
    totalKm, emptyKm, loadedKm,
    totalFuelCents: totalFuel,
    totalTollCents: totalToll,
    totalVariableCostCents: totalFuel + totalToll,
    totalPaymentCents: totalPayment,
    totalContributionCents: totalPayment - totalFuel - totalToll,
    earliestStartMin: earliestStart,
    lastDeliveryEndMin: lastDeliveryEnd,
    tourEndMin,
    driverFreeMin,
    minDeadlineBufferMin: minBuffer === Infinity ? null : minBuffer,
    reservedUntil: driverFreeMin,
  };
}

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

// Findet passende Rückladungen.
export function findReturnLoads(state, primaryOrderId, vehicleId, driverId) {
  const order = state.orders.find(o => o.id === primaryOrderId);
  if (!order) return { error: "Auftrag nicht gefunden." };
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);
  if (!vehicle || !driver) return { error: "Fahrzeug/Fahrer nicht gefunden." };

  const destCity = order.toCity;
  const candidates = [];

  for (const o of state.orders) {
    if (o.id === primaryOrderId) continue;
    if (o.status !== "offered" && o.status !== "angenommen") continue;
    if (o.fromCity !== destCity) continue;
    if (o.tons > vehicle.capacityTons) continue;

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

  for (const o of state.orders) {
    if (o.id === primaryOrderId) continue;
    if (o.status !== "offered" && o.status !== "angenommen") continue;
    if (o.fromCity === destCity) continue;
    if (o.tons > vehicle.capacityTons) continue;

    const plan = buildTourPlan(state, {
      vehicleId, driverId,
      orderIds: [primaryOrderId, o.id],
      desiredEndCity: null, latestReturnMin: null,
    });
    if (plan.ok) {
      candidates.push({ order: o, type: "empty_then_return", plan, description: "Leerfahrt " + destCity + " → " + o.fromCity + ", dann " + o.fromCity + " → " + o.toCity });
    }
  }

  return { candidates: candidates.sort((a, b) => {
    if (!a.plan && !b.plan) return 0;
    if (!a.plan) return 1;
    if (!b.plan) return -1;
    return (b.plan.totalContributionCents || 0) - (a.plan.totalContributionCents || 0);
  })};
}

// Assistent: Flotten-Verplanung
export function suggestTours(state, opts) {
  const { vehicleIds, earliestStart, horizonMin, desiredEndCity, latestReturnMin, mode, acceptNew } = opts;
  const suggestions = [];
  const startMin = earliestStart || state.gameTime;
  const maxMin = startMin + (horizonMin || 2880);

  for (const vehicleId of vehicleIds || state.vehicles.map(v => v.id)) {
    const vehicle = state.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) continue;
    if (vehicle.status !== "free" && vehicle.status !== "resting") continue;
    if (vehicle.condition < 20) continue;

    const driver = state.drivers.find(d =>
      d.locationCity === vehicle.locationCity &&
      (d.status === "free" || d.status === "resting") &&
      (!d.restUntil || d.restUntil <= startMin)
    );
    if (!driver) continue;

    const acceptedOrders = state.orders.filter(o => o.status === "angenommen" && o.tons <= vehicle.capacityTons);
    const offeredOrders = acceptNew ? state.orders.filter(o =>
      o.status === "offered" && o.acceptDeadlineMin > startMin && o.tons <= vehicle.capacityTons
    ) : [];
    const allOrders = [...acceptedOrders, ...offeredOrders];

    let bestPlan = null;
    let bestOrders = null;

    for (const o of allOrders) {
      const plan = buildTourPlan(state, { vehicleId, driverId: driver.id, orderIds: [o.id], desiredEndCity, latestReturnMin });
      if (plan.ok && plan.tourEndMin <= maxMin) {
        if (!bestPlan || comparePlans(plan, bestPlan, mode) < 0) { bestPlan = plan; bestOrders = [o.id]; }
      }
    }

    for (let i = 0; i < allOrders.length; i++) {
      for (let j = 0; j < allOrders.length; j++) {
        if (i === j) continue;
        if (allOrders[i].toCity !== allOrders[j].fromCity) continue;
        const plan = buildTourPlan(state, { vehicleId, driverId: driver.id, orderIds: [allOrders[i].id, allOrders[j].id], desiredEndCity, latestReturnMin });
        if (plan.ok && plan.tourEndMin <= maxMin) {
          if (!bestPlan || comparePlans(plan, bestPlan, mode) < 0) { bestPlan = plan; bestOrders = [allOrders[i].id, allOrders[j].id]; }
        }
      }
    }

    if (bestPlan) {
      suggestions.push({ vehicleId, driverId: driver.id, vehicle, driver, orderIds: bestOrders, plan: bestPlan, mode });
    }
  }

  return { suggestions: suggestions.slice(0, 3) };
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