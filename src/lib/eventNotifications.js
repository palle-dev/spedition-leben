// Event-zu-Benachrichtigung-Mapping für FERNWERK – Auftrag 23.
// Wandelt dauerhafte Spielereignisse in sichtbare Toast- und Benachrichtigungstexte um.
// Alle Texte verwenden echte gespeicherte Werte aus dem Ereignis.

import { formatGameTime, formatEuro } from "@/lib/gameData";

function vehicleLabel(id) {
  if (!id) return "—";
  const n = parseInt(String(id).replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? id : "Lkw " + String(n).padStart(2, "0");
}

// Wandelt ein Ereignis in eine Toast-Benachrichtigung um.
// Gibt null zurück, wenn das Ereignis keine Toast-Benachrichtigung erfordert.
export function eventToToast(ev) {
  if (!ev) return null;
  const d = ev.details || {};

  switch (ev.type) {
    case "order_accepted_by_dispatcher":
      return {
        id: ev.id,
        kind: "success",
        icon: "check",
        title: "Auftrag angenommen",
        body: `${ev.employeeName || "Disponent"} hat ${d.customer || "—"}: ${d.fromCity || "—"} → ${d.toCity || "—"} für ${formatEuro(d.paymentCents || 0)} angenommen.`,
        action: { label: "Auftrag ansehen", targetType: "order", targetId: ev.orderIds?.[0] },
        duration: 7000,
        eventSeq: ev.seq,
      };

    case "tour_planned_by_dispatcher":
      return {
        id: ev.id,
        kind: "info",
        icon: "calendar",
        title: "Tour geplant",
        body: `${ev.employeeName || "Disponent"} hat ${vehicleLabel(ev.vehicleId)} mit ${d.driverName || "—"} eingeplant. ${d.fromCity || "—"} → ${d.toCity || "—"}, Abfahrt ${formatGameTime(d.startMin || ev.gameTime)}, Lieferung voraussichtlich ${formatGameTime(d.endMin || ev.gameTime)}.`,
        action: { label: "In Dispo öffnen", targetType: "dispatch", targetId: ev.tourId },
        duration: 7000,
        eventSeq: ev.seq,
      };

    case "tour_started":
      return {
        id: ev.id,
        kind: "info",
        icon: "truck",
        title: "Tour gestartet",
        body: `${vehicleLabel(ev.vehicleId)} ist mit Auftrag ${ev.orderIds?.[0] || "—"} gestartet.`,
        action: { label: "Auf Karte zeigen", targetType: "dispatch", targetId: ev.tourId },
        duration: 5000,
        eventSeq: ev.seq,
      };

    case "delivery_completed":
      return {
        id: ev.id,
        kind: "success",
        icon: "package",
        title: "Lieferung abgeschlossen",
        body: `${d.customer || "—"}: ${d.fromCity || "—"} → ${d.toCity || "—"} ${d.onTime ? "rechtzeitig" : "verspätet"} geliefert. ${formatEuro(d.paymentCents || 0)}.`,
        action: { label: "Details", targetType: "order", targetId: ev.orderIds?.[0] },
        duration: 6000,
        eventSeq: ev.seq,
      };

    case "reward_available":
      return {
        id: ev.id,
        kind: "success",
        icon: "bell",
        title: "Neue Belohnung verfügbar",
        body: `${d.rewardTitle || "Belohnung"} wurde freigeschaltet. Im Privatleben abholbar.`,
        action: { label: "Abholen", targetType: "home", targetId: null },
        duration: 8000,
        eventSeq: ev.seq,
      };

    case "reward_claimed":
      return {
        id: ev.id,
        kind: "success",
        icon: "check",
        title: "Belohnung abgeholt",
        body: d.rewardType === "voucher"
          ? `Gutschein wurde abgeholt und ist im Aktivitätsbereich nutzbar.`
          : `${d.slot || "Kosmetik"} wurde abgeholt und kann ausgerüstet werden.`,
        action: { label: "Ansehen", targetType: "home", targetId: null },
        duration: 6000,
        eventSeq: ev.seq,
      };

    case "purchase_completed":
      return {
        id: ev.id,
        kind: "success",
        icon: "package",
        title: "Anschaffung gekauft",
        body: `${d.name || "Gegenstand"} für ${formatEuro(d.priceCents || 0)} gekauft.`,
        action: { label: "Besitz ansehen", targetType: "home", targetId: null },
        duration: 6000,
        eventSeq: ev.seq,
      };

    case "purchase_sold":
      return {
        id: ev.id,
        kind: "info",
        icon: "package",
        title: "Gegenstand verkauft",
        body: `${d.name || "Gegenstand"} für ${formatEuro(d.salePriceCents || 0)} verkauft.`,
        duration: 5000,
        eventSeq: ev.seq,
      };

    case "private_activity_started":
      return {
        id: ev.id,
        kind: "info",
        icon: "calendar",
        title: "Aktivität gestartet",
        body: `${d.label || "Aktivität"} gestartet${d.voucherUsed ? " mit Gutschein" : ""}.`,
        duration: 5000,
        eventSeq: ev.seq,
      };

    default:
      return null;
  }
}

// Wandelt ein Ereignis in eine Benachrichtigungs-Zeile für das Zentrum um.
export function eventToNotification(ev) {
  if (!ev) return null;
  const toast = eventToToast(ev);
  if (!toast) return null;
  return {
    id: ev.id,
    seq: ev.seq,
    type: ev.type,
    title: toast.title,
    body: toast.body,
    gameTime: ev.gameTime,
    gameTimeFormatted: formatGameTime(ev.gameTime),
    employeeName: ev.employeeName,
    portraitId: ev.portraitId,
    isSystem: ev.isSystem,
    seen: ev.seen,
    action: toast.action,
    committedAtMs: ev.committedAtMs,
  };
}

// Ereignistypen, die im Live-Verlauf der Disposition angezeigt werden.
export const DISPATCH_LOG_TYPES = [
  "order_accepted_by_dispatcher",
  "tour_planned_by_dispatcher",
  "tour_started",
  "delivery_completed",
];

// Kurze Beschriftung für den Live-Verlauf.
export function eventToLogLabel(ev) {
  if (!ev) return "";
  const d = ev.details || {};
  switch (ev.type) {
    case "order_accepted_by_dispatcher":
      return `${ev.employeeName || "Disponent"}: ${d.customer} angenommen`;
    case "tour_planned_by_dispatcher":
      return `${ev.employeeName || "Disponent"}: ${vehicleLabel(ev.vehicleId)} geplant`;
    case "tour_started":
      return `${vehicleLabel(ev.vehicleId)} gestartet`;
    case "delivery_completed":
      return `Geliefert: ${d.customer}`;
    default:
      return ev.type;
  }
}