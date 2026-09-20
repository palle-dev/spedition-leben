import { retainHistory } from "./historyRetention.ts";
import { retainLatestHistory } from "./historyRetention.ts";
import { nextRandom } from "./randomEngine.ts";
// Geschichten-Engine für FERNWERK.
// Verwaltet persönliche Geschichten mit Szenen, Entscheidungen, Versprechen
// und einer persönlichen Chronik. Baut auf vorhandenen Beziehungs-, Termin-,
// Aktivitäts- und Postfach-Systemen auf.
//
// Design-Prinzipien:
// - Nutzt vorhandene Personen (partnerId) und Termine (state.appointments).
// - Kein zweiter Kalender, keine parallele Beziehungsverwaltung.
// - Ereignisgesteuert: Geschichten werden nur bei ihren eigenen Fristen geprüft.
// - Maximal zwei gleichzeitige Geschichten.
// - Angebote erscheinen mit zeitlichem Abstand, überfluten nicht das Postfach.
// - Jede Entscheidung und Auswirkung wird genau einmal verarbeitet.
// - Chronik-Einträge überdauern die Historienbereinigung.

import { dayOf, formatGameTime } from "./gameRules.ts";
import { pushEvent } from "./eventLog.ts";
import { deliverMessage } from "./mailEngine.ts";

const DAY_MIN = 1440;
const MAX_ACTIVE_STORIES = 2;
const OFFER_COOLDOWN_DAYS = 3; // Mindestabstand zwischen Angeboten
const STORY_COOLDOWN_DAYS = 14; // Wiederaufnahme einer Geschichte nach Abschluss
const CHRONICLE_MAX = 200;
const PROMISES_MAX = 50;

// ---------- Migration ----------

export function migrateStories(state) {
  if (!state.private) state.private = {};
  if (!state.private.stories) {
    state.private.stories = {
      runs: [],
      lastOfferMin: 0,
      completedCount: {},
      declinedAt: {},
    };
  }
  if (!state.private.stories.runs) state.private.stories.runs = [];
  if (state.private.stories.lastOfferMin === undefined) state.private.stories.lastOfferMin = 0;
  if (!state.private.stories.completedCount) state.private.stories.completedCount = {};
  if (!state.private.stories.declinedAt) state.private.stories.declinedAt = {};
  if (!state.private.chronicle) state.private.chronicle = [];
  if (!state.private.promises) state.private.promises = [];

  // PartnerId sicherstellen (stabile Kennung)
  if (state.private.partnerName && !state.private.partnerId) {
    state.private.partnerId = "partner_existing";
  }
  if (!state.private.partnerName) {
    state.private.partnerId = null;
  }
}

// ---------- Hilfsfunktionen ----------

function uid(state, prefix) {
  state.idCounter = (state.idCounter || 100) + 1;
  return prefix + "_" + state.idCounter;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Prüft, ob ein Termin mit einem anderen persönlichen Termin kollidiert.
export function checkAppointmentConflict(state, startMin, endMin, excludeId) {
  for (const a of (state.appointments || [])) {
    if (a.id === excludeId) continue;
    if (a.status === "cancelled" || a.status === "done" || a.status === "missed" || a.status === "declined") continue;
    // Überschneidung prüfen
    if (startMin < a.endMin && endMin > a.startMin) {
      return { conflict: true, appointment: a };
    }
  }
  return { conflict: false };
}

// Fügt einen Chronik-Eintrag hinzu.
function addChronicleEntry(state, entry) {
  if (!state.private.chronicle) state.private.chronicle = [];
  state.private.chronicle.push({
    id: uid(state, "chr"),
    day: dayOf(state.gameTime),
    min: state.gameTime,
    ...entry,
  });
  if (state.private.chronicle.length > CHRONICLE_MAX) {
    state.private.chronicle = retainLatestHistory(state, "privateChronicle", state.private.chronicle, CHRONICLE_MAX, null);
  }
}

// Erstellt ein Versprechen.
function createPromise(state, storyRunId, description, personId, personName, dueMin) {
  if (!state.private.promises) state.private.promises = [];
  const promise = {
    id: uid(state, "pr"),
    storyRunId,
    description,
    personId,
    personName,
    createdAtMin: state.gameTime,
    dueMin,
    status: "open", // open | kept | broken | cancelled
    resolvedAtMin: null,
  };
  state.private.promises.push(promise);
  if (state.private.promises.length > PROMISES_MAX) {
    state.private.promises = retainLatestHistory(state, "promises", state.private.promises, PROMISES_MAX, null);
  }
  return promise;
}

// Löst ein Versprechen auf (kept/broken/cancelled). Genau einmal.
function resolvePromise(state, promiseId, status) {
  if (!state.private.promises) return;
  const p = state.private.promises.find(pr => pr.id === promiseId);
  if (!p || p.status !== "open") return;
  p.status = status;
  p.resolvedAtMin = state.gameTime;
  if (status === "kept") {
    state.private.relationship = clamp((state.private.relationship || 0) + 2, 0, 100);
    state.private.happiness = clamp((state.private.happiness || 0) + 1, 0, 100);
  } else if (status === "broken") {
    // Verhältnismäßig: ein versäumter Abend beendet keine stabile Partnerschaft.
    const relDelta = state.private.relationship > 60 ? -4 : -7;
    state.private.relationship = clamp((state.private.relationship || 0) + relDelta, 0, 100);
    state.private.happiness = clamp((state.private.happiness || 0) - 2, 0, 100);
    state.private.stress = clamp((state.private.stress || 0) + 3, 0, 100);
  }
}

// ---------- Geschichten-Katalog ----------

export const STORIES = {
  // A) Ein Abend, der uns gehört
  evening_together: {
    id: "evening_together",
    title: "Ein Abend, der uns gehört",
    description: "Eure Partnerperson wünscht sich einen gemeinsamen Abend.",
    requiresPartner: true,
    cooldownDays: 10,
    scenes: {
      offer: {
        text: (state, run) => {
          const partner = run.participants[0]?.name || "Deine Partnerperson";
          return `${partner} hat dich angesprochen: „Es ist lange her, dass wir nur zu zweit waren. Lass uns einen Abend einplanen – nur für uns." Du kannst einen Zeitpunkt vorschlagen, eine Alternative finden oder freundlich absagen.`;
        },
        choices: [
          {
            id: "accept",
            label: "Zeitpunkt finden",
            description: "Ihr plant einen gemeinsamen Abend. Wähle eine Aktivität im nächsten Schritt.",
            condition: (state) => true,
            nextScene: "plan",
          },
          {
            id: "reschedule",
            label: "Alternative vorschlagen",
            description: "Du schlägst vor, es nächste Woche zu planen. Kein festes Versprechen.",
            nextScene: "reschedule",
          },
          {
            id: "decline",
            label: "Freundlich absagen",
            description: "Du lehnst ab, ohne ein Versprechen einzugehen. Kein Beziehungsabzug.",
            nextScene: null,
            chronicleText: (state, run) => `${run.participants[0]?.name || "Partner"} wünschte sich einen Abend – du hast freundlich abgesagt.`,
          },
        ],
        deadlineDays: 3,
      },
      reschedule: {
        text: (state, run) => "Du schlägst vor, den Abend nächste Woche zu planen. Das ist noch kein festes Versprechen – aber ein Zeichen, dass du dir Mühe gibst.",
        choices: [
          {
            id: "plan_now",
            label: "Jetzt planen",
            description: "Wähle eine Aktivität für den gemeinsamen Abend.",
            nextScene: "plan",
          },
          {
            id: "later",
            label: "Später entscheiden",
            description: "Die Geschichte endet vorläufig. Kein Versprechen, kein Abzug.",
            nextScene: null,
            chronicleText: (state, run) => `Du und ${run.participants[0]?.name || "Partner"} habt über einen gemeinsamen Abend gesprochen, aber noch nichts festgelegt.`,
          },
        ],
        deadlineDays: 5,
      },
      plan: {
        text: (state, run) => "Wähle, wie ihr den Abend verbringt. Kosten und Zeitbedarf werden vor der Auswahl angezeigt.",
        choices: [
          {
            id: "cooking",
            label: "Gemeinsam kochen",
            description: "Zu Hause, 2 Spielstunden. 35 € privat. Belastung −5, Zufriedenheit +3, Beziehung +4.",
            costCents: 3500,
            durationMin: 120,
            condition: (state) => state.private.accountCents >= 3500,
            nextScene: "evening",
            createsActivity: "cooking",
          },
          {
            id: "date_night",
            label: "Romantischer Abend auswärts",
            description: "Unterwegs, 3 Spielstunden. 80 € privat. Belastung −8, Zufriedenheit +5, Beziehung +8.",
            costCents: 8000,
            durationMin: 180,
            condition: (state) => state.private.accountCents >= 8000,
            nextScene: "evening",
            createsActivity: "date_night",
          },
          {
            id: "cancel_plan",
            label: "Doch nicht jetzt",
            description: "Du entscheidest dich gegen eine feste Planung. Kein Versprechen gebrochen.",
            nextScene: null,
            chronicleText: (state, run) => `Ihr habt über einen Abend gesprochen, aber keine feste Planung getroffen.`,
          },
        ],
        deadlineDays: 5,
      },
      evening: {
        // Wird automatisch beim Terminabschluss verarbeitet.
        text: (state, run) => "Der Abend ist geplant. Er wird zur vereinbarten Zeit stattfinden.",
        autoProcess: true,
      },
      completion: {
        autoProcess: true,
      },
    },
  },

  // B) Lange nicht gesehen
  long_time_no_see: {
    id: "long_time_no_see",
    title: "Lange nicht gesehen",
    description: "Ein alter Freund meldet sich nach langer Zeit.",
    requiresPartner: false,
    cooldownDays: 12,
    scenes: {
      offer: {
        text: (state, run) => {
          const friend = run.participants.find(p => p.role === "friend");
          const name = friend?.name || "Ein alter Freund";
          return `${name} hat sich nach langer Zeit gemeldet: „Hey! Wir haben uns ewig nicht gesehen. Wärst du offen für ein Treffen?" Du kannst Kontakt aufnehmen, ein Treffen vorschlagen oder auf später verschieben.`;
        },
        choices: [
          {
            id: "reach_out",
            label: "Kontakt aufnehmen",
            description: "Du antwortest und schlägst ein Treffen vor.",
            nextScene: "meet",
          },
          {
            id: "later",
            label: "Auf später verschieben",
            description: "Du bittest um Aufschub. Kein Versprechen, kein Abzug.",
            nextScene: null,
            chronicleText: (state, run) => {
              const name = run.participants.find(p => p.role === "friend")?.name || "Ein alter Freund";
              return `${name} hat sich gemeldet – du hast um Aufschub gebeten.`;
            },
          },
        ],
        deadlineDays: 4,
      },
      meet: {
        text: (state, run) => "Im Gespräch ergeben sich gemeinsame Erinnerungen und ein konkreter Anknüpfungspunkt. Wähle, wie ihr verbleibt.",
        choices: [
          {
            id: "coffee",
            label: "Kaffee verabreden",
            description: "Ein unverbindliches Treffen. 2 Spielstunden, 15 € privat.",
            costCents: 1500,
            durationMin: 120,
            condition: (state) => state.private.accountCents >= 1500,
            nextScene: "meeting_done",
            createsActivity: "coffee_friend",
          },
          {
            id: "walk_talk",
            label: "Spaziergang verabreden",
            description: "Gemeinsam durch die Stadt. 2 Spielstunden, kostenlos.",
            costCents: 0,
            durationMin: 120,
            condition: () => true,
            nextScene: "meeting_done",
            createsActivity: "walk_friend",
          },
          {
            id: "no_meet",
            label: "Nur schreiben",
            description: "Ihr bleibt im Kontakt, ohne ein Treffen zu vereinbaren.",
            nextScene: null,
            chronicleText: (state, run) => {
              const name = run.participants.find(p => p.role === "friend")?.name || "Ein alter Freund";
              return `${name} und du habt geschrieben, euch aber nicht getroffen.`;
            },
          },
        ],
        deadlineDays: 6,
      },
      meeting_done: {
        autoProcess: true,
      },
      follow_up: {
        text: (state, run) => {
          const name = run.participants.find(p => p.role === "friend")?.name || "Dein Freund";
          return `Das Treffen mit ${name} war schön. Möchtest ihr ein weiteres, unverbindliches Vorhaben verabreden?`;
        },
        choices: [
          {
            id: "yes",
            label: "Weiteres Treffen verabreden",
            description: "Ihr bleibt in Kontakt und plant ein nächstes Treffen.",
            nextScene: null,
            chronicleText: (state, run) => {
              const name = run.participants.find(p => p.role === "friend")?.name || "Dein Freund";
              return `${name} und ihr habt ein weiteres Treffen verabredet.`;
            },
            relationshipBonus: 3,
            happinessBonus: 2,
          },
          {
            id: "no",
            label: "Dabei belassen",
            description: "Es war ein schönes Treffen – mehr braucht es nicht.",
            nextScene: null,
            chronicleText: (state, run) => {
              const name = run.participants.find(p => p.role === "friend")?.name || "Dein Freund";
              return `${name} und ihr habt euch nach langer Zeit wiedergetroffen.`;
            },
            relationshipBonus: 1,
            happinessBonus: 1,
          },
        ],
        deadlineDays: 5,
      },
    },
  },

  // C) Zwei Tage Abstand
  two_days_off: {
    id: "two_days_off",
    title: "Zwei Tage Abstand",
    description: "Du planst zwei freie Tage für dich.",
    requiresPartner: false,
    cooldownDays: 21,
    scenes: {
      offer: {
        text: (state, run) => "Du möchtest zwei Tage komplett frei nehmen. Vor der Buchung siehst du anstehende betriebliche Verpflichtungen und verfügbare Vertretungsmöglichkeiten.",
        choices: [
          {
            id: "plan",
            label: "Auszeit planen",
            description: "Wähle Zeitpunkt und Art der Auszeit im nächsten Schritt.",
            nextScene: "plan",
          },
          {
            id: "not_now",
            label: "Nicht jetzt",
            description: "Du entscheidest, dass jetzt nicht der richtige Zeitpunkt ist.",
            nextScene: null,
            chronicleText: () => "Du hast über zwei freie Tage nachgedacht, es aber verschoben.",
          },
        ],
        deadlineDays: 5,
      },
      plan: {
        text: (state, run) => "Wähle, wie du die zwei Tage verbringst. Die Kosten und der Zeitbedarf werden vor der Auswahl angezeigt.",
        choices: [
          {
            id: "staycation",
            label: "Zu Hause bleiben",
            description: "Zwei ruhige Tage zu Hause. 2×24h, 60 € privat für Lebensmittel. Belastung −15, Zufriedenheit +6.",
            costCents: 6000,
            durationMin: 2 * DAY_MIN,
            condition: (state) => state.private.accountCents >= 6000,
            nextScene: "break_running",
            createsActivity: "staycation",
          },
          {
            id: "short_trip",
            label: "Kurzurlaub",
            description: "Zwei Tage wegfahren. 2×24h, 250 € privat. Belastung −20, Zufriedenheit +8.",
            costCents: 25000,
            durationMin: 2 * DAY_MIN,
            condition: (state) => state.private.accountCents >= 25000,
            nextScene: "break_running",
            createsActivity: "short_trip_break",
          },
          {
            id: "cancel_plan",
            label: "Doch nicht",
            description: "Du entscheidest dich gegen die Auszeit.",
            nextScene: null,
            chronicleText: () => "Du hast eine Auszeit erwogen, aber dich dagegen entschieden.",
          },
        ],
        deadlineDays: 5,
      },
      break_running: {
        autoProcess: true,
      },
      completion: {
        autoProcess: true,
      },
    },
  },
};

// ---------- Aktivitäten (Story-spezifisch) ----------

const STORY_ACTIVITIES = {
  cooking: { type: "cooking", label: "Gemeinsam kochen (Geschichte)", durationMin: 120, costCents: 3500, stressDelta: -5, happinessDelta: 3, contactDelta: 4 },
  date_night: { type: "date_night", label: "Romantischer Abend (Geschichte)", durationMin: 180, costCents: 8000, stressDelta: -8, happinessDelta: 5, contactDelta: 8 },
  coffee_friend: { type: "coffee_friend", label: "Kaffee mit altem Freund", durationMin: 120, costCents: 1500, stressDelta: -6, happinessDelta: 3 },
  walk_friend: { type: "walk_friend", label: "Spaziergang mit altem Freund", durationMin: 120, costCents: 0, stressDelta: -6, happinessDelta: 2 },
  staycation: { type: "staycation", label: "Zwei Tage zu Hause", durationMin: 2 * DAY_MIN, costCents: 6000, stressDelta: -15, happinessDelta: 6, isTrip: true },
  short_trip_break: { type: "short_trip_break", label: "Zwei Tage Kurzurlaub", durationMin: 2 * DAY_MIN, costCents: 25000, stressDelta: -20, happinessDelta: 8, isTrip: true },
};

// ---------- Angebotserzeugung ----------

// Prüft, ob eine neue Geschichte angeboten werden kann.
export function maybeOfferStory(state, m, log) {
  migrateStories(state);
  const stories = state.private.stories;

  // Maximal zwei gleichzeitige Geschichten
  const activeCount = stories.runs.filter(r => r.status === "offered" || r.status === "active").length;
  if (activeCount >= MAX_ACTIVE_STORIES) return;

  // Abstand zwischen Angeboten
  if (m - stories.lastOfferMin < OFFER_COOLDOWN_DAYS * DAY_MIN) return;

  // Verfügbare Geschichten ermitteln
  const available = [];
  for (const storyId of Object.keys(STORIES)) {
    const tpl = STORIES[storyId];
    if (tpl.requiresPartner && (!state.private.partnerName || state.private.relationshipStatus === "single")) continue;
    // Cooldown nach Abschluss
    const lastCompleted = stories.completedCount[storyId] || 0;
    if (m - lastCompleted < tpl.cooldownDays * DAY_MIN) continue;
    // Cooldown nach Ablehnung
    const lastDeclined = stories.declinedAt[storyId] || 0;
    if (m - lastDeclined < tpl.cooldownDays * DAY_MIN) continue;
    // Bereits aktiv?
    if (stories.runs.some(r => r.storyId === storyId && (r.status === "offered" || r.status === "active"))) continue;
    available.push(storyId);
  }

  if (available.length === 0) return;

  // Eine Geschichte anbieten (die älteste verfügbare)
  const storyId = available[0];
  const tpl = STORIES[storyId];
  const run = createStoryRun(state, storyId, m);
  stories.runs.push(run);
  stories.lastOfferMin = m;

  // Nachricht ins Postfach
  const partnerName = tpl.requiresPartner ? state.private.partnerName : null;
  let subject, body;
  if (storyId === "evening_together") {
    subject = "Ein Abend für uns";
    body = `${partnerName} würde sich freuen, wenn ihr Zeit zu zweit einplant. Schau im Bereich Zuhause nach, um die Geschichte zu beginnen.`;
  } else if (storyId === "long_time_no_see") {
    subject = "Lange nicht gesehen";
    body = `Jemand aus deiner Vergangenheit hat sich gemeldet. Schau im Bereich Zuhause nach, um mehr zu erfahren.`;
  } else if (storyId === "two_days_off") {
    subject = "Zeit für dich";
    body = `Du überlegst, zwei Tage frei zu nehmen. Schau im Bereich Zuhause nach, um die Auszeit zu planen.`;
  }
  deliverMessage(state, {
    fromId: "system", toId: "player",
    subject, body, gameTime: m, category: "personal", priority: "normal",
    dedupKey: "story_offer:" + run.id,
  });
  pushEvent(state, {
    type: "story_offered", gameTime: m, isSystem: true,
    details: { storyId, title: tpl.title, runId: run.id },
    dedupKey: "story_offered:" + run.id,
  });
  log.push({ type: "story_offered", storyId, runId: run.id, atMin: m });
}

function createStoryRun(state, storyId, m) {
  const tpl = STORIES[storyId];
  const participants = [];
  if (tpl.requiresPartner && state.private.partnerName) {
    participants.push({ id: state.private.partnerId || "partner", name: state.private.partnerName, role: "partner" });
  }
  if (storyId === "long_time_no_see") {
    // Fiktive Person mit stabiler ID
    const friendId = "friend_" + uid(state, "f");
    const friendName = pickFriendName(state);
    participants.push({ id: friendId, name: friendName, role: "friend" });
  }
  const deadlineDays = tpl.scenes.offer.deadlineDays || 5;
  return {
    id: uid(state, "sr"),
    storyId,
    participants,
    currentScene: "offer",
    status: "offered",
    decisions: [],
    appointmentIds: [],
    promiseIds: [],
    nextDeadlineMin: m + deadlineDays * DAY_MIN,
    appliedEffects: [],
    completedAtMin: null,
    data: {},
    createdAtMin: m,
  };
}

const FRIEND_NAMES = ["Tom", "Nora", "Ben", "Lena", "Felix", "Jana", "Max", "Clara", "Paul", "Mia"];
function pickFriendName(state) {
  const used = new Set([
    ...(state.private.partnerName ? [state.private.partnerName] : []),
    ...(state.private.playerName ? [state.private.playerName] : []),
  ]);
  const available = FRIEND_NAMES.filter(n => !used.has(n));
  if (available.length === 0) return "Robin";
  return available[Math.floor(nextRandom(state) * available.length)];
}

// ---------- Entscheidungsverarbeitung ----------

export function makeStoryDecision(state, { storyRunId, choiceId, params }) {
  migrateStories(state);
  const run = state.private.stories.runs.find(r => r.id === storyRunId);
  if (!run) throw new Error("Geschichte nicht gefunden.");
  if (run.status !== "offered" && run.status !== "active") throw new Error("Diese Geschichte ist nicht mehr aktiv.");

  const tpl = STORIES[run.storyId];
  const scene = tpl.scenes[run.currentScene];
  if (!scene) throw new Error("Ungültige Szene.");
  if (scene.autoProcess) throw new Error("Diese Szene erfordert keine Entscheidung.");

  const choice = scene.choices.find(c => c.id === choiceId);
  if (!choice) throw new Error("Ungültige Auswahl: " + choiceId);

  // Bedingung prüfen
  if (choice.condition && !choice.condition(state)) {
    throw new Error("Diese Auswahl ist derzeit nicht verfügbar.");
  }

  // Entscheidung protokollieren (genau einmal)
  run.decisions.push({ scene: run.currentScene, choice: choiceId, atMin: state.gameTime });

  // Aktivität erstellen, falls gewählt
  if (choice.createsActivity) {
    const activity = STORY_ACTIVITIES[choice.createsActivity];
    if (!activity) throw new Error("Unbekannte Aktivität: " + choice.createsActivity);

    // Kosten prüfen
    if (activity.costCents > 0 && state.private.accountCents < activity.costCents) {
      throw new Error("Privatkonto reicht nicht aus (" + (activity.costCents / 100) + " €).");
    }

    // Terminzeit bestimmen
    const startMin = params?.startMin || suggestActivityStart(state, activity);
    const endMin = startMin + activity.durationMin;

    // Konfliktprüfung
    const conflict = checkAppointmentConflict(state, startMin, endMin);
    if (conflict.conflict) {
      throw new Error("Terminüberschneidung mit: " + (conflict.appointment.label || conflict.appointment.text || "einem anderen Termin") + " am " + formatGameTime(conflict.appointment.startMin) + ".");
    }

    // Kosten abbuchen
    if (activity.costCents > 0) {
      state.private.accountCents -= activity.costCents;
      state.bookings.push({ min: state.gameTime, cause: "Geschichte: " + activity.label, amountCents: -activity.costCents, account: "private", refId: "story:" + run.id });
    }

    // Termin anlegen
    const apptId = uid(state, "ap");
    const appt = {
      id: apptId,
      type: "leisure",
      subtype: activity.type,
      label: activity.label,
      startMin,
      endMin,
      status: "accepted",
      effectsApplied: false,
      costCents: activity.costCents,
      stressDelta: activity.stressDelta,
      happinessDelta: activity.happinessDelta,
      contactDelta: activity.contactDelta || 0,
      isTrip: activity.isTrip || false,
      storyRunId: run.id,
      storyScene: choice.nextScene,
    };
    state.appointments.push(appt);
    run.appointmentIds.push(apptId);

    // Versprechen erstellen (nur bei festen Zusagen)
    if (run.storyId === "evening_together" && run.currentScene === "plan") {
      const promise = createPromise(state, run.id,
        "Gemeinsamer Abend mit " + (run.participants[0]?.name || "Partner"),
        run.participants[0]?.id, run.participants[0]?.name, endMin);
      run.promiseIds.push(promise.id);
    }
  }

  // Chronik-Eintrag
  if (choice.chronicleText) {
    addChronicleEntry(state, {
      title: tpl.title,
      text: choice.chronicleText(state, run),
      participants: run.participants.map(p => p.name),
      type: "story",
      storyId: run.storyId,
    });
  }

  // Beziehungs-/Zufriedenheits-Bonus
  if (choice.relationshipBonus) {
    state.private.relationship = clamp((state.private.relationship || 0) + choice.relationshipBonus, 0, 100);
  }
  if (choice.happinessBonus) {
    state.private.happiness = clamp((state.private.happiness || 0) + choice.happinessBonus, 0, 100);
  }

  // Szene wechseln
  if (choice.nextScene === null) {
    // Geschichte abschließen
    completeStoryRun(state, run, "completed", "Entscheidung: " + choice.label);
  } else {
    run.currentScene = choice.nextScene;
    const nextScene = tpl.scenes[choice.nextScene];
    if (nextScene?.deadlineDays) {
      run.nextDeadlineMin = state.gameTime + nextScene.deadlineDays * DAY_MIN;
    } else if (nextScene?.autoProcess) {
      // Auto-Process-Szene: auf Terminende oder sofort warten
      run.nextDeadlineMin = computeAutoProcessDeadline(state, run);
    } else {
      run.nextDeadlineMin = null;
    }
  }

  return { ok: true, runId: run.id, currentScene: run.currentScene, status: run.status };
}

// Schlägt einen Startzeitpunkt für eine Aktivität vor (nächster freier Abend).
function suggestActivityStart(state, activity) {
  const duration = activity.durationMin;
  // Ab dem nächsten 18:00 suchen
  const baseDay = Math.floor(state.gameTime / DAY_MIN);
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const eveningStart = baseDay * DAY_MIN + dayOffset * DAY_MIN + 1080; // 18:00
    if (eveningStart < state.gameTime) continue;
    const eveningEnd = eveningStart + duration;
    if (eveningEnd > (baseDay + dayOffset + 1) * DAY_MIN) continue; // über Mitternacht
    const conflict = checkAppointmentConflict(state, eveningStart, eveningEnd);
    if (!conflict.conflict) return eveningStart;
  }
  // Fallback: aktuelle Zeit + 60 Min
  return state.gameTime + 60;
}

// Berechnet die nächste Frist für eine Auto-Process-Szene.
function computeAutoProcessDeadline(state, run) {
  // Nächstes Terminende der Story-Termine
  let earliest = null;
  for (const apptId of run.appointmentIds) {
    const a = (state.appointments || []).find(x => x.id === apptId);
    if (!a) continue;
    if (a.status === "accepted" || a.status === "active") {
      if (earliest === null || a.endMin < earliest) earliest = a.endMin;
    }
  }
  return earliest;
}

// Schließt eine Geschichte ab.
function completeStoryRun(state, run, status, reason) {
  run.status = status;
  run.completedAtMin = state.gameTime;
  run.completionReason = reason;
  run.nextDeadlineMin = null;
  if (status === "completed") {
    state.private.stories.completedCount[run.storyId] = state.gameTime;
  }
  // Offene Versprechen auflösen
  for (const promiseId of run.promiseIds) {
    resolvePromise(state, promiseId, status === "completed" ? "kept" : "cancelled");
  }
}

// ---------- Ereignisverarbeitung ----------

// Verarbeitet Story-Fristen. Wird nur bei Story-Fristzeiten aufgerufen.
export function processStoryDeadlines(state, m, log) {
  migrateStories(state);
  for (const run of state.private.stories.runs) {
    if (run.status !== "offered" && run.status !== "active") continue;
    if (run.nextDeadlineMin !== m) continue;
    processStoryScene(state, run, m, log);
  }
}

// Verarbeitet eine Story-Szene bei Fristablauf.
function processStoryScene(state, run, m, log) {
  const tpl = STORIES[run.storyId];
  const scene = tpl.scenes[run.currentScene];
  if (!scene) return;

  if (scene.autoProcess) {
    // Auto-Process-Szene: Übergang zum Abschluss
    processAutoScene(state, run, m, log);
    return;
  }

  // Frist abgelaufen ohne Entscheidung
  if (run.currentScene === "offer") {
    // Angebot unbeantwortet → freundliches Ende, kein Abzug
    completeStoryRun(state, run, "expired", "Angebot nicht angenommen");
    log.push({ type: "story_expired", storyId: run.storyId, runId: run.id, atMin: m });
    return;
  }

  // Entscheidungsszene mit abgelaufener Frist → Geschichte endet
  completeStoryRun(state, run, "expired", "Frist abgelaufen");
  log.push({ type: "story_deadline", storyId: run.storyId, runId: run.id, atMin: m });
}

// Verarbeitet Auto-Process-Szenen (Terminabschluss).
function processAutoScene(state, run, m, log) {
  const tpl = STORIES[run.storyId];

  if (run.currentScene === "evening") {
    // Prüfen, ob der Termin abgeschlossen wurde
    const appt = (state.appointments || []).find(a => run.appointmentIds.includes(a.id));
    if (!appt) {
      completeStoryRun(state, run, "completed", "Abend ohne Termin");
      return;
    }
    if (appt.status === "done") {
      // Erfolgreicher Abend
      addChronicleEntry(state, {
        title: tpl.title,
        text: `Ein ungestörter Abend mit ${run.participants[0]?.name || "Partner"}. ${appt.label}.`,
        participants: run.participants.map(p => p.name),
        type: "story",
        storyId: run.storyId,
      });
      completeStoryRun(state, run, "completed", "Abend verbracht");
    } else if (appt.status === "cancelled") {
      // Spieler hat bewusst abgebrochen
      addChronicleEntry(state, {
        title: tpl.title,
        text: `Der geplante Abend mit ${run.participants[0]?.name || "Partner"} wurde vorzeitig beendet.`,
        participants: run.participants.map(p => p.name),
        type: "story",
        storyId: run.storyId,
      });
      completeStoryRun(state, run, "cancelled", "Abend abgebrochen");
    } else if (appt.status === "missed") {
      // Versäumt
      addChronicleEntry(state, {
        title: tpl.title,
        text: `Der vereinbarte Abend mit ${run.participants[0]?.name || "Partner"} wurde versäumt.`,
        participants: run.participants.map(p => p.name),
        type: "story",
        storyId: run.storyId,
      });
      completeStoryRun(state, run, "missed", "Abend versäumt");
    } else {
      // Noch nicht abgeschlossen → auf Terminende warten
      run.nextDeadlineMin = computeAutoProcessDeadline(state, run);
    }
    return;
  }

  if (run.currentScene === "meeting_done") {
    const appt = (state.appointments || []).find(a => run.appointmentIds.includes(a.id));
    if (!appt) {
      completeStoryRun(state, run, "completed", "Treffen ohne Termin");
      return;
    }
    if (appt.status === "done") {
      // Erfolgreiches Treffen → Follow-up-Szene
      run.currentScene = "follow_up";
      run.nextDeadlineMin = state.gameTime + (tpl.scenes.follow_up?.deadlineDays || 5) * DAY_MIN;
    } else if (appt.status === "cancelled" || appt.status === "missed") {
      addChronicleEntry(state, {
        title: tpl.title,
        text: `Das Treffen mit ${run.participants.find(p => p.role === "friend")?.name || "Freund"} kam nicht zustande.`,
        participants: run.participants.map(p => p.name),
        type: "story",
        storyId: run.storyId,
      });
      completeStoryRun(state, run, "cancelled", "Treffen abgesagt");
    } else {
      run.nextDeadlineMin = computeAutoProcessDeadline(state, run);
    }
    return;
  }

  if (run.currentScene === "break_running") {
    // Zwei-Tage-Auszeit: alle Termine prüfen
    const allDone = run.appointmentIds.every(aid => {
      const a = (state.appointments || []).find(x => x.id === aid);
      return !a || a.status === "done" || a.status === "cancelled" || a.status === "missed";
    });
    if (allDone) {
      run.currentScene = "completion";
      run.nextDeadlineMin = m + 1; // Sofort verarbeiten
    } else {
      run.nextDeadlineMin = computeAutoProcessDeadline(state, run);
    }
    return;
  }

  if (run.currentScene === "completion") {
    // Abschluss der Auszeit
    const anyCancelled = run.appointmentIds.some(aid => {
      const a = (state.appointments || []).find(x => x.id === aid);
      return a && a.status === "cancelled";
    });
    addChronicleEntry(state, {
      title: tpl.title,
      text: anyCancelled
        ? "Zwei Tage Auszeit – teilweise vorzeitig beendet, aber Erholung geholt."
        : "Zwei Tage vollständige Auszeit. Das Unternehmen lief weiter, während du abstand genommen hast.",
      participants: run.participants.map(p => p.name),
      type: "story",
      storyId: run.storyId,
    });
    completeStoryRun(state, run, "completed", "Auszeit beendet");
    return;
  }
}

// Verarbeitet Story-Termine bei Abschluss. Wird von processEventsAt aufgerufen,
// wenn ein Termin mit storyRunId endet.
export function processStoryAppointments(state, m, log) {
  migrateStories(state);
  for (const a of (state.appointments || [])) {
    if (!a.storyRunId) continue;
    if (a.storyProcessed) continue;
    if (a.status !== "done" && a.status !== "cancelled" && a.status !== "missed") continue;
    if (a.endMin !== m) continue;
    a.storyProcessed = true;
    const run = state.private.stories.runs.find(r => r.id === a.storyRunId);
    if (!run) continue;
    // Auto-Process-Szene weiterverarbeiten
    const tpl = STORIES[run.storyId];
    if (tpl.scenes[run.currentScene]?.autoProcess) {
      processAutoScene(state, run, m, log);
    }
  }
}

// ---------- Fristberechnung für Event-Scheduler ----------

export function getStoryEventTimes(state, t, maxMin) {
  const times = [];
  for (const run of (state.private?.stories?.runs || [])) {
    if (run.status !== "offered" && run.status !== "active") continue;
    if (run.nextDeadlineMin != null && run.nextDeadlineMin > t && run.nextDeadlineMin <= maxMin) {
      times.push(run.nextDeadlineMin);
    }
  }
  return times;
}

// ---------- Beziehungsänderungen ----------

// Wird aufgerufen, wenn eine Partnerschaft endet. Bricht alle offenen
// Geschichten mit der Partnerperson ab.
export function onPartnershipEnded(state, exPartnerId) {
  migrateStories(state);
  for (const run of state.private.stories.runs) {
    if (run.status !== "offered" && run.status !== "active") continue;
    if (!run.participants.some(p => p.id === exPartnerId)) continue;
    completeStoryRun(state, run, "cancelled", "Partnerschaft beendet");
    addChronicleEntry(state, {
      title: STORIES[run.storyId]?.title || "Geschichte",
      text: "Ein gemeinsames Vorhaben wurde beendet, da die Beziehung endete.",
      participants: run.participants.map(p => p.name),
      type: "story",
      storyId: run.storyId,
    });
  }
}

// ---------- Abfragefunktionen ----------

export function getStories(state) {
  migrateStories(state);
  const runs = state.private.stories.runs.filter(r => r.status === "offered" || r.status === "active");
  return runs.map(run => {
    const tpl = STORIES[run.storyId];
    const scene = tpl.scenes[run.currentScene];
    return {
      runId: run.id,
      storyId: run.storyId,
      title: tpl.title,
      description: tpl.description,
      participants: run.participants,
      currentScene: run.currentScene,
      status: run.status,
      text: scene?.text ? scene.text(state, run) : "",
      choices: scene?.choices?.filter(c => !c.condition || c.condition(state)).map(c => ({
        id: c.id,
        label: c.label,
        description: c.description,
        costCents: c.costCents || 0,
        durationMin: c.durationMin || 0,
      })) || [],
      needsDecision: !scene?.autoProcess,
      nextDeadlineMin: run.nextDeadlineMin,
      createdAtMin: run.createdAtMin,
    };
  });
}

export function getChronicle(state) {
  migrateStories(state);
  const entries = [...(state.private.chronicle || [])];

  // Bestehende Meilensteine hinzufügen (Heirat, Geburt, etc.)
  if (state.private.marriageDate != null) {
    entries.push({
      id: "chr_marriage",
      day: dayOf(state.private.marriageDate),
      min: state.private.marriageDate,
      title: "Hochzeit",
      text: `Du und ${state.private.partnerName || "Partner"} habt geheiratet.`,
      participants: [state.private.partnerName].filter(Boolean),
      type: "milestone",
    });
  }
  if (state.private.engagementDate != null) {
    entries.push({
      id: "chr_engagement",
      day: dayOf(state.private.engagementDate),
      min: state.private.engagementDate,
      title: "Verlobung",
      text: `Du und ${state.private.partnerName || "Partner"} habt euch verlobt.`,
      participants: [state.private.partnerName].filter(Boolean),
      type: "milestone",
    });
  }
  for (const child of (state.private.children || [])) {
    entries.push({
      id: "chr_child_" + child.id,
      day: dayOf(child.birthMin),
      min: child.birthMin,
      title: "Geburt",
      text: `${child.name} wurde geboren.`,
      participants: [state.private.partnerName, child.name].filter(Boolean),
      type: "milestone",
    });
  }

  entries.sort((a, b) => b.min - a.min);
  return entries.slice(0, 50);
}

export function getPromises(state) {
  migrateStories(state);
  return (state.private.promises || []).filter(p => p.status === "open");
}

// ---------- Tägliche Verarbeitung ----------

export function processDailyStories(state, midnight, log) {
  migrateStories(state);
  // Angebotserzeugung (mit Cooldown)
  maybeOfferStory(state, midnight, log);
  // Abgelaufene Geschichten bereinigen (älter als 30 Tage)
  const cutoff = midnight - 30 * DAY_MIN;
  state.private.stories.runs = retainHistory(state, "storyRuns", state.private.stories.runs, state.private.stories.runs.filter(r =>
    r.status === "offered" || r.status === "active" || (r.completedAtMin != null && r.completedAtMin >= cutoff)
  ), null);
  if (state.private.stories.runs.length > 50) {
    state.private.stories.runs = retainHistory(state, "storyRuns", state.private.stories.runs, state.private.stories.runs
      .filter(r => r.status === "offered" || r.status === "active")
      .concat(state.private.stories.runs.filter(r => r.status !== "offered" && r.status !== "active").slice(-20)), null);
  }
}