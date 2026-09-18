import React, { useMemo, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { getRelationStats, formatEuro } from "@/lib/networkData";
import { ArrowRight, Clock, AlertTriangle, RotateCcw, X } from "lucide-react";

// Relationsanalyse: Zeigt wirtschaftliche Kennzahlen pro Richtung (fromCity → toCity).
// Unterscheidet Auftragsrelationen von Fahrzeugbewegungen (Leerfahrten).
export default function RelationsPanel({ focusAction, onFocusCity, initialCustomerId = undefined }) {
  const { state } = useGame();
  const [periodDays, setPeriodDays] = useState(30);
  const [sortBy, setSortBy] = useState("revenueCents");
  const [filterCity, setFilterCity] = useState(null);

  const stats = useMemo(
    () => getRelationStats(state, periodDays),
    [state, periodDays]
  );

  const sorted = useMemo(() => {
    let rels = [...stats.relations];
    if (filterCity) {
      rels = rels.filter(r => r.fromCity === filterCity || r.toCity === filterCity);
    }
    rels.sort((a, b) => {
      const va = a[sortBy] || 0, vb = b[sortBy] || 0;
      return vb - va;
    });
    return rels;
  }, [stats.relations, sortBy, filterCity]);

  const sortOptions = [
    { key: "revenueCents", label: "Umsatz" },
    { key: "contributionCents", label: "Deckungsbeitrag" },
    { key: "deliveries", label: "Transporte" },
    { key: "punctuality", label: "Pünktlichkeit" },
    { key: "emptyKm", label: "Leerfahrten km" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Kopf */}
      <div className="shrink-0 space-y-2 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={periodDays}
            onChange={e => setPeriodDays(Number(e.target.value))}
            className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            <option value={7}>Letzte 7 Tage</option>
            <option value={14}>Letzte 14 Tage</option>
            <option value={30}>Letzte 30 Tage</option>
            <option value={90}>Letzte 90 Tage</option>
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground"
          >
            {sortOptions.map(o => <option key={o.key} value={o.key}>Sortieren: {o.label}</option>)}
          </select>
          {filterCity && (
            <button onClick={() => setFilterCity(null)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs bg-lime/10 text-lime border border-lime/20">
              {filterCity} <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          Datenabdeckung: {stats.coverageLabel}
          {stats.coverageDays === 0 && (
            <span className="text-amber-300/80">— noch keine abgeschlossenen Transporte</span>
          )}
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 min-h-0 overflow-y-auto py-2 space-y-1.5 scrollbar-none">
        {sorted.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            Keine Relationsdaten im ausgewählten Zeitraum.
          </div>
        ) : (
          sorted.map(r => (
            <div
              key={r.key}
              className="rounded-lg border border-white/8 bg-white/[0.02] p-2.5 hover:bg-white/5 transition cursor-pointer"
              onClick={() => onFocusCity?.(r.fromCity)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <span>{r.fromCity}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>{r.toCity}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-lime">{formatEuro(r.revenueCents)}</div>
                  <div className="text-[10px] text-muted-foreground">{r.distanceKm} km</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                <Stat label="Transporte" value={r.deliveries} />
                <Stat
                  label="Pünktlich"
                  value={r.punctuality != null ? Math.round(r.punctuality * 100) + "%" : "—"}
                  warn={r.punctuality != null && r.punctuality < 0.8}
                />
                <Stat label="DB" value={formatEuro(r.contributionCents)} highlight={r.contributionCents > 0} />
                <Stat label="Leer km" value={r.emptyKm > 0 ? r.emptyKm + " km" : "—"} warn={r.emptyKm > 0} />
              </div>
              {(r.lateDeliveries > 0 || r.failedDeliveries > 0 || r.recurringCustomers > 0) && (
                <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                  {r.lateDeliveries > 0 && (
                    <span className="flex items-center gap-0.5 text-amber-300/80"><AlertTriangle className="w-2.5 h-2.5" />{r.lateDeliveries} verspätet</span>
                  )}
                  {r.failedDeliveries > 0 && (
                    <span className="flex items-center gap-0.5 text-coral/80"><AlertTriangle className="w-2.5 h-2.5" />{r.failedDeliveries} gescheitert</span>
                  )}
                  {r.recurringCustomers > 0 && (
                    <span className="flex items-center gap-0.5 text-sky-300/80"><RotateCcw className="w-2.5 h-2.5" />{r.recurringCustomers} Kunde{r.recurringCustomers > 1 ? "n" : ""}</span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn = undefined, highlight = undefined }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className={`font-medium ${warn ? "text-amber-300" : highlight ? "text-lime" : "text-foreground"}`}>{value}</div>
    </div>
  );
}