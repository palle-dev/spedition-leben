import { describe, it, expect } from "vitest";
import { createInitialState, applyCommand } from "@/lib/simulation/simulationEngine";
import { createInitialState as createRemoteState } from "../base44/shared/simulationEngine";
import { prepareLoadedState } from "@/lib/saveSafety";

const profiles = [
  ["relaxed", 1_000_000, 12_000_000],
  ["standard", 750_000, 7_500_000],
  ["demanding", 500_000, 5_000_000],
] as const;

describe("Privates Startkapital", () => {
  it.each(profiles)("startet %s lokal und im Backend mit dem vereinbarten Kapital", (id, privateCents, companyCents) => {
    for (const create of [createInitialState, createRemoteState]) {
      const { state } = create({ difficultyProfileId: id });
      expect(state.private.accountCents).toBe(privateCents);
      expect(state.company.accountCents).toBe(companyCents);
    }
  });
  it.each(profiles)("erhält beim Laden und Migrieren von %s das vorhandene Guthaben", (id) => {
    const original = createInitialState({ difficultyProfileId: id }).state;
    original.private.accountCents = 9_876_543;
    const loaded = prepareLoadedState(original);
    applyCommand(loaded, "advanceTime", { minutes: 0 });
    expect(loaded.private.accountCents).toBe(9_876_543);
    delete loaded.difficulty;
    applyCommand(loaded, "advanceTime", { minutes: 0 });
    expect(loaded.private.accountCents).toBe(9_876_543);
    expect(original.private.accountCents).toBe(9_876_543);
  });
  it("verwendet ohne Profilauswahl 7.500 Euro Privatkapital", () => {
    expect(createInitialState({}).state.private.accountCents).toBe(750_000);
  });
});
