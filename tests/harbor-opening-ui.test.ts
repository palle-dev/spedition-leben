// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";
const fixture = vi.hoisted(() => ({ state: null as any, send: vi.fn(), showToast: vi.fn(), busy: false, backgroundAdvance: null as any }));
vi.mock("@/lib/gameContext", () => ({ useGame: () => fixture }));
vi.mock("framer-motion", () => ({ motion: { div: ({ children, initial, animate, exit, transition, ...props }) => React.createElement("div", props, children) } }));
import Panel, { HarborOpeningGuide } from "../src/components/world/HarborOpeningPanel";
import OnboardingGuide from "../src/components/OnboardingGuide";
let root, container;
const cmd = (name, p = {}) => applyCommand(fixture.state, name, p).result as any;
const a = () => fixture.state.world.harborOpening;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  fixture.state = createInitialState({ onboarding: true }).state;
  fixture.busy = false; fixture.backgroundAdvance = null;
  fixture.showToast.mockReset(); fixture.send.mockReset();
  fixture.send.mockImplementation(async (name, p) => cmd(name, p));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function render(component = Panel, props = {}) {
  await act(async () => root.render(React.createElement(MemoryRouter, {}, React.createElement(component, props))));
}
function button(text) {
  const found = Array.from(container.querySelectorAll("button")).find((b: HTMLButtonElement) => b.textContent.includes(text));
  expect(found, text).toBeTruthy(); return found as HTMLButtonElement;
}
function finishTrip(id) {
  const r = cmd("startTransport", { orderId: id, driverId: "d1", vehicleId: "v1" });
  cmd("advanceTime", { minutes: r.endMin - fixture.state.gameTime });
}
it("introduces Anna before accepting a transport and clearly discloses starting the world", async () => {
  await render();
  expect(container.textContent).toContain("Noch keine Kosten");
  expect(container.textContent).toContain("Ausschreibungen");
  await act(async () => button("Anna zuhören").click());
  expect(fixture.send).toHaveBeenCalledExactlyOnceWith("startHarborOpening", {});
  await render();
  expect(container.textContent).toContain("Eine Rampe, zwei Möglichkeiten");
  expect(container.textContent).toContain("90 € sofort");
  expect(container.textContent).toContain("Fristen ab deiner Zusage");
});
it("shows both choices, rejects repeated clicks while awaiting a response and displays an error", async () => {
  cmd("startHarborOpening"); await render();
  let reject;
  fixture.send.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
  await act(async () => { button("So zusagen").click(); button("So zusagen").click(); });
  expect(fixture.send).toHaveBeenCalledTimes(1);
  await act(async () => reject(Error("Sitzung gewechselt")));
  expect(fixture.showToast).toHaveBeenCalledWith("Sitzung gewechselt", "error");
  expect(a().status).toBe("briefing");
  expect(button("So zusagen").disabled).toBe(false);
});
it("disables costly choices and business decisions while busy or at an appointment", async () => {
  cmd("startHarborOpening"); fixture.state.company.accountCents = 0;
  await render();
  const choices = Array.from(container.querySelectorAll("button")).filter((b: HTMLButtonElement) => b.textContent.includes("So zusagen")) as HTMLButtonElement[];
  expect(choices[0].disabled).toBe(true); expect(choices[1].disabled).toBe(false);
  fixture.state.appointments.push({ status: "active", type: "leisure" });
  await render(); expect(button("So zusagen").disabled).toBe(true);
  expect(container.textContent).toContain("persönlichen Termin");
  fixture.state.appointments = []; fixture.backgroundAdvance = { active: true };
  await render(); expect(button("So zusagen").disabled).toBe(true);
});
it("links to the actual order before start and actual trip while driving", async () => {
  cmd("startHarborOpening");
  const { orderId } = cmd("chooseHarborHandover", { choiceId: "coordinated" });
  await render();
  expect(container.querySelector('a[href="/disposition?order=' + orderId + '"]')).toBeTruthy();
  expect(container.textContent).toContain("Abholung ab Tag 1, 09:30");
  cmd("startTransport", { orderId, driverId: "d1", vehicleId: "v1" });
  await render();
  const trip = fixture.state.trips.find(t => t.orderId === orderId);
  expect(container.querySelector('a[href="/disposition?trip=' + trip.id + '"]')).toBeTruthy();
  expect(container.textContent).toContain("Klaus Werner");
  await render(HarborOpeningGuide, { state: fixture.state });
  expect(container.textContent).toContain("Fahrt verfolgen");
});
it("shows real results and an optional return, then preserves a completed recap", async () => {
  cmd("startHarborOpening");
  const first = cmd("chooseHarborHandover", { choiceId: "priority" }).orderId; finishTrip(first);
  await render();
  expect(container.textContent).toContain("Pünktlich geliefert");
  expect(container.textContent).toContain("Vergütung ist Umsatz");
  expect(container.textContent).toContain("90,00");
  expect(button("Rückladung zusagen")).toBeTruthy();
  const second = cmd("acceptHarborReturn").orderId; finishTrip(second);
  await render();
  expect(container.textContent).toContain("NordSprint");
  expect(container.textContent).toContain("720,00");
  await act(async () => button("Rückmeldung abschließen").click());
  await render();
  expect(container.querySelector('a[href="/spielwelt"]')).toBeTruthy();
  await render(Panel, { showCompleted: true });
  expect(container.textContent).toContain("650,00");
  expect(container.textContent).toContain("720,00");
});
it("does not offer a return or celebrate a cancelled delivery", async () => {
  cmd("startHarborOpening");
  const id = cmd("chooseHarborHandover", { choiceId: "priority" }).orderId;
  cmd("cancelOrder", { orderId: id });
  await render();
  expect(container.textContent).toContain("Nicht geliefert");
  expect(container.textContent).not.toContain("Rückladung zusagen");
  expect(container.textContent).not.toContain("Pünktlich geliefert");
});
it("directs onboarding to Anna and follows the active story instead of showing conflicting instructions", async () => {
  await render(OnboardingGuide);
  expect(container.textContent).toContain("Anna wartet in deinem Büro");
  cmd("startHarborOpening");
  await render(OnboardingGuide);
  expect(container.textContent).toContain("Anna wartet auf deine Entscheidung");
  expect(container.textContent).not.toContain("Schritt 1 / 5");
});
it("keeps the optional invitation out of progressed stories and active scenarios", async () => {
  cmd("startWorld"); cmd("chooseWorldStory", { storyId: "harbor", stage: 0, choiceId: "listen" });
  await render(); expect(container.textContent).toBe("");
  fixture.state = createInitialState({}).state; fixture.state.scenario = { status: "active" };
  await render(); expect(container.textContent).toBe("");
});
it("renders all stages without missing values (optional visual-review export)", () => {
  const pages = [];
  const capture = label => {
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, {}, React.createElement(Panel, { showCompleted: true })));
    expect(html).not.toMatch(/>undefined<|>NaN<|Invalid Date/);
    pages.push({ label, html });
  };
  capture("Einladung");
  cmd("startHarborOpening"); capture("Übergabe");
  const id = cmd("chooseHarborHandover", { choiceId: "priority" }).orderId; capture("Disposition");
  finishTrip(id); capture("Rückmeldung");
  const second = cmd("acceptHarborReturn").orderId; finishTrip(second);
  capture("Finale"); cmd("finishHarborOpening"); capture("Erinnerung");
  if (process.env.ANNA_PREVIEW_DIR) {
    mkdirSync(process.env.ANNA_PREVIEW_DIR, { recursive: true });
    writeFileSync(process.env.ANNA_PREVIEW_DIR + "/stages.json", JSON.stringify(pages));
  }
});
