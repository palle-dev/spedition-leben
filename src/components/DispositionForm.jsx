import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { CITIES, getDistance, driveMinutes, fuelEur, tollEur, formatEuro, formatGameTime, LOAD_MIN, UNLOAD_MIN, MAX_DUTY_MIN } from "@/lib/gameData";
import { Truck, Users, Play, ArrowRight, AlertTriangle, MapPin, Clock, Package } from "lucide-react";

// Dispositionsformular für die seitliche Disposition.
// Wird im Drawer (von Büro/Aufträge) und auf der Disposition-Seite verwendet.
// Alle Berechnungen sind Vorschau – das Backend prüft verbindlich.
export default function DispositionForm({ orderId, onClose, onSuccess }) {
  const { state, send, showToast } = useGame();
  const order = state.orders.find(o => o.id === orderId);
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [starting, setStarting] = useState(false);

  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);

  const plan = useMemo(() => {
    if (!order || !vehicle || !driver) return null;
    let totalKm = 0, emptyKm = 0, dur = 0;
    const legs = [];
    if (vehicle.locationCity !== order.fromCity) {
      const d = getDistance(vehicle.locationCity, order.fromCity);
      emptyKm = d; totalKm += d; dur += driveMinutes(d);
      legs.push({ type: "Leerfahrt", from: vehicle.locationCity, to: order.fromCity, dur: driveMinutes(d) });
    }
    legs.push({ type: "Laden", from: order.fromCity, to: order.fromCity, dur: LOAD_MIN }); dur += LOAD_MIN;
    const d = getDistance(order.fromCity, order.toCity); totalKm += d; dur += driveMinutes(d);
    legs.push({ type: "Fahrt", from: order.fromCity, to: order.toCity, dur: driveMinutes(d) });
    legs.push({ type: "Entladen", from: order.toCity, to: order.toCity, dur: UNLOAD_MIN }); dur += UNLOAD_MIN;
    return { emptyKm, totalKm, totalDuration: dur, fuel: fuelEur(totalKm, vehicle.consumptionPer100km), toll: tollEur(totalKm), legs };
  }, [order, vehicle, driver]);

  const freeVehicles = state.vehicles.filter(v => v.status === "free");
  const freeDrivers = state.drivers.filter(d => d.status === "free" && (!d.restUntil || d.restUntil <= state.gameTime));

  const validation = useMemo(() => {
    if (!vehicle || !driver) return null;
    if (vehicle.status !== "free") return "Fahrzeug ist nicht frei.";
    if (driver.status !== "free") return "Fahrer ist nicht frei.";
    if (driver.restUntil && driver.restUntil > state.gameTime) return "Fahrer ist noch in der Erholung.";
    if (vehicle.condition < 20) return "Fahrzeugzustand zu schlecht (unter 20). Wartung erforderlich.";
    if (vehicle.locationCity !== driver.locationCity) return "Fahrer und Lkw sind an verschiedenen Orten.";
    if (order.tons > vehicle.capacityTons) return `Überladung: ${order.tons} t überschreiten ${vehicle.capacityTons} t Kapazität.`;
    if (plan && plan.totalDuration > MAX_DUTY_MIN) return `Einsatzdauer überschreitet 8 Stunden (${Math.floor(plan.totalDuration/60)} h ${plan.totalDuration%60} min).`;
    if (state.company.accountCents < (plan ? (plan.fuel + plan.toll) * 100 : 0)) return "Firmenkonto reicht für Kraftstoff und Maut nicht aus.";
    return null;
  }, [vehicle, driver, order, plan, state.gameTime, state.company.accountCents]);

  const canStart = plan && !validation;

  async function start() {
    if (!canStart) return;
    setStarting(true);
    try {
      const r = await send("startTransport", { orderId, vehicleId, driverId });
      showToast(`Transport gestartet – ${formatEuro(r.fuelCents)} Kraftstoff, ${formatEuro(r.tollCents)} Maut.`, "success");
      onSuccess?.(r);
      onClose?.();
    } catch (e) { showToast(e.message, "error"); }
    finally { setStarting(false); }
  }

  if (!order) return <div className="text-sm text-muted-foreground">Auftrag nicht gefunden.</div>;

  return (
    <div className="space-y-5">
      {/* Streckenvorschau */}
      <div className="h-32 rounded-xl bg-surface-2 border border-white/10 relative overflow-hidden">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 128" preserveAspectRatio="none">
          <path d="M0 32H400M0 64H400M0 96H400M80 0V128M160 0V128M240 0V128M320 0V128" stroke="currentColor" strokeWidth="0.5" className="text-white/5" />
          <path d="M70 88C125 88 145 40 208 44S263 72 333 36" fill="none" stroke="hsl(var(--lime))" strokeWidth="2" strokeDasharray="6 5" className="animate-flow" />
          <circle cx="70" cy="88" r="5" fill="hsl(var(--lime))" />
          <circle cx="333" cy="36" r="5" fill="hsl(var(--lime))" />
        </svg>
        <div className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{order.fromCity} → {order.toCity}</div>
      </div>

      {/* Auftrag */}
      <div className="space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Auftrag</div>
        <div className="text-sm text-foreground font-medium">{order.customer}</div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {order.fromCity} → {order.toCity}</span>
          <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {order.tons} t · {order.cargo}</span>
        </div>
        <div className="text-xs text-muted-foreground">Lieferfrist: {formatGameTime(order.deliveryDeadlineMin)}</div>
      </div>

      {/* Auswahl */}
      <div className="space-y-3">
        <SelectField label="Fahrzeug" icon={Truck} value={vehicleId} onChange={setVehicleId}>
          <option value="">– wählen –</option>
          {freeVehicles.map(v => <option key={v.id} value={v.id}>{v.id} · {v.locationCity} · Zustand {v.condition}</option>)}
        </SelectField>
        <SelectField label="Fahrer" icon={Users} value={driverId} onChange={setDriverId}>
          <option value="">– wählen –</option>
          {freeDrivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.locationCity}</option>)}
        </SelectField>
      </div>

      {/* Plan */}
      {plan && (
        <div className="space-y-2 border-t border-white/10 pt-4">
          {plan.legs.map((l, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{l.type}: {l.from} <ArrowRight className="w-3 h-3 inline" /> {l.to}</span>
              <span className="text-foreground/70 tabular-nums">{l.dur} min</span>
            </div>
          ))}
          <div className="space-y-1.5 pt-2 border-t border-white/10">
            <SummaryRow label="Gesamtdistanz" value={`${plan.totalKm} km`} />
            <SummaryRow label="Einsatzdauer" value={`${Math.floor(plan.totalDuration/60)} h ${plan.totalDuration%60} min`} warn={plan.totalDuration > MAX_DUTY_MIN} />
            <SummaryRow label="Kraftstoff" value={formatEuro(plan.fuel * 100)} />
            <SummaryRow label="Maut" value={formatEuro(plan.toll * 100)} />
            <SummaryRow label="Sofortkosten" value={formatEuro((plan.fuel + plan.toll) * 100)} strong />
            <SummaryRow label="Vergütung bei Lieferung" value={formatEuro(order.paymentCents)} />
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-xs text-muted-foreground">Beitrag vor Fixkosten</span>
              <span className="text-lg font-medium text-lime tabular-nums">{formatEuro(order.paymentCents - (plan.fuel + plan.toll) * 100)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Validierung */}
      {validation && (
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{validation}</span>
        </div>
      )}

      {/* Start */}
      <button
        onClick={start}
        disabled={!canStart || starting}
        className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-[0.98]"
      >
        {starting ? <><span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> Startet…</> : <><Play className="w-4 h-4" /> Transport starten</>}
      </button>
      {!canStart && !validation && plan && (
        <div className="text-xs text-muted-foreground text-center">Wähle Lkw und Fahrer, um zu starten.</div>
      )}
    </div>
  );
}

function SelectField({ label, icon: Icon, value, onChange, children }) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
        {children}
      </select>
    </label>
  );
}

function SummaryRow({ label, value, strong, warn }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${warn ? "text-red-300" : strong ? "text-foreground font-medium" : "text-foreground/70"}`}>{value}</span>
    </div>
  );
}