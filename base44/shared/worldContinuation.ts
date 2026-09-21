import { ensureRivalStory } from "./worldRivalStory.ts";
import { ensureHomeStory } from "./worldHomeStory.ts";
import { ensureTeamStory } from "./worldTeamStory.ts";
// Authored continuation. Read-only scenes; stable choice IDs are save-game contracts.
export const CONTINUATION_ID = "built_together";
export const CONTINUATION = { id: CONTINUATION_ID, title: "Was wir aufgebaut haben", subtitle: "Aus einem Entschluss wird Verantwortung.", chapters: 5, unlockDays: 0, kind: "Staffel 2 · Fortsetzung" };
export function ensureWorldContinuation(state, now = state.gameTime) {
  const w = state.world;
  if (!w?.active || !w.stories) return;
  if (!w.stories[CONTINUATION_ID]) w.stories[CONTINUATION_ID] = {
    id: CONTINUATION_ID, stage: 0, status: "locked", availableAtMin: null,
    decisions: [], actorId: null, actorName: null, pending: null, dueMin: null,
  };
  ensureTeamStory(state, now);
  ensureHomeStory(state, now);
  ensureRivalStory(state, now);
  const run = w.stories[CONTINUATION_ID], parent = w.stories.harbor;
  if (run.status !== "locked" || run.availableAtMin != null || parent?.status !== "done" || parent.stage < 4) return;
  const path = parent.decisions?.find(d => d.stage === 3)?.choiceId;
  if (!["alliance", "independent", "corporate"].includes(path)) return;
  run.path = path;
  run.availableAtMin = now + 7 * 1440;
}
const choice = (id, label, detail, text, effect = {}, costCents = 0) => ({
  id, label, detail: detail + " Die Nachwirkung folgt nach drei Spieltagen.",
  costCents, account: "company", effect: {}, delayed: { text, effect },
});
export function continuationScene(state, run) {
  const picks = Object.fromEntries(run.decisions.map(d => [d.stage, d.choiceId]));
  const names = { alliance: "Anna", independent: "Anna und Vera", corporate: "Vera" };
  const counterpart = names[run.path] || "Anna";
  const branches = state.branches.filter(b => b.status !== "closed").length;
  const scale = branches > 1
    ? "Mit " + branches + " Standorten betrifft deine Antwort inzwischen mehr als einen Hof."
    : "Noch lässt sich vieles auf einem einzigen Hof persönlich besprechen.";
  if (run.stage === 0) {
    const openings = {
      alliance: ["Ein Bündnis im Alltag", "Anna legt zwei Ordner auf deinen Tisch. Auf dem einen steht ihr Familienname, auf dem anderen deiner. „Mein Vater fragt, wer bei uns eigentlich das letzte Wort hat. Ich möchte nicht jedes Mal um Erlaubnis bitten.“ Euer Bündnis hat den Sturm überstanden. Jetzt muss es den Alltag aushalten."],
      independent: ["Dein Name auf dem Briefkopf", "Vera hat um ein Gespräch über bevorzugte Zusammenarbeit gebeten. Anna fragt, ob dein unabhängiger Kurs für jede Art von Zusammenarbeit eine geschlossene Tür bedeutet. Zum ersten Mal musst du erklären, wofür dein eigener Name im Alltag stehen soll."],
      corporate: ["Die kleine Fußnote", "Vera schickt einen Entwurf für gemeinsame Qualitätsgespräche. Ihr Einkaufsnetz war eine offene Tür; nun möchte sie regelmäßige Einblicke in deine Abläufe. „Zusammenarbeit braucht Vergleichbarkeit“, sagt sie. Noch ist nichts unterschrieben. Du bestimmst, wie weit das Gespräch geht."],
    };
    const [title, text] = openings[run.path] || openings.independent;
    return { title, text: text + " " + scale, choices: [
      choice("joint", "Gemeinsame Standards ausarbeiten", "600 € Firmenkonto. Später Qualität +2 und Verhältnis zu " + (run.path === "corporate" ? "HanseCargo" : "Hansen") + " +4.",
        "Ihr habt die Erwartungen schriftlich verglichen. Aus guten Absichten sind verständliche Qualitätsmaßstäbe geworden. Ein neuer Transportvertrag wurde damit noch nicht geschlossen.",
        { quality: 2, relations: run.path === "corporate" ? { hansecargo: 4 } : { hansen: 4 } }, 60000),
      choice("limits", "Zuerst die Grenzen klären", "Kostenlos. Später Verlässlichkeit +2.",
        "Du hast ausdrücklich benannt, was du zusagen kannst und was offen bleibt. Das Gespräch ist vorsichtiger geworden, aber niemand muss ein stilles Versprechen erraten.", { trust: 2 }),
      choice("distance", "Die Zusammenarbeit vorerst nicht vertiefen", "Kostenlos. Später Stress −3; Verhältnis zum Gesprächspartner −2.",
        "Du hast die Einladung nicht angenommen. Dein Gegenüber akzeptiert die Absage, hält aber etwas mehr Abstand. Bestehende Verträge bleiben davon unberührt.",
        { stress: -3, relations: run.path === "corporate" ? { hansecargo: -2 } : { hansen: -2 } }),
    ] };
  }
  if (run.stage === 1) return {
    title: "Der freie Stuhl",
    text: (picks[0] === "joint" ? "Die gemeinsame Vorbereitung hat eine Frage offengelegt: Wer erklärt die Regeln den Menschen, die damit arbeiten sollen? " : "Nach deiner Antwort bleibt die Frage, wie dein eigener Betrieb mit Erwartungen umgeht. ") +
      "Bei der nächsten Besprechung lässt du einen Stuhl frei. Er soll für die Menschen stehen, die selten am Verhandlungstisch sitzen. " + scale + " Du kannst eine unabhängige Moderation finanzieren oder selbst die offenen Fragen sammeln.",
    choices: [
      choice("listen", "Eine moderierte Bestandsaufnahme bezahlen", "450 € Firmenkonto. Später Qualität +2, Stress −2.",
        "Die Moderation hat widersprüchliche Erwartungen sichtbar gemacht. Du erhältst eine klare Liste für künftige Qualitätsgespräche. Personalrollen und Disposition wurden dadurch nicht automatisch verändert.", { quality: 2, stress: -2 }, 45000),
      choice("own", "Die offenen Fragen selbst ordnen", "Kostenlos. Später Verlässlichkeit +1, Stress +2.",
        "Du hast die Fragen selbst zusammengetragen. Das kostet dich Aufmerksamkeit, zeigt aber, dass du Verantwortung für deine Aussagen übernimmst.", { trust: 1, stress: 2 }),
    ],
  };
  if (run.stage === 2) {
    const close = state.world.friend.quality >= 50;
    const supported = state.world.stories.friend?.decisions?.some(d => ["fund", "time"].includes(d.choiceId));
    return {
      title: "Ein Ort ohne Firmenlogo",
      text: "Jens schreibt dir vom alten Anleger. " + (supported ? "Er erwähnt noch einmal deine damalige Unterstützung. " : "Er erinnert sich an eure ersten Gespräche dort. ") +
        (close ? "„Hier musst du niemandem beweisen, wie groß deine Firma ist.“ " : "„Wir haben lange nicht in Ruhe geredet. Vielleicht fangen wir einfach damit an.“ ") +
        "Er fragt nicht nach einem Auftrag. Er fragt, ob zwischen all den Plänen noch Platz für etwas bleibt, das keinen Umsatz bringen muss.",
      choices: [
        { ...choice("meet", "Zwei Stunden mit Jens am Anleger verbringen", "Kostenlos. Echter Kalendertermin; bei Teilnahme Freundschaft +12, Stress −6. Anschließend Glück +2.",
          "Du hast dir Zeit für Jens genommen. Euer Gespräch war keine Geschäftsbesprechung. Diese Erinnerung gehört euch beiden.", { happiness: 2 }), appointment: true, account: "private" },
        choice("letter", "Jens persönlich und ehrlich antworten", "Kostenlos. Später Freundschaft +2.",
          "Du hast dir für eine persönliche Antwort Zeit genommen, ohne einen Termin zu versprechen. Jens freut sich darüber, dass du auf seine Worte eingegangen bist.", { friend: 2 }),
      ],
    };
  }
  if (run.stage === 3) return {
    title: "Was ein guter Name wert ist",
    text: counterpart + " kommt auf eure ersten Gespräche zurück. " +
      (picks[0] === "distance" ? "Dein Abstand ist nicht vergessen. Ein vorsichtiges Gespräch ist trotzdem möglich. " : picks[0] === "joint" ? "Die gemeinsam vorbereiteten Standards liegen noch auf dem Tisch. " : "Die Grenzen deiner Zusagen sind inzwischen klarer. ") +
      (picks[1] === "listen" ? "Aus der moderierten Bestandsaufnahme hast du konkrete Fragen mitgebracht. " : "Deine eigene Liste enthält noch offene Fragen. ") +
      (state.world.reputation.trust < 50 ? "Deine derzeitige Verlässlichkeit macht große Worte wenig überzeugend. Du willst erklären, was du tatsächlich verbessern möchtest." : "Deine derzeitige Verlässlichkeit gibt deinen Worten Gewicht. Die Frage ist, wie du damit umgehst."),
    choices: [
      choice("quality", "Eine fachliche Prüfung der Qualitätsmaßstäbe finanzieren", "800 € Firmenkonto. Später Qualität +3.",
        "Die fachliche Rückmeldung hat Lücken in euren Qualitätsmaßstäben geschlossen. Dein Qualitätsvorsprung bei Spielwelt-Ausschreibungen steigt. Eine erfolgreiche Lieferung ersetzt das nicht.", { quality: 3 }, 80000),
      choice("honest", "Offene Punkte transparent benennen", "Kostenlos. Später Verlässlichkeit +2.",
        "Du hast keine Erfolge behauptet, die noch nicht eingetreten sind. Die Offenheit stärkt deinen Ruf, auch wenn sie das Gespräch nicht einfacher macht.", { trust: 2 }),
      choice("negotiate", "Die unterschiedlichen Erwartungen verhandeln", "Kostenlos. Später Verhandlungsvorsprung +2, Stress +2.",
        "Ihr habt eure Positionen gründlich durchgesprochen. Du verstehst die Verhandlungsspielräume besser; das lange Gespräch hat dich allerdings belastet.", { price: 2, stress: 2 }),
    ],
  };
  if (run.stage === 4) return {
    title: "Nicht mehr ganz am Anfang",
    text: (run.path === "alliance" ? "Anna lehnt im Türrahmen. „Mein Vater hätte alles selbst entschieden. Ich lerne gerade, dass Zusammenarbeit etwas anderes ist.“ " :
      run.path === "corporate" ? "Vera schließt ihre Mappe. „Sie sind nicht bei jeder Frage mitgegangen. Aber ich weiß jetzt genauer, mit wem ich spreche.“ " :
      "Du siehst deinen Namen auf der Bürotür. Unabhängig zu bleiben hat nicht bedeutet, alles allein zu machen. ") +
      (picks[2] === "meet" ? "Auch der geplante Abend am Anleger gehört zu diesen Wochen; wie er ausgegangen ist, steht in deiner Chronik. " : "Jens' Antwort liegt noch zwischen deinen Unterlagen. ") +
      "Was möchtest du aus dieser Zeit mitnehmen?",
    choices: [
      choice("together", "Vertrauen braucht gemeinsame Arbeit", "Kostenlos. Später Hansen +3, HanseCargo +3.",
        "Du hältst fest: Zusammenarbeit darf unterschiedliche Interessen sichtbar machen. Anna und Vera nehmen deine Bereitschaft zum weiteren Gespräch wahr. Dieses Kapitel ist abgeschlossen; eure bisherigen Entscheidungen bleiben erhalten.", { relations: { hansen: 3, hansecargo: 3 } }),
      choice("steady", "Zusagen müssen zum eigenen Betrieb passen", "Kostenlos. Später Verlässlichkeit +2.",
        "Du bleibst bei überschaubaren Zusagen. Dein ursprünglicher Weg gilt weiter, aber du gehst ihn bewusster. Dieses Kapitel ist abgeschlossen; eure bisherigen Entscheidungen bleiben erhalten.", { trust: 2 }),
      choice("balance", "Das Leben darf größer sein als die Firma", "Kostenlos. Später Glück +3, Stress −3.",
        "Du hast dir einen Maßstab gesetzt, der über das nächste Angebot hinausreicht. Es ist kein automatischer Kalenderplan, sondern deine Antwort auf diese Wochen. Dieses Kapitel ist abgeschlossen; eure bisherigen Entscheidungen bleiben erhalten.", { happiness: 3, stress: -3 }),
    ],
  };
  return null;
}
