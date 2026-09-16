import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { EASE } from "@/lib/motion";
import { REGIONS, REGION_LABELS } from "@/lib/simulation/marketDynamicsEngine";
import { MapPin, Zap, AlertTriangle, Package, TrendingUp, TrendingDown, Calendar, Bell, Info, ChevronRight } from "lucide-react";

const SEGMENT_META = {
  regional: { label: "Regional", icon: MapPin, color: "text-invest-cyan" },
  express: { label: "Express", icon: Zap, color: "text-coral" },
  dangerousGoods: { label: "Gefahrgut", icon: AlertTriangle, color: "text-yellow-400" },
  standard: { label: "Standard", icon: Package, color: "text-lime" },
};

const SEASON_ICONS = {
  Frühjahr: "🌱",
  Sommer: "☀️",
  Herbst: "🍂",
  Winter: "❄️",
};

export default function MarketOverview({ state, send }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRegion, setExpandedRegion] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await send("getMarketOverview", {});
        if (!cancelled) setOverview(result);
      } catch (e) {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
  }, [state.gameTime, state.marketDynamics?.events?.length]);

  if (loading || !overview) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6 text-center text-sm text-muted-foreground">
        Marktübersicht wird geladen…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Saison-Info */}
      <div className="glass rounded-xl border border-white/10 p-4 flex items-center gap-3">
        <span className="text-2xl">{SEASON_ICONS[overview.seasonLabel] || "📅"}</span>
        <div>
          <div className="text-sm font-medium text-foreground">
            Spielzeit: Monat {overview.gameMonth} · Jahr {overview.gameYear}
          </div>
          <div className="text-xs text-muted-foreground">Saison: {overview.seasonLabel}</div>
        </div>
      </div>

      {/* Aktive Ereignisse */}
      {overview.activeEvents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Bell className="w-4 h-4 text-coral" /> Aktive Marktereignisse
          </h3>
          {overview.activeEvents.map(ev => (
            <EventCard key={ev.id} event={ev} active />
          ))}
        </div>
      )}

      {/* Ankündiungen */}
      {overview.announcedEvents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Info className="w-4 h-4 text-invest-cyan" /> Bekannte Entwicklungen
          </h3>
          {overview.announcedEvents.map(ev => (
            <EventCard key={ev.id} event={ev} active={false} gameTime={state.gameTime} />
          ))}
        </div>
      )}

      {/* Regionen-Matrix */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Nachfrage und Preise nach Region</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {REGIONS.map(region => {
            const data = overview.regions[region];
            const isExpanded = expandedRegion === region;
            const branches = (state.branches || []).filter(b => b.status === "active");
            // This is a simplified check — actual branch city mapping would need city field
            return (
              <motion.div
                key={region}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
                className="glass rounded-xl border border-white/10 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedRegion(isExpanded ? null : region)}
                  className="w-full text-left p-3 flex items-center justify-between hover:bg-white/5 transition"
                >
                  <span className="font-medium text-foreground">{data.label}</span>
                  <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                </button>
                <div className="px-3 pb-3 space-y-1.5">
                  {Object.entries(data.segments).map(([segKey, seg]) => {
                    const meta = SEGMENT_META[segKey];
                    const Icon = meta?.icon || Package;
                    const demandUp = seg.demandFactor > 1.0;
                    const priceUp = seg.priceFactor > 1.0;
                    return (
                      <div key={segKey} className="flex items-center justify-between text-xs py-1 border-b border-white/5 last:border-0">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Icon className={`w-3 h-3 ${meta?.color || ""}`} />
                          {meta?.label || segKey}
                        </span>
                        <div className="flex items-center gap-3 tabular-nums">
                          <span className={`flex items-center gap-0.5 ${demandUp ? "text-lime" : "text-muted-foreground"}`}>
                            {demandUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {seg.demandLabel}
                          </span>
                          <span className="text-muted-foreground/60">·</span>
                          <span className={priceUp ? "text-coral" : "text-muted-foreground"}>
                            {seg.priceLabel}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1">
                    <Link
                      to="/auftraege"
                      className="text-xs text-lime hover:underline flex items-center gap-1"
                    >
                      <Package className="w-3 h-3" /> Aufträge ansehen
                    </Link>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {overview.activeEvents.length === 0 && overview.announcedEvents.length === 0 && (
        <div className="glass rounded-xl border border-white/10 p-4 text-center text-sm text-muted-foreground">
          Aktuell sind keine besonderen Marktereignisse aktiv oder angekündigt.
        </div>
      )}
    </div>
  );
}

function EventCard({ event, active, gameTime }) {
  const TrendIcon = event.demandDelta > 0 ? TrendingUp : TrendingDown;
  const color = active ? "border-coral/30 bg-coral/5" : "border-invest-cyan/20 bg-invest-cyan/5";
  const regionLabel = REGION_LABELS[event.region] || event.region;
  const segLabel = event.segment ? (SEGMENT_META[event.segment]?.label || event.segment) : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className={`glass rounded-xl border p-3 ${color}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-[0.12em] ${active ? "text-coral" : "text-invest-cyan"}`}>
              {active ? "Aktiv" : "Angekündigt"}
            </span>
            <span className="text-xs font-medium text-foreground">{event.label}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
          <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <MapPin className="w-3 h-3" /> {regionLabel}
            </span>
            {segLabel && (
              <span className="flex items-center gap-0.5">
                · {segLabel}
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <Calendar className="w-3 h-3" />
              {active
                ? `bis Tag ${Math.ceil(event.endMin / 1440) + 1}`
                : `ab Tag ${Math.ceil(event.startMin / 1440) + 1}`}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`flex items-center gap-0.5 text-xs tabular-nums ${event.demandDelta > 0 ? "text-lime" : "text-muted-foreground"}`}>
            <TrendIcon className="w-3 h-3" />
            Nachfrage {event.demandDelta > 0 ? "+" : ""}{Math.round(event.demandDelta * 100)}%
          </span>
          {event.priceDelta !== 0 && (
            <span className={`text-[10px] tabular-nums ${event.priceDelta > 0 ? "text-coral" : "text-muted-foreground"}`}>
              Preis {event.priceDelta > 0 ? "+" : ""}{Math.round(event.priceDelta * 100)}%
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}