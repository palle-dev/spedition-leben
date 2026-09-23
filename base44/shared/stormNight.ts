import { findOrder } from "./orderLookup.ts";
import { checkBodyTypeCompatibility } from "./gameRules.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { independentRival } from "./competitionCore.ts";
import { retainLatestHistory } from "./historyRetention.ts";

export const STORM_COMMANDS = ["startStormNight", "finishStormNight"];
export const STORM_JOBS = [
  { key: "own", title: "Dein Kunde wartet", customer: "Kontor am Anleger · Sturmnacht", cargo: "Stückgut · Ersatzteile", tons: 6, paymentCents: 95000, windowMin: 360 },
  { key: "anna", title: "Annas Hilfslieferung", customer: "Hansen & Tochter · Sturmnacht", cargo: "Stückgut · Pumpenzubehör", tons: 6, paymentCents: 42000, windowMin: 270 },
];
export const STORM_CHOICES = [
  { id: "own", label: "Die eigene Lieferung sichern", jobs: ["own"], detail: "950 € Umsatz bei pünktlicher Lieferung. Du sagst Anna offen ab und hältst deine Kapazität für den eigenen Kunden frei." },
  { id: "anna", label: "Anna die Notfahrt zusagen", jobs: ["anna"], detail: "420 € Umsatz bei pünktlicher Lieferung. Du überlässt den eigenen Auftrag einem anderen Betrieb und hilfst Anna." },
  { id: "both", label: "Zwei Teams in die Nacht schicken", jobs: ["own", "anna"], detail: "Zwei verbindliche Aufträge, zusammen 1.370 € Umsatz bei pünktlicher Lieferung. Du brauchst zwei geeignete Lkw und zwei Fahrer. Beide Fristen laufen gleichzeitig." },
];
const clamp = n => Math.max(0, Math.min(100, n));
export function stormNightAvailable(state) {
  const run = state?.world?.stories?.harbor;
  return !!state?.world?.active && state.scenario?.status !== "active" && !state.world.stormNight &&
    run?.stage === 2 && run.status === "decision" && !run.decisions?.some(d => d.stage === 2) &&
    independentRival(state.world.rivals.find(r => r.id === "hansen"));
}
export function stormNightActive(state) { return !!state?.world?.stormNight && state.world.stormNight.status !== "done"; }
export function stormNightPickup(state) {
  const tonight = Math.floor(state.gameTime / 1440) * 1440 + 1200;
  return tonight > state.gameTime ? tonight : tonight + 1440;
}
export function stormNightStartReason(state, choiceId) {
  if (!stormNightAvailable(state)) return "Diese Sturmnacht ist hier nicht mehr verfügbar. Deine bisherigen Entscheidungen bleiben erhalten.";
  const choice = STORM_CHOICES.find(c => c.id === choiceId);
  if (!choice) return "Wähle eine der angebotenen Zusagen.";
  const needed = choice.jobs.length;
  const trucks = (state.vehicles || []).filter(v => !["sold", "archived"].includes(v.status) &&
    !["sold", "archived"].includes(v.ownership_type) && !v.markedForSale && v.condition >= 20 &&
    v.capacityTons >= 6 && checkBodyTypeCompatibility({ cargo: "Stückgut", tons: 6 }, v).ok);
  if (trucks.length < needed || (state.drivers || []).filter(isActivelyEmployed).length < needed)
    return needed === 2 ? "Für beide Zusagen brauchst du zwei geeignete Lkw für je 6 t und zwei angestellte Fahrer." :
      "Du brauchst einen geeigneten Lkw für 6 t Stückgut und einen angestellten Fahrer.";
  return null;
}
function remember(state, key, title, text) {
  const id = "storm_night_" + key;
  state.world.chronicle.push({ id, atMin: state.gameTime, title, text, kind: key === "start" ? "decision" : "consequence",
    cause: { storyId: "harbor", stage: 2, title: "Die Nacht am Kai", choice: STORM_CHOICES.find(c => c.id === state.world.stormNight.choiceId)?.label } });
  if (state.world.chronicle.length > 180) state.world.chronicle = retainLatestHistory(state, "worldChronicle", state.world.chronicle, 180);
  return id;
}
function addOrder(state, job, pickup) {
  const m = state.gameTime, id = "storm_night_" + job.key;
  state.orders.push({ id, stormNight: true, customer: job.customer, fromCity: "Hamburg", toCity: "Bremen",
    cargo: job.cargo, tons: job.tons, paymentCents: job.paymentCents,
    acceptDeadlineMin: m, deliveryDeadlineMin: pickup + job.windowMin, earliestPickupMin: pickup,
    latestLoadStartMin: pickup + job.windowMin - 180, publishedAtMin: m,
    status: "angenommen", acceptedAtMin: m, startedAtMin: null, deliveredAtMin: null, paidCents: null,
    offerType: "normal", customerId: null, shipmentId: null, paymentTermsDays: 0, paymentDueMin: null,
    relationFactor: 1, feasible: true, source: "world", acceptedById: "player", acceptedByName: state.private.playerName,
    plannedById: null, plannedByName: null,
    history: [{ type: "accepted", min: m, actor: "player", actorName: state.private.playerName }] });
  return id;
}
export function stormNightFeedback(a) {
  if (!a || a.status === "running") return "";
  const anna = a.results.anna, own = a.results.own;
  const lines = [];
  if (anna) lines.push(anna.outcome === "on_time"
    ? "Anna: „Das Pumpenzubehör ist rechtzeitig da. Heute Nacht warst du für uns da. Das vergesse ich nicht.“"
    : anna.outcome === "late" ? "Anna: „Die Ware ist da, aber das Notfallfenster ist vorbei. Wir mussten umplanen.“"
    : "Anna: „Deine zugesagte Notfahrt kam nicht an. Wir müssen unsere Hilfe anders organisieren.“");
  else lines.push("Anna: „Du hast mir rechtzeitig gesagt, dass du deinen eigenen Kunden versorgst. Ich suche eine andere Lösung.“");
  if (own) lines.push(own.outcome === "on_time"
    ? "Dein Kunde bestätigt die pünktliche Lieferung trotz der gesperrten Hafenrampe."
    : own.outcome === "late" ? "Dein Kunde hat die Ersatzteile verspätet erhalten. Der Auftrag wurde mit Abschlag abgerechnet."
    : "Die zugesagte Lieferung an deinen eigenen Kunden blieb aus.");
  else lines.push("Den eigenen Auftrag hast du vor einer Zusage einem anderen Betrieb überlassen; dafür entsteht kein Umsatz.");
  return lines.join(" ");
}
export function processStormNight(state) {
  const a = state.world?.stormNight;
  if (!a || a.status !== "running") return;
  for (const job of a.jobs) {
    if (a.results[job.key]) continue;
    const o = findOrder(state, job.orderId);
    if (!o) continue;
    const delivered = o.status === "geliefert" && Number.isFinite(o.deliveredAtMin);
    if (!delivered && !["storniert", "failed", "expired"].includes(o.status)) continue;
    const outcome = delivered ? (o.deliveredAtMin <= o.deliveryDeadlineMin ? "on_time" : "late") : "failed";
    const trust = outcome === "on_time" ? (job.key === "anna" ? 5 : 3) : outcome === "late" ? -3 : -5;
    const relation = job.key !== "anna" ? 0 : outcome === "on_time" ? 10 : outcome === "late" ? -4 : -8;
    const w = state.world, anna = w.rivals.find(r => r.id === "hansen");
    const oldTrust = w.reputation.trust, oldRelation = anna?.relationship || 0;
    w.reputation.trust = clamp(oldTrust + trust);
    if (anna) anna.relationship = clamp(oldRelation + relation);
    const trip = state.trips.find(t => t.orderId === o.id && t.status === "completed");
    a.results[job.key] = { orderId: o.id, title: job.title, outcome, fromCity: o.fromCity, toCity: o.toCity,
      deliveredAtMin: delivered ? o.deliveredAtMin : null, deadlineMin: o.deliveryDeadlineMin,
      paidCents: delivered ? (o.paidCents ?? 0) : 0, driverName: state.drivers.find(d => d.id === trip?.driverId)?.name || null,
      reputationDelta: w.reputation.trust - oldTrust, relationDelta: anna ? anna.relationship - oldRelation : 0 };
    remember(state, job.key, outcome === "on_time" ? "Eine Zusage hält dem Sturm stand" : "Die Nacht verlangt ihren Preis",
      job.title + ": " + (outcome === "on_time" ? "pünktlich geliefert." : outcome === "late" ? "verspätet geliefert." : "nicht geliefert."));
  }
  if (a.jobs.every(j => a.results[j.key])) { a.status = "debrief"; a.ending = stormNightFeedback(a); }
}
export function handleStormNightCommand(state, command, p) {
  if (!STORM_COMMANDS.includes(command)) return null;
  let a = state.world?.stormNight;
  if (command === "startStormNight") {
    const choice = STORM_CHOICES.find(c => c.id === p.choiceId);
    if (!choice) throw new Error("Diese Zusage gibt es nicht.");
    if (a) {
      if (a.choiceId === choice.id) return { ok: true, alreadyApplied: true, orderIds: a.jobs.map(j => j.orderId) };
      throw new Error("Deine Zusagen für diese Nacht stehen bereits fest.");
    }
    const reason = stormNightStartReason(state, choice.id);
    if (reason) throw new Error(reason);
    const pickup = stormNightPickup(state);
    a = state.world.stormNight = { version: 1, status: "running", choiceId: choice.id,
      startedAtMin: state.gameTime, pickupMin: pickup, jobs: [], results: {}, ending: null };
    a.jobs = STORM_JOBS.filter(j => choice.jobs.includes(j.key)).map(job => ({ ...job, orderId: addOrder(state, job, pickup), deadlineMin: pickup + job.windowMin }));
    remember(state, "start", choice.label, choice.detail + " Die zugesagten Aufträge sind verbindlich. Die Hafenrampe öffnet um 20:00.");
    return { ok: true, orderIds: a.jobs.map(j => j.orderId) };
  }
  if (!a) throw new Error("Entscheide zuerst, welche Lieferung du in dieser Nacht zusagst.");
  if (a.status === "done") return { ok: true, alreadyApplied: true };
  if (a.status !== "debrief") throw new Error("Mindestens eine zugesagte Lieferung ist noch offen. Liefere sie aus oder storniere sie in der Auftragsverwaltung.");
  const run = state.world.stories.harbor;
  if (run.stage !== 2 || run.status !== "decision" || run.decisions.some(d => d.stage === 2)) throw new Error("Dieses Kapitel wurde bereits entschieden.");
  a.status = "done"; a.completedAtMin = state.gameTime;
  const eventId = remember(state, "finished", "Der Morgen nach dem Sturm", a.ending);
  run.decisions.push({ stage: 2, choiceId: a.choiceId === "own" ? "protect" : "network", atMin: state.gameTime, eventId });
  run.stage = 3; run.status = "decision"; run.pending = null; run.dueMin = null;
  return { ok: true };
}
