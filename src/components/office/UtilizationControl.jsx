import React, { useMemo, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { Zap, ToggleLeft, ToggleRight, Loader2, TrendingUp, Truck, Package } from "lucide-react";

// Flottenweite Auslastungs-Steuerung.
// 1. Schaltet alle Disponenten auf autonome Disposition (auto-accept + auto-plan).
// 2. Ein-Klick-Sofortdisposition über alle Filialen (dispatchAllNow).
export default function UtilizationControl({ state }) {
  const { send, showToast } = useGame();
  const [busy, setBusy] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const stats = useMemo(() => {
    const vehicles = (state.vehicles || []).filter(v => v.status !== "sold" && v.status !== "archived" && !v.markedForSale);
    const onTrip = vehicles.filter(v => v.status === "on_trip").length;
    const free = vehicles.filter(v => v.status === "free").length;
    const maintenance = vehicles.filter(v => v.status === "maintenance").length;
    const utilization = vehicles.length > 0 ? Math.round(onTrip / vehicles.length * 100) : 0;
    const dispatchers = (state.employees || []).filter(e =>
      (e.role === "dispatcher" || e.role === "dispatcher_senior") && e.employmentStatus === "employed"
    );
    const autonomousCount = dispatchers.filter(d => d.workMode === "autonomous").length;
    const allAutonomous = dispatchers.length > 0 && autonomousCount === dispatchers.length;
    const acceptedOrders = (state.orders || []).filter(o => o.status === "angenommen").length;
    const offeredOrders = (state.orders || []).filter(o => o.status === "offered").length;
    return { total: vehicles.length, onTrip, free, maintenance, utilization, dispatchers: dispatchers.length, autonomousCount, allAutonomous, acceptedOrders, offeredOrders };
  }, [state.vehicles, state.employees, state.orders]);

  const handleToggleMode = async () => {
    setModeBusy(true);
    try {
      const newMode = stats.allAutonomous ? "suggestions" : "autonomous";
      await send("setGlobalDispatchMode", { mode: newMode });
      showToast(
        newMode === "autonomous"
          ? `${stats.dispatchers} Disponenten auf autonome Disposition umgestellt.`
          : "Disponenten auf manuellen Modus umgestellt.",
        "success"
      );
    } catch (e) {
      showToast(e.message, "error");
    } finally { setModeBusy(false); }
  };

  const handleDispatchNow = async () => {
    setBusy(true);
    setLastResult(null);
    try {
      const r = await send("dispatchAllNow", {});
      setLastResult(r);
      if (r.planned > 0) {
        showToast(`${r.planned} Tour(n) geplant, ${r.ordersAccepted} Auftrag/Aufträge angenommen.`, "success");
      } else {
        showToast("Keine profitablen Touren gefunden – Markt prüfen oder Aufträge annehmen.", "info");
      }
    } catch (e) {
      showToast(e.message, "error");
    } finally { setBusy(false); }
  };

  const utilColor = stats.utilization >= 70 ? "bg-lime" : stats.utilization >= 40 ? "bg-amber-400" : "bg-coral/60";
  const utilTextColor = stats.utilization >= 70 ? "text-lime" : stats.utilization >= 40 ? "text-amber-300" : "text-coral";

  return (
    <div className="glass border border-white/10 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-lime/70" /> Flotten-Auslastung
        </h3>
        <span className={`text-2xl font-bold tabular-nums ${utilTextColor}`}>{stats.utilization}%</span>
      </div>

      {/* Auslastungs-Bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>{stats.onTrip} von {stats.total} Lkw unterwegs</span>
          <span>{stats.free} frei · {stats.maintenance} Wartung</span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className={`h-full rounded-full ${utilColor}`} style={{ width: `${stats.utilization}%` }} />
        </div>
      </div>

      {/* Kennzahlen */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="bg-white/[0.02] rounded-md py-1.5">
          <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
            <Package className="w-2.5 h-2.5" /> Angenommen
          </div>
          <div className="text-sm font-medium tabular-nums">{stats.acceptedOrders}</div>
        </div>
        <div className="bg-white/[0.02] rounded-md py-1.5">
          <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
            <Package className="w-2.5 h-2.5" /> Markt
          </div>
          <div className="text-sm font-medium tabular-nums">{stats.offeredOrders}</div>
        </div>
        <div className="bg-white/[0.02] rounded-md py-1.5">
          <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">
            <Truck className="w-2.5 h-2.5" /> Dispo
          </div>
          <div className="text-sm font-medium tabular-nums">
            {stats.autonomousCount}/{stats.dispatchers}
          </div>
        </div>
      </div>

      {/* Steuerung */}
      <div className="space-y-2">
        {/* Auto-Dispo Toggle */}
        <button
          onClick={handleToggleMode}
          disabled={modeBusy || stats.dispatchers === 0}
          className="w-full flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-surface-2/30 px-3 py-2.5 hover:border-white/20 transition disabled:opacity-40"
        >
          <div className="flex items-center gap-2 text-left">
            {stats.allAutonomous
              ? <ToggleRight className="w-5 h-5 text-lime shrink-0" />
              : <ToggleLeft className="w-5 h-5 text-muted-foreground shrink-0" />}
            <div>
              <div className="text-xs font-medium text-foreground">Automatische Disposition</div>
              <div className="text-[10px] text-muted-foreground">
                {stats.dispatchers === 0
                  ? "Keine Disponenten eingestellt"
                  : stats.allAutonomous
                    ? "Alle Filialen disponieren selbstständig"
                    : `${stats.autonomousCount} von ${stats.dispatchers} Disponenten autonom`}
              </div>
            </div>
          </div>
          {modeBusy && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin shrink-0" />}
        </button>

        {/* Sofort disponieren */}
        <button
          onClick={handleDispatchNow}
          disabled={busy || stats.free === 0}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-lime text-ink px-3 py-2.5 text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {busy ? "Disponiere…" : "Jetzt alle Fahrzeuge disponieren"}
        </button>
        {stats.free === 0 && (
          <p className="text-[10px] text-muted-foreground text-center">Keine freien Fahrzeuge verfügbar.</p>
        )}

        {/* Ergebnis */}
        {lastResult && (
          <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2 text-[11px] text-muted-foreground">
            {lastResult.planned > 0 ? (
              <span>
                <span className="text-lime font-medium">{lastResult.planned} Tour(en)</span> geplant ·{" "}
                {lastResult.ordersAccepted} Auftrag angenommen ·{" "}
                <span className="text-lime">{formatEuro(lastResult.totalContributionCents)}</span> Beitrag
              </span>
            ) : (
              <span>Keine profitablen Touren gefunden. Markt prüfen oder Aufträge annehmen.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}