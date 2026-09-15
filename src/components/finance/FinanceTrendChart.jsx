import React, { useState, useMemo } from "react";
import { formatEuro, euroSigned } from "@/lib/gameData";
import {
  getDailyFinancialSeries,
  getFinancialTrendKPIs,
  getProfitTrendDirection,
  getExpenseCategoryTotals,
} from "@/lib/financialTrendData";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, Wallet, ArrowUpRight, ArrowDownRight,
  Percent, Fuel, Users, Building2, Wrench, Banknote,
} from "lucide-react";

const PERIODS = [
  { id: 7, label: "7 Tage" },
  { id: 30, label: "30 Tage" },
  { id: 90, label: "90 Tage" },
];

const COLORS = {
  revenue: "hsl(79 94% 75%)",
  expenses: "hsl(15 100% 81%)",
  cumulative: "hsl(43 74% 66%)",
  avgProfit: "hsl(79 94% 75%)",
};

const EXPENSE_CATEGORIES = [
  { key: "directCosts", label: "Kraftstoff & Maut", stroke: "hsl(192 100% 71%)", fill: "hsl(192 100% 71% / 0.35)", icon: Fuel },
  { key: "personnel", label: "Personal", stroke: "hsl(15 100% 81%)", fill: "hsl(15 100% 81% / 0.35)", icon: Users },
  { key: "operations", label: "Betrieb & Standort", stroke: "hsl(27 87% 67%)", fill: "hsl(27 87% 67% / 0.35)", icon: Building2 },
  { key: "depreciation", label: "Abschreibung", stroke: "hsl(255 100% 81%)", fill: "hsl(255 100% 81% / 0.35)", icon: Wrench },
  { key: "finance", label: "Zinsen", stroke: "hsl(0 70% 60%)", fill: "hsl(0 70% 60% / 0.35)", icon: Banknote },
];

function compactEuro(cents) {
  const v = cents / 100;
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}k €`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k €`;
  return `${Math.round(v)} €`;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass border border-white/15 rounded-lg px-3 py-2 text-xs space-y-1 min-w-[150px]">
      <div className="font-medium text-foreground mb-1">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color || p.fill || p.stroke }} />
            {p.name}
          </span>
          <span className="font-medium tabular-nums text-foreground">{formatEuro(Math.abs(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, sub, accent }) {
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

export default function FinanceTrendChart({ state }) {
  const [period, setPeriod] = useState(30);
  const series = useMemo(() => getDailyFinancialSeries(state, period), [state, period]);
  const kpis = useMemo(() => getFinancialTrendKPIs(series), [series]);
  const trend = useMemo(() => getProfitTrendDirection(series), [series]);
  const expenseTotals = useMemo(() => getExpenseCategoryTotals(series), [series]);

  const hasData = series.length > 0 && (kpis.totalRevenue > 0 || kpis.totalExpenses > 0);
  const xInterval = period <= 7 ? 0 : period <= 30 ? 2 : 6;
  const profitAccent = kpis.netProfit >= 0 ? "text-lime" : "text-coral";

  return (
    <div className="space-y-5">
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
          Noch keine Buchungsdaten vorhanden. Sobald du Aufträge auslieferst und Kosten buchst, erscheint hier der Verlauf.
        </div>
      ) : (
        <>
          {/* Trend insight banner */}
          {trend.direction !== "neutral" && (
            <div className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              trend.direction === "up"
                ? "bg-lime/10 border-lime/20 text-lime"
                : trend.direction === "down"
                ? "bg-coral/10 border-coral/20 text-coral"
                : "bg-white/5 border-white/10 text-muted-foreground"
            }`}>
              {trend.direction === "up" ? <TrendingUp className="w-4 h-4 shrink-0" />
                : trend.direction === "down" ? <TrendingDown className="w-4 h-4 shrink-0" />
                : <Minus className="w-4 h-4 shrink-0" />}
              <span>
                {trend.direction === "up" ? "Tagesgewinn verbessert sich: "
                  : trend.direction === "down" ? "Tagesgewinn verschlechtert sich: "
                  : "Tagesgewinn stabil: "}
                <strong>{euroSigned(trend.diffCents)}</strong> im Vergleich zur Vorperiode.
              </span>
            </div>
          )}

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPICard icon={ArrowUpRight} label="Einnahmen" value={formatEuro(kpis.totalRevenue)} sub={`Ø ${formatEuro(kpis.avgDailyRevenue)}/Tag`} accent="text-lime" />
            <KPICard icon={ArrowDownRight} label="Ausgaben" value={formatEuro(kpis.totalExpenses)} sub={`Ø ${formatEuro(kpis.avgDailyExpenses)}/Tag`} accent="text-coral" />
            <KPICard icon={Wallet} label="Netto-Gewinn" value={formatEuro(kpis.netProfit)} sub={`Ø ${formatEuro(kpis.avgDailyProfit)}/Tag`} accent={profitAccent} />
            <KPICard icon={Percent} label="Marge" value={`${kpis.margin}%`} sub={kpis.bestDay ? `Bester: T${kpis.bestDay.day}` : ""} accent={kpis.margin >= 0 ? "text-lime" : "text-coral"} />
          </div>

          {/* Main chart: Revenue vs Expenses + Cumulative Profit */}
          <ChartCard title="Einnahmen vs. Ausgaben" subtitle="Tägliche Erlöse und Kosten mit kumuliertem Gewinn (rechte Achse) und 7-Tage-Schnitt">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dayLabel" stroke="hsl(150 6% 74%)" fontSize={11} interval={xInterval} />
                <YAxis yAxisId="left" stroke="hsl(150 6% 74%)" fontSize={11} tickFormatter={compactEuro} width={60} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(43 74% 66%)" fontSize={11} tickFormatter={compactEuro} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="revenue" name="Einnahmen" fill={COLORS.revenue} radius={[2, 2, 0, 0]} maxBarSize={40} />
                <Bar yAxisId="left" dataKey="expenses" name="Ausgaben" fill={COLORS.expenses} radius={[2, 2, 0, 0]} maxBarSize={40} />
                <Line yAxisId="left" type="monotone" dataKey="profitAvg7" name="Ø Gewinn (7T)" stroke={COLORS.avgProfit} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="cumulativeProfit" name="Kumulierter Gewinn" stroke={COLORS.cumulative} strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Expense breakdown */}
          <ChartCard title="Ausgaben-Struktur" subtitle="Kostenkategorien im Zeitverlauf (gestapelt)">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="dayLabel" stroke="hsl(150 6% 74%)" fontSize={11} interval={xInterval} />
                <YAxis stroke="hsl(150 6% 74%)" fontSize={11} tickFormatter={compactEuro} width={60} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {EXPENSE_CATEGORIES.map(cat => (
                  <Area key={cat.key} type="monotone" dataKey={cat.key} name={cat.label} stackId="1" stroke={cat.stroke} fill={cat.fill} strokeWidth={1.5} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Expense category summary */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {EXPENSE_CATEGORIES.map(cat => {
              const total = expenseTotals[cat.key];
              const pct = kpis.totalExpenses > 0 ? Math.round(total / kpis.totalExpenses * 100) : 0;
              const Icon = cat.icon;
              return (
                <div key={cat.key} className="glass rounded-xl border border-white/10 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Icon className="w-3.5 h-3.5" style={{ color: cat.stroke }} /> {cat.label}
                  </div>
                  <div className="text-base font-semibold tabular-nums">{formatEuro(total)}</div>
                  <div className="text-xs text-muted-foreground">{pct}% der Ausgaben</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}