import React, { useState, useMemo, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { vehicleDisplayName, driverDisplayName } from "@/lib/displayHelpers";
import { formatGameTime, formatEuro, CITIES } from "@/lib/gameData";
import { suggestTours, buildTourPlan } from "@/lib/tourEngine";
import { buildTourRouteGeoJSON } from "@/lib/geoData";
import { ArrowLeft, ArrowRight, Truck, Users, Package, MapPin, Clock, Fuel, CreditCard, CheckCircle2, AlertTriangle, Search, Sparkles, Route, Zap } from "lucide-react";

export default function DispatchAssistant({ onPlanRoute, onConfirmTour }) {
  const { state, send, showToast } = useGame();
  const [mode, setMode] = useState("balanced");
  const [horizon, setHorizon] = useState(48);
  const [desiredEndCity, setDesiredEndCity] = useState("Hamburg");
  const [acceptNew, setAcceptNew] = useState(true);
  const [computing, setComputing] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [confirming, setConfirming] = useState(false);

  // Compute suggestions (client-side, no backend call)
  const compute = useMemo(() => {
    if (!state) return null;
    return suggestTours(state, {
      vehicleIds: null, // all vehicles
      earliestStart: state.gameTime,
      horizonMin: horizon * 60,
      desiredEndCity: desiredEndCity || null,
      latestReturnMin: null,
      mode,
      acceptNew,
    });
  }, [state, horizon, desiredEndCity, mode, acceptNew]);

  useEffect(() => {
    setSuggestions(compute);
    setSelectedIdx(0);
  }, [compute]);

  const selected = suggestions?.suggestions?.[selectedIdx] || null;

  // Update map preview
  useEffect(() => {
    if (selected?.plan && onPlanRoute) {
      onPlanRoute(buildTourRouteGeoJSON(selected.plan, null));
    }
  }, [selected]);

  async function confirm() {
    if (!selected) return;
    setConfirming(true);
    try {
      const r = await send("confirmTour", {
        vehicleId: selected.vehicleId,
        driverId: selected.driverId,
        orderIds: selected.orderIds,
        desiredEndCity: desiredEndCity || null,
        latestReturnMin: null,
      });
      showToast(`Tour bestätigt – ${selected.plan.deployments.length} Einsatz/Einsätze.`, "success");
      onConfirmTour?.(r);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setConfirming(false);
    }
  }

  const freeVehicles = state.vehicles.filter(v => (v.status === "free" || v.status === "resting") && v.condition >= 20);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Dispo-Assistent
        </div>
        <div className="text-sm font-medium mt-1">Vorschläge für die freie Flotte</div>
        <div className="text-[10px] text-muted-foreground/70 mt-0.5">{freeVehicles.length} freie/r Lkw verfügbar</div>
      </div>

      {/* Einstellungen */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-3 gap-1.5">
          {[
            { v: "balanced", l: "Ausgewogen" },
            { v: "high_margin", l: "Hoher Beitrag" },
            { v: "low_empty", l: "Wenig Leer" },
          ].map(o => (
            <button
              key={o.v}
              onClick={() => setMode(o.v)}
              className={`px-2 py-2 rounded-lg text-[11px] font-medium border transition ${
                mode === o.v ? "border-lime/40 bg-lime/5 text-lime" : "border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >{o.l}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] text-muted-foreground">Horizont</span>
            <select value={horizon} onChange={e => setHorizon(Number(e.target.value))} className="mt-1 w-full px-2 py-2 rounded-lg bg-surface-2 border border-white/10 text-xs outline-none focus:border-lime/50">
              <option value={24}>24 h</option>
              <option value={48}>48 h</option>
              <option value={72}>72 h</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] text-muted-foreground">Rückkehr nach</span>
            <select value={desiredEndCity} onChange={e => setDesiredEndCity(e.target.value)} className="mt-1 w-full px-2 py-2 rounded-lg bg-surface-2 border border-white/10 text-xs outline-none focus:border-lime/50">
              <option value="">– keine –</option>
              {CITIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={acceptNew} onChange={e => setAcceptNew(e.target.checked)} className="accent-lime" />
          Neue Angebote annehmen
        </label>
      </div>

      {/* Vorschläge */}
      <div className="border-t border-white/10 pt-3">
        {suggestions?.suggestions?.length === 0 ? (
          <div className="text-xs text-muted-foreground/70 bg-surface-2/50 rounded-lg px-3 py-3 border border-white/5">
            Kein ausführbarer Vorschlag im Horizont. Engpass: möglicherweise keine freie Flotte, keine passenden Aufträge oder Liquiditätslücke.
          </div>
        ) : (
          <div className="space-y-2">
            {suggestions?.suggestions?.map((s, i) => (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`w-full text-left rounded-lg p-3 border transition ${
                  selectedIdx === i ? "border-lime/40 bg-lime/5" : "border-white/10 hover:border-white/20 bg-surface/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{vehicleDisplayName(s.vehicle)}</span>
                  <span className="text-[10px] text-muted-foreground">{s.plan.deployments.length} Einsatz/Einsätze</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  {s.plan.deployments.map((d, j) => (
                    <React.Fragment key={j}>
                      {j > 0 && <ArrowRight className="w-2.5 h-2.5" />}
                      <span>{d.toCity}</span>
                    </React.Fragment>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px]">
                  <span className="text-lime tabular-nums">+{formatEuro(s.plan.totalContributionCents)}</span>
                  <span className="text-muted-foreground tabular-nums">{s.plan.totalKm} km · {s.plan.emptyKm} leer</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Detail-Vorschau */}
      {selected && (
        <div className="border-t border-white/10 pt-3 space-y-2">
          <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Vorschau: Vorschlag {selectedIdx + 1}</div>
          <div className="space-y-1.5">
            {[...selected.plan.deployments, ...(selected.plan.returnDeployment ? [selected.plan.returnDeployment] : [])].map((dep, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className={`w-4 h-4 rounded-full grid place-items-center text-[9px] font-medium shrink-0 ${dep.orderId ? "bg-lime/20 text-lime" : "bg-coral/20 text-coral"}`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{dep.customer}</div>
                  <div className="text-[10px] text-muted-foreground">{dep.fromCity} → {dep.toCity} · {formatGameTime(dep.startMin)}–{formatGameTime(dep.endMin)}</div>
                </div>
                <div className={`text-[10px] tabular-nums shrink-0 ${dep.contributionCents >= 0 ? "text-lime" : "text-coral"}`}>{formatEuro(dep.contributionCents)}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[10px] border-t border-white/10 pt-2">
            <span className="text-muted-foreground">Beitrag</span><span className="text-lime text-right tabular-nums">{formatEuro(selected.plan.totalContributionCents)}</span>
            <span className="text-muted-foreground">Leer-km</span><span className="text-right tabular-nums">{selected.plan.emptyKm} km</span>
            <span className="text-muted-foreground">Tour-Ende</span><span className="text-right">{formatGameTime(selected.plan.tourEndMin)}</span>
            <span className="text-muted-foreground">Fahrer frei</span><span className="text-right">{formatGameTime(selected.plan.driverFreeMin)}</span>
          </div>
          <div className="text-[10px] text-muted-foreground/60">
            {selected.plan.acceptedOrderIds?.length > 0 && `${selected.plan.acceptedOrderIds.length} neue(r) Auftrag wird bei Bestätigung angenommen. `}
            Erster Start: {formatGameTime(selected.plan.earliestStartMin)}
          </div>
        </div>
      )}

      {/* Bestätigen */}
      {selected && (
        <button
          onClick={confirm}
          disabled={confirming}
          className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
        >
          {confirming ? <><span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> Wird bestätigt…</> : <><CheckCircle2 className="w-4 h-4" /> Tour verbindlich bestätigen</>}
        </button>
      )}
    </div>
  );
}