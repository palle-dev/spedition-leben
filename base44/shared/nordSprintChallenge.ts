import { findOrder } from "./orderLookup.ts";
import { checkBodyTypeCompatibility } from "./gameRules.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { independentRival } from "./competitionCore.ts";
import { retainLatestHistory } from "./historyRetention.ts";

export const NORDSPRINT_COMMANDS = ["startNordSprintChallenge", "acceptNordSprintFollowup", "finishNordSprintChallenge"];
export const NORDSPRINT_OFFERS = [
  { id: "price", label: "NordSprint unterbieten", paymentCents: 49000, windowMin: 720, followupCents: 62000,
    detail: "490 € Vergütung. Zwölf Spielstunden ab Abholung. Bei pünktlicher Lieferung bietet der Kunde eine Rückladung für 620 € an." },
  { id: "quality", label: "Frühe Lieferung zusagen", paymentCents: 76000, windowMin: 360, followupCents: 85000,
    detail: "760 € Vergütung. Sechs Spielstunden ab Abholung. Bei pünktlicher Lieferung bietet der Kunde eine Rückladung für 850 € an." },
];
const clamp = (n, max = 100) => Math.max(0, Math.min(max, n));
export function nordSprintAvailable(state) {
  const run = state?.world?.stories?.harbor;
  return !!state?.world?.active && state.scenario?.status !== "active" && !state.world.nordSprintChallenge &&
    run?.stage === 1 && run.status === "decision" && !run.decisions?.some(d => d.stage === 1) &&
    independentRival(state.world.rivals.find(r => r.id === "nordsprint"));
}
export function nordSprintActive(state) {
  const a = state?.world?.nordSprintChallenge;
  return !!a && a.status !== "done";
}
export function nordSprintStartReason(state) {
  if (!nordSprintAvailable(state)) return "Dieser Probelauf ist hier nicht mehr verfügbar. Deine bisherigen Entscheidungen bleiben erhalten.";
  const suitable = (state.vehicles || []).some(v => !["sold", "archived"].includes(v.status) &&
    !["sold", "archived"].includes(v.ownership_type) && !v.markedForSale && v.condition >= 20 &&
    v.capacityTons >= 6 && checkBodyTypeCompatibility({ cargo: "Stückgut", tons: 6 }, v).ok);
  if (!suitable || !(state.drivers || []).some(isActivelyEmployed)) return "Du brauchst einen geeigneten eigenen Lkw für 6 t Stückgut und einen angestellten Fahrer.";
  return null;
}
export function nordSprintPickup(state) {
  return (Math.floor(state.gameTime / 1440) + 1) * 1440 + 8 * 60;
}
function remember(state, key, title, text, kind = "decision") {
  const id = "nordsprint_challenge_" + key;
  state.world.chronicle.push({ id, atMin: state.gameTime, title, text, kind,
    cause: { storyId: "harbor", stage: 1, title: "Der Preis der Nacht", choice: "Den Kunden auf der Straße überzeugen" } });
  if (state.world.chronicle.length > 180) state.world.chronicle = retainLatestHistory(state, "worldChronicle", state.world.chronicle, 180);
  return id;
}
function order(state, id, fromCity, toCity, paymentCents, pickup, windowMin) {
  const m = state.gameTime;
  state.orders.push({
    id, nordSprintChallenge: true, customer: "Kontor am Anleger · Probelauf gegen NordSprint",
    fromCity, toCity, cargo: "Stückgut · Werkstattbedarf", tons: 6, paymentCents,
    acceptDeadlineMin: m, deliveryDeadlineMin: pickup + windowMin,
    status: "angenommen", acceptedAtMin: m, startedAtMin: null, deliveredAtMin: null, paidCents: null,
    offerType: "normal", customerId: null, shipmentId: null, earliestPickupMin: pickup,
    latestLoadStartMin: pickup + windowMin - 180, publishedAtMin: m,
    paymentTermsDays: 0, paymentDueMin: null, relationFactor: 1, feasible: true, source: "world",
    acceptedById: "player", acceptedByName: state.private.playerName, plannedById: null, plannedByName: null,
    history: [{ type: "accepted", min: m, actor: "player", actorName: state.private.playerName }],
  });
}
function resultOf(state, id) {
  const o = findOrder(state, id);
  if (!o) return null;
  const delivered = o.status === "geliefert" && Number.isFinite(o.deliveredAtMin);
  if (!delivered && !["storniert", "failed", "expired"].includes(o.status)) return null;
  const trip = state.trips.find(t => t.orderId === id && t.status === "completed");
  return { orderId: id, outcome: delivered ? (o.deliveredAtMin <= o.deliveryDeadlineMin ? "on_time" : "late") : "failed",
    fromCity: o.fromCity, toCity: o.toCity, deliveredAtMin: delivered ? o.deliveredAtMin : null,
    deadlineMin: o.deliveryDeadlineMin, paidCents: delivered ? (o.paidCents ?? 0) : 0,
    driverName: state.drivers.find(d => d.id === trip?.driverId)?.name || null };
}
export function nordSprintFeedback(a) {
  const r = a.followupResult || a.trialResult;
  if (!r) return "";
  if (a.followupResult) {
    if (r.outcome === "on_time") return "Der Kunde: „Zweimal geliefert, zweimal Wort gehalten. Bei der nächsten Ausschreibung achten wir auf deinen Namen.“ Malte hat jetzt einen verlässlichen Konkurrenten mehr.";
    return r.outcome === "late" ? "Der Kunde: „Die Rückladung ist da, aber unser Vertrauen war schneller als euer Lkw. Wir vergleichen wieder beide Anbieter.“" :
      "Der Kunde: „Die zweite Zusage blieb offen. Wir verlassen uns vorerst nicht auf eine bevorzugte Zusammenarbeit.“";
  }
  if (r.outcome === "on_time") return a.choiceId === "quality"
    ? "Der Kunde: „Die frühe Lieferung hat uns Zeit verschafft. Dafür zahle ich lieber mehr.“ Maltes günstiges Angebot liegt noch auf dem Tisch, aber die nächste Rückladung wird zuerst dir angeboten."
    : "Der Kunde: „Euer Preis stimmt und die Ware war pünktlich da. Ich gebe euch eine zweite Tour.“ Malte: „Einen Preis kann jeder senken. Haltet ihr ihn auch durch?“";
  return r.outcome === "late" ? "Der Kunde: „Das zugesagte Fenster ist vorbei. Der günstige Preis ersetzt keine pünktliche Lieferung.“ Die Rückladung wird dir nicht angeboten." :
    "Der Kunde: „Ohne gelieferte Ware gibt es keinen Folgeauftrag.“ NordSprints Angebot bleibt eine Alternative.";
}
export function processNordSprintChallenge(state) {
  const a = state.world?.nordSprintChallenge;
  if (!a || !["trial", "followup"].includes(a.status)) return;
  const isTrial = a.status === "trial";
  const observed = resultOf(state, isTrial ? a.trialId : a.followupId);
  if (!observed) return;
  const r = { ...observed, customerTrustDelta: 0, reputationDelta: 0 };
  const onTime = r.outcome === "on_time";
  const trustDelta = onTime ? (isTrial ? (a.choiceId === "quality" ? 35 : 20) : 15) : r.outcome === "late" ? -15 : -30;
  const reputationDelta = onTime ? (isTrial && a.choiceId === "quality" ? 5 : 3) : r.outcome === "late" ? -3 : -5;
  a.customerTrust = clamp(a.customerTrust + trustDelta);
  const w = state.world;
  w.reputation.trust = clamp(w.reputation.trust + reputationDelta);
  if (isTrial && onTime) {
    const key = a.choiceId === "quality" ? "quality" : "price";
    w.reputation[key] = clamp(w.reputation[key] + (key === "quality" ? 3 : 2), 20);
  }
  r.customerTrustDelta = trustDelta; r.reputationDelta = reputationDelta;
  if (isTrial) { a.trialResult = r; a.status = "debrief"; }
  else { a.followupResult = r; a.status = "finale"; }
  a.customerStatus = a.followupResult?.outcome === "on_time" && a.customerTrust >= 75 ? "preferred" :
    isTrial && onTime ? "second_chance" : "comparing";
  remember(state, isTrial ? "trial_result" : "followup_result",
    onTime ? "Der Kunde erinnert sich an deine Zusage" : "Preis und Versprechen passen nicht zusammen",
    nordSprintFeedback(a), "consequence");
}
export function handleNordSprintCommand(state, command, p) {
  if (!NORDSPRINT_COMMANDS.includes(command)) return null;
  let a = state.world?.nordSprintChallenge;
  if (command === "startNordSprintChallenge") {
    const choice = NORDSPRINT_OFFERS.find(c => c.id === p.choiceId);
    if (!choice) throw new Error("Dieses Angebot gibt es nicht.");
    if (a) {
      if (a.choiceId === choice.id) return { ok: true, alreadyApplied: true, orderId: a.trialId };
      throw new Error("Dein Angebot ist bereits verbindlich.");
    }
    const reason = nordSprintStartReason(state);
    if (reason) throw new Error(reason);
    const pickup = nordSprintPickup(state);
    a = state.world.nordSprintChallenge = { version: 1, status: "trial", choiceId: choice.id,
      startedAtMin: state.gameTime, trialId: "nordsprint_trial", followupId: null,
      trialResult: null, followupResult: null, customerTrust: 40, customerStatus: "testing" };
    order(state, a.trialId, "Hamburg", "Bremen", choice.paymentCents, pickup, choice.windowMin);
    remember(state, "offer", choice.label, choice.detail + " Abholung am nächsten Spieltag um 08:00. Der Probelauf ist verbindlich angenommen.");
    return { ok: true, orderId: a.trialId };
  }
  if (!a) throw new Error("Vereinbare zuerst den Probelauf mit dem Kunden.");
  if (command === "acceptNordSprintFollowup") {
    if (a.followupId) return { ok: true, alreadyApplied: true, orderId: a.followupId };
    if (a.status !== "debrief" || a.trialResult?.outcome !== "on_time") throw new Error("Der Kunde bietet dir gerade keinen Folgeauftrag an.");
    const choice = NORDSPRINT_OFFERS.find(c => c.id === a.choiceId);
    a.followupId = "nordsprint_followup";
    order(state, a.followupId, "Bremen", "Hamburg", choice.followupCents, state.gameTime, 720);
    a.status = "followup";
    remember(state, "followup", "Aus einem Probelauf wird ein Folgeauftrag", "Du sagst die Rückladung zu. Zwölf Spielstunden Lieferzeit beginnen jetzt. Normale Transportkosten und Fristen gelten.");
    return { ok: true, orderId: a.followupId };
  }
  if (a.status === "done") return { ok: true, alreadyApplied: true };
  if (!["debrief", "finale"].includes(a.status)) throw new Error("Dein zugesagter Transport ist noch offen. Liefere ihn aus oder storniere ihn in der Auftragsverwaltung.");
  const run = state.world.stories.harbor;
  if (run.stage !== 1 || run.status !== "decision" || run.decisions.some(d => d.stage === 1)) throw new Error("Dieses Kapitel wurde bereits entschieden.");
  a.status = "done"; a.completedAtMin = state.gameTime;
  a.ending = nordSprintFeedback(a) + (!a.followupId && a.trialResult.outcome === "on_time" ? " Du hast den Folgeauftrag anderen überlassen; dein erstes Lieferergebnis bleibt bestehen." : "");
  if (!a.followupId && a.trialResult.outcome === "on_time") a.customerStatus = "proven";
  const eventId = remember(state, "finished", "Deine Antwort auf NordSprint", a.ending, "consequence");
  run.decisions.push({ stage: 1, choiceId: a.choiceId, atMin: state.gameTime, eventId });
  run.stage = 2; run.status = "decision"; run.pending = null; run.dueMin = null;
  return { ok: true };
}
