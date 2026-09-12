// Initialzustand-Erzeugung für "Spedition & Leben".
// Aus simulationEngine.ts extrahiert, um die Dateigröße zu reduzieren.
// Trennung: initialStateEngine (Startzustand) · simulationEngine (Regeln/Zustand).

import {
  STANDARD_TRUCK, VEHICLE_PRICE, DRIVER_COST_PER_DAY, BRANCH_COST_PER_DAY,
  PORTRAIT_IDS,
} from "./gameRules.ts";
import { ACHIEVEMENTS } from "./achievementCatalog.ts";
import {
  initAccounting, book, registerAsset,
} from "./accountingEngine.ts";
import { initMail } from "./mailEngine.ts";
import { migrateMarket, fillInitialMarket } from "./marketEngine.ts";
import { REWARD_SLOTS } from "./rewardEngine.ts";
import { migrateWorkshop } from "./workshopEngine.ts";
import {
  migratePersonnelMarket, initStartApplicants,
} from "./personnelMarketEngine.ts";
import { initInvestment } from "./investmentEngine.ts";

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// ---------- Initialzustand ----------
function initialOffers(state) {
  const mk = (customer, fromCity, toCity, cargo, tons, paymentEur, acceptMin, deliveryMin) => ({
    id: uid(state, "o"), customer, fromCity, toCity, cargo, tons,
    paymentCents: paymentEur * 100, acceptDeadlineMin: acceptMin, deliveryDeadlineMin: deliveryMin,
    status: "offered", acceptedAtMin: null, startedAtMin: null, deliveredAtMin: null, paidCents: null,
    offerType: "normal", customerId: null, shipmentId: null,
    earliestPickupMin: 480, latestLoadStartMin: acceptMin,
    publishedAtMin: 480, paymentTermsDays: 0, paymentDueMin: null,
    relationFactor: 1.0, feasible: true, source: "initial",
    acceptedById: null, acceptedByName: null,
    plannedById: null, plannedByName: null, history: [],
  });
  return [
    mk("Hanse Handelskontor", "Hamburg", "Bremen", "Stückgut", 8, 650, 600, 1080),       // Tutorial
    mk("Norddeutsche Feinkost", "Hamburg", "Hannover", "Lebensmittel", 10, 900, 720, 1320),
    mk("Ostsee Frischlief", "Hamburg", "Kiel", "Getränke", 6, 450, 660, 960),
    mk("Weser Handel", "Bremen", "Hamburg", "Möbel", 10, 700, 840, 2160),                 // Rückladung
    mk("Hauptstadt-Express", "Hamburg", "Berlin", "Elektronik", 12, 1800, 960, 2520),
    mk("Ostsee-Vertrieb", "Rostock", "Hamburg", "Textilien", 8, 1200, 1080, 2640),
    mk("Elbe-Logistik", "Hamburg", "Magdeburg", "Bauteile", 9, 1100, 900, 1920),
    mk("Schleswig-Spedition", "Lübeck", "Hamburg", "Verpackungsmaterial", 7, 600, 780, 1920)
  ];
}

export function createInitialState(names) {
  const p = names || {};
  const state = {
    gameTime: 480, // Tag 1, 08:00
    rngSeed: 1234567,
    idCounter: 100,
    company: { name: p.companyName || "Nordlicht Transport GmbH", accountCents: 0 },
    private: {
      playerName: p.playerName || "Spieler",
      partnerName: p.partnerName || "Mara",
      accountCents: 750000,
      stress: 30, happiness: 60, relationship: 60,
      residence: "Wohnung in Hamburg"
    },
    branches: [{ id: "b1", name: "Hauptniederlassung Hamburg", city: "Hamburg", costPerDayCents: BRANCH_COST_PER_DAY }],
    vehicles: [1, 2, 3].map(i => ({
      id: "v" + i, branchId: "b1", type: STANDARD_TRUCK.type, capacityTons: 12,
      consumptionPer100km: 28, bookValueCents: STANDARD_TRUCK.bookValueCents,
      condition: 85, locationCity: "Hamburg", status: "free", tripId: null, maintenanceUntil: null,
      ownership_type: "owned", odometerKm: 0, acquiredAtMin: 480, referencePriceCents: VEHICLE_PRICE,
      markedForSale: false, saleOffer: null,
    })),
    drivers: [
      { id: "d1", name: "Klaus Werner", branchId: "b1", costPerDayCents: DRIVER_COST_PER_DAY, locationCity: "Hamburg", status: "free", restUntil: null, employedDay: 1 },
      { id: "d2", name: "Petra Süß", branchId: "b1", costPerDayCents: DRIVER_COST_PER_DAY, locationCity: "Hamburg", status: "free", restUntil: null, employedDay: 1 },
      { id: "d3", name: "Helmut Fuchs", branchId: "b1", costPerDayCents: DRIVER_COST_PER_DAY, locationCity: "Hamburg", status: "free", restUntil: null, employedDay: 1 }
    ],
    orders: [],
    trips: [],
    tours: [],
    appointments: [],
    bookings: [],
    openCosts: [],
    milestones: [
      { id: "m1", name: "Erste Lieferung", achieved: false, achievedAtMin: null },
      { id: "m2", name: "Zehn rechtzeitige Lieferungen", achieved: false, achievedAtMin: null },
      { id: "m3", name: "Vier eigene Lkw", achieved: false, achievedAtMin: null }
    ],
    achievements: ACHIEVEMENTS.map(a => ({ id: a.id, unlocked: false, unlockedAtMin: null, seen: false })),
    xp: 0,
    goals: [],
    processedActions: {},
    tutorial: { active: true, step: 0 },
    lastDailyAccountingMin: 0,
    stats: {
      timelyDeliveries: 0, totalDeliveries: 0, consecutiveTimely: 0, cancelledOrders: 0,
      totalRevenueCents: 0, maintainedVehicleIds: [], leisureCount: 0, leisureTypes: [],
      promisesKept: 0, consecutiveBalanceDays: 0, lastBalanceDay: 0,
      hobbyCounts: {}, friendshipQualities: {}, ownershipCount: 0,
      homeFurnishingTypes: [], hasHome: false, hasCar: false,
      hasSportCar: false, hasBoat: false, hasVilla: false, tripsCompleted: 0,
    },
    employees: [],
    availableApplicants: [],
    hiredApplicantNames: [],
    portraitAssignments: {},
    leisureUsedDay: 0,
    tutorialInviteCreated: false,
    lastInvitationTemplateId: null
  };
  // Porträts für bestehende Fahrer zuordnen
  let pIdx = 0;
  for (const d of state.drivers) {
    d.portraitId = PORTRAIT_IDS[pIdx++] || PORTRAIT_IDS[0];
    d.satisfaction = 70;
    d.satisfactionReasons = [];
    d.employmentStatus = "employed";
    d.attendance = "present";
    d.consecutiveLowSatisfactionDays = 0;
    d.workMinutesSinceRest = 0;
    d.driveMinutesSinceBreak = 0;
  }
  state.orders = initialOffers(state);
  // Markt-Engine initialisieren und auf Zielbestand auffüllen (Auftrag 19)
  migrateMarket(state);
  fillInitialMarket(state);
  // Buchhaltung initialisieren und Eröffnungsbuchung erstellen.
  // accountCents startet bei 0 – die Eröffnungsbuchung setzt es auf den Startwert.
  initAccounting(state);
  const _assetCents = state.vehicles.reduce((s, v) => s + v.bookValueCents, 0);
  book(state, "opening", {
    bankCents: 7500000,
    assetCents: _assetCents,
    liabilityCents: 0,
  });
  for (const v of state.vehicles) {
    registerAsset(state, {
      vehicleId: v.id, account: "1200",
      name: "Lkw " + String(parseInt(String(v.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0"),
      acquisitionCostCents: v.bookValueCents, acquiredAtMin: state.gameTime,
    });
  }
  // Postfach initialisieren
  initMail(state);
  // Abwesenheiten und Dienstleistungen initialisieren (Auftrag 25)
  state.absences = { vacationRequests: [], sicknesses: [] };
  state.serviceContracts = [];
  for (const b of state.branches) {
    b.cleanliness = 85;
    b.lastCleaningDay = 0;
  }
  // Belohnungen und Anschaffungen initialisieren (Auftrag 26)
  state.private.rewards = { claims: {}, cosmetics: {}, vouchers: [] };
  for (const slot of REWARD_SLOTS) state.private.rewards.cosmetics[slot] = null;
  state.private.purchases = { items: [], activeHomeId: null };
  // Werkstatt initialisieren (Auftrag 27)
  state.workshop = { slots: [], maintenanceOrders: [], automationProfile: null };
  migrateWorkshop(state);
  // Personalmarkt initialisieren und Start-Pool erzeugen (Auftrag 29)
  migratePersonnelMarket(state);
  initStartApplicants(state);
  // Investment-Markt und Depots initialisieren (Auftrag 33)
  initInvestment(state);
  return { state };
}