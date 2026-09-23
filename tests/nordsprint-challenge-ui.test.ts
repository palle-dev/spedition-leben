// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
const fixture = vi.hoisted(() => ({ state: null as any, send: vi.fn(), showToast: vi.fn(), busy: false, backgroundAdvance: null as any }));
vi.mock("@/lib/gameContext", () => ({ useGame: () => fixture }));
vi.mock("framer-motion", () => ({ motion: { div: ({ children, initial, animate, exit, transition, ...props }) => React.createElement("div", props, children) } }));
import Panel, { NordSprintGuide } from "../src/components/world/NordSprintChallengePanel";
import OnboardingGuide from "../src/components/OnboardingGuide";
let container, root;
const cmd = (name, p = {}) => applyCommand(fixture.state, name, p).result as any;
const a = () => fixture.state.world.nordSprintChallenge;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  fixture.state = createInitialState({ onboarding: true }).state;
  cmd("startWorld");
  // Isolate chapter-two rendering; real progression is covered by engine tests.
  Object.assign(fixture.state.world.stories.harbor, { stage: 1, status: "decision", decisions: [{ stage: 0, choiceId: "help" }] });
  fixture.busy = false; fixture.backgroundAdvance = null;
  fixture.showToast.mockReset(); fixture.send.mockReset();
  fixture.send.mockImplementation(async (name, p) => cmd(name, p));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function Location() { const loc = useLocation(); return React.createElement("output", { "data-location": true }, loc.pathname + loc.search); }
async function render(component = Panel, props = {}) {
  await act(async () => root.render(React.createElement(MemoryRouter, {}, React.createElement(component, props), React.createElement(Location))));
}
function button(text) {
  const result = Array.from(container.querySelectorAll("button")).find((b: HTMLButtonElement) => (b.getAttribute("aria-label") || b.textContent).includes(text));
  expect(result, text).toBeTruthy(); return result as HTMLButtonElement;
}
function drive(id) {
  const r = cmd("startTransport", { orderId: id, vehicleId: "v1", driverId: "d1" });
  while (fixture.state.gameTime < r.endMin) cmd("advanceTime", { minutes: Math.min(1440, r.endMin - fixture.state.gameTime) });
}
it("explains rival quote, binding trial, both prices, actual dates and fatigue risk before commitment", async () => {
  await render();
  expect(container.textContent).toContain("520 €");
  expect(container.textContent).toContain("490,00");
  expect(container.textContent).toContain("760,00");
  expect(container.textContent).toContain("Tag 2, 08:00");
  expect(container.textContent).toContain("Tag 2, 14:00");
  expect(container.textContent).toContain("Tag 2, 20:00");
  expect(container.textContent).toContain("keine offene Auktion");
  expect(container.textContent).toContain("ausgeruhten Fahrer");
  expect(a()).toBeUndefined();
  await act(async () => button("Frühe Lieferung zusagen").click());
  expect(fixture.send).toHaveBeenCalledExactlyOnceWith("startNordSprintChallenge", { choiceId: "quality" });
  expect(container.querySelector("[data-location]").textContent).toBe("/disposition?order=nordsprint_trial");
});
it("guards duplicate clicks and keeps errors actionable", async () => {
  let reject;
  fixture.send.mockImplementation(() => new Promise((_, no) => { reject = no; }));
  await render();
  await act(async () => { button("NordSprint unterbieten").click(); button("NordSprint unterbieten").click(); });
  expect(fixture.send).toHaveBeenCalledTimes(1);
  await act(async () => reject(Error("Sitzung gewechselt")));
  expect(fixture.showToast).toHaveBeenCalledWith("Sitzung gewechselt", "error");
  expect(button("NordSprint unterbieten").disabled).toBe(false);
});
it("disables decisions during personal appointments, background advance or absent capacity", async () => {
  fixture.state.appointments.push({ type: "leisure", status: "active" });
  await render(); expect(button("NordSprint unterbieten").disabled).toBe(true);
  fixture.state.appointments = []; fixture.backgroundAdvance = { active: true };
  await render(); expect(button("NordSprint unterbieten").disabled).toBe(true);
  fixture.backgroundAdvance = null; fixture.state.vehicles = [];
  await render(); expect(container.textContent).toContain("geeigneten eigenen Lkw");
  expect(button("NordSprint unterbieten").disabled).toBe(true);
});
it("replaces onboarding with links to the real order and running trip", async () => {
  const id = cmd("startNordSprintChallenge", { choiceId: "price" }).orderId;
  await render(OnboardingGuide);
  expect(container.querySelector('a[href="/disposition?order=nordsprint_trial"]')).toBeTruthy();
  expect(container.textContent).not.toContain("Schritt 1");
  cmd("startTransport", { orderId: id, vehicleId: "v1", driverId: "d1" });
  const trip = fixture.state.trips.find(t => t.orderId === id);
  await render(NordSprintGuide, { state: fixture.state });
  expect(container.querySelector('a[href="/disposition?trip=' + trip.id + '"]')).toBeTruthy();
});
it("offers the correct earned follow-up and renders both delivered results at completion", async () => {
  drive(cmd("startNordSprintChallenge", { choiceId: "quality" }).orderId);
  await render();
  expect(container.textContent).toContain("Pünktlich geliefert");
  expect(container.textContent).toContain("760,00");
  expect(container.textContent).toContain("850,00");
  expect(container.textContent).toContain("75/100");
  await act(async () => button("Folgeauftrag zusagen").click());
  expect(container.querySelector("[data-location]").textContent).toBe("/disposition?order=nordsprint_followup");
  drive(a().followupId);
  await render(); await act(async () => button("Kapitel abschließen").click());
  await render(Panel, { showCompleted: true });
  expect(container.querySelectorAll('[aria-label="Ergebnis des Kundenauftrags"]')).toHaveLength(2);
  expect(container.textContent).toContain("Zwei gehaltene Zusagen");
  expect(container.textContent).toContain("kein automatischer Rahmenvertrag");
  await render(); expect(container.querySelector("section")).toBeNull();
});
it("never shows a follow-up after failure and preserves unrelated older games", async () => {
  const id = cmd("startNordSprintChallenge", { choiceId: "quality" }).orderId;
  cmd("cancelOrder", { orderId: id }); await render();
  expect(container.textContent).toContain("Nicht geliefert");
  expect(container.textContent).not.toContain("Folgeauftrag zusagen");
  fixture.state = createInitialState({}).state; await render();
  expect(container.querySelector("section")).toBeNull();
  cmd("startWorld");
  Object.assign(fixture.state.world.stories.harbor, { stage: 2, status: "decision", decisions: [{ stage: 1, choiceId: "talk" }] });
  await render(); expect(container.querySelector("section")).toBeNull();
});
it("renders invitation, planning, results and recap for visual review", () => {
  const pages = [];
  const capture = label => {
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(Panel, { showCompleted: true })));
    expect(html).not.toMatch(/>undefined<|>NaN<|Invalid Date/);
    pages.push({ label, html });
  };
  capture("Angebote");
  const id = cmd("startNordSprintChallenge", { choiceId: "quality" }).orderId;
  capture("Planung"); drive(id); capture("Kundenantwort");
  drive(cmd("acceptNordSprintFollowup").orderId); capture("Zweite Lieferung");
  cmd("finishNordSprintChallenge"); capture("Chronik");
  if (process.env.NORD_PREVIEW_DIR) {
    mkdirSync(process.env.NORD_PREVIEW_DIR, { recursive: true });
    writeFileSync(process.env.NORD_PREVIEW_DIR + "/stages.json", JSON.stringify(pages));
  }
});
