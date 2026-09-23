import { describe, it, expect } from "vitest";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
import { applyCommand as serverCommand } from "../base44/shared/simulationEngine";
import { stormNightAvailable, stormNightPickup, processStormNight } from "../src/lib/simulation/stormNight";
import { prepareLoadedState } from "../src/lib/saveSafety";
import { cleanupHistory } from "../src/lib/simulation/historyCleanup";
import { getAccountBalance } from "../src/lib/simulation/accountingEngine";
const copy = s => JSON.parse(JSON.stringify(s));
const cmd = (s, name, p = {}) => applyCommand(s, name, p).result as any;
const arc = s => s.world.stormNight;
const anna = s => s.world.rivals.find(r => r.id === "hansen");
function advance(s, until, execute = cmd) {
  while (s.gameTime < until) {
    const before = s.gameTime;
    execute(s, "advanceTime", { minutes: Math.min(1440, until - s.gameTime) });
    expect(s.gameTime).toBeGreaterThan(before);
  }
}
function drive(s, id, driver = "d1", vehicle = "v1", execute = cmd) {
  const r = execute(s, "startTransport", { orderId: id, driverId: driver, vehicleId: vehicle });
  advance(s, r.endMin, execute);
}
function ready(quiet = true) {
  const s = createInitialState({}).state as any;
  cmd(s, "startHarborOpening");
  drive(s, cmd(s, "chooseHarborHandover", { choiceId: "priority" }).orderId);
  drive(s, cmd(s, "acceptHarborReturn").orderId);
  cmd(s, "finishHarborOpening");
  drive(s, cmd(s, "startNordSprintChallenge", { choiceId: "quality" }).orderId, "d2", "v2");
  drive(s, cmd(s, "acceptNordSprintFollowup").orderId, "d2", "v2");
  cmd(s, "finishNordSprintChallenge");
  // Isolate route/deadline assertions from unrelated random defects; a separate test keeps them enabled.
  if (quiet) for (let day = 1; day <= 7; day++) {
    s.disruptions.dailyCounters["technical_defect:" + day] = 1;
    s.disruptions.dailyCounters["loading_delay:" + day] = 2;
  }
  return s;
}
describe("Die Nacht am Kai", () => {
  it("appears after actual Anna and NordSprint deliveries and waits without costs", () => {
    const s = ready(), before = copy(s);
    expect(stormNightAvailable(s)).toBe(true);
    expect(arc(s)).toBeUndefined();
    expect(s).toEqual(before);
    cmd(s, "advanceTime", { minutes: 60 });
    expect(stormNightAvailable(s)).toBe(true);
    expect(arc(s)).toBeUndefined();
  });
  it("uses the next 20:00 opening without moving an accepted deadline", () => {
    const s = ready();
    s.gameTime = 1199; expect(stormNightPickup(s)).toBe(1200);
    s.gameTime = 1200; expect(stormNightPickup(s)).toBe(2640);
    s.gameTime = 1439; expect(stormNightPickup(s)).toBe(2640);
    const ids = cmd(s, "startStormNight", { choiceId: "both" }).orderIds;
    expect(ids).toEqual(["storm_night_own", "storm_night_anna"]);
    expect(arc(s).pickupMin).toBe(2640);
    const deadlines = arc(s).jobs.map(j => j.deadlineMin);
    cmd(s, "advanceTime", { minutes: 60 });
    expect(arc(s).jobs.map(j => j.deadlineMin)).toEqual(deadlines);
  });
  it.each(["own", "anna", "both"])("completes real trips, books revenue once and advances the chapter (%s)", choiceId => {
    const s = ready(), cash = s.company.accountCents, relation = anna(s).relationship;
    const started = cmd(s, "startStormNight", { choiceId });
    expect(s.company.accountCents).toBe(cash);
    expect(arc(s).jobs).toHaveLength(choiceId === "both" ? 2 : 1);
    const ends = started.orderIds.map((id, i) => cmd(s, "startTransport", { orderId: id, driverId: i ? "d3" : "d1", vehicleId: i ? "v3" : "v1" }).endMin);
    advance(s, Math.max(...ends));
    expect(arc(s).status).toBe("debrief");
    for (const job of arc(s).jobs) {
      expect(arc(s).results[job.key]).toMatchObject({ outcome: "on_time", paidCents: job.paymentCents });
      expect(arc(s).results[job.key].driverName).toBeTruthy();
    }
    expect(anna(s).relationship).toBe(choiceId === "own" ? relation : Math.min(100, relation + 10));
    const before = copy(s.world);
    processStormNight(s); processStormNight(s);
    expect(s.world).toEqual(before);
    const cashBeforeFinish = s.company.accountCents;
    cmd(s, "finishStormNight");
    expect(s.company.accountCents).toBe(cashBeforeFinish);
    expect(s.world.stories.harbor).toMatchObject({ stage: 3, status: "decision", pending: null, dueMin: null });
    expect(s.world.stories.harbor.decisions.filter(d => d.stage === 2)).toHaveLength(1);
    expect(getAccountBalance(s, "1000")).toBe(s.company.accountCents);
    const done = copy(s);
    expect(cmd(s, "finishStormNight").alreadyApplied).toBe(true);
    expect(cmd(s, "startStormNight", { choiceId }).alreadyApplied).toBe(true);
    expect(s).toEqual(done);
    if (choiceId === "own") expect(arc(s).ending).toContain("Ich suche eine andere Lösung");
    if (choiceId === "anna") expect(arc(s).ending).toContain("kein Umsatz");
  });
  it("requires separate capacity and rejects forged or changed commitments without mutation", () => {
    const s = ready();
    const before = copy(s);
    expect(() => cmd(s, "startStormNight", { choiceId: "free" })).toThrow();
    expect(s).toEqual(before);
    const one = copy(s); one.vehicles = one.vehicles.slice(0, 1);
    expect(() => cmd(one, "startStormNight", { choiceId: "both" })).toThrow(/zwei/);
    const none = copy(s); none.drivers = [];
    expect(() => cmd(none, "startStormNight", { choiceId: "anna" })).toThrow(/Fahrer/);
    cmd(s, "startStormNight", { choiceId: "both" });
    const count = s.orders.length;
    cmd(s, "startStormNight", { choiceId: "both" });
    expect(s.orders).toHaveLength(count);
    expect(() => cmd(s, "startStormNight", { choiceId: "own" })).toThrow(/fest/);
    expect(() => cmd(s, "finishStormNight")).toThrow(/offen/);
    expect(() => cmd(s, "chooseWorldStory", { storyId: "harbor", stage: 2, choiceId: "protect" })).toThrow(/läuft bereits/);
  });
  it("settles mixed results separately and never completes while a promise remains open", () => {
    const s = ready();
    cmd(s, "startStormNight", { choiceId: "both" });
    const relation = anna(s).relationship;
    drive(s, "storm_night_own");
    expect(arc(s).results.own.outcome).toBe("on_time");
    expect(arc(s).results.anna).toBeUndefined();
    expect(arc(s).status).toBe("running");
    expect(() => cmd(s, "finishStormNight")).toThrow();
    cmd(s, "cancelOrder", { orderId: "storm_night_anna" });
    expect(arc(s).results.anna).toMatchObject({ outcome: "failed", paidCents: 0, relationDelta: -8 });
    expect(anna(s).relationship).toBe(relation - 8);
    expect(arc(s).ending).toContain("kam nicht an");
    expect(arc(s).ending).toContain("pünktliche Lieferung");
    cmd(s, "finishStormNight");
    expect(arc(s).status).toBe("done");
  });
  it("uses actual driver exhaustion, late payment and negative relationship consequences", () => {
    const s = ready();
    cmd(s, "startStormNight", { choiceId: "anna" });
    // Petra has only ten work minutes left after the two NordSprint trips.
    drive(s, "storm_night_anna", "d2", "v2");
    expect(arc(s).results.anna).toMatchObject({ outcome: "late", paidCents: 37800, reputationDelta: -3, relationDelta: -4 });
    expect(arc(s).results.anna.deliveredAtMin).toBeGreaterThan(arc(s).jobs[0].deadlineMin);
  });
  it("preserves older chapters, inactive worlds, scenarios and acquired Hansen", () => {
    const old = ready();
    cmd(old, "chooseWorldStory", { storyId: "harbor", stage: 2, choiceId: "protect" });
    const before = copy(old);
    expect(stormNightAvailable(old)).toBe(false);
    expect(() => cmd(old, "startStormNight", { choiceId: "anna" })).toThrow(/nicht mehr/);
    expect(old).toEqual(before);
    const s = ready(); s.scenario = { status: "active" };
    expect(stormNightAvailable(s)).toBe(false);
    s.scenario = null; anna(s).businessStatus = "acquired";
    expect(stormNightAvailable(s)).toBe(false);
    expect(stormNightAvailable(createInitialState({}).state)).toBe(false);
  });
  it("blocks business decisions during personal appointments", () => {
    const s = ready();
    s.appointments.push({ type: "leisure", status: "active", startMin: s.gameTime, endMin: s.gameTime + 60 });
    for (const name of ["startStormNight", "finishStormNight"]) expect(() => cmd(s, name, { choiceId: "own" })).toThrow();
    expect(arc(s)).toBeUndefined();
  });
  it("does not fabricate success from a missing order and settles archived orders", () => {
    const s = ready();
    cmd(s, "startStormNight", { choiceId: "anna" });
    const o = s.orders.find(o => o.id === "storm_night_anna");
    s.orders = s.orders.filter(item => item.id !== o.id);
    const before = copy(s.world);
    processStormNight(s);
    expect(s.world).toEqual(before);
    s.orders.push(o);
    drive(s, o.id);
    const result = copy(arc(s).results.anna);
    s.gameTime += 40 * 1440; cleanupHistory(s, s.gameTime);
    expect(s.orders.some(o => o.id === result.orderId)).toBe(false);
    expect(arc(s).results.anna).toEqual(result);
    cmd(s, "finishStormNight");
  });
  it("restores running, partial and completed state through save migration", () => {
    let s = ready();
    cmd(s, "startStormNight", { choiceId: "both" });
    function reload() {
      const before = copy(arc(s)), loaded = prepareLoadedState(copy(s));
      s = loaded?.state || loaded;
      expect(arc(s)).toEqual(before);
    }
    reload();
    drive(s, "storm_night_own"); reload();
    cmd(s, "cancelOrder", { orderId: "storm_night_anna" }); reload();
    cmd(s, "finishStormNight"); reload();
    expect(arc(s).status).toBe("done");
  });
  it("keeps a real technical defect actionable without settling the promise", () => {
    const s = ready(false);
    cmd(s, "startStormNight", { choiceId: "own" });
    expect(cmd(s, "startTransport", { orderId: "storm_night_own", driverId: "d1", vehicleId: "v1" })).toMatchObject({ ok: false, blockedByDisruption: true });
    expect(arc(s).status).toBe("running");
    expect(arc(s).results.own).toBeUndefined();
    expect(s.orders.find(o => o.id === "storm_night_own").status).toBe("angenommen");
    drive(s, "storm_night_own", "d1", "v3");
    expect(arc(s).results.own.outcome).toBe("on_time");
  });
  it("matches backend results and financial bookings for parallel deliveries", () => {
    const a = ready(), b = copy(a);
    const server = (s, name, p = {}) => serverCommand(s, name, p).result as any;
    for (const [s, execute] of [[a, cmd], [b, server]] as any[]) {
      const ids = execute(s, "startStormNight", { choiceId: "both" }).orderIds;
      const ends = ids.map((id, i) => execute(s, "startTransport", { orderId: id, driverId: i ? "d3" : "d1", vehicleId: i ? "v3" : "v1" }).endMin);
      advance(s, Math.max(...ends), execute); execute(s, "finishStormNight");
    }
    expect(a.world).toEqual(b.world);
    expect(a.company).toEqual(b.company);
    expect(a.accounting.journal).toEqual(b.accounting.journal);
  });
});
