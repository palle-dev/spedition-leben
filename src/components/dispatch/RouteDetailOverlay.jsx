import React from "react";
import { vehicleDisplayName, driverDisplayName } from "@/lib/displayHelpers";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import { getTrafficInfo } from "@/lib/trafficSystem";
import { getRouteTrafficProfile } from "@/lib/trafficMapData";
import { phaseLabel } from "@/lib/driverTimeEngine";
import { X, Truck, User, Package, Clock, Fuel, CreditCard, MapPin, Navigation } from "lucide-react";

// Schwebendes Detail-Panel auf der Karte — erscheint beim Klick auf eine Route.
// Kompakte Zusammenfassung aller Routendetails inkl. Verkehrslage pro Abschnitt.
export default function RouteDetailOverlay({ trip, state, routeData, onClose, onShowOnMap, onShowInWorkspace }) {
  if (!trip) return null;
  const vehicle = state.vehicles.find(v => v.id === trip.vehicleId);
  const driver = state.drivers.find(d => d.id === trip.driverId);
  const order = state.orders.find(o => o.id === trip.orderId);
  const phases = trip.phases || trip.legs || [];
  const currentIdx = trip.currentPhase !== undefined ? trip.currentPhase : trip.currentLeg;
  const currentPhase = phases[currentIdx];
  const buffer = order ? order.deliveryDeadlineMin - trip.endMin : null;

  const drivePhases = phases.filter(p => {
    const t = p.type;
    return t === "empty_drive" || t === "loaded_drive" || t === "empty" || t === "drive";
  });

  return (
    <div className="absolute bottom-3 right-3 z-20 w-[320px] max-w-[calc(100vw-24px)] animate-reveal">
      <div className="glass border border-white/15 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-lime/5 to-transparent">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Truck className="w-4 h-4 text-lime shrink-0" />
              {vehicleDisplayName(vehicle)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <User className="w-3 h-3" /> {driverDisplayName(driver)}
              <span className="text-muted-foreground/40">·</span>
              {order?.customer || "Leerfahrt"}
            </div>
          </div>
          <button aria-label="Routendetails schließen" onClick={onClose} className="w-7 h-7 rounded-lg grid place-items-center bg-white/5 hover:bg-white/15 text-muted-foreground hover:text-foreground transition shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-none">
          {/* Route */}
          {order && (
            <div className="px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-md bg-surface-2 text-foreground/80 font-medium">{order.fromCity}</span>
                <Navigation className="w-3.5 h-3.5 text-lime shrink-0" />
                <span className="px-2 py-1 rounded-md bg-surface-2 text-foreground/80 font-medium">{order.toCity}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
                <Package className="w-3 h-3" /> {order.cargo} · {order.tons} t
              </div>
            </div>
          )}

          {/* Current phase */}
          {currentPhase && (
            <div className="px-4 py-3 border-b border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Aktueller Abschnitt</div>
              <div className="flex items-center gap-2 text-sm text-foreground">
                <MapPin className="w-3.5 h-3.5 text-lime shrink-0" />
                <span className="font-medium">{phaseLabel(currentPhase.type) || currentPhase.type}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                {formatGameTime(currentPhase.startMin)} – {formatGameTime(currentPhase.endMin)}
                {currentPhase.distanceKm ? ` · ${currentPhase.distanceKm} km` : ""}
              </div>
              {(() => {
                const t = currentPhase.type;
                if (t === "empty_drive" || t === "loaded_drive" || t === "empty" || t === "drive") {
                  const level = getRouteTrafficProfile(state.gameTime, currentPhase.fromCity, currentPhase.toCity, routeData).level;
                  const info = getTrafficInfo(level);
                  return (
                    <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium" style={{ background: `${info.color}15`, color: info.color }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: info.color }} />
                      Verkehr: {info.label}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* Traffic per drive segment */}
          {drivePhases.length > 0 && (
            <div className="px-4 py-3 border-b border-white/5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Simulierter Verkehr · stärkster Teilabschnitt</div>
              <div className="space-y-1.5">
                {drivePhases.map((p, i) => {
                  const level = getRouteTrafficProfile(state.gameTime, p.fromCity, p.toCity, routeData).level;
                  const info = getTrafficInfo(level);
                  const isEmpty = p.type === "empty_drive" || p.type === "empty";
                  return (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: info.color }} />
                      <span className="text-foreground/70 truncate">{p.fromCity} → {p.toCity}</span>
                      <span className="text-muted-foreground/50 ml-auto shrink-0">{isEmpty ? "Leer" : "Beladen"}</span>
                      <span className="font-medium shrink-0" style={{ color: info.color }}>{info.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Timeline & costs */}
          <div className="px-4 py-3 space-y-2">
            {order && (
              <>
                <Row icon={Clock} label="Lieferfrist" value={formatGameTime(order.deliveryDeadlineMin)} />
                <Row icon={Clock} label="Ankunft" value={formatGameTime(trip.endMin)} />
                <Row
                  icon={buffer >= 0 ? MapPin : Clock}
                  label="Puffer"
                  value={buffer != null ? `${buffer >= 0 ? "+" : ""}${Math.floor(Math.abs(buffer) / 60)} h ${Math.abs(buffer) % 60} min` : "—"}
                  tone={buffer >= 0 ? "ok" : "late"}
                />
              </>
            )}
            <div className="border-t border-white/10 pt-2 space-y-1.5">
              {order && <Row icon={Package} label="Vergütung" value={formatEuro(trip.paymentCents)} />}
              <Row icon={Fuel} label="Kraftstoff" value={formatEuro(trip.fuelCents)} tone="cost" />
              <Row icon={CreditCard} label="Zollagentur" value={formatEuro(trip.customsCents||0)} />
        <Row icon={CreditCard} label="Maut" value={formatEuro(trip.tollCents)} tone="cost" />
              <div className="flex items-center justify-between pt-1.5 border-t border-white/10">
                <span className="text-[11px] text-muted-foreground">Beitrag</span>
                <span className="text-sm font-semibold text-lime tabular-nums">
                  {formatEuro((order?.paymentCents || 0) - trip.fuelCents - trip.tollCents - (trip.customsCents||0))}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 py-3 border-t border-white/10 bg-ink/40">
          <button
            onClick={onShowOnMap}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-white/5 border border-white/10 text-[11px] font-medium hover:bg-white/10 transition active:scale-95"
          >
            <MapPin className="w-3 h-3" /> Auf Karte
          </button>
          <button
            onClick={onShowInWorkspace}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-lime/10 border border-lime/30 text-lime text-[11px] font-medium hover:border-lime/50 transition active:scale-95"
          >
            <Navigation className="w-3 h-3" /> Details öffnen
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value, tone = undefined }) {
  const color = tone === "ok" ? "text-lime" : tone === "late" ? "text-red-300" : tone === "cost" ? "text-amber-300/80" : "text-foreground/80";
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground flex items-center gap-1.5"><Icon className="w-3 h-3" /> {label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </div>
  );
}