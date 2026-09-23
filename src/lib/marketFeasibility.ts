import { withTourValidation, futureLocation, futureDriverLocation, pendingTourResources } from "./simulation/tourEngine";
import { checkBodyTypeCompatibility, getDistance } from "./simulation/gameRules";
import { isActivelyEmployed } from "./simulation/terminationEngine";
import { isLeasingOverdueBlocked } from "./simulation/financingEngine";

export type MarketAssessment = {
  status: "on_time" | "late" | "unavailable" | "unchecked";
  label: string;
  detail: string;
};
const assessments: Record<MarketAssessment["status"], MarketAssessment> = {
  on_time: { status: "on_time", label: "Fristgerecht planbar", detail: "Mindestens eine eigene Fahrer-Lkw-Kombination kann diesen Auftrag aktuell fristgerecht ausführen. Die Zuordnung erfolgt in der Disposition." },
  late: { status: "late", label: "Nur verspätet planbar", detail: "Die geprüften ausführbaren Kombinationen überschreiten die Lieferfrist. Bei später Lieferung kann die Vergütung sinken." },
  unavailable: { status: "unavailable", label: "Derzeit nicht planbar", detail: "Mit dem aktuellen Flottenstand ist keine bestätigbare Kombination vorhanden. Prüfe Ressourcen, Ladefenster und Lieferfrist in der Disposition." },
  unchecked: { status: "unchecked", label: "In Dispo prüfen", detail: "Die Prüfung ist noch nicht vollständig. Öffne die Disposition für eine konkrete Fahrzeug- und Fahrerwahl." },
};

// Pure current-state view: never persist this assessment in an offer. Bound
// expensive phase planning for large fleets; an incomplete search is unknown,
// never a false promise or a claim that no suitable pair exists.
export function assessMarketOffers(state, offers = state.orders.filter(o => o.status === "offered")) {
  const results = new Map<string, MarketAssessment>();
  const committed = pendingTourResources(state);
  const statuses = new Set(["free", "resting", "on_trip"]);
  const vehicles = state.vehicles.filter(v => statuses.has(v.status) && v.condition >= 20 &&
    !v.markedForSale && !committed.has(v.id) && !isLeasingOverdueBlocked(state, v.id));
  const driversByCity = new Map<string, any[]>();
  for (const d of state.drivers) {
    if (!isActivelyEmployed(d) || d.attendance === "released" || !statuses.has(d.status) || committed.has(d.id)) continue;
    const city = futureDriverLocation(state, d);
    if (!driversByCity.has(city)) driversByCity.set(city, []);
    driversByCity.get(city)!.push(d);
  }
  const vehicleCities = new Map<string, string>(vehicles.map(v => [v.id, futureLocation(state, v)]));
  let totalChecks = 0;
  return withTourValidation(state, validate => {
    for (const offer of offers) {
      let status: MarketAssessment["status"] = "unavailable";
      let checks = 0;
      if (offer.status !== "offered" || offer.acceptDeadlineMin <= state.gameTime) {
        results.set(offer.id, assessments.unavailable);
        continue;
      }
      const candidates = vehicles.filter(v => v.capacityTons >= offer.tons && checkBodyTypeCompatibility(offer, v).ok)
        .sort((a, b) => getDistance(vehicleCities.get(a.id), offer.fromCity) - getDistance(vehicleCities.get(b.id), offer.fromCity));
      search: for (const v of candidates) {
        for (const d of driversByCity.get(vehicleCities.get(v.id)) || []) {
          if (checks >= 64 || totalChecks >= 1024) { status = "unchecked"; break search; }
          checks++; totalChecks++;
          const result = validate({ vehicleId: v.id, driverId: d.id, orderIds: [offer.id] });
          if (!result) continue;
          if (result.plan.deployments.every(dep => dep.endMin <= offer.deliveryDeadlineMin)) {
            status = "on_time"; break search;
          }
          status = "late";
        }
      }
      results.set(offer.id, assessments[status]);
    }
    return results;
  });
}
