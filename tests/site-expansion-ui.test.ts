import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createInitialState, applyCommand } from "@/lib/simulation/simulationEngine";
import { startExpansion, previewExpansion, getSiteOverview, getReservedSlots, getTotalParkingSlots, processExpansionCompletion, EXPANSION_CONFIG } from "@/lib/simulation/siteExpansionEngine";
import { getAccountBalance } from "@/lib/simulation/accountingEngine";
const fixture = vi.hoisted(() => ({ state: null as any }));
vi.mock("@/lib/gameContext", () => ({ useGame: () => ({ state: fixture.state, busy: false, send: vi.fn(), showToast: vi.fn() }) }));
import SiteExpansionCard from "@/components/branches/SiteExpansionCard";
function initial() { const s = createInitialState({}).state; applyCommand(s, "advanceTime", { minutes: 0 }); return s; }

describe("Standortausbau", () => {
  it("rendert alte Spielstände ohne Mutation und mit korrekter Hauptsitz-Kapazität", () => {
    const s = initial();
    delete s.siteExpansion;
    for (const b of s.branches) { delete b.parkingSlotsBase; delete b.parkingSlotsExpanded; delete b.breakAreaLevel; }
    const before = structuredClone(s);
    expect(getSiteOverview(s, "b1").parking.total).toBe(8);
    expect(previewExpansion(s, { branchId: "b1", type: "breakArea" }).effectDescription).toContain("Stufe 1");
    fixture.state = s;
    const html = renderToStaticMarkup(React.createElement(SiteExpansionCard, { branchId: "b1" }));
    expect(html).toContain("Ausbau verbindlich beauftragen");
    expect(html).toContain("Stellplatz");
    expect(html).toContain("Werkstattplatz");
    expect(html).toContain("Aufenthaltsbereich");
    expect(s).toEqual(before);
  });
  it.each(["parking", "workshop", "breakArea"])("%s wirkt erst nach Bauende und wird nur einmal berechnet", type => {
    const s = initial();
    const b = s.branches[0], account = s.company.accountCents, daily = b.costPerDayCents;
    const parking = getTotalParkingSlots(s, b.id), workshop = s.workshop.slots.length;
    const preview = previewExpansion(s, { branchId: b.id, type, slots: 1 });
    applyCommand(s, "startSiteExpansion", { branchId: b.id, type, slots: 1 });
    expect(s.company.accountCents).toBe(account - preview.costCents);
    expect(getAccountBalance(s, "1000")).toBe(s.company.accountCents);
    expect(b.costPerDayCents).toBe(daily);
    expect(getTotalParkingSlots(s, b.id)).toBe(parking);
    expect(s.workshop.slots).toHaveLength(workshop);
    expect(() => startExpansion(s, { branchId: b.id, type: "parking" })).toThrow(/bereits/);
    const project = s.siteExpansion.projects[0];
    fixture.state = s;
    expect(renderToStaticMarkup(React.createElement(SiteExpansionCard, { branchId: b.id }))).toContain("im Bau");
    for (let i = 0; i < preview.buildTimeDays; i++) applyCommand(s, "advanceTime", { minutes: 1440 });
    expect(project.status).toBe("completed");
    expect(b.costPerDayCents).toBe(daily + preview.dailyCostCents);
    if (type === "parking") expect(getTotalParkingSlots(s, b.id)).toBe(parking + 1);
    if (type === "workshop") expect(s.workshop.slots).toHaveLength(workshop + 1);
    if (type === "breakArea") expect(b.breakAreaLevel).toBe(1);
    const after = structuredClone(s);
    processExpansionCompletion(s, s.gameTime, []);
    expect(s).toEqual(after);
  });
  it.each([NaN, Infinity, -1, 0, 1.5, 11])("weist ungültige Platzanzahl %s ohne Geldverlust ab", slots => {
    const s = initial(), before = structuredClone(s);
    expect(() => startExpansion(s, { branchId: "b1", type: "parking", slots })).toThrow();
    expect(s).toEqual(before);
  });
  it("sperrt unbezahlbare Projekte, volle Aufenthaltsbereiche und private Termine", () => {
    const s = initial();
    s.company.accountCents = 0;
    expect(() => startExpansion(s, { branchId: "b1", type: "parking" })).toThrow(/Firmenkonto/);
    fixture.state = s;
    expect(renderToStaticMarkup(React.createElement(SiteExpansionCard, { branchId: "b1" }))).toContain("Firmenkonto reicht");
    s.branches[0].breakAreaLevel = 2;
    expect(previewExpansion(s, { branchId: "b1", type: "breakArea" }).ok).toBe(false);
    s.company.accountCents = 1000000;
    s.appointments.push({ id: "block", status: "active", startMin: s.gameTime, endMin: s.gameTime + 60 });
    expect(() => applyCommand(s, "startSiteExpansion", { branchId: "b1", type: "parking" })).toThrow(/privaten Aktivität/);
  });
  it("zählt alle Plätze einer Sammelreservierung", () => {
    const s = initial();
    s.siteExpansion.reservations = [{ branchId: "b1", status: "active", count: 3 }];
    expect(getReservedSlots(s, "b1")).toBe(3);
  });
});

it("schützt laufende Bauprojekte beim Stilllegen einer Filiale", () => {
  const s = initial();
  s.branches.push({ ...structuredClone(s.branches[0]), id: "b2", city: "Bremen", name: "Bremen", isHeadquarters: false });
  applyCommand(s, "startSiteExpansion", { branchId: "b2", type: "parking", slots: 1 });
  expect(() => applyCommand(s, "closeBranch", { branchId: "b2" })).toThrow(/Bauprojekt/);
  expect(s.branches.find(b => b.id === "b2").status).toBe("active");
});
