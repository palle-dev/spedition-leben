import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, CITIES } from "@/lib/gameData";
import { getMarketStats } from "@/lib/marketData";
import StatusBadge from "@/components/ui/StatusBadge";
import OfferCard from "@/components/orders/OfferCard";
import { Check, X, MapPin, ArrowRight, Clock, Route as RouteIcon, Truck, TrendingUp, Calendar, Package } from "lucide-react";

export default function Orders() {
  const { state, send, showToast } = useGame();
  const navigate = useNavigate();
  const [tab, setTab] = useState("boerse");
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFeasible, setFilterFeasible] = useState("");
  const [sortBy, setSortBy] = useState("deadline");

  const marketStats = getMarketStats(state);

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
    return list.sort((a, b) => {
      if (sortBy === "payment") return b.paymentCents - a.paymentCents;
      if (sortBy === "accept") return a.acceptDeadlineMin - b.acceptDeadlineMin;
      return a.deliveryDeadlineMin - b.deliveryDeadlineMin;
    });
  }, [state.orders, search, filterCity, filterType, filterFeasible, sortBy]);

  const active = state.orders.filter(o => ["angenommen", "unterwegs"].includes(o.status));
  const done = state.orders.filter(o => ["geliefert", "storniert", "expired"].includes(o.status)).slice(-12);

  function resetFilter() {
    setSearch(""); setFilterCity(""); setFilterType(""); setFilterFeasible(""); setSortBy("deadline");
  }

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-5xl mx-auto space-y-6">
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
          {/* Filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Suche nach Kunde, Ort, Fracht..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none"
            />
            <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className="px-3 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none">
              <option value="">Alle Startorte</option>
              {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="px-3 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none">
              <option value="">Alle Arten</option>
              <option value="normal">Standard</option>
              <option value="express">Express</option>
              <option value="advance">Vorlauf</option>
            </select>
            <select value={filterFeasible} onChange={e => setFilterFeasible(e.target.value)} className="px-3 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none">
              <option value="">Alle</option>
              <option value="yes">Passend</option>
              <option value="no">Schwer ausführbar</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="px-3 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none">
              <option value="deadline">Nach Lieferfrist</option>
              <option value="accept">Nach Annahmefrist</option>
              <option value="payment">Nach Vergütung</option>
            </select>
            <button onClick={resetFilter} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground hover:bg-white/10 transition">
              Filter zurücksetzen
            </button>
          </div>

          <div className="text-xs text-muted-foreground">{offered.length} Treffer</div>

          {offered.length === 0 ? (
            <div className="text-sm text-muted-foreground/50 py-8 text-center">
              {state.orders.some(o => o.status === "offered")
                ? "Keine Angebote mit diesem Filter. Versuche einen weniger restriktiven Filter."
                : "Aktuell keine Angebote. Die nächste Marktwelle bringt neue Fracht."}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {offered.map(o => <OfferCard key={o.id} offer={o} onAccept={accept} busy={busyId === o.id} />)}
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