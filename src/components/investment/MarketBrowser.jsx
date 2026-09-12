import React, { useMemo, useState } from "react";
import { getInstrumentList, formatPricePlain, formatPct } from "@/lib/investmentData";
import { Search, TrendingUp, TrendingDown } from "lucide-react";

// Markt-Browser: alle Instrumente mit Kursen, Filter und Auswahl.
export default function MarketBrowser({ state, selectedId, onSelect }) {
  const instruments = useMemo(() => getInstrumentList(state), [state]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = instruments.filter(inst => {
    if (filter === "stocks" && inst.type !== "stock") return false;
    if (filter === "crypto" && inst.type !== "crypto") return false;
    if (search && !inst.name.toLowerCase().includes(search.toLowerCase()) && !inst.id.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="glass border border-white/10 rounded-xl overflow-hidden">
      {/* Header mit Filter */}
      <div className="p-4 border-b border-white/10 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Märkte</h3>
          <div className="flex items-center gap-1 text-xs">
            {["all", "stocks", "crypto"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md transition ${filter === f ? "bg-invest-purple/15 text-invest-purple" : "text-muted-foreground hover:text-foreground"}`}
              >
                {f === "all" ? "Alle" : f === "stocks" ? "Aktien" : "Krypto"}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Instrument suchen..."
            className="w-full bg-surface-2/50 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-invest-purple/30"
          />
        </div>
      </div>

      {/* Instrumentliste */}
      <div className="max-h-[480px] overflow-y-auto scrollbar-none">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">Keine Instrumente gefunden.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(inst => (
              <button
                key={inst.id}
                onClick={() => onSelect(inst.id)}
                className={`w-full text-left px-4 py-2.5 hover:bg-white/5 transition flex items-center gap-3 ${selectedId === inst.id ? "bg-invest-purple/5" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground truncate">{inst.name}</span>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{inst.id}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 mt-0.5">
                    <span>{inst.sector}</span>
                    <span className={`px-1.5 py-0.5 rounded ${inst.type === "crypto" ? "bg-invest-cyan/10 text-invest-cyan" : "bg-invest-purple/10 text-invest-purple"}`}>
                      {inst.type === "crypto" ? "Krypto" : "Aktie"}
                    </span>
                    {inst.status === "closed" && <span className="text-amber-300/60">geschlossen</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold tabular-nums">{formatPricePlain(inst.midCents)} €</div>
                  <div className={`text-[10px] tabular-nums flex items-center justify-end gap-0.5 ${inst.changePct >= 0 ? "text-lime" : "text-red-300"}`}>
                    {inst.changePct >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                    {formatPct(inst.changePct)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}