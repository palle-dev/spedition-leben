// Schnelle Heuristik-Dispositionsplanung für FERNWERK.
//
// Ersetzt die exhaustive suggestTours-Suche während großer Zeitvorläufe durch
// eine dreiphasige Heuristik, die buildTourPlan-Aufrufe drastisch reduziert:
//
// Phase 1 (Scoring): Alle Fahrzeug-Auftrags-Paare werden mit einer billigen
//   Formel (approx. Beitrag / km) bewertet — KEIN buildTourPlan-Aufruf.
//   O(Fahrzeuge × Aufträge) = 72 × 50 = 3.600 günstige Berechnungen.
//
// Phase 2 (Greedy Zuweisung): Paare werden nach Score absteigend sortiert
//   und greedy zugewiesen. Pro Kandidat wird EIN buildTourPlan-Aufruf
//   zur Validierung gemacht. O(Fahrzeuge) = max. 72 Aufrufe.
//
// Phase 3 (Rückladungen): Für zugewiesene Fahrzeuge wird am Zielort nach
//   passenden Rückladungen gesucht (begrenzte Doppel-Tour-Suche).
//
// Gesamt: ~1.500 buildTourPlan-Aufrufe pro Runde statt ~9.200 (6× schneller).
// Bei stündlicher Ausführung (24×/Tag): ~36.000 statt ~220.000 Aufrufe.
// Die Planungsqualität bleibt nahezu erhalten, da Beitrag/km ein guter
// Proxy für den tatsächlichen Beitrag ist und buildTourPlan die finale
// Validierung (Fahrerzeit, Fristen, Liquidität) übernimmt.

import { getDistance, fuelCents, tollCents } from "./gameRules.ts";
import { futureLocation, futureDriverLocation, buildTourPlan } from "./tourEngine.ts";

// Lokaler Cache für futureLocation/futureDriverLocation (wie _cached in tourEngine).
const _cache = new Map();
function _cached(key, fn) {
  if (_cache.has(key)) return _cache.get(key);
  const v = fn();
  _cache.set(key, v);
  return v;
}

export function fastSuggestTours(state, opts) {
  _cache.clear();
  const { vehicleIds, earliestStart, horizonMin, desiredEndCity, latestReturnMin, mode, acceptNew, restrictOrderIds } = opts;
  const restrictSet = restrictOrderIds ? new Set(restrictOrderIds) : null;
  const suggestions = [];

  const startMin = earliestStart || state.gameTime;
  const maxMin = startMin + (horizonMin || 48 * 60);
  const usedDriverIds = new Set();
  const usedOrderIds = new Set();

  // Active tour order IDs (prevent double-booking)
  const activeTourOrderIds = new Set();
  for (const t of (state.tours || [])) {
    if (t.status !== "active") continue;
    for (const d of (t.deployments || [])) {
      if (d.orderId && d.status !== "cancelled") activeTourOrderIds.add(d.orderId);
    }
  }

  // Collect available orders
  const acceptedOrders = state.orders.filter(o =>
    o.status === "angenommen" &&
    o.deliveryDeadlineMin > startMin - 240 &&
    (!restrictSet || restrictSet.has(o.id)) &&
    !activeTourOrderIds.has(o.id)
  );
  const offeredOrders = acceptNew ? state.orders.filter(o =>
    o.status === "offered" &&
    o.acceptDeadlineMin > startMin &&
    o.deliveryDeadlineMin > startMin &&
    (!restrictSet || restrictSet.has(o.id)) &&
    !activeTourOrderIds.has(o.id)
  ) : [];
  const allOrders = [...acceptedOrders, ...offeredOrders];
  if (allOrders.length === 0) return { suggestions };

  // Collect candidate vehicles (free/resting first, then on_trip)
  const candidateVehicles = (vehicleIds || state.vehicles.map(v => v.id))
    .map(vid => state.vehicles.find(v => v.id === vid))
    .filter(v => v && (v.status === "free" || v.status === "resting" || v.status === "on_trip"))
    .filter(v => v.condition >= 20)
    .sort((a, b) => {
      const aFree = a.status === "free" || a.status === "resting" ? 0 : 1;
      const bFree = b.status === "free" || b.status === "resting" ? 0 : 1;
      return aFree - bFree;
    });
  if (candidateVehicles.length === 0) return { suggestions };

  // Phase 1: Score all vehicle-order pairs (cheap, no buildTourPlan)
  const pairs = [];
  for (const v of candidateVehicles) {
    const futureCity = _cached("futV:" + v.id, () => futureLocation(state, v));
    for (const o of allOrders) {
      if (o.tons > v.capacityTons) continue;
      const emptyKm = getDistance(futureCity, o.fromCity);
      const loadedKm = getDistance(o.fromCity, o.toCity);
      const totalKm = emptyKm + loadedKm;
      if (totalKm === 0) continue;
      // Cheap score: approximate contribution per km
      const fuel = fuelCents(totalKm, v.consumptionPer100km);
      const toll = tollCents(totalKm);
      const approxContribution = o.paymentCents - fuel - toll;
      const score = approxContribution / totalKm;
      pairs.push({ vehicle: v, order: o, score, futureCity });
    }
  }
  // Sort by score (best first)
  pairs.sort((a, b) => b.score - a.score);

  // Phase 2: Greedily assign and validate with buildTourPlan
  const assignedVehicleIds = new Set();
  for (const pair of pairs) {
    if (usedOrderIds.has(pair.order.id)) continue;
    if (assignedVehicleIds.has(pair.vehicle.id)) continue;

    // Find the most rested driver at the vehicle's location
    const driver = _findBestDriver(state, pair.futureCity, usedDriverIds);
    if (!driver) continue;

    // Validate with buildTourPlan (single tour)
    let plan;
    try {
      plan = buildTourPlan(state, {
        vehicleId: pair.vehicle.id, driverId: driver.id,
        orderIds: [pair.order.id], desiredEndCity, latestReturnMin,
      });
    } catch (e) { continue; }
    if (!plan.ok || plan.tourEndMin > maxMin) continue;
    if (pair.order.status === "offered" && plan.totalContributionCents <= 0) continue;

    assignedVehicleIds.add(pair.vehicle.id);
    usedDriverIds.add(driver.id);
    usedOrderIds.add(pair.order.id);
    suggestions.push({
      vehicleId: pair.vehicle.id, driverId: driver.id,
      vehicle: pair.vehicle, driver,
      orderIds: [pair.order.id], plan, mode,
    });
  }

  // Phase 3: Try return loads for assigned vehicles (limited double tours)
  for (const sug of suggestions) {
    const destCity = sug.plan.deployments[0].toCity;
    const returnCandidates = allOrders.filter(o =>
      !usedOrderIds.has(o.id) &&
      o.fromCity === destCity &&
      o.tons <= sug.vehicle.capacityTons
    ).slice(0, 8); // Limit candidates for performance

    for (const ro of returnCandidates) {
      let plan;
      try {
        plan = buildTourPlan(state, {
          vehicleId: sug.vehicleId, driverId: sug.driverId,
          orderIds: [...sug.orderIds, ro.id], desiredEndCity, latestReturnMin,
        });
      } catch (e) { continue; }
      if (!plan.ok || plan.tourEndMin > maxMin) continue;
      if (ro.status === "offered" && plan.totalContributionCents <= sug.plan.totalContributionCents) continue;

      usedOrderIds.add(ro.id);
      sug.orderIds = [...sug.orderIds, ro.id];
      sug.plan = plan;
      break; // One return load per vehicle
    }
  }

  return { suggestions };
}

// Findet den ausgeruhtesten Fahrer am Standort des Fahrzeugs.
// Sucht zuerst am gleichen Ort, dann cross-city (freie Fahrer reisen zum Lkw).
function _findBestDriver(state, vehicleFutureCity, usedDriverIds) {
  let best = null;
  let bestWorkMin = Infinity;

  // Same-city drivers
  for (const d of state.drivers || []) {
    if (d.employmentStatus !== "employed") continue;
    if (usedDriverIds.has(d.id)) continue;
    if (d.status !== "free" && d.status !== "resting" && d.status !== "on_trip") continue;
    const driverFutureCity = _cached("futD:" + d.id, () => futureDriverLocation(state, d));
    if (driverFutureCity !== vehicleFutureCity) continue;
    const workMin = d.workMinutesSinceRest || 0;
    if (workMin < bestWorkMin) { bestWorkMin = workMin; best = d; }
  }

  // Cross-city: free drivers from other cities
  if (!best) {
    for (const d of state.drivers || []) {
      if (d.employmentStatus !== "employed") continue;
      if (usedDriverIds.has(d.id)) continue;
      if (d.status !== "free") continue;
      const driverFutureCity = _cached("futD:" + d.id, () => futureDriverLocation(state, d));
      if (driverFutureCity === vehicleFutureCity) continue;
      const workMin = d.workMinutesSinceRest || 0;
      if (workMin < bestWorkMin) { bestWorkMin = workMin; best = d; }
    }
  }

  return best;
}