import React from "react";
import { Building2, Users, Package, Truck, Route, BarChart3, Filter, X } from "lucide-react";

// Ebenen-Steuerung und Filter für die Netzkarte.
export default function NetworkLayerControl({
  layers, onToggleLayer,
  filters, onFilterChange,
  state,
  compact = false,
}) {
  const LAYER_DEFS = [
    { key: "branches", label: "Filialen", icon: Building2 },
    { key: "customers", label: "Kunden", icon: Users },
    { key: "orders", label: "Aufträge", icon: Package },
    { key: "tours", label: "Touren", icon: Route },
    { key: "vehicles", label: "Fahrzeuge", icon: Truck },
  ];

  const activeFilterCount =
    (filters.branchId ? 1 : 0) +
    (filters.vehicleId ? 1 : 0) +
    (filters.customerId ? 1 : 0) +
    (filters.orderStatus ? 1 : 0) +
    (filters.segments?.size || 0);

  return (
    <div className="space-y-3">
      {/* Ebenen */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Ebenen</div>
        <div className="flex flex-wrap gap-1.5">
          {LAYER_DEFS.map(l => {
            const active = layers.has(l.key);
            const Icon = l.icon;
            return (
              <button
                key={l.key}
                onClick={() => onToggleLayer(l.key)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition ${
                  active ? "bg-lime/15 text-lime border border-lime/30" : "bg-white/5 text-muted-foreground border border-white/10 hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {l.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter */}
      {!compact && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filter
              {activeFilterCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-lime/20 text-lime text-[9px]">{activeFilterCount}</span>
              )}
            </div>
            {activeFilterCount > 0 && (
              <button onClick={() => onFilterChange({ branchId: null, vehicleId: null, customerId: null, orderStatus: null, segments: new Set() })} className="text-[10px] text-muted-foreground hover:text-foreground">
                Zurücksetzen
              </button>
            )}
          </div>
          <div className="space-y-2">
            {/* Filial-Filter */}
            <select
              value={filters.branchId || ""}
              onChange={e => onFilterChange({ branchId: e.target.value || null })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            >
              <option value="">Alle Filialen</option>
              {(state.branches || []).filter(b => b.status === "active").map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.city})</option>
              ))}
            </select>

            {/* Auftragsstatus-Filter */}
            <select
              value={filters.orderStatus || ""}
              onChange={e => onFilterChange({ orderStatus: e.target.value || null })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-foreground"
            >
              <option value="">Alle Status</option>
              <option value="offered">Verfügbar</option>
              <option value="angenommen">Angenommen</option>
              <option value="geliefert">Geliefert</option>
              <option value="unterwegs">Unterwegs</option>
            </select>

            {/* Segment-Filter */}
            <div className="flex flex-wrap gap-1">
              {["regional", "express", "dangerousGoods", "standard"].map(seg => {
                const active = (filters.segments || new Set()).has(seg);
                const label = { regional: "Regional", express: "Express", dangerousGoods: "Gefahrgut", standard: "Standard" }[seg];
                return (
                  <button
                    key={seg}
                    onClick={() => {
                      const next = new Set(filters.segments || new Set());
                      if (active) next.delete(seg); else next.add(seg);
                      onFilterChange({ segments: next });
                    }}
                    className={`rounded px-2 py-1 text-[10px] transition ${active ? "bg-lime/15 text-lime border border-lime/25" : "bg-white/5 text-muted-foreground border border-white/10"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}