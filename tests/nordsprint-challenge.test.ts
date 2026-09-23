import { describe, it, expect } from "vitest";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { nordSprintAvailable, processNordSprintChallenge } from "../src/lib/simulation/nordSprintChallenge";
import { prepareLoadedState } from "../src/lib/saveSafety";
import { cleanupHistory } from "../src/lib/simulation/historyCleanup";
import { getAccountBalance } from "../src/lib/simulation/accountingEngine";
const copy = s => JSON.parse(JSON.stringify(s));
const cmd = (s, name, p = {}) => applyCommand(s, name, p).result as any;
const arc = s => s.world.nordSprintChallenge;
function drive(s, id, execute = cmd) {
  const pair = id.startsWith("nordsprint") ? { vehicleId: "v2", driverId: "d2" } : { vehicleId: "v1", driverId: "d1" };
  const r = execute(s, "startTransport", { orderId: id, ...pair });
  while (s.gameTime < r.endMin) {
    const before = s.gameTime;
    execute(s, "advanceTime", { minutes: Math.min(1440, r.endMin - s.gameTime) });
    expect(s.gameTime).toBeGreaterThan(before);
  }
  return s.orders.find(o => o.id === id);
}
function ready() {
  const s = createInitialState({}).state as any;
  cmd(s, "startHarborOpening");
  drive(s, cmd(s, "chooseHarborHandover", { choiceId: "priority" }).orderId);
  drive(s, cmd(s, "acceptHarborReturn").orderId);
  cmd(s, "finishHarborOpening");
  return s;
}
describe("NordSprint-Probelauf", () => {
  it("becomes available after the real Anna opening without costs or deadlines", () => {
    const s = ready(), before = copy(s);
    expect(nordSprintAvailable(s)).toBe(true);
    expect(arc(s)).toBeUndefined();
    expect(s).toEqual(before);
    cmd(s, "advanceTime", { minutes: 60 });
    expect(nordSprintAvailable(s)).toBe(true);
    expect(arc(s)).toBeUndefined();
  });
  it.each(["price", "quality"])("drives the real trial and follow-up including overnight pickup (%s)", choiceId => {
    const s = ready(), cash = s.company.accountCents, count = s.orders.length;
    const id = cmd(s, "startNordSprintChallenge", { choiceId }).orderId;
    expect(s.company.accountCents).toBe(cash);
    expect(s.orders).toHaveLength(count + 1);
    const o = s.orders.find(o => o.id === id);
    expect(o.earliestPickupMin).toBe(1920);
    expect(o.deliveryDeadlineMin).toBe(1920 + (choiceId === "quality" ? 360 : 720));
    expect(o.paymentCents).toBe(choiceId === "quality" ? 76000 : 49000);
    expect(cmd(s, "startNordSprintChallenge", { choiceId }).alreadyApplied).toBe(true);
    expect(s.orders).toHaveLength(count + 1);
    const trust = s.world.reputation.trust;
    drive(s, id);
    expect(arc(s).trialResult).toMatchObject({ outcome: "on_time", driverName: "Petra Süß", paidCents: o.paymentCents });
    expect(arc(s).trialResult.deliveredAtMin).toBeGreaterThanOrEqual(1920 + 235);
    expect(arc(s).customerTrust).toBe(choiceId === "quality" ? 75 : 60);
    expect(s.world.reputation.trust).toBeGreaterThan(trust);
    const w = copy(s.world);
    processNordSprintChallenge(s); processNordSprintChallenge(s);
    expect(s.world).toEqual(w);
    const next = cmd(s, "acceptNordSprintFollowup").orderId;
    expect(cmd(s, "acceptNordSprintFollowup").alreadyApplied).toBe(true);
    expect(s.orders.filter(o => o.id === next)).toHaveLength(1);
    expect(s.orders.find(o => o.id === next).paymentCents).toBe(choiceId === "quality" ? 85000 : 62000);
    drive(s, next);
    expect(arc(s).followupResult.outcome).toBe("on_time");
    expect(arc(s).customerStatus).toBe("preferred");
    const beforeFinish = s.company.accountCents;
    cmd(s, "finishNordSprintChallenge");
    expect(s.company.accountCents).toBe(beforeFinish);
    expect(s.world.stories.harbor).toMatchObject({ stage: 2, status: "decision", pending: null, dueMin: null });
    expect(s.world.stories.harbor.decisions[1].choiceId).toBe(choiceId);
    expect(getAccountBalance(s, "1000")).toBe(s.company.accountCents);
    const done = copy(s.world);
    cmd(s, "finishNordSprintChallenge"); cmd(s, "startNordSprintChallenge", { choiceId });
    expect(s.world).toEqual(done);
  });
  it("preserves old chapter decisions, scenarios and non-independent rivals", () => {
    const s = ready();
    cmd(s, "chooseWorldStory", { storyId: "harbor", stage: 1, choiceId: "talk" });
    const before = copy(s);
    expect(nordSprintAvailable(s)).toBe(false);
    expect(() => cmd(s, "startNordSprintChallenge", { choiceId: "quality" })).toThrow(/nicht mehr/);
    expect(s).toEqual(before);
    const scenario = ready(); scenario.scenario = { status: "active" };
    expect(nordSprintAvailable(scenario)).toBe(false);
    const acquired = ready(); acquired.world.rivals.find(r => r.id === "nordsprint").businessStatus = "acquired";
    expect(nordSprintAvailable(acquired)).toBe(false);
  });
  it("rejects forged offers, missing capacity, premature follow-ups and alternate chapter commands", () => {
    const s = ready(), before = copy(s);
    expect(() => cmd(s, "startNordSprintChallenge", { choiceId: "free" })).toThrow();
    expect(s).toEqual(before);
    const empty = copy(s); empty.vehicles = [];
    expect(() => cmd(empty, "startNordSprintChallenge", { choiceId: "price" })).toThrow(/Lkw/);
    cmd(s, "startNordSprintChallenge", { choiceId: "price" });
    expect(() => cmd(s, "startNordSprintChallenge", { choiceId: "quality" })).toThrow(/verbindlich/);
    expect(() => cmd(s, "acceptNordSprintFollowup")).toThrow();
    expect(() => cmd(s, "finishNordSprintChallenge")).toThrow(/offen/);
    expect(() => cmd(s, "chooseWorldStory", { storyId: "harbor", stage: 1, choiceId: "quality" })).toThrow(/läuft bereits/);
  });
  it("treats cancellation as a failure and grants no repeat order", () => {
    const s = ready(), id = cmd(s, "startNordSprintChallenge", { choiceId: "quality" }).orderId;
    cmd(s, "cancelOrder", { orderId: id });
    expect(arc(s).trialResult).toMatchObject({ outcome: "failed", paidCents: 0 });
    expect(arc(s).customerTrust).toBe(10);
    expect(() => cmd(s, "acceptNordSprintFollowup")).toThrow();
    cmd(s, "finishNordSprintChallenge");
    expect(arc(s).ending).toContain("keinen Folgeauftrag");
  });
  it("uses real rest requirements and rejects a follow-up after a genuinely late trip", () => {
    const s = ready(), id = cmd(s, "startNordSprintChallenge", { choiceId: "quality" }).orderId;
    // Klaus has only ten work minutes left after Anna's two deliveries.
    const result = cmd(s, "startTransport", { orderId: id, vehicleId: "v1", driverId: "d1" });
    expect(result.endMin).toBeGreaterThan(s.orders.find(o => o.id === id).deliveryDeadlineMin);
    while (s.gameTime < result.endMin) cmd(s, "advanceTime", { minutes: Math.min(1440, result.endMin - s.gameTime) });
    expect(arc(s).trialResult).toMatchObject({ outcome: "late", paidCents: 68400 });
    expect(() => cmd(s, "acceptNordSprintFollowup")).toThrow();
  });
  it("reports late revenue honestly and removes the follow-up", () => {
    const s = ready(), id = cmd(s, "startNordSprintChallenge", { choiceId: "price" }).orderId;
    const o = s.orders.find(o => o.id === id);
    Object.assign(o, { status: "geliefert", deliveredAtMin: o.deliveryDeadlineMin + 1, paidCents: 44100 });
    processNordSprintChallenge(s);
    expect(arc(s).trialResult).toMatchObject({ outcome: "late", paidCents: 44100 });
    expect(arc(s).customerTrust).toBe(25);
    expect(() => cmd(s, "acceptNordSprintFollowup")).toThrow();
  });
  it("allows declining a follow-up without fabricating the second success", () => {
    const s = ready(), id = cmd(s, "startNordSprintChallenge", { choiceId: "quality" }).orderId;
    drive(s, id);
    const cash = s.company.accountCents, orders = s.orders.length;
    cmd(s, "finishNordSprintChallenge");
    expect(arc(s).followupId).toBeNull();
    expect(arc(s).customerStatus).toBe("proven");
    expect(arc(s).ending).toContain("anderen überlassen");
    expect(s.orders).toHaveLength(orders); expect(s.company.accountCents).toBe(cash);
    expect(() => cmd(s, "acceptNordSprintFollowup")).toThrow();
  });
  it("loses preferred status if the follow-up fails", () => {
    const s = ready();
    drive(s, cmd(s, "startNordSprintChallenge", { choiceId: "price" }).orderId);
    const id = cmd(s, "acceptNordSprintFollowup").orderId;
    cmd(s, "cancelOrder", { orderId: id });
    expect(arc(s).customerStatus).toBe("comparing");
    expect(arc(s).customerTrust).toBe(30);
    cmd(s, "finishNordSprintChallenge");
    expect(arc(s).ending).toContain("zweite Zusage blieb offen");
  });
  it("never assumes an outcome from a missing order", () => {
    const s = ready(), id = cmd(s, "startNordSprintChallenge", { choiceId: "price" }).orderId;
    s.orders = s.orders.filter(o => o.id !== id);
    const before = copy(s.world);
    processNordSprintChallenge(s);
    expect(s.world).toEqual(before);
  });
  it("blocks each business command during personal appointments", () => {
    const s = ready();
    s.appointments.push({ type: "leisure", status: "active", startMin: s.gameTime, endMin: s.gameTime + 120 });
    for (const name of ["startNordSprintChallenge", "acceptNordSprintFollowup", "finishNordSprintChallenge"]) {
      expect(() => cmd(s, name, { choiceId: "price" })).toThrow();
    }
    expect(arc(s)).toBeUndefined();
  });
  it("restores active and delivered stages through save migration and keeps archived outcomes", () => {
    let s = ready();
    const id = cmd(s, "startNordSprintChallenge", { choiceId: "quality" }).orderId;
    let loaded = prepareLoadedState(copy(s)); s = loaded?.state || loaded;
    expect(arc(s).status).toBe("trial");
    drive(s, id);
    loaded = prepareLoadedState(copy(s)); s = loaded?.state || loaded;
    expect(arc(s).status).toBe("debrief");
    const result = copy(arc(s).trialResult);
    s.gameTime += 40 * 1440; cleanupHistory(s, s.gameTime);
    expect(s.orders.some(o => o.id === id)).toBe(false);
    expect(arc(s).trialResult).toEqual(result);
    expect(cmd(s, "acceptNordSprintFollowup").orderId).toBe("nordsprint_followup");
  });
  it("matches backend outcomes and accounting", () => {
    const a = ready(), b = copy(a);
    const server = (s, name, p = {}) => serverCommand(s, name, p).result as any;
    for (const [s, execute] of [[a, cmd], [b, server]] as any[]) {
      const id = execute(s, "startNordSprintChallenge", { choiceId: "quality" }).orderId;
      drive(s, id, execute);
      drive(s, execute(s, "acceptNordSprintFollowup").orderId, execute);
      execute(s, "finishNordSprintChallenge");
    }
    expect(a.world).toEqual(b.world);
    expect(a.company).toEqual(b.company);
    expect(a.accounting.journal).toEqual(b.accounting.journal);
  });
});
