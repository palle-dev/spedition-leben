// Reine Hilfsfunktionen für die Spiel-Szenen: Tageszeit, Bürovariante,
// kontextbezogene Handlungsempfehlungen und Wachstumsfortschritt.
// Alle Werte werden aus dem vorhandenen Spielzustand abgeleitet – keine
// zweite Preispflege, keine geschätzten Frontend-Konstanten für Fristen/Kosten.

import { clockOf, formatGameTime } from "@/lib/gameData";

export function dayPhase(min) {
  const m = ((min % 1440) + 1440) % 1440;
  if (m >= 360 && m < 600) return "morning";   // 06:00–10:00
  if (m >= 600 && m < 1080) return "day";       // 10:00–18:00
  if (m >= 1080 && m < 1320) return "evening";  // 18:00–22:00
  return "night";                                // 22:00–06:00
}

export function phaseLabel(min) {
  const p = dayPhase(min);
  return { morning: "Morgen", day: "Tag", evening: "Abend", night: "Nacht" }[p];
}

export function officeVariant(vehicleCount) {
  if (vehicleCount >= 25) return "large";
  if (vehicleCount >= 10) return "medium";
  return "small";
}

export function acceptedNotDispatched(state) {
  return state.orders.filter(
    (o) => o.status === "angenommen" && !state.trips.some((t) => t.orderId === o.id && t.status === "in_progress")
  );
}

export function runningTrips(state) {
  return state.trips.filter((t) => t.status === "in_progress");
}

export function freeDrivers(state) {
  return state.drivers.filter((d) => d.status === "free" && (!d.restUntil || d.restUntil <= state.gameTime));
}

export function freeVehicles(state) {
  return state.vehicles.filter((v) => v.status === "free");
}

export function earliestRestEnd(state) {
  const ends = state.drivers
    .filter((d) => d.status === "resting" && d.restUntil && d.restUntil > state.gameTime)
    .map((d) => d.restUntil);
  return ends.length ? Math.min(...ends) : null;
}

export function pendingInvites(state) {
  return state.appointments.filter(
    (a) => a.status === "pending" && a.appearMin <= state.gameTime && state.gameTime < a.decisionDeadline
  );
}

export function activeAppointment(state) {
  return state.appointments.find((a) => a.status === "active");
}

export function deriveContextActions(state) {
  const actions = [];

  const blocked = activeAppointment(state);
  if (blocked) {
    actions.push({
      id: "blocked", priority: 0, tone: "amber", to: "/zuhause",
      title: "Private Aktivität",
      detail: `Beschäftigt bis ${formatGameTime(blocked.endMin)}. Zeit und Einsicht bleiben möglich.`,
    });
  }

  const invites = pendingInvites(state);
  if (invites.length) {
    actions.push({
      id: "invite", priority: 1, tone: "amber", to: "/zuhause",
      title: "Einladung offen",
      detail: `Antwort nötig bis ${clockOf(invites[0].decisionDeadline)} Uhr.`,
    });
  }

  const openCosts = state.openCosts || [];
  if (openCosts.length) {
    actions.push({
      id: "costs", priority: 2, tone: "red", to: "/finanzen",
      title: "Offene Pflichtkosten",
      detail: `${openCosts.length} Posten offen – Finanzen öffnen zum Tilgen.`,
    });
  }

  const and_ = acceptedNotDispatched(state);
  if (and_.length) {
    actions.push({
      id: "dispatch", priority: 3, tone: "amber", to: "/disposition",
      title: "Auftrag disponieren",
      detail: `${and_.length} angenommen, noch nicht gestartet.`,
    });
  }

  const trips = runningTrips(state);
  if (trips.length) {
    const t = trips[0];
    const order = state.orders.find((o) => o.id === t.orderId);
    actions.push({
      id: "trip", priority: 4, tone: "blue", to: "/disposition",
      title: "Fahrt unterwegs",
      detail: order
        ? `Nach ${order.toCity} · Lieferung bis ${formatGameTime(order.deliveryDeadlineMin)}.`
        : `Fahrt bis ${formatGameTime(t.endMin)}.`,
    });
  }

  const offers = state.orders.filter((o) => o.status === "offered").length;
  if (freeVehicles(state).length && freeDrivers(state).length && offers) {
    actions.push({
      id: "offers", priority: 5, tone: "emerald", to: "/auftraege",
      title: "Angebote prüfen",
      detail: `${offers} offen · ${freeVehicles(state).length} Lkw, ${freeDrivers(state).length} Fahrer frei.`,
    });
  }

  if (!freeDrivers(state).length && state.drivers.length) {
    const re = earliestRestEnd(state);
    actions.push({
      id: "rest", priority: 6, tone: "wood", to: "/personal",
      title: "Fahrer erholt sich",
      detail: re ? `Frühester Einsatz: ${formatGameTime(re)}.` : "Kein Fahrer einsatzbereit.",
    });
  }

  if (!actions.length) {
    actions.push({
      id: "calm", priority: 7, tone: "neutral", to: "/journal",
      title: "Alles ruhig",
      detail: "Keine dringende Handlung. Zeit fortsetzen oder Journal ansehen.",
    });
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

export function nextMilestone(state) {
  const m = state.milestones.find((x) => !x.achieved);
  if (!m) return null;
  let progress = 0;
  let target = 1;
  if (m.id === "m1") { progress = state.stats.totalDeliveries; target = 1; }
  else if (m.id === "m2") { progress = state.stats.timelyDeliveries; target = 10; }
  else if (m.id === "m3") { progress = state.vehicles.length; target = 4; }
  return { ...m, progress, target };
}