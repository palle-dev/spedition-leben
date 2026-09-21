import { isActivelyEmployed } from "./terminationEngine.ts";
export const TEAM_ID = "people_behind_tours";
export const TEAM_STORY = { id: TEAM_ID, title: "Die Menschen hinter den Touren", subtitle: "Erfahrung braucht eine Stimme.", chapters: 4, unlockDays: 0, kind: "Teamgeschichte · Fortsetzung" };
export function ensureTeamStory(state, now = state.gameTime) {
 const w = state.world;
 if (!w?.active || !w.stories) return;
 const parent = w.stories.driver;
 if (!w.stories[TEAM_ID]) w.stories[TEAM_ID] = {
  id: TEAM_ID, stage: 0, status: "locked", availableAtMin: null, decisions: [],
  actorId: null, actorName: null, pending: null, dueMin: null,
 };
 const run = w.stories[TEAM_ID];
 if (run.status !== "locked" || run.availableAtMin != null) return;
 if (parent?.status !== "done" || parent.stage < 2 || w.stories.built_together?.stage < 5 || w.stories.built_together?.status !== "done") return;
 const driver = state.drivers.find(d => d.id === parent.actorId && isActivelyEmployed(d) && !d.isTempStaff);
 run.actorId = parent.actorId; run.actorName = parent.actorName;
 if (!driver) {
  run.status = "done";
  run.ending = "Die gemeinsame Fortsetzung entfällt: Die beteiligte Person arbeitet nicht mehr in deinem Betrieb. Eure bisherigen Gespräche bleiben erhalten.";
  return;
 }
 run.actorName = driver.name;
 run.availableAtMin = now + 7 * 1440;
 run.background = parent.decisions?.find(d => d.stage === 0)?.choiceId || "honest";
}
const option = (id, label, detail, text, effect = {}, costCents = 0) => ({
 id, label, detail: detail + " Die Folgen treten nach drei Spieltagen ein.",
 account: "company", costCents, effect: {}, delayed: { text, effect },
});
export function teamScene(state, run) {
 const name = state.drivers.find(d => d.id === run.actorId)?.name || run.actorName || "Deine erfahrene Fahrkraft";
 const picks = Object.fromEntries(run.decisions.map(d => [d.stage, d.choiceId]));
 const driver = state.drivers.find(d => d.id === run.actorId);
 const mood = (driver?.satisfaction ?? 70) < 50
  ? "Die Unzufriedenheit ist inzwischen spürbar. Eine freundliche Formulierung allein wird sie nicht auflösen."
  : "Das Gespräch beginnt ruhig. Gerade deshalb möchtest du die Frage ernst nehmen.";
 if (run.stage === 0) return { title: "Die Mappe auf dem Beifahrersitz",
  text: name + " hat über die Zeit Notizen gesammelt: unklare Übergaben, gute Absprachen, kleine Dinge, die auf langen Touren einen Unterschied machen. " +
   (run.background === "invest" ? "„Du hast damals Geld für meine Entwicklung in die Hand genommen. Jetzt möchte ich etwas davon zurückgeben.“ " :
    run.background === "dismiss" ? "„Beim letzten Mal ging es schnell um meinen Vertrag. Heute würde ich gern über die Arbeit sprechen.“ " :
    "„Du warst damals ehrlich zu mir. Ich will es heute auch sein.“ ") +
   "Die Mappe bleibt zunächst geschlossen. „Willst du die Kurzfassung oder die ganze Geschichte?“",
  choices: [
   option("listen", "Die ganze Geschichte anhören", "Kostenlos. Zufriedenheit dieser Person +5, deine Belastung +2.",
    "Du hast auch die unbequemen Punkte angehört. Nicht jede Frage ist gelöst, aber die Erfahrung dieser Person hat in eurem Gespräch Platz bekommen.", {driver:5,stress:2}),
   option("review", "Die Notizen fachlich aufbereiten lassen", "350 € Firmenkonto. Zufriedenheit +3, Qualitätsvorsprung +1.",
    "Aus der Mappe ist eine verständliche Übersicht geworden. Die Aufbereitung verbessert deine Grundlage für Qualitätsgespräche. Eine neue Personalrolle wurde nicht vergeben.", {driver:3,quality:1},35000),
   option("brief", "Zunächst die wichtigsten Punkte besprechen", "Kostenlos. Zufriedenheit +1.",
    "Ihr habt mit den wichtigsten Punkten begonnen. Die übrigen Notizen bleiben offen; du hast keinen weiteren Termin versprochen.", {driver:1}),
  ] };
 if (run.stage === 1) return { title: "Nicht schon wieder die Feuerwehr",
  text: name + " kommt auf einen Satz aus der Mappe zurück: „Wenn jemand lange dabei ist, heißt das noch nicht, dass immer alles an dieser Person hängenbleiben muss.“ " +
   (picks[0] === "listen" ? "Du erinnerst dich an die Einzelheiten eures langen Gesprächs. " : picks[0] === "review" ? "Die aufbereitete Übersicht liegt zwischen euch. " : "Die Kurzfassung hat eine größere Frage offengelassen. ") +
   mood + " Es geht um Anerkennung, nicht um einen weiteren stillen Auftrag.",
  choices: [
   option("bonus", "Die bisherige Erfahrung mit einem Bonus würdigen", "300 € Firmenkonto. Zufriedenheit +7. Keine Änderung von Arbeitszeit oder Aufgaben.",
    "Der Bonus ist bezahlt. Du hast ihn ausdrücklich als Anerkennung für die bisherige Arbeit bezeichnet, nicht als Gegenleistung für zusätzliche Verfügbarkeit.", {driver:7},30000),
   option("respect", "Erwartungen offen besprechen", "Kostenlos. Zufriedenheit +3, deine Belastung +1. Dienstpläne bleiben unverändert.",
    "Ihr habt ausgesprochen, welche Erwartungen unausgesprochen im Raum standen. Das Gespräch schafft mehr Klarheit, ersetzt aber keine konkrete Dienstplanung.", {driver:3,stress:1}),
  ] };
 if (run.stage === 2) return { title: "Wissen, das sonst niemand sieht",
  text: "In einer Randnotiz steht eine Idee von " + name + ": Erfahrungen verständlich festhalten, damit sie nicht nur im Kopf einer einzelnen Person bleiben. " +
   (picks[1] === "bonus" ? "„Über den Bonus habe ich mich gefreut. Aber die Mappe soll nicht in der Schublade verschwinden.“ " : "„Wir haben über Erwartungen geredet. Vielleicht können wir auch etwas Verständliches daraus machen.“ ") +
   "Ein Leitfaden wäre ein Anfang. Eine Mentorenqualifikation oder Beförderung ist damit noch nicht verbunden.",
  choices: [
   option("guide", "Einen Leitfaden ausarbeiten lassen", "650 € Firmenkonto. Qualitätsvorsprung +2, Zufriedenheit +4.",
    "Die Erfahrungen sind fachlich aufbereitet. Dein Qualitätsvorsprung bei Spielwelt-Ausschreibungen steigt. Die beteiligte Person fühlt sich ernst genommen; Ausbildung und Disposition folgen weiterhin ihren eigenen Regeln.", {quality:2,driver:4},65000),
   option("notes", "Die wichtigsten Erfahrungen gemeinsam festhalten", "Kostenlos. Qualitätsvorsprung +1, deine Belastung +2.",
    "Aus den Notizen ist eine kurze Orientierung geworden. Das hat deine Aufmerksamkeit gebraucht und verbessert deine Grundlage für Qualitätsgespräche.", {quality:1,stress:2}),
   option("keep", "Die Notizen zunächst als Gesprächsgrundlage behalten", "Kostenlos. Zufriedenheit +1.",
    "Ihr habt euch gegen eine größere Ausarbeitung entschieden. Die Notizen bleiben ein gemeinsamer Bezugspunkt; daraus entsteht keine zusätzliche Aufgabe.", {driver:1}),
  ] };
 if (run.stage === 3) return { title: "Ein Name unter den Notizen",
  text: name + " blättert noch einmal zurück. " +
   (picks[2] === "guide" ? "Aus der alten Mappe ist ein ausgearbeiteter Leitfaden geworden. " :
    picks[2] === "notes" ? "Die gemeinsame Zusammenfassung liegt obenauf. " : "Die handschriftlichen Notizen haben ihren Platz behalten. ") +
   "„Ich wollte nicht plötzlich jemand anderes sein“, sagt die Person. „Ich wollte wissen, ob meine Erfahrung hier noch etwas zählt.“ Du kannst keine ganze berufliche Zukunft mit einem Satz versprechen. Aber du kannst auf diese Frage antworten.",
  choices: [
   option("credit", "Die Erfahrung ausdrücklich anerkennen", "Kostenlos. Zufriedenheit +4.",
    "Du hast die Person hinter der Arbeit gesehen. Eure gemeinsame Geschichte endet an dieser Stelle mit Anerkennung. Name, Entscheidungen und Folgen bleiben in der Chronik erhalten.", {driver:4}),
   option("honest", "Ehrlich über Möglichkeiten und Grenzen sprechen", "Kostenlos. Zufriedenheit +2, deine Belastung −2.",
    "Ihr habt keine Beförderung und keinen Ausbildungsplatz versprochen. Dafür habt ihr eine klare Antwort gefunden, auf die ihr euch beziehen könnt. Eure bisherigen Entscheidungen bleiben erhalten.", {driver:2,stress:-2}),
  ] };
 return null;
}
