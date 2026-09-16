// Netzwerk-Datenmodul für FERNWERK.
// Berechnet Karten-Elemente, Relationsstatistiken, Rückladungsvorschläge
// und Standortanalysen ausschließlich aus vorhandenem Spielzustand.
// Verwaltet keinen eigenen Zustand — alle Berechnungen sind rein abgeleitet.

import { CITIES, getDistance, CUSTOMER_PROFILES } from "@/lib/simulation/gameRules";
import { CITY_GEO, HQ_CITY, getVehicleGeoPosition, buildTripRouteGeoJSON } from "@/lib/geoData";
import { getAllCustomerSummaries } from "@/lib/simulation/customerEngine";
import { getOrderCharacteristics, getPrimarySegment } from "@/lib/simulation/segmentEngine";
import { getRegionOfCity, REGION_LABELS } from "@/lib/simulation/marketDynamicsEngine";
import { getMarketOverview } from "@/lib/simulation/marketDynamicsEngine";
import { findReturnLoads, buildTourPlan, earliestAvailable } from "@/lib/tourEngine";
import { BRANCH_OPEN_FEE, BRANCH_MIN_GAME_DAY, BRANCH_MIN_CAPITAL_RATIO, BRANCH_COST_PER_DAY } from "@/lib/branchData";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import { dayOf, formatGameTime } from "@/lib/gameData";

const DAY_MIN = 1440;
const DEFAULT_PERIOD_DAYS = 30;

// ---------- Karten-Elemente ----------

// Liefert alle Karten-Elemente nach Ebene, gefiltert nach den Auswahlkriterien.
// filters: { layers: Set, branchId, vehicleId, customerId, orderStatus, segments: Set }
export function getNetworkMapElements(state, routeData, filters = {}) {
  const elements = {
    branches: [],
    customers: [],
    orders: [],
    tours: [],
    vehicles: [],
    marketRegions: [],
  };

  const activeLayers = filters.layers || new Set(["branches", "customers", "orders", "tours", "vehicles"]);

  // Filialen
  if (activeLayers.has("branches")) {
    for (const b of (state.branches || [])) {
      if (b.status !== "active") continue;
      if (filters.branchId && b.id !== filters.branchId) continue;
      const geo = CITY_GEO[b.city];
      if (!geo) continue;
      elements.branches.push({
        type: "branch",
        id: b.id,
        city: b.city,
        name: b.name,
        coordinates: geo,
        isHQ: b.city === HQ_CITY && state.branches.indexOf(b) === 0,
        stats: b.stats || { revenueCents: 0, deliveries: 0, expensesCents: 0 },
      });
    }
  }

  // Kundenstandorte
  if (activeLayers.has("customers")) {
    const summaries = getAllCustomerSummaries(state);
    for (const c of summaries) {
      if (filters.customerId && c.id !== filters.customerId) continue;
      for (const depot of c.depots) {
        const geo = CITY_GEO[depot];
        if (!geo) continue;
        elements.customers.push({
          type: "customer",
          id: c.id,
          name: c.name,
          industry: c.industry,
          city: depot,
          coordinates: geo,
          isStammkunde: c.isStammkunde,
          trust: c.trust,
          completedTransports: c.completedTransports,
          contractStatus: c.contractStatus,
        });
      }
    }
  }

  // Aufträge
  if (activeLayers.has("orders")) {
    for (const o of (state.orders || [])) {
      if (filters.customerId && o.customerId !== filters.customerId) continue;
      if (filters.orderStatus && o.status !== filters.orderStatus) continue;
      if (filters.segments && filters.segments.size > 0) {
        const seg = getPrimarySegment(o);
        if (!filters.segments.has(seg)) continue;
      }
      const fromGeo = CITY_GEO[o.fromCity], toGeo = CITY_GEO[o.toCity];
      if (!fromGeo || !toGeo) continue;
      const isActiveTrip = (state.trips || []).some(t => t.orderId === o.id && t.status === "in_progress");
      elements.orders.push({
        type: "order",
        id: o.id,
        status: o.status,
        fromCity: o.fromCity,
        toCity: o.toCity,
        fromCoords: fromGeo,
        toCoords: toGeo,
        customer: o.customer,
        customerId: o.customerId,
        cargo: o.cargo,
        tons: o.tons,
        paymentCents: o.paymentCents,
        isDangerousGoods: !!o.isDangerousGoods,
        segment: getPrimarySegment(o),
        isAccepted: o.status === "angenommen",
        isOffered: o.status === "offered",
        isUndispatched: o.status === "angenommen" && !isActiveTrip,
        deliveryDeadlineMin: o.deliveryDeadlineMin,
      });
    }
  }

  // Laufende Touren
  if (activeLayers.has("tours")) {
    for (const trip of (state.trips || [])) {
      if (trip.status !== "in_progress") continue;
      if (filters.vehicleId && trip.vehicleId !== filters.vehicleId) continue;
      const geo = buildTripRouteGeoJSON(trip, routeData);
      const vehicle = (state.vehicles || []).find(v => v.id === trip.vehicleId);
      const order = (state.orders || []).find(o => o.id === trip.orderId);
      elements.tours.push({
        type: "tour",
        id: trip.id,
        tripId: trip.id,
        vehicleId: trip.vehicleId,
        vehicleName: vehicle ? vehicleDisplayName(vehicle) : trip.vehicleId,
        orderId: trip.orderId,
        customer: order?.customer || "—",
        fromCity: order?.fromCity || trip.fromCity,
        toCity: order?.toCity || trip.toCity,
        startMin: trip.startMin,
        endMin: trip.endMin,
        currentPhase: trip.currentPhase ?? trip.currentLeg,
        phases: trip.phases || trip.legs || [],
        geoJSON: geo,
      });
    }
  }

  // Fahrzeuge
  if (activeLayers.has("vehicles")) {
    for (const v of (state.vehicles || [])) {
      if (v.status === "sold" || v.status === "archived") continue;
      if (filters.vehicleId && v.id !== filters.vehicleId) continue;
      if (filters.branchId) {
        const branch = (state.branches || []).find(b => b.id === filters.branchId);
        if (branch && v.locationCity !== branch.city) continue;
      }
      const pos = getVehicleGeoPosition(v, state, routeData);
      if (!pos) continue;
      const driver = (state.drivers || []).find(d => d.id === v.driverId);
      elements.vehicles.push({
        type: "vehicle",
        id: v.id,
        name: vehicleDisplayName(v),
        status: v.status,
        locationCity: v.locationCity,
        coordinates: pos,
        capacityTons: v.capacityTons,
        driverName: driver?.name || null,
        tripId: v.tripId || null,
        condition: v.condition,
      });
    }
  }

  // Marktregionen (vereinfacht — nur Regionsetiketten)
  if (activeLayers.has("market")) {
    try {
      const overview = getMarketOverview(state);
      for (const region of Object.keys(overview.regions || {})) {
        elements.marketRegions.push({
          type: "marketRegion",
          region,
          label: REGION_LABELS[region] || region,
          segments: overview.regions[region].segments,
        });
      }
    } catch (e) { /* Markt-Dynamik evtl. nicht migriert */ }
  }

  return elements;
}

// ---------- Relationsstatistiken ----------

// Berechnet Kennzahlen pro Richtung (fromCity → toCity) aus abgeschlossenen
// Aufträgen und Trips. Da alte Aufträge bereinigt werden, gibt der Zeitraum
// die tatsächlich verfügbare Datenabdeckung wieder.
export function getRelationStats(state, periodDays = DEFAULT_PERIOD_DAYS) {
  const cutoff = state.gameTime - periodDays * DAY_MIN;
  const stats = new Map(); // key: "fromCity→toCity"

  // Abgeschlossene Aufträge auswerten
  for (const o of (state.orders || [])) {
    if (!["geliefert", "failed", "storniert", "expired"].includes(o.status)) continue;
    if (o.deliveredAtMin != null && o.deliveredAtMin < cutoff) continue;
    if (o.failedAtMin != null && o.failedAtMin < cutoff) continue;

    const key = o.fromCity + "→" + o.toCity;
    if (!stats.has(key)) stats.set(key, newRelationEntry(o.fromCity, o.toCity));
    const e = stats.get(key);

    if (o.status === "geliefert") {
      e.deliveries++;
      e.revenueCents += o.paymentCents || 0;
      if (o.deliveredAtMin != null && o.deliveryDeadlineMin != null) {
        if (o.deliveredAtMin <= o.deliveryDeadlineMin) e.timelyDeliveries++;
        else e.lateDeliveries++;
      }
    } else if (o.status === "failed") {
      e.failedDeliveries++;
    }
  }

  // Zugehörige Trips für Kosten und Leerfahrten
  for (const trip of (state.trips || [])) {
    if (trip.status !== "completed" && trip.status !== "in_progress") continue;
    const order = (state.orders || []).find(o => o.id === trip.orderId);
    if (!order) continue;
    const key = order.fromCity + "→" + order.toCity;
    if (!stats.has(key)) continue;
    const e = stats.get(key);
    e.fuelCents += trip.fuelCents || 0;
    e.tollCents += trip.tollCents || 0;
    e.variableCostCents = e.fuelCents + e.tollCents;
    e.contributionCents = e.revenueCents - e.variableCostCents;
    if (trip.emptyKm) e.emptyKm += trip.emptyKm;
    if (trip.loadedKm) e.loadedKm += trip.loadedKm;
  }

  // Leerfahrten als eigene Richtung erfassen (aus abgeschlossenen Trips ohne Auftrag)
  for (const trip of (state.trips || [])) {
    if (trip.status !== "completed") continue;
    if (trip.orderId) continue; // nur echte Leerfahrten
    if (trip.fromCity && trip.toCity) {
      const key = trip.fromCity + "→" + trip.toCity;
      if (!stats.has(key)) stats.set(key, newRelationEntry(trip.fromCity, trip.toCity));
      const e = stats.get(key);
      e.emptyTrips++;
      e.emptyKm += trip.drivenKm || 0;
      e.fuelCents += trip.fuelCents || 0;
      e.tollCents += trip.tollCents || 0;
      e.variableCostCents = e.fuelCents + e.tollCents;
      e.contributionCents = e.revenueCents - e.variableCostCents;
    }
  }

  // Wiederkehrende Kunden pro Relation
  for (const o of (state.orders || [])) {
    if (o.status !== "geliefert") continue;
    const key = o.fromCity + "→" + o.toCity;
    if (!stats.has(key)) continue;
    const e = stats.get(key);
    if (!e.customerIds) e.customerIds = new Set();
    e.customerIds.add(o.customerId);
  }

  // In Array umwandeln und ableitete Werte berechnen
  const result = [];
  for (const [key, e] of stats) {
    e.key = key;
    e.punctuality = e.deliveries > 0 ? e.timelyDeliveries / e.deliveries : null;
    e.recurringCustomers = e.customerIds ? e.customerIds.size : 0;
    delete e.customerIds;
    e.distanceKm = getDistance(e.fromCity, e.toCity);
    result.push(e);
  }

  // Datenabdeckung
  const deliveredOrders = (state.orders || []).filter(o => o.status === "geliefert" && o.deliveredAtMin != null);
  const earliestDelivery = deliveredOrders.length > 0 ? Math.min(...deliveredOrders.map(o => o.deliveredAtMin)) : null;
  const coverageDays = earliestDelivery != null ? Math.min(periodDays, Math.ceil((state.gameTime - earliestDelivery) / DAY_MIN)) : 0;

  return {
    relations: result.sort((a, b) => (b.revenueCents || 0) - (a.revenueCents || 0)),
    periodDays,
    coverageDays,
    coverageLabel: coverageDays > 0 ? `Letzte ${coverageDays} Tage` : "Keine historischen Daten",
    evaluatedAtMin: state.gameTime,
  };
}

function newRelationEntry(fromCity, toCity) {
  return {
    fromCity, toCity,
    deliveries: 0, timelyDeliveries: 0, lateDeliveries: 0, failedDeliveries: 0,
    emptyTrips: 0,
    revenueCents: 0, fuelCents: 0, tollCents: 0, variableCostCents: 0, contributionCents: 0,
    emptyKm: 0, loadedKm: 0,
    punctuality: null, recurringCustomers: 0,
  };
}

// ---------- Rückladungsvorschläge ----------

// Findet Anschlussaufträge für ein Fahrzeug, eine laufende Tour oder einen Zielort.
// Nutzt die vorhandene findReturnLoads-Engine und reichert die Ergebnisse an.
export function getReturnLoadSuggestions(state, opts) {
  const { vehicleId, tripId, destCity } = opts;

  // Zielort und Fahrzeug bestimmen
  let targetCity = destCity;
  let vehicle = null;
  let driver = null;
  let earliestStart = state.gameTime;
  let primaryOrderId = null;

  if (vehicleId) {
    vehicle = (state.vehicles || []).find(v => v.id === vehicleId);
    if (!vehicle) return { error: "Fahrzeug nicht gefunden." };
    driver = (state.drivers || []).find(d => d.id === vehicle.driverId) ||
             (state.drivers || []).find(d => d.locationCity === vehicle.locationCity && (d.status === "free" || d.status === "resting"));
    if (!driver) return { error: "Kein Fahrer verfügbar." };
    if (!targetCity) targetCity = vehicle.locationCity;
    earliestStart = earliestAvailable(state, vehicle, driver);
  } else if (tripId) {
    const trip = (state.trips || []).find(t => t.id === tripId);
    if (!trip) return { error: "Tour nicht gefunden." };
    vehicle = (state.vehicles || []).find(v => v.id === trip.vehicleId);
    driver = (state.drivers || []).find(d => d.id === trip.driverId);
    if (!vehicle || !driver) return { error: "Fahrzeug/Fahrer nicht gefunden." };
    const order = (state.orders || []).find(o => o.id === trip.orderId);
    if (order) {
      targetCity = order.toCity;
      primaryOrderId = order.id;
    }
    earliestStart = trip.endMin;
  } else if (targetCity) {
    // Nur Zielort — finde verfügbare Fahrzeuge dort
    vehicle = (state.vehicles || []).find(v =>
      v.locationCity === targetCity && (v.status === "free" || v.status === "resting") && v.condition >= 20
    );
    if (!vehicle) return { error: "Kein verfügbares Fahrzeug am Zielort." };
    driver = (state.drivers || []).find(d =>
      d.locationCity === vehicle.locationCity && (d.status === "free" || d.status === "resting")
    );
    if (!driver) return { error: "Kein Fahrer am Zielort verfügbar." };
    earliestStart = earliestAvailable(state, vehicle, driver);
  } else {
    return { error: "Fahrzeug, Tour oder Zielort erforderlich." };
  }

  if (!targetCity) return { error: "Zielort konnte nicht bestimmt werden." };

  // Wenn eine Primärtour existiert, nutze findReturnLoads
  if (primaryOrderId) {
    const res = findReturnLoads(state, primaryOrderId, vehicle.id, driver.id);
    if (res.error) return { error: res.error };
    return enrichSuggestions(state, res.candidates || [], vehicle, driver, earliestStart, targetCity);
  }

  // Sonst: Suche alle Aufträge, die vom Zielort starten
  const candidates = [];
  for (const o of (state.orders || [])) {
    if (o.status !== "offered" && o.status !== "angenommen") continue;
    if (o.fromCity !== targetCity) continue;
    if (vehicle && o.tons > vehicle.capacityTons) continue;

    const plan = buildTourPlan(state, {
      vehicleId: vehicle.id,
      driverId: driver.id,
      orderIds: [o.id],
      desiredEndCity: null,
      latestReturnMin: null,
    });

    if (plan.ok) {
      candidates.push({ order: o, type: "direct_return", plan, description: o.fromCity + " → " + o.toCity + " (" + o.customer + ")" });
    } else {
      candidates.push({ order: o, type: "direct_return", plan: null, error: plan.error, description: o.fromCity + " → " + o.toCity + " – nicht ausführbar" });
    }
  }

  return enrichSuggestions(state, candidates, vehicle, driver, earliestStart, targetCity);
}

function enrichSuggestions(state, candidates, vehicle, driver, earliestStart, targetCity) {
  const enriched = candidates.map(c => {
    if (!c.plan) {
      return { ...c, enriched: false, reason: c.error || "Nicht planbar" };
    }

    const plan = c.plan;
    const order = c.order;

    // Zusätzliche Kosten durch diesen Anschlussauftrag
    // (nur die Differenz zur bereits geplanten Tour)
    const additionalFuel = plan.totalFuelCents - (plan.deployments[0]?.fuelCents || 0);
    const additionalToll = plan.totalTollCents - (plan.deployments[0]?.tollCents || 0);
    const additionalCost = additionalFuel + additionalToll;
    const additionalRevenue = order.paymentCents;
    const additionalContribution = additionalRevenue - additionalCost;
    const additionalEmptyKm = plan.emptyKm - (plan.deployments[0]?.emptyKm || 0);
    const additionalDuration = plan.tourEndMin - earliestStart;

    // Terminrisiko
    let deadlineRisk = null;
    if (order.deliveryDeadlineMin) {
      const buffer = order.deliveryDeadlineMin - plan.tourEndMin;
      if (buffer < 0) deadlineRisk = "Lieferfrist überschritten";
      else if (buffer < 120) deadlineRisk = "Knappes Zeitfenster (" + Math.round(buffer / 60) + " h Puffer)";
    }

    return {
      ...c,
      enriched: true,
      additionalEmptyKm,
      additionalDurationMin: additionalDuration,
      additionalRevenueCents: additionalRevenue,
      additionalCostCents: additionalCost,
      additionalContributionCents: additionalContribution,
      deadlineRisk,
      tourEndMin: plan.tourEndMin,
      vehicleId: vehicle?.id,
      driverId: driver?.id,
    };
  });

  return {
    candidates: enriched.sort((a, b) => {
      if (!a.plan && !b.plan) return 0;
      if (!a.plan) return 1;
      if (!b.plan) return -1;
      return (b.additionalContributionCents || 0) - (a.additionalContributionCents || 0);
    }),
    targetCity,
    vehicleId: vehicle?.id,
    driverId: driver?.id,
    earliestStart,
  };
}

// ---------- Standortanalyse ----------

// Analysiert eine Stadt als möglichen Filialstandort anhand tatsächlicher Daten.
// Verändert keinen Zustand.
export function getLocationAnalysis(state, city, periodDays = DEFAULT_PERIOD_DAYS) {
  if (!CITIES.includes(city)) return { error: "Unbekannte Stadt." };

  const cutoff = state.gameTime - periodDays * DAY_MIN;
  const geo = CITY_GEO[city];
  const region = getRegionOfCity(city);

  // Kunden mit Depot in dieser Stadt
  const localCustomers = CUSTOMER_PROFILES.filter(c => c.depots.includes(city));

  // Kunden im Umfeld (gleiche Region)
  const regionalCustomers = CUSTOMER_PROFILES.filter(c =>
    c.depots.some(d => getRegionOfCity(d) === region)
  );

  // Bekannte Auftragsrelationen im Umfeld (letzte N Tage)
  const nearbyRelations = [];
  for (const o of (state.orders || [])) {
    if (o.status !== "geliefert") continue;
    if (o.deliveredAtMin != null && o.deliveredAtMin < cutoff) continue;
    const involvesCity = o.fromCity === city || o.toCity === city;
    const nearby = getDistance(o.fromCity, city) <= 200 || getDistance(o.toCity, city) <= 200;
    if (involvesCity || nearby) {
      nearbyRelations.push({
        fromCity: o.fromCity,
        toCity: o.toCity,
        customer: o.customer,
        paymentCents: o.paymentCents,
        involvesCity,
      });
    }
  }

  // Beobachtetes Auftragsaufkommen (abgeschlossene + aktuelle Aufträge mit Bezug zur Stadt)
  const observedOrderCount = nearbyRelations.length;

  // Bestehende Vertragsverpflichtungen mit Bezug zur Stadt
  const activeContracts = (state.contracts?.contracts || []).filter(c => {
    if (c.status !== "active") return false;
    return c.fromCity === city || c.toCity === city ||
           getDistance(c.fromCity, city) <= 200 || getDistance(c.toCity, city) <= 200;
  });

  // Verfügbare eigene Fahrzeuge und Mitarbeiter am Ort
  const vehiclesHere = (state.vehicles || []).filter(v =>
    v.locationCity === city && v.status !== "sold" && v.status !== "archived"
  );
  const driversHere = (state.drivers || []).filter(d =>
    d.locationCity === city && d.employmentStatus === "employed"
  );
  const employeesHere = (state.employees || []).filter(e =>
    e.locationCity === city && e.employmentStatus === "employed"
  );

  // Eröffnungsregeln prüfen
  const day = dayOf(state.gameTime);
  const minDayMet = day >= BRANCH_MIN_GAME_DAY;
  const capitalNeeded = BRANCH_OPEN_FEE * BRANCH_MIN_CAPITAL_RATIO;
  const capitalMet = state.company.accountCents >= capitalNeeded;
  const noOpenCosts = !(state.openCosts || []).some(o => o.account === "company");
  const alreadyExists = (state.branches || []).some(b => b.city === city && b.status === "active");

  const requirements = {
    minGameDay: { met: minDayMet, value: day, required: BRANCH_MIN_GAME_DAY, label: `Mindestens Tag ${BRANCH_MIN_GAME_DAY}` },
    capital: { met: capitalMet, value: state.company.accountCents, required: capitalNeeded, label: `Firmenkonto ≥ ${(capitalNeeded / 100).toLocaleString("de-DE")} €` },
    noOpenCosts: { met: noOpenCosts, label: "Keine offenen betrieblichen Kosten" },
    notAlreadyExists: { met: !alreadyExists, label: "Noch keine aktive Filiale in " + city },
  };

  const canOpen = Object.values(requirements).every(r => r.met);

  return {
    city,
    coordinates: geo,
    region,
    regionLabel: REGION_LABELS[region] || region,
    // Tatsächlich beobachtete Daten
    localCustomers: localCustomers.map(c => ({ id: c.id, name: c.name, industry: c.industry })),
    regionalCustomerCount: regionalCustomers.length,
    observedOrderCount,
    nearbyRelations: nearbyRelations.slice(0, 20),
    activeContracts: activeContracts.map(c => ({
      id: c.id,
      customerName: c.customerName,
      fromCity: c.fromCity,
      toCity: c.toCity,
      transportsPerDay: c.transportsPerDay,
      endMin: c.endMin,
    })),
    // Verfügbare Ressourcen
    vehiclesHere: vehiclesHere.length,
    driversHere: driversHere.length,
    employeesHere: employeesHere.length,
    // Eröffnungsbedingungen
    requirements,
    canOpen,
    // Kosten
    openFeeCents: BRANCH_OPEN_FEE,
    dailyCostCents: BRANCH_COST_PER_DAY,
    // Datenabdeckung
    periodDays,
    coverageLabel: observedOrderCount > 0 ? `Letzte ${Math.min(periodDays, 30)} Tage` : "Keine historischen Daten",
    // Hinweis: Keine Gewinnprognose
    disclaimer: "Historisches Aufkommen ist keine Zusage zukünftiger Umsätze.",
  };
}

// ---------- Standortvergleich ----------

// Vergleicht bis zu drei Städte mit einheitlichen Kriterien.
export function compareLocations(state, cities, periodDays = DEFAULT_PERIOD_DAYS) {
  const analyses = cities.map(c => getLocationAnalysis(state, c, periodDays));

  // Einheitliche Kriterien extrahieren
  const criteria = [
    {
      key: "nearbyCustomers",
      label: "Kunden im Umfeld",
      getValue: a => a.regionalCustomerCount,
      higherIsBetter: true,
    },
    {
      key: "observedOrders",
      label: "Beobachtetes Aufkommen",
      getValue: a => a.observedOrderCount,
      higherIsBetter: true,
    },
    {
      key: "activeContracts",
      label: "Vertragsverpflichtungen",
      getValue: a => a.activeContracts.length,
      higherIsBetter: true,
    },
    {
      key: "availableVehicles",
      label: "Fahrzeuge am Ort",
      getValue: a => a.vehiclesHere,
      higherIsBetter: true,
    },
    {
      key: "availableStaff",
      label: "Personal am Ort",
      getValue: a => a.driversHere + a.employeesHere,
      higherIsBetter: true,
    },
    {
      key: "dailyCost",
      label: "Tägliche Standortkosten",
      getValue: a => a.dailyCostCents,
      higherIsBetter: false,
    },
    {
      key: "canOpen",
      label: "Eröffnung zulässig",
      getValue: a => a.canOpen ? 1 : 0,
      higherIsBetter: true,
    },
  ];

  // Bestehende Filialen im Umfeld
  for (const a of analyses) {
    const nearbyBranches = (state.branches || []).filter(b =>
      b.status === "active" && b.city !== a.city && getDistance(b.city, a.city) <= 300
    );
    a.nearbyBranches = nearbyBranches.map(b => ({ city: b.city, name: b.name, distanceKm: getDistance(b.city, a.city) }));
  }

  // Vergleichstabelle
  const comparison = criteria.map(c => {
    const values = analyses.map(a => c.getValue(a));
    const best = c.higherIsBetter ? Math.max(...values) : Math.min(...values);
    return {
      key: c.key,
      label: c.label,
      higherIsBetter: c.higherIsBetter,
      values,
      bestIndex: values.indexOf(best),
    };
  });

  // Empfehlung: Stadt mit meisten Vorteilen
  let bestCityIndex = -1;
  let bestScore = -1;
  for (let i = 0; i < analyses.length; i++) {
    if (!analyses[i].canOpen) continue;
    let score = 0;
    for (const c of comparison) {
      if (c.values[i] === c.values[c.bestIndex]) score++;
    }
    if (score > bestScore) { bestScore = score; bestCityIndex = i; }
  }

  return {
    cities,
    analyses,
    comparison,
    bestCityIndex,
    bestCityLabel: bestCityIndex >= 0 ? analyses[bestCityIndex].city + " hat die meisten Kriterienvorteile" : "Keine der Städte erfüllt die Eröffnungsregeln",
  };
}

// ---------- Formatierungshilfen ----------

export function formatEuro(cents) {
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function formatDuration(min) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return m + " Min";
  if (m === 0) return h + " Std";
  return h + " Std " + m + " Min";
}