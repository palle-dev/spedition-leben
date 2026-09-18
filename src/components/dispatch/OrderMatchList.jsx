import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import { formatEuro, getDistance, fuelEur, tollEur, driveMinutes, CITIES, checkBodyTypeCompatibility, getVehicleBodyType } from "@/lib/gameData";
import { Package, Play, Route, ArrowRight, Truck, MapPin, Clock, TrendingUp, AlertTriangle, Filter, X, ChevronDown, Info, Building2 } from "lucide-react";
import { getOrderObstacles, summarizeObstacles } from "@/lib/dispatchObstacles";
import PartnerOfferDialog from "@/components/partners/PartnerOfferDialog";

// Sortier- und Filterkomponente für angenommene Aufträge.
// Bewertet jeden Auftrag gegen die freie Flotte (Standort, Kapazität, Zustand)
// und zeigt Passungs-Score, Dringlichkeit und Rentabilität.
export default function OrderMatchList({ orders, onPlanOrder, onTourPlan, searchLower }) {
  const { state } = useGame();
  const [sortMode, setSortMode] = useState("best");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [cityFilter, setCityFilter] = useState("");
  const [bodyFilterVehicleId, setBodyFilterVehicleId] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const gameTime = state.gameTime;

  // Für jeden Auftrag: Passung gegen freie Flotte berechnen
  const scoredOrders = useMemo(() => {
    const freeVehicles = state.vehicles.filter(v => v.status === "free" && v.condition >= 20);
    const freeDrivers = state.drivers.filter(d => d.status === "free" && d.employmentStatus === "employed" && (!d.restUntil || d.restUntil <= gameTime));

    return orders.map(o => {
      const candidates = freeVehicles.filter(v => {
        if (v.capacityTons < o.tons) return false;
        return freeDrivers.some(d => d.locationCity === v.locationCity);
      });

      let nearestVehicle = null;
      let nearestEmptyKm = Infinity;
      for (const v of candidates) {
        const emptyKm = v.locationCity === o.fromCity ? 0 : getDistance(v.locationCity, o.fromCity);
        if (emptyKm < nearestEmptyKm) { nearestEmptyKm = emptyKm; nearestVehicle = v; }
      }

      const loadedKm = getDistance(o.fromCity, o.toCity);
      const totalKm = (nearestEmptyKm === Infinity ? 0 : nearestEmptyKm) + loadedKm;
      const fuel = nearestVehicle ? fuelEur(totalKm, nearestVehicle.consumptionPer100km) : 0;
      const toll = tollEur(totalKm);
      const contribution = o.paymentCents / 100 - fuel - toll;
      const contributionPerKm = totalKm > 0 ? contribution / totalKm : 0;

      const estDurationMin = nearestEmptyKm === Infinity ? 0
        : driveMinutes(nearestEmptyKm) + 60 + driveMinutes(loadedKm) + 60;
      const deadlineSlackMin = o.deliveryDeadlineMin - gameTime - estDurationMin;
      const deadlineUrgency = deadlineSlackMin < 0 ? "critical" : deadlineSlackMin < 480 ? "tight" : "ok";

      let score = 0;
      if (candidates.length > 0) {
        score += 40;
        if (nearestEmptyKm === 0) score += 25;
        else if (nearestEmptyKm <= 150) score += 15;
        else if (nearestEmptyKm <= 300) score += 5;
        if (contributionPerKm > 0.5) score += 20;
        else if (contributionPerKm > 0) score += 10;
        if (candidates.length > 1) score += 5;
        if (deadlineUrgency === "ok") score += 10;
        else if (deadlineUrgency === "tight") score += 3;
      }

      return {
        order: o, candidates, nearestVehicle,
        nearestEmptyKm: nearestEmptyKm === Infinity ? null : nearestEmptyKm,
        loadedKm, totalKm, fuel, toll, contribution, contributionPerKm,
        deadlineSlackMin, deadlineUrgency, score: Math.round(score),
      };
    });
  }, [orders, state.vehicles, state.drivers, gameTime]);

  let filtered = scoredOrders;
  if (searchLower) {
    filtered = filtered.filter(s =>
      s.order.customer.toLowerCase().includes(searchLower) ||
      s.order.fromCity.toLowerCase().includes(searchLower) ||
      s.order.toCity.toLowerCase().includes(searchLower)
    );
  }
  if (onlyAvailable) filtered = filtered.filter(s => s.candidates.length > 0);
  if (cityFilter) filtered = filtered.filter(s => s.order.fromCity === cityFilter || s.order.toCity === cityFilter);
  if (bodyFilterVehicleId) {
    const vehicle = state.vehicles.find(v => v.id === bodyFilterVehicleId);
    if (vehicle) filtered = filtered.filter(s => checkBodyTypeCompatibility(s.order, vehicle).ok);
  }

  const sorted = [...filtered].sort((a, b) => {
    switch (sortMode) {
      case "urgent": return a.order.deliveryDeadlineMin - b.order.deliveryDeadlineMin;
      case "revenue": return b.order.paymentCents - a.order.paymentCents;
      case "nearest": return (a.nearestEmptyKm ?? 9999) - (b.nearestEmptyKm ?? 9999);
      case "margin": return b.contributionPerKm - a.contributionPerKm;
      default: return b.score - a.score;
    }
  });

  const sortLabels = {
    best: "Beste Passung", urgent: "Dringlich", revenue: "Umsatz",
    nearest: "Nächster Lkw", margin: "Marge/km",
  };

  const activeFilterCount = (onlyAvailable ? 1 : 0) + (cityFilter ? 1 : 0) + (bodyFilterVehicleId ? 1 : 0);
  const bodyFilterVehicle = bodyFilterVehicleId ? state.vehicles.find(v => v.id === bodyFilterVehicleId) : null;

  return (
    <div className="space-y-3">
      {/* Filter- und Sortierleiste */}
      <div className="rounded-xl border border-white/10 bg-surface/40 p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <div className="flex gap-1 flex-1 overflow-x-auto scrollbar-none">
            {Object.entries(sortLabels).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSortMode(key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition ${
                  sortMode === key ? "bg-lime text-ink" : "bg-surface-2/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setFilterOpen(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] transition shrink-0 border ${
              filterOpen || activeFilterCount > 0 ? "bg-lime/15 text-lime border-lime/30" : "bg-surface-2/60 text-muted-foreground hover:text-foreground border-white/10"
            }`}
          >
            Filter{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            <ChevronDown className={`w-3 h-3 transition ${filterOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
        {filterOpen && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-white/10">
            <button
              onClick={() => setOnlyAvailable(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border transition ${
                onlyAvailable ? "bg-lime/10 border-lime/30 text-lime" : "border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Truck className="w-3 h-3" /> Nur mit verfügbarem Lkw
            </button>
            <select
              value={cityFilter}
              onChange={e => setCityFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-[11px] text-foreground focus:border-lime/50 outline-none"
            >
              <option value="">Alle Städte</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={bodyFilterVehicleId}
              onChange={e => setBodyFilterVehicleId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-[11px] text-foreground focus:border-lime/50 outline-none max-w-[180px]"
              title="Nur Aufträge zeigen, die zum Aufbau dieses Fahrzeugs passen"
            >
              <option value="">Alle Aufbauten</option>
              {state.vehicles.filter(v => v.status !== "archived" && v.status !== "sold").map(v => {
                const body = getVehicleBodyType(v);
                return <option key={v.id} value={v.id}>{vehicleDisplayName(v)} · {body.label}</option>;
              })}
            </select>
            {bodyFilterVehicle && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-lime/10 border border-lime/30 text-lime">
                <Truck className="w-3 h-3" /> {getVehicleBodyType(bodyFilterVehicle).label}
              </span>
            )}
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setOnlyAvailable(false); setCityFilter(""); setBodyFilterVehicleId(""); }}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground transition"
              >
                <X className="w-3 h-3" /> Zurücksetzen
              </button>
            )}
          </div>
        )}
      </div>

      {/* Auftragsliste */}
      {sorted.length === 0 ? (
        <div className="glass border border-white/10 rounded-xl p-5 text-center">
          <Package className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Keine passenden Aufträge.</p>
        </div>
      ) : (
        sorted.map(s => <OrderMatchCard key={s.order.id} scored={s} onPlanOrder={onPlanOrder} onTourPlan={onTourPlan} />)
      )}
    </div>
  );
}

function OrderMatchCard({ scored, onPlanOrder, onTourPlan }) {
  const { state } = useGame();
  const { order: o, score, candidates, nearestVehicle, nearestEmptyKm, totalKm, contribution, deadlineSlackMin, deadlineUrgency } = scored;
  const hasMatch = candidates.length > 0;
  const [partnerOpen, setPartnerOpen] = useState(false);

  const scoreColor = score >= 70 ? "text-lime" : score >= 40 ? "text-amber-300" : "text-coral";
  const scoreBg = score >= 70 ? "bg-lime/10 border-lime/30" : score >= 40 ? "bg-amber-400/10 border-amber-400/30" : "bg-coral/10 border-coral/30";

  const slackH = Math.floor(Math.abs(deadlineSlackMin) / 60);
  const slackM = Math.abs(deadlineSlackMin) % 60;

  // Hindernisse berechnen — erklärt WARUM ein Auftrag nicht disponiert werden kann
  const obstacles = useMemo(() => {
    if (hasMatch) return [];
    return summarizeObstacles(getOrderObstacles(state, o)) || [];
  }, [hasMatch, state, o]);

  return (
    <div className={`rounded-xl p-3 border transition ${hasMatch ? "border-white/10 hover:border-lime/30 bg-surface/30" : "border-coral/20 bg-coral/5"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{o.customer}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {hasMatch ? (
            <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${scoreBg} ${scoreColor}`}>
              {score >= 70 ? <TrendingUp className="w-2.5 h-2.5" /> : null}
              {score}
            </span>
          ) : (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border border-coral/30 bg-coral/10 text-coral">
              <AlertTriangle className="w-2.5 h-2.5" /> Kein Lkw
            </span>
          )}
          <span className="text-lime text-xs font-medium tabular-nums">{formatEuro(o.paymentCents)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {o.fromCity} <ArrowRight className="w-3 h-3" /> {o.toCity} · {o.tons} t
        </span>
        <span className={`flex items-center gap-1 ${deadlineUrgency === "critical" ? "text-coral" : deadlineUrgency === "tight" ? "text-amber-300" : ""}`}>
          <Clock className="w-3 h-3" />
          {deadlineSlackMin < 0 ? `überfällig ${slackH}h` : `noch ${slackH}h ${slackM}m`}
        </span>
      </div>

      {hasMatch && nearestVehicle ? (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {nearestEmptyKm === 0 ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-lime/10 text-lime border border-lime/20">
              <MapPin className="w-2.5 h-2.5" /> {vehicleDisplayName(nearestVehicle)} am Beladungsort
            </span>
          ) : (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-surface-2/60 text-muted-foreground border border-white/10">
              <Truck className="w-2.5 h-2.5" /> {vehicleDisplayName(nearestVehicle)} · {nearestEmptyKm} km Leerfahrt
            </span>
          )}
          <span className="px-1.5 py-0.5 rounded-md bg-surface-2/60 text-muted-foreground border border-white/10">
            {totalKm} km ges.
          </span>
          <span className={`px-1.5 py-0.5 rounded-md border ${contribution > 0 ? "bg-lime/5 text-lime border-lime/20" : "bg-coral/5 text-coral border-coral/20"}`}>
            {contribution > 0 ? "+" : ""}{formatEuro(contribution * 100)} Deckung
          </span>
          {candidates.length > 1 && (
            <span className="px-1.5 py-0.5 rounded-md bg-surface-2/60 text-muted-foreground border border-white/10">
              +{candidates.length - 1} weitere
            </span>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-1">
          {obstacles.length > 0 ? (
            obstacles.map((obs, i) => (
              <div key={i} className={`text-[10px] flex items-start gap-1 ${obs.severity === "hard" ? "text-coral" : obs.severity === "soft" ? "text-amber-300/80" : "text-muted-foreground"}`}>
                {obs.severity === "hard" ? <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> : <Info className="w-3 h-3 mt-0.5 shrink-0" />}
                <span>{obs.reason}</span>
              </div>
            ))
          ) : (
            <div className="text-[10px] text-coral/80 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Kein freier Lkw mit Fahrer am passenden Standort
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-2.5">
        <button
          onClick={() => onPlanOrder(o.id)}
          disabled={!hasMatch}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-lime text-ink text-xs font-semibold hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95"
        >
          <Play className="w-3.5 h-3.5" /> Planen
        </button>
        <button
          onClick={() => onTourPlan(o.id)}
          className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 border border-white/10 text-foreground/80 hover:text-foreground hover:border-white/20 text-xs font-medium transition active:scale-95"
        >
          <Route className="w-3.5 h-3.5" /> Tour
        </button>
        <button
          onClick={() => setPartnerOpen(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 border border-white/10 text-foreground/80 hover:text-foreground hover:border-white/20 text-xs font-medium transition active:scale-95"
          title="An Partner-Spedition vergeben"
        >
          <Building2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {partnerOpen && <PartnerOfferDialog order={o} onClose={() => setPartnerOpen(false)} />}
    </div>
  );
}