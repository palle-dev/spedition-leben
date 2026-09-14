import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { vehicleDisplayName, driverDisplayName } from "@/lib/displayHelpers";
import { formatEuro } from "@/lib/gameData";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sparkles, Truck, User, Package, ArrowRight, Check, Loader2, TrendingUp, Route } from "lucide-react";

// Auto-Optimierung: Nutzt suggestTours, um die effizienteste Flottenverplanung
// zu berechnen und Leerfahrten auf Basis aktueller Aufträge zu minimieren.
export default function AutoOptimizePanel({ open, onClose, onApplied }) {
  const { state, send, showToast } = useGame();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [applying, setApplying] = useState(null);
  const [applied, setApplied] = useState(new Set());
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSuggestions([]);
    setApplied(new Set());
    setStats(null);

    (async () => {
      const freeVehicles = state.vehicles.filter(v =>
        v.status === "free" && v.condition >= 20 && !v.markedForSale && v.ownership_type !== "sold"
      );
      const acceptedOrders = state.orders.filter(o => o.status === "angenommen");
      if (freeVehicles.length === 0 || acceptedOrders.length === 0) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const result = await send("suggestTours", {
          vehicleIds: freeVehicles.map(v => v.id),
          earliestStart: state.gameTime,
          horizonMin: 2880,
          mode: state.marketPriority || "balanced",
          acceptNew: false,
        });
        if (cancelled) return;
        const sugs = result?.suggestions || [];
        setSuggestions(sugs);
        const totalContribution = sugs.reduce((s, sug) => s + (sug.plan?.totalContributionCents || 0), 0);
        const totalKm = sugs.reduce((s, sug) => s + (sug.plan?.totalKm || 0), 0);
        const emptyKm = sugs.reduce((s, sug) => s + (sug.plan?.emptyKm || 0), 0);
        const totalOrders = sugs.reduce((s, sug) => s + (sug.orderIds?.length || 0), 0);
        setStats({ totalContribution, totalKm, emptyKm, totalOrders, vehicleCount: sugs.length });
      } catch (e) {
        if (!cancelled) showToast("Optimierung fehlgeschlagen: " + e.message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  async function applySuggestion(sug) {
    const key = `${sug.vehicleId}:${sug.orderIds.join(",")}`;
    setApplying(key);
    try {
      await send("confirmTour", {
        vehicleId: sug.vehicleId,
        driverId: sug.driverId,
        orderIds: sug.orderIds,
        desiredEndCity: sug.plan?.desiredEndCity || null,
        latestReturnMin: sug.plan?.latestReturnMin || null,
      });
      setApplied(prev => new Set([...prev, key]));
      showToast("Tour bestätigt – Lkw ist unterwegs.", "success");
      onApplied?.();
    } catch (e) {
      showToast("Bestätigung fehlgeschlagen: " + e.message, "error");
    } finally {
      setApplying(null);
    }
  }

  async function applyAll() {
    for (const sug of suggestions) {
      const key = `${sug.vehicleId}:${sug.orderIds.join(",")}`;
      if (applied.has(key)) continue;
      await applySuggestion(sug);
    }
  }

  const remaining = suggestions.filter(s => !applied.has(`${s.vehicleId}:${s.orderIds.join(",")}`));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-ink border border-white/15">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Sparkles className="w-5 h-5 text-lime" />
            Intelligente Routen-Optimierung
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Automatische Flottenverplanung mit minimierten Leerfahrten basierend auf allen angenommenen Aufträgen.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-8 h-8 text-lime animate-spin" />
            <p className="text-sm text-muted-foreground">Berechne optimale Routen…</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Package className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {state.orders.filter(o => o.status === "angenommen").length === 0
                ? "Keine angenommenen Aufträge zu verplanen."
                : "Keine freien Fahrzeuge für die Optimierung verfügbar."}
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            {stats && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                <StatCard icon={TrendingUp} label="Beitrag" value={formatEuro(stats.totalContribution)} tone="lime" />
                <StatCard icon={Route} label="Gesamtstrecke" value={`${stats.totalKm} km`} />
                <StatCard icon={Route} label="Leerfahrten" value={`${stats.emptyKm} km`} tone="coral" />
                <StatCard icon={Truck} label="Fahrzeuge" value={stats.vehicleCount} />
              </div>
            )}

            {/* Suggestions list */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-none">
              {suggestions.map((sug, i) => {
                const vehicle = state.vehicles.find(v => v.id === sug.vehicleId);
                const driver = state.drivers.find(d => d.id === sug.driverId);
                const key = `${sug.vehicleId}:${sug.orderIds.join(",")}`;
                const isApplied = applied.has(key);
                const isApplying = applying === key;
                const orders = sug.orderIds.map(oid => state.orders.find(o => o.id === oid)).filter(Boolean);
                const primary = orders[0];
                const contribution = sug.plan?.totalContributionCents || 0;
                const emptyKm = sug.plan?.emptyKm || 0;
                const totalKm = sug.plan?.totalKm || 0;

                return (
                  <div
                    key={i}
                    className={`rounded-xl border p-3 transition ${
                      isApplied ? "border-lime/30 bg-lime/5" : "border-white/10 bg-surface/30 hover:border-white/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Truck className="w-3.5 h-3.5 text-lime shrink-0" />
                          {vehicleDisplayName(vehicle)}
                          <span className="text-muted-foreground/40">·</span>
                          <User className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{driverDisplayName(driver)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          {orders.length === 1 ? (
                            <>
                              <span className="px-1.5 py-0.5 rounded bg-surface-2 text-foreground/80">{primary?.fromCity}</span>
                              <ArrowRight className="w-3 h-3 text-lime" />
                              <span className="px-1.5 py-0.5 rounded bg-surface-2 text-foreground/80">{primary?.toCity}</span>
                              <span className="text-muted-foreground/50">· {primary?.customer}</span>
                            </>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-surface-2 text-foreground/80">
                              {orders.length} Aufträge · {orders.map(o => o.fromCity).join(" → ")}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-[11px]">
                          <span className="text-lime font-medium tabular-nums">{formatEuro(contribution)}</span>
                          <span className="text-muted-foreground tabular-nums">{totalKm} km</span>
                          {emptyKm > 0 && <span className="text-coral/80 tabular-nums">{emptyKm} km leer</span>}
                        </div>
                      </div>
                      {isApplied ? (
                        <div className="flex items-center gap-1.5 text-xs text-lime font-medium shrink-0">
                          <Check className="w-4 h-4" /> Geplant
                        </div>
                      ) : (
                        <button
                          onClick={() => applySuggestion(sug)}
                          disabled={isApplying}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-lime text-ink text-xs font-semibold hover:brightness-110 disabled:opacity-50 transition active:scale-95 shrink-0"
                        >
                          {isApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Bestätigen
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {remaining.length > 1 && (
              <button
                onClick={applyAll}
                disabled={applying}
                className="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-xl bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4" />
                Alle {remaining.length} Vorschläge bestätigen
              </button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  const color = tone === "lime" ? "text-lime" : tone === "coral" ? "text-coral" : "text-foreground";
  return (
    <div className="rounded-xl border border-white/10 bg-surface/30 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-sm font-semibold mt-1 tabular-nums ${color}`}>{value}</div>
    </div>
  );
}