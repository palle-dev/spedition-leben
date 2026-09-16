// Befehls-Handler für den Gebrauchtfahrzeugmarkt.
// Aus simulationEngine.ts extrahiert, um die Dateigröße zu reduzieren.

import { buyUsedVehicle, getUsedVehicleMarket } from "./vehicleMarketEngine.ts";
import { checkAchievements } from "./progressEngine.ts";

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
    default:
      return null;
  }
}