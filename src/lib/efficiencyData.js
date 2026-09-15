// Effizienz-Analyse: Zeitverteilung pro Fahrzeug und Fahrer.
// Zerlegt Trip-Phasen in produktive (Beladefahrt), Overhead (Leerfahrt,
// Be-/Entladung) und Ruhezeiten, um zu zeigen, wo Zeit auf der Strecke bleibt.

import { vehicleDisplayName } from "./displayHelpers";

const DEFAULT_DAYS = 7;

// Zerlegt die Phasen eines Trips in Zeit- und km-Kategorien.
function analyzeTripPhases(trip) {
  const phases = trip.phases || [];
  let loadedDrive = 0, emptyDrive = 0, loading = 0, unloading = 0, breaks = 0, rest = 0;
  let loadedKm = 0, emptyKm = 0;
  for (const p of phases) {
    const dur = p.durationMin || (p.endMin != null && p.startMin != null ? p.endMin - p.startMin : 0) || 0;
    switch (p.type) {
      case "loaded_drive": loadedDrive += dur; loadedKm += p.distanceKm || 0; break;
      case "empty_drive": emptyDrive += dur; emptyKm += p.distanceKm || 0; break;
      case "loading": loading += dur; break;
      case "unloading": unloading += dur; break;
      case "break": breaks += dur; break;
      case "daily_rest": rest += dur; break;
    }
  }
  const handling = loading + unloading;
  const overhead = emptyDrive + handling;
  const idle = breaks + rest;
  const total = loadedDrive + overhead + idle;
  const totalKm = loadedKm + emptyKm;
  return { loadedDrive, emptyDrive, loading, unloading, handling, breaks, rest, loadedKm, emptyKm, overhead, idle, total, totalKm };
}

// Trips mit Phasen im gewählten Zeitraum (inkl. laufende).
function getTripsInPeriod(state, days) {
  const today = Math.floor(state.gameTime / 1440);
  const cutoff = (today - days) * 1440;
  return (state.trips || []).filter(t => {
    if (!t.phases || t.phases.length === 0) return false;
    if (t.status === "in_progress") return true;
    const end = t.endMin != null ? t.endMin : t.startMin;
    return end >= cutoff;
  });
}

// Erlös und Lieferungen für eine Menge von Trips im Zeitraum.
function getTripRevenue(state, trips, days) {
  const today = Math.floor(state.gameTime / 1440);
  const cutoff = (today - days) * 1440;
  let revenue = 0, deliveries = 0;
  for (const o of (state.orders || [])) {
    if (o.status !== "geliefert" || o.deliveredAtMin == null) continue;
    if (o.deliveredAtMin < cutoff) continue;
    if (trips.some(t => t.orderId === o.id)) { revenue += o.paidCents || 0; deliveries++; }
  }
  return { revenue, deliveries };
}

function aggregate(analyses) {
  const keys = ["loadedDrive", "emptyDrive", "loading", "unloading", "handling", "breaks", "rest", "loadedKm", "emptyKm", "overhead", "idle", "total", "totalKm"];
  const agg = Object.fromEntries(keys.map(k => [k, 0]));
  for (const a of analyses) for (const k of keys) agg[k] += a[k];
  return agg;
}

function ratios(agg) {
  const totalKm = agg.loadedKm + agg.emptyKm;
  const totalDrive = agg.loadedDrive + agg.emptyDrive;
  return {
    emptyRatio: totalKm > 0 ? agg.emptyKm / totalKm : 0,
    productiveRatio: agg.total > 0 ? agg.loadedDrive / agg.total : 0,
    overheadRatio: agg.total > 0 ? agg.overhead / agg.total : 0,
    idleRatio: agg.total > 0 ? agg.idle / agg.total : 0,
    driveRatio: agg.total > 0 ? totalDrive / agg.total : 0,
    handlingRatio: agg.total > 0 ? agg.handling / agg.total : 0,
    totalKm, totalDrive,
  };
}

// Pro Fahrzeug: Zeit- und km-Verteilung, Erlös, Effizienz-Ratios.
export function getVehicleEfficiency(state, days = DEFAULT_DAYS) {
  const trips = getTripsInPeriod(state, days);
  const vehicles = (state.vehicles || []).filter(v => v.status !== "sold" && v.status !== "archived");
  return vehicles.map(v => {
    const vTrips = trips.filter(t => t.vehicleId === v.id);
    if (vTrips.length === 0) return null;
    const agg = aggregate(vTrips.map(analyzeTripPhases));
    const r = ratios(agg);
    const { revenue, deliveries } = getTripRevenue(state, vTrips, days);
    const branch = (state.branches || []).find(b => b.id === v.branchId);
    const revenuePerKm = r.totalKm > 0 ? revenue / r.totalKm : 0;
    return {
      id: v.id, name: vehicleDisplayName(v), branchName: branch?.name || "Hauptsitz",
      status: v.status, condition: v.condition, locationCity: v.locationCity,
      tripCount: vTrips.length, deliveries, revenue, revenuePerKm,
      ...agg, ...r,
    };
  }).filter(Boolean).sort((a, b) => a.productiveRatio - b.productiveRatio);
}

// Pro Fahrer: gleiche Metriken, plus Erlös pro Stunde.
export function getDriverEfficiency(state, days = DEFAULT_DAYS) {
  const trips = getTripsInPeriod(state, days);
  const drivers = (state.drivers || []).filter(d => d.employmentStatus === "employed");
  return drivers.map(d => {
    const dTrips = trips.filter(t => t.driverId === d.id);
    if (dTrips.length === 0) return null;
    const agg = aggregate(dTrips.map(analyzeTripPhases));
    const r = ratios(agg);
    const { revenue, deliveries } = getTripRevenue(state, dTrips, days);
    const revenuePerHour = agg.total > 0 ? revenue / (agg.total / 60) : 0;
    const branch = (state.branches || []).find(b => b.id === d.branchId);
    return {
      id: d.id, name: d.name, branchName: branch?.name || "Hauptsitz",
      status: d.status, locationCity: d.locationCity,
      tripCount: dTrips.length, deliveries, revenue, revenuePerHour,
      ...agg, ...r,
    };
  }).filter(Boolean).sort((a, b) => a.productiveRatio - b.productiveRatio);
}

// Gesamt-KPIs für den Zeitraum.
export function getEfficiencyKPIs(state, days = DEFAULT_DAYS) {
  const trips = getTripsInPeriod(state, days);
  const agg = aggregate(trips.map(analyzeTripPhases));
  const r = ratios(agg);
  let totalRevenue = 0;
  const today = Math.floor(state.gameTime / 1440);
  const cutoff = (today - days) * 1440;
  for (const o of (state.orders || [])) {
    if (o.status !== "geliefert" || o.deliveredAtMin == null || o.deliveredAtMin < cutoff) continue;
    totalRevenue += o.paidCents || 0;
  }
  const revenuePerKm = r.totalKm > 0 ? totalRevenue / r.totalKm : 0;
  return {
    tripCount: trips.length, totalKm: r.totalKm, totalHours: Math.round(agg.total / 60),
    emptyRatio: r.emptyRatio, productiveRatio: r.productiveRatio,
    overheadRatio: r.overheadRatio, idleRatio: r.idleRatio,
    handlingRatio: r.handlingRatio, totalRevenue, revenuePerKm,
  };
}

// Konkrete Optimierungs-Hinweise aus den Effizienz-Daten.
export function getEfficiencyActionItems(vehicleEff, driverEff) {
  const items = [];
  for (const v of vehicleEff) {
    if (v.emptyRatio > 0.35) {
      items.push({
        priority: Math.round(v.emptyRatio * 100), kind: "empty_mileage",
        title: `${v.name}: ${Math.round(v.emptyRatio * 100)}% Leerfahrten`,
        detail: `${Math.round(v.emptyKm)} von ${Math.round(v.totalKm)} km ohne Ladung – Retourladungen oder kürzere Leerfahrten planen.`,
        action: { label: "Disponieren", to: "/disposition" },
      });
    }
  }
  for (const d of driverEff) {
    if (d.productiveRatio < 0.25 && d.total > 240) {
      items.push({
        priority: Math.round((0.25 - d.productiveRatio) * 200), kind: "low_productive",
        title: `${d.name}: Nur ${Math.round(d.productiveRatio * 100)}% produktive Fahrtzeit`,
        detail: `Viel Zeit in Rüst- und Ruhezeiten – Touren dichter planen oder kürzere Strecken wählen.`,
        action: { label: "Disponieren", to: "/disposition" },
      });
    }
  }
  for (const v of vehicleEff) {
    if (v.totalKm > 100 && v.revenuePerKm < 80) {
      items.push({
        priority: 50, kind: "low_revenue",
        title: `${v.name}: Nur ${(v.revenuePerKm / 100).toFixed(2)} €/km`,
        detail: `Geringe Erlösquote – rentablere Aufträge oder Tourenketten mit Retourladungen wählen.`,
        action: { label: "Disponieren", to: "/disposition" },
      });
    }
  }
  for (const v of vehicleEff) {
    if (v.handlingRatio > 0.25 && v.total > 600) {
      items.push({
        priority: 40, kind: "high_handling",
        title: `${v.name}: ${Math.round(v.handlingRatio * 100)}% Rüstzeit`,
        detail: `Lange Be- und Entladezeiten – Touren mit weniger Stopps oder kürzeren Ladeweiten bündeln.`,
        action: { label: "Disponieren", to: "/disposition" },
      });
    }
  }
  items.sort((a, b) => b.priority - a.priority);
  return items;
}