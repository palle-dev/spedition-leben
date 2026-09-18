import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatEuro } from "@/lib/gameData";
import { Crown, Building2, MapPin, Truck, Users, Headset, ArrowRight } from "lucide-react";

// Kompakte Filial-Übersicht für die Büro-Seite.
// Zeigt pro aktiver Filiale: Flotte, Fahrer, Dispo, Auslastung, Umsatz, Marge.
// Nur sichtbar, wenn mehr als eine Filiale existiert.
export default function OfficeBranches({ state }) {
  const navigate = useNavigate();

  const rows = useMemo(() => {
    return (state.branches || [])
      .filter(b => b.status === "active")
      .map(b => {
        const vehicles = (state.vehicles || []).filter(v => v.branchId === b.id && v.status !== "sold" && v.status !== "archived");
        const drivers = (state.drivers || []).filter(d => d.branchId === b.id && d.employmentStatus === "employed");
        const dispatchers = (state.employees || []).filter(e => (e.assignedBranchId || e.branchId) === b.id && e.employmentStatus === "employed" && (e.role === "dispatcher" || e.role === "dispatcher_senior"));

        const onTrip = vehicles.filter(v => v.status === "on_trip").length;
        const free = vehicles.filter(v => v.status === "free").length;
        const maintenance = vehicles.filter(v => v.status === "maintenance").length;
        const utilization = vehicles.length > 0 ? Math.round(onTrip / vehicles.length * 100) : 0;

        const bStats = b.stats || { revenueCents: 0, deliveries: 0, expensesCents: 0 };
        const branchTrips = (state.trips || []).filter(t =>
          t.type === "loaded" && t.status === "completed" &&
          (state.vehicles.find(v => v.id === t.vehicleId)?.branchId === b.id)
        );
        const tripRevenue = branchTrips.reduce((s, t) => s + (t.paymentCents || 0), 0);
        const revenueCents = Math.max(bStats.revenueCents, tripRevenue);
        const deliveries = Math.max(bStats.deliveries, branchTrips.length);

        const dailyCost = b.costPerDayCents
          + drivers.reduce((s, d) => s + (d.costPerDayCents || 0), 0)
          + (state.employees || []).filter(e => (e.assignedBranchId || e.branchId) === b.id && e.employmentStatus === "employed").reduce((s, e) => s + (e.costPerDayCents || 0), 0);
        const daysOpen = Math.max(1, Math.floor(((state.gameTime || 0) - (b.openedAtMin || 0)) / 1440));
        const accumulatedCosts = dailyCost * daysOpen;
        const profit = revenueCents - accumulatedCosts;
        const margin = revenueCents > 0 ? Math.round(profit / revenueCents * 100) : 0;

        const avgCondition = vehicles.length > 0
          ? Math.round(vehicles.reduce((s, v) => s + (v.condition || 0), 0) / vehicles.length)
          : 0;

        return { branch: b, vehicles, drivers, dispatchers, onTrip, free, maintenance, utilization, revenueCents, deliveries, profit, margin, dailyCost, avgCondition };
      })
      .sort((a, b) => b.revenueCents - a.revenueCents);
  }, [state.branches, state.vehicles, state.drivers, state.employees, state.trips, state.gameTime]);

  if (rows.length <= 1) return null;

  return (
    <div className="glass border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
          <Building2 className="w-4 h-4 text-lime/70" /> Filialübersicht
        </h3>
        <button onClick={() => navigate("/filialen")}
          className="text-xs text-lime/70 hover:text-lime transition flex items-center gap-1">
          Filialen <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map(r => (
          <div key={r.branch.id} className="bg-surface-2/30 rounded-lg border border-white/5 p-3.5 space-y-3">
            {/* Kopf */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                {r.branch.isHeadquarters
                  ? <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  : <Building2 className="w-3.5 h-3.5 text-lime/60 shrink-0" />}
                <div className="min-w-0">
                  <div className="font-medium text-sm leading-tight truncate">{r.branch.name}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <MapPin className="w-2.5 h-2.5" /> {r.branch.city}
                  </div>
                </div>
              </div>
              <span className={`text-xs font-medium tabular-nums shrink-0 ${r.profit >= 0 ? "text-lime" : "text-coral"}`}>
                {r.margin > 0 ? `${r.margin}%` : "—"}
              </span>
            </div>

            {/* Auslastung */}
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                <span>Auslastung</span>
                <span className="tabular-nums">{r.utilization}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${r.utilization >= 70 ? "bg-lime" : r.utilization >= 40 ? "bg-amber-400" : "bg-coral/60"}`}
                  style={{ width: `${r.utilization}%` }}
                />
              </div>
            </div>

            {/* Kennzahlen */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white/[0.02] rounded-md py-1.5">
                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                  <Truck className="w-2.5 h-2.5" /> Lkw
                </div>
                <div className="text-sm font-medium tabular-nums">
                  {r.vehicles.length}
                  <span className="text-[10px] text-muted-foreground/60 ml-1">
                    {r.onTrip > 0 && <span className="text-lime">{r.onTrip}↗</span>}
                    {r.maintenance > 0 && <span className="text-coral"> ·{r.maintenance}</span>}
                  </span>
                </div>
              </div>
              <div className="bg-white/[0.02] rounded-md py-1.5">
                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                  <Users className="w-2.5 h-2.5" /> Fahrer
                </div>
                <div className="text-sm font-medium tabular-nums">{r.drivers.length}</div>
              </div>
              <div className="bg-white/[0.02] rounded-md py-1.5">
                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
                  <Headset className="w-2.5 h-2.5" /> Dispo
                </div>
                <div className="text-sm font-medium tabular-nums">{r.dispatchers.length}</div>
              </div>
            </div>

            {/* Umsatz / Zustand */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
              <div>
                <span className="text-muted-foreground text-[10px]">Umsatz</span>
                <div className="font-medium tabular-nums">{formatEuro(r.revenueCents)}</div>
              </div>
              <div className="text-right">
                <span className="text-muted-foreground text-[10px]">Zustand Ø</span>
                <div className={`font-medium tabular-nums ${r.avgCondition >= 60 ? "text-lime" : r.avgCondition >= 30 ? "text-amber-300" : "text-coral"}`}>
                  {r.avgCondition}%
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}