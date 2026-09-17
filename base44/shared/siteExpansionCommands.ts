// Standortausbau-Befehls-Handler für FERNWERK.
// Routet Ausbau-Befehle an die Standortausbau-Engine.
// Wird von simulationEngine.ts im default-case aufgerufen.

import {
  previewExpansion,
  startExpansion,
  getSiteOverview,
  checkParkingCapacity,
  findBranchWithCapacity,
  reserveParkingSlot,
  releaseReservation,
  getActiveProject,
  EXPANSION_CONFIG,
} from "./siteExpansionEngine.ts";

export function handleSiteExpansionCommand(state, command, p) {
  switch (command) {
    case "previewSiteExpansion":
      return previewExpansion(state, { branchId: p.branchId, type: p.type, slots: p.slots });
    case "startSiteExpansion":
      return startExpansion(state, { branchId: p.branchId, type: p.type, slots: p.slots, employeeId: p.employeeId });
    case "getSiteOverview":
      return { ok: true, overview: getSiteOverview(state, p.branchId) };
    case "checkParkingCapacity":
      return { ok: true, ...checkParkingCapacity(state, p.branchId, p.additionalCount || 1) };
    case "findBranchWithCapacity":
      return { ok: true, branch: findBranchWithCapacity(state, p.city, p.count || 1) };
    case "getExpansionConfig":
      return { ok: true, config: EXPANSION_CONFIG };
    default:
      return null;
  }
}