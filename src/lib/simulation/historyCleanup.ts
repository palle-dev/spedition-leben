import { retainHistory, retainLatestHistory, preserveHistory } from "./historyRetention.ts";
// Retention controls the active working set only. Removed originals are placed
// in a lossless outbox before any reference is dropped.
const DAY = 1440;
const DONE = new Set(["geliefert", "storniert", "expired", "failed"]);
export function cleanupHistory(state, m) {
  const retained = (at, days) => at == null || at >= m - days * DAY;
  const keep = (kind, rows, predicate) => retainHistory(state, kind, rows || [], (rows || []).filter(predicate));
  state.trips = keep("trips", state.trips, t => t.status === "in_progress" || retained(t.endMin, 7));
  state.tours = keep("tours", state.tours, t => {
    if (["active", "planned"].includes(t.status)) return true;
    const ends = [...(t.deployments || []), t.returnDeployment].filter(Boolean).map(d => d.actualEndMin ?? d.endMin ?? 0);
    return retained(t.completedAtMin ?? t.cancelledAtMin ?? Math.max(t.createdAt || 0, ...ends), 7);
  });
  const referencedOrders = new Set();
  for (const t of state.trips) if (t.orderId) referencedOrders.add(t.orderId);
  for (const t of state.tours) for (const d of t.deployments || []) if (d.orderId) referencedOrders.add(d.orderId);
  state.orders = keep("orders", state.orders, o => !DONE.has(o.status) || referencedOrders.has(o.id) ||
    retained(o.deliveredAtMin ?? o.failedAtMin ?? o.cancelledAtMin ?? o.acceptDeadlineMin ?? o.acceptedAtMin, 30));
  state.appointments = keep("appointments", state.appointments, a => ["pending", "accepted", "active"].includes(a.status) || retained(a.endMin, 30));
  if (state.bookings) state.bookings = retainLatestHistory(state, "bookings", state.bookings, 200);
  if (state.accounting?.receipts) state.accounting.receipts = retainLatestHistory(state, "receipts", state.accounting.receipts, 200);
  if (state.events) state.events = keep("events", state.events, e => !e.seen || retained(e.gameTime, 1));
  const mail = state.mail;
  if (mail) {
    const recent = new Set(mail.messages.slice(-300).map(msg => msg.id));
    mail.messages = keep("mailMessages", mail.messages, msg => recent.has(msg.id) || msg.starred || (!msg.isOutgoing && !msg.read));
    const messages = new Map(mail.messages.map(msg => [msg.id, msg]));
    for (const conv of mail.conversations) {
      const ids = conv.messageIds.filter(id => messages.has(id));
      if (ids.length !== conv.messageIds.length) preserveHistory(state, "mailConversationVersions", [conv]);
      conv.messageIds = ids;
      conv.unreadCount = ids.filter(id => !messages.get(id).isOutgoing && !messages.get(id).read).length;
    }
    mail.conversations = keep("mailConversations", mail.conversations, c => c.messageIds.length > 0 || c.decisionRequired);
    mail.staffTasks = retainHistory(state, "mailTasks", mail.staffTasks,
      [...mail.staffTasks.filter(t => t.status === "pending"), ...mail.staffTasks.filter(t => t.status !== "pending").slice(-50)]);
  }
}
