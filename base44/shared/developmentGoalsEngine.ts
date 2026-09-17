// Entwicklungsziele-, Mentoring- und Zusagen-Engine für FERNWERK.
// Baut auf vorhandenen Personal-, Ausbildungs-, Zufriedenheits- und Abwesenheits-
// systemen auf. Verwaltet:
//   - Persönliche Entwicklungsziele (ohne automatische Qualifikationsvergabe)
//   - Mentoring-Zuordnungen mit realer Lernzeitplanung
//   - Zusagen aus Mitarbeitergesprächen mit Erfüllungs-Tracking
//   - Gesprächs-Sperrfristen pro Anlass
// Reine Logik – keine Auth, keine Speicherung.

import { dayOf, formatGameTime } from "./gameRules.ts";
import { findPerson, isActivelyEmployed } from "./terminationEngine.ts";
import { isPersonAvailable } from "./absenceEngine.ts";
import { hasQualification, getPersonQualifications, getCourseById, COURSE_CATALOG, hasMentorQualification, checkCoursePrerequisites } from "./trainingEngine.ts";
import { deliverMessage } from "./mailEngine.ts";
import { pushEvent } from "./eventLog.ts";

const DAY_MIN = 1440;
const MENTORING_BLOCK_MIN = 480; // 8 Stunden wie Kursblöcke
const MENTORING_BLOCKS_PER_GOAL = 3; // 3 Lerntermine pro Ziel
const MENTORING_SERVICE_START = 480; // 08:00
const CONVERSATION_COOLDOWN_DAYS = 14; // Sperrfrist für denselben Gesprächsanlass
const PROMISE_OVERDUE_GRACE_DAYS = 3; // Kulanz vor "broken"-Markierung

// ---------- Migration ----------

export function migrateDevelopmentGoals(state) {
  if (!state.developmentGoals) {
    state.developmentGoals = {
      goals: [],
      mentoring: [],
      promises: [],
      conversationCooldowns: {},
    };
  }
  if (!state.developmentGoals.goals) state.developmentGoals.goals = [];
  if (!state.developmentGoals.mentoring) state.developmentGoals.mentoring = [];
  if (!state.developmentGoals.promises) state.developmentGoals.promises = [];
  if (!state.developmentGoals.conversationCooldowns) state.developmentGoals.conversationCooldowns = {};
}

// ---------- Hilfsfunktionen ----------

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function getRoleOf(found) {
  if (!found) return null;
  return found.kind === "driver" ? "driver" : found.person.role;
}

// Liefert passende Kurse für eine Person basierend auf Rolle und fehlenden Qualifikationen.
export function getSuggestedCourses(state, personId) {
  const found = findPerson(state, personId);
  if (!found || !isActivelyEmployed(found.person)) return [];
  const role = getRoleOf(found);
  const suggestions = [];
  for (const course of COURSE_CATALOG) {
    if (course.targetRole !== "any") {
      const targetRoles = [course.targetRole];
      if (course.targetRoleSenior) targetRoles.push(course.targetRoleSenior);
      if (!targetRoles.includes(role)) continue;
    }
    // Prüfe ob Qualifikation bereits vorhanden
    if (course.effect && !course.effect.startsWith("adr_refresh")) {
      if (hasQualification(state, personId, course.effect)) continue;
    }
    // Voraussetzungen prüfen (nur Info, nicht blockierend für Anzeige)
    const prereq = checkCoursePrerequisites(state, personId, course.id);
    suggestions.push({
      courseId: course.id,
      label: course.label,
      effectDesc: course.effectDesc,
      feeCents: course.feeCents,
      hours: course.hours,
      blocks: course.blocks,
      requires: course.requires,
      prerequisitesMet: prereq.ok,
      prerequisiteReason: prereq.ok ? null : prereq.reason,
      isPromotion: !!course.isPromotion,
    });
  }
  return suggestions;
}

// ---------- Entwicklungsziele ----------

export function createDevelopmentGoal(state, personId, params) {
  migrateDevelopmentGoals(state);
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");
  if (!isActivelyEmployed(found.person)) throw new Error("Person ist nicht mehr aktiv beschäftigt.");

  const role = getRoleOf(found);
  let title = params.title;
  let targetQualificationType = null;
  let targetCourseId = null;
  let prerequisites = [];
  let estimatedCostCents = 0;
  let expectedAbsenceDays = 0;

  if (params.targetCourseId) {
    const course = getCourseById(params.targetCourseId);
    if (!course) throw new Error("Unbekannter Kurs.");
    targetCourseId = course.id;
    targetQualificationType = course.effect;
    title = title || course.label;
    estimatedCostCents = course.feeCents;
    expectedAbsenceDays = course.blocks;
    // Voraussetzungen als Texte
    prerequisites = describePrerequisites(state, personId, course);
  } else if (params.targetQualificationType) {
    targetQualificationType = params.targetQualificationType;
    title = title || "Qualifikation: " + params.targetQualificationType;
  } else if (params.title) {
    title = params.title;
  } else {
    throw new Error("Entwicklungsziel braucht mindestens einen Titel oder Kursbezug.");
  }

  const goal = {
    id: uid(state, "goal"),
    personId,
    title,
    description: params.description || "",
    type: params.type || (targetCourseId ? "qualification" : "role_development"),
    targetQualificationType,
    targetCourseId,
    prerequisites,
    estimatedCostCents,
    expectedAbsenceDays,
    targetDeadlineMin: params.targetDeadlineMin || null,
    status: "active",
    progress: 0,
    progressNotes: [],
    createdAtMin: state.gameTime,
    completedAtMin: null,
    linkedMentoringId: null,
  };
  state.developmentGoals.goals.push(goal);

  pushEvent(state, {
    type: "development_goal_created",
    gameTime: state.gameTime, isSystem: false,
    personId, personName: found.person.name,
    details: { goalId: goal.id, title: goal.title },
    dedupKey: "dev_goal_created:" + goal.id,
  });

  return { ok: true, goalId: goal.id };
}

function describePrerequisites(state, personId, course) {
  const descs = [];
  for (const req of course.requires) {
    if (req === "driver_license") {
      if (!hasQualification(state, personId, "driver_license")) descs.push("Fahrerqualifikation erforderlich");
    } else if (req === "adr_basic_valid") {
      if (!hasQualification(state, personId, "adr_basic")) descs.push("Gültige ADR-Basisqualifikation erforderlich");
    } else if (req === "adr_refresh_window") {
      descs.push("Auffrischung nur im Erneuerungsfenster vor Ablauf");
    } else if (req === "dispatcher_role") {
      descs.push("Rolle: Disponent");
    } else if (req === "mechanic_role") {
      descs.push("Rolle: Mechaniker");
    } else if (req === "cleaner_role") {
      descs.push("Rolle: Reinigungskraft");
    } else if (req === "accountant_role") {
      descs.push("Rolle: Buchhaltung");
    } else if (req === "assistant_role") {
      descs.push("Rolle: Assistent");
    } else if (req === "branch_manager_role") {
      descs.push("Rolle: Filialleiter");
    } else if (req === "any_qualified") {
      descs.push("Aktive Beschäftigung");
    }
  }
  return descs;
}

export function removeDevelopmentGoal(state, goalId) {
  migrateDevelopmentGoals(state);
  const goal = state.developmentGoals.goals.find(g => g.id === goalId);
  if (!goal) throw new Error("Ziel nicht gefunden.");
  if (goal.status === "completed") throw new Error("Abgeschlossene Ziele können nicht entfernt werden.");
  goal.status = "cancelled";
  goal.cancelledAtMin = state.gameTime;
  // Verbundenes Mentoring beenden
  if (goal.linkedMentoringId) {
    const ment = state.developmentGoals.mentoring.find(m => m.id === goal.linkedMentoringId);
    if (ment && ment.status === "active") {
      ment.status = "ended";
      ment.endDateMin = state.gameTime;
      ment.endReason = "goal_cancelled";
    }
  }
  return { ok: true };
}

export function getPersonGoals(state, personId) {
  migrateDevelopmentGoals(state);
  return state.developmentGoals.goals
    .filter(g => g.personId === personId && g.status === "active")
    .sort((a, b) => (a.createdAtMin || 0) - (b.createdAtMin || 0));
}

export function getActiveGoals(state) {
  migrateDevelopmentGoals(state);
  return state.developmentGoals.goals.filter(g => g.status === "active");
}

// Prüft, ob ein Ziel durch eine tatsächliche Spielhandlung erfüllt wurde.
// Wird nach Kursabschluss, Beförderung etc. aufgerufen.
export function checkGoalFulfillment(state, personId, qualificationType) {
  migrateDevelopmentGoals(state);
  const goals = state.developmentGoals.goals.filter(g =>
    g.personId === personId && g.status === "active"
  );
  for (const goal of goals) {
    if (goal.targetQualificationType && goal.targetQualificationType === qualificationType) {
      goal.status = "completed";
      goal.completedAtMin = state.gameTime;
      goal.progress = 100;
      goal.progressNotes.push({ atMin: state.gameTime, text: "Qualifikation erworchen: " + qualificationType });
      // Verbundenes Mentoring abschließen
      if (goal.linkedMentoringId) {
        const ment = state.developmentGoals.mentoring.find(m => m.id === goal.linkedMentoringId);
        if (ment && ment.status === "active") {
          ment.status = "completed";
          ment.endDateMin = state.gameTime;
        }
      }
      pushEvent(state, {
        type: "development_goal_completed",
        gameTime: state.gameTime, isSystem: true,
        personId,
        details: { goalId: goal.id, title: goal.title },
        dedupKey: "dev_goal_done:" + goal.id,
      });
    }
  }
}

// ---------- Mentoring ----------

// Verfügbare Mentoren für eine Person (mit mentor_1-Qualifikation, aktiv, nicht selbst betreut)
export function getAvailableMentors(state, menteeId) {
  migrateDevelopmentGoals(state);
  const found = findPerson(state, menteeId);
  if (!found) return [];
  const menteeRole = getRoleOf(found);
  const mentors = [];
  const allPersons = [
    ...(state.drivers || []).map(d => ({ ...d, _kind: "driver" })),
    ...(state.employees || []).map(e => ({ ...e, _kind: "employee" })),
  ];
  for (const p of allPersons) {
    if (p.id === menteeId) continue;
    if (!isActivelyEmployed(p)) continue;
    if (!hasMentorQualification(state, p.id)) continue;
    // Gleiche Berufsgruppe (wie bei apprenticeship)
    const pRole = p._kind === "driver" ? "driver" : p.role;
    if (pRole !== menteeRole &&
        !(menteeRole === "dispatcher" && pRole === "dispatcher_senior") &&
        !(menteeRole === "accountant" && pRole === "accountant_senior")) continue;
    // Prüfe ob bereits eine aktive Betreuung hat
    const alreadyMentoring = state.developmentGoals.mentoring.some(m =>
      m.mentorId === p.id && m.status === "active"
    );
    if (alreadyMentoring) continue;
    mentors.push({
      id: p.id,
      name: p.name,
      role: pRole,
      kind: p._kind,
      portraitId: p.portraitId,
    });
  }
  return mentors;
}

export function assignMentor(state, params) {
  migrateDevelopmentGoals(state);
  const { mentorId, menteeId, goalId } = params;
  const mentor = findPerson(state, mentorId);
  if (!mentor) throw new Error("Mentor nicht gefunden.");
  if (!isActivelyEmployed(mentor.person)) throw new Error("Mentor ist nicht mehr aktiv beschäftigt.");
  if (!hasMentorQualification(state, mentorId)) throw new Error("Mentor hat keine Ausbildungsbegleitung-Qualifikation.");
  const mentee = findPerson(state, menteeId);
  if (!mentee) throw new Error("Mitarbeiter nicht gefunden.");
  if (!isActivelyEmployed(mentee.person)) throw new Error("Mitarbeiter ist nicht mehr aktiv beschäftigt.");
  // Max eine aktive Betreuung je Mentor
  const alreadyMentoring = state.developmentGoals.mentoring.some(m =>
    m.mentorId === mentorId && m.status === "active"
  );
  if (alreadyMentoring) throw new Error("Mentor betreut bereits eine Person.");
  // Mentee darf nur ein aktives Mentoring haben
  const menteeAlready = state.developmentGoals.mentoring.some(m =>
    m.menteeId === menteeId && m.status === "active"
  );
  if (menteeAlready) throw new Error("Mitarbeiter wird bereits betreut.");

  const goal = goalId ? state.developmentGoals.goals.find(g => g.id === goalId) : null;

  const assignment = {
    id: uid(state, "ment"),
    mentorId,
    menteeId,
    goalId: goalId || null,
    status: "active",
    startDateMin: state.gameTime,
    endDateMin: null,
    sessionsPlanned: MENTORING_BLOCKS_PER_GOAL,
    sessionsCompleted: 0,
    hoursCompleted: 0,
    nextSessionMin: null,
    currentBlockStart: null,
    pauseReason: null,
    createdAtMin: state.gameTime,
  };
  state.developmentGoals.mentoring.push(assignment);

  if (goal) {
    goal.linkedMentoringId = assignment.id;
  }

  pushEvent(state, {
    type: "mentoring_assigned",
    gameTime: state.gameTime, isSystem: false,
    personId: menteeId, personName: mentee.person.name,
    details: { mentorId, mentorName: mentor.person.name, goalId },
    dedupKey: "mentoring_assigned:" + assignment.id,
  });

  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject: "Mentoring zugewiesen: " + mentee.person.name,
    body: `${mentor.person.name} betreut ab sofort ${mentee.person.name} bei der Entwicklung${goal ? " (Ziel: " + goal.title + ")" : ""}.\n\nGeplante Lerntermine: ${MENTORING_BLOCKS_PER_GOAL} × 8 Stunden. Beide sind während der Lernzeit nicht für operative Aufgaben verfügbar.`,
    gameTime: state.gameTime, category: "personnel", priority: "normal",
    dedupKey: "mentoring_assigned_msg:" + assignment.id,
  });

  return { ok: true, assignmentId: assignment.id };
}

export function removeMentoring(state, assignmentId) {
  migrateDevelopmentGoals(state);
  const ment = state.developmentGoals.mentoring.find(m => m.id === assignmentId);
  if (!ment) throw new Error("Mentoring-Zuordnung nicht gefunden.");
  if (ment.status !== "active") throw new Error("Mentoring ist nicht mehr aktiv.");
  ment.status = "ended";
  ment.endDateMin = state.gameTime;
  ment.endReason = "manual_removal";
  // Goal-Verknüpfung aufheben
  if (ment.goalId) {
    const goal = state.developmentGoals.goals.find(g => g.id === ment.goalId);
    if (goal) goal.linkedMentoringId = null;
  }
  return { ok: true };
}

export function getMentoringForPerson(state, personId) {
  migrateDevelopmentGoals(state);
  return state.developmentGoals.mentoring.filter(m =>
    (m.mentorId === personId || m.menteeId === personId) && m.status === "active"
  );
}

export function getActiveMentoring(state) {
  migrateDevelopmentGoals(state);
  return state.developmentGoals.mentoring.filter(m => m.status === "active");
}

// Mentoring-Zeitverarbeitung: plant Lernblöcke wie Kursblöcke.
// Wird von simulationEngine bei jedem Zeitschritt aufgerufen.
export function processMentoringEvents(state, m, log) {
  migrateDevelopmentGoals(state);
  for (const ment of state.developmentGoals.mentoring) {
    if (ment.status !== "active") continue;

    // Prüfe ob Mentor oder Mentee nicht mehr verfügbar
    const mentor = findPerson(state, ment.mentorId);
    const mentee = findPerson(state, ment.menteeId);
    if (!mentor || !isActivelyEmployed(mentor.person)) {
      ment.status = "paused";
      ment.pauseReason = "mentor_unavailable";
      ment.currentBlockStart = null;
      log.push({ type: "mentoring_paused", assignment: ment.id, reason: "mentor_unavailable" });
      continue;
    }
    if (!mentee || !isActivelyEmployed(mentee.person)) {
      ment.status = "paused";
      ment.pauseReason = "mentee_unavailable";
      ment.currentBlockStart = null;
      log.push({ type: "mentoring_paused", assignment: ment.id, reason: "mentee_unavailable" });
      continue;
    }

    // Pausiertes Mentoring wieder aufnehmen wenn beide wieder verfügbar
    if (ment.status === "paused") {
      if (isPersonAvailable(state, ment.mentorId, m) && isPersonAvailable(state, ment.menteeId, m)) {
        ment.status = "active";
        ment.pauseReason = null;
        log.push({ type: "mentoring_resumed", assignment: ment.id, atMin: m });
      } else {
        continue;
      }
    }

    // Block-Start: prüfe ob ein neuer Block ansteht
    if (!ment.currentBlockStart) {
      // Nächster möglicher Block: nächste Dienstbeginn-Zeit
      const earliest = Math.max(m, ment.lastBlockEndMin || ment.startDateMin);
      const candidate = Math.ceil(earliest / DAY_MIN) * DAY_MIN + MENTORING_SERVICE_START;
      if (candidate === m) {
        // Beide müssen verfügbar sein
        if (!isPersonAvailable(state, ment.mentorId, m)) continue;
        if (!isPersonAvailable(state, ment.menteeId, m)) continue;
        // Nicht im Training
        if (mentor.person.trainingUntil && mentor.person.trainingUntil > m) continue;
        if (mentee.person.trainingUntil && mentee.person.trainingUntil > m) continue;

        ment.currentBlockStart = m;
        ment.lastBlockEndMin = m + MENTORING_BLOCK_MIN;
        // Beide als im Training markieren
        mentor.person.trainingUntil = m + MENTORING_BLOCK_MIN;
        mentee.person.trainingUntil = m + MENTORING_BLOCK_MIN;

        log.push({ type: "mentoring_block_start", assignment: ment.id, atMin: m });
      }
    } else if (m >= ment.currentBlockStart + MENTORING_BLOCK_MIN) {
      // Block-Ende
      ment.sessionsCompleted++;
      ment.hoursCompleted += 8;
      ment.currentBlockStart = null;
      ment.lastBlockEndMin = m;

      // trainingUntil zurücksetzen
      const m1 = findPerson(state, ment.mentorId);
      const m2 = findPerson(state, ment.menteeId);
      if (m1) m1.person.trainingUntil = null;
      if (m2) m2.person.trainingUntil = null;
      // Fahrer nach Block in Ruhe
      if (m1 && m1.kind === "driver") {
        m1.person.status = "resting";
        m1.person.restUntil = m + 720; // 12h Ruhe
      }
      if (m2 && m2.kind === "driver") {
        m2.person.status = "resting";
        m2.person.restUntil = m + 720;
      }

      // Fortschritt aktualisieren
      if (ment.goalId) {
        const goal = state.developmentGoals.goals.find(g => g.id === ment.goalId);
        if (goal && goal.status === "active") {
          goal.progress = Math.min(99, Math.round((ment.sessionsCompleted / ment.sessionsPlanned) * 100));
          goal.progressNotes.push({ atMin: m, text: "Lerntermin " + ment.sessionsCompleted + "/" + ment.sessionsPlanned + " abgeschlossen" });
        }
      }

      log.push({ type: "mentoring_block_done", assignment: ment.id, sessions: ment.sessionsCompleted, atMin: m });

      // Alle geplanten Sitzungen absolviert?
      if (ment.sessionsCompleted >= ment.sessionsPlanned) {
        ment.status = "completed";
        ment.endDateMin = m;
        if (ment.goalId) {
          const goal = state.developmentGoals.goals.find(g => g.id === ment.goalId);
          if (goal && goal.status === "active") {
            goal.progressNotes.push({ atMin: m, text: "Mentoring abgeschlossen – berechtigt zur Prüfung/Kursbuchung" });
          }
        }
        deliverMessage(state, {
          fromId: "system", toId: "player",
          subject: "Mentoring abgeschlossen: " + (m2?.person?.name || ""),
          body: `Das Mentoring zwischen ${m1?.person?.name || "Mentor"} und ${m2?.person?.name || "Mentee"} ist abgeschlossen.\n\n${ment.sessionsCompleted} Lerntermine wurden durchgeführt. Die begleitete Person kann nun den entsprechenden Kurs buchen oder die Prüfung ablegen.`,
          gameTime: m, category: "personnel", priority: "normal",
          dedupKey: "mentoring_done_msg:" + ment.id,
        });
      }
    }
  }
}

// Liefert Ereigniszeiten für simulationEngine
export function getMentoringEventTimes(state, t, maxMin) {
  migrateDevelopmentGoals(state);
  const times = [];
  for (const ment of state.developmentGoals.mentoring) {
    if (ment.status !== "active") continue;
    const nextPossible = ment.lastBlockEndMin || ment.startDateMin;
    if (nextPossible > t && nextPossible <= maxMin) times.push(nextPossible);
    if (ment.currentBlockStart) {
      const blockEnd = ment.currentBlockStart + MENTORING_BLOCK_MIN;
      if (blockEnd > t && blockEnd <= maxMin) times.push(blockEnd);
    }
  }
  return times;
}

// ---------- Zusagen (Promises) ----------

export function createPromise(state, params) {
  migrateDevelopmentGoals(state);
  const { personId, occasion, content, actionType, actionParams, dueMin } = params;
  const found = findPerson(state, personId);
  if (!found) throw new Error("Person nicht gefunden.");

  const promise = {
    id: uid(state, "promise"),
    personId,
    occasion, // "development_conversation" | "workload_conversation" | "retention_conversation"
    occasionConversationId: params.occasionConversationId || null,
    content,
    actionType: actionType || "general",
    actionParams: actionParams || {},
    dueMin: dueMin || null,
    status: "open",
    fulfilledAtMin: null,
    fulfilledByAction: null,
    satisfactionApplied: false,
    createdAtMin: state.gameTime,
  };
  state.developmentGoals.promises.push(promise);
  return promise;
}

export function getOpenPromises(state, personId) {
  migrateDevelopmentGoals(state);
  return state.developmentGoals.promises.filter(p =>
    p.personId === personId && p.status === "open"
  ).sort((a, b) => (a.dueMin || Infinity) - (b.dueMin || Infinity));
}

export function getAllOpenPromises(state) {
  migrateDevelopmentGoals(state);
  return state.developmentGoals.promises.filter(p => p.status === "open");
}

export function getOverduePromises(state) {
  migrateDevelopmentGoals(state);
  const now = state.gameTime;
  const grace = now - PROMISE_OVERDUE_GRACE_DAYS * DAY_MIN;
  return state.developmentGoals.promises.filter(p =>
    p.status === "open" && p.dueMin && p.dueMin < grace
  );
}

// Prüft, ob eine tatsächliche Spielhandlung eine Zusage erfüllt.
// Wird nach der entsprechenden Aktion aufgerufen (Kursbuchung, Gehaltserhöhung, etc.)
export function fulfillPromiseByAction(state, personId, actionType, actionParams) {
  migrateDevelopmentGoals(state);
  const promises = state.developmentGoals.promises.filter(p =>
    p.personId === personId && p.status === "open" && p.actionType === actionType
  );
  const fulfilled = [];
  for (const promise of promises) {
    // Prüfe ob actionParams zur Zusage passen
    if (matchesPromiseAction(promise, actionType, actionParams)) {
      promise.status = "fulfilled";
      promise.fulfilledAtMin = state.gameTime;
      promise.fulfilledByAction = actionType;
      fulfilled.push(promise);
    }
  }
  return fulfilled;
}

function matchesPromiseAction(promise, actionType, actionParams) {
  const params = actionParams || {};
  const promiseParams = promise.actionParams || {};
  switch (actionType) {
    case "book_course":
      return promiseParams.courseId ? params.courseId === promiseParams.courseId : true;
    case "raise_salary":
      return true; // Jede Gehaltserhöhung erfüllt eine Gehaltszusage
    case "approve_vacation":
      return true;
    case "adjust_responsibility":
      return true;
    case "follow_up_meeting":
      return true;
    default:
      return true;
  }
}

// Markiert überfällige Zusagen als "broken" und gibt Zufriedenheitsabzug.
// Wird täglich aufgerufen.
export function processOverduePromises(state, midnight) {
  migrateDevelopmentGoals(state);
  const grace = midnight - PROMISE_OVERDUE_GRACE_DAYS * DAY_MIN;
  const broken = [];
  for (const promise of state.developmentGoals.promises) {
    if (promise.status !== "open") continue;
    if (!promise.dueMin) continue;
    if (promise.dueMin >= grace) continue;
    promise.status = "broken";
    promise.brokenAtMin = midnight;
    broken.push(promise);
  }
  return broken;
}

// ---------- Gesprächs-Sperrfristen ----------

export function getConversationCooldown(state, personId, occasion) {
  migrateDevelopmentGoals(state);
  const cd = state.developmentGoals.conversationCooldowns[personId] || {};
  const lastMin = cd[occasion];
  if (!lastMin) return { active: false, nextMin: null };
  const nextMin = lastMin + CONVERSATION_COOLDOWN_DAYS * DAY_MIN;
  return { active: state.gameTime < nextMin, nextMin };
}

export function setConversationCooldown(state, personId, occasion, atMin) {
  migrateDevelopmentGoals(state);
  if (!state.developmentGoals.conversationCooldowns[personId]) {
    state.developmentGoals.conversationCooldowns[personId] = {};
  }
  state.developmentGoals.conversationCooldowns[personId][occasion] = atMin || state.gameTime;
}

// ---------- Entwicklungsprofil für UI ----------

export function getDevelopmentProfile(state, personId) {
  migrateDevelopmentGoals(state);
  const found = findPerson(state, personId);
  if (!found) return null;
  const person = found.person;
  const role = getRoleOf(found);

  const qualifications = getPersonQualifications(state, personId);
  const goals = getPersonGoals(state, personId);
  const suggestedCourses = getSuggestedCourses(state, personId);
  const mentoring = getMentoringForPerson(state, personId);
  const openPromises = getOpenPromises(state, personId);
  const overduePromises = getOverduePromises(state).filter(p => p.personId === personId);

  // Aktive Kurse (Einschreibungen)
  const activeEnrollments = (state.training?.enrollments || []).filter(e =>
    e.personId === personId && ["reserved", "in_progress"].includes(e.status)
  );

  // Mentoring-Zuordnung (als Mentee oder Mentor)
  const asMentee = mentoring.find(m => m.menteeId === personId);
  const asMentor = mentoring.find(m => m.mentorId === personId);

  // Hinweise aus Spieldaten ableiten
  const hints = [];

  // Offene Zusagen
  for (const p of openPromises) {
    if (p.actionType === "book_course" && p.actionParams.courseId) {
      const course = getCourseById(p.actionParams.courseId);
      const alreadyBooked = activeEnrollments.some(e => e.courseId === p.actionParams.courseId);
      if (!alreadyBooked) {
        hints.push({ type: "unfulfilled_promise", text: `Zugesagte Weiterbildung „${course?.label || p.actionParams.courseId}" noch nicht gebucht.`, dueMin: p.dueMin });
      }
    }
    if (p.actionType === "raise_salary") {
      hints.push({ type: "unfulfilled_promise", text: "Zugesagte Gehaltsanpassung noch nicht umgesetzt.", dueMin: p.dueMin });
    }
    if (p.actionType === "approve_vacation") {
      hints.push({ type: "unfulfilled_promise", text: "Vereinbarter Urlaubswunsch noch nicht bearbeitet.", dueMin: p.dueMin });
    }
  }

  // Überfällige Zusagen
  for (const p of overduePromises) {
    hints.push({ type: "overdue_promise", text: `Zusage überfällig: ${p.content}`, dueMin: p.dueMin });
  }

  // Fehlende Qualifikation für Transportart (nur Fahrer)
  if (role === "driver") {
    // Prüfe ob es Aufträge gibt, die der Fahrer wegen fehlender Qualifikation nicht übernehmen kann
    // (vereinfacht: prüfe nur ob ADR-Kurse verfügbar wären und nicht vorhanden)
    if (!hasQualification(state, personId, "adr_basic")) {
      const adrCourse = suggestedCourses.find(c => c.courseId === "adr_basic");
      if (adrCourse && adrCourse.prerequisitesMet) {
        hints.push({ type: "missing_qualification", text: "ADR-Basisqualifikation fehlt – Gefahrguttransporte nicht möglich." });
      }
    }
  }

  // Lerntermin überschneidet sich mit Urlaub
  for (const enr of activeEnrollments) {
    for (const bs of enr.blockStarts) {
      const vacation = (state.absences?.vacationRequests || []).find(r =>
        r.personId === personId && r.status === "approved" &&
        r.startMin <= bs && r.endMin > bs
      );
      if (vacation) {
        hints.push({ type: "schedule_conflict", text: `Lerntermin am ${formatGameTime(bs)} überschneidet sich mit Urlaub.` });
      }
    }
  }

  // Erfüllte Zusagen (positiver Hinweis)
  const fulfilledPromises = state.developmentGoals.promises.filter(p =>
    p.personId === personId && p.status === "fulfilled" &&
    p.fulfilledAtMin && p.fulfilledAtMin > state.gameTime - 7 * DAY_MIN
  );
  for (const p of fulfilledPromises) {
    if (p.actionType === "raise_salary") {
      hints.push({ type: "promise_fulfilled", text: "Die vereinbarte Gehaltsanpassung wurde umgesetzt." });
    }
    if (p.actionType === "book_course") {
      const course = getCourseById(p.actionParams.courseId);
      if (course) hints.push({ type: "promise_fulfilled", text: `Zugesagte Weiterbildung „${course.label}" wurde gebucht.` });
    }
  }

  // Zufriedenheits-Gründe aus vorhandenen Daten
  const satisfactionReasons = [];
  if ((person.satisfaction ?? 70) < 40) {
    satisfactionReasons.push("Zufriedenheit kritisch niedrig – Gespräch oder Maßnahmen empfohlen.");
  }
  if (person.employmentStatus === "notice_given") {
    if (person.selfTermination) {
      satisfactionReasons.push("Eigenkündigung erklärt – Bleibegespräch möglich, wenn Voraussetzungen erfüllt.");
    } else {
      satisfactionReasons.push("Kündigung wurde vom Spieler ausgesprochen.");
    }
  }

  return {
    personId,
    name: person.name,
    role,
    kind: found.kind,
    qualifications: qualifications.map(q => ({
      type: q.type,
      level: q.level,
      acquiredAtMin: q.acquiredAtMin,
      validUntilMin: q.validUntilMin,
      source: q.source,
    })),
    goals: goals.map(g => ({
      id: g.id,
      title: g.title,
      description: g.description,
      type: g.type,
      targetQualificationType: g.targetQualificationType,
      targetCourseId: g.targetCourseId,
      prerequisites: g.prerequisites,
      estimatedCostCents: g.estimatedCostCents,
      expectedAbsenceDays: g.expectedAbsenceDays,
      targetDeadlineMin: g.targetDeadlineMin,
      progress: g.progress,
      progressNotes: g.progressNotes,
      linkedMentoringId: g.linkedMentoringId,
    })),
    suggestedCourses,
    activeEnrollments: activeEnrollments.map(e => ({
      id: e.id,
      courseId: e.courseId,
      courseLabel: getCourseById(e.courseId)?.label || e.courseId,
      status: e.status,
      startMin: e.startMin,
      endMin: e.endMin,
      blocksCompleted: e.blocksCompleted,
      totalBlocks: e.totalBlocks,
    })),
    mentoring: {
      asMentee: asMentee ? {
        mentorId: asMentee.mentorId,
        sessionsCompleted: asMentee.sessionsCompleted,
        sessionsPlanned: asMentee.sessionsPlanned,
        hoursCompleted: asMentee.hoursCompleted,
        status: asMentee.status,
      } : null,
      asMentor: asMentor ? {
        menteeId: asMentor.menteeId,
        sessionsCompleted: asMentor.sessionsCompleted,
        sessionsPlanned: asMentor.sessionsPlanned,
        status: asMentor.status,
      } : null,
    },
    openPromises: openPromises.map(p => ({
      id: p.id,
      content: p.content,
      actionType: p.actionType,
      dueMin: p.dueMin,
      status: p.status,
    })),
    overduePromises: overduePromises.map(p => ({
      id: p.id,
      content: p.content,
      dueMin: p.dueMin,
    })),
    hints,
    satisfactionReasons,
    availableMentors: getAvailableMentors(state, personId),
  };
}

// ---------- Übersicht für Büro/Tagesübersicht ----------

export function getDevelopmentOverview(state) {
  migrateDevelopmentGoals(state);
  const activeGoals = getActiveGoals(state);
  const activeMentoring = getActiveMentoring(state);
  const openPromises = getAllOpenPromises(state);
  const overdue = getOverduePromises(state);

  // Demnächst anstehende Weiterbildungen (nächste 7 Tage)
  const now = state.gameTime;
  const in7d = now + 7 * DAY_MIN;
  const upcoming = [];
  for (const enr of (state.training?.enrollments || [])) {
    if (!["reserved", "in_progress"].includes(enr.status)) continue;
    if (enr.startMin >= now && enr.startMin <= in7d) {
      const found = findPerson(state, enr.personId);
      upcoming.push({
        personId: enr.personId,
        personName: found?.person?.name || "?",
        courseId: enr.courseId,
        courseLabel: getCourseById(enr.courseId)?.label || enr.courseId,
        startMin: enr.startMin,
      });
    }
  }
  upcoming.sort((a, b) => a.startMin - b.startMin);

  // Gefährdete Termine (Zusagen mit fälligem Termin in nächster Zeit)
  const atRisk = openPromises
    .filter(p => p.dueMin && p.dueMin <= now + 3 * DAY_MIN)
    .map(p => {
      const found = findPerson(state, p.personId);
      return {
        personId: p.personId,
        personName: found?.person?.name || "?",
        content: p.content,
        dueMin: p.dueMin,
      };
    });

  // Verfügbare Mentoren
  const mentors = [];
  const allPersons = [
    ...(state.drivers || []).map(d => ({ ...d, _kind: "driver" })),
    ...(state.employees || []).map(e => ({ ...e, _kind: "employee" })),
  ];
  for (const p of allPersons) {
    if (!isActivelyEmployed(p)) continue;
    if (!hasMentorQualification(state, p.id)) continue;
    const isBusy = activeMentoring.some(m => m.mentorId === p.id);
    mentors.push({
      id: p.id,
      name: p.name,
      role: p._kind === "driver" ? "driver" : p.role,
      available: !isBusy,
    });
  }

  return {
    activeGoalsCount: activeGoals.length,
    activeMentoringCount: activeMentoring.length,
    openPromisesCount: openPromises.length,
    overduePromisesCount: overdue.length,
    upcomingTrainings: upcoming.slice(0, 5),
    atRiskDeadlines: atRisk,
    availableMentors: mentors,
  };
}