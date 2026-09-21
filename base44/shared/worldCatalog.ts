import { RIVAL_STORY, RIVAL_ID, rivalScene } from "./worldRivalStory.ts";
import { HOME_STORY, HOME_ID, homeScene } from "./worldHomeStory.ts";
import { TEAM_STORY, TEAM_ID, teamScene } from "./worldTeamStory.ts";
import { CONTINUATION, continuationScene, CONTINUATION_ID } from "./worldContinuation.ts";
// Authored stories and shared UI labels. No state mutation or random numbers here.
export const WORLD_DAY = 1440;
export const WORLD_RIVALS = [
  { id: "hansen", name: "Hansen & Tochter", person: "Anna Hansen", city: "Hamburg",
    strategy: "Verlässlichkeit vor Wachstum", description: "Ein Familienbetrieb zwischen alten Versprechen und Annas Plänen für die Zukunft.",
    cashCents: 1800000, fleet: 2, reliability: 86, pricePercent: 105 },
  { id: "nordsprint", name: "NordSprint", person: "Malte Kröger", city: "Bremen",
    strategy: "Schnell, günstig, risikofreudig", description: "Malte will jede freie Lücke im Markt besetzen. Sein Tempo kostet Reserven.",
    cashCents: 1200000, fleet: 3, reliability: 69, pricePercent: 88 },
  { id: "hansecargo", name: "HanseCargo Gruppe", person: "Dr. Vera Brandt", city: "Hannover",
    strategy: "Größe und kalkulierte Preise", description: "Vera bietet Zugang zu großen Kunden – und erwartet eine klare Position.",
    cashCents: 6500000, fleet: 5, reliability: 79, pricePercent: 98 },
];
export const WORLD_STORIES = [
  CONTINUATION,
  TEAM_STORY,
  HOME_STORY,
  RIVAL_STORY,
  { id: "harbor", title: "Zwischen Hafen und Zuhause", subtitle: "Eine Region erinnert sich.", chapters: 4, unlockDays: 0, kind: "Hauptgeschichte" },
  { id: "driver", title: "Dein erster Fahrer", subtitle: "Loyalität lässt sich nicht kaufen. Aber verdienen.", chapters: 2, unlockDays: 1, kind: "Teamgeschichte" },
  { id: "home", title: "Das Licht in der Küche", subtitle: "Welche Versprechen überstehen einen vollen Auftragskalender?", chapters: 2, unlockDays: 3, kind: "Persönliche Geschichte" },
  { id: "friend", title: "Der alte Anleger", subtitle: "Jens kennt dich noch ohne Firmenlogo auf der Jacke.", chapters: 2, unlockDays: 5, kind: "Freundschaft" },
];
export const WORLD_BIDS = [
  { id: "lean", label: "Knapp kalkuliert", percent: 85, detail: "85 % des Richtpreises · bessere Preischance, weniger Erlös" },
  { id: "balanced", label: "Solide kalkuliert", percent: 100, detail: "100 % des Richtpreises · ausgewogenes Angebot" },
  { id: "premium", label: "Qualität hat ihren Preis", percent: 115, detail: "115 % des Richtpreises · braucht einen sehr guten Ruf" },
];
export const WORLD_REPUTATION_LABELS = { trust: "Verlässlichkeit", quality: "Qualitätsvorsprung", price: "Verhandlungsvorsprung" };
type WorldEffect = { trust?: number; quality?: number; price?: number; stress?: number; happiness?: number; relationship?: number; driver?: number; friend?: number; relations?: Record<string, number> };
type WorldChoice = { id: string; label: string; detail: string; effect: WorldEffect; costCents: number; account: "company" | "private"; appointment?: boolean; requiresHansen?: number; delayed?: { text: string; effect: WorldEffect; identity?: string } };
const c = (id: string, label: string, detail: string, effect: WorldEffect = {}, extra: Partial<WorldChoice> = {}): WorldChoice => ({ id, label, detail, effect, costCents: 0, account: "company", ...extra });
export function worldScene(state, run) {
  if (!run) return null;
  if (run.id === RIVAL_ID) return rivalScene(state, run);
  if (run.id === HOME_ID) return homeScene(state, run);
  if (run.id === TEAM_ID) return teamScene(state, run);
  if (run.id === CONTINUATION_ID) return continuationScene(state, run);
  const w = state.world;
  const picks = Object.fromEntries((w?.stories?.harbor?.decisions || []).map(d => [d.stage, d.choiceId]));
  if (run.id === "harbor") return [
    { title: "Ein Brief vom alten Kai", text: "Anna Hansen steht mit einer zerknitterten Tourenmappe im Büro. Ihr Vater fällt aus; sein letzter Stammkunde will zur HanseCargo Gruppe wechseln. „Ich brauche keinen Retter“, sagt sie. „Ich brauche jemanden, der sein Wort hält.“ Malte von NordSprint hat dem Kunden bereits einen Kampfpreis geschickt.",
      choices: [
        c("help", "Anna beim Übergang helfen", "450 € Firmenkonto. Hansen +12, Verlässlichkeit +4. Später fällt dir die Hilfe wieder zu.", { trust: 4, relations: { hansen: 12 } }, { costCents: 45000, delayed: { text: "Anna hat den Stammkunden gehalten. Weil du beim Übergang geholfen hast, gibt sie dir Einblick in seine Qualitätsanforderungen.", effect: { quality: 2 } } }),
        c("compete", "Selbst um den Kunden werben", "Kostenlos. Hansen −8. Du lernst, Angebote genauer zu verhandeln.", { relations: { hansen: -8 } }, { delayed: { text: "Deine eigene Kalkulation hat Eindruck gemacht. Anna merkt sich allerdings, dass du ihre Schwäche genutzt hast.", effect: { price: 2 } } }),
        c("listen", "Zuhören, ohne etwas zu versprechen", "Kostenlos. Hansen +3. Du hältst deine Reserven zusammen.", { relations: { hansen: 3 } }, { delayed: { text: "Anna findet eine Übergangslösung. Deine Ehrlichkeit bleibt ihr in Erinnerung; ein enger Verbündeter bist du noch nicht.", effect: { trust: 1 } } }),
      ] },
    { title: "Der Preis der Nacht", text: (picks[0] === "help" ? "Anna warnt dich zuerst: " : "Im Fahrerfunk wird es plötzlich still: ") + "NordSprint bietet dieselbe Relation deutlich günstiger an. Malte behauptet, bessere Abläufe machten den Preis möglich. Vera Brandt hält dagegen: „Am Ende zählt, wer morgen noch liefern kann.“ Wie willst du wachsen?",
      choices: [
        c("quality", "In verlässliche Abläufe investieren", "650 € Firmenkonto. Nach zwei Tagen Qualitätsvorsprung +5.", {}, { costCents: 65000, delayed: { text: "Die neuen Übergaben greifen. Kunden sehen, dass du Qualität bezahlt und nicht nur versprochen hast.", effect: { quality: 5, trust: 3 } } }),
        c("price", "Die Kalkulation auf Preiskampf ausrichten", "Kostenlos. Verlässlichkeit −3; später Verhandlungsvorsprung +4. NordSprint −5.", { trust: -3, relations: { nordsprint: -5 } }, { delayed: { text: "Die engen Angebote bringen dir Verhandlungserfahrung. Malte behandelt dich nun als direkten Herausforderer.", effect: { price: 4 } } }),
        c("talk", "Mit Malte offen über Kapazitäten sprechen", "Kostenlos. NordSprint +8. Später Verlässlichkeit +2.", { relations: { nordsprint: 8 } }, { delayed: { text: "Malte hat erstmals einen Auftrag ausgelassen, statt zu viel zu versprechen. Dein offenes Gespräch schafft Respekt.", effect: { trust: 2 } } }),
      ] },
    { title: "Die Nacht am Kai", text: "Ein Sturm legt Teile des Hafens lahm. In Annas Büro brennt noch Licht; Malte versucht, seine Rückstände zu ordnen. Auf dem Tisch liegt eine gemeinsame Notfallplanung. " + (picks[0] === "help" ? "Anna übernimmt die Hälfte deines Beitrags: „Du warst damals auch da.“" : "Anna wartet ab, ob diesmal eine gemeinsame Lösung möglich ist."),
      choices: [
        c("network", "Die gemeinsame Notfallplanung finanzieren", (picks[0] === "help" ? "400" : "800") + " € Firmenkonto. Hansen +8. Später Verlässlichkeit +8 und Qualität +2.", { relations: { hansen: 8 } }, { costCents: picks[0] === "help" ? 40000 : 80000, delayed: { text: "Die abgestimmten Übergaben haben funktioniert. Weil du die Notfallplanung mitgetragen hast, berücksichtigen regionale Kunden deinen Betrieb stärker.", effect: { trust: 8, quality: 2 } } }),
        c("protect", "Nur zusagen, was die eigene Firma leisten kann", "Kostenlos. Stress −4. Später Verlässlichkeit +3.", { stress: -4 }, { delayed: { text: "Du hast weniger zugesagt, aber dein Wort gehalten. Die nüchterne Entscheidung stärkt deinen Ruf.", effect: { trust: 3 } } }),
        c("opportunity", "Die Lücken im Markt auswerten", "Kostenlos. Hansen −6, Verlässlichkeit −3; später Verhandlungsvorsprung +3.", { trust: -3, relations: { hansen: -6 } }, { delayed: { text: "Du kennst jetzt die Engpässe der Region. Anna hat bemerkt, dass du zuerst nach einer Geschäftschance gesucht hast.", effect: { price: 3 } } }),
      ] },
    { title: "Wem gehört der Norden?", text: "Der Sturm ist vorbei. Drei Einladungen liegen auf deinem Tisch. Anna will ein Bündnis verlässlicher Betriebe. Vera bietet Kontakte zu ihrem Einkaufsnetz. Und an deiner eigenen Bürotür steht noch immer dein Name. Die bisherigen Entscheidungen haben verändert, wer dir vertraut.",
      choices: [
        c("alliance", "Ein regionales Bündnis mit Anna schließen", "Hansen-Verhältnis mindestens 55. Dauerhaft Qualität +4, Hansen +10.", { relations: { hansen: 10 } }, { requiresHansen: 55, delayed: { text: "Das regionale Bündnis steht. Deine bisherigen Zusagen sind der Grund, warum Anna dir nun ihren Namen anvertraut.", effect: { quality: 4, trust: 3 }, identity: "Partner des Nordens" } }),
        c("independent", "Unter eigenem Namen weitergehen", "Kostenlos. Dauerhaft Qualität +3 und Verhandlungsvorsprung +1.", {}, { delayed: { text: "Du bleibst unabhängig. Kunden müssen dich nicht mit einem Konzern verbinden, sondern mit deinen eigenen Entscheidungen.", effect: { quality: 3, price: 1 }, identity: "Unabhängig am Kai" } }),
        c("corporate", "Mit Veras Einkaufsnetz zusammenarbeiten", "Kostenlos. HanseCargo +12, Hansen −4. Dauerhaft Verhandlungsvorsprung +4.", { relations: { hansecargo: 12, hansen: -4 } }, { delayed: { text: "Vera öffnet ihr Einkaufsnetz. Bessere Marktkenntnis hilft dir bei Geboten; die Verantwortung für deine Transporte bleibt bei dir.", effect: { price: 4 }, identity: "Neue Wege mit HanseCargo" } }),
      ] },
  ][run.stage];
  if (run.id === "driver") return [
    { title: "Ein Angebot aus Bremen", text: run.actorName + " legt ein Angebot von NordSprint auf den Tisch. „Es geht mir nicht nur ums Geld. Ich möchte wissen, ob ich hier noch eine Zukunft habe.“ Die Person, die deine ersten Touren gefahren ist, wartet auf eine Antwort.",
      choices: [
        c("invest", "Eine persönliche Entwicklung finanzieren", "400 € Firmenkonto. Zufriedenheit +8; später zusätzlich +5.", { driver: 8 }, { costCents: 40000, delayed: { text: "Du hast das Entwicklungsgespräch mit einem echten Budget verbunden. Das ist im Team angekommen.", effect: { driver: 5 } } }),
        c("honest", "Die finanzielle Lage ehrlich erklären", "Kostenlos. Zufriedenheit +2. Keine leeren Versprechen.", { driver: 2 }, { delayed: { text: "Das offene Gespräch hat die Unsicherheit nicht ganz gelöst, aber Vertrauen geschaffen.", effect: { driver: 2 } } }),
        c("dismiss", "Auf den bestehenden Vertrag verweisen", "Kostenlos. Zufriedenheit −6; später nochmals −3.", { driver: -6 }, { delayed: { text: "Die Antwort war korrekt, aber kühl. Die Frage nach einer Zukunft in deinem Betrieb ist damit nicht verschwunden.", effect: { driver: -3 } } }),
      ] },
    { title: "Mehr als eine Personalnummer", text: run.actorName + " spricht dich nach einer Tour erneut an. " + (run.decisions[0]?.choiceId === "invest" ? "Die geförderte Entwicklung hat neue Ideen gebracht." : "Das letzte Gespräch ist nicht vergessen.") + " „Wenn ich hier bleibe, möchte ich, dass meine Erfahrung zählt.“",
      choices: [
        c("recognize", "Die Erfahrung mit einem Bonus anerkennen", "300 € Firmenkonto. Zufriedenheit +10; später Qualität +2.", { driver: 10 }, { costCents: 30000, delayed: { text: "Erfahrung hat bei dir einen sichtbaren Wert. Das Wissen aus dem Team verbessert deine Angebote.", effect: { quality: 2 } } }),
        c("listen", "Die Verbesserungsvorschläge gemeinsam aufnehmen", "Kostenlos. Zufriedenheit +4; später Qualität +1.", { driver: 4 }, { delayed: { text: "Du hast zugehört. Aus einer schwierigen Unterhaltung ist ein besserer Ablauf geworden.", effect: { quality: 1 } } }),
      ] },
  ][run.stage];
  if (run.id === "home") return [
    { title: "Ein Platz bleibt leer", text: run.actorName + " schiebt dir das kalte Abendessen hin. „Ich will nicht gegen deine Firma gewinnen. Ich möchte in deinem Kalender vorkommen.“ Draußen vibriert schon wieder das Telefon.",
      choices: [
        c("evening", "Einen gemeinsamen Abend fest eintragen", "60 € Privatkonto. Zwei Stunden ab morgen 18 Uhr, bei Konflikten am nächsten freien Abend. Danach Beziehung +8, Stress −8.", {}, { account: "private", costCents: 6000, appointment: true, delayed: { text: "Der gemeinsame Abend war kein weiteres verschobenes Versprechen. Das Vertrauen wirkt über diesen einen Termin hinaus.", effect: { relationship: 3, happiness: 3 } } }),
        c("honest", "Die Belastung offen ansprechen", "Kostenlos. Beziehung +1. Später Stress −3; ihr müsst noch eine Lösung finden.", { relationship: 1 }, { delayed: { text: "Das ehrliche Gespräch nimmt Druck heraus. Zeit füreinander ist damit noch nicht gefunden.", effect: { stress: -3 } } }),
      ] },
    { title: "Das nächste Klingeln", text: "Als das Telefon beim Essen klingelt, sieht " + run.actorName + " nicht auf das Display, sondern zu dir. " + (run.decisions[0]?.choiceId === "evening" ? "Der letzte gemeinsame Abend hat gezeigt, dass es gehen kann." : "Euer letztes Gespräch hängt noch in der Luft.") + " Was wird diesmal aus deiner Zusage?",
      choices: [
        c("repeat", "Noch einen Abend verbindlich freihalten", "Kostenlos. Zwei Stunden im Kalender. Nach Teilnahme Beziehung +8, Stress −8; später Glück +4.", {}, { account: "private", appointment: true, delayed: { text: "Du hast aus einer Ausnahme eine zweite gute Erfahrung gemacht. Eure Geschichte geht neben der Firma weiter.", effect: { happiness: 4 } } }),
        c("boundaries", "Gemeinsam realistische Grenzen besprechen", "Kostenlos. Beziehung +2; später Stress −2.", { relationship: 2 }, { delayed: { text: "Ihr habt keine perfekte Lösung, aber eine gemeinsame Sprache für die Belastung gefunden.", effect: { stress: -2 } } }),
      ] },
  ][run.stage];
  if (run.id === "friend") return [
    { title: "Rost an der alten Fähre", text: "Jens will den Kiosk am alten Anleger wieder öffnen. Früher habt ihr dort stundenlang gesessen. Jetzt fragt er nach Hilfe. „Du musst mir nichts beweisen“, sagt er. „Ich wollte nur nicht schon wieder hören, dass du keine Zeit hast.“",
      choices: [
        c("fund", "Material für den Wiederaufbau bezahlen", "180 € Privatkonto. Freundschaft +10; später Glück +3.", { friend: 10 }, { account: "private", costCents: 18000, delayed: { text: "Das neue Licht am Anleger brennt. Jens erinnert sich daran, wer die ersten Bretter bezahlt hat.", effect: { friend: 5, happiness: 3 } } }),
        c("time", "Selbst zwei Stunden mit anpacken", "Kostenlos. Termin ab morgen 18 Uhr am nächsten freien Abend. Nach Teilnahme Freundschaft +12, Stress −6.", {}, { account: "private", appointment: true, delayed: { text: "Ihr habt gearbeitet und geredet wie früher. Jens sieht wieder den Menschen hinter der Firma.", effect: { friend: 4, happiness: 3 } } }),
        c("decline", "Diesmal ehrlich absagen", "Kostenlos. Freundschaft −3. Die Tür bleibt offen.", { friend: -3 }, { delayed: { text: "Jens findet andere Helfer. Er ist enttäuscht, aber froh, dass du kein leeres Versprechen gegeben hast.", effect: {} } }),
      ] },
    { title: "Die Liste im Handschuhfach", text: "Am Anleger treffen sich inzwischen Handwerker, Händler und Fahrer. Jens legt dir eine Liste regionaler Betriebe hin. „Die suchen jemanden, auf den sie sich verlassen können. Ich kann dich vorstellen.“",
      choices: [
        c("network", "Ein Treffen der regionalen Betriebe unterstützen", "250 € Firmenkonto. Später Verlässlichkeit +5, Freundschaft +3.", {}, { costCents: 25000, delayed: { text: "Weil du dich am Anleger eingebracht hast, kennen regionale Auftraggeber nun deinen Namen. Dein Ruf verbessert deine Chancen bei Ausschreibungen.", effect: { trust: 5, friend: 3 } } }),
        c("friendship", "Den Anleger als privaten Rückzugsort behalten", "Kostenlos. Freundschaft +5; später Glück +4.", { friend: 5 }, { delayed: { text: "Nicht jeder gute Ort muss ein Geschäft werden. Jens weiß diese Entscheidung zu schätzen.", effect: { happiness: 4 } } }),
      ] },
  ][run.stage];
  return null;
}
