import { addBooking } from "./accountingEngine.ts";
import { checkBodyTypeCompatibility } from "./gameRules.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { findOrder } from "./orderLookup.ts";
import { retainLatestHistory } from "./historyRetention.ts";

// A voluntary, persisted opening for the harbor story. Existing decisions and
// old saves are left alone. Only real order outcomes advance the two deliveries.
export const HARBOR_OPENING_COMMANDS = ["startHarborOpening", "chooseHarborHandover", "acceptHarborReturn", "finishHarborOpening"];
export const HARBOR_HANDOVERS = [
  { id: "priority", label: "Zusätzliche Rampe organisieren", paymentCents: 65000, feeCents: 9000, pickupDelay: 0, window: 360,
    detail: "90 € sofort für eine zusätzliche Rampe. Abholung sofort, Lieferung innerhalb von 6 Spielstunden. Vergütung: 650 €." },
  { id: "coordinated", label: "Späteren Empfang abstimmen", paymentCents: 57000, feeCents: 0, pickupDelay: 90, window: 600,
    detail: "Keine Vorleistung. Abholung in 90 Spielminuten, Lieferung innerhalb von 10 Spielstunden. Der Kunde zahlt dafür 570 €." },
];
export function harborOpeningAvailable(state) {
  if (!state || state.scenario?.status === "active" || state.world?.harborOpening) return false;
  const run = state.world?.stories?.harbor;
  return !state.world?.active || !!(run && run.stage === 0 && run.status === "decision" && !run.decisions?.length);
}
export function harborOpeningStartReason(state) {
  if (!harborOpeningAvailable(state)) return "Dieser Auftakt ist hier nicht mehr verfügbar. Deine bisherige Geschichte bleibt erhalten.";
  const suitable = (state.vehicles || []).some(v => !["sold", "archived"].includes(v.status) &&
    !["sold", "archived"].includes(v.ownership_type) && !v.markedForSale && v.condition >= 20 &&
    v.capacityTons >= 6 && checkBodyTypeCompatibility({ cargo: "Stückgut", tons: 6 }, v).ok);
  if (!suitable || !(state.drivers || []).some(isActivelyEmployed)) return "Für Annas Transporte brauchst du einen geeigneten eigenen Lkw für 6 t Stückgut und einen angestellten Fahrer.";
  return null;
}
export function harborOpeningActive(state) {
  const opening = state?.world?.harborOpening;
  return !!opening && opening.status !== "done";
}
function remember(state, key, title, text, kind = "story") {
  const w = state.world;
  const id = "harbor_opening_" + key;
  const entry = { id, atMin: state.gameTime, title, text, kind,
    cause: { storyId: "harbor", stage: 0, title: "Ein Versprechen am Kai", choice: "Annas Transport selbst übernehmen" } };
  w.chronicle.push(entry);
  if (w.chronicle.length > 180) w.chronicle = retainLatestHistory(state, "worldChronicle", w.chronicle, 180);
  return id;
}
function reputation(state, trust, relation, quality = 0) {
  const w = state.world;
  w.reputation.trust = Math.max(0, Math.min(100, w.reputation.trust + trust));
  w.reputation.quality = Math.max(0, Math.min(20, w.reputation.quality + quality));
  const anna = w.rivals.find(r => r.id === "hansen");
  if (anna) anna.relationship = Math.max(0, Math.min(100, anna.relationship + relation));
}
function makeOrder(state, id, fromCity, toCity, cargo, tons, paymentCents, pickupDelay, window) {
  const m = state.gameTime;
  const order = {
    id, harborOpening: true, customer: "Kontor am Anleger · Anna Hansen", fromCity, toCity, cargo, tons,
    paymentCents, acceptDeadlineMin: m, deliveryDeadlineMin: m + window,
    status: "angenommen", acceptedAtMin: m, startedAtMin: null, deliveredAtMin: null, paidCents: null,
    offerType: "normal", customerId: null, shipmentId: null, earliestPickupMin: m + pickupDelay,
    latestLoadStartMin: m + window - 180, publishedAtMin: m,
    paymentTermsDays: 0, paymentDueMin: null, relationFactor: 1, feasible: true, source: "world",
    acceptedById: "player", acceptedByName: state.private.playerName, plannedById: null, plannedByName: null,
    history: [{ type: "accepted", min: m, actor: "player", actorName: state.private.playerName }],
  };
  state.orders.push(order);
  return order;
}
export function startHarborOpening(state) {
  if (state.world?.harborOpening) return { ok: true, alreadyApplied: true };
  const reason = harborOpeningStartReason(state);
  if (reason) throw new Error(reason);
  state.world.harborOpening = {
    version: 1, status: "briefing", startedAtMin: state.gameTime, handover: null,
    outboundId: null, returnId: null, outboundResult: null, returnResult: null, feeCents: 0,
  };
  remember(state, "invitation", "Anna steht in deinem Büro",
    "Ihr Vater fällt aus. Ein Stammkunde in Bremen wartet auf sechs Tonnen Ersatzteile. Du hörst dir an, wie ihr die blockierte Warenannahme lösen könnt. Noch läuft keine Lieferfrist.");
  return { ok: true };
}
function resultOf(state, id) {
  const order = findOrder(state, id);
  if (!order) return null; // Never infer delivery or failure from a missing record.
  const delivered = order.status === "geliefert" && Number.isFinite(order.deliveredAtMin);
  const failed = ["storniert", "failed", "expired"].includes(order.status);
  if (!delivered && !failed) return null;
  const trip = state.trips.find(t => t.orderId === id && t.status === "completed");
  return {
    orderId: id, outcome: delivered ? (order.deliveredAtMin <= order.deliveryDeadlineMin ? "on_time" : "late") : "failed",
    deliveredAtMin: delivered ? order.deliveredAtMin : null, deadlineMin: order.deliveryDeadlineMin,
    paidCents: delivered ? (order.paidCents ?? 0) : 0,
    driverName: state.drivers.find(d => d.id === trip?.driverId)?.name || null,
    fromCity: order.fromCity, toCity: order.toCity,
  };
}
export function processHarborOpening(state) {
  const a = state.world?.harborOpening;
  if (!a || !["outbound", "return"].includes(a.status)) return;
  const outbound = a.status === "outbound";
  const result = resultOf(state, outbound ? a.outboundId : a.returnId);
  if (!result) return;
  if (outbound) {
    a.outboundResult = result;
    a.status = "debrief";
    reputation(state, result.outcome === "on_time" ? 3 : result.outcome === "late" ? -1 : -3,
      result.outcome === "on_time" ? 8 : result.outcome === "late" ? 2 : -4);
  } else {
    a.returnResult = result;
    a.status = "finale";
    reputation(state, result.outcome === "on_time" ? 2 : result.outcome === "late" ? -1 : -2,
      result.outcome === "on_time" ? 4 : 0, result.outcome === "on_time" ? 2 : 0);
  }
  remember(state, outbound ? "outbound_result" : "return_result",
    result.outcome === "on_time" ? (outbound ? "Dein Wort ist angekommen" : "Ein Kunde fragt wieder nach dir") :
      result.outcome === "late" ? "Die Lieferung kam später" : "Das Versprechen blieb offen",
    harborOpeningFeedback(a, outbound ? "outbound" : "return"), "consequence");
}
export function harborOpeningFeedback(a, leg = "outbound") {
  const r = leg === "outbound" ? a.outboundResult : a.returnResult;
  if (!r) return "";
  const driver = r.driverName ? r.driverName + " hat sich nach der Tour gemeldet. " : "";
  if (leg === "outbound") {
    if (r.outcome === "on_time") return driver + "Anna: „Der Kunde hat die Teile rechtzeitig bekommen. Mein Vater hat zum ersten Mal heute gelächelt. In Bremen steht noch eine Ladung für Hamburg. Soll ich ihm sagen, dass er wieder auf dich zählen kann?“";
    if (r.outcome === "late") return driver + "Anna: „Die Teile sind da, aber der Kunde musste warten. Ich habe ihm nichts vorgemacht. Die Rückladung wäre eine zweite Chance, zuverlässig zu liefern.“";
    return "Anna: „Die Teile sind nicht angekommen. Ich kümmere mich um eine andere Lösung. Lass uns erst klären, was deine Firma wirklich leisten kann.“";
  }
  if (r.outcome === "on_time") return driver + "Anna: „Auch die Rückladung ist pünktlich da. Der Kunde hat ausdrücklich nach deiner Firma gefragt.“ Malte von NordSprint hat es mitbekommen. Beim nächsten Gespräch am Kai geht es um seinen Kampfpreis.";
  if (r.outcome === "late") return driver + "Anna: „Die Rückladung ist da. Für regelmäßige Aufträge müssen unsere Zeiten verlässlicher werden. Maltes günstiges Angebot liegt beim Kunden weiterhin auf dem Tisch.“";
  return "Anna: „Bei der Rückladung hat es nicht geklappt. Der Kunde schaut sich wieder um. Wir können weiterreden, aber Vertrauen entsteht auf der Straße.“";
}
export function handleHarborOpeningCommand(state, command, p) {
  const a = state.world?.harborOpening;
  if (command === "startHarborOpening") return startHarborOpening(state);
  if (!HARBOR_OPENING_COMMANDS.includes(command)) return null;
  if (!a) throw new Error("Sprich zuerst mit Anna im Büro.");
  if (command === "chooseHarborHandover") {
    const choice = HARBOR_HANDOVERS.find(c => c.id === p.choiceId);
    if (!choice) throw new Error("Diese Übergabe gibt es nicht.");
    if (a.handover) {
      if (a.handover === choice.id) return { ok: true, alreadyApplied: true, orderId: a.outboundId };
      throw new Error("Die Übergabe ist bereits vereinbart.");
    }
    if (a.status !== "briefing") throw new Error("Die Übergabe kann jetzt nicht mehr gewählt werden.");
    if (state.company.accountCents < choice.feeCents) throw new Error("Das Firmenkonto reicht für die zusätzliche Rampe nicht. Die abgestimmte Übergabe benötigt keine Vorleistung.");
    if (choice.feeCents) addBooking(state, state.gameTime, "Zusätzliche Rampe für Annas Transport", -choice.feeCents, "company", "harbor_opening_ramp");
    a.handover = choice.id; a.feeCents = choice.feeCents;
    a.outboundId = "harbor_opening_outbound";
    makeOrder(state, a.outboundId, "Hamburg", "Bremen", "Stückgut · Ersatzteile für die Warenannahme", 6,
      choice.paymentCents, choice.pickupDelay, choice.window);
    a.status = "outbound";
    remember(state, "handover", choice.label, choice.detail + " Der Auftrag ist angenommen und wartet in der Disposition.", "decision");
    return { ok: true, orderId: a.outboundId };
  }
  if (command === "acceptHarborReturn") {
    if (a.returnId) return { ok: true, alreadyApplied: true, orderId: a.returnId };
    if (a.status !== "debrief" || !a.outboundResult || a.outboundResult.outcome === "failed") throw new Error("Anna kann dir gerade keine Rückladung anbieten.");
    a.returnId = "harbor_opening_return";
    makeOrder(state, a.returnId, "Bremen", "Hamburg", "Stückgut · Material für Annas Werkstatt", 4, 72000, 0, 720);
    a.status = "return";
    remember(state, "return", "Anna empfiehlt dich weiter", "Du übernimmst vier Tonnen von Bremen nach Hamburg. 720 € Vergütung, zwölf Spielstunden Lieferzeit ab deiner Zusage.", "decision");
    return { ok: true, orderId: a.returnId };
  }
  if (a.status === "done") return { ok: true, alreadyApplied: true };
  if (!["briefing", "debrief", "finale"].includes(a.status)) throw new Error("Der zugesagte Transport ist noch offen. Liefere ihn aus oder storniere ihn in der Auftragsverwaltung.");
  // Leaving the briefing creates no decision, cost or deadline.
  if (a.status === "briefing") {
    a.status = "done"; a.ending = "Anna kümmert sich zunächst selbst um den Transport. Du hast noch nichts zugesagt.";
    remember(state, "declined", "Ein ehrliches Vielleicht", a.ending, "decision");
    return { ok: true };
  }
  const run = state.world.stories.harbor;
  const kept = a.outboundResult?.outcome === "on_time";
  const choiceId = kept ? "help" : "listen";
  a.status = "done"; a.completedAtMin = state.gameTime;
  a.ending = a.returnResult ? harborOpeningFeedback(a, "return") : kept
    ? "Du hast Anna bei der ersten Lieferung geholfen und die Rückladung anderen überlassen. Dein gehaltenes Wort bleibt."
    : "Anna kennt jetzt deine Möglichkeiten. Ihr sprecht am Kai weiter, ohne einen Erfolg vorzutäuschen.";
  const eventId = remember(state, "finished", "Am Kai geht es weiter", a.ending, "consequence");
  if (run.stage === 0 && !run.decisions.length) {
    run.decisions.push({ stage: 0, choiceId, atMin: state.gameTime, eventId });
    run.stage = 1; run.status = "decision"; run.pending = null; run.dueMin = null;
  }
  if (state.onboarding && a.outboundResult?.outcome !== "failed") state.onboarding.reviewedDelivery = true;
  return { ok: true };
}
