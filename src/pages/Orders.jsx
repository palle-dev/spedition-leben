import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, CITIES, getDistance } from "@/lib/gameData";
import { getMarketStats } from "@/lib/marketData";
import StatusBadge from "@/components/ui/StatusBadge";
import OfferCard from "@/components/orders/OfferCard";
import PageHint from "@/components/help/PageHint";
import { Check, X, MapPin, ArrowRight, Clock, Route as RouteIcon, Truck, TrendingUp, Calendar, Package, Layers, Loader2, Filter, SlidersHorizontal } from "lucide-react";

// Ermittelt die zuständige Filiale für einen Abholort (nächste aktive Filiale).
function nearestBranchFor(state, fromCity) {
  const branches = (state.branches || []).filter(b => b.status === "active");
  if (branches.length === 0) return null;
  if (branches.length === 1) return branches[0];
  let best = branches[0], bestDist = getDistance(branches[0].city, fromCity);
  for (let i = 1; i < branches.length; i++) {
    const d = getDistance(branches[i].city, fromCity);
    if (d < bestDist) { best = branches[i]; bestDist = d; }
  }
  return best;
}

export default function Orders() {
  const { state, send, showToast } = useGame();
  const navigate = useNavigate();
  const [tab, setTab] = useState("boerse");
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFeasible, setFilterFeasible] = useState("");
  const [filterDg, setFilterDg] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [sortBy, setSortBy] = useState("deadline");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const marketStats = getMarketStats(state);

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelectedIds(new Set(offered.map(o => o.id)));
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function accept(o) {
    setBusyId(o.id);
    try { await send("acceptOrder", { orderId: o.id }); showToast("Auftrag angenommen.", "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }
  async function cancel(o) {
    setBusyId(o.id);
    try { await send("cancelOrder", { orderId: o.id }); showToast("Auftrag storniert (10 % Gebühr).", "info"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }

  const [clearing, setClearing] = useState(false);
  async function clearOpenOrders() {
    const offeredCount = state.orders.filter(o => o.status === "offered").length;
    const acceptedCount = state.orders.filter(o => o.status === "angenommen").length;
    const total = offeredCount + acceptedCount;
    if (total === 0) { showToast("Keine offenen Aufträge zum Löschen.", "info"); return; }
    if (!window.confirm(`${total} offene Aufträge löschen?\n(${offeredCount} Marktangebote, ${acceptedCount} angenommen, ungesplant)\n\nBereits disponierte Aufträge bleiben erhalten.`)) return;
    setClearing(true);
    try {
      const r = await send("clearOpenOrders", {});
      showToast(`${r.removedCount} Aufträge gelöscht.`, "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setClearing(false); }
  }

  const offered = useMemo(() => {
    let list = state.orders.filter(o => o.status === "offered");
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(o =>
        o.customer?.toLowerCase().includes(s) ||
        o.fromCity?.toLowerCase().includes(s) ||
        o.toCity?.toLowerCase().includes(s) ||
        o.cargo?.toLowerCase().includes(s)
      );
    }
    if (filterCity) list = list.filter(o => o.fromCity === filterCity);
    if (filterType) list = list.filter(o => o.offerType === filterType);
    if (filterFeasible === "yes") list = list.filter(o => o.feasible === true);
    if (filterFeasible === "no") list = list.filter(o => o.feasible === false);
    if (filterDg === "yes") list = list.filter(o => o.isDangerousGoods);
    if (filterDg === "no") list = list.filter(o => !o.isDangerousGoods);
    if (filterBranch) list = list.filter(o => (nearestBranchFor(state, o.fromCity)?.id || null) === filterBranch);
    return list.sort((a, b) => {
      if (sortBy === "payment") return b.paymentCents - a.paymentCents;
      if (sortBy === "accept") return a.acceptDeadlineMin - b.acceptDeadlineMin;
      return a.deliveryDeadlineMin - b.deliveryDeadlineMin;
    });
  }, [state.orders, state.branches, search, filterCity, filterType, filterFeasible, filterDg, filterBranch, sortBy]);

  const active = state.orders.filter(o => ["angenommen", "unterwegs"].includes(o.status));
  const done = state.orders.filter(o => ["geliefert", "storniert", "expired", "failed"].includes(o.status)).slice(-12);

  // Verwaiste Auswahlen entfernen (Aufträge nicht mehr offered)
  React.useEffect(() => {
    setSelectedIds(prev => {
      const offeredIds = new Set(state.orders.filter(o => o.status === "offered").map(o => o.id));
      let changed = false;
      for (const id of prev) {
        if (!offeredIds.has(id)) { changed = true; break; }
      }
      if (!changed) return prev;
      const next = new Set();
      for (const id of prev) { if (offeredIds.has(id)) next.add(id); }
      return next;
    });
  }, [state.orders]);

  async function bulkAcceptAndDispatch() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    let acceptedCount = 0;
    let failedCount = 0;
    // 1. Ausgewählte Angebote annehmen
    for (const oid of ids) {
      const o = state.orders.find(x => x.id === oid);
      if (!o || o.status !== "offered") continue;
      try {
        await send("acceptOrder", { orderId: oid });
        acceptedCount++;
      } catch (e) { failedCount++; }
    }
    // 2. Freie Flotte verplanen
    let dispatchResult = null;
    try {
      dispatchResult = await send("dispatchAllNow", {});
    } catch (e) { /* Flottenverplanung fehlgeschlagen – Aufträge bleiben angenommen */ }
    setSelectedIds(new Set());
    setBulkBusy(false);
    const parts = [];
    if (acceptedCount > 0) parts.push(`${acceptedCount} angenommen`);
    if (dispatchResult?.planned > 0) parts.push(`${dispatchResult.planned} Touren geplant (${(dispatchResult.totalContributionCents / 100).toLocaleString("de-DE", { minimumFractionDigits: 0 })} € Beitrag)`);
    if (dispatchResult?.planned === 0) parts.push("keine freien Fahrzeuge");
    if (failedCount > 0) parts.push(`${failedCount} fehlgeschlagen`);
    showToast(parts.join(" · "), dispatchResult?.planned > 0 ? "success" : "info");
  }

  function resetFilter() {
    setSearch(""); setFilterCity(""); setFilterType(""); setFilterFeasible(""); setFilterDg(""); setFilterBranch(""); setSortBy("deadline");
  }

  const activeFilterCount = [filterCity, filterType, filterFeasible, filterDg, filterBranch].filter(Boolean).length;
  const selectCls = "w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none";
  const optionStyle = { backgroundColor: "#0b1011", color: "#f4f0e8" };

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1600px] mx-auto space-y-6">
      <PageHint pageKey="orders" />
      <div>
        <h1 className="text-2xl lg:text-3xl font-medium tracking-tight">Aufträge</h1>
        <p className="text-sm text-muted-foreground mt-1">Der Auftragsmarkt – nimm Angebote an, bevor die Annahmefrist abläuft.</p>
      </div>

      {/* Markt-Kennzahlen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Truck} label="Planbare Flotte (N)" value={marketStats.n} sub={`${marketStats.n} Paarungen`} />
        <StatCard icon={TrendingUp} label="Zielbestand (T)" value={marketStats.t} sub={`max(24, 10+6×${marketStats.n})`} />
        <StatCard icon={Package} label="Offene Angebote" value={marketStats.openOffers} sub={`von ${marketStats.t} Ziel`} />
        <StatCard icon={Calendar} label="Nächste Marktwelle" value={marketStats.nextWaveMin ? formatGameTime(marketStats.nextWaveMin) : "—"} sub="Neue Angebote stündlich" />
      </div>

      {/* Tab-Navigation */}
      <div className="flex gap-1 border-b border-white/10">
        <TabButton active={tab === "boerse"} onClick={() => setTab("boerse")} label="Frachtbörse" count={offered.length} />
        <TabButton active={tab === "eigene"} onClick={() => setTab("eigene")} label="Eigene Aufträge" count={active.length} />
      </div>

      {tab === "boerse" && (
        <div className="space-y-4">
          {/* Filter — kompakte Leiste + aufklappbares Panel */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <input
                  type="text"
                  placeholder="Suche nach Kunde, Ort, Fracht..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none"
                />
                <Filter className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none">
                <option value="deadline" style={optionStyle}>Sortieren: Lieferfrist</option>
                <option value="accept" style={optionStyle}>Sortieren: Annahmefrist</option>
                <option value="payment" style={optionStyle}>Sortieren: Vergütung</option>
              </select>
              <button
                onClick={() => setFilterOpen(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition ${filterOpen ? "bg-lime/15 border-lime/30 text-lime" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"}`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Filter
                {activeFilterCount > 0 && (
                  <span className="grid place-items-center min-w-[16px] h-4 px-1 rounded-full bg-lime text-ink text-[9px] font-bold">{activeFilterCount}</span>
                )}
              </button>
              {activeFilterCount > 0 && (
                <button onClick={resetFilter} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 transition">
                  <X className="w-3.5 h-3.5" /> Zurücksetzen
                </button>
              )}
              <button onClick={clearOpenOrders} disabled={clearing}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-400/25 text-red-200 text-xs hover:bg-red-500/20 disabled:opacity-50 transition ml-auto">
                {clearing ? "Lösche…" : "Alle offenen löschen"}
              </button>
            </div>

            {filterOpen && (
              <div className="glass border border-white/10 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <FilterField label="Startort">
                  <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className={selectCls}>
                    <option value="" style={optionStyle}>Alle Startorte</option>
                    {CITIES.map(c => <option key={c} value={c} style={optionStyle}>{c}</option>)}
                  </select>
                </FilterField>
                <FilterField label="Frachtart">
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selectCls}>
                    <option value="" style={optionStyle}>Alle Arten</option>
                    <option value="normal" style={optionStyle}>Standard</option>
                    <option value="express" style={optionStyle}>Express</option>
                    <option value="advance" style={optionStyle}>Vorlauf</option>
                  </select>
                </FilterField>
                <FilterField label="Ausführbarkeit">
                  <select value={filterFeasible} onChange={e => setFilterFeasible(e.target.value)} className={selectCls}>
                    <option value="" style={optionStyle}>Alle</option>
                    <option value="yes" style={optionStyle}>Passend</option>
                    <option value="no" style={optionStyle}>Schwer ausführbar</option>
                  </select>
                </FilterField>
                <FilterField label="Gefahrgut">
                  <select value={filterDg} onChange={e => setFilterDg(e.target.value)} className={selectCls}>
                    <option value="" style={optionStyle}>Alle Frachten</option>
                    <option value="yes" style={optionStyle}>Nur Gefahrgut</option>
                    <option value="no" style={optionStyle}>Kein Gefahrgut</option>
                  </select>
                </FilterField>
                {((state.branches || []).filter(b => b.status === "active").length > 1) && (
                  <FilterField label="Filiale">
                    <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} className={selectCls}>
                      <option value="" style={optionStyle}>Alle Filialen</option>
                      {(state.branches || []).filter(b => b.status === "active").map(b => <option key={b.id} value={b.id} style={optionStyle}>{b.name} ({b.city})</option>)}
                    </select>
                  </FilterField>
                )}
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground">{offered.length} Treffer</div>

          {/* Massen-Aktionsleiste */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 glass border border-lime/30 rounded-xl px-4 py-2.5">
              <span className="text-sm font-medium text-lime">{selectedIds.size} ausgewählt</span>
              <button onClick={selectAll} disabled={bulkBusy} className="text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 rounded">Alle</button>
              <button onClick={clearSelection} disabled={bulkBusy} className="text-xs text-muted-foreground hover:text-foreground transition px-2 py-1 rounded">Keine</button>
              <div className="flex-1" />
              <button
                onClick={bulkAcceptAndDispatch}
                disabled={bulkBusy}
                className="flex items-center gap-2 rounded-lg px-4 py-2 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition active:scale-95"
              >
                {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                {bulkBusy ? "Verarbeite…" : "Annehmen & verplanen"}
              </button>
            </div>
          )}

          {offered.length === 0 ? (
            <div className="text-sm text-muted-foreground/50 py-8 text-center">
              {state.orders.some(o => o.status === "offered")
                ? "Keine Angebote mit diesem Filter. Versuche einen weniger restriktiven Filter."
                : "Aktuell keine Angebote. Die nächste Marktwelle bringt neue Fracht."}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {offered.map(o => {
                const nb = nearestBranchFor(state, o.fromCity);
                return <OfferCard key={o.id} offer={o} onAccept={accept} busy={busyId === o.id} branchName={nb?.name} branchCity={nb?.city} selected={selectedIds.has(o.id)} onToggleSelect={toggleSelect} />;
              })}
            </div>
          )}
        </div>
      )}

      {tab === "eigene" && (
        <div className="space-y-6">
          <Section title="Angenommen & unterwegs" count={active.length}>
            {active.length === 0 ? <Empty text="Keine aktiven Aufträge." /> : (
              <div className="space-y-2">
                {active.map(o => {
                  const trip = state.trips.find(t => t.orderId === o.id && t.status === "in_progress");
                  return (
                    <div key={o.id} className="glass border border-white/10 rounded-lg p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{o.customer}: {o.fromCity} → {o.toCity}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                          <StatusBadge status={o.status} />
                          {trip && <span>· Ankunft {formatGameTime(trip.endMin)}</span>}
                          <span>· Frist {formatGameTime(o.deliveryDeadlineMin)}</span>
                        </div>
                      </div>
                      {o.status === "angenommen" && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => navigate(`/disposition?order=${o.id}`)}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-lime text-ink text-xs font-semibold hover:brightness-110 transition active:scale-95">
                            <RouteIcon className="w-3.5 h-3.5" /> Planen
                          </button>
                          <button onClick={() => cancel(o)} disabled={busyId === o.id}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-2 bg-red-500/15 border border-red-400/30 text-red-200 text-xs hover:bg-red-500/25 disabled:opacity-50 transition active:scale-95">
                            <X className="w-3.5 h-3.5" /> Stornieren
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Abgeschlossen & verfallen" count={done.length}>
            {done.length === 0 ? <Empty text="Noch keine abgeschlossenen Aufträge." /> : (
              <div className="space-y-1.5">
                {done.map(o => (
                  <div key={o.id} className="flex items-center justify-between text-sm border border-white/10 rounded-lg px-3 py-2 bg-surface/30">
                    <span className="text-foreground/80 truncate">{o.customer}: {o.fromCity} → {o.toCity}</span>
                    <span className="flex items-center gap-2 text-xs shrink-0">
                      <StatusBadge status={o.status} />
                      {o.paidCents != null && <span className="text-muted-foreground tabular-nums">{formatEuro(o.paidCents)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className="text-xl font-medium text-foreground mt-1 tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>
    </div>
  );
}

function TabButton({ active, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition ${active ? "border-lime text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
    >
      {label} <span className="text-muted-foreground/50 text-xs">({count})</span>
    </button>
  );
}

function Section({ title, count, children }) {
  return (
    <div>
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">{title} <span className="text-muted-foreground/50">({count})</span></h2>
      {children}
    </div>
  );
}

function Empty({ text }) { return <div className="text-sm text-muted-foreground/50">{text}</div>; }

function FilterField({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">{label}</span>
      {children}
    </label>
  );
}