// Befehls-Handler für Akquise und Verhandlungen.
// Folgt dem gleichen Pattern wie handleCustomerCommand, handleDgCommand etc.

import {
  migrateAcquisition,
  getOutreachFeasibility, initiateOutreach, getOutreachStatus,
  getOpenTenders, getTenderDetails,
  calculateBidCosts, submitBid,
  startNegotiation, processNegotiationRound, getNegotiationStatus,
  checkCapacityAtAcceptance,
  getAcquisitionOverview,
} from "./acquisitionEngine.ts";

export function handleAcquisitionCommand(state, command, p) {
  switch (command) {
    case "getOutreachFeasibility": {
      const feasibility = getOutreachFeasibility(state, p.customerId);
      if (!feasibility) throw new Error("Kunde nicht gefunden.");
      return { ok: true, feasibility };
    }

    case "getOutreachStatus": {
      const status = getOutreachStatus(state, p.customerId);
      return { ok: true, status };
    }

    case "initiateOutreach": {
      const r = initiateOutreach(state, p.customerId);
      return r;
    }

    case "getAcquisitionOverview": {
      const overview = getAcquisitionOverview(state);
      return { ok: true, overview };
    }

    case "getOpenTenders": {
      const tenders = getOpenTenders(state);
      return { ok: true, tenders };
    }

    case "getTenderDetails": {
      const details = getTenderDetails(state, p.tenderId);
      if (!details) throw new Error("Ausschreibung nicht gefunden.");
      return { ok: true, ...details };
    }

    case "calculateBid": {
      const details = getTenderDetails(state, p.tenderId);
      if (!details) throw new Error("Ausschreibung nicht gefunden.");
      const calculation = calculateBidCosts(state, details.tender, p.pricePerTransportCents);
      return { ok: true, calculation };
    }

    case "submitBid": {
      const r = submitBid(state, p.tenderId, p.pricePerTransportCents);
      return r;
    }

    case "startNegotiation": {
      const r = startNegotiation(state, p.tenderId);
      return r;
    }

    case "processNegotiationRound": {
      const r = processNegotiationRound(state, p.tenderId, p.action, p.proposedTerms || {});
      return r;
    }

    case "getNegotiationStatus": {
      const status = getNegotiationStatus(state, p.tenderId);
      if (!status) throw new Error("Keine aktive Verhandlung für diese Ausschreibung.");
      return { ok: true, ...status };
    }

    case "checkCapacityAtAcceptance": {
      const r = checkCapacityAtAcceptance(state, p.tenderId);
      return { ok: true, ...r };
    }

    default:
      return null;
  }
}