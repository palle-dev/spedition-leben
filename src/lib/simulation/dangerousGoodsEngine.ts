// Gefahrgut-Engine für FERNWERK – Auftrag 32.
// Verwaltet Gefahrgutprofile, Fahrzeugausstattung, Tankreinigung,
// Preisfaktoren, Validierung und Migration.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.
//
// ADR-Begriffe werden sachlich als Spielregeln verwendet. Dies ist keine
// reale Gefahrgut-Compliance- oder Routenzulassungssoftware.

import {
  getDistance, driveMinutes, fuelCents, tollCents, roundCents,
  LOAD_MIN, UNLOAD_MIN, FUEL_PRICE, TOLL_PER_KM, AVG_SPEED,
  PRICE_BASE_CENTS, PRICE_PER_KM_CENTS, PRICE_PER_TON_CENTS, EXPRESS_FACTOR,
  VEHICLE_PRICE, MONTH_MIN, mulberry32, formatGameTime,
} from "./gameRules.ts";
import { hasAdrBasic, hasAdrTank, hasDgDispatch } from "./trainingEngine.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { bookExpense, registerAsset, getVehicleBookValue } from "./accountingEngine.ts";

const DAY_MIN = 1440;

// ---------- Gefahrgut-Profile (Spielkatalog) ----------

// ADR-Klassen: 3 (entzündbare Flüssigkeiten), 8 (ätzende Stoffe), 9 (verschiedene gefährliche Stoffe)
// Transportarten: "versandstueck" (Versandstücke) | "tank" (Tankbeförderung)
export const DG_PROFILES = [
  {
    id: "dg_paint_north", customer: "Nordlack Werke", product: "Lackprodukte in gesicherten Versandstücken",
    adrClass: "3", transportType: "versandstueck", fromCity: "Hamburg", toCity: "Bremen", tons: 8,
  },
  {
    id: "dg_clean_return", customer: "Weser Industriebedarf", product: "Korrosive Industriereiniger in gesicherten Versandstücken",
    adrClass: "8", transportType: "versandstueck", fromCity: "Bremen", toCity: "Hamburg", tons: 6,
  },
  {
    id: "dg_env_supply", customer: "Hanse Prozesschemie", product: "Definiertes umweltgefährdendes Betriebsmittel in Versandstücken",
    adrClass: "9", transportType: "versandstueck", fromCity: "Hamburg", toCity: "Hannover", tons: 10,
  },
  {
    id: "dg_paint_east", customer: "Elbe Beschichtung", product: "Lackprodukte in gesicherten Versandstücken",
    adrClass: "3", transportType: "versandstueck", fromCity: "Hamburg", toCity: "Berlin", tons: 12,
  },
  {
    id: "dg_clean_east_return", customer: "Hauptstadt Industrieversorgung", product: "Korrosive Industriereiniger in Versandstücken",
    adrClass: "8", transportType: "versandstueck", fromCity: "Berlin", toCity: "Hamburg", tons: 8,
  },
  {
    id: "dg_env_baltic", customer: "Ostsee Betriebsmittel", product: "Definiertes umweltgefährdendes Betriebsmittel in Versandstücken",
    adrClass: "9", transportType: "versandstueck", fromCity: "Rostock", toCity: "Hamburg", tons: 6,
  },
  {
    id: "dg_diesel_weser", customer: "Nordtank Versorgung", product: "Dieselprofil im geeigneten Tankfahrzeug",
    adrClass: "3", transportType: "tank", fromCity: "Hamburg", toCity: "Bremen", tons: 12,
  },
  {
    id: "dg_heating_return", customer: "Weser Energiehandel", product: "Heizölprofil im geeigneten Tankfahrzeug",
    adrClass: "3", transportType: "tank", fromCity: "Bremen", toCity: "Hamburg", tons: 12,
  },
];

export function getDgProfile(profileId) {
  return DG_PROFILES.find(p => p.id === profileId);
}

export function getDgProfileByCustomer(customerName) {
  return DG_PROFILES.find(p => p.customer === customerName);
}

// ---------- Preisfaktoren ----------

export const DG_FACTOR_VERSANDSTUECK = 1.60;
export const DG_FACTOR_TANK = 1.90;

// Abwicklungsgebühren (einmalig pro Sendung beim tatsächlichen Ladungsbeginn)
export const DG_HANDLING_FEE_VERSANDSTUECK_CENTS = 3000;   // 30 €
export const DG_HANDLING_FEE_TANK_CENTS = 6500;            // 65 €

// Tankreinigung nach jeder Tankladung
export const TANK_CLEANING_COST_CENTS = 12000;  // 120 €
export const TANK_CLEANING_DURATION_MIN = 120;  // 2 Spielstunden

// Zusätzliche Lade-/Entladezeit (aktive Fahrerarbeit, keine Pause)
export const DG_EXTRA_LOAD_MIN_VERSANDSTUECK = 15;
export const DG_EXTRA_UNLOAD_MIN_VERSANDSTUECK = 15;
export const DG_EXTRA_LOAD_MIN_TANK = 30;
export const DG_EXTRA_UNLOAD_MIN_TANK = 30;

// ---------- Fahrzeugausstattung ----------

// Versandstück-Ausrüstungspaket für normale Lkw
export const DG_EQUIP_EXTERNAL_COST_CENTS = 250000;   // 2.500 €
export const DG_EQUIP_INTERNAL_MATERIAL_CENTS = 200000; // 2.000 €
export const DG_EQUIP_DURATION_MIN = 240;             // 4 Stunden
export const DG_EQUIP_VALIDITY_DAYS = 360;
export const DG_EQUIP_VALIDITY_MIN = DG_EQUIP_VALIDITY_DAYS * DAY_MIN;

// Spielprüfung zur Erhaltung
export const DG_INSPECTION_EXTERNAL_COST_CENTS = 35000;  // 350 €
export const DG_INSPECTION_INTERNAL_MATERIAL_CENTS = 15000; // 150 €
export const DG_INSPECTION_DURATION_MIN = 240;           // 4 Stunden

// ---------- Tankfahrzeug-Profil ----------

export const TANK_TRUCK = {
  type: "Mineralöl-Tankwagen",
  capacityTons: 18,
  consumptionPer100km: 34,  // 0,34 l/km
  bookValueCents: 6500000,  // 65.000 €
  referencePriceCents: 6500000,
  isTankVehicle: true,
};

// Leasing-Konditionen für Tankwagen
export const TANK_TRUCK_LEASING = {
  downPaymentCents: 0,
  closingFeeCents: 0,
  monthlyRateCents: 195000,    // 1.950 €
  termMonths: 24,
  firstRateAfterDays: 30,
  mileageAllowanceKm: 240000,
  excessMileageCentsPerKm: 10,  // 0,10 €
  buyoutPriceCents: 3250000,    // 32.500 €
};

// ---------- Tankreinigungs-Anbieter ----------

export const TANK_CLEANING_PROVIDERS = [
  { id: "tc_hamburg", name: "Tankreinigung Hamburg GmbH", city: "Hamburg", capacity: 1 },
  { id: "tc_bremen", name: "Weser Tank-Service", city: "Bremen", capacity: 1 },
];

// ---------- Hilfsfunktionen ----------

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// ---------- DG-Preisberechnung ----------

export function computeDgOfferPrice(km, tons, offerType, relFactor, dgProfile) {
  const grundpreis = PRICE_BASE_CENTS + PRICE_PER_KM_CENTS * km + PRICE_PER_TON_CENTS * tons;
  const urgency = offerType === "express" ? EXPRESS_FACTOR : 1.00;
  const dgFactor = dgProfile.transportType === "tank" ? DG_FACTOR_TANK : DG_FACTOR_VERSANDSTUECK;
  return Math.round(grundpreis * relFactor * urgency * dgFactor);
}

// ---------- DG-Markt-Angebotserzeugung ----------

// Erzeugt ein Gefahrgut-Angebot aus einem Profil.
// Wird von marketEngine in regelmäßigen Wellen aufgerufen.
export function makeDgOffer(state, profile, m, rng) {
  const km = getDistance(profile.fromCity, profile.toCity);
  const relFactor = 1.0 + Math.round((rng() * 0.2 - 0.1) * 100) / 100; // 0,90–1,10
  const offerType = "normal";
  const paymentCents = computeDgOfferPrice(km, profile.tons, offerType, relFactor, profile);

  // Zeitfenster: normale Annahmefrist 6–12h, Lieferpuffer 2–6h
  const acceptHours = 6 + rng() * 6;
  const acceptDeadline = m + Math.round(acceptHours * 60);
  const earliestPickup = m + 60 + Math.floor(rng() * 120);
  const opMin = LOAD_MIN + getDgExtraLoadMin(profile) + driveMinutes(km) + UNLOAD_MIN + getDgExtraUnloadMin(profile);
  const bufferMin = Math.round((2 + rng() * 4) * 60);
  const deliveryDeadline = earliestPickup + opMin + bufferMin;

  return {
    id: uid(state, "o"),
    customerId: null,
    customer: profile.customer,
    shipmentId: "S" + (state.idCounter + 1),
    fromCity: profile.fromCity,
    toCity: profile.toCity,
    cargo: profile.product,
    tons: profile.tons,
    paymentCents,
    offerType,
    relationFactor: relFactor,
    publishedAtMin: m,
    acceptDeadlineMin: acceptDeadline,
    earliestPickupMin: earliestPickup,
    latestLoadStartMin: acceptDeadline,
    deliveryDeadlineMin: deliveryDeadline,
    paymentTermsDays: 0,
    paymentDueMin: null,
    status: "offered",
    acceptedAtMin: null, startedAtMin: null, deliveredAtMin: null, paidCents: null,
    acceptedById: null, acceptedByName: null,
    plannedById: null, plannedByName: null,
    feasible: false,
    history: [],
    // Gefahrgut-spezifisch
    isDangerousGoods: true,
    dgProfileId: profile.id,
    dgClass: profile.adrClass,
    dgTransportType: profile.transportType,
  };
}

// ---------- Zusätzliche Handling-Zeiten ----------

export function getDgExtraLoadMin(profile) {
  if (!profile) return 0;
  return profile.transportType === "tank" ? DG_EXTRA_LOAD_MIN_TANK : DG_EXTRA_LOAD_MIN_VERSANDSTUECK;
}

export function getDgExtraUnloadMin(profile) {
  if (!profile) return 0;
  return profile.transportType === "tank" ? DG_EXTRA_UNLOAD_MIN_TANK : DG_EXTRA_UNLOAD_MIN_VERSANDSTUECK;
}

// Liefert erweiterte Lade-/Entladezeiten für einen Auftrag (inkl. DG-Zuschlag)
export function getEffectiveLoadMin(order) {
  let base = LOAD_MIN;
  if (order.isDangerousGoods) {
    const profile = getDgProfile(order.dgProfileId);
    base += getDgExtraLoadMin(profile);
  }
  return base;
}

export function getEffectiveUnloadMin(order) {
  let base = UNLOAD_MIN;
  if (order.isDangerousGoods) {
    const profile = getDgProfile(order.dgProfileId);
    base += getDgExtraUnloadMin(profile);
  }
  return base;
}

// ---------- Fahrzeug-Ausrüstung prüfen ----------

// Prüft, ob ein Fahrzeug für ein DG-Profil ausgerüstet ist.
export function isVehicleEquippedForDg(vehicle, dgProfile, atMin) {
  if (!dgProfile) return { ok: true };
  const equip = vehicle.dgEquipment;
  if (!equip) return { ok: false, reason: "Lkw nicht für dieses Profil ausgerüstet" };
  if (dgProfile.transportType === "tank") {
    if (!vehicle.isTankVehicle) return { ok: false, reason: "Tankaufbau fehlt" };
    // Tankfahrzeug hat eingebaute Ausrüstung; Spielprüfung prüfen
    if (equip.validUntilMin && equip.validUntilMin <= atMin) {
      return { ok: false, reason: "Spielprüfung abgelaufen" };
    }
  } else {
    // Versandstück: benötigt dgEquipment vom Typ "versandstueck"
    if (equip.type !== "versandstueck") return { ok: false, reason: "Lkw nicht für Versandstückprofil ausgerüstet" };
    if (equip.validUntilMin && equip.validUntilMin <= atMin) {
      return { ok: false, reason: "Spielprüfung abgelaufen" };
    }
  }
  return { ok: true };
}

// ---------- Fahrer-Qualifikation prüfen ----------

export function checkDriverDgQualification(state, driverId, dgProfile, tourEndMin) {
  if (!dgProfile) return { ok: true };
  if (!hasAdrBasic(state, driverId)) {
    return { ok: false, reason: "ADR-Basis fehlt", remedy: { type: "course", courseId: "adr_basic" } };
  }
  // ADR-Basis muss bis Tour-Ende gültig sein
  const adrBasic = state.training.qualifications.find(q =>
    q.personId === driverId && q.type === "adr_basic" && q.status === "active"
  );
  if (adrBasic && adrBasic.validUntilMin && adrBasic.validUntilMin <= tourEndMin) {
    return { ok: false, reason: "ADR-Basis läuft vor Tourende ab", remedy: { type: "course", courseId: "adr_refresh" } };
  }
  if (dgProfile.transportType === "tank") {
    if (!hasAdrTank(state, driverId)) {
      return { ok: false, reason: "ADR-Tankaufbau fehlt", remedy: { type: "course", courseId: "adr_tank" } };
    }
    const adrTank = state.training.qualifications.find(q =>
      q.personId === driverId && q.type === "adr_tank" && q.status === "active"
    );
    if (adrTank && adrTank.validUntilMin && adrTank.validUntilMin <= tourEndMin) {
      return { ok: false, reason: "ADR-Tank läuft vor Tourende ab", remedy: { type: "course", courseId: "adr_refresh" } };
    }
  }
  return { ok: true };
}

// ---------- Tank-Reinigungsstatus ----------

// Prüft, ob ein Tankfahrzeug für eine neue Tankladung sauber ist
export function isTankClean(vehicle) {
  if (!vehicle.isTankVehicle) return true;
  return !vehicle.tankState || vehicle.tankState === "clean";
}

// Markiert Tank als unrein nach Entladung
export function markTankDirty(vehicle, profileId) {
  if (!vehicle.isTankVehicle) return;
  vehicle.tankState = "dirty";
  vehicle.tankLastProfileId = profileId || null;
}

// Markiert Tank als sauber nach Reinigung
export function markTankClean(vehicle) {
  vehicle.tankState = "clean";
  vehicle.tankLastProfileId = null;
}

// ---------- DG-Validierung für Tour/Transport ----------

// Vollständige Prüfung vor Annahme/Planung eines DG-Auftrags
export function validateDgTransport(state, order, vehicle, driver, tourEndMin) {
  const errors = [];
  const profile = getDgProfile(order.dgProfileId);
  if (!profile) return { ok: true }; // Kein DG-Auftrag

  // 1. Fahrerqualifikation
  const driverCheck = checkDriverDgQualification(state, driver.id, profile, tourEndMin);
  if (!driverCheck.ok) errors.push(driverCheck);

  // 2. Fahrzeugausstattung
  const equipCheck = isVehicleEquippedForDg(vehicle, profile, tourEndMin);
  if (!equipCheck.ok) errors.push(equipCheck);

  // 3. Nutzlast
  if (profile.transportType === "tank" && !vehicle.isTankVehicle) {
    errors.push({ ok: false, reason: "Tankaufbau fehlt", remedy: { type: "fleet", action: "buy_tank_truck" } });
  }
  if (order.tons > vehicle.capacityTons) {
    errors.push({ ok: false, reason: "Überladung: " + order.tons + " t überschreiten " + vehicle.capacityTons + " t" });
  }

  // 4. Tank sauber (nur für Tank-Profile)
  if (profile.transportType === "tank" && !isTankClean(vehicle)) {
    errors.push({ ok: false, reason: "Tank unrein – Reinigung vor nächster Ladung erforderlich", remedy: { type: "service", action: "tank_cleaning" } });
  }

  // 5. Route verfügbar (alle DG-Template-Relationen nutzen bestehende Städte)
  const routeKm = getDistance(order.fromCity, order.toCity);
  if (routeKm <= 0) {
    errors.push({ ok: false, reason: "Keine gültige Spielroute" });
  }

  return { ok: errors.length === 0, errors };
}

// ---------- DG-Markt-Verfügbarkeit ----------

// Zählt tatsächlich qualifizierte Fahrzeug-/Fahrer-Paarungen für DG-Profile.
// N_P = Versandstück-Paarungen, N_T = Tank-Paarungen.
export function computeDgFleetN(state) {
  const horizon = 72 * 60;
  const maxAvail = state.gameTime + horizon;
  let nP = 0, nT = 0;
  const usedDrivers = new Set();

  for (const v of (state.vehicles || [])) {
    if (v.status === "archived" || v.condition < 20) continue;
    const equip = v.dgEquipment;
    if (!equip) continue;
    // Spielprüfung gültig?
    if (equip.validUntilMin && equip.validUntilMin <= state.gameTime) continue;

    for (const d of (state.drivers || [])) {
      if (usedDrivers.has(d.id)) continue;
      if (d.employmentStatus !== "employed" || d.attendance === "released") continue;
      if (d.locationCity !== v.locationCity) continue;

      const hasBasic = hasAdrBasic(state, d.id);
      if (!hasBasic) continue;

      if (v.isTankVehicle && hasAdrTank(state, d.id) && isTankClean(v)) {
        nT++;
        usedDrivers.add(d.id);
        break;
      } else if (!v.isTankVehicle && equip.type === "versandstueck") {
        nP++;
        usedDrivers.add(d.id);
        break;
      }
    }
  }
  return { nP, nT };
}

// ---------- Tankreinigung buchen ----------

export function bookTankCleaning(state, vehicleId, providerId) {
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) throw new Error("Fahrzeug nicht gefunden.");
  if (!vehicle.isTankVehicle) throw new Error("Nur Tankfahrzeuge benötigen Tankreinigung.");
  if (isTankClean(vehicle)) throw new Error("Tank ist bereits sauber.");

  const provider = TANK_CLEANING_PROVIDERS.find(p => p.id === providerId);
  if (!provider) throw new Error("Reinigungsanbieter nicht gefunden.");
  if (vehicle.locationCity !== provider.city) {
    throw new Error("Fahrzeug muss am Anbieterstandort (" + provider.city + ") sein.");
  }

  // Prüfe Anbieterkapazität (nur ein Tankplatz je Anbieter)
  const existing = (state.dg?.cleaningJobs || []).filter(j =>
    j.providerId === providerId && j.status === "in_progress"
  );
  if (existing.length >= provider.capacity) {
    throw new Error("Anbieter hat keinen freien Tankplatz. Wartezeit erforderlich.");
  }

  if (state.company.accountCents < TANK_CLEANING_COST_CENTS) {
    throw new Error("Firmenkonto reicht für Tankreinigung (" + (TANK_CLEANING_COST_CENTS / 100) + " €) nicht aus.");
  }

  // Reinigungsauftrag erstellen
  const job = {
    id: uid(state, "tc"),
    vehicleId,
    providerId,
    providerName: provider.name,
    city: provider.city,
    costCents: TANK_CLEANING_COST_CENTS,
    startMin: state.gameTime,
    endMin: state.gameTime + TANK_CLEANING_DURATION_MIN,
    status: "in_progress",
  };

  if (!state.dg) state.dg = { cleaningJobs: [], contracts: [] };
  if (!state.dg.cleaningJobs) state.dg.cleaningJobs = [];
  state.dg.cleaningJobs.push(job);

  // Kosten buchen
  bookExpense(state, {
    expenseAccount: "5130", // Reinigung und Werkstatt
    liabilityAccount: "1000",
    amountCents: TANK_CLEANING_COST_CENTS,
    text: "Tankreinigung: " + vehicle.id,
    type: "tank_cleaning",
    gameTime: state.gameTime,
    refId: job.id,
  });

  // Fahrzeug blockieren während Reinigung
  vehicle.status = "maintenance";
  vehicle.maintenanceUntil = job.endMin;
  vehicle.maintenanceReason = "tank_cleaning";

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Tankreinigung gebucht",
    body: `Tankreinigung für ${vehicle.id} bei ${provider.name} (${provider.city}) gebucht.\n\nKosten: ${(TANK_CLEANING_COST_CENTS / 100).toFixed(0)} €\nDauer: 2 Stunden\nFahrzeug ab ${formatGameTime(job.endMin)} wieder verfügbar.`,
    gameTime: state.gameTime, category: "operations", priority: "normal",
    linkedRefs: { type: "vehicle", id: vehicleId },
    dedupKey: `tank_cleaning_booked:${job.id}`,
  });

  return { ok: true, jobId: job.id, endMin: job.endMin };
}

// Wird von simulationEngine bei Reinigungsende aufgerufen
export function processTankCleaning(state, m, log) {
  if (!state.dg?.cleaningJobs) return;
  for (const job of state.dg.cleaningJobs) {
    if (job.status !== "in_progress") continue;
    if (job.endMin !== m) continue;
    job.status = "completed";
    job.completedAtMin = m;
    const vehicle = state.vehicles.find(v => v.id === job.vehicleId);
    if (vehicle) {
      markTankClean(vehicle);
      vehicle.status = "free";
      vehicle.maintenanceUntil = null;
      vehicle.maintenanceReason = null;
    }
    log.push({ type: "tank_cleaning_completed", job: job.id, vehicle: job.vehicleId, atMin: m });
    pushEvent(state, {
      type: "tank_cleaning_completed",
      gameTime: m, isSystem: true,
      vehicleId: job.vehicleId,
      details: { provider: job.providerName, city: job.city, costCents: job.costCents },
      dedupKey: "tank_cleaning_done:" + job.id,
    });
  }
}

// Liefere Reinigungs-Ereigniszeiten für simulationEngine
export function getTankCleaningEventTimes(state, t, maxMin) {
  const times = [];
  for (const job of (state.dg?.cleaningJobs || [])) {
    if (job.status === "in_progress" && job.endMin > t && job.endMin <= maxMin) {
      times.push(job.endMin);
    }
  }
  return times;
}

// ---------- Fahrzeug-Ausrüstung (Versandstück-Paket) ----------

export function equipVehicleExternal(state, vehicleId) {
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) throw new Error("Fahrzeug nicht gefunden.");
  if (vehicle.isTankVehicle) throw new Error("Tankfahrzeuge benötigen kein Versandstück-Paket.");
  if (vehicle.dgEquipment) throw new Error("Fahrzeug bereits ausgerüstet.");
  if (vehicle.status !== "free") throw new Error("Fahrzeug muss frei sein.");

  if (state.company.accountCents < DG_EQUIP_EXTERNAL_COST_CENTS) {
    throw new Error("Firmenkonto reicht für Ausrüstung (" + (DG_EQUIP_EXTERNAL_COST_CENTS / 100) + " €) nicht aus.");
  }

  // Externe Ausrüstung: 4 Stunden am Anbieterstandort (Hamburg)
  if (vehicle.locationCity !== "Hamburg") {
    throw new Error("Externe Ausrüstung nur in Hamburg möglich. Fahrzeug zuerst überführen.");
  }

  // Kosten buchen (Anlageverbesserung)
  bookExpense(state, {
    expenseAccount: "1200", // Fahrzeugkonto (Anlageverbesserung)
    liabilityAccount: "1000",
    amountCents: DG_EQUIP_EXTERNAL_COST_CENTS,
    text: "Gefahrgut-Ausrüstung (extern): " + vehicle.id,
    type: "dg_equipment",
    gameTime: state.gameTime,
    refId: vehicleId,
  });

  // Buchwert erhöhen
  vehicle.bookValueCents = (vehicle.bookValueCents || 0) + DG_EQUIP_EXTERNAL_COST_CENTS;

  // Fahrzeug blockieren
  vehicle.status = "maintenance";
  vehicle.maintenanceUntil = state.gameTime + DG_EQUIP_DURATION_MIN;
  vehicle.maintenanceReason = "dg_equipment_external";

  // Ausrüstung erst nach Abschluss aktivieren
  if (!state.dg) state.dg = { cleaningJobs: [], contracts: [] };
  if (!state.dg.equipJobs) state.dg.equipJobs = [];
  const job = {
    id: uid(state, "dg_eq"),
    vehicleId,
    type: "external",
    startMin: state.gameTime,
    endMin: state.gameTime + DG_EQUIP_DURATION_MIN,
    status: "in_progress",
  };
  state.dg.equipJobs.push(job);

  return { ok: true, jobId: job.id, endMin: job.endMin, costCents: DG_EQUIP_EXTERNAL_COST_CENTS };
}

export function equipVehicleInternal(state, vehicleId, mechanicId) {
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) throw new Error("Fahrzeug nicht gefunden.");
  if (vehicle.isTankVehicle) throw new Error("Tankfahrzeuge benötigen kein Versandstück-Paket.");
  if (vehicle.dgEquipment) throw new Error("Fahrzeug bereits ausgerüstet.");
  if (vehicle.status !== "free") throw new Error("Fahrzeug muss frei sein.");

  // Mechaniker mit dg_vehicle_tech prüfen
  const mechanic = (state.employees || []).find(e => e.id === mechanicId);
  if (!mechanic) throw new Error("Mechaniker nicht gefunden.");
  if (mechanic.role !== "mechanic") throw new Error("Nur Werkstattmitarbeiter können ausrüsten.");
  // dg_vehicle_tech Qualifikation prüfen
  const hasTech = state.training.qualifications.some(q =>
    q.personId === mechanicId && q.type === "dg_vehicle_tech" && q.status === "active"
  );
  if (!hasTech) throw new Error("Mechaniker benötigt Qualifikation dg_vehicle_tech.");

  // Werkstattplatz prüfen
  const workshop = state.workshop;
  if (workshop && workshop.slots) {
    const freeSlots = workshop.slots.filter(s => s.status === "free");
    if (freeSlots.length === 0) throw new Error("Kein freier Werkstattplatz verfügbar.");
  }

  if (state.company.accountCents < DG_EQUIP_INTERNAL_MATERIAL_CENTS) {
    throw new Error("Firmenkonto reicht für Material (" + (DG_EQUIP_INTERNAL_MATERIAL_CENTS / 100) + " €) nicht aus.");
  }

  // Kosten buchen
  bookExpense(state, {
    expenseAccount: "1200",
    liabilityAccount: "1000",
    amountCents: DG_EQUIP_INTERNAL_MATERIAL_CENTS,
    text: "Gefahrgut-Ausrüstung (intern): " + vehicle.id,
    type: "dg_equipment",
    gameTime: state.gameTime,
    refId: vehicleId,
  });

  vehicle.bookValueCents = (vehicle.bookValueCents || 0) + DG_EQUIP_INTERNAL_MATERIAL_CENTS;
  vehicle.status = "maintenance";
  vehicle.maintenanceUntil = state.gameTime + DG_EQUIP_DURATION_MIN;
  vehicle.maintenanceReason = "dg_equipment_internal";

  if (!state.dg) state.dg = { cleaningJobs: [], contracts: [] };
  if (!state.dg.equipJobs) state.dg.equipJobs = [];
  const job = {
    id: uid(state, "dg_eq"),
    vehicleId,
    type: "internal",
    mechanicId,
    startMin: state.gameTime,
    endMin: state.gameTime + DG_EQUIP_DURATION_MIN,
    status: "in_progress",
  };
  state.dg.equipJobs.push(job);

  return { ok: true, jobId: job.id, endMin: job.endMin, costCents: DG_EQUIP_INTERNAL_MATERIAL_CENTS };
}

// Wird von simulationEngine bei Ausrüstungsende aufgerufen
export function processEquipmentJobs(state, m, log) {
  if (!state.dg?.equipJobs) return;
  for (const job of state.dg.equipJobs) {
    if (job.status !== "in_progress") continue;
    if (job.endMin !== m) continue;
    job.status = "completed";
    job.completedAtMin = m;
    const vehicle = state.vehicles.find(v => v.id === job.vehicleId);
    if (vehicle) {
      vehicle.dgEquipment = {
        type: "versandstueck",
        acquiredAtMin: m,
        validUntilMin: m + DG_EQUIP_VALIDITY_MIN,
        source: job.type,
      };
      vehicle.status = "free";
      vehicle.maintenanceUntil = null;
      vehicle.maintenanceReason = null;
    }
    log.push({ type: "dg_equipment_completed", job: job.id, vehicle: job.vehicleId, atMin: m });
    pushEvent(state, {
      type: "dg_equipment_completed",
      gameTime: m, isSystem: true,
      vehicleId: job.vehicleId,
      details: { type: job.type, validUntilMin: m + DG_EQUIP_VALIDITY_MIN },
      dedupKey: "dg_equip_done:" + job.id,
    });
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Gefahrgut-Ausrüstung abgeschlossen",
      body: `Fahrzeug ${job.vehicleId} wurde mit dem Versandstück-Ausrüstungspaket ausgestattet.\n\nSpielprüfung gültig bis ${formatGameTime(m + DG_EQUIP_VALIDITY_MIN)}.\nVersandstückprofile (Klassen 3, 8, 9) sind nun möglich.`,
      gameTime: m, category: "operations", priority: "high",
      linkedRefs: { type: "vehicle", id: job.vehicleId },
      dedupKey: `dg_equip_done_msg:${job.id}`,
    });
  }
}

export function getEquipmentJobEventTimes(state, t, maxMin) {
  const times = [];
  for (const job of (state.dg?.equipJobs || [])) {
    if (job.status === "in_progress" && job.endMin > t && job.endMin <= maxMin) {
      times.push(job.endMin);
    }
  }
  return times;
}

// ---------- Spielprüfung (Inspektion) ----------

export function inspectDgEquipmentExternal(state, vehicleId) {
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  if (!vehicle) throw new Error("Fahrzeug nicht gefunden.");
  if (!vehicle.dgEquipment) throw new Error("Fahrzeug hat keine DG-Ausrüstung.");
  if (vehicle.status !== "free") throw new Error("Fahrzeug muss frei sein.");
  if (vehicle.locationCity !== "Hamburg") {
    throw new Error("Externe Prüfung nur in Hamburg möglich.");
  }
  if (state.company.accountCents < DG_INSPECTION_EXTERNAL_COST_CENTS) {
    throw new Error("Firmenkonto reicht für Prüfung (" + (DG_INSPECTION_EXTERNAL_COST_CENTS / 100) + " €) nicht aus.");
  }

  bookExpense(state, {
    expenseAccount: "5300", // Wartung
    liabilityAccount: "1000",
    amountCents: DG_INSPECTION_EXTERNAL_COST_CENTS,
    text: "Gefahrgut-Spielprüfung (extern): " + vehicle.id,
    type: "dg_inspection",
    gameTime: state.gameTime,
    refId: vehicleId,
  });

  vehicle.status = "maintenance";
  vehicle.maintenanceUntil = state.gameTime + DG_INSPECTION_DURATION_MIN;
  vehicle.maintenanceReason = "dg_inspection_external";

  if (!state.dg) state.dg = { cleaningJobs: [], contracts: [] };
  if (!state.dg.inspectionJobs) state.dg.inspectionJobs = [];
  const job = {
    id: uid(state, "dg_insp"),
    vehicleId,
    type: "external",
    startMin: state.gameTime,
    endMin: state.gameTime + DG_INSPECTION_DURATION_MIN,
    status: "in_progress",
  };
  state.dg.inspectionJobs.push(job);

  return { ok: true, jobId: job.id, endMin: job.endMin };
}

export function processInspectionJobs(state, m, log) {
  if (!state.dg?.inspectionJobs) return;
  for (const job of state.dg.inspectionJobs) {
    if (job.status !== "in_progress") continue;
    if (job.endMin !== m) continue;
    job.status = "completed";
    job.completedAtMin = m;
    const vehicle = state.vehicles.find(v => v.id === job.vehicleId);
    if (vehicle && vehicle.dgEquipment) {
      vehicle.dgEquipment.validUntilMin = m + DG_EQUIP_VALIDITY_MIN;
      vehicle.status = "free";
      vehicle.maintenanceUntil = null;
      vehicle.maintenanceReason = null;
    }
    log.push({ type: "dg_inspection_completed", job: job.id, vehicle: job.vehicleId, atMin: m });
  }
}

export function getInspectionJobEventTimes(state, t, maxMin) {
  const times = [];
  for (const job of (state.dg?.inspectionJobs || [])) {
    if (job.status === "in_progress" && job.endMin > t && job.endMin <= maxMin) {
      times.push(job.endMin);
    }
  }
  return times;
}

// Prüft, ob eine DG-Spielprüfung bald fällig ist
export function getDgInspectionDueVehicles(state) {
  const now = state.gameTime;
  const warnThreshold = 30 * DAY_MIN;
  return (state.vehicles || []).filter(v => {
    if (!v.dgEquipment) return false;
    if (!v.dgEquipment.validUntilMin) return false;
    const daysLeft = Math.floor((v.dgEquipment.validUntilMin - now) / DAY_MIN);
    return daysLeft <= 30 && daysLeft >= 0;
  }).map(v => ({
    vehicleId: v.id,
    validUntilMin: v.dgEquipment.validUntilMin,
    daysLeft: Math.floor((v.dgEquipment.validUntilMin - now) / DAY_MIN),
  }));
}

// ---------- Tankfahrzeug Kauf/Leasing ----------

export function buyTankTruck(state) {
  if (state.openCosts.some(o => o.account === "company")) {
    throw new Error("Es gibt offene betriebliche Kosten. Bitte bezahle diese zuerst.");
  }
  if (state.company.accountCents < TANK_TRUCK.bookValueCents) {
    throw new Error("Firmenkonto reicht für Tankwagen-Kauf (" + (TANK_TRUCK.bookValueCents / 100) + " €) nicht aus.");
  }

  bookExpense(state, {
    expenseAccount: "1200",
    liabilityAccount: "1000",
    amountCents: TANK_TRUCK.bookValueCents,
    text: "Tankwagen-Kauf",
    type: "tank_truck_purchase",
    gameTime: state.gameTime,
  });

  const v = {
    id: uid(state, "v"),
    branchId: "b1",
    type: TANK_TRUCK.type,
    capacityTons: TANK_TRUCK.capacityTons,
    consumptionPer100km: TANK_TRUCK.consumptionPer100km,
    bookValueCents: TANK_TRUCK.bookValueCents,
    condition: 100,
    locationCity: "Hamburg",
    status: "free",
    tripId: null,
    maintenanceUntil: null,
    ownership_type: "owned",
    odometerKm: 0,
    acquiredAtMin: state.gameTime,
    referencePriceCents: TANK_TRUCK.referencePriceCents,
    markedForSale: false,
    saleOffer: null,
    isTankVehicle: true,
    tankState: "clean",
    dgEquipment: {
      type: "tank",
      acquiredAtMin: state.gameTime,
      validUntilMin: state.gameTime + DG_EQUIP_VALIDITY_MIN,
      source: "purchase",
    },
  };
  state.vehicles.push(v);

  registerAsset(state, {
    vehicleId: v.id,
    account: "1200",
    name: "Tankwagen " + String(parseInt(String(v.id).replace(/[^0-9]/g, ""), 10) || 1).padStart(2, "0"),
    acquisitionCostCents: TANK_TRUCK.bookValueCents,
    acquiredAtMin: state.gameTime,
  });

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Tankwagen gekauft",
    body: `Ein Mineralöl-Tankwagen wurde für ${(TANK_TRUCK.bookValueCents / 100).toFixed(0)} € gekauft.\n\nNutzlast: ${TANK_TRUCK.capacityTons} t\nVerbrauch: 0,34 l/km\nSpielprüfung gültig bis ${formatGameTime(state.gameTime + DG_EQUIP_VALIDITY_MIN)}.\n\nHinweis: Keine Paletten-/Versandstückfracht möglich. Fahrerqualifikation nicht enthalten.`,
    gameTime: state.gameTime, category: "financing", priority: "high",
    linkedRefs: { type: "vehicle", id: v.id },
    dedupKey: `tank_truck_bought:${v.id}`,
  });

  return { ok: true, vehicleId: v.id };
}

// ---------- DG-Abwicklungsgebühr beim Ladungsbeginn ----------

// Wird beim tatsächlichen Start einer DG-Tour aufgerufen (Ladungsbeginn)
export function chargeDgHandlingFee(state, order, tripId) {
  if (!order.isDangerousGoods) return null;
  const profile = getDgProfile(order.dgProfileId);
  if (!profile) return null;
  const fee = profile.transportType === "tank" ? DG_HANDLING_FEE_TANK_CENTS : DG_HANDLING_FEE_VERSANDSTUECK_CENTS;

  bookExpense(state, {
    expenseAccount: "5130",
    liabilityAccount: "1000",
    amountCents: fee,
    text: "Gefahrgut-Abwicklung: " + order.customer,
    type: "dg_handling",
    gameTime: state.gameTime,
    refId: tripId,
  });

  return { feeCents: fee, transportType: profile.transportType };
}

// ---------- DG-Lieferung abschließen ----------

// Wird nach einer pünktlichen DG-Lieferung aufgerufen für Statistiken
export function recordDgDelivery(state, order, onTime, m) {
  if (!order.isDangerousGoods) return null;
  if (!state.stats) state.stats = {};
  state.stats.dgDeliveries = (state.stats.dgDeliveries || 0) + 1;
  if (onTime) state.stats.dgTimelyDeliveries = (state.stats.dgTimelyDeliveries || 0) + 1;

  const profile = getDgProfile(order.dgProfileId);
  if (profile?.transportType === "tank") {
    state.stats.tankDeliveries = (state.stats.tankDeliveries || 0) + 1;
  }

  // Tank nach Entladung als unrein markieren
  if (profile?.transportType === "tank") {
    const trip = state.trips.find(t => t.orderId === order.id);
    if (trip) {
      const vehicle = state.vehicles.find(v => v.id === trip.vehicleId);
      if (vehicle) markTankDirty(vehicle, order.dgProfileId);
    }
  }

  return { profile };
}

// ---------- DG-Status für UI ----------

export function getDgStatus(state) {
  const { nP, nT } = computeDgFleetN(state);
  const equippedVehicles = (state.vehicles || []).filter(v => v.dgEquipment && (!v.dgEquipment.validUntilMin || v.dgEquipment.validUntilMin > state.gameTime));
  const tankVehicles = (state.vehicles || []).filter(v => v.isTankVehicle);
  const dirtyTanks = (state.vehicles || []).filter(v => v.isTankVehicle && !isTankClean(v));
  const inspectionDue = getDgInspectionDueVehicles(state);
  const dgDrivers = (state.drivers || []).filter(d => hasAdrBasic(state, d.id));
  const tankDrivers = (state.drivers || []).filter(d => hasAdrTank(state, d.id));
  const dgDispatchers = (state.employees || []).filter(e => hasDgDispatch(state, e.id));

  const openDgOffers = (state.orders || []).filter(o => o.isDangerousGoods && o.status === "offered");
  const versandstueckOffers = openDgOffers.filter(o => o.dgTransportType === "versandstueck");
  const tankOffers = openDgOffers.filter(o => o.dgTransportType === "tank");

  return {
    fleetN: { nP, nT },
    equippedVehicles: equippedVehicles.length,
    tankVehicles: tankVehicles.length,
    dirtyTanks: dirtyTanks.length,
    inspectionDue,
    dgDrivers: dgDrivers.length,
    tankDrivers: tankDrivers.length,
    dgDispatchers: dgDispatchers.length,
    openDgOffers: openDgOffers.length,
    versandstueckOffers: versandstueckOffers.length,
    tankOffers: tankOffers.length,
    targetVersandstueckOffers: nP > 0 ? Math.max(4, 4 * nP) : 2,
    targetTankOffers: nT > 0 ? Math.max(3, 4 * nT) : 1,
  };
}

// ---------- DG-Befehlsbehandlung (Auftrag 32) ----------
// Zentrale Handler-Funktion, um simulationEngine schlank zu halten.
// ensureNotBlocked wird hier repliziert (prüft aktive private Termine).

function isPlayerBlocked(state) {
  return (state.appointments || []).some(a => a.status === "active");
}

export function handleDgCommand(state, command, p) {
  switch (command) {
    case "getDgStatus":
      return { ok: true, ...getDgStatus(state) };
    case "getDgProfiles":
      return { ok: true, profiles: DG_PROFILES };
    case "equipVehicleExternal":
      if (isPlayerBlocked(state)) throw new Error("Du bist derzeit beschäftigt.");
      return equipVehicleExternal(state, p.vehicleId);
    case "equipVehicleInternal":
      if (isPlayerBlocked(state)) throw new Error("Du bist derzeit beschäftigt.");
      return equipVehicleInternal(state, p.vehicleId, p.mechanicId);
    case "inspectDgEquipmentExternal":
      if (isPlayerBlocked(state)) throw new Error("Du bist derzeit beschäftigt.");
      return inspectDgEquipmentExternal(state, p.vehicleId);
    case "bookTankCleaning":
      if (isPlayerBlocked(state)) throw new Error("Du bist derzeit beschäftigt.");
      return bookTankCleaning(state, p.vehicleId, p.providerId);
    case "buyTankTruck":
      if (isPlayerBlocked(state)) throw new Error("Du bist derzeit beschäftigt.");
      return buyTankTruck(state);
    case "getTankCleaningProviders":
      return { ok: true, providers: TANK_CLEANING_PROVIDERS, costCents: TANK_CLEANING_COST_CENTS };
    case "getDgInspectionDue":
      return { ok: true, vehicles: getDgInspectionDueVehicles(state) };
    default:
      return null;
  }
}

// ---------- Migration ----------

export function migrateDangerousGoods(state) {
  if (!state.dg) {
    state.dg = {
      cleaningJobs: [],
      equipJobs: [],
      inspectionJobs: [],
      contracts: [],
    };
  }
  if (!state.dg.cleaningJobs) state.dg.cleaningJobs = [];
  if (!state.dg.equipJobs) state.dg.equipJobs = [];
  if (!state.dg.inspectionJobs) state.dg.inspectionJobs = [];
  if (!state.dg.contracts) state.dg.contracts = [];

  // Fahrzeug-Migration: dgEquipment-Feld ergänzen
  for (const v of (state.vehicles || [])) {
    if (v.dgEquipment === undefined) v.dgEquipment = null;
    if (v.isTankVehicle === undefined) v.isTankVehicle = false;
    if (v.tankState === undefined) v.tankState = v.isTankVehicle ? "clean" : null;
  }

  // Statistik-Felder ergänzen
  if (!state.stats) state.stats = {};
  if (state.stats.dgDeliveries === undefined) state.stats.dgDeliveries = 0;
  if (state.stats.dgTimelyDeliveries === undefined) state.stats.dgTimelyDeliveries = 0;
  if (state.stats.tankDeliveries === undefined) state.stats.tankDeliveries = 0;
}