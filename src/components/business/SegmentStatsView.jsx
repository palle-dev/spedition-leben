import React from "react";
import { formatEuro } from "@/lib/gameData";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { MapPin, Zap, AlertTriangle, Package, Fuel } from "lucide-react";

const SEGMENT_META = {
  regional: { label: "Regional", icon: MapPin, color: "text-invest-cyan", barColor: "hsl(192 100% 71%)" },
  express: { label: "Express", icon: Zap, color: "text-coral", barColor: "hsl(15 100% 81%)" },
  dangerousGoods: { label: "Gefahrgut", icon: AlertTriangle, color: "text-yellow-400", barColor: "hsl(43 74% 66%)" },
  standard: { label: "Standard", icon: Package, color: "text-lime", barColor: "hsl(79 94% 75%)" },
};

export default function SegmentStatsView({ state, send }) {
  const [stats, setStats] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await send("getSegmentStats", {});
        if (!cancelled) setStats(result);
      } catch (e) {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
  }, [state.gameTime, state.stats?.totalDeliveries]);

  if (loading || !stats?.segments) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6 text-center text-sm text-muted-foreground">
        Segment-Statistiken werden geladen…
      </div>
    );
  }

  const segments = stats.segments;
  const totalRevenue = Object.values(segments).reduce((s, seg) => s + (seg.revenueCents || 0), 0);
  const totalContribution = Object.values(segments).reduce((s, seg) => s + (seg.contributionCents || 0), 0);
  const totalDeliveries = Object.values(segments).reduce((s, seg) => s + (seg.deliveries || 0), 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-foreground">Segment-Kennzahlen</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Wirtschaftliche Auswertung pro Transportsegment. Aufträge können mehreren
          Segmenten gleichzeitig angehören.
        </p>
      </div>

      {/* Zusammenfassung */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Lieferungen gesamt" value={totalDeliveries} />
        <SummaryCard label="Umsatz gesamt" value={formatEuro(totalRevenue)} />
        <SummaryCard label="Deckungsbeitrag" value={formatEuro(totalContribution)} highlight />
      </div>

      {/* Segment-Karten */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {Object.entries(segments).map(([key, seg]) => {
          const meta = SEGMENT_META[key] || SEGMENT_META.standard;
          const Icon = meta.icon;
          const revenueShare = totalRevenue > 0 ? (seg.revenueCents / totalRevenue) * 100 : 0;
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="glass rounded-xl border border-white/10 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${meta.color}`} />
                  <span className="font-medium text-foreground">{meta.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {revenueShare.toFixed(0)}% vom Umsatz
                </span>
              </div>

              {seg.deliveries === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Noch keine Lieferungen in diesem Segment.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <Stat label="Lieferungen" value={seg.deliveries} />
                    <Stat label="Pünktlichkeit" value={`${(seg.punctuality * 100).toFixed(0)}%`} />
                    <Stat label="Umsatz" value={formatEuro(seg.revenueCents)} />
                    <Stat label="Deckungsbeitrag" value={formatEuro(seg.contributionCents)} highlight />
                    <Stat label="Marge" value={`${(seg.margin * 100).toFixed(0)}%`} />
                    <Stat label="Beladene km" value={`${Math.round(seg.loadedKm)} km`} />
                  </div>

                  {/* Kosten-Aufschlüsselung */}
                  <div className="pt-2 border-t border-white/10 space-y-1">
                    <CostBar label="Kraftstoff" value={seg.fuelCents} total={seg.totalCostCents} color="hsl(192 100% 71%)" />
                    <CostBar label="Maut" value={seg.tollCents} total={seg.totalCostCents} color="hsl(43 74% 66%)" />
                    <CostBar label="Fahrerlohn" value={seg.driverWageCents} total={seg.totalCostCents} color="hsl(79 94% 75%)" />
                    <CostBar label="Handling" value={seg.handlingCents} total={seg.totalCostCents} color="hsl(15 100% 81%)" />
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>

      {stats.tankCleaningCents > 0 && (
        <div className="glass rounded-xl border border-white/10 p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Fuel className="w-3.5 h-3.5 text-yellow-400" />
          Tankreinigungskosten gesamt: <span className="text-foreground font-medium tabular-nums">{formatEuro(stats.tankCleaningCents)}</span>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, highlight }) {
  return (
    <div className={`glass rounded-xl border p-3 ${highlight ? "border-lime/20" : "border-white/10"}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 tabular-nums ${highlight ? "text-lime" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${highlight ? "text-lime font-medium" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function CostBar({ label, value, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{formatEuro(value)}</span>
      </div>
      <div className="h-1 rounded-full bg-white/5 mt-0.5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}