import React, { useState, useMemo, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { vehicleDisplayName } from "@/lib/displayHelpers";
import { formatGameTime, formatEuro, CITIES } from "@/lib/gameData";
import { buildTourPlan, findReturnLoads } from "@/lib/tourEngine";
import { buildTourRouteGeoJSON } from "@/lib/geoData";
import { ArrowLeft, ArrowRight, Truck, Clock, Fuel, CreditCard, CheckCircle2, AlertTriangle, Search, Route } from "lucide-react";

export default function TourPlanner({ primaryOrderId, routeData, onBack, onConfirmed, onPlanRoute }) {
  const { state, send, showToast } = useGame();
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [returnOrderId, setReturnOrderId] = useState(null);
  const [desiredEndCity, setDesiredEndCity] = useState("");
  const [confirming, setConfirming] = useState(false);

  const primaryOrder = state.orders.find(o => o.id === primaryOrderId);

  // Auto-select vehicle/driver at pickup city
  useEffect(() => {
    if (!vehicleId && primaryOrder) {
      const v = state.vehicles.find(v => v.status === "free" && v.locationCity === primaryOrder.fromCity && v.condition >= 20);
      if (v) setVehicleId(v.id);
    }
    if (!driverId && primaryOrder) {
      const d = state.drivers.find(d => d.status === "free" && d.locationCity === primaryOrder.fromCity && (!d.restUntil || d.restUntil <= state.gameTime));
      if (d) setDriverId(d.id);
    }
  }, [primaryOrderId]);

  const vehicle = state.vehicles.find(v => v.id === vehicleId);
  const driver = state.drivers.find(d => d.id === driverId);

  const freeVehicles = state.vehicles.filter(v => v.status === "free" || (v.status === "resting" && (!v.restUntil || v.restUntil <= state.gameTime)));
  const freeDrivers = state.drivers.filter(d => d.status === "free" || (d.status === "resting" && (!d.restUntil || d.restUntil <= state.gameTime)));

  // Find return loads
  const returnCandidates = useMemo(() => {
    if (!vehicleId || !driverId || !primaryOrder) return [];
    const r = findReturnLoads(state, primaryOrderId, vehicleId, driverId);
    return r.candidates || [];
  }, [state, primaryOrderId, vehicleId, driverId]);

  // Build tour plan
  const plan = useMemo(() => {
    if (!vehicleId || !driverId || !primaryOrder) return null;
    const orderIds = [primaryOrderId];
    if (returnOrderId) orderIds.push(returnOrderId);
    return buildTourPlan(state, {
      vehicleId, driverId, orderIds,
      desiredEndCity: desiredEndCity || null,
      latestReturnMin: null,
    });
  }, [state, primaryOrderId, vehicleId, driverId, returnOrderId, desiredEndCity]);

  // Update map preview
  useEffect(() => {
    if (plan && plan.ok && onPlanRoute) {
      onPlanRoute(buildTourRouteGeoJSON(plan, routeData));
    }
  }, [plan]);

  async function confirm() {
    if (!plan || !plan.ok) return;
    setConfirming(true);
    try {
      const orderIds = [primaryOrderId];
      if (returnOrderId) orderIds.push(returnOrderId);
      const r = await send("confirmTour", {
        vehicleId, driverId, orderIds,
        desiredEndCity: desiredEndCity || null,
        latestReturnMin: null,
      });
      showToast(`Tour bestätigt – ${plan.deployments.length} Einsatz/Einsätze, Beitrag ${formatEuro(plan.totalContributionCents)}.`, "success");
      onConfirmed?.(r);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setConfirming(false);
    }
  }

  if (!primaryOrder) {
    return <div className="text-sm text-muted-foreground p-4">Auftrag nicht gefunden.</div>;
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition">
        <ArrowLeft className="w-3.5 h-3.5" /> Zurück
      </button>

      <div>
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Tour planen</div>
        <div className="text-sm font-medium mt-1">{primaryOrder.customer}</div>
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          {primaryOrder.fromCity} <ArrowRight className="w-3 h-3" /> {primaryOrder.toCity} · {primaryOrder.tons} t · {formatEuro(primaryOrder.paymentCents)}
        </div>
      </div>

      {/* Fahrzeug / Fahrer */}
      <div className="grid grid-cols-2 gap-2">
        <Select label="Fahrzeug" value={vehicleId} onChange={setVehicleId}>
          <option value="">– wählen –</option>
          {freeVehicles.map(v => <option key={v.id} value={v.id}>{vehicleDisplayName(v)} · {v.locationCity}</option>)}
        </Select>
        <Select label="Fahrer" value={driverId} onChange={setDriverId}>
          <option value="">– wählen –</option>
          {freeDrivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.locationCity}</option>)}
        </Select>
      </div>

      {vehicleId && driverId && vehicle?.locationCity !== driver?.locationCity && (
        <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Fahrer und Lkw sind an verschiedenen Orten.
        </div>
      )}

      {/* Rückladung suchen */}
      {vehicleId && driverId && (
        <div className="border-t border-white/10 pt-3">
          <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
            <Search className="w-3 h-3" /> Rückladung in {primaryOrder.toCity}
          </div>
          {returnCandidates.length === 0 ? (
            <div className="text-xs text-muted-foreground/70 bg-surface-2/50 rounded-lg px-3 py-2.5 border border-white/5">
              Keine passende Rückladung gefunden. Du kannst leer zurückfahren oder später erneut suchen.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-none">
              {returnCandidates.map((c, i) => (
                <button
                  key={i}
                  onClick={() => setReturnOrderId(returnOrderId === c.order.id ? null : c.order.id)}
                  className={`w-full text-left rounded-lg p-2.5 border transition text-xs ${
                    returnOrderId === c.order.id ? "border-lime/40 bg-lime/5" : "border-white/10 hover:border-white/20 bg-surface/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium truncate">{c.order.customer}</span>
                    <span className="text-lime tabular-nums shrink-0">{formatEuro(c.order.paymentCents)}</span>
                  </div>
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-1">
                    {c.order.fromCity} <ArrowRight className="w-2.5 h-2.5" /> {c.order.toCity} · {c.order.tons} t
                  </div>
                  {c.plan && (
                    <div className="text-[10px] text-lime/80 mt-1">
                      Beitrag: {formatEuro(c.plan.totalContributionCents)} · Leer: {c.plan.emptyKm} km
                    </div>
                  )}
                  {c.error && <div className="text-[10px] text-red-300 mt-1">{c.error}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Gewünschter Endort */}
      <Select label="Rückkehr nach (optional)" value={desiredEndCity} onChange={setDesiredEndCity}>
        <option value="">– keine Rückkehr –</option>
        {CITIES.map(c => <option key={c}>{c}</option>)}
      </Select>

      {/* Vorschau */}
      {plan && plan.ok && <TourPreview plan={plan} />}

      {/* Bestätigen */}
      <button
        onClick={confirm}
        disabled={!plan || !plan.ok || confirming}
        className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
      >
        {confirming ? <><span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> Wird bestätigt…</> : <><CheckCircle2 className="w-4 h-4" /> Tour bestätigen und starten</>}
      </button>
      {plan && !plan.ok && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {plan.error}
        </div>
      )}
    </div>
  );
}

function TourPreview({ plan }) {
  const allDeps = [...plan.deployments];
  if (plan.returnDeployment) allDeps.push(plan.returnDeployment);

  return (
    <div className="border-t border-white/10 pt-3 space-y-3">
      <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Tour-Vorschau</div>

      {/* Zeitleiste */}
      <div className="space-y-2">
        {allDeps.map((dep, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div className="flex flex-col items-center pt-0.5">
              <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-medium shrink-0 ${
                dep.orderId ? "bg-lime/20 text-lime" : "bg-coral/20 text-coral"
              }`}>{i + 1}</span>
              {i < allDeps.length - 1 && <span className="w-px h-6 bg-white/10 mt-1" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">{dep.customer}</div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                {dep.fromCity !== dep.toCity ? <>{dep.fromCity} <ArrowRight className="w-2.5 h-2.5" /> {dep.toCity}</> : dep.toCity}
              </div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                {formatGameTime(dep.startMin)} – {formatGameTime(dep.endMin)}
                {dep.finalWorkMin != null && (
                  <span className={dep.finalWorkMin >= 480 ? "text-amber-300/70" : "text-muted-foreground/50"}>
                    {" · "}Arbeitsbudget: {dep.finalWorkMin}/480 min
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-xs tabular-nums ${dep.contributionCents >= 0 ? "text-lime" : "text-coral"}`}>{formatEuro(dep.contributionCents)}</div>
              <div className="text-[10px] text-muted-foreground tabular-nums">{dep.totalKm} km</div>
            </div>
          </div>
        ))}
      </div>

      {/* Zusammenfassung */}
      <div className="grid grid-cols-2 gap-2 text-xs border-t border-white/10 pt-2">
        <Stat label="Gesamt-km" value={`${plan.totalKm} km`} icon={Route} />
        <Stat label="Leer-km" value={`${plan.emptyKm} km`} icon={Truck} />
        <Stat label="Vergütung" value={formatEuro(plan.totalPaymentCents)} icon={CreditCard} />
        <Stat label="Variable Kosten" value={formatEuro(plan.totalVariableCostCents)} icon={Fuel} />
        <Stat label="Beitrag vor Fixkosten" value={formatEuro(plan.totalContributionCents)} icon={CheckCircle2} highlight />
        <Stat label="Fristpuffer" value={plan.minDeadlineBufferMin != null ? `${Math.floor(plan.minDeadlineBufferMin / 60)} h` : "—"} icon={Clock} />
      </div>

      <div className="text-[10px] text-muted-foreground/60">
        Tour-Ende: {formatGameTime(plan.tourEndMin)} · Fahrer frei: {formatGameTime(plan.driverFreeMin)}
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, highlight }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3 h-3 text-muted-foreground/60 shrink-0" />
      <span className="text-muted-foreground">{label}</span>
      <span className={`ml-auto tabular-nums ${highlight ? "text-lime font-medium" : ""}`}>{value}</span>
    </div>
  );
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full px-2.5 py-2 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
        {children}
      </select>
    </label>
  );
}