// Zeitabhängige Aufbewahrung wird genau am Tageswechsel ausgeführt.
// Finanzjournal und offene Vorgänge werden nicht gekürzt.
const DAY = 1440;
const DONE = new Set(["geliefert", "storniert", "expired", "failed"]);
export function cleanupHistory(state, m) {
  const retained = (at, days) => at == null || at >= m - days * DAY;
  state.trips = (state.trips || []).filter(t => t.status === "in_progress" || retained(t.endMin, 7));
  state.tours = (state.tours || []).filter(t => {
    if (["active", "planned"].includes(t.status)) return true;
    const ends = [...(t.deployments || []), t.returnDeployment].filter(Boolean)
      .map(d => d.actualEndMin ?? d.endMin ?? 0);
    return retained(t.completedAtMin ?? t.cancelledAtMin ?? Math.max(t.createdAt || 0, ...ends), 7);
  });
  const referencedOrders = new Set();
  for (const t of state.trips) if (t.orderId) referencedOrders.add(t.orderId);
  for (const t of state.tours) for (const d of t.deployments || []) if (d.orderId) referencedOrders.add(d.orderId);
  state.orders = (state.orders || []).filter(o => !DONE.has(o.status) || referencedOrders.has(o.id) ||
    retained(o.deliveredAtMin ?? o.failedAtMin ?? o.cancelledAtMin ?? o.acceptDeadlineMin ?? o.acceptedAtMin, 30));
  state.appointments = (state.appointments || []).filter(a => ["pending", "accepted", "active"].includes(a.status) || retained(a.endMin, 30));
  if (state.bookings?.length > 200) state.bookings = state.bookings.slice(-200);
  if (state.accounting?.receipts?.length > 200) state.accounting.receipts = state.accounting.receipts.slice(-200);
  if (state.events) state.events = state.events.filter(e => !e.seen || retained(e.gameTime, 1));
  const mail = state.mail;
  if (mail) {
    const recent = new Set(mail.messages.slice(-300).map(msg => msg.id));
    mail.messages = mail.messages.filter(msg => recent.has(msg.id) || msg.starred || (!msg.isOutgoing && !msg.read));
    const messages = new Map(mail.messages.map(msg => [msg.id, msg]));
    for (const conv of mail.conversations) {
      conv.messageIds = conv.messageIds.filter(id => messages.has(id));
      conv.unreadCount = conv.messageIds.filter(id => !messages.get(id).isOutgoing && !messages.get(id).read).length;
    }
    mail.conversations = mail.conversations.filter(c => c.messageIds.length > 0 || c.decisionRequired);
    mail.staffTasks = [...mail.staffTasks.filter(t => t.status === "pending"), ...mail.staffTasks.filter(t => t.status !== "pending").slice(-50)];
  }
}
