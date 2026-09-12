import React from "react";
import { vehicleDisplayName, driverDisplayName, tripPhaseLabel } from "@/lib/displayHelpers";
import { formatGameTime } from "@/lib/gameData";
import { Clock, Truck, Users, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";

export default function DispatchTourList({ trips, state, selectedTripId, onSelectTrip }) {
  if (trips.length === 0) {
    return (
      <div className="glass border border-white/10 rounded-xl p-5 text-center">
        <Truck className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Keine Touren unterwegs.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Nimm einen Auftrag an und starte einen Transport.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {trips.map(trip => {
        const vehicle = state.vehicles.find(v => v.id === trip.vehicleId);
        const driver = state.drivers.find(d => d.id === trip.driverId);
        const order = state.orders.find(o => o.id === trip.orderId);
        const isSelected = trip.id === selectedTripId;
        const phases = trip.phases || trip.legs || [];
        const fromCity = order?.fromCity || phases[0]?.fromCity;
        const toCity = order?.toCity || phases[0]?.toCity;
        const punctuality = derivePunctuality(trip, order, state.gameTime);

        return (
          <button
            key={trip.id}
            onClick={() => onSelectTrip(trip.id)}
            className={`w-full text-left rounded-xl p-3 border transition active:scale-[0.99] ${
              isSelected ? "border-lime/40 bg-lime/5" : "border-white/10 hover:border-white/20 bg-surface/30"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{vehicleDisplayName(vehicle)}</span>
              <PhaseBadge trip={trip} />
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <Users className="w-3 h-3 shrink-0" /> {driverDisplayName(driver)}
              <span className="text-muted-foreground/40">·</span>
              <span className="truncate">{order?.customer || "Leerfahrt"}</span>
            </div>
            <div className="flex items-center justify-between mt-2 text-xs">
              <span className="text-foreground/80 flex items-center gap-1">
                {fromCity} <ArrowRight className="w-3 h-3" /> {toCity}
              </span>
              <span className="text-muted-foreground tabular-nums flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatGameTime(trip.endMin)}
              </span>
            </div>
            <div className="mt-2">
              <PunctualityChip punctuality={punctuality} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PhaseBadge({ trip }) {
  const phase = tripPhaseLabel(trip);
  const styles = {
    "Laden": "bg-sky-400/15 text-sky-300",
    "Leerfahrt": "bg-coral/15 text-coral",
    "Beladene Fahrt": "bg-lime/15 text-lime",
    "Entladen": "bg-violet-400/15 text-violet-300",
    "Angekommen": "bg-white/10 text-muted-foreground"
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${styles[phase] || "bg-white/10 text-muted-foreground"}`}>
      {phase}
    </span>
  );
}

function derivePunctuality(trip, order, gameTime) {
  if (!order) return { status: "neutral", text: "Leerfahrt" };
  if (trip.status === "completed") {
    return trip.endMin <= order.deliveryDeadlineMin
      ? { status: "ok", text: "Pünktlich geliefert" }
      : { status: "late", text: "Verspätet geliefert" };
  }
  if (trip.endMin <= order.deliveryDeadlineMin) {
    const buffer = order.deliveryDeadlineMin - trip.endMin;
    const h = Math.floor(buffer / 60), m = buffer % 60;
    return { status: "ok", text: `Puffer ${h} h ${m} min` };
  }
  const late = trip.endMin - order.deliveryDeadlineMin;
  const h = Math.floor(late / 60), m = late % 60;
  return { status: "late", text: `ca. ${h} h ${m} min zu spät` };
}

function PunctualityChip({ punctuality }) {
  const styles = {
    ok: "text-lime",
    late: "text-red-300",
    neutral: "text-muted-foreground"
  };
  const icons = {
    ok: CheckCircle2,
    late: AlertTriangle,
    neutral: null
  };
  const Icon = icons[punctuality.status];
  return (
    <span className={`text-[10px] flex items-center gap-1 ${styles[punctuality.status]}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {punctuality.text}
    </span>
  );
}