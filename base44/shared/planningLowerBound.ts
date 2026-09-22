import { getDistance, driveMinutes } from './gameRules.ts';
import { governedTransport } from './dachEngine.ts';
import { normalizeDriverLedger } from './dachRules.ts';
import { getEffectiveLoadMin, getEffectiveUnloadMin } from './dangerousGoodsEngine.ts';

// Optimistic lower bound only: ignores breaks, driving bans, charging, customs
// and congestion. It may keep impossible candidates, but must never reject a
// feasible one. Weekly driving quotas cannot recover before the next week;
// deliberately do NOT impose mandatory rest here (loading can cross midnight).
export function optimisticDeliveryEnd(state, order, startCity, startMin, counters, electric = false) {
  const governed = governedTransport(state, order);
  let drivingFrom = startMin;
  if (governed && counters.regulation) {
    const ledger = normalizeDriverLedger(counters.regulation, startMin);
    if (ledger.thisWeek >= 3360 || ledger.thisWeek + ledger.previousWeek >= 5400) {
      drivingFrom = (Math.floor(startMin / 10080) + 1) * 10080;
    }
  }
  const emptyKm = startCity === order.fromCity ? 0 : getDistance(startCity, order.fromCity);
  const loadedKm = getDistance(order.fromCity, order.toCity);
  // Regulatory steps use one minute/km; legacy steps use driveMinutes.
  // Charging routes can use different intermediate cities and rounded lengths.
  // Use zero driving duration for EVs rather than assume a direct-route bound.
  const minutes = km => electric ? 0 : governed ? km : driveMinutes(km);
  const arrival = emptyKm > 0 ? Math.max(startMin, drivingFrom) + minutes(emptyKm) : startMin;
  const loadingStart = Math.max(arrival, order.earliestPickupMin || 0);
  const loaded = loadingStart + getEffectiveLoadMin(order);
  const delivery = (loadedKm > 0 ? Math.max(loaded, drivingFrom) + minutes(loadedKm) : loaded) + getEffectiveUnloadMin(order);
  return { loadingStart, delivery };
}
