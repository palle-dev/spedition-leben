// Anschaffungs-Engine fuer FERNWERK (Auftrag 26).
// Verwaltet den privaten Anschaffungskatalog, Besitz, Verkauf und besitzgebundene Aktivitaeten.

import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";

const DAY_MIN = 1440;

// ---------- Anschaffungskatalog (20 Eintraege) ----------
// category: furnishing | watch | art | vehicle | boat | property
// resaleFactor: Anteil des Kaufpreises beim Verkauf
// activity: besitzgebundene Aktivitaet (optional)
// isHome: true fuer Immobilien, die als Hauptwohnsitz dienen koennen
// isCar: true fuer Privatautos
// isBoat: true fuer Boote
export const PURCHASE_CATALOG = [
  { id: "coffee", name: "Espressomaschine", priceCents: 60000, maintenancePerDayCents: 0, category: "furnishing", resaleFactor: 0.5,
    activity: { type: "coffee", label: "Kaffeezeit", durationMin: 60, costCents: 0, stressDelta: -3, happinessDelta: 1 } },
  { id: "bike", name: "Fahrrad", priceCents: 90000, maintenancePerDayCents: 0, category: "furnishing", resaleFactor: 0.5,
    activity: { type: "bike_ride", label: "Radtour", durationMin: 120, costCents: 0, stressDelta: -9, happinessDelta: 3 } },
  { id: "sofa", name: "Hochwertige Sofaecke", priceCents: 220000, maintenancePerDayCents: 0, category: "furnishing", resaleFactor: 0.5 },
  { id: "media", name: "Heimkino", priceCents: 350000, maintenancePerDayCents: 100, category: "furnishing", resaleFactor: 0.5,
    activity: { type: "movie_night", label: "Gemeinsamer Filmabend", durationMin: 120, costCents: 1500, stressDelta: -6, happinessDelta: 3, contactDelta: 3 } },
  { id: "music", name: "Musikecke", priceCents: 400000, maintenancePerDayCents: 100, category: "furnishing", resaleFactor: 0.5,
    activity: { type: "music", label: "Musik machen", durationMin: 120, costCents: 0, stressDelta: -7, happinessDelta: 3 } },
  { id: "fitness", name: "Fitnessausstattung", priceCents: 550000, maintenancePerDayCents: 200, category: "furnishing", resaleFactor: 0.5,
    activity: { type: "fitness_home", label: "Training zuhause", durationMin: 120, costCents: 0, stressDelta: -8, happinessDelta: 3 } },
  { id: "watch", name: "Mechanische Uhr", priceCents: 800000, maintenancePerDayCents: 0, category: "watch", resaleFactor: 0.8 },
  { id: "compact", name: "Privater Kompaktwagen", priceCents: 1500000, maintenancePerDayCents: 300, category: "vehicle", resaleFactor: 0.7, isCar: true,
    activity: { type: "car_drive", label: "Ausfahrt", durationMin: 120, costCents: 3000, stressDelta: -6, happinessDelta: 4 } },
  { id: "tourer", name: "Reisewagen", priceCents: 4500000, maintenancePerDayCents: 800, category: "vehicle", resaleFactor: 0.7, isCar: true,
    activity: { type: "car_drive", label: "Ausfahrt", durationMin: 120, costCents: 3000, stressDelta: -6, happinessDelta: 4 } },
  { id: "coupe", name: "Sportcoupe", priceCents: 8500000, maintenancePerDayCents: 1500, category: "vehicle", resaleFactor: 0.7, isCar: true,
    activity: { type: "car_drive", label: "Ausfahrt", durationMin: 120, costCents: 3000, stressDelta: -6, happinessDelta: 4 } },
  { id: "sport", name: "Sportwagen", priceCents: 18000000, maintenancePerDayCents: 3000, category: "vehicle", resaleFactor: 0.7, isCar: true, isSportCar: true,
    activity: { type: "car_drive", label: "Ausfahrt", durationMin: 120, costCents: 3000, stressDelta: -6, happinessDelta: 4 } },
  { id: "supercar", name: "Supersportwagen", priceCents: 65000000, maintenancePerDayCents: 10000, category: "vehicle", resaleFactor: 0.7, isCar: true, isSportCar: true,
    activity: { type: "car_drive", label: "Ausfahrt", durationMin: 120, costCents: 3000, stressDelta: -6, happinessDelta: 4 } },
  { id: "art", name: "Kunstsammlung", priceCents: 2500000, maintenancePerDayCents: 100, category: "art", resaleFactor: 0.8 },
  { id: "motorboat", name: "Motorboot", priceCents: 9000000, maintenancePerDayCents: 2500, category: "boat", resaleFactor: 0.7, isBoat: true,
    activity: { type: "boat_trip", label: "Bootsausflug", durationMin: 180, costCents: 6000, stressDelta: -10, happinessDelta: 5 } },
  { id: "apartment", name: "Eigentumswohnung", priceCents: 18000000, maintenancePerDayCents: 3500, category: "property", resaleFactor: 0.9, isHome: true },
  { id: "house", name: "Haus mit Garten", priceCents: 35000000, maintenancePerDayCents: 7000, category: "property", resaleFactor: 0.9, isHome: true,
    activity: { type: "garden", label: "Gartenzeit", durationMin: 120, costCents: 1000, stressDelta: -8, happinessDelta: 3 } },
  { id: "penthouse", name: "Penthouse", priceCents: 85000000, maintenancePerDayCents: 18000, category: "property", resaleFactor: 0.9, isHome: true },
  { id: "holidayhome", name: "Ferienhaus", priceCents: 28000000, maintenancePerDayCents: 5500, category: "property", resaleFactor: 0.9, isHome: false,
    activity: { type: "short_trip", label: "Kurzurlaub", durationMin: 2880, costCents: 45000, stressDelta: -20, happinessDelta: 8, isTrip: true, overridePrice: 45000, originalPrice: 90000 } },
  { id: "villa", name: "Villa", priceCents: 150000000, maintenancePerDayCents: 35000, category: "property", resaleFactor: 0.9, isHome: true, isVilla: true,
    activity: { type: "garden", label: "Gartenzeit", durationMin: 120, costCents: 1000, stressDelta: -8, happinessDelta: 3 } },
  { id: "yacht", name: "Yacht", priceCents: 250000000, maintenancePerDayCents: 60000, category: "boat", resaleFactor: 0.7, isBoat: true,
    activity: { type: "boat_trip", label: "Bootsausflug", durationMin: 180, costCents: 6000, stressDelta: -10, happinessDelta: 5 } },
];

// ---------- Grundlegende Aktivitaeten (immer verfuegbar) ----------
export const BASIC_ACTIVITIES = [
  { type: "walk", label: "Spaziergang", durationMin: 120, costCents: 0, stressDelta: -8, happinessDelta: 2, maxPerDay: 1 },
  { type: "read", label: "Lesen", durationMin: 60, costCents: 0, stressDelta: -4, happinessDelta: 1, maxPerDay: 1 },
  { type: "wellness", label: "Wellnessnachmittag", durationMin: 240, costCents: 12000, stressDelta: -14, happinessDelta: 5, maxPerDay: 1 },
  { type: "cooking", label: "Gemeinsam kochen", durationMin: 120, costCents: 3500, stressDelta: -5, happinessDelta: 3, contactDelta: 4, maxPerDay: 1, requiresContact: true },
  { type: "concert", label: "Konzertabend", durationMin: 240, costCents: 10000, stressDelta: -10, happinessDelta: 4, contactDelta: 5, maxPerWeek: 1, requiresContact: true },
  { type: "date_night", label: "Romantischer Abend", durationMin: 180, costCents: 8000, stressDelta: -8, happinessDelta: 5, contactDelta: 8, maxPerWeek: 1, requiresContact: true },
  { type: "short_trip", label: "Kurzurlaub", durationMin: 2880, costCents: 90000, stressDelta: -20, happinessDelta: 8, isTrip: true, maxPerDay: 1 },
];

// ---------- Migration ----------
export function migratePurchases(state) {
  if (!state.private) state.private = {};
  if (!state.private.purchases) state.private.purchases = { items: [], activeHomeId: null };
  if (!state.private.purchases.items) state.private.purchases.items = [];
  if (state.private.purchases.activeHomeId === undefined) state.private.purchases.activeHomeId = null;
  // Startwohnung als Standard, falls keine aktive Immobilie
  if (state.private.purchases.activeHomeId === null && !state.private.purchases.items.some(i => i.isHome && i.status === "active")) {
    // Startwohnung hat Wert 0, wird nicht als Kaufobjekt angelegt
    state.private.residence = state.private.residence || "Wohnung in Hamburg";
  }
  updateOwnershipStats(state);
}

// ---------- Besitz-Statistiken aktualisieren ----------
export function updateOwnershipStats(state) {
  const items = state.private?.purchases?.items || [];
  const active = items.filter(i => i.status === "active");
  state.stats = state.stats || {};
  state.stats.ownershipCount = items.filter(i => i.status !== "sold").length;
  state.stats.hasHome = active.some(i => i.isHome);
  state.stats.hasCar = active.some(i => i.isCar);
  state.stats.hasSportCar = active.some(i => i.isCar && i.isSportCar);
  state.stats.hasBoat = active.some(i => i.isBoat);
  state.stats.hasVilla = active.some(i => i.isHome && i.isVilla);
  // Wohnungsausstattungstypen
  const furnishingTypes = active.filter(i => i.category === "furnishing").map(i => i.catalogId);
  state.stats.homeFurnishingTypes = furnishingTypes;
}

// ---------- Kaufpruefung ----------
// Prueft: ausreichende Mittel, keine offenen privaten Pflichtkosten,
// 7 Tage private Kostenreserve inkl. neuem Unterhalt
export function checkPurchaseConditions(state, catalogEntry) {
  const privateAccount = state.private?.accountCents || 0;
  const openPrivateCosts = (state.openCosts || []).some(o => o.account === "private" && o.amountCents > 0);
  if (openPrivateCosts) return { canBuy: false, reason: "Es gibt offene private Pflichtkosten. Bitte bezahle diese zuerst." };
  if (privateAccount < catalogEntry.priceCents) {
    return { canBuy: false, reason: "Privatkonto reicht nicht aus (" + (catalogEntry.priceCents / 100).toLocaleString("de-DE") + " EUR erforderlich)." };
  }
  // 7-Tage-Reserve: Lebenshaltung (30 EUR/Tag) + bestehender Unterhalt + neuer Unterhalt
  const PRIVATE_LIVING_PER_DAY = 3000;
  const existingMaintenance = (state.private?.purchases?.items || [])
    .filter(i => i.status === "active")
    .reduce((s, i) => s + (i.maintenancePerDayCents || 0), 0);
  const newMaintenance = catalogEntry.maintenancePerDayCents || 0;
  const dailyNeed = PRIVATE_LIVING_PER_DAY + existingMaintenance + newMaintenance;
  const reserve7 = dailyNeed * 7;
  if (privateAccount - catalogEntry.priceCents < reserve7) {
    return { canBuy: false, reason: "Sieben Tage private Kostenreserve (" + (reserve7 / 100).toLocaleString("de-DE") + " EUR) wuerde unterschritten." };
  }
  return { canBuy: true };
}

// ---------- Kauf ausfuehren ----------
export function buyPurchase(state, { catalogId }) {
  const entry = PURCHASE_CATALOG.find(p => p.id === catalogId);
  if (!entry) throw new Error("Unbekannter Katalogeintrag: " + catalogId);
  // Nur ein Objekt pro Katalog-ID im Basismodell
  const existing = (state.private?.purchases?.items || []).find(i => i.catalogId === catalogId && i.status !== "sold");
  if (existing) throw new Error("Dieser Gegenstand ist bereits im Besitz.");
  const check = checkPurchaseConditions(state, entry);
  if (!check.canBuy) throw new Error(check.reason);

  // Bezahlen
  state.private.accountCents -= entry.priceCents;
  state.bookings.push({ min: state.gameTime, cause: "Privatkauf: " + entry.name, amountCents: -entry.priceCents, account: "private", refId: "buy:" + catalogId });

  // Besitz anlegen
  const item = {
    id: "p_" + (state.idCounter = (state.idCounter || 100) + 1),
    catalogId: catalogId,
    name: entry.name,
    category: entry.category,
    priceCents: entry.priceCents,
    purchasePriceCents: entry.priceCents,
    maintenancePerDayCents: entry.maintenancePerDayCents || 0,
    resaleFactor: entry.resaleFactor,
    isHome: entry.isHome || false,
    isCar: entry.isCar || false,
    isBoat: entry.isBoat || false,
    isSportCar: entry.isSportCar || false,
    isVilla: entry.isVilla || false,
    purchasedAtMin: state.gameTime,
    status: "active",
    soldAtMin: null,
    salePriceCents: null,
  };
  state.private.purchases.items.push(item);

  // Bei Immobilie: als Hauptwohnsitz aktivieren
  if (entry.isHome) {
    state.private.purchases.activeHomeId = item.id;
    state.private.residence = entry.name + " (Hamburg)";
  }

  updateOwnershipStats(state);
  pushEvent(state, {
    type: "purchase_completed",
    gameTime: state.gameTime, isSystem: true,
    details: { catalogId, name: entry.name, priceCents: entry.priceCents, itemId: item.id },
    dedupKey: "purchase_completed:" + item.id,
  });
  return { ok: true, itemId: item.id, catalogId };
}

// ---------- Verkauf ----------
export function sellPurchase(state, { itemId }) {
  const items = state.private?.purchases?.items || [];
  const item = items.find(i => i.id === itemId);
  if (!item) throw new Error("Gegenstand nicht gefunden.");
  if (item.status !== "active") throw new Error("Nur aktive Gegenstaende koennen verkauft werden.");

  // Pruefen, ob Gegenstand an laufende/gebuchte Aktivitaet gebunden ist
  const boundActivity = (state.appointments || []).find(a =>
    a.status === "accepted" && a.linkedItemId === itemId
  );
  if (boundActivity) throw new Error("Gegenstand ist an einen gebuchten Termin gebunden. Bitte zuerst stornieren.");

  const salePrice = Math.round(item.purchasePriceCents * item.resaleFactor);
  state.private.accountCents += salePrice;
  state.bookings.push({ min: state.gameTime, cause: "Privatverkauf: " + item.name, amountCents: salePrice, account: "private", refId: "sell:" + itemId });

  item.status = "sold";
  item.soldAtMin = state.gameTime;
  item.salePriceCents = salePrice;

  // Bei aktivem Wohnobjekt: durch Startwohnung ersetzen
  if (item.isHome && state.private.purchases.activeHomeId === itemId) {
    const otherHome = items.find(i => i.isHome && i.status === "active" && i.id !== itemId);
    if (otherHome) {
      state.private.purchases.activeHomeId = otherHome.id;
      state.private.residence = otherHome.name + " (Hamburg)";
    } else {
      state.private.purchases.activeHomeId = null;
      state.private.residence = "Wohnung in Hamburg";
    }
  }

  updateOwnershipStats(state);
  pushEvent(state, {
    type: "purchase_sold",
    gameTime: state.gameTime, isSystem: true,
    details: { itemId, name: item.name, salePriceCents: salePrice },
    dedupKey: "purchase_sold:" + itemId,
  });
  return { ok: true, itemId, salePriceCents: salePrice };
}

// ---------- Aktivitaet starten ----------
// Unterstuetzt grundlegende Aktivitaeten und besitzgebundene Aktivitaeten.
// Gutscheine koennen den Preis uebernehmen.
export function startPrivateActivity(state, { activityType, voucherId, itemId }) {
  // Aktivitaet aus Katalog oder Besitz finden
  let activity = null;
  let linkedItem = null;

  // 1. Besitzgebundene Aktivitaet?
  if (itemId) {
    const item = (state.private?.purchases?.items || []).find(i => i.id === itemId && i.status === "active");
    if (!item) throw new Error("Gegenstand nicht gefunden oder nicht aktiv.");
    const entry = PURCHASE_CATALOG.find(p => p.id === item.catalogId);
    if (!entry?.activity) throw new Error("Dieser Gegenstand ermoeglicht keine Aktivitaet.");
    activity = entry.activity;
    linkedItem = item;
  } else {
    // 2. Grundlegende Aktivitaet?
    activity = BASIC_ACTIVITIES.find(a => a.type === activityType);
    if (!activity) {
      // 3. Besitzgebundene Aktivitaet ohne itemId? -> passenden Besitz suchen
      for (const entry of PURCHASE_CATALOG) {
        if (entry.activity?.type === activityType) {
          const item = (state.private?.purchases?.items || []).find(i => i.catalogId === entry.id && i.status === "active");
          if (item) {
            activity = entry.activity;
            linkedItem = item;
            break;
          }
        }
      }
    }
    if (!activity) throw new Error("Unbekannte Aktivitaet: " + activityType);
  }

  // Pruefen: Spieler blockiert?
  const isBlocked = (state.appointments || []).some(a => a.status === "active");
  if (isBlocked) throw new Error("Du bist derzeit mit einer privaten Aktivitaet beschaeftigt.");

  // Pruefen: max 2 frei gestartete Aktivitaeten pro Spieltag
  const day = Math.floor(state.gameTime / DAY_MIN);
  const dayActivities = (state.appointments || []).filter(a =>
    a.type === "leisure" && Math.floor(a.startMin / DAY_MIN) === day && a.status !== "cancelled"
  ).length;
  if (dayActivities >= 2) throw new Error("Heute wurden bereits zwei Freizeitaktivitaeten gestartet.");

  // Pruefen: derselbe Typ hoechstens einmal pro Tag
  const sameTypeToday = (state.appointments || []).some(a =>
    a.subtype === activity.type && Math.floor(a.startMin / DAY_MIN) === day && a.status !== "cancelled"
  );
  if (sameTypeToday) throw new Error("Diese Aktivitaet wurde heute bereits durchgefuehrt.");

  // Pruefen: Konzert maximal einmal pro Spielwoche
  if (activity.maxPerWeek) {
    const weekStart = Math.floor(state.gameTime / (7 * DAY_MIN)) * 7 * DAY_MIN;
    const sameTypeThisWeek = (state.appointments || []).some(a =>
      a.subtype === activity.type && a.startMin >= weekStart && a.status !== "cancelled"
    );
    if (sameTypeThisWeek) throw new Error("Diese Aktivitaet ist nur einmal pro Spielwoche moeglich.");
  }

  // Preis und Gutschein pruefen
  let effectiveCost = activity.costCents || 0;
  let usedVoucherId = null;
  if (voucherId) {
    const voucher = (state.private?.rewards?.vouchers || []).find(v => v.id === voucherId);
    if (!voucher) throw new Error("Gutschein nicht gefunden.");
    if (voucher.status !== "available") throw new Error("Gutschein ist nicht verfuegbar.");
    if (voucher.activityType !== activity.type) throw new Error("Gutschein passt nicht zu dieser Aktivitaet.");
    if (voucher.priceCentsCovered < effectiveCost) {
      // Gutschein deckt nur Teilpreis - Differenz muss bezahlt werden
      effectiveCost = effectiveCost - voucher.priceCentsCovered;
    } else {
      effectiveCost = 0;
    }
    usedVoucherId = voucherId;
  }

  // Kosten bezahlen (effektiver Preis nach Gutschein)
  if (effectiveCost > 0) {
    if ((state.private?.accountCents || 0) < effectiveCost) {
      throw new Error("Privatkonto reicht fuer " + (effectiveCost / 100).toLocaleString("de-DE") + " EUR nicht aus.");
    }
    state.private.accountCents -= effectiveCost;
    state.bookings.push({ min: state.gameTime, cause: "Aktivitaet: " + activity.label, amountCents: -effectiveCost, account: "private", refId: "activity:" + activity.type });
  }

  // Gutschein reservieren (wird bei Beginn verbraucht)
  if (usedVoucherId) {
    const apptId = "ap_" + (state.idCounter = (state.idCounter || 100) + 1);
    const voucher = (state.private?.rewards?.vouchers || []).find(v => v.id === usedVoucherId);
    voucher.status = "reserved";
    voucher.reservedForAppointmentId = apptId;
  }

  // Termin anlegen
  const startMin = state.gameTime;
  const endMin = startMin + activity.durationMin;
  const apptId = "ap_" + (state.idCounter = (state.idCounter || 100) + 1);
  const appt = {
    id: apptId,
    type: "leisure",
    subtype: activity.type,
    label: activity.label,
    startMin,
    endMin,
    status: "active",
    effectsApplied: false,
    costCents: effectiveCost,
    originalCostCents: activity.costCents || 0,
    voucherId: usedVoucherId,
    linkedItemId: linkedItem?.id || null,
    stressDelta: activity.stressDelta,
    happinessDelta: activity.happinessDelta,
    contactDelta: activity.contactDelta || 0,
    isTrip: activity.isTrip || false,
  };
  state.appointments.push(appt);

  // Gutschein bei Beginn verbrauchen
  if (usedVoucherId) {
    const voucher = (state.private?.rewards?.vouchers || []).find(v => v.id === usedVoucherId);
    if (voucher && voucher.status === "reserved") {
      voucher.status = "used";
      voucher.usedAtMin = state.gameTime;
      voucher.reservedForAppointmentId = null;
    }
  }

  // Freizeit-Statistik aktualisieren
  state.leisureUsedDay = day;
  state.stats = state.stats || {};
  state.stats.leisureCount = (state.stats.leisureCount || 0) + 1;
  if (!(state.stats.leisureTypes || []).includes(activity.type)) state.stats.leisureTypes.push(activity.type);
  state.stats.hobbyCounts = state.stats.hobbyCounts || {};
  state.stats.hobbyCounts[activity.type] = (state.stats.hobbyCounts[activity.type] || 0) + 1;
  if (activity.isTrip) state.stats.tripsCompleted = (state.stats.tripsCompleted || 0) + 1;

  pushEvent(state, {
    type: "private_activity_started",
    gameTime: state.gameTime, isSystem: true,
    details: { activityType: activity.type, label: activity.label, costCents: effectiveCost, voucherId: usedVoucherId },
    dedupKey: "private_activity_started:" + apptId,
  });

  return { ok: true, appointmentId: apptId, activityType: activity.type, costCents: effectiveCost, voucherUsed: !!usedVoucherId };
}

// ---------- Aktivitaet stornieren (vor Beginn) ----------
// Gibt reservierten Gutschein wieder frei, keine Bargeldrueckzahlung fuer Gratisgutschein
export function cancelPrivateActivity(state, { appointmentId }) {
  const appt = (state.appointments || []).find(a => a.id === appointmentId);
  if (!appt) throw new Error("Termin nicht gefunden.");
  if (appt.status !== "accepted" && appt.status !== "active") throw new Error("Termin kann nicht storniert werden.");
  if (appt.type !== "leisure") throw new Error("Nur Freizeitaktivitaeten koennen hier storniert werden.");

  // Gutschein freigeben
  if (appt.voucherId) {
    const voucher = (state.private?.rewards?.vouchers || []).find(v => v.id === appt.voucherId);
    if (voucher && voucher.status === "reserved") {
      voucher.status = "available";
      voucher.reservedForAppointmentId = null;
    }
  }

  // Bezahlten Anteil zurueckerstatten (nur den effektiv bezahlten Anteil, nicht den Gutscheinnominalwert)
  if (appt.costCents > 0) {
    state.private.accountCents += appt.costCents;
    state.bookings.push({ min: state.gameTime, cause: "Storno: " + appt.label, amountCents: appt.costCents, account: "private", refId: "storno:" + appt.id });
  }

  appt.status = "cancelled";
  appt.cancelledAtMin = state.gameTime;

  // Freizeit-Statistik zuruecknehmen
  const day = Math.floor(appt.startMin / DAY_MIN);
  if (state.leisureUsedDay === day) state.leisureUsedDay = 0;
  state.stats = state.stats || {};
  state.stats.leisureCount = Math.max(0, (state.stats.leisureCount || 0) - 1);
  const types = state.stats.leisureTypes || [];
  const idx = types.indexOf(appt.subtype);
  if (idx >= 0 && !state.appointments.some(a => a.subtype === appt.subtype && a.id !== appt.id && a.status !== "cancelled")) {
    types.splice(idx, 1);
  }
  state.stats.hobbyCounts = state.stats.hobbyCounts || {};
  if (state.stats.hobbyCounts[appt.subtype]) state.stats.hobbyCounts[appt.subtype] = Math.max(0, state.stats.hobbyCounts[appt.subtype] - 1);

  return { ok: true };
}

// ---------- Taeglicher Unterhalt fuer Anschaffungen ----------
export function processDailyMaintenance(state, midnight) {
  const items = (state.private?.purchases?.items || []).filter(i => i.status === "active");
  let totalMaintenance = 0;
  let paid = 0;
  let unpaid = 0;
  for (const item of items) {
    totalMaintenance += item.maintenancePerDayCents || 0;
  }
  if (totalMaintenance > 0) {
    const bal = state.private?.accountCents || 0;
    paid = Math.min(bal, totalMaintenance);
    unpaid = totalMaintenance - paid;
    if (paid > 0) {
      state.private.accountCents -= paid;
      state.bookings.push({ min: midnight, cause: "Unterhalt: Anschaffungen", amountCents: -paid, account: "private", refId: "maintenance_daily" });
    }
    if (unpaid > 0) {
      state.openCosts.push({ id: "oc_" + (state.idCounter = (state.idCounter || 100) + 1), account: "private", cause: "Unterhalt Anschaffungen", amountCents: unpaid, refId: "maintenance_daily", createdAtMin: midnight });
    }
  }
  return { paid, unpaid, totalMaintenance };
}

// ---------- Abfragefunktionen ----------
export function getActivePurchases(state) {
  return (state.private?.purchases?.items || []).filter(i => i.status === "active");
}

export function getSoldPurchases(state) {
  return (state.private?.purchases?.items || []).filter(i => i.status === "sold");
}

export function getActiveHome(state) {
  const items = state.private?.purchases?.items || [];
  const activeHomeId = state.private?.purchases?.activeHomeId;
  if (activeHomeId) return items.find(i => i.id === activeHomeId && i.status === "active");
  return null;
}

export function getActivityOptions(state) {
  const options = [...BASIC_ACTIVITIES.map(a => ({ ...a, source: "basic", itemId: null }))];
  for (const item of (state.private?.purchases?.items || []).filter(i => i.status === "active")) {
    const entry = PURCHASE_CATALOG.find(p => p.id === item.catalogId);
    if (entry?.activity) {
      options.push({ ...entry.activity, source: "possession", itemId: item.id, itemName: item.name });
    }
  }
  return options;
}