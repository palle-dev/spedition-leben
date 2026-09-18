import { describe, it, expect } from "vitest";
import { applyCommand, createInitialState } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { migrateWorld, processWorld, handleWorldCommand, worldAppointmentSlot, worldBidReason } from "../src/lib/simulation/worldEngine";
import { worldScene } from "../src/lib/simulation/worldCatalog";
import { prepareLoadedState } from "../src/lib/saveSafety";
import { getAccountBalance } from "../src/lib/simulation/accountingEngine";

const copy = x => JSON.parse(JSON.stringify(x));
function fresh() {
  const state: any = createInitialState({}).state;
  applyCommand(state, "startWorld", {});
  return state;
}
function advance(state, minutes, step = 1440) {
  for (let left = minutes; left > 0; left -= Math.min(step, left)) applyCommand(state, "advanceTime", { minutes: Math.min(step, left) });
}
function choose(state, storyId, choiceId) {
  return applyCommand(state, "chooseWorldStory", { storyId, stage: state.world.stories[storyId].stage, choiceId });
}
describe("Spielwelt: dauerhafte Geschichten und Wettbewerb", () => {
  it("starts old saves at their current minute without retroactive deadlines or charges", () => {
    const s: any = createInitialState({}).state;
    s.gameTime = 99 * 1440 + 523;
    const before = copy(s);
    migrateWorld(s);
    expect(s.world).toEqual({ version: 1, active: false });
    expect(s.company.accountCents).toBe(before.company.accountCents);
    handleWorldCommand(s, "startWorld", {});
    expect(s.world.startedAtMin).toBe(s.gameTime);
    expect(s.world.tenders.every(t => t.closeMin === s.gameTime + 1440)).toBe(true);
    const started = copy(s.world);
    handleWorldCommand(s, "startWorld", {});
    expect(s.world).toEqual(started);
    expect(s.company.accountCents).toBe(before.company.accountCents);
  });
  it("books a choice once in the ledger, including an identical retried command", () => {
    const s = fresh(), before = s.company.accountCents;
    choose(s, "harbor", "help");
    expect(s.company.accountCents).toBe(before - 45000);
    expect(getAccountBalance(s, "1000")).toBe(s.company.accountCents);
    const saved = copy(s.world);
    expect(applyCommand(s, "chooseWorldStory", { storyId: "harbor", stage: 0, choiceId: "help" }).result.alreadyApplied).toBe(true);
    expect(s.company.accountCents).toBe(before - 45000);
    expect(s.world).toEqual(saved);
    expect(() => applyCommand(s, "chooseWorldStory", { storyId: "harbor", stage: 0, choiceId: "compete" })).toThrow(/bereits/);
  });
  it("rejects unaffordable and forged choices before costs or progress are changed", () => {
    const s = fresh();
    s.company.accountCents = 100;
    const before = copy(s.world);
    expect(() => choose(s, "harbor", "help")).toThrow(/Firmenkonto/);
    expect(s.world).toEqual(before);
    expect(() => choose(s, "harbor", "forged")).toThrow(/gibt es nicht/);
    expect(s.world).toEqual(before);
  });
  it("preserves pending consequences through the real save migration and applies them once", () => {
    const s = fresh();
    choose(s, "harbor", "help");
    const loaded = prepareLoadedState(copy(s));
    // prepareLoadedState returns the normalized game state.
    const restored = loaded?.state || loaded;
    expect(restored.world).toEqual(s.world);
    advance(restored, 2880);
    expect(restored.world.stories.harbor.stage).toBe(1);
    expect(restored.world.reputation.quality).toBe(2);
    const consequences = restored.world.chronicle.filter(e => e.kind === "consequence" && e.cause?.storyId === "harbor");
    expect(consequences).toHaveLength(1);
    processWorld(restored, restored.gameTime);
    expect(restored.world.chronicle.filter(e => e.kind === "consequence" && e.cause?.storyId === "harbor")).toHaveLength(1);
  });
  it("produces identical world results for hourly, daily and server replay", () => {
    const a = fresh(); choose(a, "harbor", "help");
    const b = copy(a), c = copy(a);
    advance(a, 6 * 1440);
    advance(b, 6 * 1440, 60);
    for (let i = 0; i < 6; i++) serverCommand(c, "advanceTime", { minutes: 1440 });
    expect(a.world).toEqual(b.world);
    expect(a.world).toEqual(c.world);
  });
  it("uses earlier help in later chapter costs and completes all four chapters", () => {
    const s = fresh();
    choose(s, "harbor", "help"); advance(s, 2880);
    choose(s, "harbor", "talk"); advance(s, 2880);
    expect(worldScene(s, s.world.stories.harbor).choices.find(c => c.id === "network").costCents).toBe(40000);
    choose(s, "harbor", "network"); advance(s, 2880);
    choose(s, "harbor", "alliance"); advance(s, 2880);
    expect(s.world.stories.harbor.status).toBe("done");
    expect(s.world.stories.harbor.decisions).toHaveLength(4);
    expect(s.world.identity).toBe("Partner des Nordens");
    expect(s.world.reputation.quality).toBeGreaterThan(0);
  });
  it("offers an independent finale even when Hansen will not form an alliance", () => {
    const s = fresh();
    choose(s, "harbor", "compete"); advance(s, 2880);
    choose(s, "harbor", "price"); advance(s, 2880);
    expect(worldScene(s, s.world.stories.harbor).choices.find(c => c.id === "network").costCents).toBe(80000);
    choose(s, "harbor", "opportunity"); advance(s, 2880);
    expect(() => choose(s, "harbor", "alliance")).toThrow(/vertraut/);
    choose(s, "harbor", "independent"); advance(s, 2880);
    expect(s.world.identity).toBe("Unabhängig am Kai");
  });
  it("unlocks side stories gradually and follows the real employed driver", () => {
    const s = fresh();
    expect(s.world.stories.driver.status).toBe("locked");
    advance(s, 1440);
    const run = s.world.stories.driver;
    const d = s.drivers.find(d => d.id === run.actorId);
    expect(d.name).toBe(run.actorName);
    const before = d.satisfaction;
    choose(s, "driver", "invest");
    expect(d.satisfaction).toBe(Math.min(100, before + 8));
    d.employmentStatus = "left";
    processWorld(s, s.gameTime);
    expect(run.status).toBe("done");
    expect(run.pending).toBeNull();
  });
  it("does not invent a partner and does not credit an ex-partner's story to someone new", () => {
    const s = fresh();
    s.private.partnerName = null; s.private.relationshipStatus = "single";
    advance(s, 3 * 1440);
    expect(s.world.stories.home.status).toBe("locked");
    s.private.partnerName = "Alex"; s.private.partnerId = "alex"; s.private.relationshipStatus = "dating";
    processWorld(s, s.gameTime);
    choose(s, "home", "honest");
    s.private.partnerId = "different"; s.private.partnerName = "Sam";
    const before = s.private.relationship;
    processWorld(s, s.gameTime);
    expect(s.world.stories.home.status).toBe("done");
    expect(s.private.relationship).toBe(before);
  });
  it("schedules a real future appointment without overlap and grants its benefits only on attendance", () => {
    const s = fresh(); advance(s, 3 * 1440);
    const first = worldAppointmentSlot(s);
    s.appointments.push({ id: "busy_evening", type: "test", status: "accepted", ...first });
    const before = s.private.relationship;
    choose(s, "home", "evening");
    const run = s.world.stories.home;
    const ap = s.appointments.find(a => a.id === run.appointmentId);
    expect(ap.startMin).toBe(first.startMin + 1440);
    expect(ap.startMin).toBeGreaterThan(s.gameTime);
    expect(s.private.relationship).toBe(before);
    advance(s, ap.startMin - s.gameTime);
    expect(ap.status).toBe("active");
    expect(() => choose(s, "harbor", "listen")).toThrow();
    advance(s, 120);
    expect(ap.status).toBe("done");
    expect(run.status).toBe("waiting");
    expect(s.world.chronicle.some(e => e.title === "Zeit, die du dir genommen hast")).toBe(true);
  });
  it("cancelling a promised meeting suppresses its positive delayed effect", () => {
    const s = fresh(); advance(s, 3 * 1440); choose(s, "home", "evening");
    const run = s.world.stories.home, ap = s.appointments.find(a => a.id === run.appointmentId);
    applyCommand(s, "cancelWorldAppointment", { storyId: "home", stage: run.stage });
    expect(ap.status).toBe("cancelled");
    expect(run.pending.effect).toEqual({ relationship: -3 });
    expect(run.status).toBe("waiting");
  });
  it("rejects a calendar commitment with no free evening without debiting money", () => {
    const s = fresh(); advance(s, 3 * 1440);
    const first = worldAppointmentSlot(s);
    for (let i = 0; i < 14; i++) s.appointments.push({ id: "busy" + i, type: "test", status: "accepted", startMin: first.startMin + i * 1440, endMin: first.endMin + i * 1440 });
    const before = s.private.accountCents;
    expect(() => choose(s, "home", "evening")).toThrow(/kein gemeinsamer Abend/);
    expect(s.private.accountCents).toBe(before);
    expect(s.world.stories.home.decisions).toHaveLength(0);
  });
  it("tracks Jens as a distinct friend and completes the friendship chain", () => {
    const s = fresh(); advance(s, 5 * 1440);
    const rel = s.private.relationship;
    choose(s, "friend", "fund");
    expect(s.private.relationship).toBe(rel);
    expect(s.stats.friendshipQualities.world_jens).toBe(45);
    advance(s, 2880); choose(s, "friend", "friendship"); advance(s, 2880);
    expect(s.world.stories.friend.status).toBe("done");
    expect(s.stats.friendshipQualities.world_jens).toBe(s.world.friend.quality);
  });
  it("does not charge for a bid and supports revision and withdrawal before closing", () => {
    const s = fresh(), t = s.world.tenders[0], before = s.company.accountCents;
    applyCommand(s, "bidWorldTender", { tenderId: t.id, bidId: "premium" });
    applyCommand(s, "bidWorldTender", { tenderId: t.id, bidId: "lean" });
    expect(t.bid.percent).toBe(85);
    expect(s.company.accountCents).toBe(before);
    applyCommand(s, "withdrawWorldBid", { tenderId: t.id });
    expect(t.bid).toBeNull();
    expect(() => applyCommand(s, "bidWorldTender", { tenderId: t.id, bidId: "0.01" })).toThrow();
    advance(s, 1440);
    expect(() => applyCommand(s, "withdrawWorldBid", { tenderId: t.id })).toThrow();
  });
  it("awards a real, driveable order and settles income and reputation once", () => {
    const s = fresh(), t = s.world.tenders[0];
    applyCommand(s, "bidWorldTender", { tenderId: t.id, bidId: "lean" });
    advance(s, 1440);
    expect(t.winnerId).toBe("player");
    const order = s.orders.find(o => o.id === t.orderId);
    expect(order.status).toBe("angenommen");
    expect(order.paymentCents).toBe(Math.round(t.baseCents * .85));
    const before = s.company.accountCents, trust = s.world.reputation.trust;
    const result: any = applyCommand(s, "startTransport", { orderId: order.id, vehicleId: s.vehicles[0].id, driverId: s.drivers[0].id }).result;
    expect(result.endMin).toBeGreaterThan(s.gameTime);
    advance(s, result.endMin - s.gameTime);
    expect(order.status).toBe("geliefert");
    expect(t.outcome).toBe("delivered");
    expect(s.world.reputation.trust).toBe(trust + 3);
    expect(s.company.accountCents).toBeGreaterThan(before);
    const amount = s.company.accountCents;
    processWorld(s, s.gameTime);
    expect(s.company.accountCents).toBe(amount);
  });
  it("respects rival reserves and fleet limits; rivals earn only when their work finishes", () => {
    const s = fresh();
    s.world.rivals.forEach(r => { r.cashCents = 0; });
    advance(s, 1440);
    expect(s.world.tenders.every(t => t.winnerId === null)).toBe(true);
    const b = fresh(); b.world.rivals.forEach(r => { r.fleet = 1; });
    advance(b, 1440);
    expect(b.world.rivals.every(r => r.jobs.length <= r.fleet && r.cashCents >= 0)).toBe(true);
    expect(b.world.rivals.reduce((n, r) => n + r.jobs.length, 0)).toBe(2);
    expect(b.world.rivals.reduce((n, r) => n + r.completed, 0)).toBe(0);
    advance(b, 2880);
    expect(b.world.rivals.reduce((n, r) => n + r.completed, 0)).toBe(2);
  });
  it("prevents excessive bids and rechecks the fleet before awarding", () => {
    const s = fresh();
    s.vehicles = [s.vehicles[0]]; s.drivers = [s.drivers[0]];
    applyCommand(s, "bidWorldTender", { tenderId: s.world.tenders[0].id, bidId: "lean" });
    expect(worldBidReason(s, s.world.tenders[1])).toMatch(/fehlen/);
    expect(() => applyCommand(s, "bidWorldTender", { tenderId: s.world.tenders[1].id, bidId: "lean" })).toThrow(/fehlen/);
    s.vehicles[0].status = "sold";
    advance(s, 1440);
    expect(s.world.tenders.every(t => t.winnerId !== "player")).toBe(true);
  });
  it("records failed commitments without removing or modifying unrelated orders", () => {
    const s = fresh(), t = s.world.tenders[0];
    applyCommand(s, "bidWorldTender", { tenderId: t.id, bidId: "lean" }); advance(s, 1440);
    const others = copy(s.orders.filter(o => o.id !== t.orderId)), trust = s.world.reputation.trust;
    applyCommand(s, "cancelOrder", { orderId: t.orderId });
    expect(t.outcome).toBe("failed");
    expect(s.world.reputation.trust).toBe(trust - 5);
    expect(s.orders.filter(o => o.id !== t.orderId)).toEqual(others);
  });
  it("bounds long-running history and keeps unresolved story decisions available", () => {
    const s = fresh();
    for (let day = 1; day <= 200; day++) { s.gameTime = 480 + day * 1440; processWorld(s, s.gameTime); }
    expect(s.world.chronicle.length).toBeLessThanOrEqual(180);
    expect(s.world.tenders.length).toBeLessThanOrEqual(24);
    expect(s.world.stories.harbor.status).toBe("decision");
    expect(s.world.rivals.every(r => r.cashCents >= 0 && r.jobs.length <= r.fleet)).toBe(true);
  });
});

describe("Spielwelt: bestehende Spielaktionen", () => {
  it("retains binding world awards when clearing ordinary open orders", () => {
    const s = fresh(), t = s.world.tenders[0];
    applyCommand(s, "bidWorldTender", { tenderId: t.id, bidId: "lean" });
    advance(s, 1440);
    applyCommand(s, "clearOpenOrders", {});
    expect(s.orders.find(o => o.id === t.orderId)?.status).toBe("angenommen");
    applyCommand(s, "cancelOrder", { orderId: t.orderId });
    expect(t.outcome).toBe("failed");
  });
  it("keeps a personal story attached when the same partner is renamed", () => {
    const s = fresh(); advance(s, 3 * 1440);
    const actorId = s.world.stories.home.actorId;
    applyCommand(s, "setNames", { partnerName: "Neuer Anzeigename" });
    expect(s.world.stories.home.status).toBe("decision");
    expect(s.world.stories.home.actorId).toBe(actorId);
    expect(s.world.stories.home.actorName).toBe("Neuer Anzeigename");
  });
  it("keeps a running scenario isolated from the additional economy", () => {
    const s: any = createInitialState({}).state;
    s.scenario = { status: "active" };
    expect(() => handleWorldCommand(s, "startWorld", {})).toThrow(/Szenario/);
    expect(s.world.active).toBe(false);
  });
  it("completes the corporate, driver, home and friend paths with actual appointments", () => {
    const s = fresh();
    choose(s, "harbor", "help"); advance(s, 2880);
    choose(s, "harbor", "quality"); choose(s, "driver", "honest"); advance(s, 2880);
    choose(s, "harbor", "protect"); choose(s, "driver", "recognize"); choose(s, "home", "evening");
    const ap1 = s.appointments.find(a => a.id === s.world.stories.home.appointmentId);
    advance(s, ap1.endMin - s.gameTime + 2880);
    choose(s, "harbor", "corporate"); choose(s, "home", "repeat");
    const ap2 = s.appointments.find(a => a.id === s.world.stories.home.appointmentId);
    advance(s, ap2.endMin - s.gameTime + 2880);
    choose(s, "friend", "time");
    const ap3 = s.appointments.find(a => a.id === s.world.stories.friend.appointmentId);
    advance(s, ap3.endMin - s.gameTime + 2880);
    choose(s, "friend", "network"); advance(s, 2880);
    expect(Object.values(s.world.stories).every((run: any) => run.status === "done")).toBe(true);
    expect(s.world.identity).toBe("Neue Wege mit HanseCargo");
    expect(s.world.stories.home.decisions).toHaveLength(2);
    expect(s.world.stories.friend.decisions).toHaveLength(2);
  });
});
