import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import { vehicleDisplayName, tripPhaseLabel, driverDisplayName } from "@/lib/displayHelpers";
import { Truck, Users, Clock, Package, ArrowRight } from "lucide-react";

// Dispositionsplan: laufende Touren mit Lkw, Fahrer, Auftrag, Phase, Lieferung und Friststatus.
export default function TripPlan({ selectedTripId, onSelectTrip }) {
  const { state } = useGame();
  const running = state.trips.filter(t => t.status === "in_progress");

  if (running.length === 0) return null;

  return (
    <div className="space-y-2">
      {running.map(t => {
        const order = state.orders.find(o => o.id === t.orderId);
        const vehicle = state.vehicles.find(v => v.id === t.vehicleId);
        const driver = state.drivers.find(d => d.id === t.driverId);
        const isSelected = t.id === selectedTripId;
        const onTime = order ? t.endMin <= order.deliveryDeadlineMin : true;
        const leg = t.legs[t.currentLeg];
        const phaseCity = leg ? (leg.type === "load" ? leg.fromCity : leg.toCity) : "—";

        return (
          <button
            key={t.id}
            onClick={() => onSelectTrip?.(t.id)}
            className={`w-full text-left rounded-xl border p-4 transition ${isSelected ? "border-lime/40 bg-lime/5" : "border-white/10 bg-surface/40 hover:border-white/20"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Truck className="w-4 h-4 text-lime/70" />
                {vehicleDisplayName(vehicle)}
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${onTime ? "bg-lime/15 text-lime" : "bg-red-500/15 text-red-300"}`}>
                {onTime ? "Pünktlich" : "Verspätet"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5"><Users className="w-3 h-3" /> {driverDisplayName(driver)}</div>
              {order ? (
                <div className="flex items-center gap-1.5"><Package className="w-3 h-3" /> {order.customer}: {order.fromCity} <ArrowRight className="w-3 h-3" /> {order.toCity}</div>
              ) : (
                <div className="flex items-center gap-1.5"><Truck className="w-3 h-3" /> Leerfahrt</div>
              )}
              <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {tripPhaseLabel(t)}{leg && leg.type !== "load" && leg.type !== "unload" ? ` nach ${phaseCity}` : ` in ${phaseCity}`}</div>
              <div className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Lieferung: {formatGameTime(t.endMin)}</div>
              {order && !onTime && <div className="text-red-300 text-[11px]">Frist: {formatGameTime(order.deliveryDeadlineMin)}</div>}
            </div>
            {order && (
              <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/10 text-xs">
                <span className="text-muted-foreground">Vergütung</span>
                <span className="text-lime font-medium tabular-nums">{formatEuro(order.paymentCents)}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}