// Planungs-Befehls-Handler für die Wochenplanung.
// Routet Planungs-Befehle an die Planungs-Engine.
// Wird von simulationEngine.ts im default-case aufgerufen.

import {
  reassignTour, previewReassignTour,
  rescheduleMaintenance,
  findResourcesForOrder, findMaintenanceWindows,
} from "./planningEngine.ts";

export function handlePlanningCommand(state, command, p) {
  switch (command) {
    case "previewReassignTour":
      return previewReassignTour(state, p);
    case "reassignTour":
      return reassignTour(state, p);
    case "rescheduleMaintenance":
      return rescheduleMaintenance(state, p);
    case "findResourcesForOrder":
      return findResourcesForOrder(state, p.orderId);
    case "findMaintenanceWindows":
      return findMaintenanceWindows(state, p.vehicleId);
    default:
      return null;
  }
}