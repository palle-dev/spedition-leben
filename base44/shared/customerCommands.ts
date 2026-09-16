// Befehls-Handler für Kundenbeziehungen und Rahmenverträge.
// Aus simulationEngine.ts extrahiert, um die Dateigröße zu reduzieren.
// Folgt dem gleichen Pattern wie handleDgCommand.

import {
  migrateContracts,
  generateContractOffer, acceptContract, terminateContractEarly,
  getCustomerSummary, getAllCustomerSummaries, estimateContractCapacity,
} from "./customerEngine.ts";
import { deliverMessage } from "./mailEngine.ts";
import { dayOf } from "./gameRules.ts";

export function handleCustomerCommand(state, command, p) {
  switch (command) {
    case "getCustomerSummaries": {
      return { ok: true, customers: getAllCustomerSummaries(state) };
    }

    case "getCustomerDetail": {
      const summary = getCustomerSummary(state, p.customerId);
      if (!summary) throw new Error("Kunde nicht gefunden.");
      let offer = null;
      if (summary.isStammkunde && !summary.activeContract) {
        try {
          const r = generateContractOffer(state, p.customerId);
          offer = r.contract;
          if (r.isNew) {
            deliverMessage(state, {
              fromId: "system", toId: "player",
              subject: "Rahmenvertragsangebot: " + summary.customer.name,
              body: `${summary.customer.name} ist nun Stammkunde und bietet einen Rahmenvertrag an.\n\n` +
                `Relation: ${r.contract.fromCity} → ${r.contract.toCity}\n` +
                `Fracht: ${r.contract.cargo}, ${r.contract.tons} t\n` +
                `Transporte pro Tag: ${r.contract.transportsPerDay}\n` +
                `Vergütung pro Transport: ${(r.contract.paymentPerTransportCents / 100).toFixed(2)} €\n` +
                `Laufzeit: Tag ${r.contract.startDay} bis Tag ${r.contract.endDay}\n\n` +
                `Prüfen Sie das Angebot in der Kundendetailansicht.`,
              gameTime: state.gameTime, category: "operations", priority: "normal",
              linkedRefs: { type: "contract", id: r.contract.id },
              dedupKey: `contract_offer:${r.contract.id}`,
            });
          }
        } catch (e) { /* Kunde nicht berechtigt */ }
      }
      if (summary.activeContract && summary.activeContract.status === "offered") {
        offer = summary.activeContract;
      }
      const capacity = offer ? estimateContractCapacity(state, offer) : null;
      return { ok: true, summary, offer, capacity };
    }

    case "acceptContract": {
      const r = acceptContract(state, p.contractId);
      return r;
    }

    case "terminateContract": {
      const r = terminateContractEarly(state, p.contractId);
      return r;
    }

    case "previewContractTermination": {
      if (!state.contracts) migrateContracts(state);
      const contract = state.contracts.contracts.find(c => c.id === p.contractId);
      if (!contract) throw new Error("Vertrag nicht gefunden.");
      if (contract.status !== "active") throw new Error("Nur aktive Verträge können beendet werden.");
      const remainingDays = Math.max(0, contract.endDay - dayOf(state.gameTime));
      const openOrders = state.orders.filter(o => o.contractId === contract.id && (o.status === "angenommen" || o.status === "unterwegs"));
      return {
        ok: true,
        contractId: contract.id,
        remainingDays,
        openOrderCount: openOrders.length,
        trustDelta: -6,
        consequences: `Vorzeitige Beendigung stoppt zukünftige Transporte. ${openOrders.length} offene Aufträge bleiben bestehen. Vertrauen: -6 Punkte.`,
      };
    }

    default:
      return null;
  }
}