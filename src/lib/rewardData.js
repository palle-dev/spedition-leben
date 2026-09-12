// Frontend-Spiegel der Belohnungs-Engine (Auftrag 26).

export const REWARDS = [
  { id: "reward_feierabend", achievementId: "life_first", type: "cosmetic_title",
    title: "Feierabend gehört dazu", desc: "Ein Profil-Titel für deine erste freiwillige Aktivität.", slot: "title" },
  { id: "reward_wellness", achievementId: "life_five_types", type: "voucher",
    activityType: "wellness", priceCentsCovered: 12000,
    desc: "Gutschein für den Wellnessnachmittag – übernimmt 120 €." },
  { id: "reward_hobby", achievementId: "hobby_five", type: "cosmetic_decoration",
    title: "Hobby-Motiv", desc: "Ausrüstbares Hobby-Motiv für eine Dekorationsfläche.", slot: "decoration" },
  { id: "reward_moments", achievementId: "promise_three", type: "cosmetic_album",
    title: "Gemeinsame Momente", desc: "Wählbares Album-Cover mit echten Erinnerungen.", slot: "albumCover" },
  { id: "reward_cooking", achievementId: "promise_ten", type: "voucher",
    activityType: "cooking", priceCentsCovered: 3500,
    desc: "Gutschein für Gemeinsam kochen – übernimmt 35 €." },
  { id: "reward_balance", achievementId: "balance_seven", type: "voucher",
    activityType: "concert", priceCentsCovered: 10000,
    desc: "Gutschein für den Konzertabend – übernimmt 100 €." },
  { id: "reward_time", achievementId: "life_twenty", type: "cosmetic_title",
    title: "Zeit für mich", desc: "Profilgestaltung für 20 freiwillige Aktivitäten.", slot: "title" },
  { id: "reward_travel", achievementId: "experience_trip", type: "cosmetic_album",
    title: "Reisetagebuch", desc: "Reisetagebuch-Cover mit erster abgeschlossener Reise.", slot: "albumCover" },
  { id: "reward_home_start", achievementId: "purchase_first", type: "cosmetic_decoration",
    title: "Mein eigener Weg", desc: "Dekoratives Wandmotiv für den ersten privaten Kauf.", slot: "decoration" },
  { id: "reward_key", achievementId: "home_owner", type: "cosmetic_entrance",
    title: "Eingangstafel", desc: "Wählbare Eingangstafel für den Hauptwohnsitz.", slot: "entrance" },
  { id: "reward_garage", achievementId: "car_first", type: "cosmetic_garage",
    title: "Erste Ausfahrt", desc: "Wählbare Garagengestaltung für das erste Auto.", slot: "garage" },
  { id: "reward_independent", achievementId: "private_100k", type: "cosmetic_border",
    title: "Angekommen", desc: "Profilrahmen für 100.000 € privates Nettovermögen.", slot: "border" },
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

export const REWARD_TYPE_ICONS = {
  cosmetic_title: "Award",
  cosmetic_border: "Frame",
  cosmetic_decoration: "Palette",
  cosmetic_album: "BookHeart",
  cosmetic_entrance: "DoorOpen",
  cosmetic_garage: "Car",
  voucher: "Ticket",
};

export function getRewardById(id) {
  return REWARDS.find(r => r.id === id);
}

export function getRewardStatus(claims, rewardId) {
  const claim = claims?.[rewardId];
  if (!claim) return "locked";
  return claim.status;
}

export function getAchievementProgress(state, achievementId) {
  const ach = (state.achievements || []).find(a => a.id === achievementId);
  if (!ach) return { current: 0, target: 1, unlocked: false };
  // Import from achievementCatalog would be ideal but we keep it simple
  return { unlocked: ach.unlocked, seen: ach.seen };
}