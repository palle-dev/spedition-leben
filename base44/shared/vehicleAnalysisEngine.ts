// Fahrzeug-Analyse-Engine für FERNWERK.
// Liefert Betriebskosten, Finanzierungsvergleich und Ersatzhinweise.
// Reine Lese-Funktion — verändert weder Konten, Spielstand noch Zufallszustand.

import {
  VEHICLE_CATALOG, getVehicleProfile,
  computeMarketValue, computeDealerOffer,
} from "./gameRules.ts";
import { getVehicleBookValue } from "./accountingEngine.ts";
import {
  getAllLeasingOffers, computeCreditLimit, DAY_MIN,
} from "./financingEngine.ts";
import { SERVICE_PROVIDERS } from "./serviceEngine.ts";

// ---------- Betriebskosten je Fahrzeug ----------
// Analysiert abgeschlossene und laufende Fahrten des Fahrzeugs.
// Da Trips nach 7–30 Tagen bereinigt werden, bezieht sich die Analyse
// auf den近期 verfügbaren Zeitraum.
export function getVehicleOperatingCosts(state, vehicleId) {
  const vehicle = (state.vehicles || []).find(v => v.id === vehicleId);
  if (!vehicle) return null;
  const profile = getVehicleProfile(vehicle);

  // Trips für dieses Fahrzeug sammeln (abgeschlossen + laufend)
  const vehicleTrips = (state.trips || []).filter(t => t.vehicleId === vehicleId);
  const completedTrips = vehicleTrips.filter(t => t.status === "completed");
  const activeTrip = vehicleTrips.find(t => t.status === "in_progress");

  // Erlöse und variable Kosten aus Trips
  let totalRevenue = 0;
  let totalFuel = 0;
  let totalToll = 0;
  let loadedKm = 0;
  let emptyKm = 0;
  let deliveryCount = 0;
  let emptyTripCount = 0;

  for (const trip of completedTrips) {
    if (trip.type === "empty") {
      emptyKm += trip.totalKm || 0;
      totalFuel += trip.fuelCents || 0;
      totalToll += trip.tollCents || 0;
      emptyTripCount++;
    } else {
      totalRevenue += trip.paymentCents || 0;
      totalFuel += trip.fuelCents || 0;
      totalToll += trip.tollCents || 0;
      loadedKm += trip.totalKm || 0;
      deliveryCount++;
    }
  }

  const variableCosts = totalFuel + totalToll;
  const contribution = totalRevenue - variableCosts;
  const totalKm = loadedKm + emptyKm;
  const emptyRatio = totalKm > 0 ? emptyKm / totalKm : 0;

  // Wartungskosten: aus bookings für dieses Fahrzeug
  const maintenanceBookings = (state.bookings || [])
    .filter(b => b.refId && b.refId.startsWith("maintain:" + vehicleId))
    .reduce((s, b) => s + Math.abs(b.amountCents), 0);

  // Buchwert und Marktwert
  const ownership = vehicle.ownership_type || "owned";
  const bookValue = ownership === "owned" ? getVehicleBookValue(state, vehicleId) : 0;
  const marketValue = ownership === "owned" ? computeMarketValue(vehicle, state.gameTime) : 0;
  const dealerOffer = ownership === "owned" ? computeDealerOffer(vehicle, state.gameTime) : 0;

  // Finanzierungsverpflichtungen
  let financingObligation = 0;
  if (ownership === "leased" && vehicle.leasingContractId) {
    const contract = (state.leasingContracts || []).find(c => c.id === vehicle.leasingContractId);
    if (contract && (contract.status === "active" || contract.status === "ending")) {
      const remainingRates = contract.termMonths - contract.paidRates;
      financingObligation = remainingRates * contract.monthlyRateCents;
      financingObligation += contract.overdueRatesCents || 0;
    }
  }

  // Auslastung: gefahrene km / verfügbare Zeit (vereinfacht)
  const availableMinutes = state.gameTime - (vehicle.acquiredAtMin || 0);
  const availableDays = Math.max(1, Math.floor(availableMinutes / DAY_MIN));
  const kmPerDay = totalKm / availableDays;

  return {
    vehicleId,
    profile,
    ownership,
    deliveryCount,
    emptyTripCount,
    totalRevenue,
    totalFuel,
    totalToll,
    variableCosts,
    contribution,
    maintenanceCosts: maintenanceBookings,
    totalCosts: variableCosts + maintenanceBookings,
    netResult: contribution - maintenanceBookings,
    loadedKm,
    emptyKm,
    totalKm,
    emptyRatio,
    kmPerDay,
    bookValue,
    marketValue,
    dealerOffer,
    financingObligation,
    activeTrip: activeTrip ? { id: activeTrip.id, endMin: activeTrip.endMin } : null,
  };
}

// ---------- Betriebskosten-Übersicht (alle Fahrzeuge) ----------
export function getAllVehicleOperatingCosts(state) {
  return (state.vehicles || [])
    .filter(v => v.status !== "archived" && v.status !== "sold")
    .map(v => getVehicleOperatingCosts(state, v.id))
    .filter(Boolean);
}

// ---------- Finanzierungsvergleich ----------
// Vergleicht Kauf, Leasing und Miete für einen einheitlichen Zeitraum (90 Tage).
// Zeigt nur Konditionen, die durch die vorhandenen Verträge umgesetzt werden.
export function getFinancingComparison(state, { catalogId, branchId }) {
  const profile = VEHICLE_CATALOG[catalogId] || VEHICLE_CATALOG.standard;
  const periodDays = 90;
  const periodMonths = Math.ceil(periodDays / 30);

  // --- Kauf ---
  const buyUpfront = profile.priceCents;
  const buyMaintenancePerMonth = profile.maintenanceCostCents * 0.5; // Geschätzt: ~50 % der Wartungskosten pro Monat
  const buyMaintenanceTotal = buyMaintenancePerMonth * periodMonths;
  // Abschreibung über 90 Tage (lineare Abschreibung über 60 Monate)
  const depreciationPerMonth = Math.floor(profile.priceCents / 60);
  const depreciationTotal = depreciationPerMonth * periodMonths;
  // Restwert nach 90 Tagen
  const residualValue = profile.priceCents - depreciationTotal;
  const buyNetCost = buyUpfront - residualValue + buyMaintenanceTotal;

  const buy = {
    label: "Kauf",
    upfrontCents: buyUpfront,
    recurringPerMonthCents: 0,
    recurringTotalCents: 0,
    maintenanceEstimateCents: buyMaintenanceTotal,
    residualValueCents: residualValue,
    netCostCents: buyNetCost,
    ownership: "Vollständiges Eigentum",
    binding: "Keine Mindestbindung",
    endCosts: "Verkauf jederzeit möglich (Marktwert)",
  };

  // --- Leasing ---
  const leaseOffers = getAllLeasingOffers().filter(o => o.catalogId === catalogId);
  const leaseResults = leaseOffers.map(offer => {
    const specialPayment = offer.specialPaymentCents;
    const monthlyRates = offer.monthlyRateCents * periodMonths;
    const totalLeaseCost = specialPayment + monthlyRates;
    // Einsparung gegenüber Kauf: Leasing hat keinen Restwert, aber keine Abschreibung
    return {
      offerId: offer.id,
      label: "Leasing (" + (offer.specialPaymentCents > 0 ? "mit Sonderzahlung" : "flexibel") + ")",
      upfrontCents: specialPayment,
      recurringPerMonthCents: offer.monthlyRateCents,
      recurringTotalCents: monthlyRates,
      maintenanceEstimateCents: buyMaintenanceTotal, // Wartung trägt der Leasingnehmer
      residualValueCents: 0, // Kein Eigentum am Ende
      netCostCents: totalLeaseCost + buyMaintenanceTotal,
      ownership: "Eigentum bleibt beim Leasinggeber",
      binding: offer.termMonths + " Monate Mindestlaufzeit",
      endCosts: "Kaufoption " + (offer.buyoutPriceCents / 100).toFixed(0) + " € oder Rückgabe",
      buyoutPriceCents: offer.buyoutPriceCents,
      includedKm: offer.includedKm,
      mileageRatePerKmCents: offer.mileageRatePerKmCents,
    };
  });

  // --- Miete ---
  const rentalProvider = SERVICE_PROVIDERS.find(p => p.type === "rental_truck");
  let rent = null;
  if (rentalProvider) {
    const blocks = Math.ceil(periodDays / 30); // Ein Block = 30 Tage
    const rentalCost = rentalProvider.handoverCents + blocks * rentalProvider.blockRateCents;
    rent = {
      label: "Miete",
      upfrontCents: rentalProvider.handoverCents,
      recurringPerMonthCents: rentalProvider.blockRateCents,
      recurringTotalCents: blocks * rentalProvider.blockRateCents,
      maintenanceEstimateCents: 0, // Wartung trägt der Vermieter
      residualValueCents: 0,
      netCostCents: rentalCost,
      ownership: "Kein Eigentum",
      binding: "Tagesweise kündbar",
      endCosts: "Rückgabe am Vermieterstandort",
    };
  }

  return {
    catalogId,
    profile,
    periodDays,
    periodMonths,
    buy,
    lease: leaseResults,
    rent,
    companyAccountCents: state.company.accountCents,
    creditLimit: computeCreditLimit(state),
  };
}

// ---------- Ersatzhinweise ----------
// Empfiehlt Fahrzeuge zur Prüfung eines Ersatzes basierend auf:
// - Häufigen Ausfällen (Störungen)
// - Hohem Wartungsaufwand (niedriger Zustand)
// - Geringer Eignung für Auftragsmix
// - Niedriger Auslastung
// - Bevorstehendem Vertragsende (Leasing)
export function getReplacementHints(state) {
  const hints = [];
  const m = state.gameTime;
  const activeVehicles = (state.vehicles || []).filter(v => v.status !== "archived" && v.status !== "sold");

  // Aktuelle Auftragsverteilung (Tonnen-Bereiche)
  const openOrders = (state.orders || []).filter(o => o.status === "offered" || o.status === "angenommen");
  const heavyOrders = openOrders.filter(o => o.tons > 12).length;
  const smallOrders = openOrders.filter(o => o.tons <= 8).length;
  const totalOrders = openOrders.length || 1;

  for (const vehicle of activeVehicles) {
    const reasons = [];
    const ops = getVehicleOperatingCosts(state, vehicle.id);
    const profile = getVehicleProfile(vehicle);

    // 1. Niedriger Zustand → hoher Wartungsaufwand
    if (vehicle.condition < 50) {
      reasons.push({
        type: "condition",
        label: "Hoher Wartungsaufwand",
        detail: "Zustand " + vehicle.condition + "/100 — häufige Wartung erforderlich.",
      });
    }

    // 2. Niedrige Auslastung — nur bei Fahrzeugen, die bereits im Einsatz waren
    if (ops && ops.totalKm > 0 && ops.kmPerDay < 50 && ops.deliveryCount < 3) {
      reasons.push({
        type: "low_utilization",
        label: "Niedrige Auslastung",
        detail: "Nur " + ops.deliveryCount + " Lieferungen, " + Math.round(ops.kmPerDay) + " km/Tag.",
      });
    }

    // 3. Geringe Eignung für Auftragsmix
    if (profile.capacityTons <= 8 && heavyOrders / totalOrders > 0.3) {
      reasons.push({
        type: "mismatch",
        label: "Geringe Eignung für Auftragsmix",
        detail: heavyOrders + " schwere Aufträge (>12 t) aktuell offen — Regional-Lkw kann diese nicht übernehmen.",
      });
    }

    // 4. Bevorstehendes Vertragsende (Leasing)
    if (vehicle.ownership_type === "leased" && vehicle.leasingContractId) {
      const contract = (state.leasingContracts || []).find(c => c.id === vehicle.leasingContractId);
      if (contract && contract.status === "active") {
        const daysToEnd = Math.floor((contract.endMin - m) / DAY_MIN);
        if (daysToEnd <= 30 && daysToEnd > 0) {
          reasons.push({
            type: "lease_ending",
            label: "Leasingvertrag endet bald",
            detail: "Noch " + daysToEnd + " Tage bis Vertragsende — Ersatz prüfen.",
          });
        }
      }
    }

    // 5. Hoher Leerlauf-Anteil
    if (ops && ops.emptyRatio > 0.5 && ops.totalKm > 500) {
      reasons.push({
        type: "empty_ratio",
        label: "Hoher Leerfahrten-Anteil",
        detail: Math.round(ops.emptyRatio * 100) + "% der Kilometer Leerfahrten — Fahrzeug möglicherweise am falschen Standort.",
      });
    }

    if (reasons.length > 0) {
      hints.push({
        vehicleId: vehicle.id,
        vehicleLabel: vehicle.type + " (" + vehicle.id + ")",
        profile,
        condition: vehicle.condition,
        ownership: vehicle.ownership_type || "owned",
        bookValue: ops?.bookValue || 0,
        marketValue: ops?.marketValue || 0,
        dealerOffer: ops?.dealerOffer || 0,
        reasons,
        recommendation: reasons.length >= 3 ? "Ersatz dringend prüfen" : "Ersatz erwägen",
      });
    }
  }

  return hints;
}

// ---------- Fahrzeugvergleich: eigenes vs. Angebot ----------
export function compareVehicleWithOffer(state, { vehicleId, offerId }) {
  const vehicle = (state.vehicles || []).find(v => v.id === vehicleId);
  if (!vehicle) return null;
  const offer = (state.usedVehicleMarket?.offers || []).find(o => o.id === offerId);
  if (!offer) return null;

  const currentProfile = getVehicleProfile(vehicle);
  const newProfile = VEHICLE_CATALOG[offer.catalogId] || VEHICLE_CATALOG.standard;

  // Verkaufserlös für aktuelles Fahrzeug
  const dealerOffer = computeDealerOffer(vehicle, state.gameTime);
  const bookValue = getVehicleBookValue(state, vehicleId);

  // Verbleibende Vertragskosten (Leasing)
  let remainingContractCosts = 0;
  if (vehicle.ownership_type === "leased" && vehicle.leasingContractId) {
    const contract = (state.leasingContracts || []).find(c => c.id === vehicle.leasingContractId);
    if (contract && contract.status === "active") {
      const remainingRates = contract.termMonths - contract.paidRates;
      remainingContractCosts = remainingRates * contract.monthlyRateCents;
      remainingContractCosts += contract.overdueRatesCents || 0;
    }
  }

  // Anschaffung des neuen Fahrzeugs
  const newPrice = offer.askingPriceCents;
  const netCost = newPrice - dealerOffer + remainingContractCosts;

  // Kapazitätsänderung
  const capacityDelta = newProfile.capacityTons - currentProfile.capacityTons;
  // Verbrauchsänderung
  const consumptionDelta = newProfile.consumptionPer100km - currentProfile.consumptionPer100km;

  // Auswirkung auf offene Aufträge
  const openOrders = (state.orders || []).filter(o => o.status === "offered" || o.status === "angenommen");
  const currentlyFitting = openOrders.filter(o => o.tons <= currentProfile.capacityTons).length;
  const newlyFitting = openOrders.filter(o => o.tons <= newProfile.capacityTons).length;
  const newlyUnfitting = openOrders.filter(o => o.tons <= currentProfile.capacityTons && o.tons > newProfile.capacityTons).length;

  // Zeitliche Lücke: aktiver Trip verhindert Verkauf
  const activeTrip = (state.trips || []).find(t => t.vehicleId === vehicleId && t.status === "in_progress");
  const canSellNow = vehicle.status === "free" && !activeTrip;
  const gapUntilMin = activeTrip ? activeTrip.endMin : (vehicle.status === "maintenance" ? vehicle.maintenanceUntil : null);

  return {
    currentVehicle: {
      id: vehicle.id,
      label: vehicle.type,
      profile: currentProfile,
      condition: vehicle.condition,
      odometerKm: vehicle.odometerKm || 0,
      bookValue,
      dealerOffer,
      remainingContractCosts,
      ownership: vehicle.ownership_type || "owned",
    },
    newOffer: {
      id: offer.id,
      label: offer.vehicleType,
      profile: newProfile,
      condition: offer.condition,
      odometerKm: offer.odometerKm,
      askingPrice: newPrice,
      needsMaintenance: offer.needsMaintenance,
    },
    capacityDelta,
    consumptionDelta,
    netCost,
    newlyFitting,
    newlyUnfitting,
    canSellNow,
    gapUntilMin,
  };
}