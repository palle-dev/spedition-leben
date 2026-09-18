import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, it, expect, vi } from "vitest";
import { createInitialState, applyCommand } from "../src/lib/simulation/simulationEngine";

const fixture = vi.hoisted(() => ({ state: null as any }));
vi.mock("@/lib/gameContext", () => ({
  useGame: () => ({ state: fixture.state, send: vi.fn(), showToast: vi.fn(), busy: false, backgroundAdvance: null }),
}));
import GameWorld from "../src/pages/GameWorld";
import WorldTeaser from "../src/components/world/WorldTeaser";
function render(view = "stories") {
  return renderToStaticMarkup(React.createElement(StaticRouter, { location: "/spielwelt?view=" + view }, React.createElement(GameWorld)));
}
describe("Spielwelt-Oberfläche", () => {
  it("renders a safe entry for a legacy save without world data", () => {
    fixture.state = createInitialState({}).state;
    const html = render();
    expect(html).toContain("Spielwelt betreten");
    expect(html).toContain("ab deiner jetzigen Spielzeit");
  });
  it("renders all views for active and saved long-running states", () => {
    fixture.state = createInitialState({}).state;
    applyCommand(fixture.state, "startWorld", {});
    for (const view of ["stories", "competition", "chronicle"]) {
      const html = render(view);
      expect(html).toContain("Zwischen Hafen");
      expect(html).not.toContain(">undefined<");
      expect(html).not.toContain(">NaN<");
    }
    expect(render("competition")).toContain("Hansen &amp; Tochter");
    expect(render("competition")).toContain("Bei Gewinn wird der Auftrag verbindlich angenommen");
    expect(render("chronicle")).toContain("Willkommen am Kai");
    for (let i = 0; i < 6; i++) applyCommand(fixture.state, "advanceTime", { minutes: 1440 });
    fixture.state = JSON.parse(JSON.stringify(fixture.state));
    expect(render()).toContain("Ein Angebot aus Bremen");
    expect(render()).toContain("Ein Platz bleibt leer");
    expect(render()).toContain("Rost an der alten Fähre");
  });
  it("renders the appointment, its cancellation action and the recorded cause", () => {
    fixture.state = createInitialState({}).state;
    applyCommand(fixture.state, "startWorld", {});
    for (let i = 0; i < 3; i++) applyCommand(fixture.state, "advanceTime", { minutes: 1440 });
    applyCommand(fixture.state, "chooseWorldStory", { storyId: "home", stage: 0, choiceId: "evening" });
    expect(render()).toContain("Im Kalender:");
    expect(render()).toContain("Termin absagen");
    expect(render("chronicle")).toContain("Geht zurück auf:");
  });
  it("disables unaffordable decisions and renders completed endings", () => {
    fixture.state = createInitialState({}).state;
    applyCommand(fixture.state, "startWorld", {});
    fixture.state.company.accountCents = 0;
    expect(render()).toContain("Das Firmenkonto reicht dafür nicht.");
    fixture.state.world.stories.harbor = { ...fixture.state.world.stories.harbor, stage: 4, status: "done", ending: "Partner des Nordens" };
    expect(render()).toContain("Partner des Nordens");
  });
  it("links the office overview to the new world and reports waiting decisions", () => {
    fixture.state = createInitialState({}).state;
    applyCommand(fixture.state, "startWorld", {});
    const html = renderToStaticMarkup(React.createElement(StaticRouter, { location: "/" }, React.createElement(WorldTeaser, { state: fixture.state })));
    expect(html).toContain('href="/spielwelt"');
    expect(html).toContain("1 offene Entscheidungen");
    expect(html).toContain("2 Ausschreibungen");
  });
});
