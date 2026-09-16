// Ausbildungs- und Weiterbildungs-Engine für FERNWERK – Auftrag 31.
// Verwaltet Kurskatalog, Qualifikationen, Kursbuchungen, Ausbildungen,
// Terminplanung, Anbieterplätze, Effektanwendung und Übernahmen.
// Reine Logik – keine Auth, keine Speicherung.

import { dayOf, formatGameTime, NOTICE_PERIOD_MIN, PERSONNEL_ROLES } from "./gameRules.ts";
import { isActivelyEmployed, findPerson } from "./terminationEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";
import { bookExpense } from "./accountingEngine.ts";

// ---------- Konstanten ----------
const DAY_MIN = 1440;
const SERVICE_START_MIN = 480;   // 08:00
const SERVICE_END_MIN = 960;     // 16:00
const BLOCK_MIN = 480;           // 8 Stunden pro Block
const REST_AFTER_BLOCK_MIN = 720; // 12h Ruhe nach vollem 8h-Block

const ADR_VALIDITY_DAYS = 1800;
const ADR_REFRESH_WINDOW_DAYS = 360;
const ADR_REFRESH_EXTEND_DAYS = 1800;

const TRAINING_WAGE_PER_DAY = 3000;   // 30 €
const APPRENTICE_ADMISSION_FEE = 25000;  // 250 €
const APPRENTICE_THEORY_FEE = 100000;    // 1.000 €
const APPRENTICE_COMPLETION_FEE = 25000; // 250 €
const APPRENTICE_THEORY_HOURS = 80;
const APPRENTICE_PRACTICE_HOURS = 80;
const APPRENTICE_HOURS_PER_DAY = 8;
const APPRENTICE_MIN_DAYS = 20;

const SATISFACTION_COURSE_BONUS = 3;
const SATISFACTION_COURSE_COOLDOWN_DAYS = 30;

const PROVIDER_SLOTS = 10;
const PROVIDER_CITY = "Hamburg";

// ---------- Kurskatalog ----------
export const COURSE_CATALOG = [
  {
    id: "eco_drive_1",
    label: "Wirtschaftliches Fahren",
    targetRole: "driver",
    targetRoleSenior: null,
    feeCents: 35000,
    hours: 8,
    blocks: 1,
    effect: "eco_drive",
    effectDesc: "5 % weniger Kraftstoffverbrauch für zukünftig damit gestartete Fahrten",
    requires: ["driver_license"],
    description: "Spritsparende Fahrweise und vorausschauendes Fahren.",
  },
  {
    id: "adr_basic",
    label: "ADR-Basiskurs (Spiel)",
    targetRole: "driver",
    targetRoleSenior: null,
    feeCents: 60000,
    hours: 24,
    blocks: 3,
    effect: "adr_basic",
    effectDesc: "Aktive Basisqualifikation für implementierte Versandstückprofile",
    requires: ["driver_license"],
    description: "Basisqualifikation für Gefahrguttransporte (Versandstückprofile).",
  },
  {
    id: "adr_tank",
    label: "ADR-Aufbau Tank (Spiel)",
    targetRole: "driver",
    targetRoleSenior: null,
    feeCents: 45000,
    hours: 16,
    blocks: 2,
    effect: "adr_tank",
    effectDesc: "Zusätzliche Tankberechtigung für implementierte Tankprofile",
    requires: ["adr_basic_valid"],
    description: "Aufbaukurs für Tankbeförderungen. Übernimmt Basisablauf.",
  },
  {
    id: "adr_refresh",
    label: "ADR-Auffrischung (Spiel)",
    targetRole: "driver",
    targetRoleSenior: null,
    feeCents: 35000,
    hours: 8,
    blocks: 1,
    effect: "adr_refresh",
    effectDesc: "Einmalige Erneuerung des bestehenden gültigen Umfangs",
    requires: ["adr_refresh_window"],
    description: "Auffrischung innerhalb des Erneuerungsfensters vor Ablauf.",
  },
  {
    id: "dispo_advanced",
    label: "Erweiterte Disposition",
    targetRole: "dispatcher",
    targetRoleSenior: null,
    feeCents: 120000,
    hours: 16,
    blocks: 2,
    effect: "dispo_advanced",
    effectDesc: "Kapazität 6 → 12 Lkw; Beförderung mit Lohnanpassung",
    requires: ["dispatcher_role"],
    description: "Erweiterte Disposition mit höherer Kapazität. Beförderung bei Abschluss.",
    isPromotion: true,
    promotionMinWageCents: 26000,
    promotionNewRole: "dispatcher_senior",
  },
  {
    id: "dispo_dg",
    label: "Gefahrgutdisposition",
    targetRole: "dispatcher",
    targetRoleSenior: "dispatcher_senior",
    feeCents: 35000,
    hours: 8,
    blocks: 1,
    effect: "dispo_dg",
    effectDesc: "Autonome Gefahrgutannahme/-planung innerhalb erteilter Befugnisse",
    requires: ["dispatcher_role"],
    description: "Gefahrgutdisposition für Disponenten.",
  },
  {
    id: "dispo_efficiency",
    label: "Effiziente Tourenplanung",
    targetRole: "dispatcher",
    targetRoleSenior: "dispatcher_senior",
    feeCents: 80000,
    hours: 16,
    blocks: 2,
    effect: "dispo_efficiency",
    effectDesc: "Längerer Planungshorizont (72h) und schnellere Reaktion auf neue Aufträge – weniger scheiternde Aufträge",
    requires: ["dispatcher_role"],
    description: "Fortgeschrittene Tourenplanung mit erweitertem Horizont und verkürzten Reaktionszeiten.",
  },
  {
    id: "assistant_advanced",
    label: "Betriebliche Analyse & Steuerung",
    targetRole: "assistant",
    targetRoleSenior: null,
    feeCents: 90000,
    hours: 16,
    blocks: 2,
    effect: "assistant_advanced",
    effectDesc: "Höhere Auftragsannahme-Quote, frühere Fristwarnung, früherer Auto-Dispatch – weniger verfallende und scheiternde Aufträge",
    requires: ["assistant_role"],
    description: "Fortgeschrittene betriebswirtschaftliche Analyse für Assistenten der Geschäftsführung.",
  },
  {
    id: "branch_manager_advanced",
    label: "Filialmanagement & Steuerung",
    targetRole: "branch_manager",
    targetRoleSenior: null,
    feeCents: 110000,
    hours: 16,
    blocks: 2,
    effect: "branch_manager_advanced",
    effectDesc: "Höhere Auto-Freigabegrenze und häufigere Entscheidungen – Filiale läuft autonomer und Engpässe werden früher erkannt",
    requires: ["branch_manager_role"],
    description: "Fortgeschrittenes Filialmanagement für Filialleiter.",
  },
  {
    id: "mechanic_material_1",
    label: "Materialeffiziente Wartung",
    targetRole: "mechanic",
    targetRoleSenior: null,
    feeCents: 90000,
    hours: 16,
    blocks: 2,
    effect: "mechanic_material_1",
    effectDesc: "10 % weniger Teilekosten bei neuen Standardwartungen",
    requires: ["mechanic_role"],
    description: "Materialeffiziente Wartungstechniken.",
  },
  {
    id: "dg_vehicle_tech",
    label: "Gefahrgut-Fahrzeugtechnik (Spiel)",
    targetRole: "mechanic",
    targetRoleSenior: null,
    feeCents: 60000,
    hours: 8,
    blocks: 1,
    effect: "dg_vehicle_tech",
    effectDesc: "Interne Ausrüstungs- und Spielprüfaufträge",
    requires: ["mechanic_role"],
    description: "Fahrzeugtechnik für Gefahrguttransporte (Spiel).",
  },
  {
    id: "cleaning_advanced",
    label: "Reinigungsorganisation",
    targetRole: "cleaner",
    targetRoleSenior: null,
    feeCents: 25000,
    hours: 8,
    blocks: 1,
    effect: "cleaning_advanced",
    effectDesc: "Tageskapazität 4 → 6 Einheiten",
    requires: ["cleaner_role"],
    description: "Erweiterte Reinigungsorganisation.",
  },
  {
    id: "accounting_advanced",
    label: "Erweiterte Buchhaltung",
    targetRole: "accountant",
    targetRoleSenior: null,
    feeCents: 100000,
    hours: 16,
    blocks: 2,
    effect: "accounting_advanced",
    effectDesc: "Bis 80 statt 40 Prüfpunkte; Beförderung mit Lohnanpassung",
    requires: ["accountant_role"],
    description: "Erweiterte Buchhaltung mit höherer Kapazität. Beförderung bei Abschluss.",
    isPromotion: true,
    promotionMinWageCents: 19000,
    promotionNewRole: "accountant_senior",
  },
  {
    id: "mentor_1",
    label: "Ausbildungsbegleitung",
    targetRole: "any",
    targetRoleSenior: null,
    feeCents: 45000,
    hours: 8,
    blocks: 1,
    effect: "mentor_1",
    effectDesc: "Eine passende eigene Nachwuchskraft betreuen",
    requires: ["any_qualified"],
    description: "Befähigung zur Ausbildungsbegleitung für Nachwuchskräfte.",
  },
];

export function getCourseById(courseId) {
  return COURSE_CATALOG.find(c => c.id === courseId);
}

// ---------- Migration ----------
export function migrateTraining(state) {
  if (!state.training) {
    state.training = {
      qualifications: [],
      enrollments: [],
      apprenticeships: [],
      providerSlots: [],
      autoRefreshConfig: null,
    };
  }
  if (!state.training.qualifications) state.training.qualifications = [];
  if (!state.training.enrollments) state.training.enrollments = [];
  if (!state.training.apprenticeships) state.training.apprenticeships = [];
  if (!state.training.providerSlots) state.training.providerSlots = [];
  if (state.training.autoRefreshConfig === undefined) state.training.autoRefreshConfig = null;

  // Bestehende Fahrer erhalten Standard-Fahrerqualifikation falls nicht vorhanden
  for (const d of (state.drivers || [])) {
    const hasLicense = state.training.qualifications.some(
      q => q.personId === d.id && q.type === "driver_license" && q.status === "active"
    );
    if (!hasLicense) {
      state.training.qualifications.push({
        id: "qual_init_" + d.id,
        personId: d.id,
        type: "driver_license",
        level: "standard",
        acquiredAtMin: (d.employedDay || 1 - 1) * DAY_MIN,
        validUntilMin: null,
        status: "active",
        source: "initial",
        courseId: null,
        history: [],
      });
    }
  }
  // Bestehende Angestellte erhalten Rollen-Qualifikation
  for (const e of (state.employees || [])) {
    const hasRoleQual = state.training.qualifications.some(
      q => q.personId === e.id && q.type === "role_" + e.role && q.status === "active"
    );
    if (!hasRoleQual) {
      state.training.qualifications.push({
        id: "qual_init_" + e.id,
        personId: e.id,
        type: "role_" + e.role,
        level: "standard",
        acquiredAtMin: (e.employedDay || 1 - 1) * DAY_MIN,
        validUntilMin: null,
        status: "active",
        source: "initial",
        courseId: null,
        history: [],
      });
    }
  }
}

// ---------- Hilfsfunktionen ----------
function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Prüft ob eine Person eine Qualifikation besitzt
export function hasQualification(state, personId, type, opts = {}) {
  const now = state.gameTime;
  return state.training.qualifications.some(q =>
    q.personId === personId &&
    q.type === type &&
    q.status === "active" &&
    (!opts.requireValid || !q.validUntilMin || q.validUntilMin > now)
  );
}

// Liefert alle aktiven Qualifikationen einer Person
export function getPersonQualifications(state, personId) {
  return state.training.qualifications
    .filter(q => q.personId === personId && q.status === "active")
    .sort((a, b) => (a.acquiredAtMin || 0) - (b.acquiredAtMin || 0));
}

// Liefert alle Qualifikationen inkl. historischer
export function getAllPersonQualifications(state, personId) {
  return state.training.qualifications
    .filter(q => q.personId === personId)
    .sort((a, b) => (b.acquiredAtMin || 0) - (a.acquiredAtMin || 0));
}

// Prüft Kursvoraussetzungen
export function checkCoursePrerequisites(state, personId, courseId) {
  const course = getCourseById(courseId);
  if (!course) return { ok: false, reason: "Unbekannter Kurs." };

  const found = findPerson(state, personId);
  if (!found) return { ok: false, reason: "Person nicht gefunden." };
  if (!isActivelyEmployed(found.person)) return { ok: false, reason: "Person nicht mehr aktiv beschäftigt." };

  const person = found.person;
  const role = found.kind === "driver" ? "driver" : person.role;

  // Zielgruppen-Prüfung
  if (course.targetRole !== "any") {
    const targetRoles = [course.targetRole];
    if (course.targetRoleSenior) targetRoles.push(course.targetRoleSenior);
    if (!targetRoles.includes(role)) {
      return { ok: false, reason: `Kurs richtet sich an ${course.targetRole}${course.targetRoleSenior ? "/" + course.targetRoleSenior : ""}.` };
    }
  }

  // Voraussetzungen prüfen
  for (const req of course.requires) {
    if (req === "driver_license") {
      if (!hasQualification(state, personId, "driver_license")) {
        return { ok: false, reason: "Fahrerqualifikation erforderlich." };
      }
    } else if (req === "adr_basic_valid") {
      const adrBasic = state.training.qualifications.find(q =>
        q.personId === personId && q.type === "adr_basic" && q.status === "active" &&
        (!q.validUntilMin || q.validUntilMin > state.gameTime)
      );
      if (!adrBasic) return { ok: false, reason: "Gültige ADR-Basisqualifikation erforderlich." };
    } else if (req === "adr_refresh_window") {
      const adrQual = state.training.qualifications.find(q =>
        q.personId === personId && q.type === "adr_basic" && q.status === "active" && q.validUntilMin
      );
      if (!adrQual) return { ok: false, reason: "Kein gültiger ADR-Nachweis vorhanden." };
      const daysUntilExpiry = Math.floor((adrQual.validUntilMin - state.gameTime) / DAY_MIN);
      if (daysUntilExpiry > ADR_REFRESH_WINDOW_DAYS) {
        return { ok: false, reason: `Auffrischung erst innerhalb der letzten ${ADR_REFRESH_WINDOW_DAYS} Tage vor Ablauf möglich. Noch ${daysUntilExpiry} Tage gültig.` };
      }
      if (daysUntilExpiry < 0) {
        return { ok: false, reason: "Nachweis bereits abgelaufen. Erneute Erstschulung erforderlich." };
      }
    } else if (req === "dispatcher_role") {
      if (role !== "dispatcher" && role !== "dispatcher_senior") {
        return { ok: false, reason: "Nur für Disponenten." };
      }
    } else if (req === "assistant_role") {
      if (role !== "assistant") {
        return { ok: false, reason: "Nur für Assistenten." };
      }
    } else if (req === "branch_manager_role") {
      if (role !== "branch_manager") {
        return { ok: false, reason: "Nur für Filialleiter." };
      }
    } else if (req === "mechanic_role") {
      if (role !== "mechanic") return { ok: false, reason: "Nur für Mechaniker." };
    } else if (req === "cleaner_role") {
      if (role !== "cleaner") return { ok: false, reason: "Nur für Reinigungskräfte." };
    } else if (req === "accountant_role") {
      if (role !== "accountant" && role !== "accountant_senior") {
        return { ok: false, reason: "Nur für Buchhaltungskräfte." };
      }
    } else if (req === "any_qualified") {
      // Jede aktive qualifizierte Person
    }
  }

  // Prüfen ob Person bereits dieselbe dauerhafte Qualifikation hat
  if (course.effect && !course.effect.startsWith("adr_refresh")) {
    const existing = state.training.qualifications.find(q =>
      q.personId === personId && q.type === course.effect && q.status === "active"
    );
    if (existing && course.effect !== "adr_basic" && course.effect !== "adr_tank") {
      return { ok: false, reason: "Diese Qualifikation ist bereits vorhanden." };
    }
  }

  // Prüfen ob Person bereits in einem Kurs eingeschrieben ist
  const activeEnrollment = state.training.enrollments.find(e =>
    e.personId === personId && ["reserved", "in_progress"].includes(e.status)
  );
  if (activeEnrollment) {
    return { ok: false, reason: "Person ist bereits in einer laufenden Weiterbildung." };
  }

  return { ok: true };
}

// ---------- Anbieterplatz-Verwaltung ----------

// Findet den nächsten freien Kursblock-Termin
export function findNextCourseSlot(state, blocks, earliestStart) {
  const start = earliestStart || state.gameTime;
  let candidate = Math.ceil(start / DAY_MIN) * DAY_MIN + SERVICE_START_MIN;
  if (candidate < start) candidate += DAY_MIN;

  // Suche Tag für Tag
  for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
    const dayStart = candidate + dayOffset * DAY_MIN;
    const clock = dayStart % DAY_MIN;
    if (clock < SERVICE_START_MIN || clock >= SERVICE_END_MIN) continue;

    // Prüfe ob enough consecutive blocks available
    if (canScheduleBlocks(state, dayStart, blocks)) {
      return dayStart;
    }
  }
  return null;
}

// Prüft ob `blocks` aufeinanderfolgende Blöcke ab dayStart verfügbar sind
function canScheduleBlocks(state, startMin, blocks) {
  for (let i = 0; i < blocks; i++) {
    const blockStart = startMin + i * DAY_MIN;
    const blockEnd = blockStart + BLOCK_MIN;
    // Prüfe Anbieterplätze
    const usedSlots = countUsedProviderSlots(state, blockStart, blockEnd);
    if (usedSlots >= PROVIDER_SLOTS) return false;
  }
  return true;
}

// Zählt belegte Anbieterplätze in einem Zeitraum
function countUsedProviderSlots(state, fromMin, toMin) {
  let maxOverlap = 0;
  // Für jeden Block-Start prüfen
  for (let t = fromMin; t < toMin; t += BLOCK_MIN) {
    const blockEnd = t + BLOCK_MIN;
    const count = state.training.enrollments.filter(e =>
      ["reserved", "in_progress"].includes(e.status) &&
      e.blockStarts.some(bs => bs < blockEnd && bs + BLOCK_MIN > t)
    ).length;
    if (count > maxOverlap) maxOverlap = count;
  }
  return maxOverlap;
}

// ---------- Kursbuchung ----------

export function previewCourseBooking(state, personId, courseId) {
  const prereq = checkCoursePrerequisites(state, personId, courseId);
  if (!prereq.ok) return { ok: false, reason: prereq.reason };

  const course = getCourseById(courseId);
  const found = findPerson(state, personId);
  const person = found.person;

  // Nächster freier Termin
  const nextSlot = findNextCourseSlot(state, course.blocks, state.gameTime);
  if (!nextSlot) return { ok: false, reason: "Kein freier Termin innerhalb eines Jahres gefunden." };

  // Block-Starts berechnen
  const blockStarts = [];
  for (let i = 0; i < course.blocks; i++) {
    blockStarts.push(nextSlot + i * DAY_MIN);
  }
  const endMin = blockStarts[blockStarts.length - 1] + BLOCK_MIN;

  // Betroffene Touren/Arbeiten
  const conflicts = findConflicts(state, personId, nextSlot, endMin, found.kind);

  // Lohn während Kurs
  const dailyWage = person.costPerDayCents || 0;
  const courseDays = course.blocks;
  const wageDuringCourse = dailyWage * courseDays;

  // Beförderungsvorschau
  let promotion = null;
  if (course.isPromotion) {
    promotion = {
      newRole: course.promotionNewRole,
      newWageCents: Math.max(dailyWage, course.promotionMinWageCents),
      currentWageCents: dailyWage,
    };
  }

  return {
    ok: true,
    courseId,
    courseLabel: course.label,
    personId,
    personName: person.name,
    feeCents: course.feeCents,
    hours: course.hours,
    blocks: course.blocks,
    blockStarts,
    startMin: nextSlot,
    endMin,
    conflicts,
    wageDuringCourse,
    providerCity: PROVIDER_CITY,
    promotion,
  };
}

function findConflicts(state, personId, fromMin, toMin, kind) {
  const conflicts = [];
  // Laufende Touren
  for (const trip of (state.trips || [])) {
    if (trip.driverId !== personId) continue;
    if (trip.status === "in_progress" && trip.endMin > fromMin && trip.startMin < toMin) {
      conflicts.push({ type: "tour", label: "Laufende Tour", endMin: trip.endMin });
    }
  }
  // Geplante Touren
  for (const tour of (state.tours || [])) {
    if (tour.status !== "active") continue;
    for (const dep of (tour.deployments || [])) {
      if (dep.driverId === personId && dep.status === "planned" &&
          dep.startMin < toMin && dep.startMin + 1440 > fromMin) {
        conflicts.push({ type: "planned_tour", label: "Geplante Tour", startMin: dep.startMin });
      }
    }
  }
  // Abwesenheiten
  for (const s of (state.absences?.sicknesses || [])) {
    if (s.personId === personId && s.status === "active" && s.expectedEndMin > fromMin) {
      conflicts.push({ type: "sickness", label: "Krankheit", endMin: s.expectedEndMin });
    }
  }
  for (const r of (state.absences?.vacationRequests || [])) {
    if (r.personId === personId && r.status === "approved" && r.endMin > fromMin && r.startMin < toMin) {
      conflicts.push({ type: "vacation", label: "Urlaub", startMin: r.startMin, endMin: r.endMin });
    }
  }
  // Andere Kurse
  for (const e of state.training.enrollments) {
    if (e.personId === personId && ["reserved", "in_progress"].includes(e.status)) {
      const eEnd = e.blockStarts[e.blockStarts.length - 1] + BLOCK_MIN;
      if (eEnd > fromMin && e.blockStarts[0] < toMin) {
        conflicts.push({ type: "course", label: "Anderer Kurs", startMin: e.blockStarts[0] });
      }
    }
  }
  return conflicts;
}

export function bookCourse(state, personId, courseId, opts = {}) {
  const preview = previewCourseBooking(state, personId, courseId);
  if (!preview.ok) throw new Error(preview.reason);

  const course = getCourseById(courseId);
  const found = findPerson(state, personId);
  const person = found.person;

  // Firmenmittel prüfen
  if (state.company.accountCents < course.feeCents) {
    throw new Error(`Firmenkonto reicht für die Kursgebühr (${(course.feeCents / 100).toFixed(0)} €) nicht aus.`);
  }

  // Beförderung bestätigen falls erforderlich
  let agreedNewWageCents = null;
  if (course.isPromotion) {
    if (!opts.confirmPromotion) {
      throw new Error("Beförderung muss vor der Buchung bestätigt werden.");
    }
    agreedNewWageCents = Math.max(person.costPerDayCents || 0, course.promotionMinWageCents);
  }

  // Einschreibung erstellen
  const enrollment = {
    id: uid(state, "enr"),
    personId,
    courseId,
    status: "reserved",
    reservedAtMin: state.gameTime,
    blockStarts: preview.blockStarts,
    startMin: preview.startMin,
    endMin: preview.endMin,
    feeCents: course.feeCents,
    feePaid: false,
    blocksCompleted: 0,
    totalBlocks: course.blocks,
    providerCity: PROVIDER_CITY,
    promotionTarget: course.isPromotion ? course.promotionNewRole : null,
    agreedNewWageCents,
    effect: course.effect,
    hours: course.hours,
  };
  state.training.enrollments.push(enrollment);

  // Mail: Anmeldung bestätigt
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Kursanmeldung: " + course.label,
    body: `${person.name} wurde für den Kurs „${course.label}" angemeldet.\n\nTermin: ${formatGameTime(preview.startMin)}\nDauer: ${course.hours} Stunden (${course.blocks} Block${course.blocks > 1 ? "s" : ""})\nGebühr: ${(course.feeCents / 100).toFixed(0)} € (fällig bei Kursbeginn)\nOrt: ${PROVIDER_CITY}`,
    gameTime: state.gameTime, category: "personnel", priority: "normal",
    linkedRefs: { type: "enrollment", id: enrollment.id },
    dedupKey: `course_booked:${enrollment.id}`,
  });

  return {
    ok: true,
    enrollmentId: enrollment.id,
    startMin: preview.startMin,
    endMin: preview.endMin,
    feeCents: course.feeCents,
  };
}

export function cancelCourse(state, enrollmentId) {
  const enr = state.training.enrollments.find(e => e.id === enrollmentId);
  if (!enr) throw new Error("Einschreibung nicht gefunden.");
  if (enr.status === "completed") throw new Error("Kurs bereits abgeschlossen.");
  if (enr.status === "cancelled") throw new Error("Kurs bereits storniert.");

  const wasStarted = enr.status === "in_progress";
  enr.status = "cancelled";
  enr.cancelledAtMin = state.gameTime;

  // Vor Beginn: kostenlos, Reservierung freigeben
  // Nach Beginn: keine volle Gebührenerstattung (feePaid bleibt)
  const course = getCourseById(enr.courseId);
  const person = findPerson(state, enr.personId);

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Kurs storniert: " + (course?.label || enr.courseId),
    body: `${person?.person?.name || "Teilnehmer"} hat den Kurs „${course?.label || enr.courseId}" storniert.\n\n${wasStarted ? "Der Kurs wurde nach Beginn abgebrochen. Bereits erbrachte Leistungen bleiben in der Historie. Keine volle Gebührenerstattung." : "Stornierung vor Kursbeginn. Reservierung freigegeben, keine Gebühr fällig."}`,
    gameTime: state.gameTime, category: "personnel", priority: "normal",
    dedupKey: `course_cancelled:${enr.id}`,
  });

  return { ok: true, wasStarted };
}

// ---------- Kurs-Zeitverarbeitung ----------

// Wird von simulationEngine bei Kurs-Block-Start/-Ende aufgerufen
export function processCourseEvents(state, m, log) {
  for (const enr of state.training.enrollments) {
    if (enr.status === "cancelled" || enr.status === "completed") continue;

    // Block-Start
    if (enr.status === "reserved") {
      const firstBlock = enr.blockStarts[0];
      if (m === firstBlock) {
        // Verfügbarkeit prüfen
        const found = findPerson(state, enr.personId);
        if (!found || !isActivelyEmployed(found.person)) {
          enr.status = "cancelled";
          enr.cancelledAtMin = m;
          enr.cancelReason = "person_unavailable";
          log.push({ type: "course_auto_cancel", enrollment: enr.id, reason: "person_unavailable" });
          continue;
        }
        // Krankheit/Urlaub prüfen
        if (!isPersonAvailable(state, enr.personId, m)) {
          // Verschieben – Block nicht starten
          log.push({ type: "course_blocked", enrollment: enr.id, reason: "absence" });
          continue;
        }

        // Gebühr bei Kursbeginn berechnen
        if (!enr.feePaid) {
          if (state.company.accountCents < enr.feeCents) {
            enr.status = "cancelled";
            enr.cancelledAtMin = m;
            enr.cancelReason = "insufficient_funds";
            log.push({ type: "course_auto_cancel", enrollment: enr.id, reason: "insufficient_funds" });
            deliverMessage(state, {
              fromId: "system", toId: "player",
              subject: "Kurs abgebrochen: unzureichende Mittel",
              body: `Der Kurs für ${found.person.name} konnte wegen unzureichender Firmenmittel nicht gestartet werden. Reservierung freigegeben.`,
              gameTime: m, category: "personnel", priority: "high",
              dedupKey: `course_no_funds:${enr.id}`,
            });
            continue;
          }
          bookExpense(state, {
            expenseAccount: "5150", // Schulungskonto
            liabilityAccount: "1000",
            amountCents: enr.feeCents,
            text: "Schulungsgebühr: " + (getCourseById(enr.courseId)?.label || enr.courseId),
            type: "training_fee",
            gameTime: m, refId: enr.id,
            employeeId: enr.personId,
          });
          enr.feePaid = true;
        }

        enr.status = "in_progress";
        enr.actualStartMin = m;

        // Person als abwesend markieren
        const person = found.person;
        if (found.kind === "driver") {
          person.trainingUntil = enr.blockStarts[enr.blocksCompleted] + BLOCK_MIN;
        } else {
          person.trainingUntil = enr.blockStarts[enr.blocksCompleted] + BLOCK_MIN;
        }

        log.push({ type: "course_started", enrollment: enr.id, atMin: m });
      }
    }

    // Block-Ende
    if (enr.status === "in_progress") {
      const currentBlockEnd = enr.blockStarts[enr.blocksCompleted] + BLOCK_MIN;
      if (m === currentBlockEnd) {
        enr.blocksCompleted++;

        // Person-Status aktualisieren
        const found = findPerson(state, enr.personId);
        if (found) {
          found.person.trainingUntil = null;
          // Nach vollem 8h-Block: 12h Ruhe für Fahrer
          if (found.kind === "driver") {
            found.person.status = "resting";
            found.person.restUntil = m + REST_AFTER_BLOCK_MIN;
            found.person.workMinutesSinceRest = (found.person.workMinutesSinceRest || 0) + BLOCK_MIN;
          }
        }

        if (enr.blocksCompleted >= enr.totalBlocks) {
          // Kurs abgeschlossen
          completeCourseEnrollment(state, enr, m, log);
        } else {
          // Nächster Block am Folgetag
          log.push({ type: "course_block_done", enrollment: enr.id, blocksCompleted: enr.blocksCompleted, atMin: m });
        }
      }
    }
  }

  // ADR-Ablauf prüfen
  checkQualificationExpiry(state, m, log);
}

function completeCourseEnrollment(state, enr, m, log) {
  enr.status = "completed";
  enr.completedAtMin = m;

  const course = getCourseById(enr.courseId);
  const found = findPerson(state, enr.personId);
  if (!found) return;
  const person = found.person;

  // Qualifikation vergeben
  applyCourseEffect(state, enr, course, person, m, log);

  // Beförderung
  if (course.isPromotion && enr.promotionTarget) {
    const oldWage = person.costPerDayCents || 0;
    const newWage = enr.agreedNewWageCents || Math.max(oldWage, course.promotionMinWageCents);
    if (found.kind === "employee") {
      person.role = course.promotionNewRole;
      person.costPerDayCents = newWage;
      // Kapazität aktualisieren
      if (course.effect === "dispo_advanced") person.capacity = 12;
      if (course.effect === "accounting_advanced") person.capacity = 80;
    }
    log.push({ type: "promotion", personId: person.id, newRole: course.promotionNewRole, newWageCents: newWage, atMin: m });
  }

  // Zufriedenheit +3 (mit Cooldown)
  applyCourseSatisfactionBonus(state, enr.personId, m, log);

  // Mail: Abschluss
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Kurs abgeschlossen: " + course.label,
    body: `${person.name} hat den Kurs „${course.label}" erfolgreich abgeschlossen.\n\n${course.effectDesc}${course.isPromotion ? `\n\nBeförderung: ${course.promotionNewRole}, neuer Tageslohn ${(enr.agreedNewWageCents / 100).toFixed(0)} €` : ""}`,
    gameTime: m, category: "personnel", priority: "high",
    linkedRefs: { type: "enrollment", id: enr.id },
    dedupKey: `course_completed:${enr.id}`,
  });

  pushEvent(state, {
    type: "course_completed",
    gameTime: m, isSystem: true,
    personId: enr.personId, personName: person.name,
    details: { courseLabel: course.label, effect: course.effect },
    dedupKey: "course_completed:" + enr.id,
  });

  log.push({ type: "course_completed", enrollment: enr.id, personId: enr.personId, atMin: m });
}

function applyCourseEffect(state, enr, course, person, m, log) {
  const now = m;
  let qualType = course.effect;
  let validUntilMin = null;
  let level = "standard";

  if (course.effect === "adr_basic") {
    validUntilMin = now + ADR_VALIDITY_DAYS * DAY_MIN;
    level = "basic";
  } else if (course.effect === "adr_tank") {
    // Tank übernimmt Basisablauf
    const adrBasic = state.training.qualifications.find(q =>
      q.personId === enr.personId && q.type === "adr_basic" && q.status === "active"
    );
    if (adrBasic) {
      validUntilMin = adrBasic.validUntilMin;
      // Basis als "hat tank" markieren
      adrBasic.hasTank = true;
    }
    qualType = "adr_tank";
    level = "tank";
  } else if (course.effect === "adr_refresh") {
    // Erneuerung: bestehenden Ablauf verlängern
    const adrBasic = state.training.qualifications.find(q =>
      q.personId === enr.personId && q.type === "adr_basic" && q.status === "active"
    );
    if (adrBasic) {
      adrBasic.validUntilMin = (adrBasic.validUntilMin || now) + ADR_REFRESH_EXTEND_DAYS * DAY_MIN;
      adrBasic.refreshCount = (adrBasic.refreshCount || 0) + 1;
      adrBasic.history = adrBasic.history || [];
      adrBasic.history.push({ type: "refreshed", atMin: now, courseId: enr.courseId });
    }
    // Tank ebenfalls verlängern wenn vorhanden
    const adrTank = state.training.qualifications.find(q =>
      q.personId === enr.personId && q.type === "adr_tank" && q.status === "active"
    );
    if (adrTank && adrBasic) {
      adrTank.validUntilMin = adrBasic.validUntilMin;
    }
    return; // Keine neue Qualifikation, nur Verlängerung
  }

  // Neue Qualifikation erstellen
  const qual = {
    id: uid(state, "qual"),
    personId: enr.personId,
    type: qualType,
    level,
    acquiredAtMin: now,
    validUntilMin,
    status: "active",
    source: "course",
    courseId: enr.courseId,
    enrollmentId: enr.id,
    history: [{ type: "acquired", atMin: now, courseId: enr.courseId }],
  };
  state.training.qualifications.push(qual);
}

function applyCourseSatisfactionBonus(state, personId, m, log) {
  const cd = state.training.cooldowns?.[personId] || {};
  if (!state.training.cooldowns) state.training.cooldowns = {};
  if (!state.training.cooldowns[personId]) state.training.cooldowns[personId] = {};

  const lastCourseBonusMin = state.training.cooldowns[personId].lastCourseBonusMin;
  if (lastCourseBonusMin) {
    const daysSince = Math.floor((m - lastCourseBonusMin) / DAY_MIN);
    if (daysSince < SATISFACTION_COURSE_COOLDOWN_DAYS) return;
  }

  const found = findPerson(state, personId);
  if (!found) return;
  const person = found.person;
  const oldValue = person.satisfaction ?? 70;
  const newValue = clamp(oldValue + SATISFACTION_COURSE_BONUS, 0, 100);
  const actualDelta = newValue - oldValue;
  person.satisfaction = newValue;
  state.training.cooldowns[personId].lastCourseBonusMin = m;

  // Historie
  if (!state.satisfaction) state.satisfaction = { history: [] };
  if (!state.satisfaction.history) state.satisfaction.history = [];
  state.satisfaction.history.push({
    id: uid(state, "sh"),
    personId, atMin: m, delta: SATISFACTION_COURSE_BONUS, actualDelta,
    oldValue, newValue, trigger: "Erfolgreiche Weiterbildung", causeType: "course_completed",
  });

  log.push({ type: "course_satisfaction_bonus", personId, delta: actualDelta, atMin: m });
}

// ---------- Qualifikations-Ablauf ----------

function checkQualificationExpiry(state, m, log) {
  for (const q of state.training.qualifications) {
    if (q.status !== "active") continue;
    if (q.validUntilMin && q.validUntilMin <= m) {
      q.status = "expired";
      q.expiredAtMin = m;
      log.push({ type: "qualification_expired", personId: q.personId, qualType: q.type, atMin: m });

      // Mail bei Ablauf
      const found = findPerson(state, q.personId);
      if (found) {
        deliverMessage(state, {
          fromId: "system", toId: "player",
          subject: "Qualifikation abgelaufen: " + q.type,
          body: `Die Qualifikation „${q.type}" von ${found.person.name} ist abgelaufen. Für entsprechende Einsätze ist eine erneute Erstschulung erforderlich.`,
          gameTime: m, category: "personnel", priority: "high",
          dedupKey: `qual_expired:${q.id}:${m}`,
        });
      }
    }
  }

  // Warnungen 120/30/7 Tage vor Ablauf
  for (const q of state.training.qualifications) {
    if (q.status !== "active" || !q.validUntilMin) continue;
    const daysLeft = Math.floor((q.validUntilMin - m) / DAY_MIN);
    if ([120, 30, 7].includes(daysLeft) && !q.warnedDays?.includes(daysLeft)) {
      q.warnedDays = q.warnedDays || [];
      q.warnedDays.push(daysLeft);
      const found = findPerson(state, q.personId);
      if (found) {
        deliverMessage(state, {
          fromId: "system", toId: "player",
          subject: `Qualifikation läuft in ${daysLeft} Tagen ab`,
          body: `Die Qualifikation „${q.type}" von ${found.person.name} läuft in ${daysLeft} Tagen ab. Eine Auffrischung ist innerhalb des Erneuerungsfensters möglich.`,
          gameTime: m, category: "personnel", priority: "normal",
          dedupKey: `qual_warn:${q.id}:${daysLeft}`,
        });
      }
    }
  }
}

// ---------- Effekt-Abfrage für andere Engines ----------

// Prüft ob ein Fahrer Eco-Drive-Qualifikation hat
export function hasEcoDrive(state, personId) {
  return hasQualification(state, personId, "eco_drive");
}

// Prüft ob ein Fahrer ADR-Basis hat (gültig)
export function hasAdrBasic(state, personId) {
  const now = state.gameTime;
  return state.training.qualifications.some(q =>
    q.personId === personId && q.type === "adr_basic" && q.status === "active" &&
    (!q.validUntilMin || q.validUntilMin > now)
  );
}

// Prüft ob ein Fahrer ADR-Tank hat (gültig)
export function hasAdrTank(state, personId) {
  const now = state.gameTime;
  return state.training.qualifications.some(q =>
    q.personId === personId && q.type === "adr_tank" && q.status === "active" &&
    (!q.validUntilMin || q.validUntilMin > now)
  );
}

// Prüft ob ein Mechaniker Materialeffizienz hat
export function hasMaterialEfficiency(state, personId) {
  return hasQualification(state, personId, "mechanic_material_1");
}

// Prüft ob eine Person Mentor-Qualifikation hat
export function hasMentorQualification(state, personId) {
  return hasQualification(state, personId, "mentor_1");
}

// Prüft ob ein Disponent Gefahrgutdisposition hat
export function hasDgDispatch(state, personId) {
  return hasQualification(state, personId, "dispo_dg");
}

// Prüft ob ein Disponent effiziente Tourenplanung gelernt hat
export function hasDispoEfficiency(state, personId) {
  return hasQualification(state, personId, "dispo_efficiency");
}

// Prüft ob ein Assistent die betriebliche Analyse & Steuerung absolviert hat
export function hasAssistantAdvanced(state, personId) {
  return hasQualification(state, personId, "assistant_advanced");
}

// Prüft ob ein Filialleiter das Filialmanagement absolviert hat
export function hasBranchManagerAdvanced(state, personId) {
  return hasQualification(state, personId, "branch_manager_advanced");
}

// Liefert die effektive Kapazität einer Person (mit Qualifikationen)
export function getEffectiveCapacity(state, person) {
  if (!person) return 0;
  const role = person.role || "driver";
  let base = person.capacity || PERSONNEL_ROLES[role]?.capacity || 0;
  // cleaning_advanced: 4 → 6
  if (role === "cleaner" && hasQualification(state, person.id, "cleaning_advanced")) {
    base = 6;
  }
  // dispo_advanced bereits durch Beförderung in capacity gespeichert
  // accounting_advanced bereits durch Beförderung in capacity gespeichert
  return base;
}

// ---------- Ausbildungen (Nachwuchswege) ----------

export const APPRENTICE_ROLES = ["driver", "dispatcher", "mechanic", "cleaner", "accountant"];

export function getTakeoverWage(role) {
  const wages = { driver: 10000, dispatcher: 18000, mechanic: 14000, cleaner: 6000, accountant: 12000 };
  return wages[role] || 10000;
}

export function previewApprenticeship(state, personId, role) {
  const found = findPerson(state, personId);
  if (!found) return { ok: false, reason: "Person nicht gefunden." };
  if (!APPRENTICE_ROLES.includes(role)) return { ok: false, reason: "Unbekannte Rolle." };

  // Prüfe ob Person Auszubildender ist
  const isApprentice = (state.training.apprenticeships || []).some(a =>
    a.personId === personId && ["theory", "practice", "takeover_pending"].includes(a.status)
  );
  if (isApprentice) return { ok: false, reason: "Person ist bereits in einer Ausbildung." };

  // Mentor finden
  const mentor = findMentorForRole(state, role, null);
  const mentorAvailable = !!mentor;

  // Theorie-Slot finden
  const theorySlot = findNextCourseSlot(state, APPRENTICE_THEORY_HOURS / APPRENTICE_HOURS_PER_DAY, state.gameTime);

  return {
    ok: true,
    personId,
    personName: found.person.name,
    role,
    admissionFeeCents: APPRENTICE_ADMISSION_FEE,
    theoryFeeCents: APPRENTICE_THEORY_FEE,
    completionFeeCents: APPRENTICE_COMPLETION_FEE,
    totalFees: APPRENTICE_ADMISSION_FEE + APPRENTICE_THEORY_FEE + APPRENTICE_COMPLETION_FEE,
    trainingWagePerDay: TRAINING_WAGE_PER_DAY,
    takeoverWageCents: getTakeoverWage(role),
    theoryHours: APPRENTICE_THEORY_HOURS,
    practiceHours: APPRENTICE_PRACTICE_HOURS,
    minDays: APPRENTICE_MIN_DAYS,
    mentorAvailable,
    mentorId: mentor?.id || null,
    mentorName: mentor?.name || null,
    theorySlot,
  };
}

function findMentorForRole(state, role, excludeApprenticeshipId) {
  // Mentor mit mentor_1-Qualifikation und gleicher Berufsgruppe
  const allPersons = [
    ...(state.drivers || []).map(d => ({ ...d, kind: "driver" })),
    ...(state.employees || []).map(e => ({ ...e, kind: "employee" })),
  ];

  for (const p of allPersons) {
    if (!isActivelyEmployed(p)) continue;
    if (!hasMentorQualification(state, p.id)) continue;
    // Gleiche Berufsgruppe
    const pRole = p.kind === "driver" ? "driver" : p.role;
    if (pRole !== role && !(role === "dispatcher" && pRole === "dispatcher_senior") && !(role === "accountant" && pRole === "accountant_senior")) continue;
    // Prüfe ob Mentor nicht bereits eine Nachwuchskraft betreut
    const alreadyMentoring = (state.training.apprenticeships || []).some(a =>
      a.mentorId === p.id && a.id !== excludeApprenticeshipId &&
      ["theory", "practice", "takeover_pending"].includes(a.status)
    );
    if (alreadyMentoring) continue;
    return p;
  }
  return null;
}

export function startApprenticeship(state, personId, role, opts = {}) {
  const preview = previewApprenticeship(state, personId, role);
  if (!preview.ok) throw new Error(preview.reason);

  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");

  // Aufnahmegebühr prüfen
  if (state.company.accountCents < APPRENTICE_ADMISSION_FEE) {
    throw new Error(`Firmenkonto reicht für die Aufnahmegebühr (${(APPRENTICE_ADMISSION_FEE / 100).toFixed(0)} €) nicht aus.`);
  }

  // Aufnahmegebühr buchen
  bookExpense(state, {
    expenseAccount: "5150",
    liabilityAccount: "1000",
    amountCents: APPRENTICE_ADMISSION_FEE,
    text: "Ausbildungsaufnahme: " + found.person.name,
    type: "apprentice_admission",
    gameTime: state.gameTime,
    employeeId: personId,
  });

  // Ausbildung erstellen
  const apprenticeship = {
    id: uid(state, "appr"),
    personId,
    role,
    status: "theory",
    startMin: state.gameTime,
    theoryHoursCompleted: 0,
    practiceHoursCompleted: 0,
    mentorId: preview.mentorId,
    mentorAssignedAtMin: preview.mentorId ? state.gameTime : null,
    admissionFeePaid: true,
    theoryFeePaid: false,
    completionFeePaid: false,
    takeoverAuthorized: opts.takeoverAuthorized || false,
    takeoverWageCents: getTakeoverWage(role),
    trainingWageCents: TRAINING_WAGE_PER_DAY,
    currentBlockStart: null,
    history: [{ type: "started", atMin: state.gameTime }],
  };
  state.training.apprenticeships.push(apprenticeship);

  // Person als Auszubildender markieren
  found.person.isApprentice = true;
  found.person.apprenticeshipId = apprenticeship.id;
  found.person.costPerDayCents = TRAINING_WAGE_PER_DAY;

  // Mail
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Ausbildung begonnen: " + found.person.name,
    body: `${found.person.name} wurde als Auszubildender (${roleLabel(role)}) aufgenommen.\n\nAufnahmegebühr: ${(APPRENTICE_ADMISSION_FEE / 100).toFixed(0)} €\nTheorie: ${APPRENTICE_THEORY_HOURS} Stunden\nPraxis: ${APPRENTICE_PRACTICE_HOURS} Stunden (benötigt Mentor)\nAusbildungsvergütung: ${(TRAINING_WAGE_PER_DAY / 100).toFixed(0)} €/Tag\nÜbernahme: ${opts.takeoverAuthorized ? "vorab autorisiert" : "offen"}\nGeplante Abschlusskosten: ${(APPRENTICE_COMPLETION_FEE / 100).toFixed(0)} €\nTheoriegebühr bei Theoriebeginn: ${(APPRENTICE_THEORY_FEE / 100).toFixed(0)} €`,
    gameTime: state.gameTime, category: "personnel", priority: "high",
    linkedRefs: { type: "apprenticeship", id: apprenticeship.id },
    dedupKey: `apprentice_started:${apprenticeship.id}`,
  });

  return { ok: true, apprenticeshipId: apprenticeship.id };
}

function roleLabel(role) {
  const labels = { driver: "Fahrer", dispatcher: "Disposition", mechanic: "Mechanik", cleaner: "Reinigung", accountant: "Buchhaltung" };
  return labels[role] || role;
}

// ---------- Ausbildungs-Zeitverarbeitung ----------

export function processApprenticeshipEvents(state, m, log) {
  for (const appr of state.training.apprenticeships) {
    if (["completed", "cancelled"].includes(appr.status)) continue;

    // Theoriephase: 8h Blöcke wie Kurse
    if (appr.status === "theory") {
      // Prüfe ob ein Theorieblock ansteht
      if (!appr.currentBlockStart) {
        // Nächsten Theorieblock finden
        const slot = findNextCourseSlot(state, 1, Math.max(m, appr.lastBlockEndMin || appr.startMin));
        if (slot && slot <= m) {
          // Block starten
          if (!isPersonAvailable(state, appr.personId, m)) continue;
          appr.currentBlockStart = m;
          appr.lastBlockEndMin = m + BLOCK_MIN;

          // Theoriegebühr beim ersten Theorieblock
          if (!appr.theoryFeePaid) {
            if (state.company.accountCents < APPRENTICE_THEORY_FEE) {
              appr.status = "cancelled";
              appr.cancelledAtMin = m;
              appr.cancelReason = "insufficient_funds";
              log.push({ type: "apprentice_cancelled", apprenticeship: appr.id, reason: "insufficient_funds" });
              continue;
            }
            bookExpense(state, {
              expenseAccount: "5150",
              liabilityAccount: "1000",
              amountCents: APPRENTICE_THEORY_FEE,
              text: "Ausbildungstheorie: " + (findPerson(state, appr.personId)?.person?.name || ""),
              type: "apprentice_theory",
              gameTime: m, employeeId: appr.personId,
            });
            appr.theoryFeePaid = true;
          }

          // Person abwesend
          const found = findPerson(state, appr.personId);
          if (found) found.person.trainingUntil = m + BLOCK_MIN;

          log.push({ type: "apprentice_theory_block_start", apprenticeship: appr.id, atMin: m });
        }
      } else if (m >= appr.currentBlockStart + BLOCK_MIN) {
        // Block beendet
        appr.theoryHoursCompleted += APPRENTICE_HOURS_PER_DAY;
        appr.currentBlockStart = null;
        appr.lastBlockEndMin = m;

        const found = findPerson(state, appr.personId);
        if (found) {
          found.person.trainingUntil = null;
          if (found.kind === "driver") {
            found.person.status = "resting";
            found.person.restUntil = m + REST_AFTER_BLOCK_MIN;
          }
        }

        log.push({ type: "apprentice_theory_block_done", apprenticeship: appr.id, hours: appr.theoryHoursCompleted, atMin: m });

        // Theorie abgeschlossen?
        if (appr.theoryHoursCompleted >= APPRENTICE_THEORY_HOURS) {
          appr.status = "practice";
          appr.theoryCompletedAtMin = m;
          log.push({ type: "apprentice_theory_done", apprenticeship: appr.id, atMin: m });
        }
      }
    }

    // Praxisphase: 8h Blöcke mit Mentor
    if (appr.status === "practice") {
      if (!appr.mentorId) {
        // Versuche Mentor zu finden
        const mentor = findMentorForRole(state, appr.role, appr.id);
        if (mentor) {
          appr.mentorId = mentor.id;
          appr.mentorAssignedAtMin = m;
          log.push({ type: "apprentice_mentor_assigned", apprenticeship: appr.id, mentorId: mentor.id, atMin: m });
        } else {
          continue; // Kein Mentor, Praxis wartet
        }
      }

      if (!appr.currentBlockStart) {
        const slot = findNextCourseSlot(state, 1, Math.max(m, appr.lastBlockEndMin || appr.theoryCompletedAtMin || appr.startMin));
        if (slot && slot <= m) {
          // Prüfe Mentor-Verfügbarkeit
          const mentor = findPerson(state, appr.mentorId);
          if (!mentor || !isActivelyEmployed(mentor.person) || !isPersonAvailable(state, appr.mentorId, m)) {
            continue;
          }
          // Prüfe Auszubildenden-Verfügbarkeit
          if (!isPersonAvailable(state, appr.personId, m)) continue;

          appr.currentBlockStart = m;
          appr.lastBlockEndMin = m + BLOCK_MIN;

          // Beide abwesend
          const apprentice = findPerson(state, appr.personId);
          if (apprentice) apprentice.person.trainingUntil = m + BLOCK_MIN;
          if (mentor) mentor.person.trainingUntil = m + BLOCK_MIN;

          log.push({ type: "apprentice_practice_block_start", apprenticeship: appr.id, mentorId: appr.mentorId, atMin: m });
        }
      } else if (m >= appr.currentBlockStart + BLOCK_MIN) {
        appr.practiceHoursCompleted += APPRENTICE_HOURS_PER_DAY;
        appr.currentBlockStart = null;
        appr.lastBlockEndMin = m;

        const apprentice = findPerson(state, appr.personId);
        const mentor = findPerson(state, appr.mentorId);
        if (apprentice) apprentice.person.trainingUntil = null;
        if (mentor) {
          mentor.person.trainingUntil = null;
          if (mentor.kind === "driver") {
            mentor.person.status = "resting";
            mentor.person.restUntil = m + REST_AFTER_BLOCK_MIN;
          }
        }
        if (apprentice && apprentice.kind === "driver") {
          apprentice.person.status = "resting";
          apprentice.person.restUntil = m + REST_AFTER_BLOCK_MIN;
        }

        log.push({ type: "apprentice_practice_block_done", apprenticeship: appr.id, hours: appr.practiceHoursCompleted, atMin: m });

        // Praxis abgeschlossen?
        if (appr.practiceHoursCompleted >= APPRENTICE_PRACTICE_HOURS) {
          completeApprenticeship(state, appr, m, log);
        }
      }
    }

    // Übernahme ausstehend
    if (appr.status === "takeover_pending") {
      // Warte auf Spieler-Entscheidung (7 Tage Frist)
      const deadline = appr.completionAtMin + 7 * DAY_MIN;
      if (m >= deadline) {
        // Befristeter Vertrag endet
        appr.status = "expired";
        appr.expiredAtMin = m;
        const found = findPerson(state, appr.personId);
        if (found) {
          found.person.isApprentice = false;
          found.person.employmentStatus = "former";
          found.person.actualExitMin = m;
        }
        log.push({ type: "apprentice_expired", apprenticeship: appr.id, atMin: m });
      }
    }
  }
}

function completeApprenticeship(state, appr, m, log) {
  appr.status = "takeover_pending";
  appr.completionAtMin = m;

  // Abschlussgebühr
  if (state.company.accountCents >= APPRENTICE_COMPLETION_FEE) {
    bookExpense(state, {
      expenseAccount: "5150",
      liabilityAccount: "1000",
      amountCents: APPRENTICE_COMPLETION_FEE,
      text: "Ausbildungsabschluss: " + (findPerson(state, appr.personId)?.person?.name || ""),
      type: "apprentice_completion",
      gameTime: m, employeeId: appr.personId,
    });
    appr.completionFeePaid = true;
  }

  // Standardqualifikation vergeben
  const found = findPerson(state, appr.personId);
  if (found) {
    const qualType = found.kind === "driver" ? "driver_license" : "role_" + appr.role;
    state.training.qualifications.push({
      id: uid(state, "qual"),
      personId: appr.personId,
      type: qualType,
      level: "standard",
      acquiredAtMin: m,
      validUntilMin: null,
      status: "active",
      source: "apprenticeship",
      courseId: null,
      apprenticeshipId: appr.id,
      history: [{ type: "acquired", atMin: m, source: "apprenticeship" }],
    });
  }

  // Letzte Ausbildungsvergütung an der nächsten Mitternacht
  // Übernahme-Entscheidung offen
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Ausbildung abgeschlossen: " + (found?.person?.name || ""),
    body: `${found?.person?.name || "Auszubildender"} hat die Ausbildung (${roleLabel(appr.role)}) erfolgreich abgeschlossen.\n\nAbschlussgebühr: ${(APPRENTICE_COMPLETION_FEE / 100).toFixed(0)} €\nÜbernahme: ${appr.takeoverAuthorized ? "vorab autorisiert – wird aktiviert" : "Entscheidung offen (7 Tage Frist)"}\nÜbernahmelohn: ${(appr.takeoverWageCents / 100).toFixed(0)} €/Tag`,
    gameTime: m, category: "personnel", priority: "high",
    linkedRefs: { type: "apprenticeship", id: appr.id },
    dedupKey: `apprentice_completed:${appr.id}`,
    quickReplies: [
      { label: "Übernehmen", intentType: "takeover_apprentice", params: { apprenticeshipId: appr.id } },
      { label: "Nicht übernehmen", intentType: "release_apprentice", params: { apprenticeshipId: appr.id } },
    ],
  });

  // Wenn vorab autorisiert: automatisch übernehmen
  if (appr.takeoverAuthorized) {
    takeoverApprentice(state, appr.id, m, log);
  }

  log.push({ type: "apprentice_completed", apprenticeship: appr.id, atMin: m });
}

export function takeoverApprentice(state, apprenticeshipId, m, log) {
  const appr = state.training.apprenticeships.find(a => a.id === apprenticeshipId);
  if (!appr) throw new Error("Ausbildung nicht gefunden.");
  if (appr.status !== "takeover_pending") throw new Error("Ausbildung ist nicht zur Übernahme bereit.");

  const found = findPerson(state, appr.personId);
  if (!found) throw new Error("Person nicht gefunden.");

  // Rollenvertrag aktivieren
  found.person.isApprentice = false;
  found.person.costPerDayCents = appr.takeoverWageCents;
  if (found.kind === "employee") {
    found.person.role = appr.role;
  }
  appr.status = "completed";
  appr.takenOverAtMin = m;

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Übernahme: " + found.person.name,
    body: `${found.person.name} wurde als ${roleLabel(appr.role)} übernommen.\n\nNeuer Tageslohn: ${(appr.takeoverWageCents / 100).toFixed(0)} €\nKeine zweite Einstellungsgebühr.`,
    gameTime: m, category: "personnel", priority: "high",
    dedupKey: `apprentice_taken_over:${appr.id}`,
  });

  log.push({ type: "apprentice_taken_over", apprenticeship: appr.id, atMin: m });
  return { ok: true };
}

export function releaseApprentice(state, apprenticeshipId, m) {
  const appr = state.training.apprenticeships.find(a => a.id === apprenticeshipId);
  if (!appr) throw new Error("Ausbildung nicht gefunden.");
  if (appr.status !== "takeover_pending") throw new Error("Ausbildung ist nicht zur Übernahme bereit.");

  const found = findPerson(state, appr.personId);
  if (found) {
    found.person.isApprentice = false;
    found.person.employmentStatus = "former";
    found.person.actualExitMin = m;
  }
  appr.status = "released";
  appr.releasedAtMin = m;

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Ausbildungsvertrag beendet: " + (found?.person?.name || ""),
    body: `${found?.person?.name || "Auszubildender"} wurde nicht übernommen. Der befristete Ausbildungsvertrag ist beendet.\n\nDie absolvierte Ausbildung bleibt dauerhaft in der Historie.`,
    gameTime: m, category: "personnel", priority: "normal",
    dedupKey: `apprentice_released:${appr.id}`,
  });

  return { ok: true };
}

// ---------- Auto-Refresh ----------

export function updateAutoRefreshConfig(state, config) {
  state.training.autoRefreshConfig = config;
  return { ok: true, config };
}

export function getAutoRefreshConfig(state) {
  return state.training.autoRefreshConfig;
}

// ---------- Getter für UI ----------

export function getTrainingOverview(state) {
  const enrollments = state.training.enrollments.filter(e => ["reserved", "in_progress"].includes(e.status));
  const apprenticeships = state.training.apprenticeships.filter(a => ["theory", "practice", "takeover_pending"].includes(a.status));
  const upcomingCompletions = [...enrollments, ...apprenticeships]
    .map(e => ({ id: e.id, personId: e.personId, type: "enrollment" in e ? "course" : "apprenticeship", endMin: e.endMin || e.completionAtMin }))
    .sort((a, b) => (a.endMin || 0) - (b.endMin || 0));

  // Ablaufende Qualifikationen
  const expiringSoon = state.training.qualifications
    .filter(q => q.status === "active" && q.validUntilMin)
    .map(q => ({
      ...q,
      daysLeft: Math.floor((q.validUntilMin - state.gameTime) / DAY_MIN),
    }))
    .filter(q => q.daysLeft <= 120)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // Offene Übernahmen
  const pendingTakeovers = apprenticeships.filter(a => a.status === "takeover_pending");

  return {
    activeEnrollments: enrollments.length,
    activeApprenticeships: apprenticeships.length,
    upcomingCompletions,
    expiringSoon,
    pendingTakeovers,
    providerSlotsUsed: countUsedProviderSlots(state, state.gameTime, state.gameTime + DAY_MIN),
    providerSlotsTotal: PROVIDER_SLOTS,
  };
}

export function getTrainingSchedule(state, fromMin, toMin) {
  const events = [];
  for (const enr of state.training.enrollments) {
    if (["cancelled", "completed"].includes(enr.status)) continue;
    for (const bs of enr.blockStarts) {
      if (bs >= fromMin && bs < toMin) {
        events.push({
          id: enr.id + "_" + bs,
          type: "course_block",
          personId: enr.personId,
          courseId: enr.courseId,
          courseLabel: getCourseById(enr.courseId)?.label || enr.courseId,
          startMin: bs,
          endMin: bs + BLOCK_MIN,
          status: enr.status,
        });
      }
    }
  }
  for (const appr of state.training.apprenticeships) {
    if (["completed", "cancelled", "expired", "released"].includes(appr.status)) continue;
    // Theorie/Praxis-Blöcke sind dynamisch, zeige geplante
    const nextSlot = appr.currentBlockStart || appr.lastBlockEndMin || appr.startMin;
    if (nextSlot >= fromMin && nextSlot < toMin) {
      events.push({
        id: appr.id + "_next",
        type: appr.status === "theory" ? "apprentice_theory" : "apprentice_practice",
        personId: appr.personId,
        role: appr.role,
        startMin: nextSlot,
        endMin: nextSlot + BLOCK_MIN,
        status: appr.status,
      });
    }
  }
  return events.sort((a, b) => a.startMin - b.startMin);
}

// Liefere Ereigniszeiten für simulationEngine
export function getTrainingEventTimes(state, t, maxMin) {
  const times = [];
  for (const enr of state.training.enrollments) {
    if (["cancelled", "completed"].includes(enr.status)) continue;
    for (const bs of enr.blockStarts) {
      if (bs > t && bs <= maxMin) times.push(bs);
      if (bs + BLOCK_MIN > t && bs + BLOCK_MIN <= maxMin) times.push(bs + BLOCK_MIN);
    }
  }
  for (const appr of state.training.apprenticeships) {
    if (["completed", "cancelled", "expired", "released"].includes(appr.status)) continue;
    // Nächster möglicher Block
    const nextPossible = appr.lastBlockEndMin || appr.startMin;
    if (nextPossible > t && nextPossible <= maxMin) times.push(nextPossible);
    if (nextPossible + BLOCK_MIN > t && nextPossible + BLOCK_MIN <= maxMin) times.push(nextPossible + BLOCK_MIN);
    // Übernahme-Frist
    if (appr.status === "takeover_pending") {
      const deadline = appr.completionAtMin + 7 * DAY_MIN;
      if (deadline > t && deadline <= maxMin) times.push(deadline);
    }
  }
  // Qualifikations-Ablauf
  for (const q of state.training.qualifications) {
    if (q.status === "active" && q.validUntilMin && q.validUntilMin > t && q.validUntilMin <= maxMin) {
      times.push(q.validUntilMin);
    }
  }
  return times;
}

// Prüfe ob Person in Ausbildung/Training ist (für Disposition)
export function isPersonInTraining(state, personId, atMin) {
  const m = atMin || state.gameTime;
  // Kurs
  for (const enr of state.training.enrollments) {
    if (enr.personId !== personId) continue;
    if (!["reserved", "in_progress"].includes(enr.status)) continue;
    for (const bs of enr.blockStarts) {
      if (m >= bs && m < bs + BLOCK_MIN) return true;
    }
  }
  // Ausbildung
  for (const appr of state.training.apprenticeships) {
    if (appr.personId !== personId) continue;
    if (!["theory", "practice"].includes(appr.status)) continue;
    if (appr.currentBlockStart && m >= appr.currentBlockStart && m < appr.currentBlockStart + BLOCK_MIN) return true;
  }
  // trainingUntil Flag
  const found = findPerson(state, personId);
  if (found && found.person.trainingUntil && m < found.person.trainingUntil) return true;
  return false;
}