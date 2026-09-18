import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getFleetStats, getOrderStats, getVehicleDriver, getVehicleOrder, getVehicleNextEvent } from "@/lib/officeData";
import { formatGameTime } from "@/lib/gameData";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import { Truck, ArrowRight, Wrench, AlertTriangle, Clock, Package } from "lucide-react";

// Operations-Übersicht: Flottenstatus, aktive Touren und Auftrags-Pipeline
// in einer substantiellen, zusammenhängenden Ansicht.
export default function FleetSummary({ state }) {
  const navigate = useNavigate();
  const fleet = useMemo(() => getFleetStats(state), [state]);
  const orders = useMemo(() => getOrderStats(state), [state]);
  const activeVehicles = useMemo(
    () => (state.vehicles || []).filter(v => v.status === "on_trip" && v.tripId),
    [state]
  );
  const total = fleet.total || 1;
  const freePct = Math.round((fleet.byStatus.free / total) * 100);
  const tripPct = Math.round((fleet.byStatus.on_trip / total) * 100);
  const maintPct = Math.round((fleet.byStatus.maintenance / total) * 100);

  // Pipeline-Stufen
  const pipeline = [
    { label: "Angebote", count: orders.offered, color: "text-muted-foreground", dot: "bg-muted-foreground/40" },
    { label: "Angenommen", count: orders.accepted, color: "text-amber-300", dot: "bg-amber-300" },
    { label: "Unterwegs", count: orders.active, color: "text-sky-300", dot: "bg-sky-300" },
    { label: "Geliefert", count: orders.delivered, color: "text-lime", dot: "bg-lime" },
  ];

  return (
    <div className="glass border border-white/10 rounded-xl p-5">
      {/* Titel */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
          <Truck className="w-4 h-4 text-lime/70" /> Betriebsübersicht
        </h3>
        <button onClick={() => navigate("/fuhrpark")}
          className="text-xs text-lime/70 hover:text-lime transition flex items-center gap-1">
          Fuhrpark <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Flotten-Statusbar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground">Flottenauslastung · {fleet.total} Lkw</span>
          <span className="text-muted-foreground/60 tabular-nums">{freePct}% frei · {tripPct}% unterwegs</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden bg-surface-2">
          <div className="bg-lime/70" style={{ width: `${freePct}%` }} />
          <div className="bg-amber-300/70" style={{ width: `${tripPct}%` }} />
          <div className="bg-sky-300/70" style={{ width: `${maintPct}%` }} />
        </div>
        <div className="flex items-center gap-4 mt-2 text-[11px]">
          <span className="flex items-center gap-1.5 text-lime"><span className="w-2 h-2 rounded-full bg-lime/70" /> {fleet.byStatus.free} Frei</span>
          <span className="flex items-center gap-1.5 text-amber-300"><span className="w-2 h-2 rounded-full bg-amber-300/70" /> {fleet.byStatus.on_trip} Unterwegs</span>
          <span className="flex items-center gap-1.5 text-sky-300"><span className="w-2 h-2 rounded-full bg-sky-300/70" /> {fleet.byStatus.maintenance} Wartung</span>
        </div>
      </div>

      {/* Warnungen */}
      {(fleet.criticalCondition > 0 || fleet.byStatus.maintenance > 0) && (
        <div className="flex gap-2 mb-4">
          {fleet.criticalCondition > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-coral bg-coral/5 border border-coral/15 rounded-lg px-2.5 py-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              {fleet.criticalCondition} kritisch (&lt;30)
            </div>
          )}
          {fleet.byStatus.maintenance > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-sky-300 bg-sky-300/5 border border-sky-300/15 rounded-lg px-2.5 py-1.5">
              <Wrench className="w-3 h-3 shrink-0" />
              {fleet.byStatus.maintenance} in Wartung
            </div>
          )}
        </div>
      )}

      {/* Aktive Touren */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Aktive Touren</div>
        {activeVehicles.length === 0 ? (
          <div className="text-xs text-muted-foreground/50 py-3 text-center bg-surface-2/20 rounded-lg border border-white/5">
            Keine Fahrzeuge unterwegs.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-[180px] overflow-y-auto scrollbar-none">
            {activeVehicles.slice(0, 5).map(v => {
              const driver = getVehicleDriver(state, v);
              const order = getVehicleOrder(state, v);
              const nextEvent = getVehicleNextEvent(state, v);
              return (
                <div key={v.id} className="flex items-center gap-2.5 text-xs bg-surface-2/30 rounded-lg px-2.5 py-2 border border-white/5">
                  <span className="font-medium text-foreground/90 shrink-0 w-16 truncate">{vehicleDisplayName(v)}</span>
                  <span className="text-muted-foreground/60 shrink-0 hidden sm:inline">{driver?.name || "—"}</span>
                  <span className="text-muted-foreground truncate flex-1 min-w-0">
                    {order ? `${order.fromCity} → ${order.toCity}` : "Leerfahrt"}
                  </span>
                  {nextEvent && (
                    <span className="flex items-center gap-1 text-sky-300 shrink-0 tabular-nums">
                      <Clock className="w-3 h-3" /> {formatGameTime(nextEvent.min)}
                    </span>
                  )}
                </div>
              );
            })}
            {activeVehicles.length > 5 && (
              <div className="text-[10px] text-muted-foreground/50 text-center pt-1">
                +{activeVehicles.length - 5} weitere unterwegs
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auftrags-Pipeline */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1.5">
          <Package className="w-3 h-3" /> Auftrags-Pipeline
        </div>
        <div className="grid grid-cols-4 gap-2">
          {pipeline.map((p, i) => (
            <div key={i} className="text-center bg-surface-2/30 rounded-lg border border-white/5 py-2">
              <div className={`text-lg font-semibold tabular-nums ${p.color}`}>{p.count}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} /> {p.label}
              </div>
            </div>
          ))}
        </div>
        {orders.unassigned > 0 && (
          <button onClick={() => navigate("/disposition")}
            className="w-full mt-2 flex items-center justify-center gap-1.5 text-[11px] text-amber-300 bg-amber-500/5 border border-amber-400/15 rounded-lg py-1.5 hover:bg-amber-500/10 transition">
            <AlertTriangle className="w-3 h-3" /> {orders.unassigned} {orders.unassigned > 1 ? "angenommene Aufträge" : "angenommener Auftrag"} nicht disponiert – jetzt planen
          </button>
        )}
      </div>
    </div>
  );
}