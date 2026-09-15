import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import {
  getFleetUtilizationKPIs,
  getBranchUtilization,
  getAllVehicleUtilization,
  getUtilizationActionItems,
} from "@/lib/utilizationData";
import {
  BarChart3, Truck, AlertTriangle, Clock, TrendingDown, MapPin,
  ChevronRight, Wrench, Users, Headset, CheckCircle2, TrendingUp,
} from "lucide-react";

const PERIODS = [
  { id: 7, label: "7 Tage" },
  { id: 30, label: "30 Tage" },
];

export default function Utilization() {
  const { state } = useGame();
  const [days, setDays] = useState(7);

  const kpis = useMemo(() => getFleetUtilizationKPIs(state, days), [state, days]);
  const branches = useMemo(() => getBranchUtilization(state, days), [state, days]);
  const vehicles = useMemo(() => getAllVehicleUtilization(state, days), [state, days]);
  const actions = useMemo(() => getUtilizationActionItems(state, days), [state, days]);

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-medium tracking-tight flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-lime/70" /> Flottenauslastung
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Auslastung, Ineffizienzen und Disponenten-Status pro Fahrzeug und Filiale
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setDays(p.id)}
              className={`px-3 py-2 text-sm font-medium transition ${days === p.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI-Leiste */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={TrendingUp}
          label="Gesamt-Auslastung"
          value={`${kpis.avgUtilization}%`}
          sub={`${kpis.onTrip} von ${kpis.total} Lkw auf Tour`}
          tone={kpis.avgUtilization >= 60 ? "good" : kpis.avgUtilization >= 35 ? "warn" : "bad"}
        />
        <KpiCard
          icon={Truck}
          label="Auf Tour"
          value={kpis.onTrip}
          sub={`${kpis.free} frei · ${kpis.maintenance} Wartung`}
          tone="neutral"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Ineffizient"
          value={kpis.inefficient}
          sub={`${kpis.inefficient} Lkw mit Handlungsbedarf`}
          tone={kpis.inefficient === 0 ? "good" : "bad"}
        />
        <KpiCard
          icon={Clock}
          label="Unzugewiesene Aufträge"
          value={kpis.unassignedOrders}
          sub={kpis.unassignedOrders > 0 ? "Disponenten müssen nachbessern" : "Alles disponiert"}
          tone={kpis.unassignedOrders === 0 ? "good" : "bad"}
        />
      </div>

      {/* Filialübersicht */}
      <section>
        <SectionTitle icon={MapPin} label="Filialübersicht" />
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {branches.map(bd => (
            <BranchCard key={bd.branch.id} data={bd} days={days} />
          ))}
        </div>
      </section>

      {/* Fahrzeug-Auslastung */}
      <section>
        <SectionTitle icon={Truck} label="Fahrzeug-Auslastung" sub="Ineffiziente Fahrzeuge zuerst" />
        <div className="glass border border-white/10 rounded-xl overflow-hidden">
          {/* Desktop-Tabelle */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[140px_1fr_120px_120px_120px_1fr] gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-white/10">
              <span>Fahrzeug</span>
              <span>Auslastung</span>
              <span>Status</span>
              <span className="text-right">Umsatz</span>
              <span className="text-right">Liefer.</span>
              <span>Problem / Hinweis</span>
            </div>
            {vehicles.map(d => (
              <VehicleRowDesktop key={d.vehicle.id} d={d} />
            ))}
            {vehicles.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Keine Fahrzeuge im Bestand.</div>
            )}
          </div>
          {/* Mobile-Karten */}
          <div className="lg:hidden divide-y divide-white/5">
            {vehicles.map(d => (
              <VehicleCardMobile key={d.vehicle.id} d={d} />
            ))}
          </div>
        </div>
      </section>

      {/* Handlungsbedarf */}
      <section>
        <SectionTitle icon={AlertTriangle} label="Handlungsbedarf" sub={`${actions.length} Punkt(e)`} />
        {actions.length === 0 ? (
          <div className="glass border border-lime/20 rounded-xl p-6 flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-lime shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Alle Fahrzeuge effizient eingesetzt</p>
              <p className="text-xs text-muted-foreground">Keine Ineffizienzen erkannt – deine Disponenten arbeiten sauber.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {actions.map((a, i) => (
              <ActionItem key={i} item={a} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------- UI-Komponenten ----------

function KpiCard({ icon: Icon, label, value, sub, tone }) {
  const tones = {
    good: "text-lime",
    warn: "text-amber-300",
    bad: "text-coral",
    neutral: "text-foreground",
  };
  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums mt-1.5 ${tones[tone]}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</div>
    </div>
  );
}

function SectionTitle({ icon: Icon, label, sub }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h2 className="text-base font-medium text-foreground">{label}</h2>
      {sub && <span className="text-xs text-muted-foreground">· {sub}</span>}
    </div>
  );
}

function UtilBar({ value, showLabel = true, className = "" }) {
  const color = value >= 70 ? "bg-lime" : value >= 40 ? "bg-amber-400" : "bg-coral";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden min-w-[60px]">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.max(2, value)}%` }} />
      </div>
      {showLabel && <span className="text-xs tabular-nums text-muted-foreground w-9 text-right shrink-0">{value}%</span>}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    on_trip: { label: "Auf Tour", cls: "bg-lime/15 text-lime" },
    free: { label: "Frei", cls: "bg-white/10 text-muted-foreground" },
    maintenance: { label: "Wartung", cls: "bg-sky-400/15 text-sky-300" },
  };
  const s = map[status] || { label: status, cls: "bg-white/10 text-muted-foreground" };
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>;
}

function FlagBadges({ flags }) {
  const real = flags.filter(f => f.severity !== "info");
  if (real.length === 0) {
    const info = flags.filter(f => f.severity === "info");
    if (info.length === 0) return <span className="text-xs text-muted-foreground/40">—</span>;
    return <span className="text-xs text-sky-300/70 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {info[0].label}</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {real.map((f, i) => (
        <span
          key={i}
          className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 ${
            f.severity === "critical" ? "bg-coral/15 text-coral" : "bg-amber-400/15 text-amber-300"
          }`}
        >
          <AlertTriangle className="w-2.5 h-2.5 shrink-0" /> {f.label}
        </span>
      ))}
    </div>
  );
}

function BranchCard({ data, days }) {
  const { branch, vehicleCount, active, free, maintenance, avgUtilization, inefficientCount, dispatchers } = data;
  const hasIssue = inefficientCount > 0 || dispatchers.some(d => d.backlogCount > 0);

  return (
    <div className={`glass border rounded-xl p-4 transition ${hasIssue ? "border-amber-400/20" : "border-white/10"}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">{branch.name}</h3>
          <p className="text-xs text-muted-foreground">{branch.city}</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${hasIssue ? "bg-amber-400/15 text-amber-300" : "bg-lime/15 text-lime"}`}>
          {hasIssue ? `${inefficientCount} Problem(e)` : "OK"}
        </span>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-muted-foreground">Ø Auslastung</span>
          <span className="text-xs font-medium tabular-nums">{avgUtilization}%</span>
        </div>
        <UtilBar value={avgUtilization} showLabel={false} />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
        <span className="flex items-center gap-1"><Truck className="w-3 h-3 text-lime/60" /> {vehicleCount}</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-lime" /> {active} Tour</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-white/30" /> {free} Frei</span>
        {maintenance > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400" /> {maintenance} Wart.</span>}
      </div>

      {/* Disponenten */}
      {dispatchers.length > 0 ? (
        <div className="space-y-1.5 pt-2 border-t border-white/5">
          {dispatchers.map(d => (
            <div key={d.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <Headset className="w-3 h-3 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground/80 truncate">{d.name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  d.workMode === "autonomous" ? "bg-lime/10 text-lime" :
                  d.workMode === "dispatch_accepted" ? "bg-sky-400/10 text-sky-300" :
                  "bg-amber-400/10 text-amber-300"
                }`}>{d.workModeLabel}</span>
                {d.backlogCount > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-coral/15 text-coral font-medium">{d.backlogCount} offen</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="pt-2 border-t border-white/5 flex items-center gap-1.5 text-xs text-amber-300/70">
          <Users className="w-3 h-3" /> Kein Disponent zugewiesen
        </div>
      )}
    </div>
  );
}

function VehicleRowDesktop({ d }) {
  const hasIssue = d.flags.filter(f => f.severity !== "info").length > 0;
  return (
    <div className={`grid grid-cols-[140px_1fr_120px_120px_120px_1fr] gap-3 px-4 py-2.5 items-center border-b border-white/5 last:border-0 ${hasIssue ? "bg-amber-400/[0.03]" : ""}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <Truck className={`w-3.5 h-3.5 shrink-0 ${hasIssue ? "text-amber-300/60" : "text-lime/60"}`} />
        <span className="text-sm text-foreground/90 truncate">{d.name}</span>
      </div>
      <UtilBar value={d.utilization} />
      <StatusPill status={d.status} />
      <span className="text-xs tabular-nums text-right text-foreground/80">{formatEuro(d.revenue)}</span>
      <span className="text-xs tabular-nums text-right text-muted-foreground">{d.deliveries}</span>
      <FlagBadges flags={d.flags} />
    </div>
  );
}

function VehicleCardMobile({ d }) {
  const hasIssue = d.flags.filter(f => f.severity !== "info").length > 0;
  return (
    <div className={`p-3.5 ${hasIssue ? "bg-amber-400/[0.03]" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Truck className={`w-3.5 h-3.5 ${hasIssue ? "text-amber-300/60" : "text-lime/60"}`} />
          <span className="text-sm font-medium text-foreground/90">{d.name}</span>
          <span className="text-[10px] text-muted-foreground">· {d.branchName}</span>
        </div>
        <StatusPill status={d.status} />
      </div>
      <div className="mb-2">
        <UtilBar value={d.utilization} />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
        <span>{d.deliveries} Lieferung(en)</span>
        <span className="tabular-nums text-foreground/80">{formatEuro(d.revenue)} Umsatz</span>
      </div>
      <FlagBadges flags={d.flags} />
    </div>
  );
}

function ActionItem({ item }) {
  const iconMap = {
    no_driver: { icon: Users, color: "text-coral" },
    condition: { icon: Wrench, color: "text-amber-300" },
    no_order: { icon: Clock, color: "text-amber-300" },
    idle: { icon: Clock, color: "text-amber-300" },
    low_util: { icon: TrendingDown, color: "text-amber-300" },
    dispatcher_mode: { icon: Headset, color: "text-sky-300" },
  };
  const cfg = iconMap[item.kind] || { icon: AlertTriangle, color: "text-amber-300" };
  const Icon = cfg.icon;

  return (
    <Link
      to={item.action.to}
      className="flex items-center gap-3 glass border border-white/10 rounded-xl px-4 py-3 hover:border-white/20 transition group"
    >
      <div className={`w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${cfg.color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
        <p className="text-xs text-muted-foreground truncate">{item.detail}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-muted-foreground hidden sm:inline">{item.action.label}</span>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition" />
      </div>
    </Link>
  );
}