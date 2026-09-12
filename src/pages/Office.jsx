import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime } from "@/lib/gameData";
import OfficeScene from "@/components/office/OfficeScene";
import ContextActions from "@/components/office/ContextActions";
import CareerProgress from "@/components/office/CareerProgress";
import { MapPin } from "lucide-react";

export default function Office() {
  const { state } = useGame();

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 order-1">
          <OfficeScene state={state} />
        </div>
        <div className="lg:col-span-4 order-2">
          <ContextActions state={state} />
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <RunningTrips state={state} />
        </div>
        <div className="lg:col-span-5">
          <CareerProgress state={state} />
        </div>
      </div>
    </div>
  );
}

function legLabel(leg) {
  if (!leg) return "—";
  if (leg.type === "empty") return `Leerfahrt ${leg.fromCity} → ${leg.toCity}`;
  if (leg.type === "load") return `Laden in ${leg.fromCity}`;
  if (leg.type === "drive") return `Fahrt ${leg.fromCity} → ${leg.toCity}`;
  if (leg.type === "unload") return `Entladen in ${leg.toCity}`;
  if (leg.type === "empty_drive") return `Leerfahrt ${leg.fromCity} → ${leg.toCity}`;
  return leg.type;
}

function RunningTrips({ state }) {
  const trips = state.trips.filter((t) => t.status === "in_progress");
  return (
    <div className="bg-office-2/60 border border-wood/30 rounded-lg p-3 h-full">
      <div className="flex items-center gap-2 text-amber-200 text-sm font-medium mb-2">
        <MapPin className="w-4 h-4" /> Laufende Fahrten
      </div>
      {trips.length === 0 ? (
        <div className="text-sm text-amber-100/50">Keine Fahrten unterwegs.</div>
      ) : (
        <ul className="space-y-1.5">
          {trips.map((t) => {
            const v = state.vehicles.find((x) => x.id === t.vehicleId);
            const d = state.drivers.find((x) => x.id === t.driverId);
            const o = state.orders.find((x) => x.id === t.orderId);
            const leg = t.legs[t.currentLeg];
            return (
              <li key={t.id} className="text-xs border border-wood/20 rounded px-2 py-1.5 bg-office/40">
                <div className="text-amber-100 font-medium">{v?.id.toUpperCase()} · {d?.name}</div>
                <div className="text-amber-100/60">{legLabel(leg)} · bis {formatGameTime(leg.endMin)}</div>
                {o && <div className="text-amber-100/50">Ziel: {o.toCity} · Frist {formatGameTime(o.deliveryDeadlineMin)}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}