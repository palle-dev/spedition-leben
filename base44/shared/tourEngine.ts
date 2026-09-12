// Tourenketten-Engine für FERNWERK.
// Planung, Validierung, Bestätigung und automatische Ausführung von
// Mehrfachauftrags-Ketten mit Erholung, Leerfahrten und Fristen.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.

import {
  CITIES, getDistance, driveMinutes, fuelCents, tollCents, roundCents,
  LOAD_MIN, UNLOAD_MIN, MAX_DUTY_MIN, REST_MIN, formatGameTime
} from "./gameRules.ts";

// ---------- Hilfsfunktionen ----------

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Prüft, ob ein Fahrer/Fahrzeug-Paar für ein gegebenes Intervall frei ist.
// Berücksichtigt bestehende Trips, Touren und Erholung.
export function isResourceFree(state, resource, fromMin, toMin) {
  if (resource.status === "on_trip" || resource.status === "maintenance") return false;
  if (resource.status === "resting" && resource.restUntil !== null && resource.restUntil > fromMin) return false;
  // Prüfe bestehende Touren-Reservierungen
  for (const tour of state.tours || []) {
    if (tour.status !== "active" && tour.status !== "planned") continue;
    if (tour.vehicleId === resource.id || tour.driverId === resource.id) {
      if (tour.reservedUntil && tour.reservedUntil > fromMin) return false;
    }
  }
  return true;
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
  // Prüfe Touren-Reservierungen
  for (const tour of state.tours || []) {
    if (tour.status !== "active" && tour.status !== "planned") continue;
    if (tour.vehicleId === vehicle.id || tour.driverId === driver.id) {
      if (tour.reservedUntil) t = Math.max(t, tour.reservedUntil);
    }
  }
  return t;
}

// ---------- Deployment-Planung ----------

// Plant einen einzelnen Einsatz (Leerfahrt + Laden + Fahren + Entladen) für einen Auftrag.
// startCity ist der aktuelle Ort des Fahrzeugs.
export function buildDeployment(state, order, vehicle, startCity, earliestStart) {
  let t = earliestStart;
  const legs = [];
  let totalKm = 0;
  let dutyMin = 0;

  // Leerfahrt zum Abholort, falls nötig
  if (startCity !== order.fromCity) {
    const d = getDistance(startCity, order.fromCity);
    const dur = driveMinutes(d);
    legs.push({ type: "empty", fromCity: startCity, toCity: order.fromCity, distanceKm: d, durationMin: dur, startMin: t, endMin: t + dur });
    t += dur; totalKm += d; dutyMin += dur;
  }

  // Laden
  legs.push({ type: "load", fromCity: order.fromCity, toCity: order.fromCity, distanceKm: 0, durationMin: LOAD_MIN, startMin: t, endMin: t + LOAD_MIN });
  t += LOAD_MIN; dutyMin += LOAD_MIN;

  // Beladene Fahrt
  const d = getDistance(order.fromCity, order.toCity);
  const dur = driveMinutes(d);
  legs.push({ type: "drive", fromCity: order.fromCity, toCity: order.toCity, distanceKm: d, durationMin: dur, startMin: t, endMin: t + dur });
  t += dur; totalKm += d; dutyMin += dur;

  // Entladen
  legs.push({ type: "unload", fromCity: order.toCity, toCity: order.toCity, distanceKm: 0, durationMin: UNLOAD_MIN, startMin: t, endMin: t + UNLOAD_MIN });
  t += UNLOAD_MIN; dutyMin += UNLOAD_MIN;

  const fuel = fuelCents(totalKm, vehicle.consumptionPer100km);
  const toll = tollCents(totalKm);
  const emptyKm = startCity !== order.fromCity ? getDistance(startCity, order.fromCity) : 0;
  const loadedKm = d;

  return {
    orderId: order.id,
    orderStatus: order.status,
    customer: order.customer,
    cargo: order.cargo,
    tons: order.tons,
    fromCity: order.fromCity,
    toCity: order.toCity,
    emptyFromCity: startCity !== order.fromCity ? startCity : null,
    legs,
    emptyKm,
    loadedKm,
    totalKm,
    dutyMin,
    durationMin: t - earliestStart,
    startMin: earliestStart,
    endMin: t,
    restEndMin: t + REST_MIN,
    fuelCents: fuel,
    tollCents: toll,
    variableCostCents: fuel + toll,
    paymentCents: order.paymentCents,
    contributionCents: order.paymentCents - fuel - toll,
    deliveryDeadlineMin: order.deliveryDeadlineMin,
    deadlineBufferMin: order.deliveryDeadlineMin - t,
  };
}

// Plant eine Leerfahrt als eigenen Einsatz (z. B. um an einen Abholort zu kommen).
export function buildEmptyDeployment(state, fromCity, toCity, vehicle, earliestStart) {
  let t = earliestStart;
  const d = getDistance(fromCity, toCity);
  const dur = driveMinutes(d);
  const legs = [{ type: "empty_drive", fromCity, toCity, distanceKm: d, durationMin: dur, startMin: t, endMin: t + dur }];
  t += dur;
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
    legs,
    emptyKm: d,
    loadedKm: 0,
    totalKm: d,
    dutyMin: dur,
    durationMin: t - earliestStart,
    startMin: earliestStart,
    endMin: t,
    restEndMin: t + REST_MIN,
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
// deployments: Array von { orderId } in Ausführungsreihenfolge.
// Optional: emptyDeployments (Leerfahrten) zwischen Aufträgen.
export function buildTourPlan(state, opts) {
  const { vehicleId, driverId, orderIds, desiredEndCity, latestReturnMin } = opts;
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);
  if (!vehicle || !driver) return { error: "Fahrzeug oder Fahrer nicht gefunden." };

  // Prüfe Grundvoraussetzungen
  if (vehicle.locationCity !== driver.locationCity) {
    return { error: "Fahrer und Lkw befinden sich an unterschiedlichen Orten." };
  }

  const earliestStart = earliestAvailable(state, vehicle, driver);
  let currentCity = vehicle.locationCity;
  let t = earliestStart;
  const deployments = [];
  const acceptedOrderIds = []; // Aufträge, die bei Bestätigung angenommen werden müssen
  let totalKm = 0, emptyKm = 0, loadedKm = 0;
  let totalFuel = 0, totalToll = 0, totalPayment = 0;
  let minBuffer = Infinity;

  for (const orderId of orderIds) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order) return { error: "Auftrag nicht gefunden: " + orderId };
    if (order.status !== "offered" && order.status !== "angenommen") {
      return { error: "Auftrag " + order.customer + " ist nicht verfügbar (Status: " + order.status + ")." };
    }
    if (order.tons > vehicle.capacityTons) {
      return { error: "Überladung: " + order.tons + " t überschreiten Kapazität von " + vehicle.capacityTons + " t." };
    }

    const dep = buildDeployment(state, order, vehicle, currentCity, t);
    if (dep.dutyMin > MAX_DUTY_MIN) {
      const h = Math.floor(dep.dutyMin / 60), mm = dep.dutyMin % 60;
      return { error: "Einsatzdauer für " + order.customer + " (" + h + " h " + mm + " min) überschreitet die 8-Stunden-Grenze." };
    }
    if (dep.endMin > order.deliveryDeadlineMin) {
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
    t = dep.restEndMin; // Nächster Einsatz nach Erholung
  }

  // Optionale gewünschte Rückkehr
  let returnDeployment = null;
  if (desiredEndCity && currentCity !== desiredEndCity) {
    const dep = buildEmptyDeployment(state, currentCity, desiredEndCity, vehicle, t);
    if (dep.dutyMin > MAX_DUTY_MIN) {
      const h = Math.floor(dep.dutyMin / 60), mm = dep.dutyMin % 60;
      return { error: "Rückkehrfahrt (" + h + " h " + mm + " min) überschreitet die 8-Stunden-Grenze." };
    }
    returnDeployment = dep;
    totalKm += dep.totalKm; emptyKm += dep.emptyKm;
    totalFuel += dep.fuelCents; totalToll += dep.tollCents;
    t = dep.restEndMin;
  }

  const lastDeliveryEnd = deployments.length > 0 ? deployments[deployments.length - 1].endMin : earliestStart;
  const tourEndMin = returnDeployment ? returnDeployment.endMin : lastDeliveryEnd;
  const driverFreeMin = returnDeployment ? returnDeployment.restEndMin : (deployments.length > 0 ? deployments[deployments.length - 1].restEndMin : earliestStart);

  if (latestReturnMin && tourEndMin > latestReturnMin) {
    return { error: "Tour endet zu spät (" + formatGameTime(tourEndMin) + "), späteste Rückkehr " + formatGameTime(latestReturnMin) + "." };
  }

  // Liquiditätsprüfung: simuliere Kontoverlauf
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

// Simuliert den Firmenkontoverlauf für eine Tour.
// Prüft, ob zu jedem Kostenzeitpunkt genug Geld vorhanden ist.
export function checkTourLiquidity(state, deployments, returnDeployment, startMin) {
  let balance = state.company.accountCents;
  // Abzieh: bekannte offene Kosten
  const openCompany = state.openCosts.filter(o => o.account === "company").reduce((s, o) => s + o.amountCents, 0);
  balance -= openCompany;

  // Sammle alle Zeitpunkte chronologisch
  const events = [];
  for (const dep of deployments) {
    events.push({ min: dep.startMin, type: "cost", amount: dep.fuelCents + dep.tollCents, label: "Einsatz " + (dep.customer || "Leer") });
    events.push({ min: dep.endMin, type: "income", amount: dep.paymentCents, label: "Vergütung " + (dep.customer || "") });
  }
  if (returnDeployment) {
    events.push({ min: returnDeployment.startMin, type: "cost", amount: returnDeployment.fuelCents + returnDeployment.tollCents, label: "Rückkehr" });
  }
  // Bekannte zukünftige Tageskosten (vereinfacht: pro Tag bis Tour-Ende)
  const tourEnd = returnDeployment ? returnDeployment.endMin : (deployments.length > 0 ? deployments[deployments.length - 1].endMin : startMin);
  const startDay = Math.floor(startMin / 1440);
  const endDay = Math.floor(tourEnd / 1440);
  const dailyCosts = (state.drivers.length * 10000 + state.branches.length * 10000); // Fahrerlohn + Standort
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

// ---------- Bestätigung (atomar) ----------

export function confirmTour(state, params) {
  const { vehicleId, driverId, orderIds, desiredEndCity, latestReturnMin } = params;

  // 1. Plane die Tour (Validierung)
  const plan = buildTourPlan(state, { vehicleId, driverId, orderIds, desiredEndCity, latestReturnMin });
  if (plan.error) throw new Error(plan.error);

  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);

  // 2. Prüfe Ressourcen-Verfügbarkeit erneut
  if (vehicle.status !== "free" && vehicle.status !== "resting") {
    throw new Error("Fahrzeug ist nicht frei (Status: " + vehicle.status + ").");
  }
  if (driver.status !== "free" && driver.status !== "resting") {
    throw new Error("Fahrer ist nicht frei (Status: " + driver.status + ").");
  }
  if (vehicle.condition < 20) {
    throw new Error("Fahrzeugzustand zu schlecht für einen Einsatz (unter 20). Wartung erforderlich.");
  }

  // 3. Nimm alle noch nicht angenommenen Aufträge an
  for (const orderId of plan.acceptedOrderIds) {
    const o = state.orders.find(x => x.id === orderId);
    if (!o) throw new Error("Auftrag nicht gefunden: " + orderId);
    if (o.status !== "offered") throw new Error("Auftrag " + o.customer + " ist nicht mehr verfügbar.");
    if (o.acceptDeadlineMin <= state.gameTime) throw new Error("Annahmefrist für " + o.customer + " ist abgelaufen.");
    o.status = "angenommen";
    o.acceptedAtMin = state.gameTime;
  }

  // 4. Erstelle die Tourenkette
  const tourId = uid(state, "tour");
  const tour = {
    id: tourId,
    vehicleId,
    driverId,
    status: "active",
    createdAt: state.gameTime,
    confirmedAt: state.gameTime,
    startCity: vehicle.locationCity,
    desiredEndCity: desiredEndCity || null,
    latestReturnMin: latestReturnMin || null,
    deployments: plan.deployments.map((dep, i) => ({
      ...dep,
      id: "dep_" + (i + 1),
      status: i === 0 ? "active" : "planned",
      actualStartMin: null,
      actualEndMin: null,
      tripId: null,
    })),
    returnDeployment: plan.returnDeployment ? {
      ...plan.returnDeployment,
      id: "dep_return",
      status: "planned",
      actualStartMin: null,
      actualEndMin: null,
      tripId: null,
    } : null,
    totalKm: plan.totalKm,
    emptyKm: plan.emptyKm,
    loadedKm: plan.loadedKm,
    totalContributionCents: plan.totalContributionCents,
    reservedUntil: plan.reservedUntil,
    currentDepIndex: 0,
    pauseReason: null,
  };
  state.tours = state.tours || [];
  state.tours.push(tour);

  // 5. Starte den ersten Einsatz – sofort oder geplant für die Zukunft
  const firstDep = tour.deployments[0];
  if (firstDep.startMin <= state.gameTime) {
    const startResult = startDeployment(state, tour, firstDep, 0);
    firstDep.tripId = startResult.tripId;
    firstDep.status = "active";
    firstDep.actualStartMin = state.gameTime;
    tour.currentDepIndex = 0;
  } else {
    // Zukünftiger Start – processTours startet bei Erreichen des Zeitpunkts
    firstDep.status = "planned";
    tour.currentDepIndex = 0;
  }

  return {
    ok: true,
    tourId,
    acceptedOrderIds: plan.acceptedOrderIds,
    firstTripId: startResult.tripId,
    totalContributionCents: plan.totalContributionCents,
    totalKm: plan.totalKm,
    emptyKm: plan.emptyKm,
    driverFreeMin: plan.driverFreeMin,
  };
}

// Startet einen einzelnen Einsatz innerhalb einer Tour.
// Berechnet Beine und Kosten zum tatsächlichen Startzeitpunkt neu.
function startDeployment(state, tour, dep, depIndex) {
  const vehicle = state.vehicles.find(v => v.id === tour.vehicleId);
  const driver = state.drivers.find(d => d.id === tour.driverId);
  if (!vehicle || !driver) throw new Error("Fahrzeug oder Fahrer nicht gefunden.");

  // Beine neu berechnen ab aktuellem Zeitpunkt und Ort
  let t = state.gameTime;
  const legs = [];
  let totalKm = 0;
  const startCity = vehicle.locationCity;

  if (dep.orderId) {
    const order = state.orders.find(o => o.id === dep.orderId);
    if (startCity !== order.fromCity) {
      const d = getDistance(startCity, order.fromCity);
      const dur = driveMinutes(d);
      legs.push({ type: "empty", fromCity: startCity, toCity: order.fromCity, distanceKm: d, durationMin: dur, startMin: t, endMin: t + dur });
      t += dur; totalKm += d;
    }
    legs.push({ type: "load", fromCity: order.fromCity, toCity: order.fromCity, distanceKm: 0, durationMin: LOAD_MIN, startMin: t, endMin: t + LOAD_MIN });
    t += LOAD_MIN;
    const d = getDistance(order.fromCity, order.toCity);
    const dur = driveMinutes(d);
    legs.push({ type: "drive", fromCity: order.fromCity, toCity: order.toCity, distanceKm: d, durationMin: dur, startMin: t, endMin: t + dur });
    t += dur; totalKm += d;
    legs.push({ type: "unload", fromCity: order.toCity, toCity: order.toCity, distanceKm: 0, durationMin: UNLOAD_MIN, startMin: t, endMin: t + UNLOAD_MIN });
    t += UNLOAD_MIN;
  } else {
    const d = getDistance(startCity, dep.toCity);
    const dur = driveMinutes(d);
    legs.push({ type: "empty_drive", fromCity: startCity, toCity: dep.toCity, distanceKm: d, durationMin: dur, startMin: t, endMin: t + dur });
    t += dur; totalKm += d;
  }

  const fuel = fuelCents(totalKm, vehicle.consumptionPer100km);
  const toll = tollCents(totalKm);

  const tripId = uid(state, "t");
  const trip = {
    id: tripId,
    type: dep.orderId ? "loaded" : "empty",
    orderId: dep.orderId,
    tourId: tour.id,
    vehicleId: vehicle.id,
    driverId: driver.id,
    legs,
    currentLeg: 0,
    startMin: state.gameTime,
    endMin: t,
    status: "in_progress",
    paymentCents: dep.paymentCents,
    fuelCents: fuel,
    tollCents: toll,
    totalKm,
    depIndex,
  };

  addBooking(state, state.gameTime, "Kraftstoff: " + (dep.customer || "Leerfahrt"), -fuel, "company", "fuel:" + tripId);
  addBooking(state, state.gameTime, "Maut: " + (dep.customer || "Leerfahrt"), -toll, "company", "toll:" + tripId);

  state.trips.push(trip);
  vehicle.status = "on_trip";
  vehicle.tripId = tripId;
  driver.status = "on_trip";

  if (dep.orderId) {
    const order = state.orders.find(o => o.id === dep.orderId);
    if (order) {
      order.status = "unterwegs";
      order.startedAtMin = state.gameTime;
    }
  }

  return { tripId };
}

// Hilfsfunktion: Buchung hinzufügen (lokal in tourEngine, identisch mit simulationEngine)
function addBooking(state, min, cause, amountCents, account, refId) {
  state.bookings.push({ min, cause, amountCents, account, refId });
  if (account === "company") state.company.accountCents += amountCents;
  else if (account === "private") state.private.accountCents += amountCents;
}

// ---------- Tour-Auflösung ----------

export function cancelTour(state, tourId) {
  const tour = (state.tours || []).find(t => t.id === tourId);
  if (!tour) throw new Error("Tour nicht gefunden.");
  if (tour.status === "completed") throw new Error("Tour ist bereits abgeschlossen.");
  if (tour.status === "cancelled") throw new Error("Tour ist bereits aufgelöst.");

  // Aktiver Einsatz läuft weiter – nur zukünftige Einsätze freigeben
  const activeDep = tour.deployments.find(d => d.status === "active");
  if (activeDep) {
    // Aktiver Trip läuft weiter, aber Tour wird als aufgelöst markiert
    // Nach Abschluss des aktiven Trips wird keine weitere Deployment gestartet
    tour.status = "cancelled";
    tour.pauseReason = "Vom Spieler aufgelöst";
    // Fahrzeug/Fahrer werden nach Abschluss des aktiven Trips normal freigegeben
    return { ok: true, activeTripContinues: true, freedFutureDeployments: tour.deployments.filter(d => d.status === "planned").length };
  }

  // Kein aktiver Einsatz: sofort freigeben
  tour.status = "cancelled";
  tour.pauseReason = "Vom Spieler aufgelöst";

  // Aufträge bleiben angenommen (nicht storniert)
  for (const dep of tour.deployments) {
    if (dep.orderId && dep.status === "planned") {
      const order = state.orders.find(o => o.id === dep.orderId);
      if (order && order.status === "unterwegs") {
        // Sollte nicht passieren, da kein aktiver Einsatz
      } else if (order && order.status === "angenommen") {
        // Bleibt angenommen – erscheint als unzugewiesen
      }
    }
  }

  return { ok: true, freedFutureDeployments: tour.deployments.filter(d => d.status === "planned").length };
}

// ---------- Automatische Ausführung ----------

// Wird bei jedem Ereignis-Zeitpunkt aufgerufen.
// Prüft, ob eine Tour zum nächsten Einsatz starten kann.
export function processTours(state, m, log) {
  for (const tour of state.tours || []) {
    if (tour.status !== "active") continue;
    if (tour.pauseReason) continue;

    // Finde den nächsten geplanten Einsatz
    const nextDep = findNextDeployment(tour);
    if (!nextDep) continue;

    // Prüfe, ob der Startzeitpunkt erreicht ist
    if (nextDep.dep.startMin > m) continue;

    // Prüfe, ob das aktuelle Deployment (falls aktiv) abgeschlossen ist
    const activeDep = tour.deployments.find(d => d.status === "active") || (tour.returnDeployment && tour.returnDeployment.status === "active" ? tour.returnDeployment : null);
    if (activeDep) continue; // Noch beschäftigt

    // Prüfe Ressourcen-Verfügbarkeit
    const vehicle = state.vehicles.find(v => v.id === tour.vehicleId);
    const driver = state.drivers.find(d => d.id === tour.driverId);
    if (!vehicle || !driver) {
      tour.pauseReason = "Fahrzeug oder Fahrer nicht mehr verfügbar";
      log.push({ type: "tour_paused", tour: tour.id, reason: tour.pauseReason });
      continue;
    }

    // Fahrzeug muss frei sein (vorheriger Einsatz abgeschlossen + Erholung vorbei)
    if (vehicle.status !== "free" && vehicle.status !== "resting") continue;
    if (driver.status !== "free" && driver.status !== "resting") continue;
    if (driver.restUntil && driver.restUntil > m) continue;

    // Fahrzeugzustand prüfen
    if (vehicle.condition < 20) {
      tour.pauseReason = "Fahrzeugzustand zu schlecht (< 20). Wartung erforderlich.";
      log.push({ type: "tour_paused", tour: tour.id, reason: tour.pauseReason });
      continue;
    }

    // Liquidität prüfen
    const fuelToll = nextDep.dep.fuelCents + nextDep.dep.tollCents;
    if (state.company.accountCents < fuelToll) {
      tour.pauseReason = "Firmenkonto reicht für Kraftstoff und Maut (" + (fuelToll / 100).toFixed(2) + " €) nicht. Kostet: " + (fuelToll / 100).toFixed(2) + " €.";
      log.push({ type: "tour_paused", tour: tour.id, reason: tour.pauseReason });
      continue;
    }

    // Ort-Konsistenz prüfen
    if (vehicle.locationCity !== nextDep.dep.legs[0].fromCity) {
      tour.pauseReason = "Fahrzeug ist nicht am erwarteten Ort (" + nextDep.dep.legs[0].fromCity + ", aktuell " + vehicle.locationCity + ").";
      log.push({ type: "tour_paused", tour: tour.id, reason: tour.pauseReason });
      continue;
    }

    // Starte den Einsatz
    const startResult = startDeployment(state, tour, nextDep.dep, nextDep.index);
    nextDep.dep.tripId = startResult.tripId;
    nextDep.dep.status = "active";
    nextDep.dep.actualStartMin = m;
    tour.currentDepIndex = nextDep.index;
    log.push({ type: "tour_deployment_started", tour: tour.id, deployment: nextDep.dep.id, trip: startResult.tripId, customer: nextDep.dep.customer });
  }
}

// Findet den nächsten zu startenden Einsatz einer Tour.
function findNextDeployment(tour) {
  for (let i = 0; i < tour.deployments.length; i++) {
    const dep = tour.deployments[i];
    if (dep.status === "planned") return { dep, index: i };
  }
  if (tour.returnDeployment && tour.returnDeployment.status === "planned") {
    return { dep: tour.returnDeployment, index: tour.deployments.length };
  }
  return null;
}

// Wird aufgerufen, wenn ein Trip abgeschlossen wird.
// Verknüpft den Abschluss mit der Tour und plant Erholung.
export function onTripCompleted(state, trip, m, log) {
  if (!trip.tourId) return false;
  const tour = (state.tours || []).find(t => t.id === trip.tourId);
  if (!tour) return false;

  // Finde das zugehörige Deployment
  let dep = null;
  for (const d of tour.deployments) {
    if (d.tripId === trip.id) { dep = d; break; }
  }
  if (!dep && tour.returnDeployment && tour.returnDeployment.tripId === trip.id) {
    dep = tour.returnDeployment;
  }
  if (!dep) return false;

  dep.status = "completed";
  dep.actualEndMin = m;

  // Prüfe, ob die Tour vollständig abgeschlossen ist
  const allDone = tour.deployments.every(d => d.status === "completed" || d.status === "skipped");
  const returnDone = !tour.returnDeployment || tour.returnDeployment.status === "completed" || tour.returnDeployment.status === "skipped";
  if (allDone && returnDone) {
    tour.status = "completed";
    log.push({ type: "tour_completed", tour: tour.id });
  }

  return true;
}

// ---------- Rückladungs-Suche ----------

// Findet passende Rückladungen am Zielort eines Hinauftrags.
// Gibt Kandidaten mit Machbarkeitsprüfung zurück.
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

    const plan = buildTourPlan(state, {
      vehicleId, driverId,
      orderIds: [primaryOrderId, o.id],
      desiredEndCity: null,
      latestReturnMin: null,
    });
    if (plan.ok) {
      candidates.push({
        order: o,
        type: "direct_return",
        plan,
        description: "Direkte Rückladung " + o.fromCity + " → " + o.toCity + " (" + o.customer + ")",
      });
    } else {
      candidates.push({
        order: o,
        type: "direct_return",
        plan: null,
        error: plan.error,
        description: o.fromCity + " → " + o.toCity + " (" + o.customer + ") – nicht ausführbar",
      });
    }
  }

  // 2. Rückladungen mit Leerfahrt zum Abholort
  for (const o of state.orders) {
    if (o.id === primaryOrderId) continue;
    if (o.status !== "offered" && o.status !== "angenommen") continue;
    if (o.fromCity === destCity) continue; // schon als direkte Rückladung erfasst
    if (o.toCity !== order.fromCity && o.toCity !== "Hamburg") continue; // nur sinnvolle Ziele
    if (o.tons > vehicle.capacityTons) continue;

    // Tour mit Leerfahrt: Hin → Leerfahrt → Rück
    // Wir testen: Hin + Rück (mit automatischer Leerfahrt vom Tour-Endort zum Abholort)
    const plan = buildTourPlan(state, {
      vehicleId, driverId,
      orderIds: [primaryOrderId, o.id],
      desiredEndCity: null,
      latestReturnMin: null,
    });
    if (plan.ok) {
      candidates.push({
        order: o,
        type: "empty_then_return",
        plan,
        description: "Leerfahrt " + destCity + " → " + o.fromCity + ", dann " + o.fromCity + " → " + o.toCity + " (" + o.customer + ")",
      });
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

// Findet Vorschläge für freie Fahrzeuge.
// mode: "balanced" | "high_margin" | "low_empty"
export function suggestTours(state, opts) {
  const { vehicleIds, earliestStart, horizonMin, desiredEndCity, latestReturnMin, mode, acceptNew } = opts;
  const suggestions = [];

  const startMin = earliestStart || state.gameTime;
  const maxMin = startMin + (horizonMin || 48 * 60);
  const usedDriverIds = new Set();
  const usedOrderIds = new Set();

  for (const vehicleId of vehicleIds || state.vehicles.map(v => v.id)) {
    const vehicle = state.vehicles.find(v => v.id === vehicleId);
    if (!vehicle) continue;
    if (vehicle.status !== "free" && vehicle.status !== "resting") continue;
    if (vehicle.condition < 20) continue;

    // Finde einen passenden Fahrer am gleichen Ort (auch ruhende, noch nicht zugewiesen)
    const driver = state.drivers.find(d =>
      d.locationCity === vehicle.locationCity &&
      (d.status === "free" || d.status === "resting") &&
      d.employmentStatus === "employed" &&
      !usedDriverIds.has(d.id)
    );
    if (!driver) continue;

    // 1. Bereits angenommene, unzugewiesene Aufträge (nicht bereits zugewiesen)
    const acceptedOrders = state.orders.filter(o =>
      o.status === "angenommen" &&
      o.tons <= vehicle.capacityTons &&
      !usedOrderIds.has(o.id)
    );

    // 2. Offene Angebote (nur wenn acceptNew, nicht bereits zugewiesen)
    const offeredOrders = acceptNew ? state.orders.filter(o =>
      o.status === "offered" &&
      o.acceptDeadlineMin > startMin &&
      o.tons <= vehicle.capacityTons &&
      !usedOrderIds.has(o.id)
    ) : [];

    const allOrders = [...acceptedOrders, ...offeredOrders];

    // Finde die beste Einzel- oder Doppel-Tour
    let bestPlan = null;
    let bestOrders = null;

    // Einzel-Touren
    for (const o of allOrders) {
      const plan = buildTourPlan(state, {
        vehicleId, driverId: driver.id,
        orderIds: [o.id],
        desiredEndCity, latestReturnMin,
      });
      if (plan.ok && plan.tourEndMin <= maxMin) {
        if (!bestPlan || comparePlans(plan, bestPlan, mode) < 0) {
          bestPlan = plan;
          bestOrders = [o.id];
        }
      }
    }

    // Doppel-Touren (Hin + Rück)
    for (let i = 0; i < allOrders.length; i++) {
      for (let j = 0; j < allOrders.length; j++) {
        if (i === j) continue;
        const o1 = allOrders[i], o2 = allOrders[j];
        if (o1.toCity !== o2.fromCity) continue; // Nur direkte Rückladungen
        const plan = buildTourPlan(state, {
          vehicleId, driverId: driver.id,
          orderIds: [o1.id, o2.id],
          desiredEndCity, latestReturnMin,
        });
        if (plan.ok && plan.tourEndMin <= maxMin) {
          if (!bestPlan || comparePlans(plan, bestPlan, mode) < 0) {
            bestPlan = plan;
            bestOrders = [o1.id, o2.id];
          }
        }
      }
    }

    if (bestPlan) {
      usedDriverIds.add(driver.id);
      bestOrders.forEach(oid => usedOrderIds.add(oid));
      suggestions.push({
        vehicleId,
        driverId: driver.id,
        vehicle, driver,
        orderIds: bestOrders,
        plan: bestPlan,
        mode,
      });
    }
  }

  return { suggestions };
}

function comparePlans(a, b, mode) {
  if (mode === "high_margin") return (b.totalContributionCents || 0) - (a.totalContributionCents || 0);
  if (mode === "low_empty") {
    // Erst Auftragsabdeckung (mehr Aufträge = besser), dann weniger Leer-km
    const aOrders = a.deployments.length;
    const bOrders = b.deployments.length;
    if (aOrders !== bOrders) return bOrders - aOrders;
    return (a.emptyKm || 0) - (b.emptyKm || 0);
  }
  // balanced: Beitrag pro km, dann Puffer
  const aScore = (a.totalContributionCents || 0) / Math.max(1, a.totalKm || 1);
  const bScore = (b.totalContributionCents || 0) / Math.max(1, b.totalKm || 1);
  if (Math.abs(aScore - bScore) > 0.01) return bScore - aScore;
  return (a.minDeadlineBufferMin || 0) - (b.minDeadlineBufferMin || 0);
}