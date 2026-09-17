// Szenario-Setups für FERNWERK.
// Modifiziert den Basis-Initialzustand für jedes der drei Szenarien.
// Nutzt die vorhandenen Erzeugungsfunktionen und validierten Datenstrukturen.

import { generateLoanSchedule, LOAN_INTEREST_RATE_MONTHLY } from "@/lib/simulation/financingEngine";
import { migrateContracts, migrateCustomerRelations, CONTRACT_DISCOUNT, CONTRACT_DURATION_DAYS, CONTRACT_DELIVERY_BUFFER_HOURS } from "@/lib/simulation/customerEngine";
import { getDistance, driveMinutes, LOAD_MIN, UNLOAD_MIN, PORTRAIT_IDS } from "@/lib/simulation/gameRules";
import { computeOfferPrice } from "@/lib/simulation/marketEngine";
import { deliverMessage } from "@/lib/simulation/mailEngine";

// ─────────────────────────────────────────────────────────────
// Szenario 1: Wieder auf Kurs
// ─────────────────────────────────────────────────────────────

export function setupWiederAufKurs(state, names) {
  const p = names || {};
  state.company.name = p.companyName || "Norddeutsche Transport GmbH";
  state.private.playerName = p.playerName || "Spielerin";
  state.private.partnerName = p.partnerName || "Mara";

  // Liquidität anpassen: 18.000 € statt 75.000 €
  state.company.accountCents = 1800000;

  // Fahrzeuge: unterschiedliche Zustände
  const vehicles = state.vehicles;
  if (vehicles.length >= 3) {
    vehicles[0].condition = 75;
    vehicles[1].condition = 45;
    vehicles[2].condition = 22;
    // Verschiedene Kilometerstände
    vehicles[0].odometerKm = 45000;
    vehicles[1].odometerKm = 120000;
    vehicles[2].odometerKm = 180000;
  }

  // Bestehender Kredit: 35.000 €, 24 Monate, erste Rate Tag 15
  const loanPrincipal = 3500000;
  const termMonths = 24;
  const schedule = generateLoanSchedule(loanPrincipal, termMonths, LOAN_INTEREST_RATE_MONTHLY);
  const firstPaymentMin = state.gameTime + 14 * 1440;

  const loan = {
    id: "loan_scenario_1",
    principalCents: loanPrincipal,
    feeCents: 0,
    interestRateMonthly: LOAN_INTEREST_RATE_MONTHLY,
    termMonths,
    startMin: state.gameTime,
    firstPaymentMin,
    schedule,
    payments: [],
    remainingPrincipalCents: loanPrincipal,
    accruedInterestCents: 0,
    interestFraction: 0,
    lastAccrualMin: state.gameTime,
    overduePrincipalCents: 0,
    overdueInterestCents: 0,
    overdueSinceMin: null,
    status: "active",
    nextDueMin: firstPaymentMin,
    paidInstallments: 0,
  };
  state.loans = [loan];

  // Die vollständige Eröffnungsbilanz wird nach dem Szenario-Setup erstellt.

  // Szenario-spezifische Hinweisnachricht
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Übernahmebericht: Spedition in Schieflage",
    body:
      "Du hast die Spedition übernommen. Die bisherige Geschäftsführung hat die Möglichkeiten überschätzt.\n\n" +
      "Aktuelle Lage:\n" +
      "• Firmenbank: 18.000 €\n" +
      "• 3 Lkw (Zustand 75/45/22) — ein Lkw ist fast nicht mehr einsatzbereit\n" +
      "• 3 Fahrer\n" +
      "• Bestehender Kredit: 35.000 € (24 Monate)\n" +
      "• Erste Kreditrate: Tag 15, ca. 1.590 €\n\n" +
      "Ziele (30 Tage):\n" +
      "• Keine überfälligen Kreditverpflichtungen am Stichtag\n" +
      "• Mindestliquidität 5.000 €\n" +
      "• Mindestens 10 erfolgreiche Lieferungen\n" +
      "• Mindestens 2 einsatzbereite Lkw\n\n" +
      "Tipp: Der Lkw mit Zustand 22 kann noch wenige Touren fahren, bevor er gewartet werden muss. " +
      "Plane rechtzeitig.",
    gameTime: state.gameTime,
    category: "system", priority: "high",
    dedupKey: "scenario_intro:wieder_auf_kurs",
  });
}

// ─────────────────────────────────────────────────────────────
// Szenario 2: Ein Kunde zählt auf dich
// ─────────────────────────────────────────────────────────────

export function setupEinKundeZaehlt(state, names) {
  const p = names || {};
  state.company.name = p.companyName || "Vertrauen Transport GmbH";
  state.private.playerName = p.playerName || "Spielerin";
  state.private.partnerName = p.partnerName || "Mara";

  // Liquidität: 25.000 €
  state.company.accountCents = 2500000;

  // 3 Lkw, alle in gutem Zustand
  for (const v of state.vehicles) {
    v.condition = 80;
  }

  // Disponent einstellen
  const dispatcher = {
    id: "emp_scenario_disp",
    name: "Helena Voss",
    role: "dispatcher",
    branchId: "b1",
    locationCity: "Hamburg",
    employedDay: 1,
    costPerDayCents: 18000,
    hireFeeCents: 0,
    satisfaction: 75,
    satisfactionReasons: [],
    employmentStatus: "employed",
    exitDate: null,
    attendance: "present",
    sickUntil: null,
    vacationUntil: null,
    vacationDaysAvailable: 3,
    activity: "idle",
    consecutiveLowSatisfactionDays: 0,
    assignedVehicleIds: [],
    workMode: "autonomous",
    managementMode: undefined,
    assignedBranchId: "b1",
    capacity: 6,
    lastDecisionMin: null,
    suggestions: [],
    portraitId: PORTRAIT_IDS[3] || PORTRAIT_IDS[0],
    shiftStart: 480,
    shiftEnd: 960,
  };
  state.employees = state.employees || [];
  state.employees.push(dispatcher);

  // Kundenbeziehung zu Stammkunde machen (für gültigen Rahmenvertrag)
  migrateCustomerRelations(state);
  migrateContracts(state);
  const rel = state.customerRelations.relations["c01"];
  if (rel) {
    rel.trust = 80;
    rel.completedTransports = 10;
    rel.isStammkunde = true;
  }

  // Rahmenvertrag direkt erstellen (Hanse Handelskontor, Hamburg → Bremen)
  const customerId = "c01";
  const customerName = "Hanse Handelskontor";
  const fromCity = "Hamburg";
  const toCity = "Bremen";
  const cargo = "Stückgut";
  const tons = 8;
  const transportsPerDay = 2;

  const km = getDistance(fromCity, toCity);
  const driveMin = driveMinutes(km);
  const opMin = LOAD_MIN + driveMin + UNLOAD_MIN;
  const deliveryBufferMin = CONTRACT_DELIVERY_BUFFER_HOURS * 60;
  const basePrice = computeOfferPrice(km, tons, "normal", 1.0);
  const paymentPerTransportCents = Math.round(basePrice * (1 - CONTRACT_DISCOUNT));

  const contractStartMin = 1440; // Tag 2, Mitternacht
  const contractDurationDays = 7;
  const contractEndMin = contractStartMin + contractDurationDays * 1440;
  const startDay = 2;
  const endDay = 8;

  const contract = {
    id: "ctr_scenario_2",
    customerId,
    customerName,
    fromCity, toCity, cargo, tons,
    transportsPerDay,
    paymentPerTransportCents,
    startMin: contractStartMin,
    endMin: contractEndMin,
    startDay,
    endDay,
    deliveryBufferMin,
    driveMin,
    opMin,
    requiresDg: false,
    minCapacityTons: tons,
    status: "active",
    offerCreatedAtMin: state.gameTime,
    acceptedAtMin: state.gameTime,
    generatedCount: 0,
    deliveredCount: 0,
    timelyCount: 0,
    lateCount: 0,
    failedCount: 0,
    cancelledCount: 0,
    revenueCents: 0,
    lastDayGenerated: 0,
    orderIds: [],
    evaluatedAtMin: null,
    earlyTerminatedAtMin: null,
  };
  state.contracts.contracts.push(contract);
  state.scenario.contractId = contract.id;
  state.scenario.initialTransports = transportsPerDay * contractDurationDays;

  // Szenario-Hinweis
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Rahmenvertrag bestätigt: Hanse Handelskontor",
    body:
      "Hanse Handelskontor hat dir eine Chance gegeben und einen Rahmenvertrag abgeschlossen.\n\n" +
      "Vertragsdetails:\n" +
      "• Relation: Hamburg → Bremen\n" +
      "• Fracht: Stückgut, 8 t\n" +
      "• Transporte pro Tag: 2 (Tag 2 bis Tag 8)\n" +
      "• Vergütung pro Transport: " + (paymentPerTransportCents / 100).toFixed(2) + " €\n" +
      "• Gesamt: 14 Transporte, " + ((paymentPerTransportCents * 14) / 100).toFixed(2) + " € Umsatzpotenzial\n\n" +
      "Verbindliche Ziele (10 Tage):\n" +
      "• Mindestens 13 von 14 Transporten pünktlich (90%)\n" +
      "• Vertrag regulär abschließen\n" +
      "• Mindestliquidität 15.000 €\n\n" +
      "Der Vertrag beginnt an Tag 2. Nutze Tag 1 für die Vorbereitung.",
    gameTime: state.gameTime,
    category: "system", priority: "high",
    dedupKey: "scenario_intro:ein_kunde_zaehlt",
  });
}

// ─────────────────────────────────────────────────────────────
// Szenario 3: Der Betrieb läuft auch ohne dich
// ─────────────────────────────────────────────────────────────

export function setupDerBetriebLaeuft(state, names) {
  const p = names || {};
  state.company.name = p.companyName || "Wachstum Transport GmbH";
  state.private.playerName = p.playerName || "Spielerin";
  state.private.partnerName = p.partnerName || "Mara";

  // Liquidität: 30.000 €
  state.company.accountCents = 3000000;

  // 4 Lkw, alle in gutem Zustand
  // Basis hat 3 Lkw — vierten hinzufügen
  for (const v of state.vehicles) {
    v.condition = 75;
  }
  if (state.vehicles.length === 3) {
    state.vehicles.push({
      id: "v4",
      branchId: "b1",
      type: "Standard-Lkw",
      capacityTons: 12,
      consumptionPer100km: 28,
      bookValueCents: 2400000,
      condition: 75,
      locationCity: "Hamburg",
      status: "free",
      tripId: null,
      maintenanceUntil: null,
      ownership_type: "owned",
      odometerKm: 60000,
      acquiredAtMin: state.gameTime - 60 * 1440,
      referencePriceCents: 3000000,
      markedForSale: false,
      saleOffer: null,
    });
  }

  // 4. Fahrer hinzufügen
  if (state.drivers.length === 3) {
    state.drivers.push({
      id: "d4",
      name: "Greta Möller",
      branchId: "b1",
      costPerDayCents: 10000,
      locationCity: "Hamburg",
      status: "free",
      restUntil: null,
      employedDay: 1,
      portraitId: PORTRAIT_IDS[4] || PORTRAIT_IDS[0],
      satisfaction: 72,
      satisfactionReasons: [],
      employmentStatus: "employed",
      attendance: "present",
      consecutiveLowSatisfactionDays: 0,
      workMinutesSinceRest: 0,
      driveMinutesSinceBreak: 0,
    });
  }

  // Disponent einstellen (autonomer Modus)
  const dispatcher = {
    id: "emp_scenario_disp3",
    name: "Stefan Kloth",
    role: "dispatcher",
    branchId: "b1",
    locationCity: "Hamburg",
    employedDay: 1,
    costPerDayCents: 18000,
    hireFeeCents: 0,
    satisfaction: 75,
    satisfactionReasons: [],
    employmentStatus: "employed",
    exitDate: null,
    attendance: "present",
    sickUntil: null,
    vacationUntil: null,
    vacationDaysAvailable: 3,
    activity: "idle",
    consecutiveLowSatisfactionDays: 0,
    assignedVehicleIds: [],
    workMode: "autonomous",
    managementMode: undefined,
    assignedBranchId: "b1",
    capacity: 6,
    lastDecisionMin: null,
    suggestions: [],
    portraitId: PORTRAIT_IDS[5] || PORTRAIT_IDS[0],
    shiftStart: 480,
    shiftEnd: 960,
  };
  state.employees = state.employees || [];
  state.employees.push(dispatcher);

  // Private Auszeit: Tag 4–5 (2 Tage)
  const timeoffStartMin = state.gameTime + 3 * 1440; // Tag 4, 08:00
  const timeoffEndMin = timeoffStartMin + 2 * 1440; // Tag 6, 08:00

  const timeoffAppt = {
    id: "ap_scenario_timeoff",
    type: "scenario_timeoff",
    text: "Private Auszeit — zwei freie Tage",
    appearMin: state.gameTime,
    decisionDeadline: timeoffStartMin,
    startMin: timeoffStartMin,
    endMin: timeoffEndMin,
    status: "accepted",
    costCents: 0,
    effectsApplied: false,
  };
  state.appointments.push(timeoffAppt);

  state.scenario.timeoffStartMin = timeoffStartMin;
  state.scenario.timeoffEndMin = timeoffEndMin;

  // Szenario-Hinweis
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Auszeit geplant — Tag 4 bis Tag 5",
    body:
      "Du hast dir zwei freie Tage genommen (Tag 4–5). Die Vorbereitung an Tag 1–3 entscheidet, " +
      "ob daraus eine echte Auszeit wird.\n\n" +
      "Dein Betrieb:\n" +
      "• 4 Lkw (Zustand 75), 4 Fahrer\n" +
      "• 1 Disponent (Stefan Kloth, autonomer Modus)\n" +
      "• 30.000 € Firmenbank\n\n" +
      "Verbindliche Ziele (7 Tage):\n" +
      "• Private Auszeit vollständig abschließen\n" +
      "• Mindestens 5 Lieferungen während der Auszeit\n" +
      "• Höchstens 3 operative Eingriffe während der Auszeit\n" +
      "• Keine überfällige Freigabe am Stichtag\n" +
      "• Mindestliquidität 20.000 €\n\n" +
      "Tipp: Stelle sicher, dass der Disponent ausreichend Fahrzeuge und Fahrer verwaltet, " +
      "und dass genügend Aufträge angenommen sind, bevor die Auszeit beginnt.",
    gameTime: state.gameTime,
    category: "system", priority: "high",
    dedupKey: "scenario_intro:der_betrieb_laeuft",
  });
}