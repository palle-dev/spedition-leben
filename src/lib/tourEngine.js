// Vorschauen verwenden die verbindliche Engine. Keine zweite Regelkopie.
import { buildTourPlan as plan, findReturnLoads as returns, _clearPlanCache } from "./simulation/tourEngine.ts";
export { earliestAvailable, nextReservationStart, futureLocation, futureDriverLocation,
  suggestTours } from "./simulation/tourEngine.ts";
export function buildTourPlan(state, opts) { _clearPlanCache(); return plan(state, opts); }
export function findReturnLoads(state, orderId, vehicleId, driverId) { _clearPlanCache(); return returns(state, orderId, vehicleId, driverId); }
