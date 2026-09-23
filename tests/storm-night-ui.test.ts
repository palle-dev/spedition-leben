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
import Panel, { StormNightGuide, stormDeadline } from "../src/components/world/StormNightPanel";
import OnboardingGuide from "../src/components/OnboardingGuide";
let container, root;
const cmd = (name, p = {}) => applyCommand(fixture.state, name, p).result as any;
const a = () => fixture.state.world.stormNight;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  fixture.state = createInitialState({ onboarding: true }).state;
  cmd("startWorld");
  Object.assign(fixture.state.world.stories.harbor, { stage: 2, status: "decision", decisions: [{ stage: 0, choiceId: "help" }, { stage: 1, choiceId: "quality" }] });
  for (let day = 1; day <= 4; day++) {
    fixture.state.disruptions.dailyCounters["technical_defect:" + day] = 1;
    fixture.state.disruptions.dailyCounters["loading_delay:" + day] = 2;
  }
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
function advance(until) {
  while (fixture.state.gameTime < until) cmd("advanceTime", { minutes: Math.min(1440, until - fixture.state.gameTime) });
}
it("shows all choices, real dates, prices, capacity and consequences before commitment", async () => {
  await render();
  for (const text of ["950,00", "420,00", "Tag 1, 20:00", "Tag 2, 00:30", "Tag 2, 02:00", "zwei Fahrer", "keine Ruhezeit", "Hansen −8"])
    expect(container.textContent).toContain(text);
  expect(a()).toBeUndefined();
  await act(async () => button("Anna die Notfahrt zusagen").click());
  expect(fixture.send).toHaveBeenCalledExactlyOnceWith("startStormNight", { choiceId: "anna" });
  expect(container.querySelector("[data-location]").textContent).toBe("/disposition?order=storm_night_anna");
});
it("keeps both commitments visible and points the guide at Anna's earlier deadline", async () => {
  await render();
  await act(async () => button("Zwei Teams").click()); await render();
  expect(container.querySelector('a[href="/disposition?order=storm_night_own"]')).toBeTruthy();
  expect(container.querySelector('a[href="/disposition?order=storm_night_anna"]')).toBeTruthy();
  await render(OnboardingGuide);
  expect(container.textContent).toContain("Annas Hilfslieferung");
  expect(container.textContent).toContain("2 Zusage(n) offen");
  expect(container.querySelector('a[href="/disposition?order=storm_night_anna"]')).toBeTruthy();
  cmd("startTransport", { orderId: "storm_night_anna", driverId: "d2", vehicleId: "v2" });
  const trip = fixture.state.trips.find(t => t.orderId === "storm_night_anna");
  await render(StormNightGuide, { state: fixture.state });
  expect(container.querySelector('a[href="/disposition?trip=' + trip.id + '"]')).toBeTruthy();
});
it("guards duplicate clicks and surfaces command errors", async () => {
  let reject;
  fixture.send.mockImplementation(() => new Promise((_, no) => { reject = no; }));
  await render();
  await act(async () => { button("Zwei Teams").click(); button("Zwei Teams").click(); });
  expect(fixture.send).toHaveBeenCalledTimes(1);
  await act(async () => reject(Error("Sitzung gewechselt")));
  expect(fixture.showToast).toHaveBeenCalledWith("Sitzung gewechselt", "error");
  expect(button("Zwei Teams").disabled).toBe(false);
});
it("disables unavailable capacity, personal appointments and concurrent advances", async () => {
  fixture.state.vehicles = fixture.state.vehicles.slice(0, 1);
  await render(); expect(button("Zwei Teams").disabled).toBe(true);
  expect(button("Anna die Notfahrt").disabled).toBe(false);
  fixture.state.appointments.push({ type: "leisure", status: "active" });
  await render(); expect(button("Anna die Notfahrt").disabled).toBe(true);
  fixture.state.appointments = []; fixture.backgroundAdvance = { active: true };
  await render(); expect(button("Anna die Notfahrt").disabled).toBe(true);
});
it("shows partial failures honestly, routes to the remaining job and permits finishing only after settlement", async () => {
  cmd("startStormNight", { choiceId: "both" });
  cmd("cancelOrder", { orderId: "storm_night_anna" });
  await render();
  expect(container.textContent).toContain("Nicht geliefert");
  expect(container.textContent).not.toContain("Nacht abschließen");
  await render(StormNightGuide, { state: fixture.state });
  expect(container.querySelector('a[href="/disposition?order=storm_night_own"]')).toBeTruthy();
  const r = cmd("startTransport", { orderId: "storm_night_own", driverId: "d1", vehicleId: "v1" });
  advance(r.endMin);
  await render();
  expect(container.textContent).toContain("Pünktlich geliefert");
  expect(container.textContent).toContain("kam nicht an");
  await act(async () => button("Nacht abschließen").click());
  await render(Panel, { showCompleted: true });
  expect(container.querySelectorAll('[aria-label$="– Ergebnis"]')).toHaveLength(2);
  expect(container.textContent).toContain("Annas tatsächliches Vertrauen");
  await render(); expect(container.querySelector("section")).toBeNull();
});
it("keeps missing orders, expired windows and older decisions explicit", async () => {
  cmd("startStormNight", { choiceId: "own" });
  fixture.state.orders = [];
  fixture.state.gameTime = a().jobs[0].deadlineMin + 1;
  await render();
  expect(container.textContent).toContain("Lieferfrist überschritten");
  expect(container.textContent).toContain("Auftrag fehlt");
  expect(container.textContent).not.toContain("Pünktlich geliefert");
  expect(stormDeadline(60, 60)).toBe("Lieferfrist jetzt");
  expect(stormDeadline(125, 60)).toBe("Noch 1 h 5 min");
  fixture.state = createInitialState({}).state;
  cmd("startWorld");
  Object.assign(fixture.state.world.stories.harbor, { stage: 3, status: "decision" });
  await render(); expect(container.querySelector("section")).toBeNull();
});
it("renders invitation, both plans, a mixed result and recap for visual review", () => {
  const pages = [];
  const capture = label => {
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(Panel, { showCompleted: true })));
    expect(html).not.toMatch(/>undefined<|>NaN<|Invalid Date/);
    pages.push({ label, html });
  };
  capture("Entscheidung");
  cmd("startStormNight", { choiceId: "both" }); capture("Zwei Zusagen");
  cmd("cancelOrder", { orderId: "storm_night_anna" }); capture("Eine Zusage offen");
  const r = cmd("startTransport", { orderId: "storm_night_own", driverId: "d1", vehicleId: "v1" });
  advance(r.endMin); capture("Der Morgen danach");
  cmd("finishStormNight"); capture("Chronik");
  if (process.env.STORM_PREVIEW_DIR) {
    mkdirSync(process.env.STORM_PREVIEW_DIR, { recursive: true });
    writeFileSync(process.env.STORM_PREVIEW_DIR + "/stages.json", JSON.stringify(pages));
  }
});
