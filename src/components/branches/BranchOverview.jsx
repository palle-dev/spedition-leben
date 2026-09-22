import React, { useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { Truck, Users, Headset, TrendingUp, Wallet, Package, Crown, Building2, MapPin, Wrench } from "lucide-react";


// Übersichts-Tabelle aller eröffneten Filialen mit Flottenstatus,
// Fahreranzahl und wirtschaftlicher Leistung pro Standort.
export default function BranchOverview({ onSelectBranch }) {
  const { state } = useGame();

  const rows = useMemo(() => {
    return (state.branches || [])
      .filter(b => b.status === "active")
      .map(b => {
        const vehicles = (state.vehicles || []).filter(v => v.branchId === b.id && v.status !== "sold" && v.status !== "archived");
        const drivers = (state.drivers || []).filter(d => d.branchId === b.id && d.employmentStatus === "employed");
        const allStaff = (state.employees || []).filter(e => (e.assignedBranchId || e.branchId) === b.id && e.employmentStatus === "employed");
        const dispatchers = allStaff.filter(e => e.role === "dispatcher" || e.role === "dispatcher_senior");

        const onTrip = vehicles.filter(v => v.status === "on_trip").length;
        const free = vehicles.filter(v => v.status === "free").length;
        const maintenance = vehicles.filter(v => v.status === "maintenance").length;
        const utilization = vehicles.length > 0 ? Math.round(onTrip / vehicles.length * 100) : 0;

        // Filial-Statistiken: b.stats ist die autoritative Quelle (von creditBranchDelivery gepflegt).
        const stats = b.stats || { revenueCents: 0, deliveries: 0, expensesCents: 0 };
        const dailyCost = b.costPerDayCents
          + drivers.reduce((s, d) => s + (d.costPerDayCents || 0), 0)
          + allStaff.reduce((s, e) => s + (e.costPerDayCents || 0), 0);
        // Kumulierte Kosten: Tageskosten × Öffnungstage (mind. 1)
        const daysOpen = Math.max(1, Math.floor(((state.gameTime || 0) - (b.openedAtMin || 0)) / 1440));
        const accumulatedCosts = dailyCost * daysOpen;
        const profit = stats.revenueCents - accumulatedCosts;
        const margin = stats.revenueCents > 0 ? Math.round(profit / stats.revenueCents * 100) : 0;

        // Flotten-Zustand Durchschnitt
        const avgCondition = vehicles.length > 0
          ? Math.round(vehicles.reduce((s, v) => s + (v.condition || 0), 0) / vehicles.length)
          : 0;

        return {
          branch: b,
          vehicles,
          drivers,
          dispatchers,
          onTrip, free, maintenance, utilization,
          stats, dailyCost, accumulatedCosts, profit, margin, avgCondition,
        };
      })
      .sort((a, b) => b.stats.revenueCents - a.stats.revenueCents);
  }, [state.branches, state.vehicles, state.drivers, state.employees]);

  const totals = useMemo(() => {
    return rows.reduce((acc, r) => {
      acc.revenue += r.stats.revenueCents || 0;
      acc.deliveries += r.stats.deliveries || 0;
      acc.accumulatedCosts += r.accumulatedCosts || 0;
      acc.dailyCost += r.dailyCost;
      acc.vehicles += r.vehicles.length;
      acc.drivers += r.drivers.length;
      acc.dispatchers += r.dispatchers.length;
      acc.onTrip += r.onTrip;
      return acc;
    }, { revenue: 0, deliveries: 0, accumulatedCosts: 0, dailyCost: 0, vehicles: 0, drivers: 0, dispatchers: 0, onTrip: 0 });
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="glass border border-white/10 rounded-xl p-8 text-center">
        <Building2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Keine aktiven Filialen. Eröffne deinen ersten Standort.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Gesamt-Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <TotalChip icon={Building2} label="Standorte" value={rows.length} />
        <TotalChip icon={Truck} label="Lkw gesamt" value={totals.vehicles} sub={`${totals.onTrip} unterwegs`} />
        <TotalChip icon={Users} label="Fahrer" value={totals.drivers} sub={`${totals.dispatchers} Dispo`} />
        <TotalChip icon={TrendingUp} label="Umsatz gesamt" value={formatEuro(totals.revenue)} sub={`${totals.deliveries} Lieferungen`} />
        <TotalChip icon={Wallet} label="Kosten/Tag" value={formatEuro(totals.dailyCost)} />
      </div>

      {/* Tabelle */}
      <div className="glass border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                <th className="text-left font-medium px-4 py-2.5">Standort</th>
                <th className="text-left font-medium px-3 py-2.5">Flotte</th>
                <th className="text-center font-medium px-3 py-2.5">Auslastung</th>
                <th className="text-center font-medium px-3 py-2.5">Zustand</th>
                <th className="text-center font-medium px-3 py-2.5">Fahrer</th>
                <th className="text-center font-medium px-3 py-2.5">Dispo</th>
                <th className="text-right font-medium px-3 py-2.5">Umsatz</th>
                <th className="text-right font-medium px-3 py-2.5">Lieferungen</th>
                <th className="text-right font-medium px-3 py-2.5">Gewinn</th>
                <th className="text-right font-medium px-3 py-2.5">Marge</th>
                <th className="text-right font-medium px-4 py-2.5">Kosten/Tag</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr
                  key={r.branch.id}
                  onClick={() => onSelectBranch?.(r.branch)}
                  className="border-b border-white/5 hover:bg-lime/[0.04] hover:border-lime/10 transition cursor-pointer group"
                >
                  {/* Standort */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {r.branch.isHeadquarters
                        ? <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                        : <Building2 className="w-3.5 h-3.5 text-lime/60 group-hover:text-lime transition shrink-0" />}
                      <div>
                        <div className="font-medium leading-tight group-hover:text-lime transition">{r.branch.name}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                          <MapPin className="w-2.5 h-2.5" /> {r.branch.city}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Flotte */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-medium tabular-nums">{r.vehicles.length}</span>
                      <div className="flex gap-1.5 text-[10px]">
                        {r.onTrip > 0 && <span className="text-lime">{r.onTrip}↗</span>}
                        {r.free > 0 && <span className="text-muted-foreground">{r.free} frei</span>}
                        {r.maintenance > 0 && <span className="text-coral flex items-center gap-0.5"><Wrench className="w-2.5 h-2.5" />{r.maintenance}</span>}
                      </div>
                    </div>
                  </td>

                  {/* Auslastung */}
                  <td className="px-3 py-3 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <div className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${r.utilization >= 70 ? "bg-lime" : r.utilization >= 40 ? "bg-amber-400" : "bg-coral/60"}`}
                          style={{ width: `${r.utilization}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted-foreground">{r.utilization}%</span>
                    </div>
                  </td>

                  {/* Zustand */}
                  <td className="px-3 py-3 text-center">
                    <span className={`tabular-nums text-xs ${r.avgCondition >= 60 ? "text-lime" : r.avgCondition >= 30 ? "text-amber-400" : "text-coral"}`}>
                      {r.avgCondition}%
                    </span>
                  </td>

                  {/* Fahrer */}
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Users className="w-3 h-3 text-muted-foreground" /> {r.drivers.length}
                    </span>
                  </td>

                  {/* Dispo */}
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Headset className="w-3 h-3 text-muted-foreground" /> {r.dispatchers.length}
                    </span>
                  </td>

                  {/* Umsatz */}
                  <td className="px-3 py-3 text-right tabular-nums font-medium">{formatEuro(r.stats.revenueCents)}</td>

                  {/* Lieferungen */}
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Package className="w-3 h-3" /> {r.stats.deliveries}
                    </span>
                  </td>

                  {/* Gewinn */}
                  <td className={`px-3 py-3 text-right tabular-nums font-medium ${r.profit >= 0 ? "text-lime" : "text-coral"}`}>
                    {formatEuro(r.profit)}
                  </td>

                  {/* Marge */}
                  <td className="px-3 py-3 text-right">
                    <span className={`tabular-nums text-xs ${r.margin >= 0 ? "text-lime/80" : "text-coral/80"}`}>
                      {r.stats.revenueCents > 0 ? `${r.margin}%` : "—"}
                    </span>
                  </td>

                  {/* Kosten/Tag */}
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatEuro(r.dailyCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-white/[0.02]">
                <td className="px-4 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Gesamt</td>
                <td className="px-3 py-2.5 tabular-nums font-medium">{totals.vehicles}</td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-center tabular-nums font-medium">{totals.drivers}</td>
                <td className="px-3 py-2.5 text-center tabular-nums font-medium">{totals.dispatchers}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">{formatEuro(totals.revenue)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium">{totals.deliveries}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${totals.revenue - totals.accumulatedCosts >= 0 ? "text-lime" : "text-coral"}`}>
                  {formatEuro(totals.revenue - totals.accumulatedCosts)}
                </td>
                <td className="px-3 py-2.5" />
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-muted-foreground">{formatEuro(totals.dailyCost)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function TotalChip({ icon: Icon, label, value, sub = undefined }) {
  return (
    <div className="glass border border-white/10 rounded-xl px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-base font-medium tabular-nums leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>}
    </div>
  );
}