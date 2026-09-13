import React, { useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, Truck } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { getRevenueTrendByBranch, getFleetUtilizationTrendByBranch } from "@/lib/officeData";
import { formatEuro } from "@/lib/gameData";

// Grafische Auswertung für die Büro-Seite: Umsatz- und Flottenauslastung
// der letzten 30 Tage, aufgeschlüsselt nach Filiale.
export default function OfficeTrends() {
  const { state } = useGame();

  const rev = useMemo(() => getRevenueTrendByBranch(state, 30), [state]);
  const util = useMemo(() => getFleetUtilizationTrendByBranch(state, 30), [state]);

  const totalRevenue = useMemo(() => rev.data.reduce((s, d) => s + d.total, 0), [rev]);
  const hasRevenue = rev.data.some(d => d.total > 0);
  const hasMultipleBranches = rev.branches.length > 1;

  // Unternehmensweite Durchschnittsauslastung: gewichtet nach Fahrzeugzahl pro Tag.
  const avgUtilization = useMemo(() => {
    if (!util.data.length || !util.branches.length) return 0;
    let sumPct = 0, count = 0;
    for (const d of util.data) {
      let totalActive = 0, totalVehicles = 0;
      for (const bk of util.branches) {
        totalActive += d[bk.key + "_active"] || 0;
        totalVehicles += d[bk.key + "_total"] || 0;
      }
      if (totalVehicles > 0) { sumPct += Math.round((totalActive / totalVehicles) * 100); count++; }
    }
    return count > 0 ? Math.round(sumPct / count) : 0;
  }, [util]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Umsatzentwicklung */}
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-lime/10 grid place-items-center">
              <TrendingUp className="w-4 h-4 text-lime" />
            </div>
            <div>
              <h3 className="text-sm font-medium tracking-tight">Umsatzentwicklung</h3>
              <p className="text-[11px] text-muted-foreground/60">Letzte 30 Tage · alle Filialen</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{formatEuro(totalRevenue)}</div>
            <div className="text-[11px] text-muted-foreground/60">Gesamtumsatz</div>
          </div>
        </div>

        {hasMultipleBranches && (
          <div className="flex flex-wrap gap-3 mt-2 mb-1">
            {rev.branches.map(bk => (
              <span key={bk.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: bk.color }} /> {bk.name}
              </span>
            ))}
          </div>
        )}

        <div className="h-44 mt-3">
          {hasRevenue ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={rev.data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  {rev.branches.map(bk => (
                    <linearGradient key={bk.key} id={"rev_" + bk.key} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={bk.color} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={bk.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--text) / 0.06)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={5} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)} width={36} />
                <Tooltip content={<RevenueTooltip branches={rev.branches} />} cursor={{ stroke: "hsl(var(--lime))", strokeWidth: 1, strokeOpacity: 0.3 }} />
                {rev.branches.map(bk => (
                  <Area key={bk.key} type="monotone" dataKey={bk.key} name={bk.name} stroke={bk.color} strokeWidth={1.5} fill={"url(#rev_" + bk.key + ")"} stackId="1" dot={false} activeDot={{ r: 3, fill: bk.color }} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart label="Noch keine Umsätze in diesem Zeitraum." />
          )}
        </div>
      </div>

      {/* Flottenauslastung */}
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-coral/10 grid place-items-center">
              <Truck className="w-4 h-4 text-coral" />
            </div>
            <div>
              <h3 className="text-sm font-medium tracking-tight">Flottenauslastung</h3>
              <p className="text-[11px] text-muted-foreground/60">Letzte 30 Tage · alle Filialen · Ø</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{avgUtilization}%</div>
            <div className="text-[11px] text-muted-foreground/60">Durchschnitt</div>
          </div>
        </div>

        {hasMultipleBranches && (
          <div className="flex flex-wrap gap-3 mt-2 mb-1">
            {util.branches.map(bk => (
              <span key={bk.key} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: bk.color }} /> {bk.name}
              </span>
            ))}
          </div>
        )}

        <div className="h-44 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={util.data} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--text) / 0.06)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} interval={5} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} tickFormatter={(v) => v + "%"} width={36} />
              <Tooltip content={<UtilTooltip branches={util.branches} />} cursor={{ stroke: "hsl(var(--coral))", strokeWidth: 1, strokeOpacity: 0.3 }} />
              {util.branches.map(bk => (
                <Line key={bk.key} type="monotone" dataKey={bk.key} name={bk.name} stroke={bk.color} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: bk.color }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function RevenueTooltip({ active, payload, branches }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
      <div className="text-muted-foreground/70">Tag {d.day}</div>
      {branches.map(bk => {
        const val = d[bk.key];
        if (!val) return null;
        return (
          <div key={bk.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ background: bk.color }} /> {bk.name}
            </span>
            <span className="font-medium tabular-nums">{formatEuro(val)}</span>
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/10">
        <span className="text-muted-foreground">Gesamt</span>
        <span className="font-semibold tabular-nums">{formatEuro(d.total)}</span>
      </div>
    </div>
  );
}

function UtilTooltip({ active, payload, branches }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl space-y-1">
      <div className="text-muted-foreground/70">Tag {d.day}</div>
      {branches.map(bk => {
        const total = d[bk.key + "_total"];
        if (!total) return null;
        const pct = d[bk.key];
        const act = d[bk.key + "_active"];
        return (
          <div key={bk.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ background: bk.color }} /> {bk.name}
            </span>
            <span className="font-medium tabular-nums">{pct}% · {act}/{total}</span>
          </div>
        );
      })}
    </div>
  );
}

function EmptyChart({ label }) {
  return (
    <div className="h-full grid place-items-center text-sm text-muted-foreground/50">
      {label}
    </div>
  );
}