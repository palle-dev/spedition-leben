// Frontend-Hilfsfunktionen für Partner-Speditionen.
// Reine Berechnung aus dem Spielzustand — keine Zustandsänderungen.

import { PARTNER_CATALOG, getPartnerById } from "@/lib/simulation/partnerCatalog";

export function formatEuro(cents) {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function formatClock(min) {
  if (min == null) return "—";
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return (h < 10 ? "0" : "") + h + ":" + (mm < 10 ? "0" : "") + mm;
}

export function formatDay(min) {
  if (min == null) return "—";
  return "Tag " + (Math.floor(min / 1440) + 1);
}

export function formatDuration(min) {
  if (min == null || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return m + " Min";
  if (m === 0) return h + " Std";
  return h + " Std " + m + " Min";
}

// Transportstatus-Label
export function transportStatusLabel(status) {
  const labels = {
    booked: "Beauftragt",
    in_progress: "Unterwegs",
    completed: "Abgeschlossen",
    failed: "Gescheitert",
    cancelled: "Storniert",
  };
  return labels[status] || status;
}

// Transportstatus-Farbe
export function transportStatusColor(status) {
  const colors = {
    booked: "text-lime",
    in_progress: "text-invest-cyan",
    completed: "text-muted-foreground",
    failed: "text-coral",
    cancelled: "text-coral/70",
  };
  return colors[status] || "text-muted-foreground";
}

// Partner-Statistik-Übersicht
export function getPartnerStats(state, partnerId) {
  const stats = state?.partners?.stats?.[partnerId];
  if (!stats) return null;
  const punctuality = stats.completedTransports > 0
    ? Math.round((stats.timelyTransports / stats.completedTransports) * 100)
    : null;
  return {
    totalTransports: stats.totalTransports || 0,
    completedTransports: stats.completedTransports || 0,
    punctuality,
    totalCostCents: stats.totalCostCents || 0,
    totalRefundCents: stats.totalRefundCents || 0,
  };
}

// Aktive Transporte für einen Partner
export function getActiveTransportsForPartner(state, partnerId) {
  return (state?.partners?.transports || []).filter(t =>
    t.partnerId === partnerId && (t.status === "booked" || t.status === "in_progress")
  );
}

// Externer Transport für einen Auftrag
export function getTransportForOrder(state, orderId) {
  return (state?.partners?.transports || []).find(t => t.orderId === orderId) || null;
}

// Alle Partner mit Statistik
export function getAllPartnersWithStats(state) {
  return PARTNER_CATALOG.map(p => ({
    ...p,
    stats: getPartnerStats(state, p.id),
    activeTransports: getActiveTransportsForPartner(state, p.id),
  }));
}

export { PARTNER_CATALOG, getPartnerById };