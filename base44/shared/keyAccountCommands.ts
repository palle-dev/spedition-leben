// Befehls-Handler für Großkunden und Konkurrenten-Verhalten.
// Aus simulationEngine.ts extrahiert, um die Dateigröße zu reduzieren.

import {
  getKeyAccountOverview, getKeyAccountContractDetails,
  acceptKeyAccountContract, terminateKeyAccountContract,
} from "./keyAccountEngine.ts";
import {
  getRivalBehaviorOverview,
  respondToPoachingAttempt, respondToCooperationOffer,
} from "./rivalBehaviorEngine.ts";

export function handleKeyAccountCommand(state, command, p) {
  switch (command) {
    case "getKeyAccountOverview": {
      return { ok: true, ...getKeyAccountOverview(state) };
    }

    case "getKeyAccountContractDetails": {
      const details = getKeyAccountContractDetails(state, p.contractId);
      if (!details) throw new Error("Großkunden-Vertrag nicht gefunden.");
      return { ok: true, ...details };
    }

    case "acceptKeyAccountContract": {
      const r = acceptKeyAccountContract(state, p.contractId);
      return r;
    }

    case "terminateKeyAccountContract": {
      const r = terminateKeyAccountContract(state, p.contractId);
      return r;
    }

    case "getRivalBehaviorOverview": {
      return { ok: true, ...getRivalBehaviorOverview(state) };
    }

    case "respondToPoachingAttempt": {
      const r = respondToPoachingAttempt(state, p.attemptId, p.response);
      return r;
    }

    case "respondToCooperationOffer": {
      const r = respondToCooperationOffer(state, p.offerId, p.response);
      return r;
    }

    default:
      return null;
  }
}