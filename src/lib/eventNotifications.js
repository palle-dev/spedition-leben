// Event-zu-Benachrichtigung-Mapping für FERNWERK – Auftrag 23.
// Wandelt dauerhafte Spielereignisse in sichtbare Toast- und Benachrichtigungstexte um.
// Alle Texte verwenden echte gespeicherte Werte aus dem Ereignis.

import { formatGameTime, formatEuro } from "@/lib/gameData";

// Ereignistypen, die zusätzlich eine E-Mail erzeugen. Diese erscheinen
// NICHT im Benachrichtigungscenter (Glocke), da sie im Postfach sichtbar
// sind — sonst wären Glocke und Postfach inhaltlich identisch.
// Toasts (kurzzeitige Popups) werden weiterhin angezeigt.
export const EMAILED_EVENT_TYPES = new Set([
  "order_accepted_by_dispatcher",
  "tour_planned_by_dispatcher",
  "delivery_completed",
  "order_accepted_by_assistant",
  "order_auto_dispatched",
]);

// Prioritäten für die Toast-Steuerung.
// CRITICAL: Ereignisse, die der Spieler sofort sehen sollte (Fehler,
// Beziehungsänderungen, Belohnungen, Käufe, Filialleiter-Entscheidungen).
// ROUTINE: Häufige operative Ereignisse (Lieferungen, Touren, Disposition).
// Bei vielen gleichzeitigen Events werden ROUTINE-Toasts zu einer
// Zusammenfassung gebündelt, um den Bildschirm nicht zu fluten.
export const CRITICAL_EVENT_TYPES = new Set([
  "order_failed",
  "dating_match",
  "date_completed",
  "new_partner",
  "breakup",
  "reward_available",
  "reward_claimed",
  "purchase_completed",
  "purchase_sold",
  "private_activity_started",
  "assistant_training_booked",
  "branch_training_booked",
  "branch_vehicle_purchased",
  "branch_workshop_built",
  "branch_employee_hired",
]);

// Kurzbezeichnungen für die Zusammenfassung aller Ereignisse.
// Routinemäßige Ereignisse werden immer gebündelt; kritische Ereignisse
// nur, wenn sie die sichtbare Obergrenze überschreiten (siehe gameContext).
const EVENT_LABELS = {
  // Routinemäßig
  delivery_completed: "Lieferung",
  tour_started: "Tour gestartet",
  order_accepted_by_dispatcher: "Auftrag angenommen",
  tour_planned_by_dispatcher: "Tour geplant",
  order_accepted_by_assistant: "Assistent: Auftrag",
  order_auto_dispatched: "Assistent: Disposition",
  // Kritisch (nur bei Überlauf in Zusammenfassung)
  order_failed: "Fehllieferung",
  dating_match: "Match",
  date_completed: "Date",
  new_partner: "Partnerschaft",
  breakup: "Trennung",
  reward_available: "Belohnung",
  reward_claimed: "Belohnung abgeholt",
  purchase_completed: "Anschaffung",
  purchase_sold: "Verkauf",
  private_activity_started: "Aktivität",
  assistant_training_booked: "Schulung",
  branch_training_booked: "Filial-Schulung",
  branch_vehicle_purchased: "Filial-Lkw",
  branch_workshop_built: "Filial-Werkstatt",
  branch_employee_hired: "Filial-Personal",
};

// Bündelt eine Liste von Routine-Toasts zu einem einzigen Zusammenfassungs-Toast.
// Gibt null zurück, wenn die Liste leer ist.
export function summarizeRoutineToasts(routineToasts) {
  if (!routineToasts || routineToasts.length === 0) return null;
  if (routineToasts.length === 1) return routineToasts[0];

  const counts = {};
  for (const t of routineToasts) {
    const label = EVENT_LABELS[t._eventType] || null;
    if (!label) continue;
    counts[label] = (counts[label] || 0) + 1;
  }

  const parts = Object.entries(counts).map(([label, n]) =>
    `${n}× ${label}`
  );
  const body = parts.length > 0
    ? parts.join(" · ")
    : `${routineToasts.length} Ereignisse verarbeitet`;

  return {
    id: "summary_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    kind: "info",
    icon: "bell",
    title: "Zusammenfassung",
    body,
    duration: 6000,
    _isSummary: true,
  };
}

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
        title: d.onTime ? "Punktlandung! Fracht angekommen." : "Fracht angekommen – mit Verspätung",
        body: `${d.customer || "—"}: ${d.fromCity || "—"} → ${d.toCity || "—"} ${d.onTime ? "rechtzeitig" : "verspätet"} geliefert. ${formatEuro(d.paymentCents || 0)}.`,
        action: { label: "Details", targetType: "order", targetId: ev.orderIds?.[0] },
        duration: 6000,
        eventSeq: ev.seq,
      };

    case "expansion_completed":
      return { id: ev.id, kind: "success", icon: "truck", title: "Dein Unternehmen wächst!",
        body: `${d.expansionLabel || "Ausbau"} in ${d.branchName || "deinem Standort"} fertiggestellt.`,
        action: { label: "Standort ansehen", targetType: "branches" }, duration: 7000, eventSeq: ev.seq };
    case "course_completed":
      return { id: ev.id, kind: "success", icon: "check", title: "Gemeinsam besser!",
        body: `${ev.personName || "Dein Team"} hat ${d.courseLabel || "die Weiterbildung"} abgeschlossen.`,
        action: { label: "Personal ansehen", targetType: "personnel" }, duration: 7000, eventSeq: ev.seq };
    case "order_failed":
      return {
        id: ev.id,
        kind: "error",
        icon: "alert",
        title: "Auftrag gescheitert",
        body: `${d.customer || "—"}: ${d.fromCity || "—"} → ${d.toCity || "—"} konnte nicht rechtzeitig geliefert werden. Konventionalstrafe ${formatEuro(d.penaltyCents || 0)}.`,
        action: { label: "Aufträge ansehen", targetType: "orders", targetId: null },
        duration: 8000,
        eventSeq: ev.seq,
      };

    case "dating_match":
      return {
        id: ev.id,
        kind: "success",
        icon: "heart",
        title: "Neues Match!",
        body: `Du hast ein neues Match: ${d.name} (${d.compatibility}% Kompatibilität). Im Privatleben unter "Dating-App" kannst du ein Date vereinbaren.`,
        action: { label: "Dating-App", targetType: "home", targetId: null },
        duration: 7000,
        eventSeq: ev.seq,
      };

    case "date_completed":
      return {
        id: ev.id,
        kind: "info",
        icon: "heart",
        title: "Date abgeschlossen",
        body: `Date mit ${d.matchName}: ${d.success}% Erfolg. Beziehungsfortschritt +${d.progressDelta} (jetzt ${d.relationshipProgress}/100).`,
        duration: 6000,
        eventSeq: ev.seq,
      };

    case "new_partner":
      return {
        id: ev.id,
        kind: "success",
        icon: "heart",
        title: "Neue Partnerschaft!",
        body: `Du und ${d.partnerName} seid nun ein Paar! Eure Beziehung startet bei ${d.relationship}/100.`,
        action: { label: "Zuhause", targetType: "home", targetId: null },
        duration: 8000,
        eventSeq: ev.seq,
      };

    case "breakup":
      return {
        id: ev.id,
        kind: "error",
        icon: "alert",
        title: "Trennung",
        body: `Du und ${d.exName} habt euch getrennt. Die Dating-App ist wieder verfügbar.`,
        duration: 7000,
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

    case "order_accepted_by_assistant":
      return {
        id: ev.id,
        kind: "success",
        icon: "briefcase",
        title: "Assistent: Auftrag angenommen",
        body: `${ev.employeeName || "Assistent"} hat ${d.customer || "—"}: ${d.fromCity || "—"} → ${d.toCity || "—"} automatisch angenommen (Marge ${d.marginPct || 0}%).`,
        action: { label: "Auftrag ansehen", targetType: "order", targetId: ev.orderIds?.[0] },
        duration: 7000,
        eventSeq: ev.seq,
      };

    case "order_auto_dispatched":
      return {
        id: ev.id,
        kind: "info",
        icon: "briefcase",
        title: "Assistent: Tour disponiert",
        body: `${ev.employeeName || "Assistent"} hat ${d.customer || "—"}: ${d.fromCity || "—"} → ${d.toCity || "—"} automatisch disponiert.`,
        action: { label: "In Dispo öffnen", targetType: "dispatch", targetId: ev.tourId },
        duration: 7000,
        eventSeq: ev.seq,
      };

    case "assistant_training_booked":
      return {
        id: ev.id,
        kind: "success",
        icon: "briefcase",
        title: "Assistent: Schulung gebucht",
        body: `${ev.employeeName || "Assistent"} hat für ${d.personName || "Mitarbeiter"} den Kurs „${d.courseLabel || "Weiterbildung"}" gebucht (${formatEuro(d.feeCents || 0)}).`,
        action: { label: "Personal", targetType: "personnel", targetId: null },
        duration: 7000,
        eventSeq: ev.seq,
      };

    case "branch_training_booked":
      return {
        id: ev.id,
        kind: "success",
        icon: "briefcase",
        title: "Filialleiter: Schulung gebucht",
        body: `${d.personName || "Mitarbeiter"} wurde für den Kurs „${d.courseLabel || "Weiterbildung"}" angemeldet (${formatEuro(d.feeCents || 0)}).`,
        action: { label: "Personal", targetType: "personnel", targetId: null },
        duration: 7000,
        eventSeq: ev.seq,
      };

    case "branch_vehicle_purchased":
      return {
        id: ev.id,
        kind: "success",
        icon: "truck",
        title: "Filialleiter: Lkw gekauft",
        body: `Neuer Lkw für ${d.branchName || "Filiale"} wurde angeschafft (${formatEuro(d.costCents || 0)}).`,
        action: { label: "Fuhrpark", targetType: "fleet", targetId: null },
        duration: 7000,
        eventSeq: ev.seq,
      };

    case "branch_workshop_built":
      return {
        id: ev.id,
        kind: "success",
        icon: "wrench",
        title: "Filialleiter: Werkstatt gebaut",
        body: `Werkstattplatz in ${d.branchName || "Filiale"} wurde errichtet (${formatEuro(d.costCents || 0)}).`,
        action: { label: "Filialen", targetType: "branches", targetId: null },
        duration: 7000,
        eventSeq: ev.seq,
      };

    case "branch_employee_hired":
      return {
        id: ev.id,
        kind: "success",
        icon: "briefcase",
        title: "Filialleiter: Personal eingestellt",
        body: `${d.personName || "Mitarbeiter"} wurde als ${d.role || "Mitarbeiter"} für ${d.branchName || "Filiale"} eingestellt (${formatEuro(d.feeCents || 0)}).`,
        action: { label: "Personal", targetType: "personnel", targetId: null },
        duration: 7000,
        eventSeq: ev.seq,
      };

    default:
      return null;
  }
}

// Wandelt ein Ereignis in eine Benachrichtigungs-Zeile für das Zentrum um.
export function eventToNotification(ev) {
  if (!ev) return null;
  if (EMAILED_EVENT_TYPES.has(ev.type)) return null;
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
  "order_failed",
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
    case "order_failed":
      return `Gescheitert: ${d.customer}`;
    default:
      return ev.type;
  }
}