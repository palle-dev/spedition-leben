import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import {
  getVehicleEfficiency, getDriverEfficiency,
  getEfficiencyKPIs, getEfficiencyActionItems,
} from "@/lib/efficiencyData";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Gauge, Route, AlertTriangle, ChevronRight, Package, TrendingDown,
} from "lucide-react";

const PERIODS = [
  { id: 7, label: "7 Tage" },
  { id: 30, label: "30 Tage" },
  { id: 90, label: "90 Tage" },
];

const SEGMENTS = [
  { key: "Produktiv", color: "hsl(79 94% 75%)" },
  { key: "Leerfahrt", color: "hsl(192 100% 71%)" },
  { key: "Be-/Entladung", color: "hsl(15 100% 81%)" },
  { key: "Ruhe/Pause", color: "hsl(190 15% 40%)" },
];

function fmtHours(min) { return `${(min / 60).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`; }
function fmtKm(km) { return `${Math.round(km).toLocaleString("de-DE")} km`; }

function ratioColor(ratio, good, warn) {
  if (ratio <= good) return "text-lime";
  if (ratio <= warn) return "text-yellow-400";
  return "text-coral";
}

function ChartTooltip({ active = undefined, payload = undefined, label = undefined }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="glass border border-white/15 rounded-lg px-3 py-2 text-xs space-y-1 min-w-[160px]">
      <div className="font-medium text-foreground mb-1">{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums text-foreground">{fmtHours(p.value * 60)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-3 pt-1 border-t border-white/10">
        <span className="text-muted-foreground">Gesamt</span>
        <span className="font-medium tabular-nums text-foreground">{fmtHours(total * 60)}</span>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, sub, accent = undefined }) {
  return (
    <div className="glass rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <div className={`text-xl lg:text-2xl font-semibold tabular-nums ${accent || ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="glass rounded-xl border border-white/10 p-4 lg:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// Mini horizontal stacked bar für Tabellenzeilen.
function TimeBar({ productive, empty, handling, idle }) {
  const segs = [
    { v: productive, c: "hsl(79 94% 75%)" },
    { v: empty, c: "hsl(192 100% 71%)" },
    { v: handling, c: "hsl(15 100% 81%)" },
    { v: idle, c: "hsl(190 15% 40%)" },
  ];
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-white/5 w-full max-w-[120px]">
      {segs.map((s, i) => s.v > 0 && (
        <div key={i} style={{ width: `${s.v * 100}%`, background: s.c }} className="shrink-0" />
      ))}
    </div>
  );
}

function VehicleTable({ data }) {
  return (
    <div className="glass rounded-xl border border-white/10 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-white/10">
              <th className="text-left font-medium px-4 py-3">Fahrzeug</th>
              <th className="text-left font-medium px-3 py-3 hidden lg:table-cell">Filiale</th>
              <th className="text-right font-medium px-3 py-3">Touren</th>
              <th className="text-right font-medium px-3 py-3">km</th>
              <th className="text-right font-medium px-3 py-3">Leer-km</th>
              <th className="text-left font-medium px-3 py-3 min-w-[120px]">Zeitverteilung</th>
              <th className="text-right font-medium px-3 py-3">Produktiv</th>
              <th className="text-right font-medium px-3 py-3 hidden md:table-cell">Erlös/km</th>
            </tr>
          </thead>
          <tbody>
            {data.map(v => {
              const total = v.total || 1;
              const handlingR = (v.loading + v.unloading) / total;
              const emptyR = v.emptyDrive / total;
              const idleR = (v.breaks + v.rest) / total;
              return (
                <tr key={v.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="px-4 py-3 font-medium text-foreground">{v.name}</td>
                  <td className="px-3 py-3 text-muted-foreground hidden lg:table-cell">{v.branchName}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{v.tripCount}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtKm(v.totalKm)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${ratioColor(v.emptyRatio, 0.2, 0.35)}`}>
                    {Math.round(v.emptyRatio * 100)}%
                  </td>
                  <td className="px-3 py-3">
                    <TimeBar productive={v.productiveRatio} empty={emptyR} handling={handlingR} idle={idleR} />
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums ${ratioColor(0.25 - v.productiveRatio, 0.1, 0.05)}`}>
                    {Math.round(v.productiveRatio * 100)}%
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell">
                    {formatEuro(v.revenuePerKm)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DriverTable({ data }) {
  return (
    <div className="glass rounded-xl border border-white/10 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-white/10">
              <th className="text-left font-medium px-4 py-3">Fahrer</th>
              <th className="text-left font-medium px-3 py-3 hidden lg:table-cell">Filiale</th>
              <th className="text-right font-medium px-3 py-3">Touren</th>
              <th className="text-right font-medium px-3 py-3">km</th>
              <th className="text-right font-medium px-3 py-3">Leer-km</th>
              <th className="text-left font-medium px-3 py-3 min-w-[120px]">Zeitverteilung</th>
              <th className="text-right font-medium px-3 py-3">Produktiv</th>
              <th className="text-right font-medium px-3 py-3 hidden md:table-cell">Erlös/Std</th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => {
              const total = d.total || 1;
              const handlingR = (d.loading + d.unloading) / total;
              const emptyR = d.emptyDrive / total;
              const idleR = (d.breaks + d.rest) / total;
              return (
                <tr key={d.id} className="border-b border-white/5 hover:bg-white/5 transition">
                  <td className="px-4 py-3 font-medium text-foreground">{d.name}</td>
                  <td className="px-3 py-3 text-muted-foreground hidden lg:table-cell">{d.branchName}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{d.tripCount}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{fmtKm(d.totalKm)}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${ratioColor(d.emptyRatio, 0.2, 0.35)}`}>
                    {Math.round(d.emptyRatio * 100)}%
                  </td>
                  <td className="px-3 py-3">
                    <TimeBar productive={d.productiveRatio} empty={emptyR} handling={handlingR} idle={idleR} />
                  </td>
                  <td className={`px-3 py-3 text-right tabular-nums ${ratioColor(0.25 - d.productiveRatio, 0.1, 0.05)}`}>
                    {Math.round(d.productiveRatio * 100)}%
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums hidden md:table-cell">
                    {formatEuro(d.revenuePerHour)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Efficiency() {
  const { state } = useGame();
  const [period, setPeriod] = useState(30);

  const vehicleEff = useMemo(() => getVehicleEfficiency(state, period), [state, period]);
  const driverEff = useMemo(() => getDriverEfficiency(state, period), [state, period]);
  const kpis = useMemo(() => getEfficiencyKPIs(state, period), [state, period]);
  const actions = useMemo(() => getEfficiencyActionItems(vehicleEff, driverEff), [vehicleEff, driverEff]);

  const hasData = kpis.tripCount > 0;

  const vehicleChart = vehicleEff.map(v => ({
    name: v.name,
    Produktiv: +(v.loadedDrive / 60).toFixed(1),
    Leerfahrt: +(v.emptyDrive / 60).toFixed(1),
    "Be-/Entladung": +((v.loading + v.unloading) / 60).toFixed(1),
    "Ruhe/Pause": +((v.breaks + v.rest) / 60).toFixed(1),
  }));
  const driverChart = driverEff.map(d => ({
    name: d.name,
    Produktiv: +(d.loadedDrive / 60).toFixed(1),
    Leerfahrt: +(d.emptyDrive / 60).toFixed(1),
    "Be-/Entladung": +((d.loading + d.unloading) / 60).toFixed(1),
    "Ruhe/Pause": +((d.breaks + d.rest) / 60).toFixed(1),
  }));

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1600px] mx-auto space-y-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-medium tracking-tight">Effizienz</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Zeitverteilung von Fahrern und Fahrzeugen im Detail – sieh, wo Zeit auf der Strecke bleibt
        </p>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2">
        {PERIODS.map(p => {
          const active = period === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition active:scale-95 ${
                active ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground hover:bg-white/5 border border-white/10"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {!hasData ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Noch keine Touren mit Phasendaten in diesem Zeitraum. Sobald Fahrten abgeschlossen sind, erscheint hier die detaillierte Zeitverteilung.
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPICard icon={Route} label="Leerfahrquote" value={`${Math.round(kpis.emptyRatio * 100)}%`}
              sub={`${fmtKm(kpis.totalKm * kpis.emptyRatio)} von ${fmtKm(kpis.totalKm)}`}
              accent={ratioColor(kpis.emptyRatio, 0.2, 0.35)} />
            <KPICard icon={Gauge} label="Produktive Zeit" value={`${Math.round(kpis.productiveRatio * 100)}%`}
              sub="Anteil Beladefahrt an Gesamtzeit"
              accent={ratioColor(0.25 - kpis.productiveRatio, 0.1, 0.05)} />
            <KPICard icon={Package} label="Rüstzeit" value={`${Math.round(kpis.handlingRatio * 100)}%`}
              sub="Be- und Entladung" />
            <KPICard icon={TrendingDown} label="Erlös pro km" value={formatEuro(kpis.revenuePerKm)}
              sub={`${kpis.tripCount} Touren · ${fmtHours(kpis.totalHours * 60)}`} />
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {SEGMENTS.map(s => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} /> {s.key}
              </span>
            ))}
          </div>

          {/* Vehicle time chart */}
          {vehicleChart.length > 0 && (
            <ChartCard title="Zeitverteilung pro Fahrzeug" subtitle="Stunden je Tätigkeit – sieh wo Zeit ungenutzt bleibt">
              <ResponsiveContainer width="100%" height={Math.max(220, vehicleChart.length * 50)}>
                <BarChart data={vehicleChart} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" stroke="hsl(150 6% 74%)" fontSize={11} tickFormatter={v => `${v}h`} />
                  <YAxis type="category" dataKey="name" stroke="hsl(150 6% 74%)" fontSize={11} width={70} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  {SEGMENTS.map((s, i) => (
                    <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} radius={i === SEGMENTS.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Vehicle table */}
          {vehicleEff.length > 0 && <VehicleTable data={vehicleEff} />}

          {/* Driver time chart */}
          {driverChart.length > 0 && (
            <ChartCard title="Zeitverteilung pro Fahrer" subtitle="Stunden je Tätigkeit – welcher Fahrer hat die meiste produktive Zeit">
              <ResponsiveContainer width="100%" height={Math.max(220, driverChart.length * 50)}>
                <BarChart data={driverChart} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" stroke="hsl(150 6% 74%)" fontSize={11} tickFormatter={v => `${v}h`} />
                  <YAxis type="category" dataKey="name" stroke="hsl(150 6% 74%)" fontSize={11} width={100} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  {SEGMENTS.map((s, i) => (
                    <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} radius={i === SEGMENTS.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Driver table */}
          {driverEff.length > 0 && <DriverTable data={driverEff} />}

          {/* Action items */}
          {actions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-coral" /> Optimierungs-Potenzial
              </h3>
              {actions.map((a, i) => (
                <Link key={i} to={a.action.to}
                  className="flex items-center gap-3 glass rounded-xl border border-white/10 p-3 lg:p-4 hover:border-coral/30 transition group">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{a.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{a.detail}</div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-coral transition shrink-0">
                    {a.action.label} <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}