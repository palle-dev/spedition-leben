import React, { useMemo } from "react";
import { formatEuro } from "@/lib/gameData";
import { formatKEuro } from "@/lib/forecastData";
import { getBalanceSheet, getPnL, getCashFlow, getLiquidityProjection, periodOf, periodStartMin, periodEndMin } from "@/lib/accountingData";
import { Wallet, Home, TrendingUp, TrendingDown, Scale, Banknote, ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import BranchFinanceSection from "@/components/finance/BranchFinanceSection";
import OwnerSalaryControl from "@/components/finance/OwnerSalaryControl";

export default function FinanceOverview({ state }) {
  const acc = state.accounting || {};
  const currentPeriod = periodOf(state.gameTime);
  const periodStart = periodStartMin(currentPeriod);
  const periodEnd = periodEndMin(currentPeriod);

  const balanceSheet = useMemo(() => getBalanceSheet(state), [state]);
  const pnl = useMemo(() => getPnL(state, periodStart, state.gameTime), [state, periodStart]);
  const cashFlow = useMemo(() => getCashFlow(state, periodStart, state.gameTime), [state, periodStart]);
  const liquidity = useMemo(() => getLiquidityProjection(state, 7), [state]);

  const openItems = (acc.openItems || []).filter(i => i.remainingCents > 0);
  const totalOpen = openItems.reduce((s, i) => s + i.remainingCents, 0);

  const cashFlowData = useMemo(() => {
    // Letzte 7 Tage Cashflow
    const days = [];
    for (let d = 6; d >= 0; d--) {
      const dayStart = state.gameTime - d * 1440 - (state.gameTime % 1440);
      const dayEnd = dayStart + 1440;
      const cf = getCashFlow(state, dayStart, dayEnd);
      days.push({
        day: "T" + (Math.floor(dayStart / 1440) + 1),
        ein: Math.max(0, cf.total),
        aus: Math.min(0, cf.total),
      });
    }
    return days;
  }, [state]);

  return (
    <div className="space-y-5">
      {/* KPI-Karten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Wallet} label="Firmenkonto" value={formatEuro(state.company.accountCents)} accent="lime" />
        <KpiCard icon={Home} label="Privatkonto" value={formatEuro(state.private.accountCents)} accent="coral" />
        <KpiCard
          icon={Scale}
          label="Bilanzsumme"
          value={formatEuro(balanceSheet.total.assets || 0)}
          sub={`EK ${formatEuro(balanceSheet.total.equity || 0)}`}
        />
        <KpiCard
          icon={pnl.result >= 0 ? TrendingUp : TrendingDown}
          label="Monatsergebnis"
          value={euroSigned(pnl.result)}
          sub={`Periode ${currentPeriod}`}
          accent={pnl.result >= 0 ? "lime" : "red"}
        />
      </div>

      {/* Geschäftsführergehalt */}
      <OwnerSalaryControl />

      {/* Cashflow-Chart */}
      <div className="glass border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Banknote className="w-4 h-4 text-lime/70" /> Cashflow (letzte 7 Spieltage)
          </h3>
          <span className={`text-sm tabular-nums font-medium ${cashFlow.total >= 0 ? "text-lime" : "text-red-300"}`}>
            Σ {euroSigned(cashFlow.total)}
          </span>
        </div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cashFlowData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-text))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-text))" }} axisLine={false} tickLine={false} tickFormatter={formatKEuro} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--line) / 0.1)", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => formatEuro(v)}
              />
              <ReferenceLine y={0} stroke="hsl(var(--line) / 0.15)" />
              <Bar dataKey="ein" fill="hsl(var(--lime))" radius={[3, 3, 0, 0]} name="Einnahmen" />
              <Bar dataKey="aus" fill="hsl(0 70% 50%)" radius={[0, 0, 3, 3]} name="Ausgaben" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Liquiditätsvorschau */}
      <div className="glass border border-white/10 rounded-xl p-4">
        <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-coral/70" /> Liquiditätsvorschau (7 Tage)
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <Stat label="Aktueller Saldo" value={formatEuro(liquidity.currentBalance)} />
          <Stat label="Erwartete Einnahmen" value={formatEuro(liquidity.expectedRevenue)} icon={ArrowUpRight} iconClass="text-lime" />
          <Stat label="Geplante Ausgaben" value={"−" + formatEuro(liquidity.projectedExpenses)} icon={ArrowDownRight} iconClass="text-red-300" />
          <Stat
            label="Prognose Saldo"
            value={formatEuro(liquidity.projectedBalance)}
            highlight={liquidity.projectedBalance >= 0 ? "lime" : "red"}
          />
        </div>
        {totalOpen > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-red-500/10 border border-red-400/20 px-3 py-2 text-sm">
            <span className="text-red-200/80">Offene Verbindlichkeiten</span>
            <span className="tabular-nums text-red-200 font-medium">{formatEuro(totalOpen)}</span>
          </div>
        )}
      </div>

      {/* Filialvergleich */}
      <BranchFinanceSection state={state} />

      {/* G&V Kurzübersicht */}
      <div className="glass border border-white/10 rounded-xl p-4">
        <h3 className="font-medium text-sm mb-3">Gewinn- und Verlustrechnung (Periode {currentPeriod})</h3>
        {pnl.lines.length === 0 ? (
          <div className="text-sm text-muted-foreground/50 py-4 text-center">Noch keine Buchungen in dieser Periode.</div>
        ) : (
          <div className="space-y-1">
            {pnl.lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
                <span className={l.type === "revenue" ? "text-lime/80" : "text-red-300/80"}>{l.name}</span>
                <span className="tabular-nums">{l.type === "revenue" ? "+" : "−"}{formatEuro(Math.abs(l.amountCents))}</span>
              </div>
            ))}
            <div className="flex items-center justify-between font-medium pt-2 mt-1 border-t border-white/10">
              <span>Ergebnis</span>
              <span className={`tabular-nums ${pnl.result >= 0 ? "text-lime" : "text-red-300"}`}>{euroSigned(pnl.result)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub = undefined, accent = undefined }) {
  const color = accent === "lime" ? "text-lime" : accent === "coral" ? "text-coral" : accent === "red" ? "text-red-300" : "text-foreground";
  return (
    <div className="glass border border-white/10 rounded-xl p-3 lg:p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`w-3.5 h-3.5 ${color}`} /> {label}
      </div>
      <div className={`text-lg lg:text-xl font-medium mt-1.5 tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground/60 mt-0.5">{sub}</div>}
    </div>
  );
}

function Stat({ label, value, icon: Icon = undefined, iconClass = undefined, highlight = undefined }) {
  const color = highlight === "lime" ? "text-lime" : highlight === "red" ? "text-red-300" : "text-foreground";
  return (
    <div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className={`w-3 h-3 ${iconClass || ""}`} />} {label}
      </div>
      <div className={`text-base font-medium tabular-nums mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function euroSigned(cents) {
  return (cents >= 0 ? "+" : "−") + formatEuro(Math.abs(cents));
}