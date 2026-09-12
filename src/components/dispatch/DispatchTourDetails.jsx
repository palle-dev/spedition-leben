import React from "react";
import { vehicleDisplayName, driverDisplayName } from "@/lib/displayHelpers";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import { hasRealGeometry } from "@/lib/geoData";
import { ArrowLeft, MapPin, Clock, Package, Truck, CheckCircle2, AlertTriangle, Fuel, CreditCard, User } from "lucide-react";

export default function DispatchTourDetails({ trip, state, routeData, onBack, onShowOnMap, onShowVehicle }) {
  const vehicle = state.vehicles.find(v => v.id === trip.vehicleId);
  const driver = state.drivers.find(d => d.id === trip.driverId);
  const order = state.orders.find(o => o.id === trip.orderId);
  const currentLeg = trip.legs[trip.currentLeg];
  const hasGeometry = trip.legs.every(l =>
    l.type === "load" || l.type === "unload" || hasRealGeometry(l.fromCity, l.toCity, routeData)
  );

  const buffer = order ? order.deliveryDeadlineMin - trip.endMin : null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition">
        <ArrowLeft className="w-3.5 h-3.5" /> Zurück zur Tourenliste
      </button>

      <div>
        <div className="text-sm font-medium">{vehicleDisplayName(vehicle)}</div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <User className="w-3 h-3" /> {driverDisplayName(driver)}
          <span className="text-muted-foreground/40">·</span>
          {order?.customer || "Leerfahrt"}
        </div>
      </div>

      {/* Phase timeline */}
      <div className="space-y-1.5">
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2">Phasen</div>
        {trip.legs.map((leg, i) => (
          <PhaseRow key={i} leg={leg} isCurrent={i === trip.currentLeg} isPast={i < trip.currentLeg} gameTime={state.gameTime} />
        ))}
      </div>

      {/* Current location */}
      <div className="glass border border-white/10 rounded-lg p-3">
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-1">Aktueller Abschnitt</div>
        <div className="text-sm text-foreground flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-lime" />
          {currentLeg ? phaseDescription(currentLeg) : "Angekommen"}
        </div>
        {currentLeg && (
          <div className="text-xs text-muted-foreground mt-1 tabular-nums">
            {formatGameTime(currentLeg.startMin)} – {formatGameTime(currentLeg.endMin)}
          </div>
        )}
      </div>

      {/* Deadline & progress */}
      {order && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <Row icon={Clock} label="Lieferfrist" value={formatGameTime(order.deliveryDeadlineMin)} />
          <Row icon={Clock} label="Geplanter Abschluss" value={formatGameTime(trip.endMin)} />
          <Row
            icon={buffer >= 0 ? CheckCircle2 : AlertTriangle}
            label="Puffer"
            value={buffer != null ? `${buffer >= 0 ? "+" : ""}${Math.floor(Math.abs(buffer) / 60)} h ${Math.abs(buffer) % 60} min` : "—"}
            tone={buffer >= 0 ? "ok" : "late"}
          />
        </div>
      )}

      {/* Payment & costs */}
      <div className="space-y-2 border-t border-white/10 pt-3">
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-1">Kosten & Vergütung</div>
        {order && <Row icon={Package} label="Vergütung bei Lieferung" value={formatEuro(trip.paymentCents)} />}
        <Row icon={Fuel} label="Kraftstoff (bezahlt)" value={formatEuro(trip.fuelCents)} />
        <Row icon={CreditCard} label="Maut (bezahlt)" value={formatEuro(trip.tollCents)} />
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-xs text-muted-foreground">Beitrag vor Fixkosten</span>
          <span className="text-lg font-medium text-lime tabular-nums">
            {formatEuro((order?.paymentCents || 0) - trip.fuelCents - trip.tollCents)}
          </span>
        </div>
      </div>

      {/* Driver rest info */}
      {driver?.status === "on_trip" && (
        <div className="text-[11px] text-muted-foreground/70 leading-relaxed">
          Nach Abschluss ruht {driverDisplayName(driver)} bis {formatGameTime(trip.endMin + 480)}.
        </div>
      )}

      {/* Geometry note */}
      {!hasGeometry && (
        <div className="flex items-start gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Routenverlauf für einen Abschnitt nicht verfügbar – vereinfachte Verbindung wird gezeigt.</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onShowOnMap}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition active:scale-95"
        >
          <MapPin className="w-3.5 h-3.5" /> Auf Karte zeigen
        </button>
        <button
          onClick={onShowVehicle}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-white/5 border border-white/10 text-xs font-medium hover:bg-white/10 transition active:scale-95"
        >
          <Truck className="w-3.5 h-3.5" /> Fahrzeug ansehen
        </button>
      </div>
    </div>
  );
}

function PhaseRow({ leg, isCurrent, isPast, gameTime }) {
  const label = leg.type === "empty" || leg.type === "empty_drive" ? "Leerfahrt"
    : leg.type === "load" ? "Laden"
    : leg.type === "drive" ? "Beladene Fahrt"
    : leg.type === "unload" ? "Entladen" : leg.type;

  const dotColor = isCurrent ? "bg-lime" : isPast ? "bg-lime/40" : "bg-white/20";
  const textColor = isCurrent ? "text-foreground" : isPast ? "text-foreground/60" : "text-muted-foreground";

  let progress = null;
  if (isCurrent && leg.type !== "load" && leg.type !== "unload") {
    const dur = leg.endMin - leg.startMin;
    progress = dur > 0 ? Math.min(1, Math.max(0, (gameTime - leg.startMin) / dur)) : 0;
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="flex flex-col items-center pt-1">
        <div className={`w-2 h-2 rounded-full ${dotColor}`} />
        <div className={`w-px flex-1 ${isPast ? "bg-lime/20" : "bg-white/10"} mt-1`} style={{ minHeight: 12 }} />
      </div>
      <div className={`flex-1 pb-2 ${textColor}`}>
        <div className="text-xs font-medium flex items-center justify-between">
          <span>{label}: {leg.fromCity} → {leg.toCity}</span>
          {isCurrent && <span className="text-[9px] text-lime uppercase tracking-wider">aktiv</span>}
        </div>
        <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
          {formatGameTime(leg.startMin)} – {formatGameTime(leg.endMin)}
          {leg.distanceKm ? ` · ${leg.distanceKm} km` : ""}
        </div>
        {progress != null && (
          <div className="w-full h-0.5 rounded-full bg-white/10 mt-1.5 overflow-hidden">
            <div className="h-full bg-lime rounded-full" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function phaseDescription(leg) {
  if (leg.type === "load") return `Laden in ${leg.fromCity}`;
  if (leg.type === "unload") return `Entladen in ${leg.toCity}`;
  if (leg.type === "empty" || leg.type === "empty_drive") return `Leerfahrt nach ${leg.toCity}`;
  if (leg.type === "drive") return `Unterwegs nach ${leg.toCity}`;
  return leg.type;
}

function Row({ icon: Icon, label, value, tone }) {
  const color = tone === "ok" ? "text-lime" : tone === "late" ? "text-red-300" : "text-foreground/80";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </div>
  );
}