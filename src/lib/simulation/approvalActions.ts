// Führt eine ausdrücklich freigegebene Aktion nach erneuter Fachprüfung aus.
import { createApprovedMaintenanceOrder } from "./workshopEngine.ts";
import { previewPartnerBooking, bookPartnerTransport } from "./partnerEngine.ts";
import { previewExpansion, startExpansion } from "./siteExpansionEngine.ts";
import { buildTourPlan, confirmTour, _clearPlanCache } from "./tourEngine.ts";
import { recordSpend, logDecision } from "./delegationEngine.ts";

function checkApprovedCost(req, cost) {
  if (!Number.isSafeInteger(cost) || cost < 0 || !Number.isSafeInteger(req.costCents) || cost > req.costCents) {
    throw new Error("Kosten übersteigen den freigegebenen Betrag. Anfrage ablehnen und mit aktuellen Kosten erneut anfordern.");
  }
}
const obsolete = reason => ({ ok: false, superseded: true, reason });

export function executeApprovedAction(state, req) {
  if (req.type === "maintenance") return createApprovedMaintenanceOrder(state, req);
  const data = req.actionData || {};
  let result, cost;
  if (data.type === "partner_booking") {
    const preview = previewPartnerBooking(state, data);
    if (!preview.ok) return obsolete(preview.error);
    cost = preview.priceCents;
    checkApprovedCost(req, cost);
    // Die ausdrückliche Spielerfreigabe ersetzt nur das Mitarbeiterbudget.
    // Fachprüfungen (Vertrag, Kapazität, Angebot, Liquidität) bleiben im Buchungsweg.
    result = bookPartnerTransport(state, { orderId: data.orderId, partnerId: data.partnerId, employeeId: null });
    const transport = state.partners.transports.find(t => t.id === result.transportId);
    transport.employeeId = req.employeeId;
    transport.employeeName = req.employeeName;
  } else if (data.type === "site_expansion") {
    const params = { branchId: data.branchId, type: data.expansionType, slots: data.slots };
    const preview = previewExpansion(state, params);
    if (!preview.ok) return obsolete(preview.error);
    cost = preview.costCents;
    checkApprovedCost(req, cost);
    result = startExpansion(state, { ...params, employeeId: null });
  } else if (data.type === "tour" || (data.vehicleId && data.driverId && Array.isArray(data.orderIds))) {
    _clearPlanCache();
    const plan = buildTourPlan(state, data);
    if (!plan.ok) return obsolete(plan.error);
    cost = plan.totalVariableCostCents;
    checkApprovedCost(req, cost);
    result = confirmTour(state, data);
    for (const id of data.orderIds) {
      const order = state.orders.find(o => o.id === id);
      if (order) { order.plannedById = req.employeeId; order.plannedByName = req.employeeName; }
    }
  } else {
    throw new Error("Für diese Freigabe ist keine ausführbare Aktion hinterlegt.");
  }
  if (!result?.ok) throw new Error(result?.error || "Freigegebene Aktion konnte nicht ausgeführt werden.");
  recordSpend(state, req.employeeId, cost, req.branchId);
  logDecision(state, { employeeId: req.employeeId, employeeName: req.employeeName,
    type: "approval_executed", summary: req.title, costCents: cost, auto: false });
  return result;
}
