import React, { useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { TrendingUp, Truck } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { getRevenueTrend, getFleetUtilizationTrend } from "@/lib/officeData";
import { formatEuro, dayOf } from "@/lib/gameData";

// Grafische Auswertung für die Büro-Seite: Umsatz- und Flottenauslastung
// der letzten 30 Tage auf einen Blick.
export default function OfficeTrends() {
  const { state } = useGame();

  const revenue = useMemo(() => getRevenueTrend(state, 30), [state]);
  const utilization = useMemo(() => getFleetUtilizationTrend(state, 30), [state]);

  const totalRevenue = revenue.reduce((s, d) => s + d.cents, 0);
  const avgUtilization = utilization.length
    ? Math.round(utilization.reduce((s, d) => s + d.percent, 0) / utilization.length)
    : 0;

  const hasRevenue = revenue.some(d => d.cents > 0);

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
              <p className="text-[11px] text-muted-foreground/60">Letzte 30 Tage</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{formatEuro(totalRevenue)}</div>
            <div className="text-[11px] text-muted-foreground/60">Gesamtumsatz</div>
          </div>
        </div>

        <div className="h-44 mt-3">
          {hasRevenue ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenue} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--lime))" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="hsl(var(--lime))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--text) / 0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  interval={5}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (v >= 1000 ? (v / 1000).toFixed(0) + "k" : v)}
                  width={36}
                />
                <Tooltip content={<RevenueTooltip />} cursor={{ stroke: "hsl(var(--lime))", strokeWidth: 1, strokeOpacity: 0.3 }} />
                <Area
                  type="monotone"
                  dataKey="cents"
                  stroke="hsl(var(--lime))"
                  strokeWidth={2}
                  fill="url(#revGrad)"
                  dot={false}
                  activeDot={{ r: 3, fill: "hsl(var(--lime))" }}
                />
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
              <p className="text-[11px] text-muted-foreground/60">Letzte 30 Tage · Ø</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{avgUtilization}%</div>
            <div className="text-[11px] text-muted-foreground/60">Durchschnitt</div>
          </div>
        </div>

        <div className="h-44 mt-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={utilization} margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--text) / 0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval={5}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => v + "%"}
                width={36}
              />
              <Tooltip content={<UtilTooltip />} cursor={{ stroke: "hsl(var(--coral))", strokeWidth: 1, strokeOpacity: 0.3 }} />
              <Line
                type="monotone"
                dataKey="percent"
                stroke="hsl(var(--coral))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, fill: "hsl(var(--coral))" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function RevenueTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-muted-foreground/70 mb-0.5">Tag {d.day}</div>
      <div className="font-medium tabular-nums">{formatEuro(d.cents)}</div>
    </div>
  );
}

function UtilTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="text-muted-foreground/70 mb-0.5">Tag {d.day}</div>
      <div className="font-medium tabular-nums">{d.percent}% Auslastung</div>
      <div className="text-muted-foreground/60">{d.active} von {d.total} Lkw auf Tour</div>
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