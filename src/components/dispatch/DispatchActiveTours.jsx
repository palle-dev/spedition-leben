import React from "react";
import { vehicleDisplayName, driverDisplayName } from "@/lib/displayHelpers";
import { formatGameTime } from "@/lib/gameData";
import { Route, ArrowRight, CheckCircle2, Clock, Circle } from "lucide-react";

// Zeigt aktive Tour-Ketten mit ihren Einsatz-Status an.
export default function DispatchActiveTours({ tours, state, onSelectTrip }) {
  if (!tours || tours.length === 0) return null;

  return (
    <div className="space-y-2 mb-3">
      <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5 px-1">
        <Route className="w-3 h-3" /> Aktive Tour-Ketten
      </div>
      {tours.map(tour => {
        const vehicle = state.vehicles.find(v => v.id === tour.vehicleId);
        const driver = state.drivers.find(d => d.id === tour.driverId);
        const activeTrip = state.trips.find(t => t.tourId === tour.id && t.status === "in_progress");
        const allDeps = [...(tour.deployments || []), ...(tour.returnDeployment ? [tour.returnDeployment] : [])];

        return (
          <button
            key={tour.id}
            onClick={() => activeTrip && onSelectTrip?.(activeTrip.id)}
            className={`w-full text-left rounded-xl p-3 border transition ${
              activeTrip ? "border-lime/30 bg-lime/5 hover:border-lime/50 cursor-pointer" : "border-white/10 bg-surface/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{vehicle ? vehicleDisplayName(vehicle) : tour.vehicleId}</span>
              <span className="text-[10px] text-muted-foreground">{driver ? driverDisplayName(driver) : ""}</span>
            </div>

            {/* Einsatz-Kette */}
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {allDeps.map((dep, i) => {
                const isActive = dep.status === "active";
                const isDone = dep.status === "completed";
                const isPlanned = dep.status === "planned";
                return (
                  <React.Fragment key={i}>
                    {i > 0 && <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />}
                    <span
                      className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                        isActive ? "bg-lime/20 text-lime" : isDone ? "bg-white/5 text-muted-foreground" : "bg-white/5 text-muted-foreground/60"
                      }`}
                    >
                      {isDone ? <CheckCircle2 className="w-2.5 h-2.5" /> : isActive ? <Clock className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
                      {dep.toCity}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>

            {activeTrip && (
              <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> Aktiv bis {formatGameTime(activeTrip.endMin)}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}