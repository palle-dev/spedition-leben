import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import DispatchTourDetails from "../src/components/dispatch/DispatchTourDetails";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";

function text(state, trip) {
  return renderToStaticMarkup(React.createElement(DispatchTourDetails, {
    state, trip, routeData: {}, onBack() {}, onShowOnMap() {}, onShowVehicle() {},
  }));
}

it("predicts the same remaining work as both real Anna deliveries", () => {
  const state = createInitialState({}).state;
  const cmd = (name, p = {}) => applyCommand(state, name, p).result as any;
  cmd("startHarborOpening");
  const outbound = cmd("chooseHarborHandover", { choiceId: "priority" }).orderId;
  for (let leg = 0; leg < 2; leg++) {
    const orderId = leg === 0 ? outbound : cmd("acceptHarborReturn").orderId;
    const result = cmd("startTransport", { orderId, driverId: "d1", vehicleId: "v1" });
    const trip = state.trips.find(t => t.orderId === orderId);
    const before = text(state, trip);
    cmd("advanceTime", { minutes: result.endMin - state.gameTime });
    const driver = state.drivers.find(d => d.id === "d1");
    const expected = leg === 0 ? 245 : 10;
    expect(480 - driver.workMinutesSinceRest).toBe(expected);
    expect(before).toContain("Arbeitsbudget nach Abschluss: " + expected + " min verbleibend");
  }
});

function fixture(phases, initialWork = 0, legacyMode = false) {
  const state = createInitialState({}).state;
  const driver = state.drivers.find(d => d.id === "d1");
  driver.status = "on_trip";
  driver.workMinutesSinceRest = initialWork;
  const trip = { id: "budget", driverId: "d1", vehicleId: "v1", phases, currentPhase: 0,
    initialCounters: { workMin: initialWork, driveMin: 0 }, legacyMode, endMin: 2000,
    paymentCents: 0, fuelCents: 0, tollCents: 0 };
  return { state, trip };
}

it("announces rest when the tour exhausts the work budget", () => {
  const { state, trip } = fixture([{ type: "loading", durationMin: 60, startMin: 0, endMin: 60 }], 420);
  expect(text(state, trip)).toContain("für 12 Stunden (erschöpftes Arbeitsbudget)");
  expect(text(state, trip)).not.toContain("kein Ruhezeitbedarf");
});

it("accounts for a daily rest, breaks and waiting without counting them as work", () => {
  const phases = [
    { type: "loading", durationMin: 60 },
    { type: "daily_rest", durationMin: 720 },
    { type: "loading", durationMin: 60 },
    { type: "wait", durationMin: 90 },
    { type: "break", durationMin: 45 },
    { type: "unloading", durationMin: 60 },
  ].map((p, i) => ({ ...p, startMin: i * 800, endMin: i * 800 + p.durationMin }));
  const { state, trip } = fixture(phases, 400);
  expect(text(state, trip)).toContain("Arbeitsbudget nach Abschluss: 360 min verbleibend");
  // Stored start counters remain authoritative if the driver object changes.
  state.drivers.find(d => d.id === "d1").workMinutesSinceRest = 470;
  expect(text(state, trip)).toContain("Arbeitsbudget nach Abschluss: 360 min verbleibend");
});

it("shows waiting and charging as stationary phases without invented routes", () => {
  for (const type of ["wait", "charging"]) {
    const { state, trip } = fixture([{ type, durationMin: 60, startMin: 0, endMin: 60 }]);
    const html = text(state, trip);
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("Routenverlauf für einen Abschnitt");
    expect(html).not.toContain("→");
    expect(html).not.toContain(">" + type + "<");
    if (type === "wait") expect(html.match(/Warten auf Ladefenster/g)).toHaveLength(2);
  }
});

it("still warns when a driving phase has no route geometry", () => {
  const { state, trip } = fixture([
    { type: "wait", durationMin: 60, startMin: 0, endMin: 60 },
    { type: "loaded_drive", fromCity: "Hamburg", toCity: "Bremen", durationMin: 115, startMin: 60, endMin: 175 },
  ]);
  const html = text(state, trip);
  expect(html).toContain("Routenverlauf für einen Abschnitt");
  expect(html).toContain("Hamburg → Bremen");
  expect(html).not.toContain("undefined");
});

it("keeps the actual mandatory rest for legacy trips visible", () => {
  const { state, trip } = fixture([{ type: "loading", durationMin: 60, startMin: 0, endMin: 60 }], 0, true);
  expect(text(state, trip)).toContain("für 12 Stunden (älterer Tourplan)");
  expect(text(state, trip)).not.toContain("kein Ruhezeitbedarf");
});
