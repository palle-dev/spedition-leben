// Darstellungshelfer für FERNWERK.
// Wandelt interne IDs in Anzeigenamen um, berechnet Fahrzeugpositionen
// und ermittelt das nächste Spielereignis — alles aus vorhandenem Zustand.

import { CITY_COORDS, clockOf, formatGameTime } from "./gameData";

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
    cleaner: "Reinigungskraft", mechanic: "Werkstattmitarbeiter",
    accountant: "Buchhalter/Buchhalterin", accountant_senior: "Erf. Buchhaltungskraft",
  };
  return labels[role] || role;
}

// Rollen-Icon-Name (lucide-react)
export function roleIconName(role) {
  const icons = {
    driver: "Truck", dispatcher: "Headset", dispatcher_senior: "Headset",
    cleaner: "Sparkles", mechanic: "Wrench", accountant: "Calculator",
    accountant_senior: "Calculator",
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

// Beschäftigungsstatus-Label
export function employmentStatusLabel(status) {
  const labels = {
    employed: { label: "Aktiv", color: "text-lime", dot: "bg-lime" },
    notice_given: { label: "Austritt angekündigt", color: "text-amber-300", dot: "bg-amber-300" },
    former: { label: "Ehemalig", color: "text-muted-foreground", dot: "bg-muted-foreground" },
  };
  return labels[status] || { label: status || "—", color: "text-muted-foreground", dot: "bg-muted-foreground" };
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

// Fahrzeugposition aus Trip-Phasen-Fortschritt ableiten (rein aus Zustand)
export function getVehiclePosition(vehicle, state) {
  if (!vehicle) return null;
  if (vehicle.status === "free" || vehicle.status === "maintenance") {
    return CITY_COORDS[vehicle.locationCity] || null;
  }
  if (vehicle.status === "on_trip" && vehicle.tripId) {
    const trip = state.trips.find(t => t.id === vehicle.tripId);
    if (!trip || trip.status !== "in_progress") return CITY_COORDS[vehicle.locationCity] || null;
    const phases = trip.phases || trip.legs || [];
    const currentIdx = trip.currentPhase !== undefined ? trip.currentPhase : trip.currentLeg;
    if (currentIdx === undefined || currentIdx >= phases.length) return CITY_COORDS[vehicle.locationCity] || null;
    const phase = phases[currentIdx];

    // Laden/Entladen: an der Stadt
    if (phase.type === "loading" || phase.type === "unloading" || phase.type === "load" || phase.type === "unload") {
      return CITY_COORDS[phase.fromCity] || CITY_COORDS[vehicle.locationCity] || null;
    }

    // Fahrt: interpolieren
    if (phase.type === "empty_drive" || phase.type === "loaded_drive" || phase.type === "empty" || phase.type === "drive") {
      const fromC = CITY_COORDS[phase.fromCity];
      const toC = CITY_COORDS[phase.toCity];
      if (!fromC || !toC) return CITY_COORDS[vehicle.locationCity] || null;
      const dur = phase.endMin - phase.startMin;
      const progress = dur > 0 ? Math.min(1, Math.max(0, (state.gameTime - phase.startMin) / dur)) : 0;
      return { x: fromC.x + (toC.x - fromC.x) * progress, y: fromC.y + (toC.y - fromC.y) * progress };
    }

    // Pause/Ruhe: an der Position des letzten Fahr-Abschnitts bleiben
    if (phase.type === "break" || phase.type === "daily_rest") {
      let lastDrive = null;
      for (let i = currentIdx - 1; i >= 0; i--) {
        const p = phases[i];
        if (p.type === "empty_drive" || p.type === "loaded_drive" || p.type === "empty" || p.type === "drive") { lastDrive = p; break; }
      }
      if (lastDrive) {
        const stepFrom = lastDrive.fromCity, stepTo = lastDrive.toCity;
        let totalDist = 0, cumDist = 0;
        for (let i = 0; i < phases.length; i++) {
          const p = phases[i];
          const isDrive = p.type === "empty_drive" || p.type === "loaded_drive" || p.type === "empty" || p.type === "drive";
          if (isDrive && p.fromCity === stepFrom && p.toCity === stepTo) {
            totalDist += p.distanceKm || 0;
            if (i < currentIdx) cumDist += p.distanceKm || 0;
          }
        }
        const fromC = CITY_COORDS[stepFrom], toC = CITY_COORDS[stepTo];
        if (fromC && toC && totalDist > 0) {
          const frac = cumDist / totalDist;
          return { x: fromC.x + (toC.x - fromC.x) * frac, y: fromC.y + (toC.y - fromC.y) * frac };
        }
      }
      return CITY_COORDS[vehicle.locationCity] || null;
    }
  }
  return CITY_COORDS[vehicle.locationCity] || null;
}

// Aktuelle Phase eines Trips für die Anzeige
export function tripPhaseLabel(trip) {
  if (!trip || trip.status !== "in_progress") return "—";
  const phases = trip.phases || trip.legs || [];
  const idx = trip.currentPhase !== undefined ? trip.currentPhase : trip.currentLeg;
  if (idx === undefined || idx >= phases.length) return "Angekommen";
  const phase = phases[idx];
  const labels = {
    empty_drive: "Leerfahrt", loading: "Laden", loaded_drive: "Beladene Fahrt",
    break: "Fahrpause", daily_rest: "Ruhezeit", unloading: "Entladen",
    empty: "Leerfahrt", load: "Laden", drive: "Beladene Fahrt", unload: "Entladen",
  };
  return labels[phase.type] || phase.type;
}

// Detaillierter Status für Fahrer/Fahrzeug-Anzeige (Pause/Ruhe)
export function tripStatusDetail(trip) {
  if (!trip || trip.status !== "in_progress") return null;
  const phases = trip.phases || [];
  const idx = trip.currentPhase !== undefined ? trip.currentPhase : 0;
  if (idx >= phases.length) return null;
  const phase = phases[idx];
  if (phase.type === "break") return { label: "Fahrpause bis " + clockOf(phase.endMin), isPaused: true };
  if (phase.type === "daily_rest") return { label: "Ruhezeit bis " + formatGameTime(phase.endMin), isPaused: true };
  return null;
}

// Nächstes Spielereignis aus Zustand ableiten
export function getNextEvent(state) {
  if (!state) return null;
  const t = state.gameTime;
  const events = [];

  for (const trip of state.trips) {
    const phases = trip.phases || trip.legs || [];
    const idx = trip.currentPhase !== undefined ? trip.currentPhase : trip.currentLeg;
    if (trip.status === "in_progress" && idx !== undefined && idx < phases.length) {
      const phase = phases[idx];
      events.push({ min: phase.endMin, type: "trip", label: phaseShort(phase.type), icon: "truck" });
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
  if (type === "load" || type === "loading") return "Laden";
  if (type === "drive" || type === "loaded_drive") return "Fahrt";
  if (type === "unload" || type === "unloading") return "Entladen";
  if (type === "break") return "Fahrpause";
  if (type === "daily_rest") return "Ruhezeit";
  return "Fahrtabschnitt";
}