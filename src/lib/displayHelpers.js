// Darstellungshelfer für FERNWERK.
// Wandelt interne IDs in Anzeigenamen um, berechnet Fahrzeugpositionen
// und ermittelt das nächste Spielereignis — alles aus vorhandenem Zustand.

import { CITY_COORDS } from "./gameData";

// Lkw-Anzeigename: "v1" → "Lkw 01", "v12" → "Lkw 12"
export function vehicleDisplayName(v) {
  if (!v) return "—";
  const n = parseInt(String(v.id).replace(/[^0-9]/g, ""), 10);
  if (isNaN(n)) return v.id;
  return "Lkw " + String(n).padStart(2, "0");
}

// Fahrer-Anzeigename: bleibt der echte Name, da bereits persönlich.
export function driverDisplayName(d) {
  return d?.name || "—";
}

// Fahrer-Initialen für Avatar
export function driverInitials(d) {
  if (!d?.name) return "?";
  const parts = d.name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return d.name.slice(0, 2).toUpperCase();
}

// Konsistente Avatar-Farbe aus ID ableiten
const AVATAR_COLORS = [
  "bg-lime/15 text-lime",
  "bg-coral/15 text-coral",
  "bg-sky-400/15 text-sky-300",
  "bg-amber-400/15 text-amber-300",
  "bg-violet-400/15 text-violet-300",
  "bg-rose-400/15 text-rose-300"
];
export function driverAvatarClass(d) {
  if (!d?.id) return AVATAR_COLORS[0];
  const n = parseInt(String(d.id).replace(/[^0-9]/g, ""), 10) || 0;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

// Rollen-Label für Anzeige
export function roleLabel(role) {
  const labels = {
    driver: "Fahrer", dispatcher: "Disponent", dispatcher_senior: "Erf. Disponent",
    cleaner: "Reinigungskraft", mechanic: "Werkstattmitarbeiter", accountant: "Buchhalter/Buchhalterin",
  };
  return labels[role] || role;
}

// Rollen-Icon-Name (lucide-react)
export function roleIconName(role) {
  const icons = {
    driver: "Truck", dispatcher: "Headset", dispatcher_senior: "Headset",
    cleaner: "Sparkles", mechanic: "Wrench", accountant: "Calculator",
  };
  return icons[role] || "User";
}

// Zufriedenheits-Label und Farbe
export function satisfactionLabel(sat) {
  if (sat >= 70) return { label: "Zufrieden", color: "text-lime", dot: "bg-lime" };
  if (sat >= 40) return { label: "Normal", color: "text-amber-300", dot: "bg-amber-300" };
  return { label: "Unzufrieden", color: "text-coral", dot: "bg-coral" };
}

// Anwesenheits-Label
export function attendanceLabel(att) {
  const labels = {
    present: { label: "Anwesend", color: "text-lime", dot: "bg-lime" },
    sick: { label: "Krank", color: "text-coral", dot: "bg-coral" },
    vacation: { label: "Urlaub", color: "text-sky-300", dot: "bg-sky-300" },
  };
  return labels[att] || { label: att || "—", color: "text-muted-foreground", dot: "bg-muted-foreground" };
}

// Arbeitsweise-Label für Disponenten
export function workModeLabel(mode) {
  const labels = {
    suggestions: { label: "Vorschläge", desc: "Bereitet Vorschläge vor – du bestätigst." },
    dispatch_accepted: { label: "Disponiert", desc: "Darf angenommene Aufträge verbindlich planen." },
    autonomous: { label: "Selbstständig", desc: "Darf Marktangebote annehmen und disponieren." },
  };
  return labels[mode] || { label: mode || "—", desc: "" };
}

// Fahrzeugposition aus Trip-Fortschritt ableiten (rein aus Zustand)
export function getVehiclePosition(vehicle, state) {
  if (!vehicle) return null;
  if (vehicle.status === "free" || vehicle.status === "maintenance") {
    return CITY_COORDS[vehicle.locationCity] || null;
  }
  if (vehicle.status === "on_trip" && vehicle.tripId) {
    const trip = state.trips.find(t => t.id === vehicle.tripId);
    if (!trip || trip.status !== "in_progress") return CITY_COORDS[vehicle.locationCity] || null;
    const leg = trip.legs[trip.currentLeg];
    if (!leg) return CITY_COORDS[vehicle.locationCity] || null;
    const fromC = CITY_COORDS[leg.fromCity];
    const toC = CITY_COORDS[leg.toCity];
    if (!fromC || !toC) return CITY_COORDS[vehicle.locationCity] || null;
    if (leg.type === "load" || leg.type === "unload") return fromC;
    const dur = leg.endMin - leg.startMin;
    const progress = dur > 0 ? Math.min(1, Math.max(0, (state.gameTime - leg.startMin) / dur)) : 0;
    return {
      x: fromC.x + (toC.x - fromC.x) * progress,
      y: fromC.y + (toC.y - fromC.y) * progress
    };
  }
  return CITY_COORDS[vehicle.locationCity] || null;
}

// Aktuelle Phase eines Trips für die Anzeige
export function tripPhaseLabel(trip) {
  if (!trip || trip.status !== "in_progress") return "—";
  const leg = trip.legs[trip.currentLeg];
  if (!leg) return "Angekommen";
  if (leg.type === "empty" || leg.type === "empty_drive") return "Leerfahrt";
  if (leg.type === "load") return "Laden";
  if (leg.type === "drive") return "Beladene Fahrt";
  if (leg.type === "unload") return "Entladen";
  return leg.type;
}

// Nächstes Spielereignis aus Zustand ableiten
export function getNextEvent(state) {
  if (!state) return null;
  const t = state.gameTime;
  const events = [];

  for (const trip of state.trips) {
    if (trip.status === "in_progress" && trip.currentLeg < trip.legs.length) {
      const leg = trip.legs[trip.currentLeg];
      events.push({ min: leg.endMin, type: "trip", label: phaseShort(leg.type), icon: "truck" });
    }
  }
  for (const a of state.appointments) {
    if (a.status === "pending" && a.appearMin <= t) {
      events.push({ min: a.decisionDeadline, type: "invitation", label: "Einladung", icon: "heart" });
    } else if (a.status === "accepted") {
      events.push({ min: a.startMin, type: "appointment", label: "Termin beginnt", icon: "heart" });
    } else if (a.status === "active") {
      events.push({ min: a.endMin, type: "appointment", label: "Termin endet", icon: "heart" });
    }
  }
  const nextMidnight = Math.floor(t / 1440) * 1440 + 1440;
  events.push({ min: nextMidnight, type: "daily", label: "Tagesabschluss", icon: "calendar" });
  for (const o of state.orders) {
    if (o.status === "offered") events.push({ min: o.acceptDeadlineMin, type: "order", label: "Angebot verfällt", icon: "package" });
  }
  for (const d of state.drivers) {
    if (d.status === "resting" && d.restUntil && d.restUntil > t) {
      events.push({ min: d.restUntil, type: "rest", label: "Fahrer erholt", icon: "users" });
    }
  }
  for (const v of state.vehicles) {
    if (v.status === "maintenance" && v.maintenanceUntil && v.maintenanceUntil > t) {
      events.push({ min: v.maintenanceUntil, type: "maintenance", label: "Wartung fertig", icon: "truck" });
    }
  }

  events.sort((a, b) => a.min - b.min);
  return events[0] || null;
}

function phaseShort(type) {
  if (type === "empty" || type === "empty_drive") return "Leerfahrt";
  if (type === "load") return "Laden";
  if (type === "drive") return "Fahrt";
  if (type === "unload") return "Entladen";
  return "Fahrtabschnitt";
}