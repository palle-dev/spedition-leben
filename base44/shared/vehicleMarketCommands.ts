// Befehls-Handler für Fahrzeugmarkt- und Analyse-Befehle.
// Aus simulationEngine.ts extrahiert, um die Dateigröße zu reduzieren.

import { buyUsedVehicle, getUsedVehicleMarket } from "./vehicleMarketEngine.ts";
import { checkAchievements } from "./progressEngine.ts";
import {
  getVehicleOperatingCosts, getAllVehicleOperatingCosts,
  getFinancingComparison, getReplacementHints, compareVehicleWithOffer,
} from "./vehicleAnalysisEngine.ts";

export function handleVehicleMarketCommand(state, command, p) {
  switch (command) {
    case "getUsedVehicleMarket":
      return { ok: true, ...getUsedVehicleMarket(state) };
    case "buyUsedVehicle": {
      if (state.openCosts.some(o => o.account === "company"))
        throw new Error("Es gibt offene betriebliche Kosten. Bitte bezahle diese zuerst.");
      const r = buyUsedVehicle(state, { offerId: p.offerId, branchId: p.branchId });
      return { ...r, newAchievements: checkAchievements(state, state.gameTime) };
    }
    case "getVehicleOperatingCosts":
      return { ok: true, data: getVehicleOperatingCosts(state, p.vehicleId) };
    case "getAllVehicleOperatingCosts":
      return { ok: true, data: getAllVehicleOperatingCosts(state) };
    case "getFinancingComparison":
      return { ok: true, data: getFinancingComparison(state, { catalogId: p.catalogId, branchId: p.branchId }) };
    case "getReplacementHints":
      return { ok: true, hints: getReplacementHints(state) };
    case "compareVehicleWithOffer":
      return { ok: true, data: compareVehicleWithOffer(state, { vehicleId: p.vehicleId, offerId: p.offerId }) };
    default:
      return null;
  }
}