import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { CITIES, getDistance, driveMinutes, fuelEur, tollEur, formatEuro, formatGameTime, MAX_DUTY_MIN } from "@/lib/gameData";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import DispositionForm from "@/components/DispositionForm";
import DispatchMap from "@/components/DispatchMap";
import TripPlan from "@/components/TripPlan";
import { Truck, Users, Play, ArrowRight, AlertTriangle, Package, Navigation } from "lucide-react";

export default function Dispatch() {
  const { state, send, showToast } = useGame();
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const [selectedTripId, setSelectedTripId] = useState(urlParams.get("trip") || "");
  const [mode, setMode] = useState("order");
  const accepted = state.orders.filter(o => o.status === "angenommen" && !state.trips.some(t => t.orderId === o.id && t.status === "in_progress"));
  const [orderId, setOrderId] = useState(accepted[0]?.id || "");
  const [emptyFrom, setEmptyFrom] = useState("Hamburg");
  const [emptyTo, setEmptyTo] = useState("Bremen");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [starting, setStarting] = useState(false);

  const running = state.trips.filter(t => t.status === "in_progress");
  const freeVehicles = state.vehicles.filter(v => v.status === "free");
  const freeDrivers = state.drivers.filter(d => d.status === "free" && (!d.restUntil || d.restUntil <= state.gameTime));
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);

  const emptyPlan = useMemo(() => {
    if (!vehicle || !driver || emptyFrom === emptyTo) return null;
    const dist = getDistance(emptyFrom, emptyTo);
    const dur = driveMinutes(dist);
    return { dist, dur, fuel: fuelEur(dist, vehicle.consumptionPer100km), toll: tollEur(dist) };
  }, [vehicle, driver, emptyFrom, emptyTo]);

  const canEmpty = vehicle && driver && vehicle.status === "free" && driver.status === "free"
    && vehicle.locationCity === driver.locationCity && vehicle.locationCity === emptyFrom && emptyFrom !== emptyTo
    && emptyPlan && emptyPlan.dur <= MAX_DUTY_MIN;

  async function startEmpty() {
    if (!canEmpty) return;
    setStarting(true);
    try {
      const r = await send("startEmptyTrip", { fromCity: emptyFrom, toCity: emptyTo, vehicleId, driverId });
      showToast(`Leerfahrt gestartet – Ankunft ${formatGameTime(r.endMin)}.`, "success");
      setVehicleId(""); setDriverId("");
    } catch (e) { showToast(e.message, "error"); }
    finally { setStarting(false); }
  }

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-5 lg:py-8 max-w-6xl mx-auto space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-medium tracking-tight">Disposition</h1>
          <p className="text-sm text-muted-foreground mt-1">Transportzentrale – Touren, Karte und Zuweisung.</p>
        </div>
        <div className="flex gap-1 bg-ink/60 border border-white/10 rounded-full p-1">
          <button onClick={() => setMode("order")} className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${mode === "order" ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground"}`}>Auftragsfahrt</button>
          <button onClick={() => setMode("empty")} className={`px-4 py-1.5 rounded-full text-xs font-medium transition ${mode === "empty" ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground"}`}>Leerfahrt</button>
        </div>
      </div>

      {/* Karte */}
      <DispatchMap selectedTripId={selectedTripId} />

      {/* Laufende Touren */}
      <div>
        <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-2">
          <Navigation className="w-3.5 h-3.5" /> Laufende Touren
          {running.length > 0 && <span className="text-muted-foreground/50">({running.length})</span>}
        </h2>
        {running.length === 0 ? (
          <div className="text-sm text-muted-foreground/50 glass border border-white/10 rounded-xl p-4">Keine Touren unterwegs.</div>
        ) : (
          <TripPlan selectedTripId={selectedTripId} onSelectTrip={setSelectedTripId} />
        )}
      </div>

      {/* Auftragszuweisung oder Leerfahrt */}
      {mode === "order" ? (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Aufträge zur Zuweisung</h2>
          {accepted.length === 0 ? (
            <div className="glass border border-white/10 rounded-xl p-5 text-center">
              <Package className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Keine Aufträge warten auf Zuweisung.</p>
              {running.length > 0 && <p className="text-xs text-muted-foreground/60 mt-1">Laufende Touren siehst du oben.</p>}
              <button onClick={() => navigate("/auftraege")} className="mt-3 text-sm text-lime hover:text-lime/80 flex items-center gap-1.5 mx-auto transition">
                Zu den Aufträgen <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] text-muted-foreground">Auftrag (angenommen)</span>
                <select value={orderId} onChange={e => setOrderId(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
                  {accepted.map(o => <option key={o.id} value={o.id}>{o.customer}: {o.fromCity} → {o.toCity} ({o.tons} t, {formatEuro(o.paymentCents)})</option>)}
                </select>
              </label>
              {orderId && (
                <div className="glass border border-white/10 rounded-xl p-5">
                  <DispositionForm orderId={orderId} onClose={() => navigate("/")} />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Leerfahrt planen</h2>
          <div className="glass border border-white/10 rounded-xl p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Von" value={emptyFrom} onChange={setEmptyFrom}>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </SelectField>
              <SelectField label="Nach" value={emptyTo} onChange={setEmptyTo}>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </SelectField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Fahrzeug" icon={Truck} value={vehicleId} onChange={setVehicleId}>
                <option value="">– wählen –</option>
                {freeVehicles.map(v => <option key={v.id} value={v.id}>{vehicleDisplayName(v)} · {v.locationCity} · Zustand {v.condition}</option>)}
              </SelectField>
              <SelectField label="Fahrer" icon={Users} value={driverId} onChange={setDriverId}>
                <option value="">– wählen –</option>
                {freeDrivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.locationCity}</option>)}
              </SelectField>
            </div>
            {emptyPlan && (
              <div className="space-y-1.5 border-t border-white/10 pt-4">
                <Row label="Distanz" value={`${emptyPlan.dist} km`} />
                <Row label="Dauer" value={`${Math.floor(emptyPlan.dur / 60)} h ${emptyPlan.dur % 60} min`} warn={emptyPlan.dur > MAX_DUTY_MIN} />
                <Row label="Kraftstoff" value={formatEuro(emptyPlan.fuel * 100)} />
                <Row label="Maut" value={formatEuro(emptyPlan.toll * 100)} />
                <Row label="Sofortkosten" value={formatEuro((emptyPlan.fuel + emptyPlan.toll) * 100)} strong />
              </div>
            )}
            {emptyPlan && emptyPlan.dur > MAX_DUTY_MIN && (
              <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Einsatz überschreitet 8 Stunden.
              </div>
            )}
            <button onClick={startEmpty} disabled={!canEmpty || starting}
              className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]">
              {starting ? <><span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> Startet…</> : <><Play className="w-4 h-4" /> Leerfahrt starten</>}
            </button>
            {!canEmpty && emptyPlan && emptyPlan.dur <= MAX_DUTY_MIN && (
              <div className="text-xs text-muted-foreground text-center">Kombination nicht zulässig (Standort oder Verfügbarkeit prüfen).</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SelectField({ label, icon: Icon, value, onChange, children }) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">{Icon && <Icon className="w-3.5 h-3.5" />} {label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
        {children}
      </select>
    </label>
  );
}
function Row({ label, value, strong, warn }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${warn ? "text-red-300" : strong ? "text-foreground font-medium" : "text-foreground/70"}`}>{value}</span>
    </div>
  );
}