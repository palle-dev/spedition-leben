import { describe, it, expect } from "vitest";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { harborOpeningAvailable, harborOpeningStartReason, harborOpeningFeedback, processHarborOpening } from "../src/lib/simulation/harborOpening";
import { prepareLoadedState } from "../src/lib/saveSafety";
import { getAccountBalance } from "../src/lib/simulation/accountingEngine";
import { cleanupHistory } from "../src/lib/simulation/historyCleanup";

const copy = s => JSON.parse(JSON.stringify(s));
const fresh = () => createInitialState({ onboarding: true }).state as any;
const cmd = (s, name, p = {}) => applyCommand(s, name, p).result as any;
const opening = s => s.world.harborOpening;
function begin(s, choiceId = "priority") {
  cmd(s, "startHarborOpening");
  return cmd(s, "chooseHarborHandover", { choiceId }).orderId;
}
function drive(s, id, execute = cmd) {
  const result = execute(s, "startTransport", { orderId: id, vehicleId: "v1", driverId: "d1" });
  execute(s, "advanceTime", { minutes: result.endMin - s.gameTime });
  expect(s.orders.find(o => o.id === id).status).toBe("geliefert");
  return result;
}
describe("Annas spielbarer Auftakt", () => {
  it("offers an optional entry without changing old saves or starting deadlines", () => {
    const s = fresh(); s.gameTime = 200 * 1440;
    const before = copy(s);
    expect(harborOpeningAvailable(s)).toBe(true);
    expect(harborOpeningStartReason(s)).toBeNull();
    expect(s).toEqual(before);
    const cash = s.company.accountCents, n = s.orders.length;
    cmd(s, "startHarborOpening");
    expect(opening(s).status).toBe("briefing");
    expect(s.orders).toHaveLength(n);
    expect(s.company.accountCents).toBe(cash);
    expect(s.world.startedAtMin).toBe(s.gameTime);
    const w = copy(s.world);
    cmd(s, "startHarborOpening");
    expect(s.world).toEqual(w);
    cmd(s, "advanceTime", { minutes: 60 });
    expect(opening(s).status).toBe("briefing");
    expect(opening(s).outboundId).toBeNull();
  });
  it("preserves already decided stories, scenarios and missing capacity", () => {
    const s = fresh(); cmd(s, "startWorld");
    cmd(s, "chooseWorldStory", { storyId: "harbor", stage: 0, choiceId: "listen" });
    const before = copy(s.world);
    expect(harborOpeningAvailable(s)).toBe(false);
    expect(() => cmd(s, "startHarborOpening")).toThrow(/nicht mehr/);
    expect(s.world).toEqual(before);
    const scenario = fresh(); scenario.scenario = { status: "active" };
    expect(harborOpeningAvailable(scenario)).toBe(false);
    expect(() => cmd(scenario, "startHarborOpening")).toThrow();
    const empty = fresh(); empty.vehicles = [];
    expect(() => cmd(empty, "startHarborOpening")).toThrow(/Lkw/);
    expect(empty.world?.active).not.toBe(true);
  });
  it("books only the selected ramp once and creates one actual accepted order", () => {
    const s = fresh(), cash = s.company.accountCents, n = s.orders.length;
    const id = begin(s);
    expect(s.orders).toHaveLength(n + 1);
    expect(s.company.accountCents).toBe(cash - 9000);
    expect(getAccountBalance(s, "1000")).toBe(s.company.accountCents);
    expect(s.orders.find(o => o.id === id)).toMatchObject({ status: "angenommen", fromCity: "Hamburg", toCity: "Bremen", tons: 6, paymentCents: 65000, deliveryDeadlineMin: 840 });
    expect(cmd(s, "chooseHarborHandover", { choiceId: "priority" }).alreadyApplied).toBe(true);
    expect(s.orders).toHaveLength(n + 1);
    expect(s.company.accountCents).toBe(cash - 9000);
    expect(() => cmd(s, "chooseHarborHandover", { choiceId: "coordinated" })).toThrow(/bereits/);
    expect(() => cmd(s, "finishHarborOpening")).toThrow(/noch offen/);
    expect(() => cmd(s, "chooseWorldStory", { storyId: "harbor", stage: 0, choiceId: "help" })).toThrow(/läuft bereits/);
  });
  it("rejects forged or unaffordable choices without charging or advancing", () => {
    const s = fresh(); cmd(s, "startHarborOpening"); s.company.accountCents = 0;
    const before = copy(opening(s)), n = s.orders.length;
    expect(() => cmd(s, "chooseHarborHandover", { choiceId: "forged" })).toThrow();
    expect(() => cmd(s, "chooseHarborHandover", { choiceId: "priority" })).toThrow(/Firmenkonto/);
    expect(opening(s)).toEqual(before);
    expect(s.orders).toHaveLength(n);
    s.company.accountCents = -100; // The free option must remain available without a cash advance.
    cmd(s, "chooseHarborHandover", { choiceId: "coordinated" });
    expect(s.company.accountCents).toBe(-100);
  });
  it.each(["priority", "coordinated"])("drives both real transports through completion (%s)", choice => {
    const s = fresh(), id = begin(s, choice);
    const order = s.orders.find(o => o.id === id);
    if (choice === "coordinated") {
      expect(order.earliestPickupMin).toBe(570);
      expect(order.deliveryDeadlineMin).toBe(1080);
      expect(order.paymentCents).toBe(57000);
    }
    const trust = s.world.reputation.trust;
    drive(s, id);
    const a = opening(s);
    expect(a.status).toBe("debrief");
    expect(a.outboundResult).toMatchObject({ outcome: "on_time", driverName: "Klaus Werner", paidCents: order.paymentCents });
    expect(a.outboundResult.deliveredAtMin).toBeGreaterThanOrEqual(order.earliestPickupMin);
    expect(s.world.reputation.trust).toBe(trust + 3);
    expect(s.stats.totalDeliveries).toBe(1);
    const cash = s.company.accountCents, w = copy(s.world);
    processHarborOpening(s); processHarborOpening(s);
    expect(s.world).toEqual(w); expect(s.company.accountCents).toBe(cash);
    const second = cmd(s, "acceptHarborReturn").orderId;
    expect(cmd(s, "acceptHarborReturn").alreadyApplied).toBe(true);
    expect(s.orders.filter(o => o.id === second)).toHaveLength(1);
    expect(s.orders.find(o => o.id === second).deliveryDeadlineMin).toBe(s.gameTime + 720);
    drive(s, second);
    expect(a.status).toBe("finale");
    expect(a.returnResult).toMatchObject({ outcome: "on_time", paidCents: 72000 });
    expect(s.stats.totalDeliveries).toBe(2);
    cmd(s, "finishHarborOpening");
    expect(a.status).toBe("done");
    expect(s.world.stories.harbor).toMatchObject({ stage: 1, status: "decision", pending: null });
    expect(s.world.stories.harbor.decisions[0].choiceId).toBe("help");
    expect(s.onboarding.reviewedDelivery).toBe(true);
    const final = copy(s.world);
    cmd(s, "finishHarborOpening"); cmd(s, "startHarborOpening");
    expect(s.world).toEqual(final);
    expect(getAccountBalance(s, "1000")).toBe(s.company.accountCents);
  });
  it("allows declining the return without a hidden commitment or loss of the first success", () => {
    const s = fresh(), id = begin(s); drive(s, id);
    const n = s.orders.length, cash = s.company.accountCents;
    cmd(s, "finishHarborOpening");
    expect(opening(s).returnId).toBeNull();
    expect(s.orders).toHaveLength(n); expect(s.company.accountCents).toBe(cash);
    expect(opening(s).ending).toContain("gehaltenes Wort");
    expect(() => cmd(s, "acceptHarborReturn")).toThrow(/keine Rückladung/);
  });
  it("keeps cancellation a failure and does not invent a reward or follow-up", () => {
    const s = fresh(), id = begin(s);
    cmd(s, "cancelOrder", { orderId: id });
    expect(opening(s).status).toBe("debrief");
    expect(opening(s).outboundResult).toMatchObject({ outcome: "failed", paidCents: 0 });
    expect(s.stats.totalDeliveries).toBe(0);
    expect(() => cmd(s, "acceptHarborReturn")).toThrow();
    cmd(s, "finishHarborOpening");
    expect(s.world.stories.harbor.decisions[0].choiceId).toBe("listen");
    expect(s.onboarding.reviewedDelivery).toBe(false);
  });
  it("reports a late delivery honestly and gives a second chance", () => {
    const s = fresh(), id = begin(s);
    // Controlled terminal fixture: the delivery engine is covered by real trips above.
    const o = s.orders.find(o => o.id === id);
    Object.assign(o, { status: "geliefert", deliveredAtMin: o.deliveryDeadlineMin + 1, paidCents: 58500 });
    processHarborOpening(s);
    expect(opening(s).outboundResult.outcome).toBe("late");
    expect(harborOpeningFeedback(opening(s))).toContain("zweite Chance");
    expect(s.world.reputation.trust).toBe(69);
    expect(cmd(s, "acceptHarborReturn").orderId).toBeTruthy();
  });
  it("does not allow follow-ups before delivery or infer success from a missing order", () => {
    const s = fresh(), id = begin(s);
    expect(() => cmd(s, "acceptHarborReturn")).toThrow();
    s.orders = s.orders.filter(o => o.id !== id);
    processHarborOpening(s);
    expect(opening(s).status).toBe("outbound");
    expect(opening(s).outboundResult).toBeNull();
    expect(s.world.reputation.trust).toBe(70);
  });
  it("can leave the initial conversation without deciding the existing harbor chapter", () => {
    const s = fresh(), cash = s.company.accountCents;
    cmd(s, "startHarborOpening"); cmd(s, "finishHarborOpening");
    expect(s.world.stories.harbor.stage).toBe(0);
    expect(s.world.stories.harbor.decisions).toEqual([]);
    expect(s.company.accountCents).toBe(cash);
    cmd(s, "chooseWorldStory", { storyId: "harbor", stage: 0, choiceId: "listen" });
    expect(s.world.stories.harbor.decisions).toHaveLength(1);
  });
  it("blocks narrative business commands during a personal appointment", () => {
    const s = fresh(); cmd(s, "startHarborOpening");
    s.appointments.push({ id: "meeting", type: "leisure", status: "active", startMin: s.gameTime, endMin: s.gameTime + 120 });
    const a = copy(opening(s));
    expect(() => cmd(s, "chooseHarborHandover", { choiceId: "priority" })).toThrow();
    expect(() => cmd(s, "finishHarborOpening")).toThrow();
    expect(opening(s)).toEqual(a);
  });
  it("restores pending and delivered stages through actual save migration", () => {
    let s = fresh(), id = begin(s);
    const loaded = prepareLoadedState(copy(s)); s = loaded?.state || loaded;
    expect(opening(s).status).toBe("outbound"); drive(s, id);
    const loadedAgain = prepareLoadedState(copy(s)); s = loadedAgain?.state || loadedAgain;
    expect(opening(s).outboundResult.outcome).toBe("on_time");
    const before = copy(opening(s)); processHarborOpening(s);
    expect(opening(s)).toEqual(before);
    expect(cmd(s, "chooseHarborHandover", { choiceId: "priority" }).alreadyApplied).toBe(true);
    expect(s.orders.filter(o => o.id === id)).toHaveLength(1);
  });
  it("retains the recorded outcome after normal order and trip archival", () => {
    const s = fresh(), id = begin(s); drive(s, id);
    const result = copy(opening(s).outboundResult);
    s.gameTime += 40 * 1440; cleanupHistory(s, s.gameTime);
    expect(s.orders.some(o => o.id === id)).toBe(false);
    expect(opening(s).outboundResult).toEqual(result);
    cmd(s, "finishHarborOpening");
    expect(s.world.stories.harbor.decisions[0].choiceId).toBe("help");
  });
  it("produces the same outcomes, accounts and chapter transitions on the backend", () => {
    const a = fresh(), b = copy(a);
    const server = (s, name, p = {}) => serverCommand(s, name, p).result as any;
    for (const [s, execute] of [[a, cmd], [b, server]] as any[]) {
      execute(s, "startHarborOpening");
      const first = execute(s, "chooseHarborHandover", { choiceId: "coordinated" }).orderId;
      drive(s, first, execute);
      const second = execute(s, "acceptHarborReturn").orderId;
      drive(s, second, execute);
      execute(s, "finishHarborOpening");
    }
    expect(a.world).toEqual(b.world);
    expect(a.company).toEqual(b.company);
    expect(a.accounting.journal).toEqual(b.accounting.journal);
  });
});
