import React from "react";
import { Truck, Package, Search, X, Map, List, CalendarDays, Building2 } from "lucide-react";
import MarketPriorityControl from "./MarketPriorityControl";

// Kompakte Werkzeugleiste für den globalen Header (nur auf /disposition sichtbar).
// Alle Steuerelemente der Disposition in einer Zeile — kein separater Toolbar-Row.
export default function DispatchToolbar({
  runningCount, acceptedCount, onZuzuweisen, onTouren,
  search, setSearch, searchOpen, setSearchOpen,
  mobileView, setMobileView,
  showPlanning, onTogglePlanning, showPartners, onTogglePartners, partnerTransportCount,
}) {
  const isMapVisible = mobileView === "map";
  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* Wochenplanung / Partner Umschalter */}
      <div className="flex items-center gap-0.5 rounded-lg border border-white/10 p-0.5 shrink-0">
        <button
          onClick={onTogglePlanning}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition ${
            showPlanning ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground"
          }`}
          title={showPlanning ? "Zurück zur Disposition" : "Wochenplanung öffnen"}
        >
          <CalendarDays className="w-3 h-3" />
          <span className="hidden lg:inline">Planung</span>
        </button>
        <button
          onClick={onTogglePartners}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition relative ${
            showPartners ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground"
          }`}
          title={showPartners ? "Zurück zur Disposition" : "Partner-Speditionen"}
        >
          <Building2 className="w-3 h-3" />
          <span className="hidden lg:inline">Partner</span>
          {partnerTransportCount > 0 && (
            <span className="grid place-items-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-lime/20 text-lime text-[9px] font-bold leading-none">
              {partnerTransportCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onTouren}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/20 transition"
          title={`${runningCount} Fahrten unterwegs`}
        >
          <Truck className="w-3.5 h-3.5" /> {runningCount}
        </button>
        <button
          onClick={onZuzuweisen}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition ${
            acceptedCount > 0
              ? "bg-lime/10 border-lime/30 text-lime hover:border-lime/50"
              : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/20"
          }`}
          title={`${acceptedCount} Aufträge zu disponieren`}
        >
          <Package className="w-3.5 h-3.5" /> {acceptedCount}
        </button>
      </div>

      {searchOpen ? (
        <div className="relative shrink-0">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            onBlur={() => !search && setSearchOpen(false)}
            placeholder="Suchen…"
            className="w-32 sm:w-40 pl-8 pr-7 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition shrink-0"
          title="Suchen"
        >
          <Search className="w-3.5 h-3.5" />
        </button>
      )}

      <MarketPriorityControl />

      <div className="lg:hidden flex gap-1 bg-ink/60 border border-white/10 rounded-full p-0.5 shrink-0">
        <button
          onClick={() => setMobileView("map")}
          className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition ${isMapVisible ? "bg-lime text-ink" : "text-muted-foreground"}`}
        >
          <Map className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setMobileView("list")}
          className={`px-2.5 py-1.5 rounded-full text-xs font-medium transition ${!isMapVisible ? "bg-lime text-ink" : "text-muted-foreground"}`}
        >
          <List className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}