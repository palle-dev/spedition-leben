// Belohnungs-Engine für FERNWERK (Auftrag 26).
// Verwaltet Belohnungsansprueche, kosmetische Ausruestung und Erlebnisgutscheine.
// Trennung: rewardCatalog (statische Definitionen) - rewardEngine (Logik).

import { ACHIEVEMENTS } from "./achievementCatalog.ts";
import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";

// ---------- Belohnungskatalog (12 Belohnungen) ----------
// Jede Belohnung ist an eine bestehende Erfolgs-ID gebunden.
// type: cosmetic_title | cosmetic_border | cosmetic_decoration | cosmetic_album | cosmetic_entrance | cosmetic_garage | voucher
export const REWARDS = [
  { id: "reward_feierabend", achievementId: "life_first", type: "cosmetic_title",
    title: "Feierabend gehoert dazu", desc: "Ein Profil-Titel fuer deine erste freiwillige Aktivitaet.",
    slot: "title" },
  { id: "reward_wellness", achievementId: "life_five_types", type: "voucher",
    activityType: "wellness", priceCentsCovered: 12000,
    desc: "Ein Gutschein fuer den Wellnessnachmittag - uebernimmt 120 EUR Buchungspreis." },
  { id: "reward_hobby", achievementId: "hobby_five", type: "cosmetic_decoration",
    title: "Hobby-Motiv", desc: "Ein ausruestbares Hobby-Motiv fuer eine Dekorationsflaeche zuhause.",
    slot: "decoration" },
  { id: "reward_moments", achievementId: "promise_three", type: "cosmetic_album",
    title: "Gemeinsame Momente", desc: "Ein waehlbares Album-Cover mit echten Erinnerungen.",
    slot: "albumCover" },
  { id: "reward_cooking", achievementId: "promise_ten", type: "voucher",
    activityType: "cooking", priceCentsCovered: 3500,
    desc: "Ein Gutschein fuer Gemeinsam kochen - uebernimmt 35 EUR Preis." },
  { id: "reward_balance", achievementId: "balance_seven", type: "voucher",
    activityType: "concert", priceCentsCovered: 10000,
    desc: "Ein Gutschein fuer den Konzertabend - uebernimmt 100 EUR Preis." },
  { id: "reward_time", achievementId: "life_twenty", type: "cosmetic_title",
    title: "Zeit fuer mich", desc: "Eine Profilgestaltung fuer zwanzig freiwillige Aktivitaeten.",
    slot: "title" },
  { id: "reward_travel", achievementId: "experience_trip", type: "cosmetic_album",
    title: "Reisetagebuch", desc: "Ein Reisetagebuch-Cover mit der ersten abgeschlossenen Reise.",
    slot: "albumCover" },
  { id: "reward_home_start", achievementId: "purchase_first", type: "cosmetic_decoration",
    title: "Mein eigener Weg", desc: "Ein dekoratives Wandmotiv fuer den ersten privaten Kauf.",
    slot: "decoration" },
  { id: "reward_key", achievementId: "home_owner", type: "cosmetic_entrance",
    title: "Eingangstafel", desc: "Eine waehlbare Eingangstafel fuer den Hauptwohnsitz.",
    slot: "entrance" },
  { id: "reward_garage", achievementId: "car_first", type: "cosmetic_garage",
    title: "Erste Ausfahrt", desc: "Eine waehlbare Garagengestaltung fuer das erste eigene Auto.",
    slot: "garage" },
  { id: "reward_independent", achievementId: "private_100k", type: "cosmetic_border",
    title: "Angekommen", desc: "Ein Profilrahmen fuer 100.000 EUR privates Nettovermoegen.",
    slot: "border" },
];

export const REWARD_SLOTS = ["title", "border", "decoration", "albumCover", "entrance", "garage"];

export const SLOT_LABELS = {
  title: "Profil-Titel",
  border: "Profilrahmen",
  decoration: "Wohnungsdekoration",
  albumCover: "Album-Cover",
  entrance: "Eingangstafel",
  garage: "Garagenthema",
};

// ---------- Migration ----------
export function migrateRewards(state) {
  if (!state.private) state.private = {};
  if (!state.private.rewards) state.private.rewards = { claims: {}, cosmetics: {}, vouchers: [] };
  if (!state.private.rewards.claims) state.private.rewards.claims = {};
  if (!state.private.rewards.cosmetics) state.private.rewards.cosmetics = {};
  if (!state.private.rewards.vouchers) state.private.rewards.vouchers = [];
  for (const slot of REWARD_SLOTS) {
    if (state.private.rewards.cosmetics[slot] === undefined) {
      state.private.rewards.cosmetics[slot] = null;
    }
  }
  mapAchievementsToRewards(state);
}

// Prueft alle Erfolge und erzeugt bei Bedarf offene Ansprueche.
export function mapAchievementsToRewards(state) {
  const achievements = state.achievements || [];
  const claims = state.private?.rewards?.claims || {};
  const newClaims = [];
  for (const reward of REWARDS) {
    const ach = achievements.find(a => a.id === reward.achievementId);
    if (!ach || !ach.unlocked) continue;
    if (claims[reward.id]) continue;
    claims[reward.id] = {
      rewardId: reward.id,
      achievementId: reward.achievementId,
      status: "available",
      availableSinceMin: state.gameTime || 0,
      claimedAtMin: null,
    };
    newClaims.push(reward.id);
  }
  return newClaims;
}

// Ansprueche pruefen und Ereignisse erzeugen
export function checkRewardClaims(state) {
  const newClaims = mapAchievementsToRewards(state);
  for (const rewardId of newClaims) {
    const reward = REWARDS.find(r => r.id === rewardId);
    pushEvent(state, {
      type: "reward_available",
      gameTime: state.gameTime, isSystem: true,
      details: { rewardId, rewardTitle: reward?.title, rewardType: reward?.type },
      dedupKey: "reward_available:" + rewardId,
    });
  }
}

// ---------- Belohnung abholen ----------
export function claimReward(state, { rewardId }) {
  const reward = REWARDS.find(r => r.id === rewardId);
  if (!reward) throw new Error("Unbekannte Belohnung: " + rewardId);
  const claims = state.private?.rewards?.claims || {};
  const claim = claims[rewardId];
  if (!claim) throw new Error("Diese Belohnung ist noch nicht verfuegbar.");
  if (claim.status === "claimed") throw new Error("Diese Belohnung wurde bereits abgeholt.");

  claim.status = "claimed";
  claim.claimedAtMin = state.gameTime;

  if (reward.type === "voucher") {
    const voucher = {
      id: "v_" + (state.idCounter = (state.idCounter || 100) + 1),
      rewardId: reward.id,
      activityType: reward.activityType,
      priceCentsCovered: reward.priceCentsCovered,
      status: "available",
      reservedForAppointmentId: null,
      createdAtMin: state.gameTime,
      usedAtMin: null,
    };
    state.private.rewards.vouchers.push(voucher);
    pushEvent(state, {
      type: "reward_claimed",
      gameTime: state.gameTime, isSystem: true,
      details: { rewardId, rewardType: "voucher", voucherId: voucher.id, activityType: reward.activityType },
      dedupKey: "reward_claimed:" + rewardId,
    });
    return { ok: true, rewardId, type: "voucher", voucherId: voucher.id };
  } else {
    pushEvent(state, {
      type: "reward_claimed",
      gameTime: state.gameTime, isSystem: true,
      details: { rewardId, rewardType: "cosmetic", slot: reward.slot },
      dedupKey: "reward_claimed:" + rewardId,
    });
    return { ok: true, rewardId, type: "cosmetic", slot: reward.slot };
  }
}

// Alle verfuegbaren Belohnungen abholen (idempotent)
export function claimAllRewards(state) {
  const claims = state.private?.rewards?.claims || {};
  const results = [];
  for (const rewardId of Object.keys(claims)) {
    if (claims[rewardId].status === "available") {
      try {
        const r = claimReward(state, { rewardId });
        results.push(r);
      } catch (e) { /* ueberspringen */ }
    }
  }
  return { ok: true, claimed: results };
}

// ---------- Kosmetik ausruesten/ablegen ----------
export function equipCosmetic(state, { rewardId }) {
  const reward = REWARDS.find(r => r.id === rewardId);
  if (!reward) throw new Error("Unbekannte Belohnung.");
  if (!reward.slot) throw new Error("Diese Belohnung ist nicht ausruestbar.");
  const claims = state.private?.rewards?.claims || {};
  const claim = claims[rewardId];
  if (!claim || claim.status !== "claimed") throw new Error("Diese Belohnung muss zuerst abgeholt werden.");
  state.private.rewards.cosmetics[reward.slot] = rewardId;
  return { ok: true, rewardId, slot: reward.slot };
}

export function unequipCosmetic(state, { slot }) {
  if (!REWARD_SLOTS.includes(slot)) throw new Error("Unbekannter Ausruestungsplatz: " + slot);
  state.private.rewards.cosmetics[slot] = null;
  return { ok: true, slot };
}

// ---------- Gutscheine ----------
export function findVoucherForActivity(state, activityType) {
  return (state.private?.rewards?.vouchers || []).find(
    v => v.activityType === activityType && v.status === "available"
  );
}

export function reserveVoucher(state, { voucherId, appointmentId }) {
  const voucher = (state.private?.rewards?.vouchers || []).find(v => v.id === voucherId);
  if (!voucher) throw new Error("Gutschein nicht gefunden.");
  if (voucher.status !== "available") throw new Error("Gutschein ist nicht mehr verfuegbar.");
  voucher.status = "reserved";
  voucher.reservedForAppointmentId = appointmentId;
  return { ok: true, voucherId };
}

export function consumeVoucher(state, { voucherId }) {
  const voucher = (state.private?.rewards?.vouchers || []).find(v => v.id === voucherId);
  if (!voucher) throw new Error("Gutschein nicht gefunden.");
  if (voucher.status === "used") throw new Error("Gutschein bereits verbraucht.");
  voucher.status = "used";
  voucher.usedAtMin = state.gameTime;
  voucher.reservedForAppointmentId = null;
  return { ok: true, voucherId };
}

export function releaseVoucher(state, { voucherId }) {
  const voucher = (state.private?.rewards?.vouchers || []).find(v => v.id === voucherId);
  if (!voucher) throw new Error("Gutschein nicht gefunden.");
  if (voucher.status !== "reserved") throw new Error("Nur reservierte Gutscheine koennen freigegeben werden.");
  voucher.status = "available";
  voucher.reservedForAppointmentId = null;
  return { ok: true, voucherId };
}

// ---------- Abfragefunktionen ----------
export function getRewardStatus(state, rewardId) {
  const claim = state.private?.rewards?.claims?.[rewardId];
  if (!claim) return "locked";
  return claim.status;
}

export function getAvailableClaims(state) {
  const claims = state.private?.rewards?.claims || {};
  return Object.values(claims).filter(c => c.status === "available");
}

export function getClaimedRewards(state) {
  const claims = state.private?.rewards?.claims || {};
  return Object.values(claims).filter(c => c.status === "claimed");
}

export function getEquippedCosmetics(state) {
  return state.private?.rewards?.cosmetics || {};
}

export function getVouchers(state) {
  return state.private?.rewards?.vouchers || [];
}

export function getAvailableVouchers(state) {
  return (state.private?.rewards?.vouchers || []).filter(v => v.status === "available");
}