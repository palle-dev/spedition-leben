import { STORM_COMMANDS, stormNightActive, handleStormNightCommand, processStormNight } from "./stormNight.ts";
import { NORDSPRINT_COMMANDS, nordSprintActive, handleNordSprintCommand, processNordSprintChallenge } from "./nordSprintChallenge.ts";
import { HARBOR_OPENING_COMMANDS, harborOpeningActive, harborOpeningStartReason, handleHarborOpeningCommand, processHarborOpening } from "./harborOpening.ts";
import { migrateCompetition, independentRival, rivalCapacity, competitionDaily } from "./competitionCore.ts";
import { processCompetition } from "./competitionDeals.ts";
import { ENCOUNTER_ID, prepareEncounter, cycleEncounter, encounterActorPresent, rememberEncounter } from "./worldEncounters.ts";
import { RIVAL_ID } from "./worldRivalStory.ts";
import { HOME_ID } from "./worldHomeStory.ts";
import { TEAM_ID } from "./worldTeamStory.ts";
import { ensureWorldContinuation, CONTINUATION_ID } from "./worldContinuation.ts";
import { retainHistory } from "./historyRetention.ts";
import { retainLatestHistory } from "./historyRetention.ts";
import { addBooking } from "./accountingEngine.ts";
import { getDistance, checkBodyTypeCompatibility } from "./gameRules.ts";
import { isActivelyEmployed } from "./terminationEngine.ts";
import { WORLD_DAY, WORLD_RIVALS, WORLD_STORIES, WORLD_BIDS, worldScene } from "./worldCatalog.ts";
import { recordTenderResult } from "./rivalBehaviorEngine.ts";

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const activeDriver = d => isActivelyEmployed(d) && !d.isTempStaff;
const hasPartner = state => !!state.private.partnerName && !["single", "separated", "divorced"].includes(state.private.relationshipStatus);
const partnerKey = state => String(state.private.partnerId || "partner_existing");

// Old saves acquire no running deadlines, costs or historical events.
export function migrateWorld(state) {
  if (!state.world) state.world = { version: 1, active: false };
  ensureWorldContinuation(state);
}
function rng(w) {
  w.seed = (Math.imul(w.seed, 1664525) + 1013904223) >>> 0;
  return w.seed / 4294967296;
}
function note(state, title, text, cause = null, kind = "world") {
  const w = state.world;
  const item = { id: "world_event_" + (++w.sequence), atMin: state.gameTime, title, text, cause, kind };
  w.chronicle.push(item);
  if (w.chronicle.length > 180) w.chronicle = retainLatestHistory(state, "worldChronicle", w.chronicle, 180);
  return item.id;
}
function effect(state, run, e: any = {}) {
  const w = state.world;
  for (const key of ["trust", "quality", "price"]) if (e[key]) w.reputation[key] = clamp(w.reputation[key] + e[key], 0, key === "trust" ? 100 : 20);
  for (const [id, delta] of Object.entries(e.relations || {})) {
    const rival = w.rivals.find(r => r.id === id);
    if (rival) rival.relationship = clamp(rival.relationship + Number(delta));
  }
  for (const key of ["stress", "happiness"]) if (e[key]) state.private[key] = clamp((state.private[key] || 0) + e[key]);
  if (e.relationship && hasPartner(state) && run?.actorId === partnerKey(state)) state.private.relationship = clamp(state.private.relationship + e.relationship);
  if (e.driver && run?.actorId) {
    const d = state.drivers.find(p => p.id === run.actorId && activeDriver(p));
    if (d) {
      d.satisfaction = clamp((d.satisfaction ?? 70) + e.driver);
      d.satisfactionReasons = retainHistory(state, "driverSatisfaction", d.satisfactionReasons, [...(d.satisfactionReasons || []), { reason: "Spielwelt: " + run.actorName, delta: e.driver, atMin: state.gameTime }].slice(-20), d.id);
    }
  }
  if (e.friend) {
    w.friend.quality = clamp(w.friend.quality + e.friend);
    state.stats.friendshipQualities = state.stats.friendshipQualities || {};
    state.stats.friendshipQualities[w.friend.id] = w.friend.quality;
  }
}
function startWorld(state) {
  migrateWorld(state);
  if (state.world.active) return { ok: true, alreadyApplied: true };
  if (state.scenario?.status === "active") throw new Error("Die Spielwelt beginnt nach dem Szenario, sobald du im freien Spiel weitermachst.");
  state.world = {
    version: 1, active: true, startedAtMin: state.gameTime, seed: 7319501, sequence: 0,
    nextEconomyMin: state.gameTime + WORLD_DAY, nextTenderMin: state.gameTime,
    reputation: { trust: 70, quality: 0, price: 0 }, identity: null,
    rivals: WORLD_RIVALS.map(r => ({ ...r, relationship: 45, jobs: [], wins: 0, completed: 0, lastDayNetCents: 0 })),
    friend: { id: "world_jens", name: "Jens", quality: state.stats.friendshipQualities?.world_jens ?? 35 },
    stories: Object.fromEntries(WORLD_STORIES.map(s => [s.id, {
      id: s.id, stage: 0, status: "locked", availableAtMin: [CONTINUATION_ID, TEAM_ID, HOME_ID, RIVAL_ID, ENCOUNTER_ID].includes(s.id) ? null : state.gameTime + s.unlockDays * WORLD_DAY,
      decisions: [], actorId: null, actorName: null, pending: null, dueMin: null,
    }])),
    tenders: [], chronicle: [],
  };
  note(state, "Willkommen am Kai", "Hansen & Tochter, NordSprint und HanseCargo konkurrieren mit dir um regionale Transporte. Geschichten warten auf deine Entscheidung; nur Ausschreibungen haben feste Gebotsfristen.");
  processWorld(state, state.gameTime);
  return { ok: true };
}
function unlockStories(state, m) {
  const w = state.world;
  for (const run of Object.values(w.stories) as any[]) {
    if (run.status !== "locked" || run.availableAtMin == null || run.availableAtMin > m) continue;
    if (run.id === "driver") {
      const d = state.drivers.filter(activeDriver).sort((a, b) => (a.employedDay || 0) - (b.employedDay || 0) || String(a.id).localeCompare(String(b.id)))[0];
      if (!d) continue;
      run.actorId = d.id; run.actorName = d.name;
    }
    if (run.id === "home") {
      if (!hasPartner(state)) continue;
      run.actorId = partnerKey(state); run.actorName = state.private.partnerName;
    }
    if (run.id === ENCOUNTER_ID && !prepareEncounter(state, run, m)) continue;
    run.status = "decision";
    note(state, worldScene(state, run).title, WORLD_STORIES.find(s => s.id === run.id).subtitle, null, "story");
  }
}
function actorPresent(state, run) {
  if (run.id === ENCOUNTER_ID) return encounterActorPresent(state, run);
  if (run.id === "driver" || run.id === TEAM_ID) return state.drivers.some(d => d.id === run.actorId && activeDriver(d));
  if (run.id === "home" || run.id === HOME_ID) return hasPartner(state) && run.actorId === partnerKey(state);
  return true;
}
export function worldAppointmentSlot(state) {
  const first = Math.floor(state.gameTime / WORLD_DAY) * WORLD_DAY + WORLD_DAY + 18 * 60;
  for (let day = 0; day < 14; day++) {
    const startMin = first + day * WORLD_DAY, endMin = startMin + 120;
    if (!(state.appointments || []).some(a => ["pending", "accepted", "active"].includes(a.status) && a.startMin < endMin && a.endMin > startMin)) return { startMin, endMin };
  }
  return null;
}
export function worldChoiceReason(state, run, choice) {
  if (run.id === "harbor" && run.stage === 2 && stormNightActive(state)) return "Deine Notfallschicht läuft bereits. Setze sie im Büro fort.";
  if (run.id === "harbor" && run.stage === 1 && nordSprintActive(state)) return "Dein Probelauf gegen NordSprint läuft bereits. Setze ihn im Büro fort.";
  if (run.id === "harbor" && run.stage === 0 && harborOpeningActive(state)) return "Dein Transport mit Anna läuft bereits. Setze ihn im Büro fort.";
  if (!actorPresent(state, run)) return "Die beteiligte Person ist nicht mehr verfügbar.";
  if (choice.requiresHansen && state.world.rivals.find(r => r.id === "hansen").relationship < choice.requiresHansen) return "Hansen vertraut dir noch nicht genug (mindestens " + choice.requiresHansen + ").";
  if (choice.costCents > state[choice.account].accountCents) return choice.account === "private" ? "Das Privatkonto reicht dafür nicht." : "Das Firmenkonto reicht dafür nicht.";
  if (choice.appointment && !worldAppointmentSlot(state)) return "In den kommenden 14 Tagen ist kein gemeinsamer Abend frei.";
  return null;
}
function chooseStory(state, p) {
  const run = state.world.stories[p.storyId];
  if (!run || !Number.isInteger(p.stage)) throw new Error("Geschichte oder Kapitel fehlt.");
  if (run.id === ENCOUNTER_ID && (!Number.isSafeInteger(p.episode) || p.episode !== run.episode)) throw new Error("Diese Begegnung ist nicht mehr aktuell. Bitte die Spielwelt neu öffnen.");
  const previous = run.decisions.find(d => d.stage === p.stage);
  if (previous) {
    if (previous.choiceId === p.choiceId) return { ok: true, alreadyApplied: true };
    throw new Error("Dieses Kapitel ist bereits entschieden.");
  }
  if (run.status !== "decision" || run.stage !== p.stage) throw new Error("Dieses Kapitel wartet derzeit nicht auf eine Entscheidung.");
  const scene = worldScene(state, run);
  const choice = scene.choices.find(c => c.id === p.choiceId);
  if (!choice) throw new Error("Diese Entscheidung gibt es nicht.");
  const reason = worldChoiceReason(state, run, choice);
  if (reason) throw new Error(reason);
  const slot = choice.appointment ? worldAppointmentSlot(state) : null;
  const refId = "world_story_" + run.id + "_" + run.stage + (run.id === ENCOUNTER_ID ? "_" + run.episode : "");
  if (choice.costCents) addBooking(state, state.gameTime, "Spielwelt: " + scene.title, -choice.costCents, choice.account, refId);
  effect(state, run, choice.effect);
  const cause = { storyId: run.id, stage: run.stage, ...(run.id === ENCOUNTER_ID ? { episode: run.episode } : {}), title: scene.title, choice: choice.label };
  const eventId = note(state, choice.label, choice.detail, cause, "decision");
  run.decisions.push({ stage: run.stage, choiceId: choice.id, atMin: state.gameTime, eventId });
  run.pending = { ...choice.delayed, cause };
  if (run.id === ENCOUNTER_ID) rememberEncounter(state, run, choice);
  if (slot) {
    run.appointmentId = refId + "_appointment";
    state.appointments.push({
      id: run.appointmentId, type: "world_story", text: ["home", HOME_ID].includes(run.id) ? "Gemeinsamer Abend mit " + run.actorName : "Mit Jens am alten Anleger",
      ...slot, appearMin: state.gameTime, decisionDeadline: slot.startMin, status: "accepted",
      costCents: 0, costApplied: true, effectsApplied: false, worldStoryId: run.id,
    });
    run.status = "appointment"; run.dueMin = slot.endMin;
  } else {
    run.status = "waiting"; run.dueMin = state.gameTime + ([CONTINUATION_ID, TEAM_ID, HOME_ID, RIVAL_ID].includes(run.id) ? 3 : 2) * WORLD_DAY;
  }
  return { ok: true, appointmentId: run.appointmentId || null };
}
function processStories(state, m) {
  const w = state.world;
  unlockStories(state, m);
  for (const run of Object.values(w.stories) as any[]) {
    if (run.status === "done" || (run.status === "locked" && !([TEAM_ID, HOME_ID].includes(run.id) && run.actorId && !actorPresent(state, run)))) continue;
    if (!actorPresent(state, run)) {
      const ap = state.appointments.find(a => a.id === run.appointmentId);
      if (ap && ["accepted", "active"].includes(ap.status)) ap.status = "cancelled";
      run.status = "done"; run.dueMin = null; run.ending = "Die Wege haben sich getrennt. Die bisherigen Entscheidungen bleiben in der Chronik.";
      note(state, "Eine Geschichte endet anders", run.actorName + " ist nicht mehr Teil dieser Konstellation. Es entstehen keine weiteren Folgen oder Termine.", run.pending?.cause, "story");
      run.pending = null;
      continue;
    }
    if (run.id === "home" || run.id === HOME_ID) run.actorName = state.private.partnerName;
    if (run.id === "driver" || run.id === TEAM_ID) run.actorName = state.drivers.find(d => d.id === run.actorId).name;
    if (run.status === "appointment") {
      const ap = state.appointments.find(a => a.id === run.appointmentId);
      if (ap && ["accepted", "active"].includes(ap.status) && m < ap.endMin) continue;
      // Normal scheduler marks the calendar entry done before this hook.
      if (run.id === HOME_ID) run.lastAppointmentOutcome = ap?.status === "done" ? "attended" : "missed";
      if (ap?.status === "done") {
        effect(state, run, ["home", HOME_ID].includes(run.id) ? { relationship: 8, stress: -8 } : { friend: 12, stress: -6 });
        state.stats.promisesKept = (state.stats.promisesKept || 0) + 1;
        note(state, "Zeit, die du dir genommen hast", ap.text + ". Der Termin hat stattgefunden.", run.pending.cause, "consequence");
      } else {
        run.pending = { cause: run.pending.cause, text: "Der versprochene Termin hat nicht stattgefunden. Die positive Nachwirkung entfällt.", effect: ["home", HOME_ID].includes(run.id) ? { relationship: -3 } : { friend: -3 } };
      }
      run.status = "waiting"; run.dueMin = m + ([CONTINUATION_ID, TEAM_ID, HOME_ID, RIVAL_ID].includes(run.id) ? 3 : 2) * WORLD_DAY;
    }
    if (run.status === "waiting" && run.dueMin <= m) {
      effect(state, run, run.pending.effect);
      note(state, "Was daraus geworden ist", run.pending.text, run.pending.cause, "consequence");
      if (run.pending.identity) w.identity = run.pending.identity;
      if (run.id === ENCOUNTER_ID || (run.id === CONTINUATION_ID && run.stage === 4) || ([TEAM_ID, HOME_ID, RIVAL_ID].includes(run.id) && run.stage === 3)) run.ending = run.pending.text;
      run.stage++; run.pending = null; run.dueMin = null;
      if (run.stage >= WORLD_STORIES.find(s => s.id === run.id).chapters) {
        run.status = "done";
        run.ending = run.ending || (run.id === "harbor" ? w.identity : "Abgeschlossen – eure Entscheidungen bleiben Teil der Spielwelt.");
      } else {
        run.status = "decision";
        note(state, worldScene(state, run).title, "Das nächste Kapitel ist bereit. Du entscheidest, wann du es angehst.", null, "story");
      }
    }
  }
}
function tenderScore(percent, reliability, quality = 0, price = 0) {
  return Math.round((clamp(130 - percent, 0, 70) * 0.65 + reliability * 0.35 + quality * 0.6 + price * 0.6) * 100) / 100;
}
function makeTenderBatch(state, m) {
  const w = state.world;
  const batch = Math.floor((m - w.startedAtMin) / (3 * WORLD_DAY));
  const origin = state.branches.find(b => b.status !== "closed")?.city || "Hamburg";
  const destinations = ["Bremen", "Kiel", "Hannover", "Lübeck", "Rostock"];
  for (let i = 0; i < 2; i++) {
    let toCity = destinations[(batch * 2 + i) % destinations.length];
    if (toCity === origin) toCity = "Hamburg" === origin ? "Berlin" : "Hamburg";
    const baseCents = 45000 + getDistance(origin, toCity) * 300;
    const costCents = Math.round(baseCents * 0.64);
    const t = {
      id: "world_tender_" + batch + "_" + i, title: ["Versorgung am Kai", "Handel zwischen den Deichen"][i],
      customer: ["Kontor am Anleger", "Deichland Handel"][i], fromCity: origin, toCity, tons: 6 + 2 * i,
      cargo: "Stückgut", baseCents, costCents, publishedAtMin: m, closeMin: m + WORLD_DAY,
      deliveryDeadlineMin: m + 5 * WORLD_DAY, status: "open", bid: null, winnerId: null, orderId: null,
      offers: w.rivals.filter(r => independentRival(r) && r.cashCents >= costCents && r.jobs.length < rivalCapacity(r)).map(r => {
        const percent = r.pricePercent + Math.floor(rng(w) * 7) - 3;
        return { rivalId: r.id, percent, paymentCents: Math.round(baseCents * percent / 100), score: tenderScore(percent, r.reliability) };
      }),
    };
    w.tenders.push(t);
  }
  // Keep all unfinished awards, and a bounded recent result history.
  const protectedIds = new Set(w.tenders.filter(t => t.status === "open" || (t.orderId && !t.outcome)).map(t => t.id));
  const recent = new Set(w.tenders.slice(-24).map(t => t.id));
  w.tenders = w.tenders.filter(t => protectedIds.has(t.id) || recent.has(t.id));
  w.nextTenderMin = m + 3 * WORLD_DAY;
}
function playerCapacity(state) {
  const vehicles = state.vehicles.filter(v => !["sold", "archived"].includes(v.status) && v.capacityTons >= 8 && v.condition >= 20 && checkBodyTypeCompatibility({ cargo: "Stückgut", tons: 8 }, v).ok).length;
  const drivers = state.drivers.filter(activeDriver).length;
  return Math.min(vehicles, drivers);
}
export function worldBidReason(state, tender) {
  if (tender.status !== "open" || state.gameTime >= tender.closeMin) return "Die Gebotsfrist ist abgelaufen.";
  const booked = state.world.tenders.filter(t => t.id !== tender.id && ((t.status === "open" && t.bid) || (t.orderId && !t.outcome))).length;
  if (booked >= playerCapacity(state)) return "Für weitere Spielwelt-Gebote fehlen eigene Fahrer oder geeignete Lkw (mindestens 8 t).";
  return null;
}
function bid(state, p) {
  const t = state.world.tenders.find(t => t.id === p.tenderId);
  if (!t) throw new Error("Ausschreibung nicht gefunden.");
  const offer = WORLD_BIDS.find(b => b.id === p.bidId);
  if (!offer) throw new Error("Unbekannte Kalkulation.");
  const reason = worldBidReason(state, t);
  if (reason) throw new Error(reason);
  if (t.bid?.id === offer.id) return { ok: true, alreadyApplied: true };
  t.bid = { id: offer.id, percent: offer.percent, paymentCents: Math.round(t.baseCents * offer.percent / 100), atMin: state.gameTime };
  return { ok: true };
}
function award(state, t, m) {
  const w = state.world;
  const offers = t.offers.filter(o => {
    const r = w.rivals.find(r => r.id === o.rivalId);
    return independentRival(r) && r.cashCents >= t.costCents && r.jobs.length < rivalCapacity(r);
  }).map(o => ({ ...o, id: o.rivalId }));
  const committed = w.tenders.filter(other => other.orderId && !other.outcome).length;
  if (t.bid && playerCapacity(state) > committed) offers.push({
    ...t.bid, id: "player", score: tenderScore(t.bid.percent, w.reputation.trust, w.reputation.quality, w.reputation.price),
  });
  offers.sort((a, b) => b.score - a.score || a.paymentCents - b.paymentCents || a.id.localeCompare(b.id));
  const winner = offers[0];
  t.status = "resolved"; t.winnerId = winner?.id || null;
  t.results = offers.map(o => ({ id: o.id, score: o.score, paymentCents: o.paymentCents }));
  recordTenderResult(state, winner?.id || "unassigned", offers.filter(o => o.id !== winner?.id && o.id !== "player").map(o => o.id));
  if (!winner) { t.outcome = "unassigned"; return; }
  if (winner.id === "player") {
    const id = t.id + "_order";
    state.orders.push({
      id, worldTenderId: t.id, customer: t.customer, fromCity: t.fromCity, toCity: t.toCity, cargo: t.cargo, tons: t.tons,
      paymentCents: t.bid.paymentCents, acceptDeadlineMin: m, deliveryDeadlineMin: t.deliveryDeadlineMin,
      status: "angenommen", acceptedAtMin: m, startedAtMin: null, deliveredAtMin: null, paidCents: null,
      offerType: "normal", customerId: null, shipmentId: null, earliestPickupMin: m,
      latestLoadStartMin: t.deliveryDeadlineMin - 12 * 60, publishedAtMin: m,
      paymentTermsDays: 0, paymentDueMin: null, relationFactor: 1, feasible: true, source: "world",
      acceptedById: "player", acceptedByName: state.private.playerName, plannedById: null, plannedByName: null,
      history: [{ type: "accepted", min: m, actor: "player", actorName: state.private.playerName }],
    });
    t.orderId = id;
    note(state, "Zuschlag: " + t.title, t.fromCity + " → " + t.toCity + ". Der verbindliche Auftrag wartet in der Disposition. Dein Gebot und dein Ruf haben den Zuschlag bestimmt.", null, "competition");
  } else {
    const rival = w.rivals.find(r => r.id === winner.id);
    rival.cashCents -= t.costCents;
    rival.jobs.push({ tenderId: t.id, endMin: m + 2 * WORLD_DAY, paymentCents: winner.paymentCents });
    rival.wins++;
    t.outcome = "rival";
    note(state, rival.name + " erhält den Zuschlag", t.title + ": " + (t.bid ? "Dein Angebot lag in der Gesamtwertung zurück." : "Du hast kein Angebot abgegeben.") + " Eine Transportkapazität und die Durchführungskosten sind beim Konkurrenten gebunden.", null, "competition");
  }
}
function economy(state, m) {
  competitionDaily(state, m);
  state.world.nextEconomyMin = m + WORLD_DAY;
}
function observeOrders(state) {
  const w = state.world;
  for (const t of w.tenders) {
    if (!t.orderId || t.outcome) continue;
    const order = state.orders.find(o => o.id === t.orderId);
    if (!order) continue;
    if (order.status === "geliefert") {
      const onTime = order.deliveredAtMin <= order.deliveryDeadlineMin;
      t.outcome = onTime ? "delivered" : "late";
      effect(state, null, { trust: onTime ? 3 : -3 });
      note(state, onTime ? "Ein Versprechen gehalten" : "Später als versprochen", t.customer + ": " + (onTime ? "Die Lieferung stärkt deine Verlässlichkeit (+3)." : "Die verspätete Lieferung kostet Verlässlichkeit (−3).") + " Das beeinflusst künftige Zuschläge.", { title: t.title, choice: "Dein verbindliches Angebot" }, "consequence");
    } else if (["storniert", "failed", "expired"].includes(order.status)) {
      t.outcome = "failed"; effect(state, null, { trust: -5 });
      note(state, "Ein Auftrag bleibt unerfüllt", t.customer + ": Verlässlichkeit −5. Die normalen Auftragsregeln gelten weiterhin.", { title: t.title, choice: "Dein verbindliches Angebot" }, "consequence");
    }
  }
}
export function processWorld(state, m) {
  if (!state.world?.active) return;
  migrateCompetition(state);
  const w = state.world;
  ensureWorldContinuation(state, m);
  cycleEncounter(state, m);
  observeOrders(state);
  processHarborOpening(state);
  processNordSprintChallenge(state);
  processStormNight(state);
  processStories(state, m);
  ensureWorldContinuation(state, m);
  for (const r of w.rivals) {
    for (const job of r.jobs.filter(j => j.endMin <= m)) { r.cashCents += job.paymentCents; r.completed++; }
    r.jobs = r.jobs.filter(j => j.endMin > m);
  }
  processCompetition(state, m);
  if (w.nextEconomyMin <= m) economy(state, m);
  for (const t of w.tenders) if (t.status === "open" && t.closeMin <= m) award(state, t, m);
  if (w.nextTenderMin <= m) makeTenderBatch(state, m);
}
export function getWorldEventTimes(state) {
  if (!state.world?.active) return [];
  const w = state.world;
  return [w.nextEconomyMin, w.nextTenderMin,
    ...(w.stories[ENCOUNTER_ID]?.status === "done" && w.stories[ENCOUNTER_ID].nextEncounterMin != null ? [w.stories[ENCOUNTER_ID].nextEncounterMin] : []),
    ...w.tenders.filter(t => t.status === "open").map(t => t.closeMin),
    ...w.rivals.flatMap(r => r.jobs.map(j => j.endMin)),
    ...(Object.values(w.stories) as any[]).flatMap(r => r.status === "locked" ? (r.availableAtMin != null ? [r.availableAtMin] : []) : r.dueMin != null ? [r.dueMin] : []),
  ];
}
export function handleWorldCommand(state, command, p) {
  if (STORM_COMMANDS.includes(command)) return handleStormNightCommand(state, command, p);
  if (NORDSPRINT_COMMANDS.includes(command)) return handleNordSprintCommand(state, command, p);
  if (command === "startHarborOpening") {
    if (state.world?.harborOpening) return { ok: true, alreadyApplied: true };
    const reason = harborOpeningStartReason(state);
    if (reason) throw new Error(reason);
    startWorld(state);
    return handleHarborOpeningCommand(state, command, p);
  }
  if (HARBOR_OPENING_COMMANDS.includes(command)) return handleHarborOpeningCommand(state, command, p);
  if (command === "startWorld") return startWorld(state);
  if (!["chooseWorldStory", "bidWorldTender", "withdrawWorldBid", "cancelWorldAppointment"].includes(command)) return null;
  if (!state.world?.active) throw new Error("Betritt zuerst die Spielwelt.");
  if (command === "chooseWorldStory") return chooseStory(state, p);
  if (command === "bidWorldTender") return bid(state, p);
  if (command === "cancelWorldAppointment") {
    const run = state.world.stories[p.storyId];
    const ap = state.appointments.find(a => a.id === run?.appointmentId);
    if (!run || run.stage !== p.stage || run.status !== "appointment" || ap?.status !== "accepted") throw new Error("Dieser geplante Termin kann nicht mehr abgesagt werden.");
    ap.status = "cancelled";
    return { ok: true };
  }
  const t = state.world.tenders.find(t => t.id === p.tenderId);
  if (!t || t.status !== "open" || state.gameTime >= t.closeMin) throw new Error("Das Gebot kann nicht mehr zurückgezogen werden.");
  t.bid = null;
  return { ok: true };
}