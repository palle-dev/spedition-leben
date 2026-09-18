import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { SCENARIOS } from "@/lib/scenarios/scenarioCatalog";
import { executeCommand } from "@/lib/simulationAdapter";

const fixture = vi.hoisted(() => ({ state: null as any }));
vi.mock("@/lib/gameContext", () => ({ useGame: () => ({
  state: fixture.state, busy: false, newScenarioGame: vi.fn(),
  continueScenarioAsFreePlay: vi.fn(), openStartScreen: vi.fn(),
}) }));
import ScenarioPicker from "@/components/scenarios/ScenarioPicker";
import ScenarioProgressPanel from "@/components/scenarios/ScenarioProgressPanel";

describe("Szenario-Einstieg und Abschluss", () => {
  it("macht alle drei Szenarien mit Zielen und sicherem Partiewechsel sichtbar", () => {
    fixture.state = { company: { name: "Bestand" } };
    const html = renderToStaticMarkup(React.createElement(ScenarioPicker, { onClose: vi.fn() }));
    for (const scenario of SCENARIOS) expect(html).toContain(scenario.title);
    expect(html).toContain("Szenario starten");
    expect(html).toContain("eigener Speicherstand");
    expect(html).toContain("Ziele am Stichtag");
  });
  it.each(SCENARIOS.map(s => [s.id, s.durationDays]))("%s erreicht den Stichtag und zeigt ein speicherbares Ergebnis", async (id, days) => {
    let data = await executeCommand(null, "newScenarioGame", { scenarioId: id });
    expect(data.error).toBeUndefined();
    const deadline = data.state.scenario.deadlineMin;
    fixture.state = data.state;
    expect(renderToStaticMarkup(React.createElement(ScenarioProgressPanel))).toContain("Verbindliche Ziele");
    for (let day = 0; day < Number(days); day++) {
      data = await executeCommand(data.state, "advanceTime", { minutes: 1440 });
      expect(data.error).toBeUndefined();
    }
    expect(data.state.scenario.status).not.toBe("active");
    expect(data.state.scenario.result.evaluatedAtMin).toBe(deadline);
    fixture.state = JSON.parse(JSON.stringify(data.state));
    const html = renderToStaticMarkup(React.createElement(ScenarioProgressPanel));
    expect(html).toContain("Als freies Spiel weiterspielen");
    expect(html).toContain("Zur Spielauswahl");
    const result = structuredClone(fixture.state.scenario.result);
    const next = await executeCommand(fixture.state, "advanceTime", { minutes: 60 });
    expect(next.error).toBeUndefined();
    expect(next.state.scenario.result).toEqual(result);
    const free = await executeCommand(next.state, "continueScenarioAsFreePlay", {});
    expect(free.error).toBeUndefined();
    expect(free.state.scenario).toBeNull();
    expect(free.state.company.name).toBe(next.state.company.name);
  });
});
