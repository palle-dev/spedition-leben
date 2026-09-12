import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { CITIES, getDistance, driveMinutes, fuelEur, tollEur, formatEuro, formatGameTime, LOAD_MIN, UNLOAD_MIN, MAX_DUTY_MIN } from "@/lib/gameData";
import GameMap from "@/components/GameMap";
import { Truck, Users, Play, Route, ArrowRight, AlertTriangle } from "lucide-react";

export default function Dispatch() {
  const { state, send, showToast } = useGame();
  const accepted = state.orders.filter(o => o.status === "angenommen");
  const [orderId, setOrderId] = useState(accepted[0]?.id || null);
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [mode, setMode] = useState("order"); // order | empty
  const [emptyFrom, setEmptyFrom] = useState("Hamburg");
  const [emptyTo, setEmptyTo] = useState("Bremen");

  const order = state.orders.find(o => o.id === orderId);
  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);

  const plan = useMemo(() => {
    if (mode === "empty") {
      if (!vehicle || !driver || emptyFrom === emptyTo) return null;
      const dist = getDistance(emptyFrom, emptyTo);
      const dur = driveMinutes(dist);
      return { emptyKm: 0, loadedKm: dist, totalKm: dist, totalDuration: dur, fuel: fuelEur(dist, vehicle.consumptionPer100km), toll: tollEur(dist), legs: [{ type: "Leerfahrt", from: emptyFrom, to: emptyTo, dur }] };
    }
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
    return { emptyKm, loadedKm: d, totalKm, totalDuration: dur, fuel: fuelEur(totalKm, vehicle.consumptionPer100km), toll: tollEur(totalKm), legs };
  }, [mode, order, vehicle, driver, emptyFrom, emptyTo]);

  const canStart = mode === "empty"
    ? vehicle && driver && vehicle.status === "free" && driver.status === "free" && vehicle.locationCity === driver.locationCity && vehicle.locationCity === emptyFrom && emptyFrom !== emptyTo
    : order && vehicle && driver && vehicle.status === "free" && driver.status === "free" && (!driver.restUntil || driver.restUntil <= state.gameTime) && vehicle.condition >= 20 && vehicle.locationCity === driver.locationCity && order.tons <= vehicle.capacityTons && plan && plan.totalDuration <= MAX_DUTY_MIN;

  async function start() {
    try {
      if (mode === "empty") {
        const r = await send("startEmptyTrip", { fromCity: emptyFrom, toCity: emptyTo, vehicleId, driverId });
        showToast(`Leerfahrt gestartet – Ankunft ${formatGameTime(r.endMin)}.`, "success");
      } else {
        const r = await send("startTransport", { orderId, vehicleId, driverId });
        showToast(`Transport gestartet – Kraftstoff ${formatEuro(r.fuelCents)}, Maut ${formatEuro(r.tollCents)}.`, "success");
      }
      setVehicleId(""); setDriverId("");
    } catch (e) { showToast(e.message, "error"); }
  }

  const freeVehicles = state.vehicles.filter(v => v.status === "free");
  const freeDrivers = state.drivers.filter(d => d.status === "free" && (!d.restUntil || d.restUntil <= state.gameTime));

  return (
    <div className="space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-display text-amber-200">Disposition &amp; Karte</h1>
        <p className="text-amber-100/60 text-sm">Wähle Auftrag, Lkw und Fahrer. Das Backend prüft alle Regeln – der Plan hier ist nur eine Vorschau.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <GameMap vehicles={state.vehicles} drivers={state.drivers} highlight={mode === "order" && order ? { from: order.fromCity, to: order.toCity } : { from: emptyFrom, to: emptyTo }} />

          <div className="flex gap-2">
            <button onClick={() => setMode("order")} className={`px-3 py-1.5 rounded-md text-sm ${mode === "order" ? "bg-amber-500 text-amber-950" : "bg-wood/30 text-amber-100"}`}>Auftragsfahrt</button>
            <button onClick={() => setMode("empty")} className={`px-3 py-1.5 rounded-md text-sm ${mode === "empty" ? "bg-amber-500 text-amber-950" : "bg-wood/30 text-amber-100"}`}>Bewusste Leerfahrt</button>
          </div>

          {mode === "order" ? (
            <div>
              <label className="text-xs text-amber-100/60">Auftrag (angenommen)</label>
              <select value={orderId || ""} onChange={e => setOrderId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md bg-office border border-wood/40 text-amber-50">
                {accepted.length === 0 && <option value="">Keine angenommenen Aufträge</option>}
                {accepted.map(o => <option key={o.id} value={o.id}>{o.customer}: {o.fromCity} → {o.toCity} ({o.tons} t, {formatEuro(o.paymentCents)})</option>)}
              </select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-amber-100/60">Von</label>
                <select value={emptyFrom} onChange={e => setEmptyFrom(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md bg-office border border-wood/40 text-amber-50">
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-amber-100/60">Nach</label>
                <select value={emptyTo} onChange={e => setEmptyTo(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md bg-office border border-wood/40 text-amber-50">
                  {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-amber-100/60 flex items-center gap-1"><Truck className="w-3 h-3" /> Lkw</label>
              <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md bg-office border border-wood/40 text-amber-50">
                <option value="">– wählen –</option>
                {freeVehicles.map(v => <option key={v.id} value={v.id}>{v.id} · {v.locationCity} · Zustand {v.condition}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-amber-100/60 flex items-center gap-1"><Users className="w-3 h-3" /> Fahrer</label>
              <select value={driverId} onChange={e => setDriverId(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-md bg-office border border-wood/40 text-amber-50">
                <option value="">– wählen –</option>
                {freeDrivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.locationCity}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Dispositionsplan */}
        <div className="bg-office-2/50 border border-wood/30 rounded-lg p-4">
          <h3 className="font-medium text-amber-200 flex items-center gap-2 mb-3"><Route className="w-4 h-4" /> Dispositionsplan</h3>
          {!plan ? <Empty text="Wähle Auftrag, Lkw und Fahrer für die Vorschau." /> : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                {plan.legs.map((l, i) => (
                  <div key={i} className="text-sm flex items-center justify-between border border-wood/20 rounded px-2 py-1.5 bg-office/40">
                    <span className="text-amber-100/80">{l.type}: {l.from} <ArrowRight className="w-3 h-3 inline" /> {l.to}</span>
                    <span className="text-xs text-amber-100/50">{l.dur} min</span>
                  </div>
                ))}
              </div>
              <div className="text-sm space-y-1 border-t border-wood/30 pt-3">
                <Row label="Gesamtdistanz" value={`${plan.totalKm} km`} />
                <Row label="Einsatzdauer" value={`${Math.floor(plan.totalDuration / 60)} h ${plan.totalDuration % 60} min`} warn={plan.totalDuration > MAX_DUTY_MIN} />
                <Row label="Kraftstoff" value={formatEuro(plan.fuel * 100)} />
                <Row label="Maut" value={formatEuro(plan.toll * 100)} />
                <Row label="Kosten gesamt" value={formatEuro((plan.fuel + plan.toll) * 100)} strong />
                {mode === "order" && order && <Row label="Vergütung" value={formatEuro(order.paymentCents)} strong />}
                {mode === "order" && order && <Row label="Beitrag vor Fixkosten" value={formatEuro(order.paymentCents - (plan.fuel + plan.toll) * 100)} accent />}
              </div>
              {plan.totalDuration > MAX_DUTY_MIN && (
                <div className="text-sm text-red-300 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Einsatz überschreitet 8 Stunden – wird vom Backend abgelehnt.</div>
              )}
              <button onClick={start} disabled={!canStart}
                className="w-full px-4 py-2.5 rounded-md bg-amber-500 text-amber-950 hover:bg-amber-400 disabled:opacity-40 font-semibold flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> {mode === "order" ? "Transport starten" : "Leerfahrt starten"}
              </button>
              {!canStart && plan && plan.totalDuration <= MAX_DUTY_MIN && (
                <div className="text-xs text-amber-100/50">Kombination nicht zulässig (Standort, Zustand, Kapazität oder Verfügbarkeit prüfen).</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong, warn, accent }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-amber-100/60">{label}</span>
      <span className={`font-mono ${warn ? "text-red-300" : accent ? "text-emerald-300" : strong ? "text-amber-100 font-semibold" : "text-amber-100/80"}`}>{value}</span>
    </div>
  );
}
function Empty({ text }) { return <div className="text-sm text-amber-100/40">{text}</div>; }