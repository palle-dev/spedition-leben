import { addBooking, postJournal, registerAsset } from "./accountingEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { buildPhases, buildEmptyWorkSteps } from "./driverTimeEngine.ts";
// Filial-Engine für FERNWERK – Standorte eröffnen, verwalten, stilllegen.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.

import {
  CITIES, getDistance, mulberry32, dayOf, formatGameTime,
  driveMinutes, fuelCents, tollCents,
  BRANCH_OPEN_FEE, BRANCH_MIN_GAME_DAY, BRANCH_MIN_CAPITAL_RATIO,
  BRANCH_COST_PER_DAY, DRIVER_COST_PER_DAY,
  DRIVER_TRAVEL_COST_PER_KM, DRIVER_TRAVEL_SPEED,
  STANDARD_TRUCK, VEHICLE_PRICE, HIRE_FEE,
  PORTRAIT_IDS,
} from "./gameRules.ts";
import { checkParkingCapacity, findBranchWithCapacity } from "./siteExpansionEngine.ts";

// ---------- Hilfsfunktionen ----------

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ---------- Migration ----------

export function migrateBranches(state) {
  if (!Array.isArray(state.branches)) state.branches = [];
  for (const b of state.branches) {
    if (b.status === undefined) b.status = "active";
    if (b.openedAtMin === undefined) b.openedAtMin = state.gameTime || 480;
    if (b.stats === undefined) b.stats = { revenueCents: 0, deliveries: 0, expensesCents: 0 };
    if (b.cleanliness === undefined) b.cleanliness = 85;
    if (b.lastCleaningDay === undefined) b.lastCleaningDay = 0;
  }
  if (!Array.isArray(state.driverTravels)) state.driverTravels = [];
}

// ---------- Voraussetzungen prüfen ----------

export function checkBranchRequirements(state) {
  const errors = [];
  const day = dayOf(state.gameTime);
  if (day < BRANCH_MIN_GAME_DAY) {
    errors.push(`Mindestens Tag ${BRANCH_MIN_GAME_DAY} erforderlich (aktuell Tag ${day}).`);
  }
  if (state.company.accountCents < BRANCH_OPEN_FEE * BRANCH_MIN_CAPITAL_RATIO) {
    errors.push(`Firmenkonto muss mindestens ${(BRANCH_OPEN_FEE * BRANCH_MIN_CAPITAL_RATIO / 100).toLocaleString("de-DE")} € aufweisen (inkl. Reserve).`);
  }
  if (state.openCosts && state.openCosts.some(o => o.account === "company")) {
    errors.push("Es gibt offene betriebliche Kosten. Bitte bezahle diese zuerst.");
  }
  return { ok: errors.length === 0, errors };
}

// ---------- Filiale eröffnen ----------

export function openBranch(state, { city, name }) {
  migrateBranches(state);
  if (!city || !CITIES.includes(city)) throw new Error("Ungültige Stadt.");
  if (state.branches.some(b => b.city === city && b.status === "active")) {
    throw new Error("In " + city + " gibt es bereits eine aktive Filiale.");
  }
  const req = checkBranchRequirements(state);
  if (!req.ok) throw new Error(req.errors.join(" "));
  if (state.company.accountCents < BRANCH_OPEN_FEE) {
    throw new Error("Firmenkonto reicht für die Eröffnungsgebühr nicht aus.");
  }

  // Gebühr buchen
  postJournal(state, { text: "Filialeröffnung inklusive Basis-Lkw: " + city, type: "branch_open",
    gameTime: state.gameTime, lines: [
      { account: "1200", debit: VEHICLE_PRICE },
      { account: "5700", debit: BRANCH_OPEN_FEE - VEHICLE_PRICE },
      { account: "1000", credit: BRANCH_OPEN_FEE },
    ] });
  state.bookings.push({ min: state.gameTime, cause: "Filialeröffnung: " + city, amountCents: -BRANCH_OPEN_FEE, account: "company", refId: "branch_open" });

  // Filiale anlegen
  const branchId = uid(state, "b");
  const branchName = name || ("Filiale " + city);
  const branch = {
    id: branchId,
    name: branchName,
    city,
    costPerDayCents: BRANCH_COST_PER_DAY,
    openedAtMin: state.gameTime,
    status: "active",
    stats: { revenueCents: 0, deliveries: 0, expensesCents: 0 },
    cleanliness: 85,
    lastCleaningDay: 0,
    isHeadquarters: false,
  };
  state.branches.push(branch);

  // Basis-Lkw vor Ort anlegen
  const vehicle = {
    id: uid(state, "v"), branchId, type: STANDARD_TRUCK.type, capacityTons: 12,
    consumptionPer100km: 28, bookValueCents: VEHICLE_PRICE, condition: 85,
    locationCity: city, status: "free", tripId: null, maintenanceUntil: null,
    ownership_type: "owned", odometerKm: 0, acquiredAtMin: state.gameTime,
    referencePriceCents: VEHICLE_PRICE, markedForSale: false, saleOffer: null,
  };
  state.vehicles.push(vehicle);
  registerAsset(state, { vehicleId: vehicle.id, account: "1200", name: "Basis-Lkw " + city,
    acquisitionCostCents: VEHICLE_PRICE, acquiredAtMin: state.gameTime });

  // Basis-Fahrer vor Ort anlegen
  const portraitIdx = (state.drivers.length) % PORTRAIT_IDS.length;
  const driver = {
    id: uid(state, "d"), name: pickDriverName(state), branchId,
    costPerDayCents: DRIVER_COST_PER_DAY, locationCity: city,
    status: "free", restUntil: null, employedDay: dayOf(state.gameTime),
    portraitId: PORTRAIT_IDS[portraitIdx], satisfaction: 70, satisfactionReasons: [],
    employmentStatus: "employed", attendance: "present", consecutiveLowSatisfactionDays: 0,
    workMinutesSinceRest: 0, driveMinutesSinceBreak: 0,
  };
  state.drivers.push(driver);

  return { ok: true, branchId, vehicleId: vehicle.id, driverId: driver.id };
}

function pickDriverName(state) {
  const pool = [
    "Greta Möller", "Tobias Brandt", "Stefan Kloth", "Helena Voss", "Rüdiger Mai",
    "Anke Ruge", "Friedhelm Paasch", "Silke Quaas", "Manfred Brod", "Tanja Hennig",
    "Veit Karger", "Dorothee Saar",
  ];
  const used = new Set([...(state.drivers || []).map(d => d.name), ...(state.hiredApplicantNames || [])]);
  const available = pool.filter(n => !used.has(n));
  if (available.length > 0) return available[Math.floor(mulberry32((state.rngSeed ^ state.idCounter) >>> 0)() * available.length)];
  return "Fahrer " + ((state.drivers || []).length + 1);
}

// ---------- Filiale umbenennen ----------

export function renameBranch(state, { branchId, name }) {
  const b = state.branches.find(x => x.id === branchId);
  if (!b) throw new Error("Filiale nicht gefunden.");
  if (!name || !name.trim()) throw new Error("Name darf nicht leer sein.");
  if (b.isHeadquarters) throw new Error("Der Hauptsitz kann nicht umbenannt werden.");
  b.name = name.trim();
  return { ok: true, branchId, name: b.name };
}

// ---------- Filiale stilllegen ----------

export function closeBranch(state, { branchId }) {
  const b = state.branches.find(x => x.id === branchId);
  if (!b) throw new Error("Filiale nicht gefunden.");
  if (b.isHeadquarters) throw new Error("Der Hauptsitz kann nicht stillgelegt werden.");
  if (b.status === "closed") throw new Error("Filiale ist bereits stillgelegt.");
  if ((state.siteExpansion?.projects || []).some(p => p.branchId === branchId && p.status === "active")) {
    throw new Error("An dieser Filiale läuft noch ein Bauprojekt. Bitte die Fertigstellung abwarten.");
  }

  // Prüfen, ob noch Ressourcen dort stationiert sind
  const vehiclesAtBranch = (state.vehicles || []).filter(v =>
    v.branchId === branchId && v.status !== "sold" && v.status !== "archived"
  );
  const driversAtBranch = (state.drivers || []).filter(d =>
    d.branchId === branchId && d.employmentStatus === "employed"
  );
  const employeesAtBranch = (state.employees || []).filter(e =>
    (e.assignedBranchId === branchId || e.branchId === branchId) && e.employmentStatus === "employed"
  );

  if (vehiclesAtBranch.length > 0 || driversAtBranch.length > 0 || employeesAtBranch.length > 0) {
    const parts = [];
    if (vehiclesAtBranch.length > 0) parts.push(vehiclesAtBranch.length + " Fahrzeug(e)");
    if (driversAtBranch.length > 0) parts.push(driversAtBranch.length + " Fahrer");
    if (employeesAtBranch.length > 0) parts.push(employeesAtBranch.length + " Angestellte(r)");
    throw new Error("Filiale kann nicht stillgelegt werden: " + parts.join(", ") + " noch vor Ort. Verschiebe oder entlasse diese zuerst.");
  }

  b.status = "closed";
  b.closedAtMin = state.gameTime;
  return { ok: true, branchId };
}

// ---------- Fahrzeug verschieben (Leerfahrt zur Zielfiliale) ----------

export function previewMoveVehicle(state, { vehicleId, targetBranchId }) {
  const v = (state.vehicles || []).find(x => x.id === vehicleId);
  if (!v) throw new Error("Fahrzeug nicht gefunden.");
  if (v.status !== "free") throw new Error("Nur freie Fahrzeuge können verschoben werden.");
  if (v.condition < 20) throw new Error("Fahrzeugzustand zu schlecht für eine Leerfahrt.");
  const target = state.branches.find(b => b.id === targetBranchId);
  if (!target) throw new Error("Zielfiliale nicht gefunden.");
  if (target.status !== "active") throw new Error("Zielfiliale ist nicht aktiv.");
  if (v.branchId === targetBranchId) throw new Error("Fahrzeug ist bereits an dieser Filiale.");
  if (v.locationCity === target.city) {
    // Same city — instant move
    return { ok: true, instant: true, distKm: 0, fuelCents: 0, tollCents: 0, durationMin: 0 };
  }
  const dist = getDistance(v.locationCity, target.city);
  const fuel = fuelCents(dist, v.consumptionPer100km);
  const toll = tollCents(dist);
  const driveMin = driveMinutes(dist);
  return { ok: true, instant: false, distKm: dist, fuelCents: fuel, tollCents: toll, durationMin: driveMin + LOAD_UNLOAD };
}

const LOAD_UNLOAD = 0;

export function moveVehicle(state, { vehicleId, targetBranchId }) {
  const v = (state.vehicles || []).find(x => x.id === vehicleId);
  if (!v) throw new Error("Fahrzeug nicht gefunden.");
  if (v.status !== "free") throw new Error("Nur freie Fahrzeuge können verschoben werden.");
  if (v.condition < 20) throw new Error("Fahrzeugzustand zu schlecht für eine Leerfahrt.");
  const target = state.branches.find(b => b.id === targetBranchId);
  if (!target) throw new Error("Zielfiliale nicht gefunden.");
  if (target.status !== "active") throw new Error("Zielfiliale ist nicht aktiv.");
  if (v.branchId === targetBranchId) throw new Error("Fahrzeug ist bereits an dieser Filiale.");

  // Kapazitätsprüfung am Zielstandort
  const capCheck = checkParkingCapacity(state, targetBranchId, 1);
  if (!capCheck.ok) {
    const alt = findBranchWithCapacity(state, target.city, 1);
    throw new Error("Zielfiliale hat keine freien Stellplätze. " + capCheck.message +
      (alt ? ` Alternative: ${alt.name} (${alt.city}).` : "") + " Ein Stellplatzausbau ist möglich.");
  }

  // Fahrer am selben Ort finden, der das Fahrzeug überstellen kann
  const driver = (state.drivers || []).find(d =>
    d.employmentStatus === "employed" &&
    d.attendance !== "released" && isPersonAvailable(state, d.id, state.gameTime) &&
    d.status === "free" &&
    d.locationCity === v.locationCity &&
    (d.restUntil === null || d.restUntil <= state.gameTime)
  );
  if (!driver) throw new Error("Kein freier Fahrer am Standort " + v.locationCity + " verfügbar, um das Fahrzeug zu überstellen.");

  if (v.locationCity === target.city) {
    // Same city — instant move
    v.branchId = targetBranchId;
    driver.branchId = targetBranchId;
    return { ok: true, instant: true, vehicleId, targetBranchId };
  }

  const dist = getDistance(v.locationCity, target.city);
  const fuel = fuelCents(dist, v.consumptionPer100km);
  const toll = tollCents(dist);
  if (state.company.accountCents < fuel + toll) {
    throw new Error("Firmenkonto reicht für Kraftstoff und Maut nicht aus.");
  }

  // Gebühren buchen
  addBooking(state, state.gameTime, "Kraftstoff (Überstellung)", -fuel, "company", "move_vehicle_fuel:" + v.id + ":" + state.gameTime);
  addBooking(state, state.gameTime, "Maut (Überstellung)", -toll, "company", "move_vehicle_toll:" + v.id + ":" + state.gameTime);
  const initialCounters = { workMin: driver.workMinutesSinceRest || 0, driveMin: driver.driveMinutesSinceBreak || 0 };
  const plan = buildPhases(buildEmptyWorkSteps(v.locationCity, target.city), initialCounters, state.gameTime);
  const trip = {
    id: uid(state, "t"), type: "empty", orderId: null, vehicleId: v.id, driverId: driver.id,
    phases: plan.phases, initialCounters,
    currentPhase: 0, startMin: state.gameTime, endMin: plan.endMin,
    status: "in_progress", paymentCents: 0, fuelCents: fuel, tollCents: toll,
    totalKm: dist, drivenKm: 0, targetBranchId, isRelocation: true,
  };
  state.trips.push(trip);
  v.status = "on_trip"; v.tripId = trip.id;
  driver.status = "on_trip";

  return { ok: true, tripId: trip.id, vehicleId, targetBranchId, endMin: trip.endMin };
}

// ---------- Fahrer verschieben (Bahn/Bus-Reise) ----------

export function previewMoveDriver(state, { driverId, targetBranchId }) {
  const d = (state.drivers || []).find(x => x.id === driverId);
  if (!d) throw new Error("Fahrer nicht gefunden.");
  if (d.status !== "free") throw new Error("Nur freie Fahrer können verschoben werden.");
  if (d.employmentStatus !== "employed") throw new Error("Nur aktive Fahrer können verschoben werden.");
  const target = state.branches.find(b => b.id === targetBranchId);
  if (!target) throw new Error("Zielfiliale nicht gefunden.");
  if (target.status !== "active") throw new Error("Zielfiliale ist nicht aktiv.");
  if (d.branchId === targetBranchId) throw new Error("Fahrer ist bereits an dieser Filiale.");
  if (d.locationCity === target.city) {
    return { ok: true, instant: true, distKm: 0, costCents: 0, durationMin: 0 };
  }
  const dist = getDistance(d.locationCity, target.city);
  const cost = Math.round(dist * DRIVER_TRAVEL_COST_PER_KM);
  const travelMin = Math.ceil(dist / DRIVER_TRAVEL_SPEED * 60);
  return { ok: true, instant: false, distKm: dist, costCents: cost, durationMin: travelMin };
}

export function moveDriver(state, { driverId, targetBranchId }) {
  migrateBranches(state);
  const d = (state.drivers || []).find(x => x.id === driverId);
  if (!d) throw new Error("Fahrer nicht gefunden.");
  if (d.status !== "free") throw new Error("Nur freie Fahrer können verschoben werden.");
  if (d.employmentStatus !== "employed") throw new Error("Nur aktive Fahrer können verschoben werden.");
  const target = state.branches.find(b => b.id === targetBranchId);
  if (!target) throw new Error("Zielfiliale nicht gefunden.");
  if (target.status !== "active") throw new Error("Zielfiliale ist nicht aktiv.");
  if (d.branchId === targetBranchId) throw new Error("Fahrer ist bereits an dieser Filiale.");

  if (d.locationCity === target.city) {
    d.branchId = targetBranchId;
    return { ok: true, instant: true, driverId, targetBranchId };
  }

  const dist = getDistance(d.locationCity, target.city);
  const cost = Math.round(dist * DRIVER_TRAVEL_COST_PER_KM);
  if (state.company.accountCents < cost) {
    throw new Error("Firmenkonto reicht für das Reiseticket nicht aus.");
  }

  if (!isPersonAvailable(state, d.id, state.gameTime)) throw new Error("Fahrer ist nicht verfügbar.");
  addBooking(state, state.gameTime, "Reiseticket: " + d.name, -cost, "company", "move_driver:" + d.id + ":" + state.gameTime);

  const travelMin = Math.ceil(dist / DRIVER_TRAVEL_SPEED * 60);
  const travel = {
    id: uid(state, "tr"), driverId: d.id, fromCity: d.locationCity, toCity: target.city,
    startMin: state.gameTime, endMin: state.gameTime + travelMin,
    targetBranchId, costCents: cost, status: "in_progress",
  };
  state.driverTravels.push(travel);
  d.status = "traveling";

  return { ok: true, travelId: travel.id, driverId, targetBranchId, endMin: travel.endMin, costCents: cost };
}

// ---------- Fahrer-Reisen verarbeiten (wird von simulationEngine aufgerufen) ----------

export function processDriverTravels(state, m, log) {
  if (!Array.isArray(state.driverTravels)) return;
  for (const tr of state.driverTravels) {
    if (tr.status !== "in_progress") continue;
    if (tr.endMin !== m) continue;
    const d = (state.drivers || []).find(x => x.id === tr.driverId);
    if (d) {
      d.locationCity = tr.toCity;
      d.branchId = tr.targetBranchId;
      d.status = "free";
      d.freeSinceMin = m;
    }
    tr.status = "completed";
    log.push({ type: "driver_travel_completed", travel: tr.id, driver: tr.driverId, atCity: tr.toCity });
  }
}

export function getDriverTravelEventTimes(state, t, maxMin) {
  const times = [];
  if (!Array.isArray(state.driverTravels)) return times;
  for (const tr of state.driverTravels) {
    if (tr.status === "in_progress" && tr.endMin > t && tr.endMin <= maxMin) times.push(tr.endMin);
  }
  return times;
}

// ---------- Disponent Filiale zuordnen ----------

export function assignDispatcherToBranch(state, { employeeId, branchId }) {
  return assignEmployeeToBranch(state, { employeeId, branchId });
}

// Allgemeine Zuweisung eines Angestellten (Mechaniker, Reinigung, Buchhaltung,
// Disponent, Filialleiter) zu einer anderen Filiale. Erfolgt sofort –
// Angestellte pendeln selbstständig, keine Überstellung nötig.
export function assignEmployeeToBranch(state, { employeeId, branchId }) {
  const emp = (state.employees || []).find(e => e.id === employeeId);
  if (!emp) throw new Error("Angestellter nicht gefunden.");
  if (emp.employmentStatus !== "employed") throw new Error("Diese Person ist nicht beschäftigt.");
  if (branchId !== null) {
    const b = state.branches.find(x => x.id === branchId);
    if (!b) throw new Error("Filiale nicht gefunden.");
    if (b.status !== "active") throw new Error("Filiale ist nicht aktiv.");
    emp.locationCity = b.city;
  }
  emp.assignedBranchId = branchId;
  return { ok: true, employeeId, assignedBranchId: branchId };
}

// ---------- Pro-Filial-Statistik ----------

export function getBranchStats(state) {
  migrateBranches(state);
  const result = [];
  for (const b of state.branches) {
    if (b.status !== "active") continue;
    const vehicles = (state.vehicles || []).filter(v => v.branchId === b.id && v.status !== "sold" && v.status !== "archived");
    const drivers = (state.drivers || []).filter(d => d.branchId === b.id && d.employmentStatus === "employed");
    const allStaff = (state.employees || []).filter(e =>
      (e.assignedBranchId === b.id || e.branchId === b.id) && e.employmentStatus === "employed"
    );
    const activeVehicles = vehicles.filter(v => v.status === "on_trip").length;
    const totalDailyCost = b.costPerDayCents
      + drivers.reduce((s, d) => s + (d.costPerDayCents || 0), 0)
      + allStaff.reduce((s, e) => s + (e.costPerDayCents || 0), 0);
    result.push({
      id: b.id, name: b.name, city: b.city, isHeadquarters: b.isHeadquarters || false,
      openedAtMin: b.openedAtMin, status: b.status,
      costPerDayCents: b.costPerDayCents,
      totalDailyCostCents: totalDailyCost,
      vehicleCount: vehicles.length,
      driverCount: drivers.length,
      dispatcherCount: allStaff.filter(e => e.role === "dispatcher" || e.role === "dispatcher_senior").length,
      staffCount: allStaff.length,
      allStaff,
      activeVehicles,
      utilization: vehicles.length > 0 ? Math.round(activeVehicles / vehicles.length * 100) : 0,
      stats: b.stats || { revenueCents: 0, deliveries: 0, expensesCents: 0 },
    });
  }
  return result;
}

// ---------- Filial-Statistik bei Lieferung aktualisieren ----------

export function creditBranchDelivery(state, vehicle, paymentCents) {
  const b = state.branches.find(x => x.id === vehicle.branchId);
  if (b) {
    b.stats = b.stats || { revenueCents: 0, deliveries: 0, expensesCents: 0 };
    b.stats.revenueCents += paymentCents;
    b.stats.deliveries++;
  }
}