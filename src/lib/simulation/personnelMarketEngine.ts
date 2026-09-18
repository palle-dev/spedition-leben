// Personalmarkt-Engine für FERNWERK – Auftrag 29.
// Deutlich erweiterter Bewerbermarkt mit skaliendem Zielbestand,
// regelmäßigen Wellen, bedarfsbezogenem Nachschub, Stellen-Ausschreibungen
// und Ablauf-Verwaltung. Reine Logik – keine Auth, keine Speicherung.

import {
  PERSONNEL_ROLES, PORTRAIT_IDS, mulberry32, dayOf, formatGameTime, CITIES,
} from "./gameRules.ts";
import { deliverMessage } from "./mailEngine.ts";

// ---------- Konstanten ----------

const PM_VERSION = 1;
const APPLICANT_EXPIRY_MIN = 7 * 1440; // 7 Spieltage
const BATCH_LIMIT = 200;
const REGULAR_WAVE_TIMES = [480, 840]; // 08:00 und 14:00
const DEMAND_WAVE_START = 480;  // 08:00
const DEMAND_WAVE_END = 1080;   // 18:00

// Start-Driver sind bereits eingestellt und dürfen nicht im Bewerberpool erscheinen
const STARTING_DRIVER_NAMES = ["Klaus Werner", "Petra Süß", "Helmut Fuchs"];

// Namens-Pools – groß genug für Wachstum (30 × 48 = 1440 Kombinationen je Geschlecht)
const FIRST_NAMES_M = [
  "Klaus", "Stefan", "Tobias", "Manfred", "Veit", "Rüdiger", "Friedhelm",
  "Helmut", "Werner", "Peter", "Hans", "Jürgen", "Dieter", "Frank", "Thomas",
  "Andreas", "Michael", "Bernd", "Wolfgang", "Günter", "Karl", "Otto",
  "Heinrich", "Ludwig", "Friedrich", "Gerd", "Uwe", "Hartmut", "Siegfried",
  "Lorenz",
];
const FIRST_NAMES_F = [
  "Greta", "Petra", "Helena", "Anke", "Silke", "Tanja", "Dorothee", "Mara",
  "Lisa", "Anna", "Barbara", "Christa", "Elisabeth", "Gertrud", "Hilde",
  "Ingrid", "Karin", "Lena", "Maria", "Nina", "Olga", "Renate", "Sabine",
  "Ursula", "Bärbel", "Christine", "Heike", "Monika", "Sandra", "Ulrike",
];
const LAST_NAMES = [
  "Möller", "Brandt", "Kloth", "Voss", "Mai", "Ruge", "Paasch", "Quaas",
  "Brod", "Hennig", "Karger", "Saar", "Süß", "Fuchs", "Meyer", "Petersen",
  "Jansen", "Schwarz", "Lange", "Wagner", "Hansen", "Storm", "Keller",
  "Müller", "Weber", "Becker", "Stahl", "Greif", "Schmidt", "Bauer",
  "Hoffmann", "König", "Walter", "Klein", "Groß", "Hartmann", "Bergmann",
  "Fischer", "Schäfer", "Lehmann", "Krause", "Herrmann", "Neumann", "Schulz",
  "Vogel", "Engel", "Brand",
];

// ---------- Hilfsfunktionen ----------

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

// Eigener Zufallsstrom für den Personalmarkt – unabhängig vom Haupt-RNG.
function pmRng(state) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  const r = mulberry32(state.personnelMarket.rngSeed >>> 0);
  const v = r();
  state.personnelMarket.rngSeed = (Math.floor(v * 4294967296)) >>> 0;
  return v;
}

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

// Sammelt alle bereits verwendeten Namen (eingestellt + verfügbar + Start-Fahrer)
function getUsedNames(state) {
  const used = new Set(STARTING_DRIVER_NAMES);
  for (const a of state.availableApplicants || []) used.add(a.name);
  for (const d of state.drivers || []) used.add(d.name);
  for (const e of state.employees || []) used.add(e.name);
  return used;
}

// Erzeugt einen eindeutigen Namen aus den Namens-Pools.
function generateUniqueName(state, rng, usedNames) {
  const maxAttempts = 200;
  for (let i = 0; i < maxAttempts; i++) {
    const fn = rng() < 0.5 ? pickRandom(FIRST_NAMES_M, rng) : pickRandom(FIRST_NAMES_F, rng);
    const ln = pickRandom(LAST_NAMES, rng);
    const name = fn + " " + ln;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  // Fallback: Nummer anhängen
  const fn = pickRandom(FIRST_NAMES_M, rng);
  const ln = pickRandom(LAST_NAMES, rng);
  const name = fn + " " + ln + " II";
  usedNames.add(name);
  return name;
}

// Weist deterministisch ein Porträt zu (Zyklus durch PORTRAIT_IDS).
function assignPortrait(state) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  const idx = (state.personnelMarket.portraitCounter || 0) % PORTRAIT_IDS.length;
  state.personnelMarket.portraitCounter = (state.personnelMarket.portraitCounter || 0) + 1;
  return PORTRAIT_IDS[idx];
}

// Wählt einen Standort für neue Bewerber (meist Hamburg, manchmal andere Filialen).
function pickLocation(state, rng) {
  if (rng() < 0.85) return "Hamburg";
  const branchCities = (state.branches || []).map(b => b.city).filter(c => c !== "Hamburg");
  if (branchCities.length > 0) return branchCities[Math.floor(rng() * branchCities.length)];
  return "Hamburg";
}

// ---------- Bestandszählung ----------

// F = aktive Lkw (owned + leased + rented, nicht verkauft/archiviert/zurückgegeben)
function countActiveVehicles(state) {
  return (state.vehicles || []).filter(v =>
    v.status !== "sold" && v.status !== "archived"
  ).length;
}

// H = aktive Mitarbeiter aller Rollen
function countActiveEmployees(state) {
  const drivers = (state.drivers || []).filter(d => d.employmentStatus === "employed").length;
  const emps = (state.employees || []).filter(e => e.employmentStatus === "employed").length;
  return drivers + emps;
}

// B = gebaute Werkstattplätze
function countWorkshopSlots(state) {
  return ((state.workshop?.slots) || []).filter(s => s.status === "built").length;
}

// V_R = offene ausgeschriebene Stellen je Rolle (remaining, nicht status)
function countOpenPostings(state) {
  const v: Record<string, number> = {};
  for (const p of (state.personnelMarket?.postings || [])) {
    if (p.status === "open" && p.remaining > 0) {
      v[p.role] = (v[p.role] || 0) + p.remaining;
    }
  }
  return v;
}

// ---------- Zielbestand je Rolle ----------

export function computeRoleTargets(state) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  const F = countActiveVehicles(state);
  const H = countActiveEmployees(state);
  const B = countWorkshopSlots(state);
  const V = countOpenPostings(state);

  // Dispo = dispatcher + dispatcher_senior kombiniert
  const dispoTotal = Math.max(6, Math.ceil(F / 12) + 2 * ((V.dispatcher || 0) + (V.dispatcher_senior || 0)));
  const dispoStandard = Math.max(4, Math.ceil(dispoTotal * 2 / 3));
  const dispoSenior = Math.max(2, dispoTotal - dispoStandard);

  // Buchhaltung = accountant + accountant_senior kombiniert
  const accTotal = Math.max(4, Math.ceil(H / 20) + 2 * ((V.accountant || 0) + (V.accountant_senior || 0)));
  const accStandard = Math.max(2, Math.ceil(accTotal / 2));
  const accSenior = Math.max(2, accTotal - accStandard);

  return {
    driver:            Math.max(12, Math.ceil(F / 2) + 2 * (V.driver || 0)),
    dispatcher:        dispoStandard,
    dispatcher_senior: dispoSenior,
    mechanic:          Math.max(4, 2 * B + 2 * (V.mechanic || 0)),
    cleaner:           Math.max(4, Math.ceil(H / 20) + 2 * (V.cleaner || 0)),
    accountant:        accStandard,
    accountant_senior: accSenior,
    assistant:         Math.max(2, Math.ceil(H / 30) + 2 * (V.assistant || 0)),
    branch_manager:    Math.max(2, (state.branches || []).filter((b: any) => b.status === "active").length + 2),
  };
}

// Zählt verfügbare Bewerber je Rolle (status === "available", nicht abgelaufen)
export function countAvailableByRole(state) {
  const counts = {};
  for (const a of state.availableApplicants || []) {
    if (a.status !== "available" && a.status !== undefined) continue;
    if (a.expiresAtMin && a.expiresAtMin <= state.gameTime) continue;
    counts[a.role] = (counts[a.role] || 0) + 1;
  }
  return counts;
}

// ---------- Bewerber erzeugen ----------

function createApplicant(state, role, m, locationCity, usedNames) {
  const rng = () => pmRng(state);
  const roleDef = PERSONNEL_ROLES[role];
  if (!roleDef) throw new Error("Unbekannte Rolle: " + role);
  const name = generateUniqueName(state, rng, usedNames);
  const portraitId = assignPortrait(state);
  return {
    id: uid(state, "app"),
    name,
    role,
    hireFeeCents: roleDef.hireFeeCents,
    costPerDayCents: roleDef.costPerDayCents,
    capacity: roleDef.capacity,
    portraitId,
    locationCity: locationCity || "Hamburg",
    earliestStartMin: m,
    createdAtMin: m,
    expiresAtMin: m + APPLICANT_EXPIRY_MIN,
    status: "available",
    postedRefId: null,
  };
}

// ---------- Start-Pool (30 Personen) ----------

export function initStartApplicants(state) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  const startMix = [
    { role: "driver",            count: 12 },
    { role: "dispatcher",         count: 4  },
    { role: "dispatcher_senior",  count: 2  },
    { role: "mechanic",           count: 4  },
    { role: "cleaner",            count: 4  },
    { role: "accountant",         count: 2  },
    { role: "accountant_senior",  count: 2  },
    { role: "assistant",          count: 2  },
    { role: "branch_manager",     count: 2  },
  ];
  const m = state.gameTime || 480;
  const usedNames = getUsedNames(state);
  for (const { role, count } of startMix) {
    for (let i = 0; i < count; i++) {
      const app = createApplicant(state, role, m, "Hamburg", usedNames);
      state.availableApplicants.push(app);
    }
  }
  state.personnelMarket.stats.applicantsGenerated = (state.personnelMarket.stats.applicantsGenerated || 0) + 30;
}

// ---------- Ablauf ----------

export function expireApplicants(state, m, log) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  const before = (state.availableApplicants || []).length;
  const expiredIds = [];
  state.availableApplicants = (state.availableApplicants || []).filter(a => {
    if (a.expiresAtMin && a.expiresAtMin <= m) {
      expiredIds.push(a.id);
      return false;
    }
    return true;
  });
  const expired = expiredIds.length;
  if (expired > 0) {
    state.personnelMarket.stats.applicantsExpired = (state.personnelMarket.stats.applicantsExpired || 0) + expired;
    // Aus Merkliste entfernen
    if (state.personnelMarket.watchlist) {
      state.personnelMarket.watchlist = state.personnelMarket.watchlist.filter(id => !expiredIds.includes(id));
    }
    log.push({ type: "personnel_expired", atMin: m, count: expired });
  }
}

// ---------- Welle generieren ----------

export function generatePersonnelWave(state, m, log, isDemandBased) {
  if (!state.personnelMarket) migratePersonnelMarket(state);

  // 1. Abgelaufene Bewerber entfernen
  expireApplicants(state, m, log);

  // 2. Ziele und aktuelle Verfügbarkeit
  const targets = computeRoleTargets(state);
  const current = countAvailableByRole(state);

  // 3. Fehlbedarf ermitteln und generieren
  const usedNames = getUsedNames(state);
  const rng = () => pmRng(state);
  let generated = 0;
  const generatedByRole: Record<string, number> = {};

  for (const role of Object.keys(targets)) {
    let needed = targets[role] - (current[role] || 0);
    if (needed <= 0) continue;
    // Batch-Limit pro Welle
    needed = Math.min(needed, BATCH_LIMIT);
    generatedByRole[role] = 0;
    for (let i = 0; i < needed; i++) {
      const locationCity = pickLocation(state, rng);
      const app = createApplicant(state, role, m, locationCity, usedNames);
      state.availableApplicants.push(app);
      generated++;
      generatedByRole[role]++;
    }
  }

  // 4. Statistik aktualisieren
  state.personnelMarket.stats.wavesProcessed = (state.personnelMarket.stats.wavesProcessed || 0) + 1;
  state.personnelMarket.stats.applicantsGenerated = (state.personnelMarket.stats.applicantsGenerated || 0) + generated;
  state.personnelMarket.stats.lastWaveMin = m;
  state.personnelMarket.stats.lastWaveType = isDemandBased ? "demand" : "regular";

  // 5. Log
  log.push({
    type: "personnel_market_wave",
    atMin: m,
    isDemandBased,
    generated,
    generatedByRole,
    targets,
    current,
  });

  // 6. Zusammengefasste Mail-Benachrichtigung (nicht bei leerer Welle)
  if (generated > 0) {
    const roleLabels = {
      driver: "Fahrer", dispatcher: "Disponent", dispatcher_senior: "Erf. Disponent",
      mechanic: "Mechaniker", cleaner: "Reinigung", accountant: "Buchhalter",
      accountant_senior: "Erf. Buchhalter",
    };
    const parts = Object.entries(generatedByRole)
      .filter(([, c]) => c > 0)
      .map(([r, c]) => `${c} ${roleLabels[r] || r}`);
    deliverMessage(state, {
      fromId: "system", toId: "player",
      subject: "Neue Bewerber auf dem Personalmarkt",
      body: `${generated} neue Bewerber/in verfügbar: ${parts.join(", ")}.`,
      gameTime: m, category: "operations", priority: "normal",
      dedupKey: `personnel_wave:${m}`,
    });
  }
}

// ---------- Bedarfsbezogene Welle planen ----------

export function scheduleDemandWave(state, m) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  const clock = m % 1440;
  let nextWave;
  if (clock >= DEMAND_WAVE_START && clock < DEMAND_WAVE_END) {
    // Innerhalb 08:00–18:00: nächste volle Stunde
    nextWave = Math.floor(m / 60) * 60 + 60;
    if (nextWave % 1440 > DEMAND_WAVE_END) {
      nextWave = Math.floor(m / 1440) * 1440 + 1440 + DEMAND_WAVE_START;
    }
  } else if (clock < DEMAND_WAVE_START) {
    // Vor 08:00: heute 08:00
    nextWave = Math.floor(m / 1440) * 1440 + DEMAND_WAVE_START;
  } else {
    // Nach 18:00: nächster Tag 08:00
    nextWave = Math.floor(m / 1440) * 1440 + 1440 + DEMAND_WAVE_START;
  }
  // Nur planen wenn früher als bestehende Planung
  if (!state.personnelMarket.nextDemandWaveMin || state.personnelMarket.nextDemandWaveMin > nextWave) {
    state.personnelMarket.nextDemandWaveMin = nextWave;
  }
}

// ---------- Reguläre Wellenzeiten ----------

export function getNextRegularWaveTime(t) {
  const clock = t % 1440;
  if (clock < REGULAR_WAVE_TIMES[0]) return Math.floor(t / 1440) * 1440 + REGULAR_WAVE_TIMES[0];
  if (clock < REGULAR_WAVE_TIMES[1]) return Math.floor(t / 1440) * 1440 + REGULAR_WAVE_TIMES[1];
  return Math.floor(t / 1440) * 1440 + 1440 + REGULAR_WAVE_TIMES[0];
}

export function isRegularWaveTime(m) {
  const clock = m % 1440;
  return clock === REGULAR_WAVE_TIMES[0] || clock === REGULAR_WAVE_TIMES[1];
}

// ---------- Stellen ausschreiben ----------

export function postJob(state, params) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  const role = params.role;
  const roleDef = PERSONNEL_ROLES[role];
  if (!roleDef) throw new Error("Unbekannte Rolle: " + role);
  const locationCity = params.locationCity || "Hamburg";
  const count = Math.max(1, Math.min(params.count || 1, 10));
  const earliestStartMin = params.earliestStartMin || state.gameTime;

  const posting = {
    id: uid(state, "posting"),
    role,
    locationCity,
    count,
    remaining: count,
    earliestStartMin,
    status: "open",
    createdAtMin: state.gameTime,
    fulfilledByApplicantIds: [],
    fulfilledAtMin: null,
    closedAtMin: null,
  };
  state.personnelMarket.postings = state.personnelMarket.postings || [];
  state.personnelMarket.postings.push(posting);

  // Bedarfsbezogene Welle auslösen
  scheduleDemandWave(state, state.gameTime);

  return { ok: true, posting };
}

export function closeJobPosting(state, postingId) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  const posting = (state.personnelMarket.postings || []).find(p => p.id === postingId);
  if (!posting) throw new Error("Stellenanzeige nicht gefunden.");
  if (posting.status !== "open") throw new Error("Anzeige ist nicht mehr offen.");
  posting.status = "closed";
  posting.closedAtMin = state.gameTime;
  return { ok: true, posting };
}

// Eine Einstellung erfüllt eine offene Stelle der passenden Rolle.
export function fulfillPosting(state, role, applicantId) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  const postings = (state.personnelMarket.postings || []).filter(p =>
    p.status === "open" && p.role === role && p.remaining > 0
  );
  if (postings.length === 0) return null;
  // Älteste offene Stelle zuerst erfüllen
  const posting = postings[0];
  posting.remaining--;
  posting.fulfilledByApplicantIds = posting.fulfilledByApplicantIds || [];
  posting.fulfilledByApplicantIds.push(applicantId);
  if (posting.remaining <= 0) {
    posting.status = "fulfilled";
    posting.fulfilledAtMin = state.gameTime;
  }
  return posting;
}

// ---------- Merkliste ----------

export function toggleWatchlist(state, applicantId) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  state.personnelMarket.watchlist = state.personnelMarket.watchlist || [];
  const idx = state.personnelMarket.watchlist.indexOf(applicantId);
  if (idx >= 0) {
    state.personnelMarket.watchlist.splice(idx, 1);
    return { ok: true, watched: false };
  }
  state.personnelMarket.watchlist.push(applicantId);
  return { ok: true, watched: true };
}

// ---------- Status für UI ----------

export function getPersonnelMarketStatus(state) {
  if (!state.personnelMarket) migratePersonnelMarket(state);
  const targets = computeRoleTargets(state);
  const available = countAvailableByRole(state);
  const nextRegular = getNextRegularWaveTime(state.gameTime);
  const nextDemand = state.personnelMarket.nextDemandWaveMin;
  const nextWave = nextDemand && nextDemand < nextRegular ? nextDemand : nextRegular;
  const postings = (state.personnelMarket.postings || []).filter(p => p.status === "open");
  const watchlist = state.personnelMarket.watchlist || [];
  return {
    targets,
    available,
    nextRegularWaveMin: nextRegular,
    nextDemandWaveMin: nextDemand,
    nextWaveMin: nextWave,
    nextWaveLabel: formatGameTime(nextWave),
    postings,
    watchlist,
    stats: state.personnelMarket.stats || {},
    totalApplicants: (state.availableApplicants || []).filter(a =>
      (a.status === "available" || a.status === undefined) &&
      (!a.expiresAtMin || a.expiresAtMin > state.gameTime)
    ).length,
  };
}

// ---------- Migration ----------

export function migratePersonnelMarket(state) {
  if (!state.personnelMarket) {
    state.personnelMarket = {
      version: PM_VERSION,
      rngSeed: 9876543,
      nextDemandWaveMin: null,
      postings: [],
      watchlist: [],
      stats: {
        wavesProcessed: 0,
        applicantsGenerated: 0,
        applicantsHired: 0,
        applicantsExpired: 0,
        lastWaveMin: null,
        lastWaveType: null,
      },
      portraitCounter: 0,
    };
  }
  if (!state.personnelMarket.stats) {
    state.personnelMarket.stats = {
      wavesProcessed: 0, applicantsGenerated: 0, applicantsHired: 0,
      applicantsExpired: 0, lastWaveMin: null, lastWaveType: null,
    };
  }
  if (!state.personnelMarket.postings) state.personnelMarket.postings = [];
  if (!state.personnelMarket.watchlist) state.personnelMarket.watchlist = [];

  // Bestehende Bewerber mit neuen Feldern ergänzen
  for (const a of state.availableApplicants || []) {
    if (!a.createdAtMin) a.createdAtMin = state.gameTime || 480;
    if (!a.expiresAtMin) a.expiresAtMin = a.createdAtMin + APPLICANT_EXPIRY_MIN;
    if (!a.status) a.status = "available";
    if (!a.locationCity) a.locationCity = "Hamburg";
    if (!a.earliestStartMin) a.earliestStartMin = a.createdAtMin;
    if (!a.portraitId) a.portraitId = assignPortrait(state);
    // Stelle sicher, dass hireFeeCents und costPerDayCents gesetzt sind
    const roleDef = PERSONNEL_ROLES[a.role];
    if (roleDef) {
      if (!a.hireFeeCents) a.hireFeeCents = roleDef.hireFeeCents;
      if (!a.costPerDayCents) a.costPerDayCents = roleDef.costPerDayCents;
      if (a.capacity === undefined) a.capacity = roleDef.capacity;
    }
  }

  // Einmalige Auffüllung bei Migration auf neue Version
  if (state.personnelMarket.version < PM_VERSION) {
    state.personnelMarket.version = PM_VERSION;
    fillToTargets(state);
  }
}

// Füllt den Bewerberpool bis zu den Zielbeständen auf (einmalig bei Migration).
function fillToTargets(state) {
  const targets = computeRoleTargets(state);
  const current = countAvailableByRole(state);
  const usedNames = getUsedNames(state);
  const m = state.gameTime || 480;
  const rng = () => pmRng(state);
  let generated = 0;
  for (const role of Object.keys(targets)) {
    let needed = targets[role] - (current[role] || 0);
    if (needed <= 0) continue;
    needed = Math.min(needed, BATCH_LIMIT);
    for (let i = 0; i < needed; i++) {
      const locationCity = pickLocation(state, rng);
      const app = createApplicant(state, role, m, locationCity, usedNames);
      state.availableApplicants.push(app);
      generated++;
    }
  }
  state.personnelMarket.stats.applicantsGenerated = (state.personnelMarket.stats.applicantsGenerated || 0) + generated;
}