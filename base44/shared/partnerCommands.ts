// Partner-Befehls-Handler für FERNWERK.
// Routet Partner-Befehle an die Partner-Engine.
// Wird von simulationEngine.ts im default-case aufgerufen.

import {
  requestPartnerOffers,
  previewPartnerBooking,
  bookPartnerTransport,
  cancelPartnerTransport,
  getPartnerOverview,
  getActivePartnerTransports,
  getPartnerTransportForOrder,
} from "./partnerEngine.ts";

export function handlePartnerCommand(state, command, p) {
  switch (command) {
    case "requestPartnerOffers":
      return requestPartnerOffers(state, p.orderId);
    case "previewPartnerBooking":
      return previewPartnerBooking(state, { orderId: p.orderId, partnerId: p.partnerId });
    case "bookPartnerTransport":
      return bookPartnerTransport(state, { orderId: p.orderId, partnerId: p.partnerId, employeeId: p.employeeId });
    case "cancelPartnerTransport":
      return cancelPartnerTransport(state, { transportId: p.transportId });
    case "getPartnerOverview":
      return getPartnerOverview(state);
    case "getActivePartnerTransports":
      return { ok: true, transports: getActivePartnerTransports(state) };
    case "getPartnerTransportForOrder":
      return { ok: true, transport: getPartnerTransportForOrder(state, p.orderId) };
    default:
      return null;
  }
}