// Beziehungs-Engine für FERNWERK.
// Verwaltet Beziehungsstatus (Dating → Verlobt → Verheiratet), Heirat,
// Kinderplanung, Schwangerschaft, Geburt und jährliche Lebensereignisse.

import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";
import { onPartnershipEnded } from "./storyEngine.ts";

const DAY_MIN = 1440;
const PREGNANCY_DAYS = 14; // Spiel-Tage bis Geburt
const RING_COST = 500000; // 5.000 €
const WEDDING_COST = 1500000; // 15.000 €
const MAX_CHILDREN = 4;

const CHILD_NAMES = [
  "Lena", "Finn", "Mia", "Leon", "Emma", "Paul", "Sophie", "Jonas",
  "Marie", "Felix", "Hannah", "Maximilian", "Lina", "Theo", "Ida", "Bruno",
];

// ---------- Geschenke (sofortige Beziehungs-Steigerung) ----------

const GIFTS = [
  { id: "chocolate", label: "Schokolade", costCents: 800, contactDelta: 2, happinessDelta: 1, maxPerDay: 2 },
  { id: "flowers_small", label: "Blumenstrauß", costCents: 2500, contactDelta: 4, happinessDelta: 2, maxPerDay: 1 },
  { id: "jewelry", label: "Schmuck", costCents: 20000, contactDelta: 8, happinessDelta: 4, maxPerDay: 1 },
  { id: "surprise", label: "Überraschungsgeschenk", costCents: 5000, contactDelta: 5, happinessDelta: 3, maxPerDay: 1 },
];

export function getGiftOptions(state) {
  migrateRelationship(state);
  const day = Math.floor(state.gameTime / DAY_MIN);
  const todayGifts = (state.private.giftLog || []).filter(g => Math.floor(g.min / DAY_MIN) === day);
  return GIFTS.map(g => {
    const usedToday = todayGifts.filter(t => t.giftId === g.id).length;
    return {
      ...g,
      usedToday,
      remaining: Math.max(0, g.maxPerDay - usedToday),
      available: usedToday < g.maxPerDay && state.private.accountCents >= g.costCents,
    };
  });
}

export function giveGift(state, { giftId }) {
  migrateRelationship(state);
  const gift = GIFTS.find(g => g.id === giftId);
  if (!gift) throw new Error("Unbekanntes Geschenk: " + giftId);
  if (state.private.accountCents < gift.costCents) {
    throw new Error("Privatkonto reicht fuer " + gift.label + " nicht aus (" + (gift.costCents / 100).toLocaleString("de-DE") + " EUR).");
  }
  const day = Math.floor(state.gameTime / DAY_MIN);
  if (!state.private.giftLog) state.private.giftLog = [];
  const usedToday = state.private.giftLog.filter(g => Math.floor(g.min / DAY_MIN) === day && g.giftId === giftId).length;
  if (usedToday >= gift.maxPerDay) {
    throw new Error(gift.label + " wurde heute bereits maximal oft verschenkt.");
  }
  state.private.accountCents -= gift.costCents;
  state.private.relationship = Math.min(100, (state.private.relationship || 0) + gift.contactDelta);
  state.private.happiness = Math.min(100, (state.private.happiness || 0) + gift.happinessDelta);
  state.private.stress = Math.max(0, (state.private.stress || 0) - 1);
  state.private.giftLog.push({ giftId, min: state.gameTime });
  if (state.private.giftLog.length > 100) state.private.giftLog = state.private.giftLog.slice(-100);
  state.bookings.push({ min: state.gameTime, cause: "Geschenk: " + gift.label, amountCents: -gift.costCents, account: "private", refId: "gift:" + giftId });
  pushEvent(state, {
    type: "gift_given", gameTime: state.gameTime, isSystem: true,
    details: { gift: gift.label, costCents: gift.costCents, contactDelta: gift.contactDelta },
    dedupKey: "gift_given:" + state.gameTime + ":" + giftId,
  });
  return { ok: true, gift: gift.label, contactDelta: gift.contactDelta, relationship: state.private.relationship };
}

// ---------- Migration ----------

export function migrateRelationship(state) {
  if (!state.private) state.private = {};
  if (!state.private.relationshipStatus) state.private.relationshipStatus = "dating";
  if (!state.private.children) state.private.children = [];
  if (state.private.pregnancy === undefined) state.private.pregnancy = null;
  if (state.private.marriageDate === undefined) state.private.marriageDate = null;
  if (state.private.engagementDate === undefined) state.private.engagementDate = null;
  if (!state.private.giftLog) state.private.giftLog = [];
  if (state.private.partnerId === undefined) state.private.partnerId = state.private.partnerName ? "partner_existing" : null;
}

// ---------- Abfragen ----------

export function getRelationshipStatus(state) {
  migrateRelationship(state);
  const children = (state.private.children || []).map(c => ({
    ...c,
    ageDays: Math.floor((state.gameTime - c.birthMin) / DAY_MIN),
  }));
  return {
    status: state.private.relationshipStatus,
    partnerName: state.private.partnerName,
    relationship: state.private.relationship,
    marriageDate: state.private.marriageDate,
    engagementDate: state.private.engagementDate,
    children,
    pregnancy: state.private.pregnancy,
    canPropose: state.private.relationshipStatus === "dating" && state.private.relationship >= 70 && state.private.accountCents >= RING_COST,
    canMarry: state.private.relationshipStatus === "engaged" && state.private.accountCents >= WEDDING_COST,
    canPlanChild: state.private.relationshipStatus === "married" && state.private.relationship >= 75 && !state.private.pregnancy && children.length < MAX_CHILDREN,
    ringCost: RING_COST,
    weddingCost: WEDDING_COST,
    pregnancyDays: PREGNANCY_DAYS,
    maxChildren: MAX_CHILDREN,
  };
}

// ---------- Verlobung ----------

export function proposeMarriage(state) {
  migrateRelationship(state);
  if (state.private.relationshipStatus !== "dating") throw new Error("Ihr seid bereits verlobt oder verheiratet.");
  if (state.private.relationship < 70) throw new Error("Eure Beziehung ist zu schwach für einen Antrag (mindestens 70/100).");
  if (state.private.accountCents < RING_COST) throw new Error("Privatkonto reicht für den Verlobungsring nicht aus (" + (RING_COST / 100).toLocaleString("de-DE") + " €).");
  state.private.accountCents -= RING_COST;
  state.private.relationshipStatus = "engaged";
  state.private.engagementDate = state.gameTime;
  state.private.relationship = Math.min(100, state.private.relationship + 5);
  state.private.happiness = Math.min(100, state.private.happiness + 8);
  state.private.stress = Math.max(0, state.private.stress - 3);
  state.bookings.push({ min: state.gameTime, cause: "Verlobungsring", amountCents: -RING_COST, account: "private", refId: "engagement" });
  pushEvent(state, {
    type: "engagement", gameTime: state.gameTime, isSystem: true,
    details: { partnerName: state.private.partnerName, costCents: RING_COST },
    dedupKey: "engagement:" + state.gameTime,
  });
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Verlobung!",
    body: state.private.partnerName + " hat ja gesagt! Ihr seid nun verlobt. Herzlichen Glückwunsch! Wenn ihr bereit seid, könnt ihr die Hochzeit planen.",
    gameTime: state.gameTime, category: "personal", priority: "high",
    dedupKey: "engagement_mail:" + state.gameTime,
  });
  return { ok: true, status: "engaged" };
}

// ---------- Hochzeit ----------

export function getMarried(state) {
  migrateRelationship(state);
  if (state.private.relationshipStatus !== "engaged") throw new Error("Ihr müsst erst verlobt sein, um zu heiraten.");
  if (state.private.accountCents < WEDDING_COST) throw new Error("Privatkonto reicht für die Hochzeit nicht aus (" + (WEDDING_COST / 100).toLocaleString("de-DE") + " €).");
  state.private.accountCents -= WEDDING_COST;
  state.private.relationshipStatus = "married";
  state.private.marriageDate = state.gameTime;
  state.private.relationship = Math.min(100, state.private.relationship + 10);
  state.private.happiness = Math.min(100, state.private.happiness + 10);
  state.private.stress = Math.max(0, state.private.stress - 5);
  state.bookings.push({ min: state.gameTime, cause: "Hochzeit", amountCents: -WEDDING_COST, account: "private", refId: "wedding" });
  pushEvent(state, {
    type: "wedding", gameTime: state.gameTime, isSystem: true,
    details: { partnerName: state.private.partnerName, costCents: WEDDING_COST },
    dedupKey: "wedding:" + state.gameTime,
  });
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Hochzeit!",
    body: "Ihr habt geheiratet! " + state.private.partnerName + " und du seid nun ein Ehepaar. Alles Gute für eure gemeinsame Zukunft!",
    gameTime: state.gameTime, category: "personal", priority: "high",
    dedupKey: "wedding_mail:" + state.gameTime,
  });
  return { ok: true, status: "married" };
}

// ---------- Kinder planen ----------

export function planChild(state) {
  migrateRelationship(state);
  if (state.private.relationshipStatus !== "married") throw new Error("Ihr müsst verheiratet sein, um Kinder zu planen.");
  if (state.private.relationship < 75) throw new Error("Eure Beziehung ist zu schwach (mindestens 75/100).");
  if (state.private.pregnancy) throw new Error("Ihr erwartet bereits ein Kind.");
  if ((state.private.children || []).length >= MAX_CHILDREN) throw new Error("Ihr habt bereits das Maximum an Kindern erreicht.");
  state.private.pregnancy = {
    startMin: state.gameTime,
    dueMin: state.gameTime + PREGNANCY_DAYS * DAY_MIN,
    status: "expecting",
  };
  state.private.happiness = Math.min(100, state.private.happiness + 5);
  pushEvent(state, {
    type: "pregnancy_announced", gameTime: state.gameTime, isSystem: true,
    details: { partnerName: state.private.partnerName, dueMin: state.private.pregnancy.dueMin },
    dedupKey: "pregnancy_announced:" + state.gameTime,
  });
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Wir erwarten ein Kind!",
    body: state.private.partnerName + " und du erwartet ein Kind! Die Geburt wird in etwa " + PREGNANCY_DAYS + " Spiel-Tagen erwartet.",
    gameTime: state.gameTime, category: "personal", priority: "high",
    dedupKey: "pregnancy_mail:" + state.gameTime,
  });
  return { ok: true, dueMin: state.private.pregnancy.dueMin };
}

// ---------- Schwangerschaft verarbeiten (Ereignisgesteuert) ----------

export function processPregnancy(state, m, log) {
  if (!state.private?.pregnancy) return;
  if (state.private.pregnancy.status !== "expecting") return;
  if (state.private.pregnancy.dueMin !== m) return;
  migrateRelationship(state);
  const usedNames = new Set((state.private.children || []).map(c => c.name));
  const available = CHILD_NAMES.filter(n => !usedNames.has(n));
  const name = available.length > 0
    ? available[Math.floor(Math.random() * available.length)]
    : "Kind " + ((state.private.children || []).length + 1);
  state.idCounter = (state.idCounter || 100) + 1;
  const child = {
    id: "child_" + state.idCounter,
    name,
    birthMin: m,
    gender: Math.random() < 0.5 ? "male" : "female",
  };
  state.private.children.push(child);
  state.private.pregnancy = null;
  state.private.happiness = Math.min(100, state.private.happiness + 15);
  state.private.relationship = Math.min(100, state.private.relationship + 5);
  state.private.stress = Math.min(100, state.private.stress + 10);
  log.push({ type: "child_born", child: child.id, name: child.name, atMin: m });
  pushEvent(state, {
    type: "child_born", gameTime: m, isSystem: true,
    details: { name: child.name, gender: child.gender },
    dedupKey: "child_born:" + child.id,
  });
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Herzlichen Glückwunsch!",
    body: state.private.partnerName + " hat " + child.name + " zur Welt gebracht! Mutter und Kind sind wohlauf.",
    gameTime: m, category: "personal", priority: "high",
    dedupKey: "child_born_mail:" + child.id,
  });
}

export function getPregnancyEventTimes(state, t, maxMin) {
  const times = [];
  if (state.private?.pregnancy?.status === "expecting") {
    const due = state.private.pregnancy.dueMin;
    if (due > t && due <= maxMin) times.push(due);
  }
  return times;
}

// ---------- Tägliche Beziehungsdynamik & Lebensereignisse ----------

export function processDailyRelationship(state, midnight) {
  migrateRelationship(state);
  // Verheiratet: kleine tägliche Beziehungssteigerung
  if (state.private.relationshipStatus === "married") {
    state.private.relationship = Math.min(100, state.private.relationship + 0.3);
  }
  // Kinder: täglicher Stress, aber auch Zufriedenheit
  const childCount = (state.private.children || []).length;
  if (childCount > 0) {
    state.private.stress = Math.min(100, state.private.stress + childCount * 0.5);
    state.private.happiness = Math.min(100, state.private.happiness + childCount * 0.3);
  }
  // Beziehung klingt leicht ab, wenn keine Aktivitäten stattfinden
  state.private.relationship = Math.max(0, state.private.relationship - 0.2);

  // Kindergeburtstage
  for (const child of (state.private.children || [])) {
    const ageDays = Math.floor((midnight - child.birthMin) / DAY_MIN);
    const prevAgeDays = Math.floor((midnight - DAY_MIN - child.birthMin) / DAY_MIN);
    if (ageDays > prevAgeDays && ageDays % 365 === 0 && ageDays > 0) {
      pushEvent(state, {
        type: "child_birthday", gameTime: midnight, isSystem: true,
        details: { name: child.name, ageYears: ageDays / 365 },
        dedupKey: "child_birthday:" + child.id + ":" + ageDays,
      });
      state.private.happiness = Math.min(100, state.private.happiness + 2);
    }
  }
  // Hochzeitstag
  if (state.private.marriageDate !== null) {
    const annivDays = Math.floor((midnight - state.private.marriageDate) / DAY_MIN);
    const prevAnnivDays = Math.floor((midnight - DAY_MIN - state.private.marriageDate) / DAY_MIN);
    if (annivDays > prevAnnivDays && annivDays % 365 === 0 && annivDays > 0) {
      pushEvent(state, {
        type: "wedding_anniversary", gameTime: midnight, isSystem: true,
        details: { years: annivDays / 365, partnerName: state.private.partnerName },
        dedupKey: "wedding_anniversary:" + annivDays,
      });
      state.private.happiness = Math.min(100, state.private.happiness + 3);
      state.private.relationship = Math.min(100, state.private.relationship + 3);
    }
  }
}