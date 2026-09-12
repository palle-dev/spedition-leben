import React, { useState, useMemo, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import {
  CITIES, getDistance, driveMinutes, fuelEur, tollEur, formatEuro, formatGameTime,
  LOAD_MIN, UNLOAD_MIN, MAX_DUTY_MIN
} from "@/lib/gameData";
import { vehicleDisplayName, driverDisplayName, driverInitials, driverAvatarClass } from "@/lib/displayHelpers";
import { Truck, Users, Play, ArrowLeft, AlertTriangle, Package, MapPin, Clock, Fuel, CreditCard, ArrowRight, CheckCircle2 } from "lucide-react";

export default function DispatchPlanner({ orderId, onBack, onStarted, onPlanChange, preselectedVehicleId }) {
  const { state, send, showToast } = useGame();
  const order = state.orders.find(o => o.id === orderId);
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId || "");
  const [driverId, setDriverId] = useState("");
  const [starting, setStarting] = useState(false);

  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);

  const plan = useMemo(() => {
    if (!order || !vehicle) return null;
    let t = state.gameTime, totalKm = 0, emptyKm = 0, driveKm = 0;
    const legs = [];
    if (vehicle.locationCity !== order.fromCity) {
      const d = getDistance(vehicle.locationCity, order.fromCity);
      emptyKm = d; totalKm += d;
      const dur = driveMinutes(d);
      legs.push({ type: "Leerfahrt", from: vehicle.locationCity, to: order.fromCity, dur });
      t += dur;
    }
    legs.push({ type: "Laden", from: order.fromCity, to: order.fromCity, dur: LOAD_MIN });
    t += LOAD_MIN;
    const d = getDistance(order.fromCity, order.toCity);
    driveKm = d; totalKm += d;
    const dur = driveMinutes(d);
    legs.push({ type: "Fahrt", from: order.fromCity, to: order.toCity, dur });
    t += dur;
    legs.push({ type: "Entladen", from: order.toCity, to: order.toCity, dur: UNLOAD_MIN });
    t += UNLOAD_MIN;
    const fuel = fuelEur(totalKm, vehicle.consumptionPer100km);
    const toll = tollEur(totalKm);
    return { emptyKm, driveKm, totalKm, totalDuration: t - state.gameTime, endMin: t, fuel, toll, legs };
  }, [order, vehicle, state.gameTime]);

  const validation = useMemo(() => {
    if (!vehicle || !driver) return null;
    if (vehicle.status !== "free") return "Fahrzeug ist nicht frei.";
    if (driver.status !== "free") return "Fahrer ist nicht frei.";
    if (driver.restUntil && driver.restUntil > state.gameTime) return `Fahrer ruht noch bis ${formatGameTime(driver.restUntil)}.`;
    if (vehicle.condition < 20) return "Fahrzeugzustand unter 20 – Wartung erforderlich.";
    if (vehicle.locationCity !== driver.locationCity) return "Fahrer und Lkw sind an verschiedenen Orten.";
    if (order.tons > vehicle.capacityTons) return `Überladung: ${order.tons} t überschreiten ${vehicle.capacityTons} t Nutzlast.`;
    if (plan && plan.totalDuration > MAX_DUTY_MIN) return `Einsatzdauer überschreitet 8 Stunden (${Math.floor(plan.totalDuration / 60)} h ${plan.totalDuration % 60} min).`;
    if (state.company.accountCents < (plan ? (plan.fuel + plan.toll) * 100 : 0)) return "Firmenkonto reicht für Kraftstoff und Maut nicht aus.";
    return null;
  }, [vehicle, driver, order, plan, state.gameTime, state.company.accountCents]);

  const canStart = plan && !validation && vehicleId && driverId;

  // Notify parent of plan changes (for map preview)
  useEffect(() => {
    onPlanChange?.(vehicle ? { vehicle, plan } : null);
  }, [vehicle, plan]);

  const sortedVehicles = useMemo(() => {
    return state.vehicles
      .map(v => {
        let suitable = true, reason = "";
        if (v.status !== "free") { suitable = false; reason = "Nicht frei"; }
        else if (v.condition < 20) { suitable = false; reason = "Zustand < 20"; }
        else if (order.tons > v.capacityTons) { suitable = false; reason = `Nur ${v.capacityTons} t`; }
        return { v, suitable, reason };
      })
      .sort((a, b) => (b.suitable ? 1 : 0) - (a.suitable ? 1 : 0) || (a.v.locationCity === order.fromCity ? -1 : 1));
  }, [state.vehicles, order]);

  const sortedDrivers = useMemo(() => {
    if (!vehicle) return [];
    return state.drivers
      .map(d => {
        let suitable = true, reason = "";
        if (d.status !== "free") { suitable = false; reason = "Nicht frei"; }
        else if (d.restUntil && d.restUntil > state.gameTime) { suitable = false; reason = `Ruht bis ${formatGameTime(d.restUntil)}`; }
        else if (d.locationCity !== vehicle.locationCity) { suitable = false; reason = `In ${d.locationCity}`; }
        return { d, suitable, reason };
      })
      .sort((a, b) => (b.suitable ? 1 : 0) - (a.suitable ? 1 : 0));
  }, [state.drivers, vehicle, state.gameTime]);

  async function start() {
    if (!canStart) return;
    setStarting(true);
    try {
      const r = await send("startTransport", { orderId, vehicleId, driverId });
      showToast(`Transport gestartet – ${formatEuro(r.fuelCents)} Kraftstoff, ${formatEuro(r.tollCents)} Maut.`, "success");
      onStarted?.(r);
    } catch (e) { showToast(e.message, "error"); }
    finally { setStarting(false); }
  }

  if (!order) return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition">
        <ArrowLeft className="w-3.5 h-3.5" /> Zurück zur Auftragsliste
      </button>
      <div className="glass border border-white/10 rounded-xl p-5 text-center">
        <Package className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Auftrag nicht mehr verfügbar.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Wähle einen anderen Auftrag aus der Liste.</p>
      </div>
    </div>
  );

  const buffer = plan ? order.deliveryDeadlineMin - plan.endMin : null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition">
        <ArrowLeft className="w-3.5 h-3.5" /> Zurück zur Auftragsliste
      </button>

      {/* Order info */}
      <div className="glass border border-white/10 rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Auftrag</div>
        <div className="text-sm font-medium mt-1">{order.customer}</div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {order.fromCity} → {order.toCity}</span>
          <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {order.tons} t · {order.cargo}</span>
        </div>
        <div className="flex items-center justify-between mt-2 text-xs">
          <span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Frist: {formatGameTime(order.deliveryDeadlineMin)}</span>
          <span className="text-lime font-medium tabular-nums">{formatEuro(order.paymentCents)}</span>
        </div>
      </div>

      {/* Vehicle selection */}
      <div>
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" /> Fahrzeug
        </div>
        <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-none">
          {sortedVehicles.map(({ v, suitable, reason }) => (
            <button
              key={v.id}
              onClick={() => suitable && setVehicleId(v.id)}
              disabled={!suitable}
              className={`w-full text-left rounded-lg p-2.5 border text-xs transition ${
                v.id === vehicleId ? "border-lime/40 bg-lime/5" : suitable ? "border-white/10 hover:border-white/20 bg-surface/30" : "border-white/5 opacity-50 cursor-not-allowed"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{vehicleDisplayName(v)}</span>
                <span className="text-muted-foreground">{v.locationCity} · {v.capacityTons} t · Z {v.condition}</span>
              </div>
              {!suitable && <div className="text-[10px] text-amber-300 mt-0.5">{reason}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Driver selection */}
      {vehicleId && (
        <div>
          <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Fahrer
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-none">
            {sortedDrivers.map(({ d, suitable, reason }) => (
              <button
                key={d.id}
                onClick={() => suitable && setDriverId(d.id)}
                disabled={!suitable}
                className={`w-full text-left rounded-lg p-2.5 border text-xs transition flex items-center gap-2.5 ${
                  d.id === driverId ? "border-lime/40 bg-lime/5" : suitable ? "border-white/10 hover:border-white/20 bg-surface/30" : "border-white/5 opacity-50 cursor-not-allowed"
                }`}
              >
                <span className={`w-7 h-7 rounded-full grid place-items-center text-[10px] font-bold shrink-0 ${driverAvatarClass(d)}`}>
                  {driverInitials(d)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{driverDisplayName(d)}</span>
                    <span className="text-muted-foreground shrink-0">{d.locationCity}</span>
                  </div>
                  {!suitable && <div className="text-[10px] text-amber-300 mt-0.5">{reason}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plan preview */}
      {plan && (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-1">Vorschau</div>
          {plan.legs.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{l.type}: {l.from} <ArrowRight className="w-3 h-3 inline" /> {l.to}</span>
              <span className="text-foreground/70 tabular-nums">{Math.floor(l.dur / 60)} h {l.dur % 60} min</span>
            </div>
          ))}
          <div className="space-y-1.5 pt-2 border-t border-white/10">
            <SummaryRow label="Leerfahrt" value={`${plan.emptyKm} km`} />
            <SummaryRow label="Beladene Fahrt" value={`${plan.driveKm} km`} />
            <SummaryRow label="Einsatzdauer" value={`${Math.floor(plan.totalDuration / 60)} h ${plan.totalDuration % 60} min`} warn={plan.totalDuration > MAX_DUTY_MIN} />
            <SummaryRow label="Ankunft" value={formatGameTime(plan.endMin)} />
            <SummaryRow label="Fristpuffer" value={buffer != null ? `${buffer >= 0 ? "+" : ""}${Math.floor(Math.abs(buffer) / 60)} h ${Math.abs(buffer) % 60} min` : "—"} tone={buffer >= 0 ? "ok" : "late"} />
            <SummaryRow icon={Fuel} label="Kraftstoff" value={formatEuro(plan.fuel * 100)} />
            <SummaryRow icon={CreditCard} label="Maut" value={formatEuro(plan.toll * 100)} />
            <SummaryRow label="Sofortkosten" value={formatEuro((plan.fuel + plan.toll) * 100)} strong />
            <SummaryRow label="Vergütung bei Lieferung" value={formatEuro(order.paymentCents)} />
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-xs text-muted-foreground">Beitrag vor Fixkosten</span>
              <span className="text-lg font-medium text-lime tabular-nums">{formatEuro(order.paymentCents - (plan.fuel + plan.toll) * 100)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Validation */}
      {validation && (
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{validation}</span>
        </div>
      )}

      {/* Recommendation */}
      {canStart && plan && plan.emptyKm === 0 && buffer >= 60 && (
        <div className="flex items-start gap-2 text-xs text-lime bg-lime/5 border border-lime/20 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Geeignete Kombination: Lkw am Abholort, ausreichender Fristpuffer.</span>
        </div>
      )}

      {/* Start button – sticky im Sichtbereich */}
      <div className="sticky bottom-0 -mx-3 px-3 pb-3 pt-4 mt-4 bg-gradient-to-t from-ink via-ink/95 to-transparent">
        <button
          onClick={start}
          disabled={!canStart || starting}
          className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.98]"
        >
          {starting ? <><span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> Startet…</> : <><Play className="w-4 h-4" /> Transport starten</>}
        </button>
        {!canStart && !validation && plan && (
          <div className="text-xs text-muted-foreground text-center mt-2">Wähle Lkw und Fahrer, um zu starten.</div>
        )}
        {validation && (
          <div className="text-xs text-amber-300 text-center mt-2">{validation}</div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value, strong, warn, tone }) {
  const color = warn ? "text-red-300" : tone === "ok" ? "text-lime" : tone === "late" ? "text-red-300" : strong ? "text-foreground font-medium" : "text-foreground/70";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground flex items-center gap-1.5">{Icon && <Icon className="w-3.5 h-3.5" />} {label}</span>
      <span className={`tabular-nums ${color}`}>{value}</span>
    </div>
  );
}