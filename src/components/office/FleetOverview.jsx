import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { clockOf, CITIES } from "@/lib/gameData";
import { filterVehicles, getVehicleDriver, getVehicleOrder, getVehicleNextEvent } from "@/lib/officeData";
import { vehicleDisplayName, tripPhaseLabel } from "@/lib/displayHelpers";
import { ownershipLabel } from "@/lib/financingData";
import { Search, Truck, MapPin, Wrench, ArrowRight, ChevronLeft, ChevronRight, FileText } from "lucide-react";

const PAGE_SIZE = 12;

// Vollständige Flottenübersicht mit Suche, Filter und Pagination.
export default function FleetOverview({ state }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownershipFilter, setOwnershipFilter] = useState("all");
  const [maintenanceFilter, setMaintenanceFilter] = useState("all");
  const [page, setPage] = useState(0);

  const filters = { search, city: cityFilter, status: statusFilter, ownership: ownershipFilter, maintenance: maintenanceFilter };
  const filtered = useMemo(() => filterVehicles(state, filters), [state, filters]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const pageVehicles = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, cityFilter, statusFilter, ownershipFilter, maintenanceFilter]);

  const statusColors = {
    free: "text-lime", on_trip: "text-amber-300", maintenance: "text-sky-300",
  };
  const statusLabels = {
    free: "Frei", on_trip: "Unterwegs", maintenance: "Wartung",
  };

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-xs uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" /> Flottenübersicht
          <span className="text-foreground/60">· {filtered.length} Lkw</span>
        </h3>
        <button onClick={() => navigate("/fuhrpark")}
          className="text-[11px] text-lime/70 hover:text-lime transition flex items-center gap-1">
          Fuhrpark <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {/* Such- und Filterleiste */}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Lkw, Fahrer, Stadt, Auftrag…"
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs focus:border-lime/40 outline-none"
          />
        </div>
        <select value={cityFilter} onChange={e => setCityFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs focus:border-lime/40 outline-none">
          <option value="all">Alle Standorte</option>
          {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs focus:border-lime/40 outline-none">
          <option value="all">Alle Status</option>
          <option value="free">Frei</option>
          <option value="on_trip">Unterwegs</option>
          <option value="maintenance">Wartung</option>
        </select>
        <select value={ownershipFilter} onChange={e => setOwnershipFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs focus:border-lime/40 outline-none">
          <option value="all">Alle Besitz</option>
          <option value="owned">Eigen</option>
          <option value="leased">Geleast</option>
        </select>
        <select value={maintenanceFilter} onChange={e => setMaintenanceFilter(e.target.value)}
          className="px-2 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs focus:border-lime/40 outline-none">
          <option value="all">Wartung: Alle</option>
          <option value="needs">Bedürftig (&lt;60)</option>
          <option value="critical">Kritisch (&lt;30)</option>
        </select>
      </div>

      {/* Flottentabelle */}
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground border-b border-white/10">
              <th className="text-left font-medium py-1.5 px-1">Lkw</th>
              <th className="text-left font-medium py-1.5 px-1">Fahrer</th>
              <th className="text-left font-medium py-1.5 px-1">Standort / Tour</th>
              <th className="text-left font-medium py-1.5 px-1">Auftrag</th>
              <th className="text-left font-medium py-1.5 px-1">Nächstes Ereignis</th>
              <th className="text-center font-medium py-1.5 px-1">Zustand</th>
              <th className="text-right font-medium py-1.5 px-1">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {pageVehicles.map(v => {
              const driver = getVehicleDriver(state, v);
              const order = getVehicleOrder(state, v);
              const nextEvent = getVehicleNextEvent(state, v);
              const isLeased = (v.ownership_type || "owned") === "leased";
              const trip = v.tripId ? (state.trips || []).find(t => t.id === v.tripId) : null;
              return (
                <tr key={v.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="py-2 px-1">
                    <div className="font-medium">{vehicleDisplayName(v)}</div>
                    <div className={`text-[9px] ${isLeased ? "text-sky-300" : "text-muted-foreground"}`}>{ownershipLabel(v)}</div>
                  </td>
                  <td className="py-2 px-1 text-muted-foreground">{driver?.name || "—"}</td>
                  <td className="py-2 px-1">
                    {v.status === "on_trip" && trip ? (
                      <span className="text-amber-300">{tripPhaseLabel(trip)}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-2.5 h-2.5" /> {v.locationCity}</span>
                    )}
                  </td>
                  <td className="py-2 px-1 text-muted-foreground truncate max-w-[120px]">{order?.customer || "—"}</td>
                  <td className="py-2 px-1 text-muted-foreground">
                    {nextEvent ? <span className="text-[10px]">{nextEvent.label}<br />{clockOf(nextEvent.min)}</span> : "—"}
                  </td>
                  <td className="py-2 px-1 text-center">
                    <span className={`font-medium ${v.condition < 30 ? "text-red-300" : v.condition < 60 ? "text-amber-300" : "text-foreground"}`}>
                      {v.condition}
                    </span>
                  </td>
                  <td className="py-2 px-1 text-right">
                    {v.status === "free" ? (
                      <button onClick={() => navigate("/disposition")}
                        className="text-[10px] text-lime hover:text-lime/80 transition font-medium">
                        Tour planen
                      </button>
                    ) : v.status === "on_trip" ? (
                      <button onClick={() => navigate("/disposition?trip=" + v.tripId)}
                        className="text-[10px] text-amber-300 hover:text-amber-200 transition font-medium">
                        Verfolgen
                      </button>
                    ) : v.status === "maintenance" ? (
                      <span className="text-[10px] text-sky-300">In Wartung</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                    {v.status === "free" && v.condition < 60 && (
                      <button onClick={() => navigate("/fuhrpark")}
                        className="block text-[10px] text-coral hover:text-coral/80 transition font-medium mt-0.5">
                        <Wrench className="w-2.5 h-2.5 inline mr-0.5" />Wartung
                      </button>
                    )}
                    {isLeased && (
                      <button onClick={() => navigate("/finanzen")}
                        className="block text-[10px] text-sky-300 hover:text-sky-200 transition font-medium mt-0.5">
                        <FileText className="w-2.5 h-2.5 inline mr-0.5" />Vertrag
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageVehicles.length === 0 && (
        <div className="text-center py-6 text-sm text-muted-foreground">
          Keine Fahrzeuge entsprechen den Filtern.
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
          <span className="text-[10px] text-muted-foreground">
            Seite {currentPage + 1} / {totalPages} · {filtered.length} Lkw gesamt
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}
              className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1}
              className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}