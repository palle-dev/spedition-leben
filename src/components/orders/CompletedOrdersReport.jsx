import React, { useMemo, useState } from "react";
import {
  CheckCircle2, XCircle, Clock, AlertOctagon, Euro,
  Truck, Search, SlidersHorizontal, X, ArrowUpDown, ArrowUp, ArrowDown,
  Package, Flame, MapPin, Route as RouteIcon, Calendar, Wallet, Gauge, FileText, History,
} from "lucide-react";
import { formatEuro, formatGameTime, CITIES, getDistance } from "@/lib/gameData";
import Drawer from "@/components/ui/Drawer";
import CompletedOrderDetail from "@/components/orders/CompletedOrderDetail";

// Berichtswesen für erledigte Aufträge — professionelle Auswertung mit
// Filtern, KPIs, sortierbarer Tabelle und Detail-Drawer.
// Erledigte Aufträge = status in [geliefert, storniert, expired, failed].

const DONE_STATUSES = ["geliefert", "storniert", "expired", "failed"];

const STATUS_META = {
  geliefert: { label: "Geliefert", icon: CheckCircle2, color: "text-lime", bar: "bg-lime", ring: "bg-lime/10 border-lime/30" },
  storniert: { label: "Storniert", icon: XCircle, color: "text-red-300", bar: "bg-red-300", ring: "bg-red-300/10 border-red-300/30" },
  expired: { label: "Verfallen", icon: Clock, color: "text-muted-foreground", bar: "bg-muted-foreground", ring: "bg-white/5 border-white/15" },
  failed: { label: "Gescheitert", icon: AlertOctagon, color: "text-red-400", bar: "bg-red-400", ring: "bg-red-400/10 border-red-400/30" },
};

const TYPE_LABELS = { normal: "Standard", express: "Express", advance: "Vorlauf" };

// Sortier-Richtung
function dirMul(dir) { return dir === "asc" ? 1 : -1; }

export default function CompletedOrdersReport({ state }) {
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fType, setFType] = useState("");
  const [fDg, setFDg] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fPeriod, setFPeriod] = useState("30");
  const [filterOpen, setFilterOpen] = useState(true);
  const [sort, setSort] = useState({ key: "deliveredAt", dir: "desc" });
  const [detail, setDetail] = useState(null);
  const [visibleCount, setVisibleCount] = useState(50);

  const drivers = state.drivers || [];
  const vehicles = state.vehicles || [];
  const trips = state.trips || [];
  const now = state.gameTime || 0;

  // Lookup-Maps für O(1)-Verknüpfungen (einmalig pro State-Änderung gebaut)
  const tripByOrder = useMemo(() => {
    const m = new Map();
    for (const t of trips) m.set(t.orderId, t);
    return m;
  }, [trips]);
  const driverById = useMemo(() => {
    const m = new Map();
    for (const d of drivers) m.set(d.id, d);
    return m;
  }, [drivers]);
  const vehicleById = useMemo(() => {
    const m = new Map();
    for (const v of vehicles) m.set(v.id, v);
    return m;
  }, [vehicles]);

  // Basis: erledigte Aufträge mit verknüpftem Trip (O(n) dank Lookup-Maps)
  const base = useMemo(() => {
    const periodMin = fPeriod === "all" ? Infinity : parseInt(fPeriod, 10) * 1440;
    const cutoff = now - periodMin;
    const out = [];
    for (const o of (state.orders || [])) {
      if (!DONE_STATUSES.includes(o.status)) continue;
      const refMin = o.deliveredAtMin || o.failedAtMin || o.cancelledAtMin || o.acceptedAtMin || o.deliveryDeadlineMin || 0;
      if (refMin < cutoff) continue;
      const trip = tripByOrder.get(o.id) || null;
      // Fahrer vorrangig aus Lieferhistorie auflösen (verlässlicher als Trip,
      // da Trip bei Auto-Neuplanung oder Cleanup überschrieben werden kann).
      let driver = null;
      if (o.history) {
        const delivered = [...o.history].reverse().find(h => h.type === "delivered");
        if (delivered && delivered.actor) {
          driver = driverById.get(delivered.actor) || null;
        }
      }
      if (!driver && trip) {
        driver = driverById.get(trip.driverId) || null;
      }
      const vehicle = trip ? vehicleById.get(trip.vehicleId) || null : null;
      const onTime = o.status === "geliefert" && o.deliveredAtMin != null ? (o.deliveredAtMin <= o.deliveryDeadlineMin) : null;
      const contribution = trip ? (trip.paymentCents || o.paidCents || o.paymentCents) - (trip.fuelCents || 0) - (trip.tollCents || 0) : null;
      out.push({
        ...o,
        _trip: trip,
        _driver: driver,
        _vehicle: vehicle,
        _refMin: refMin,
        _onTime: onTime,
        _contribution: contribution,
        _km: trip?.totalKm || getDistance(o.fromCity, o.toCity) || 0,
      });
    }
    return out;
  }, [state.orders, tripByOrder, driverById, vehicleById, now, fPeriod]);

  // Gefiltert
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return base.filter(o => {
      if (fStatus && o.status !== fStatus) return false;
      if (fType && o.offerType !== fType) return false;
      if (fDg === "yes" && !o.isDangerousGoods) return false;
      if (fDg === "no" && o.isDangerousGoods) return false;
      if (fFrom && o.fromCity !== fFrom) return false;
      if (fTo && o.toCity !== fTo) return false;
      if (q) {
        const hay = `${o.customer} ${o.fromCity} ${o.toCity} ${o.cargo} ${o._driver?.name || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [base, search, fStatus, fType, fDg, fFrom, fTo]);

  // Sortiert
  const sorted = useMemo(() => {
    const list = [...filtered];
    const k = sort.key;
    const mul = dirMul(sort.dir);
    list.sort((a, b) => {
      let av, bv;
      switch (k) {
        case "customer": av = a.customer?.toLowerCase() || ""; bv = b.customer?.toLowerCase() || ""; break;
        case "route": av = `${a.fromCity}-${a.toCity}`; bv = `${b.fromCity}-${b.toCity}`; break;
        case "tons": av = a.tons || 0; bv = b.tons || 0; break;
        case "status": av = a.status; bv = b.status; break;
        case "deliveredAt": av = a._refMin; bv = b._refMin; break;
        case "deadline": av = a.deliveryDeadlineMin || 0; bv = b.deliveryDeadlineMin || 0; break;
        case "km": av = a._km; bv = b._km; break;
        case "revenue": av = a.paidCents ?? a.paymentCents ?? 0; bv = b.paidCents ?? b.paymentCents ?? 0; break;
        case "contribution": av = a._contribution ?? 0; bv = b._contribution ?? 0; break;
        default: av = a._refMin; bv = b._refMin;
      }
      if (av < bv) return -1 * mul;
      if (av > bv) return 1 * mul;
      return 0;
    });
    return list;
  }, [filtered, sort]);

  // KPIs & Status-Verteilung in einem Durchlauf
  const { kpis, dist } = useMemo(() => {
    let delivered = 0, failed = 0, cancelled = 0, expired = 0, onTimeDelivered = 0;
    let revenue = 0, contribution = 0;
    const counts = { geliefert: 0, storniert: 0, expired: 0, failed: 0 };
    for (const o of filtered) {
      counts[o.status] = (counts[o.status] || 0) + 1;
      if (o.status === "geliefert") delivered++;
      else if (o.status === "failed") failed++;
      else if (o.status === "storniert") cancelled++;
      else if (o.status === "expired") expired++;
      if (o._onTime === true) onTimeDelivered++;
      revenue += o.paidCents ?? 0;
      contribution += o._contribution ?? 0;
    }
    const onTimeRate = delivered > 0 ? Math.round((onTimeDelivered / delivered) * 100) : 0;
    const avgOrder = delivered > 0 ? Math.round(revenue / delivered) : 0;
    return {
      kpis: { total: filtered.length, delivered, failed, cancelled, expired, onTimeRate, revenue, contribution, avgOrder },
      dist: counts,
    };
  }, [filtered]);

  const activeFilterCount = [fStatus, fType, fDg, fFrom, fTo].filter(v => v !== "" && v !== "all").length + (fPeriod !== "30" ? 1 : 0);

  function resetFilters() {
    setSearch(""); setFStatus(""); setFType(""); setFDg(""); setFFrom(""); setFTo(""); setFPeriod("30");
  }

  function toggleSort(key) {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" });
  }

  const selectCls = "w-full px-3 py-1.5 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none";
  const optionStyle = { backgroundColor: "#0b1011", color: "#f4f0e8" };

  return (
    <div className="space-y-5">
      {/* KPI-Leiste */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={FileText} label="Erledigte Aufträge" value={kpis.total} tone="default" />
        <Kpi icon={CheckCircle2} label="Pünktlich geliefert" value={`${kpis.onTimeRate}%`} sub={`${kpis.delivered} geliefert`} tone="lime" />
        <Kpi icon={Euro} label="Umsatz (erledigt)" value={formatEuro(kpis.revenue)} tone="lime" />
        <Kpi icon={Wallet} label="Beitrag (Deckungsbeitrag)" value={formatEuro(kpis.contribution)} sub={`∅ ${formatEuro(kpis.avgOrder)}/Auftrag`} tone="cyan" />
        <Kpi icon={XCircle} label="Storniert / Verfallen" value={kpis.cancelled + kpis.expired} sub={`${kpis.cancelled} storniert`} tone="amber" />
        <Kpi icon={AlertOctagon} label="Gescheitert" value={kpis.failed} tone={kpis.failed > 0 ? "red" : "muted"} />
      </div>

      {/* Status-Verteilung als Balken */}
      <div className="glass border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Status-Verteilung</h3>
          <span className="text-[10px] text-muted-foreground/60 tabular-nums">{filtered.length} Treffer</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-2">
          {DONE_STATUSES.map(s => {
            const c = dist[s] || 0;
            const pct = filtered.length > 0 ? (c / filtered.length) * 100 : 0;
            if (pct === 0) return null;
            return <div key={s} className={`${STATUS_META[s].bar} transition-all`} style={{ width: `${pct}%` }} title={`${STATUS_META[s].label}: ${c}`} />;
          })}
          {filtered.length === 0 && <div className="w-full bg-surface-2" />}
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          {DONE_STATUSES.map(s => {
            const M = STATUS_META[s];
            const c = dist[s] || 0;
            return (
              <div key={s} className="flex items-center gap-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${M.bar}`} />
                <span className="text-muted-foreground">{M.label}</span>
                <span className="text-foreground tabular-nums font-medium">{c}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filterleiste */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Suche nach Kunde, Ort, Fracht, Fahrer…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none"
            />
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <select value={fPeriod} onChange={e => setFPeriod(e.target.value)} className="px-3 py-2 rounded-lg bg-surface-2 border border-white/10 text-xs text-foreground focus:border-lime/50 outline-none">
            <option value="7" style={optionStyle}>Letzte 7 Tage</option>
            <option value="30" style={optionStyle}>Letzte 30 Tage</option>
            <option value="all" style={optionStyle}>Gesamter Zeitraum</option>
          </select>
          <button
            onClick={() => setFilterOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs transition ${filterOpen ? "bg-lime/15 border-lime/30 text-lime" : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10"}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Filter
            {activeFilterCount > 0 && (
              <span className="grid place-items-center min-w-[16px] h-4 px-1 rounded-full bg-lime text-ink text-[9px] font-bold">{activeFilterCount}</span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={resetFilters} className="flex items-center gap-1 px-2.5 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 transition">
              <X className="w-3.5 h-3.5" /> Zurücksetzen
            </button>
          )}
        </div>

        {filterOpen && (
          <div className="glass border border-white/10 rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <FilterField label="Status">
              <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={selectCls}>
                <option value="" style={optionStyle}>Alle Status</option>
                {DONE_STATUSES.map(s => <option key={s} value={s} style={optionStyle}>{STATUS_META[s].label}</option>)}
              </select>
            </FilterField>
            <FilterField label="Frachtart">
              <select value={fType} onChange={e => setFType(e.target.value)} className={selectCls}>
                <option value="" style={optionStyle}>Alle Arten</option>
                <option value="normal" style={optionStyle}>Standard</option>
                <option value="express" style={optionStyle}>Express</option>
                <option value="advance" style={optionStyle}>Vorlauf</option>
              </select>
            </FilterField>
            <FilterField label="Gefahrgut">
              <select value={fDg} onChange={e => setFDg(e.target.value)} className={selectCls}>
                <option value="" style={optionStyle}>Alle Frachten</option>
                <option value="yes" style={optionStyle}>Nur Gefahrgut</option>
                <option value="no" style={optionStyle}>Kein Gefahrgut</option>
              </select>
            </FilterField>
            <FilterField label="Startort">
              <select value={fFrom} onChange={e => setFFrom(e.target.value)} className={selectCls}>
                <option value="" style={optionStyle}>Alle Startorte</option>
                {CITIES.map(c => <option key={c} value={c} style={optionStyle}>{c}</option>)}
              </select>
            </FilterField>
            <FilterField label="Zielort">
              <select value={fTo} onChange={e => setFTo(e.target.value)} className={selectCls}>
                <option value="" style={optionStyle}>Alle Zielorte</option>
                {CITIES.map(c => <option key={c} value={c} style={optionStyle}>{c}</option>)}
              </select>
            </FilterField>
          </div>
        )}
      </div>

      {/* Tabelle */}
      {sorted.length === 0 ? (
        <div className="glass border border-white/10 rounded-xl p-10 text-center">
          <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Keine erledigten Aufträge im gewählten Zeitraum.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Passe Filter oder Zeitraum an.</p>
        </div>
      ) : (
        <div className="glass border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/10">
                  <Th label="Kunde" col="customer" sort={sort} onSort={toggleSort} />
                  <Th label="Route" col="route" sort={sort} onSort={toggleSort} />
                  <Th label="Fracht" col="tons" sort={sort} onSort={toggleSort} />
                  <Th label="Status" col="status" sort={sort} onSort={toggleSort} />
                  <Th label="Erledigt am" col="deliveredAt" sort={sort} onSort={toggleSort} />
                  <Th label="Pünktlich" />
                  <Th label="Distanz" col="km" sort={sort} onSort={toggleSort} right />
                  <Th label="Umsatz" col="revenue" sort={sort} onSort={toggleSort} right />
                  <Th label="Beitrag" col="contribution" sort={sort} onSort={toggleSort} right />
                  <Th label="Fahrer / Lkw" />
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, visibleCount).map(o => {
                  const M = STATUS_META[o.status];
                  const StatusIcon = M.icon;
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setDetail(o)}
                      className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition group"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground truncate max-w-[160px]">{o.customer}</div>
                        <div className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          {o.isDangerousGoods ? <Flame className="w-2.5 h-2.5 text-amber-300" /> : <Package className="w-2.5 h-2.5" />}
                          {TYPE_LABELS[o.offerType] || o.offerType}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-foreground/80">
                          <MapPin className="w-3 h-3 text-muted-foreground/50" /> {o.fromCity}
                          <ArrowRightShort /> {o.toCity}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{o.cargo} · {o.tons}t</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${M.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" /> {M.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatGameTime(o._refMin)}</td>
                      <td className="px-3 py-2.5">
                        {o._onTime === true && <span className="text-lime text-xs">Pünktlich</span>}
                        {o._onTime === false && <span className="text-amber-300 text-xs">Verspätet</span>}
                        {o._onTime === null && <span className="text-muted-foreground/40 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums text-right whitespace-nowrap">{o._km} km</td>
                      <td className="px-3 py-2.5 text-xs text-foreground tabular-nums text-right whitespace-nowrap font-medium">{o.paidCents != null ? formatEuro(o.paidCents) : "—"}</td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-right whitespace-nowrap">
                        {o._contribution != null ? (
                          <span className={o._contribution >= 0 ? "text-lime" : "text-red-300"}>{formatEuro(o._contribution)}</span>
                        ) : <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {o._driver ? <div className="truncate max-w-[120px]">{o._driver.name}</div> : <span className="text-muted-foreground/40">—</span>}
                        {o._vehicle && <div className="text-[10px] text-muted-foreground/60 truncate max-w-[120px]">{o._vehicle.plate || o._vehicle.model}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-white/10 bg-white/[0.02]">
                  <td colSpan={6} className="px-3 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground">Summe ({filtered.length} Aufträge)</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground tabular-nums text-right">{filtered.reduce((s, o) => s + o._km, 0)} km</td>
                  <td className="px-3 py-2.5 text-xs text-foreground tabular-nums text-right font-medium">{formatEuro(kpis.revenue)}</td>
                  <td className="px-3 py-2.5 text-xs tabular-nums text-right font-medium">
                    <span className={kpis.contribution >= 0 ? "text-lime" : "text-red-300"}>{formatEuro(kpis.contribution)}</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {sorted.length > visibleCount && (
            <div className="px-3 py-3 text-center border-t border-white/5">
              <button
                onClick={() => setVisibleCount(c => c + 100)}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-foreground hover:bg-white/10 hover:border-lime/30 transition"
              >
                Weitere {Math.min(100, sorted.length - visibleCount)} von {sorted.length - visibleCount} anzeigen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detail-Drawer */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title="Auftragsdetail" kicker={detail ? STATUS_META[detail.status]?.label : ""} maxWidth="max-w-lg">
        {detail && <CompletedOrderDetail order={detail} />}
      </Drawer>
    </div>
  );
}

function ArrowRightShort() {
  return <span className="text-muted-foreground/40">→</span>;
}

function Kpi({ icon: Icon, label, value, sub, tone = "default" }) {
  const toneCls = {
    default: "text-foreground",
    lime: "text-lime",
    cyan: "text-invest-cyan",
    amber: "text-amber-300",
    red: "text-red-300",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-lg font-medium tabular-nums mt-1 ${toneCls}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</div>}
    </div>
  );
}

function Th({ label, col, sort, onSort, right }) {
  const active = col && sort.key === col;
  return (
    <th className={`px-3 py-2.5 font-medium ${right ? "text-right" : "text-left"} ${col ? "cursor-pointer select-none hover:text-foreground" : ""}`} onClick={col ? () => onSort(col) : undefined}>
      <span className={`inline-flex items-center gap-1 ${right ? "flex-row-reverse" : ""}`}>
        {label}
        {active && (sort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
        {col && !active && <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </span>
    </th>
  );
}

function FilterField({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function OrderDetail({ order, state }) {
  const M = STATUS_META[order.status];
  const trip = order._trip;
  const driver = order._driver;
  const vehicle = order._vehicle;
  const history = order.history || [];

  const rows = [
    { icon: FileText, label: "Auftragsnummer", value: order.id },
    { icon: MapPin, label: "Route", value: `${order.fromCity} → ${order.toCity}` },
    { icon: Package, label: "Fracht", value: `${order.cargo} · ${order.tons} t` },
    { icon: Truck, label: "Frachtart", value: TYPE_LABELS[order.offerType] || order.offerType },
    { icon: Flame, label: "Gefahrgut", value: order.isDangerousGoods ? `Ja (ADR ${order.dgClass || "—"})` : "Nein" },
    { icon: Calendar, label: "Lieferfrist", value: formatGameTime(order.deliveryDeadlineMin) },
    { icon: Clock, label: "Erledigt am", value: formatGameTime(order._refMin) },
    { icon: Gauge, label: "Pünktlichkeit", value: order._onTime === true ? "Pünktlich" : order._onTime === false ? "Verspätet" : "—" },
  ];

  const finRows = [
    { label: "Vergütung (Soll)", value: formatEuro(order.paymentCents) },
    { label: "Bezahlt (Ist)", value: order.paidCents != null ? formatEuro(order.paidCents) : "—" },
    { label: "Distanz", value: `${order._km} km` },
    { label: "Treibstoff", value: trip ? formatEuro(trip.fuelCents || 0) : "—" },
    { label: "Maut", value: trip ? formatEuro(trip.tollCents || 0) : "—" },
    { label: "Deckungsbeitrag", value: order._contribution != null ? formatEuro(order._contribution) : "—", highlight: true },
  ];

  return (
    <div className="space-y-5">
      {/* Status-Banner */}
      <div className={`flex items-center gap-3 rounded-xl border p-3 ${M.ring}`}>
        <M.icon className={`w-5 h-5 ${M.color}`} />
        <div>
          <div className={`text-sm font-medium ${M.color}`}>{M.label}</div>
          <div className="text-xs text-muted-foreground">{order.customer}</div>
        </div>
      </div>

      {/* Auftragsdaten */}
      <div>
        <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Auftragsdaten</h4>
        <div className="grid grid-cols-2 gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs bg-white/[0.02] border border-white/5 rounded-lg px-2.5 py-2">
              <r.icon className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground">{r.label}</div>
                <div className="text-foreground truncate">{r.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Finanzen */}
      <div>
        <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Finanzen</h4>
        <div className="space-y-1.5">
          {finRows.map((r, i) => (
            <div key={i} className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg ${r.highlight ? "bg-lime/5 border border-lime/20" : "bg-white/[0.02] border border-white/5"}`}>
              <span className="text-muted-foreground">{r.label}</span>
              <span className={`tabular-nums font-medium ${r.highlight ? (order._contribution >= 0 ? "text-lime" : "text-red-300") : "text-foreground"}`}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Einsatz */}
      {(driver || vehicle) && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Einsatz</h4>
          <div className="grid grid-cols-2 gap-2">
            {driver && (
              <div className="bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" /> Fahrer</div>
                <div className="text-sm text-foreground">{driver.name}</div>
              </div>
            )}
            {vehicle && (
              <div className="bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-1"><RouteIcon className="w-3 h-3" /> Fahrzeug</div>
                <div className="text-sm text-foreground">{vehicle.plate || vehicle.model || vehicle.id}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verlauf */}
      {history.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1"><History className="w-3 h-3" /> Verlauf</h4>
          <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
            {history.map((h, i) => (
              <div key={i} className="flex items-start gap-2 text-xs px-2.5 py-1.5 bg-white/[0.02] border border-white/5 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-lime/60 mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <span className="text-foreground/80 capitalize">{h.type}</span>
                  {h.actorName && <span className="text-muted-foreground"> · {h.actorName}</span>}
                  <span className="text-muted-foreground/60 block text-[10px]">{formatGameTime(h.min)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}