import { retainLatestHistory } from "./historyRetention.ts";
// Dating-App-Engine für FERNWERK.
// Simuliert eine Dating-App im Privatleben: Profile durchsuchen, liken,
// Matches treffen, Dates gehen und eine neue Partnerschaft aufbauen.
// Verfügbar, wenn der Spieler single ist (nach Trennung oder Spielbeginn).

import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";
import { migrateRelationship } from "./relationshipEngine.ts";
import { onPartnershipEnded } from "./storyEngine.ts";

const DAY_MIN = 1440;
const PROFILES_MAX = 5;
const REFRESH_INTERVAL_MIN = 6 * 60; // 6 Spielstunden
const DATE_COST_CENTS = 5000; // 50 €
const DATE_DURATION_MIN = 180; // 3 Spielstunden
const PARTNER_THRESHOLD = 60; // Beziehungsfortschritt für "fest zusammen"
const PROFILE_IDS = ["p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08", "p09", "p10", "p11", "p12"];

const FIRST_NAMES_F = ["Lisa", "Anna", "Marie", "Sophie", "Laura", "Julia", "Sarah", "Hanna", "Lena", "Mia", "Eva", "Klara", "Nina", "Sandra", "Petra", "Jana", "Celina", "Nadine"];
const FIRST_NAMES_M = ["Daniel", "Thomas", "Stefan", "Markus", "Andreas", "Michael", "Christian", "Florian", "Jonas", "Lukas", "Philipp", "Niklas", "Sebastian", "Tobias", "Kevin", "Martin", "Felix", "Robert"];
const OCCUPATIONS = ["Lehrkraft", "Ärztin/Arzt", "Designer:in", "Journalist:in", "Köchin/Koch", "Buchhalter:in", "Frisör:in", "Pfleger:in", "Ingenieur:in", "Fotograf:in", "Musiker:in", "Architekt:in", "Mechatroniker", "Gärtner:in", "Verkäufer:in", "Schriftsteller:in"];
const INTERESTS = ["Wandern", "Kochen", "Lesen", "Kino", "Reisen", "Radfahren", "Musik", "Kunst", "Wein", "Yoga", "Gaming", "Handwerk", "Fotografie", "Gartenarbeit", "Schwimmen", "Ski fahren", "Kaffee", "Tiere"];
const BIOS = [
  "Liebt lange Spaziergänge und gute Gespräche.",
  "Sucht jemanden, der das Leben nicht zu ernst nimmt.",
  "Abenteurer:in mit Herz für gute Küche.",
  "Ruhig, aber mit viel Tiefgang.",
  "Kreativ, spontan, immer für ein Lachen zu haben.",
  "Naturmensch, der die Stadt trotzdem schätzt.",
  "Bücherwurm sucht Vorleser:in.",
  "Gourmet, der gerne teilt.",
  "Weltverbesserer:in mit Realismus.",
  "Sportlich, aber kein Extrem.",
];

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function rng(state) {
  const r = (state.rngSeed || 42) >>> 0;
  let x = r;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5; x >>>= 0;
  state.rngSeed = x;
  return x / 4294967296;
}

// ---------- Migration ----------

export function migrateDating(state) {
  if (!state.private) state.private = {};
  if (!state.private.dating) {
    state.private.dating = {
      profiles: [],
      matches: [],
      nextRefreshMin: state.gameTime + 60,
      dateHistory: [],
    };
  }
}

// ---------- Spieler-Profil-Score ----------

export function getPlayerProfileScore(state) {
  const p = state.private;
  let score = 50;
  score += ((p.happiness || 50) - 50) * 0.3;
  score -= ((p.stress || 50) - 50) * 0.2;
  if (p.accountCents > 500000) score += 8;
  if (p.accountCents > 2000000) score += 8;
  if (p.accountCents > 5000000) score += 4;
  return Math.max(10, Math.min(100, Math.round(score)));
}

// ---------- Profil-Erzeugung ----------

function generateProfile(state) {
  const isMale = rng(state) < 0.5;
  const namePool = isMale ? FIRST_NAMES_M : FIRST_NAMES_F;
  const name = namePool[Math.floor(rng(state) * namePool.length)];
  const portraitId = PROFILE_IDS[Math.floor(rng(state) * PROFILE_IDS.length)];
  const age = 25 + Math.floor(rng(state) * 25);
  const occupation = OCCUPATIONS[Math.floor(rng(state) * OCCUPATIONS.length)];
  const bio = BIOS[Math.floor(rng(state) * BIOS.length)];
  const numInterests = 2 + Math.floor(rng(state) * 3);
  const interests = [];
  const available = [...INTERESTS];
  for (let i = 0; i < numInterests; i++) {
    const idx = Math.floor(rng(state) * available.length);
    interests.push(available.splice(idx, 1)[0]);
  }
  const playerScore = getPlayerProfileScore(state);
  const baseCompat = 25 + Math.floor(rng(state) * 50);
  const compat = Math.max(10, Math.min(100, baseCompat + Math.floor((playerScore - 50) * 0.25)));
  return {
    id: uid(state, "dp"),
    name, portraitId, age, occupation, bio, interests,
    compatibility: compat,
    status: "new",
    dateCount: 0,
    relationshipProgress: 0,
    createdAtMin: state.gameTime,
  };
}

function refreshProfiles(state) {
  const dating = state.private.dating;
  const cutoff = state.gameTime - 24 * 60;
  dating.profiles = dating.profiles.filter(p =>
    p.status === "liked" || p.createdAtMin > cutoff
  );
  while (dating.profiles.length < PROFILES_MAX) {
    dating.profiles.push(generateProfile(state));
  }
  dating.nextRefreshMin = state.gameTime + REFRESH_INTERVAL_MIN;
}

// ---------- Abfragen ----------

export function getDatingStatus(state) {
  migrateDating(state);
  migrateRelationship(state);
  const dating = state.private.dating;
  if (dating.profiles.length === 0 || state.gameTime >= dating.nextRefreshMin) {
    refreshProfiles(state);
  }
  return {
    isSingle: state.private.relationshipStatus === "single" || !state.private.partnerName,
    playerScore: getPlayerProfileScore(state),
    profiles: dating.profiles,
    matches: dating.matches,
    nextRefreshMin: dating.nextRefreshMin,
    partnerThreshold: PARTNER_THRESHOLD,
    dateCostCents: DATE_COST_CENTS,
  };
}

// ---------- Liken / Passen ----------

export function likeProfile(state, { profileId }) {
  migrateDating(state);
  if (state.private.relationshipStatus !== "single" && state.private.partnerName) {
    throw new Error("Du bist nicht single.");
  }
  const dating = state.private.dating;
  const profile = dating.profiles.find(p => p.id === profileId);
  if (!profile) throw new Error("Profil nicht gefunden.");
  if (profile.status !== "new") throw new Error("Dieses Profil wurde bereits bewertet.");
  const matchChance = profile.compatibility / 100;
  const isMatch = rng(state) < matchChance;
  profile.status = "liked";
  if (isMatch) {
    dating.matches.push({ ...profile, matchedAtMin: state.gameTime });
    pushEvent(state, {
      type: "dating_match", gameTime: state.gameTime, isSystem: true,
      details: { name: profile.name, compatibility: profile.compatibility },
      dedupKey: "dating_match:" + profile.id,
    });
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Neues Match!",
      body: `Du hast ein neues Match auf der Dating-App: ${profile.name}, ${profile.age} – ${profile.occupation}. ${profile.bio} Ihr könnt jetzt ein Date vereinbaren!`,
      gameTime: state.gameTime, category: "personal", priority: "normal",
      dedupKey: "dating_match_mail:" + profile.id,
    });
    return { ok: true, matched: true, profile };
  }
  return { ok: true, matched: false, profile };
}

export function passProfile(state, { profileId }) {
  migrateDating(state);
  const dating = state.private.dating;
  const profile = dating.profiles.find(p => p.id === profileId);
  if (!profile) throw new Error("Profil nicht gefunden.");
  if (profile.status !== "new") throw new Error("Dieses Profil wurde bereits bewertet.");
  profile.status = "passed";
  return { ok: true };
}

// ---------- Date gehen ----------

export function goOnDate(state, { matchId }) {
  migrateDating(state);
  migrateRelationship(state);
  if (state.private.relationshipStatus !== "single" && state.private.partnerName) {
    throw new Error("Du bist nicht single.");
  }
  const dating = state.private.dating;
  const match = dating.matches.find(m => m.id === matchId);
  if (!match) throw new Error("Match nicht gefunden.");
  if (state.private.accountCents < DATE_COST_CENTS) {
    throw new Error("Privatkonto reicht für ein Date nicht aus (" + (DATE_COST_CENTS / 100) + " €).");
  }
  const activeAppt = (state.appointments || []).find(a => a.status === "active");
  if (activeAppt) throw new Error("Du bist bereits beschäftigt.");
  const apptId = uid(state, "ap");
  const startMin = state.gameTime;
  const endMin = startMin + DATE_DURATION_MIN;
  state.appointments.push({
    id: apptId,
    type: "date",
    subtype: "date",
    matchId: match.id,
    matchName: match.name,
    label: "Date mit " + match.name,
    startMin,
    endMin,
    status: "accepted",
    effectsApplied: false,
  });
  state.private.accountCents -= DATE_COST_CENTS;
  state.bookings.push({ min: startMin, cause: "Date: " + match.name, amountCents: -DATE_COST_CENTS, account: "private", refId: "date:" + match.id });
  match.dateCount = (match.dateCount || 0) + 1;
  return { ok: true, appointmentId: apptId, matchName: match.name, startMin, endMin };
}

// ---------- Date-Ergebnis verarbeiten ----------

export function processDateOutcome(state, appointment, m) {
  migrateDating(state);
  const dating = state.private.dating;
  const match = dating.matches.find(mm => mm.id === appointment.matchId);
  if (!match) return null;
  const baseSuccess = match.compatibility / 100;
  const luck = (rng(state) - 0.5) * 0.3;
  const success = Math.max(0, Math.min(1, baseSuccess + luck));
  const progressDelta = Math.round(success * 20);
  match.relationshipProgress = Math.min(100, (match.relationshipProgress || 0) + progressDelta);
  if (success > 0.6) {
    state.private.happiness = Math.min(100, (state.private.happiness || 0) + 3);
    state.private.stress = Math.max(0, (state.private.stress || 0) - 2);
  } else if (success < 0.3) {
    state.private.happiness = Math.max(0, (state.private.happiness || 0) - 2);
    state.private.stress = Math.min(100, (state.private.stress || 0) + 1);
  }
  dating.dateHistory.push({ matchId: match.id, matchName: match.name, atMin: m, success: Math.round(success * 100), progressDelta });
  if (dating.dateHistory.length > 50) dating.dateHistory = retainLatestHistory(state, "dates", dating.dateHistory, 50, null);
  pushEvent(state, {
    type: "date_completed", gameTime: m, isSystem: true,
    details: { matchName: match.name, success: Math.round(success * 100), progressDelta, relationshipProgress: match.relationshipProgress },
    dedupKey: "date_completed:" + match.id + ":" + m,
  });
  return { success: Math.round(success * 100), progressDelta };
}

// ---------- Partnerschaft begründen ----------

export function becomePartners(state, { matchId }) {
  migrateDating(state);
  migrateRelationship(state);
  if (state.private.relationshipStatus !== "single" && state.private.partnerName) {
    throw new Error("Du bist bereits in einer Beziehung.");
  }
  const dating = state.private.dating;
  const match = dating.matches.find(m => m.id === matchId);
  if (!match) throw new Error("Match nicht gefunden.");
  if ((match.relationshipProgress || 0) < PARTNER_THRESHOLD) {
    throw new Error("Eure Beziehung ist noch nicht tief genug (mindestens " + PARTNER_THRESHOLD + "/100 Fortschritt nötig, aktuell " + (match.relationshipProgress || 0) + ").");
  }
  state.private.partnerName = match.name;
  state.private.partnerId = match.id;
  state.private.relationshipStatus = "dating";
  state.private.relationship = Math.round(match.relationshipProgress * 0.7);
  state.private.happiness = Math.min(100, (state.private.happiness || 0) + 10);
  state.private.stress = Math.max(0, (state.private.stress || 0) - 3);
  dating.matches = dating.matches.filter(m => m.id !== matchId);
  dating.profiles = dating.profiles.filter(p => p.id !== matchId);
  pushEvent(state, {
    type: "new_partner", gameTime: state.gameTime, isSystem: true,
    details: { partnerName: match.name, relationship: state.private.relationship },
    dedupKey: "new_partner:" + match.id,
  });
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Neue Partnerschaft!",
    body: `Du und ${match.name} seid nun offiziell ein Paar! Eure Beziehung startet bei ${state.private.relationship}/100. Nutzt gemeinsame Aktivitäten, um sie weiter aufzubauen.`,
    gameTime: state.gameTime, category: "personal", priority: "high",
    dedupKey: "new_partner_mail:" + match.id,
  });
  return { ok: true, partnerName: match.name, relationship: state.private.relationship };
}

// ---------- Trennung ----------

export function breakUp(state) {
  migrateDating(state);
  migrateRelationship(state);
  if (state.private.relationshipStatus === "married") throw new Error("Eine Ehe kann nicht einfach so beendet werden.");
  if (state.private.relationshipStatus === "engaged") throw new Error("Eine Verlobung kann nicht einfach so beendet werden.");
  if (state.private.relationshipStatus !== "dating") throw new Error("Du bist nicht in einer Beziehung.");
  if (!state.private.partnerName) throw new Error("Du hast keinen Partner.");
  const exName = state.private.partnerName;
  const exPartnerId = state.private.partnerId;
  state.private.partnerName = null;
  state.private.partnerId = null;
  state.private.relationshipStatus = "single";
  state.private.relationship = 0;
  state.private.happiness = Math.max(0, (state.private.happiness || 0) - 15);
  state.private.stress = Math.min(100, (state.private.stress || 0) + 10);
  state.private.dating = {
    profiles: [],
    matches: [],
    nextRefreshMin: state.gameTime + 60,
    dateHistory: [],
  };
  pushEvent(state, {
    type: "breakup", gameTime: state.gameTime, isSystem: true,
    details: { exName },
    dedupKey: "breakup:" + state.gameTime,
  });
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Trennung",
    body: `Du und ${exName} habt euch getrennt. Nimm dir Zeit für dich.`,
    gameTime: state.gameTime, category: "personal", priority: "high",
    dedupKey: "breakup_mail:" + state.gameTime,
  });
  if (exPartnerId) onPartnershipEnded(state, exPartnerId);
  return { ok: true, exName };
}

// ---------- Date-Termine verarbeiten ----------

export function getDateEventTimes(state, t, maxMin) {
  const times = [];
  for (const a of (state.appointments || [])) {
    if (a.type === "date" && a.status === "accepted" && a.endMin > t && a.endMin <= maxMin) {
      times.push(a.endMin);
    }
  }
  return times;
}

export function processDates(state, m, log) {
  for (const a of (state.appointments || [])) {
    if (a.type !== "date") continue;
    if (a.status !== "done") continue;
    if (a.dateProcessed) continue;
    if (a.endMin !== m) continue;
    a.dateProcessed = true;
    const result = processDateOutcome(state, a, m);
    log.push({ type: "date_completed", appointment: a.id, ...result });
  }
}

// ---------- Command-Handler (wie handleDgCommand / handleInvestmentCommand) ----------

export function handleDatingCommand(state, command, p) {
  switch (command) {
    case "getDatingStatus": return { ok: true, ...getDatingStatus(state) };
    case "likeProfile": return likeProfile(state, { profileId: p.profileId });
    case "passProfile": return passProfile(state, { profileId: p.profileId });
    case "goOnDate": return goOnDate(state, { matchId: p.matchId });
    case "becomePartners": return becomePartners(state, { matchId: p.matchId });
    case "breakUp": return breakUp(state);
    default: return null;
  }
}