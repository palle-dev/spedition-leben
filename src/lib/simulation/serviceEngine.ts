// Dienstleistungs-Engine für FERNWERK (Auftrag 25).
// Verwaltet externe Dienstleistungen: Reinigung, Wartung, Abschleppen, Fremdpersonal, Miete, externe Buchhaltung.
// Reine Logik – keine Auth, keine Speicherung. Wird von simulationEngine importiert.

import {
  dayOf, formatGameTime, mulberry32, getDistance, driveMinutes,
  SERVICE_START_MIN, SERVICE_END_MIN, MAINTENANCE_COST, MAINTENANCE_DURATION,
  STRESS_MAINT_THRESHOLD, MAINT_STRESS_FACTOR,
} from "./gameRules.ts";
import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { applyCleaningToBreakArea } from "./siteExpansionEngine.ts";

const DAY_MIN = 1440;

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// ---------- Dienstleister-Katalog ----------

export const SERVICE_PROVIDERS = [
  // Reinigung
  { id: "sp_clean_01", name: "Nordclean GmbH", type: "cleaning", homeCity: "Hamburg",
    capacityPerDay: 8, pricePerUnitCents: 2500, description: "Reinigungsservice für Standorte" },
  { id: "sp_clean_02", name: "Frisch & Sauber KG", type: "cleaning", homeCity: "Bremen",
    capacityPerDay: 6, pricePerUnitCents: 2500, description: "Reinigungsservice für Standorte" },
  // Wartung
  { id: "sp_maint_01", name: "Werkstatt Nord GmbH", type: "maintenance", homeCity: "Hamburg",
    capacityPerDay: 2, priceCents: 150000, durationMin: 480, description: "Standard-Wartung 8h, Zustand→100" },
  { id: "sp_maint_02", name: "Motor-Service Meyer", type: "maintenance", homeCity: "Hannover",
    capacityPerDay: 1, priceCents: 150000, durationMin: 480, description: "Standard-Wartung 8h, Zustand→100" },
  // Abschleppen
  { id: "sp_tow_01", name: "Pannenhilfe Nord e.K.", type: "towing", homeCity: "Hamburg",
    capacityPerDay: 3, description: "Abschlepp- und Pannenhilfe" },
  // Temp-Fahrer
  { id: "sp_temp_d_01", name: "Fahrpersonal Leihwerk", type: "temp_driver", homeCity: "Hamburg",
    provisionCents: 15000, blockRateCents: 18000, minBlocks: 2, capacity: 3,
    description: "Befristete Fahrervertretung" },
  // Temp-Disponent
  { id: "sp_temp_disp_01", name: "Dispo-Service Nord", type: "temp_dispatcher", homeCity: "Hamburg",
    provisionCents: 15000, blockRateCents: 26000, minBlocks: 2, capacity: 6,
    description: "Befristete Disponentenvertretung, Kapazität 6 Lkw" },
  // Externe Buchhaltung
  { id: "sp_acct_01", name: "Buchhaltungsexpress GmbH", type: "external_accounting", homeCity: "Hamburg",
    dailyRateCents: 16000, capacityPerDay: 40, description: "Externe Buchhaltungsprüfung pro Spieltag" },
  // Mietfahrzeug
  { id: "sp_rental_01", name: "TruckMiet Nord", type: "rental_truck", homeCity: "Hamburg",
    handoverCents: 15000, blockRateCents: 12000, minBlocks: 2, capacity: 5,
    description: "Miet-Lkw, 150 € Übergabe + 120 €/24h" },
];

// ---------- Konstanten ----------
export const CLEANING_PRICE_PER_UNIT = 2500; // 25 €
export const CLEANING_MAX_EFFECT = 35;
export const CLEANING_START_HOUR = 600; // 10:00
export const TOWING_BASE_CENTS = 20000; // 200 €
export const TOWING_PER_KM_CENTS = 300; // 3 €/km
export const TOWING_APPROACH_MIN = 60;
export const TOWING_SPEED = 40; // km/h
export const TOWING_HANDOVER_MIN = 30;
export const BLOCK_DURATION_MIN = DAY_MIN; // 24h

// ---------- Reinigung ----------

// Tagesbedarf: mindestens 1, sonst aufgerundete Personen/10
export function computeCleaningNeed(state, branchId) {
  const branch = (state.branches || []).find(b => b.id === branchId);
  if (!branch) return 0;
  const persons = getAllPersonsAtCity(state, branch.city);
  const need = Math.max(1, Math.ceil(persons / 10));
  return need;
}

function getAllPersonsAtCity(state, city) {
  let count = 0;
  for (const d of (state.drivers || [])) {
    if (d.locationCity === city && d.employmentStatus === "employed") count++;
  }
  for (const e of (state.employees || [])) {
    if (e.locationCity === city && e.employmentStatus === "employed") count++;
  }
  return count;
}

// Sauberkeit-Verwaltung
export function getBranchCleanliness(state, branchId) {
  const branch = (state.branches || []).find(b => b.id === branchId);
  if (!branch) return 85;
  if (branch.cleanliness === undefined) {
    // Migration: Hamburg-Start 85
    branch.cleanliness = 85;
    branch.lastCleaningDay = 0;
  }
  return branch.cleanliness;
}

// Täglicher Sauberkeitsverlust: 2 + Bedarf, max 8
export function processDailyCleaningDecay(state, midnight) {
  for (const b of (state.branches || [])) {
    getBranchCleanliness(state, b.id); // Migration
    const need = computeCleaningNeed(state, b.id);
    const loss = Math.min(8, 2 + need);
    b.cleanliness = Math.max(0, b.cleanliness - loss);
    b.lastDecayDay = dayOf(midnight);
  }
}

// Reinigungseinheit ausführen: floor(35 × min(1, erledigt/bedarf))
export function applyCleaningEffect(state, branchId, unitsDone, dayId) {
  const b = (state.branches || []).find(x => x.id === branchId);
  if (!b) return { effect: 0, newCleanliness: 0 };
  getBranchCleanliness(state, branchId);
  const need = computeCleaningNeed(state, branchId);
  
  // Tages-ID für stabile Tagesverfolgung
  b.cleaningProgress = b.cleaningProgress || {};
  const progress = b.cleaningProgress[dayId] || { unitsDone: 0, effectApplied: 0 };
  
  const totalUnits = progress.unitsDone + unitsDone;
  const newEffect = Math.floor(CLEANING_MAX_EFFECT * Math.min(1, totalUnits / need));
  const deltaEffect = newEffect - progress.effectApplied;
  
  if (deltaEffect > 0) {
    b.cleanliness = Math.min(100, b.cleanliness + deltaEffect);
    progress.effectApplied = newEffect;
    // Reinigung pflegt auch den Aufenthaltsbereich (Auftrag 34)
    applyCleaningToBreakArea(state, branchId, deltaEffect);
  }
  progress.unitsDone = totalUnits;
  b.cleanlingProgress = b.cleanlingProgress || {};
  b.cleaningProgress[dayId] = progress;
  
  return { effect: deltaEffect, newCleanliness: b.cleanliness, totalUnits };
}

// Reinigung buchen
export function bookCleaning(state, { branchId, units, recurring, recurringIntervalDays }) {
  const b = (state.branches || []).find(x => x.id === branchId);
  if (!b) throw new Error("Standort nicht gefunden.");
  if (units < 1) throw new Error("Mindestens eine Reinigungseinheit erforderlich.");
  
  const provider = SERVICE_PROVIDERS.find(p => p.type === "cleaning" && p.homeCity === b.city)
    || SERVICE_PROVIDERS.find(p => p.type === "cleaning");
  if (!provider) throw new Error("Kein Reinigungsanbieter verfügbar.");
  
  // Frühester Termin: Folgetag nach Buchung, Start 10:00
  const startMin = (Math.floor(state.gameTime / DAY_MIN) + 1) * DAY_MIN + CLEANING_START_HOUR;
  const totalCost = units * CLEANING_PRICE_PER_UNIT;
  
  if (state.company.accountCents < totalCost) {
    throw new Error("Firmenkonto reicht für Reinigung nicht aus.");
  }
  
  const contract = {
    id: uid(state, "svc"),
    type: "cleaning", providerId: provider.id, providerName: provider.name,
    branchId, branchName: b.name, branchCity: b.city,
    units, recurring: !!recurring, recurringIntervalDays: recurringIntervalDays || 7,
    startMin, endMin: startMin + units * 60, // 1h pro Einheit
    costCents: totalCost, status: "planned",
    createdAtMin: state.gameTime,
  };
  
  state.serviceContracts = state.serviceContracts || [];
  state.serviceContracts.push(contract);
  
  pushEvent(state, {
    type: "service_booked",
    gameTime: state.gameTime, isSystem: false,
    details: {
      serviceType: "cleaning", providerName: provider.name,
      branchName: b.name, units, costCents: totalCost, startMin,
      recurring: !!recurring,
    },
    dedupKey: "service_booked:" + contract.id,
  });
  
  return { ok: true, contractId: contract.id, startMin, costCents: totalCost };
}

// ---------- Wartung ----------

export function bookMaintenance(state, { vehicleId }) {
  const v = (state.vehicles || []).find(x => x.id === vehicleId);
  if (!v) throw new Error("Fahrzeug nicht gefunden.");
  if (v.status !== "free") throw new Error("Fahrzeug muss frei sein für externe Wartung.");
  
  const provider = SERVICE_PROVIDERS.find(p => p.type === "maintenance" && p.homeCity === v.locationCity)
    || SERVICE_PROVIDERS.find(p => p.type === "maintenance");
  if (!provider) throw new Error("Kein Wartungsanbieter verfügbar.");
  
  let cost = MAINTENANCE_COST;
  const stressed = state.private.stress >= STRESS_MAINT_THRESHOLD;
  if (stressed) cost = Math.round(cost * MAINT_STRESS_FACTOR);
  
  if (state.company.accountCents < cost) {
    throw new Error("Firmenkonto reicht für Wartung nicht aus.");
  }
  
  const startMin = state.gameTime;
  const endMin = startMin + MAINTENANCE_DURATION;
  
  const contract = {
    id: uid(state, "svc"),
    type: "maintenance", providerId: provider.id, providerName: provider.name,
    vehicleId, vehicleLabel: v.id, vehicleCity: v.locationCity,
    startMin, endMin, costCents: cost, status: "planned",
    stressed, createdAtMin: state.gameTime,
  };
  
  state.serviceContracts = state.serviceContracts || [];
  state.serviceContracts.push(contract);
  
  // Fahrzeug in Wartung setzen
  v.status = "maintenance";
  v.maintenanceUntil = endMin;
  
  // Kosten sofort abbuchen (über addBooking in simulationEngine)
  
  pushEvent(state, {
    type: "service_booked",
    gameTime: state.gameTime, isSystem: false,
    details: {
      serviceType: "maintenance", providerName: provider.name,
      vehicleId, costCents: cost, startMin, endMin, stressed,
    },
    dedupKey: "service_booked:" + contract.id,
  });
  
  return { ok: true, contractId: contract.id, costCents: cost, endMin, stressed };
}

// ---------- Abschleppen ----------

export function bookTowing(state, { vehicleId, targetCity }) {
  const v = (state.vehicles || []).find(x => x.id === vehicleId);
  if (!v) throw new Error("Fahrzeug nicht gefunden.");
  if (!targetCity) throw new Error("Zielort erforderlich.");
  if (v.locationCity === targetCity) throw new Error("Fahrzeug bereits am Zielort.");
  
  const provider = SERVICE_PROVIDERS.find(p => p.type === "towing" && p.homeCity === v.locationCity);
  if (!provider) throw new Error(`Kein Abschleppdienst am Standort ${v.locationCity} verfügbar.`);
  
  const dist = getDistance(v.locationCity, targetCity);
  if (dist === 0) throw new Error("Keine gültige Route zum Zielort.");
  
  const cost = TOWING_BASE_CENTS + dist * TOWING_PER_KM_CENTS;
  const transportMin = Math.ceil((dist / TOWING_SPEED) * 60);
  const startMin = state.gameTime + TOWING_APPROACH_MIN;
  const arrivalMin = startMin + transportMin;
  const handoverMin = arrivalMin + TOWING_HANDOVER_MIN;
  
  if (state.company.accountCents < cost) {
    throw new Error("Firmenkonto reicht für Abschleppdienst nicht aus.");
  }
  
  const contract = {
    id: uid(state, "svc"),
    type: "towing", providerId: provider.id, providerName: provider.name,
    vehicleId, fromCity: v.locationCity, toCity: targetCity,
    distanceKm: dist, startMin, arrivalMin, handoverMin,
    costCents: cost, status: "planned",
    createdAtMin: state.gameTime,
  };
  
  state.serviceContracts = state.serviceContracts || [];
  state.serviceContracts.push(contract);
  
  pushEvent(state, {
    type: "service_booked",
    gameTime: state.gameTime, isSystem: false,
    details: {
      serviceType: "towing", providerName: provider.name,
      vehicleId, fromCity: v.locationCity, toCity: targetCity,
      distanceKm: dist, costCents: cost, handoverMin,
    },
    dedupKey: "service_booked:" + contract.id,
  });
  
  return { ok: true, contractId: contract.id, costCents: cost, handoverMin };
}

// ---------- Fremdpersonal ----------

export function bookTempStaff(state, { type, substitutesPersonId, startMin, blocks }) {
  const providerType = type === "temp_driver" ? "temp_driver" : "temp_dispatcher";
  const provider = SERVICE_PROVIDERS.find(p => p.type === providerType);
  if (!provider) throw new Error("Kein Anbieter für Fremdpersonal verfügbar.");
  
  const minBlocks = provider.minBlocks || 2;
  const numBlocks = Math.max(minBlocks, blocks || minBlocks);
  
  const sMin = startMin || state.gameTime;
  const eMin = sMin + numBlocks * BLOCK_DURATION_MIN;
  const totalCost = provider.provisionCents + numBlocks * provider.blockRateCents;
  
  if (state.company.accountCents < totalCost) {
    throw new Error("Firmenkonto reicht für Fremdpersonal nicht aus.");
  }
  
  const found = substitutesPersonId ? findPersonById(state, substitutesPersonId) : null;
  
  const contract = {
    id: uid(state, "svc"),
    type: providerType, providerId: provider.id, providerName: provider.name,
    substitutesPersonId: substitutesPersonId || null,
    substitutesPersonName: found?.name || null,
    startMin: sMin, endMin: eMin, blocks: numBlocks,
    provisionCents: provider.provisionCents, blockRateCents: provider.blockRateCents,
    totalCostCents: totalCost, status: "planned",
    capacity: provider.capacity, locationCity: provider.homeCity,
    createdAtMin: state.gameTime,
  };
  
  state.serviceContracts = state.serviceContracts || [];
  state.serviceContracts.push(contract);
  
  pushEvent(state, {
    type: "service_booked",
    gameTime: state.gameTime, isSystem: false,
    details: {
      serviceType: providerType, providerName: provider.name,
      substitutesPersonId, blocks: numBlocks, totalCostCents: totalCost,
      startMin: sMin, endMin: eMin,
    },
    dedupKey: "service_booked:" + contract.id,
  });
  
  return { ok: true, contractId: contract.id, totalCostCents: totalCost, endMin: eMin };
}

function findPersonById(state, id) {
  return (state.drivers || []).find(d => d.id === id) || (state.employees || []).find(e => e.id === id);
}

// ---------- Externe Buchhaltung ----------

export function bookExternalAccounting(state, { startMin }) {
  const provider = SERVICE_PROVIDERS.find(p => p.type === "external_accounting");
  if (!provider) throw new Error("Kein externer Buchhaltungsdienst verfügbar.");
  
  // Beginn: nächster voller Diensttag
  const sMin = startMin || (Math.floor(state.gameTime / DAY_MIN) + 1) * DAY_MIN + SERVICE_START_MIN;
  const eMin = sMin + (SERVICE_END_MIN - SERVICE_START_MIN);
  const cost = provider.dailyRateCents;
  
  if (state.company.accountCents < cost) {
    throw new Error("Firmenkonto reicht für externe Buchhaltung nicht aus.");
  }
  
  const contract = {
    id: uid(state, "svc"),
    type: "external_accounting", providerId: provider.id, providerName: provider.name,
    startMin: sMin, endMin: eMin, costCents: cost,
    capacityPoints: provider.capacityPerDay, status: "planned",
    createdAtMin: state.gameTime,
  };
  
  state.serviceContracts = state.serviceContracts || [];
  state.serviceContracts.push(contract);
  
  pushEvent(state, {
    type: "service_booked",
    gameTime: state.gameTime, isSystem: false,
    details: {
      serviceType: "external_accounting", providerName: provider.name,
      costCents: cost, startMin: sMin, capacityPoints: provider.capacityPerDay,
    },
    dedupKey: "service_booked:" + contract.id,
  });
  
  return { ok: true, contractId: contract.id, costCents: cost, startMin: sMin };
}

// ---------- Mietfahrzeug ----------

export function bookRentalTruck(state, { provisionCity, blocks }) {
  const provider = SERVICE_PROVIDERS.find(p => p.type === "rental_truck");
  if (!provider) throw new Error("Kein Mietfahrzeug-Anbieter verfügbar.");
  
  const minBlocks = provider.minBlocks || 2;
  const numBlocks = Math.max(minBlocks, blocks || minBlocks);
  const totalCost = provider.handoverCents + numBlocks * provider.blockRateCents;
  
  if (state.company.accountCents < totalCost) {
    throw new Error("Firmenkonto reicht für Mietfahrzeug nicht aus.");
  }
  
  const sMin = state.gameTime;
  const eMin = sMin + numBlocks * BLOCK_DURATION_MIN;
  
  const contract = {
    id: uid(state, "svc"),
    type: "rental_truck", providerId: provider.id, providerName: provider.name,
    provisionCity: provisionCity || provider.homeCity,
    startMin: sMin, endMin: eMin, blocks: numBlocks,
    handoverCents: provider.handoverCents, blockRateCents: provider.blockRateCents,
    totalCostCents: totalCost, status: "planned",
    createdAtMin: state.gameTime,
  };
  
  state.serviceContracts = state.serviceContracts || [];
  state.serviceContracts.push(contract);
  
  pushEvent(state, {
    type: "service_booked",
    gameTime: state.gameTime, isSystem: false,
    details: {
      serviceType: "rental_truck", providerName: provider.name,
      provisionCity, blocks: numBlocks, totalCostCents: totalCost,
    },
    dedupKey: "service_booked:" + contract.id,
  });
  
  return { ok: true, contractId: contract.id, totalCostCents: totalCost };
}

// ---------- Stornierung ----------

export function cancelService(state, { contractId }) {
  const c = (state.serviceContracts || []).find(x => x.id === contractId);
  if (!c) throw new Error("Vertrag nicht gefunden.");
  if (c.status === "completed") throw new Error("Abgeschlossener Vertrag kann nicht storniert werden.");
  if (c.status === "cancelled") throw new Error("Vertrag bereits storniert.");
  
  // Vor Beginn: kostenlos stornierbar (neues einfaches Profil)
  if (c.startMin > state.gameTime) {
    c.status = "cancelled";
    c.cancelledAtMin = state.gameTime;
    pushEvent(state, {
      type: "service_cancelled",
      gameTime: state.gameTime, isSystem: false,
      details: { serviceType: c.type, contractId, beforeStart: true },
      dedupKey: "service_cancelled:" + contractId,
    });
    return { ok: true, contractId, refund: true };
  }
  
  // Wiederkehrend: zum nächsten Leistungstag kündbar
  if (c.recurring && c.status === "active") {
    c.status = "cancelled";
    c.cancelledAtMin = state.gameTime;
    c.cancelReason = "recurring_cancelled";
    pushEvent(state, {
      type: "service_cancelled",
      gameTime: state.gameTime, isSystem: false,
      details: { serviceType: c.type, contractId, recurring: true },
      dedupKey: "service_cancelled:" + contractId,
    });
    return { ok: true, contractId, refund: false };
  }
  
  // Laufender Tagesauftrag: wird abgeschlossen
  if (c.status === "active") {
    throw new Error("Laufender Auftrag wird gemäß Vertrag abgeschlossen – zukünftige Termine werden deaktiviert.");
  }
  
  throw new Error("Stornierung unter aktuellen Bedingungen nicht möglich.");
}

// ---------- Vertragsausführung ----------

export function processServiceContracts(state, m, log) {
  state.serviceContracts = state.serviceContracts || [];
  
  for (const c of state.serviceContracts) {
    if (c.status === "planned" && c.startMin <= m) {
      // Vertrag beginnt
      c.status = "active";
      c.actualStartMin = m;
      onServiceStart(state, c, m, log);
    }
    
    if (c.status === "active" && c.endMin <= m) {
      // Vertrag endet
      c.status = "completed";
      c.completedAtMin = m;
      onServiceComplete(state, c, m, log);
    }
    
    // Wiederkehrende Reinigung: nächsten Termin planen
    if (c.recurring && c.status === "active" && c.type === "cleaning" && c.endMin <= m) {
      c.status = "completed";
      c.completedAtMin = m;
      onServiceComplete(state, c, m, log);
      // Nächsten Termin erstellen
      const nextStart = c.endMin + (c.recurringIntervalDays || 7) * DAY_MIN;
      const nextContract = {
        ...c, id: uid(state, "svc"), startMin: nextStart,
        endMin: nextStart + c.units * 60, status: "planned",
        createdAtMin: m, recurring: true, parentContractId: c.id,
      };
      state.serviceContracts.push(nextContract);
    }
  }
}

function onServiceStart(state, c, m, log) {
  if (c.type === "cleaning") {
    log.push({ type: "cleaning_started", contract: c.id, atMin: m });
    pushEvent(state, {
      type: "service_started", gameTime: m, isSystem: true,
      details: { serviceType: "cleaning", providerName: c.providerName, branchName: c.branchName, units: c.units },
      dedupKey: "service_started:" + c.id,
    });
  } else if (c.type === "maintenance") {
    log.push({ type: "maintenance_started", contract: c.id, atMin: m });
    pushEvent(state, {
      type: "service_started", gameTime: m, isSystem: true,
      details: { serviceType: "maintenance", providerName: c.providerName, vehicleId: c.vehicleId },
      dedupKey: "service_started:" + c.id,
    });
  } else if (c.type === "towing") {
    log.push({ type: "towing_started", contract: c.id, atMin: m });
    pushEvent(state, {
      type: "service_started", gameTime: m, isSystem: true,
      details: { serviceType: "towing", providerName: c.providerName, vehicleId: c.vehicleId },
      dedupKey: "service_started:" + c.id,
    });
  } else if (c.type === "temp_driver" || c.type === "temp_dispatcher") {
    log.push({ type: "temp_staff_started", contract: c.id, atMin: m });
    pushEvent(state, {
      type: "service_started", gameTime: m, isSystem: true,
      details: { serviceType: c.type, providerName: c.providerName, substitutesPersonId: c.substitutesPersonId },
      dedupKey: "service_started:" + c.id,
    });
  } else if (c.type === "external_accounting") {
    log.push({ type: "external_accounting_started", contract: c.id, atMin: m });
    pushEvent(state, {
      type: "service_started", gameTime: m, isSystem: true,
      details: { serviceType: "external_accounting", providerName: c.providerName, capacityPoints: c.capacityPoints },
      dedupKey: "service_started:" + c.id,
    });
  } else if (c.type === "rental_truck") {
    log.push({ type: "rental_started", contract: c.id, atMin: m });
    pushEvent(state, {
      type: "service_started", gameTime: m, isSystem: true,
      details: { serviceType: "rental_truck", providerName: c.providerName, provisionCity: c.provisionCity },
      dedupKey: "service_started:" + c.id,
    });
  }
}

function onServiceComplete(state, c, m, log) {
  if (c.type === "cleaning") {
    // Reinigungseinheiten anwenden
    const dayId = dayOf(c.startMin);
    const result = applyCleaningEffect(state, c.branchId, c.units, dayId);
    log.push({ type: "cleaning_completed", contract: c.id, atMin: m, effect: result.effect, newCleanliness: result.newCleanliness });
    pushEvent(state, {
      type: "service_completed", gameTime: m, isSystem: true,
      details: { serviceType: "cleaning", providerName: c.providerName, units: c.units, effect: result.effect, newCleanliness: result.newCleanliness },
      dedupKey: "service_completed:" + c.id,
    });
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Reinigung abgeschlossen",
      body: `${c.providerName} hat ${c.units} Reinigungseinheit(en) am Standort ${c.branchName} erledigt. Sauberkeit: ${result.newCleanliness}/100. Kosten: ${(c.costCents / 100).toFixed(2)} €.`,
      gameTime: m, category: "operations", priority: "normal",
      dedupKey: "cleaning_done_msg:" + c.id,
    });
  } else if (c.type === "maintenance") {
    const v = (state.vehicles || []).find(x => x.id === c.vehicleId);
    if (v) {
      v.status = "free";
      v.maintenanceUntil = null;
      v.condition = 100;
    }
    log.push({ type: "maintenance_completed", contract: c.id, atMin: m });
    pushEvent(state, {
      type: "service_completed", gameTime: m, isSystem: true,
      details: { serviceType: "maintenance", providerName: c.providerName, vehicleId: c.vehicleId, condition: 100 },
      dedupKey: "service_completed:" + c.id,
    });
  } else if (c.type === "towing") {
    const v = (state.vehicles || []).find(x => x.id === c.vehicleId);
    if (v) {
      v.locationCity = c.toCity;
      v.status = "free";
    }
    log.push({ type: "towing_completed", contract: c.id, atMin: m });
    pushEvent(state, {
      type: "service_completed", gameTime: m, isSystem: true,
      details: { serviceType: "towing", providerName: c.providerName, vehicleId: c.vehicleId, toCity: c.toCity },
      dedupKey: "service_completed:" + c.id,
    });
  } else if (c.type === "temp_driver" || c.type === "temp_dispatcher") {
    log.push({ type: "temp_staff_completed", contract: c.id, atMin: m });
    pushEvent(state, {
      type: "service_completed", gameTime: m, isSystem: true,
      details: { serviceType: c.type, providerName: c.providerName, substitutesPersonId: c.substitutesPersonId },
      dedupKey: "service_completed:" + c.id,
    });
  } else if (c.type === "external_accounting") {
    // Prüfpunkte bearbeiten
    const openReceipts = (state.accounting?.receipts || []).filter(r => r.status === "generated");
    const processed = Math.min(c.capacityPoints, openReceipts.length);
    for (let i = 0; i < processed; i++) {
      openReceipts[i].status = "checked";
      openReceipts[i].checkedAtMin = m;
      openReceipts[i].checkedBy = "external:" + c.providerName;
    }
    log.push({ type: "external_accounting_completed", contract: c.id, atMin: m, processed });
    pushEvent(state, {
      type: "service_completed", gameTime: m, isSystem: true,
      details: { serviceType: "external_accounting", providerName: c.providerName, processed, capacity: c.capacityPoints },
      dedupKey: "service_completed:" + c.id,
    });
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Externe Buchhaltung abgeschlossen",
      body: `${c.providerName} hat ${processed} von ${c.capacityPoints} möglichen Prüfpunkten bearbeitet. Pauschale: ${(c.costCents / 100).toFixed(2)} €.`,
      gameTime: m, category: "operations", priority: "normal",
      dedupKey: "ext_acct_done_msg:" + c.id,
    });
  } else if (c.type === "rental_truck") {
    log.push({ type: "rental_completed", contract: c.id, atMin: m });
    pushEvent(state, {
      type: "service_completed", gameTime: m, isSystem: true,
      details: { serviceType: "rental_truck", providerName: c.providerName },
      dedupKey: "service_completed:" + c.id,
    });
  }
}

// ---------- Block-Abrechnung für Fremdpersonal ----------

export function processTempStaffBilling(state, m, log) {
  state.serviceContracts = state.serviceContracts || [];
  for (const c of state.serviceContracts) {
    if (c.type !== "temp_driver" && c.type !== "temp_dispatcher") continue;
    if (c.status !== "active") continue;
    c.billedBlocks = c.billedBlocks || 0;
    const elapsedBlocks = Math.floor((m - c.actualStartMin) / BLOCK_DURATION_MIN);
    while (c.billedBlocks < elapsedBlocks && c.billedBlocks < c.blocks) {
      c.billedBlocks++;
      log.push({ type: "temp_staff_block_billed", contract: c.id, block: c.billedBlocks, atMin: m, costCents: c.blockRateCents });
    }
  }
}

// ---------- Migration ----------

export function migrateServices(state) {
  state.serviceContracts = state.serviceContracts || [];
  // Sauberkeit für bestehende Standorte initialisieren
  for (const b of (state.branches || [])) {
    if (b.cleanliness === undefined) {
      b.cleanliness = 85;
      b.lastCleaningDay = 0;
    }
  }
}