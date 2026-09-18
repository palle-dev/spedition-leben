import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { getKpiHistory, getKpiSummary, getTrainingEvents, getTrainingImpact } from "@/lib/kpiHistoryData";
import Portrait from "@/components/ui/Portrait";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot, Legend,
} from "recharts";
import { TrendingDown, Package, Euro, Target, GraduationCap, ArrowUp, ArrowDown } from "lucide-react";

// KPI-Dashboard: visualisiert Auftrags-Effizienz über die Zeit
// und zeigt den Einfluss abgeschlossener Weiterbildungen.
export default function KpiDashboardTab() {
  const { state } = useGame();
  const [period, setPeriod] = useState(30);

  const history = useMemo(() => getKpiHistory(state, period).map(h => ({ ...h, successRatePct: h.successRate != null ? Math.round(h.successRate * 100) : null })), [state, period]);
  const summary = useMemo(() => getKpiSummary(history), [history]);
  const trainingEvents = useMemo(() => getTrainingEvents(state, period), [state, period]);
  const impact = useMemo(() => getTrainingImpact(state, trainingEvents), [state, trainingEvents]);

  const successPct = Math.round(summary.successRate * 100);
  const hasData = summary.total > 0;

  return (
    <div className="space-y-4">
      {/* Perioden-Auswahl */}
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Effizienz-Entwicklung</h3>
        <div className="flex gap-1">
          {[7, 14, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setPeriod(d)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                period === d ? "bg-lime/15 text-lime border border-lime/30" : "bg-white/5 text-muted-foreground border border-white/10 hover:text-foreground"
              }`}
            >
              {d}T
            </button>
          ))}
        </div>
      </div>

      {/* KPI-Summenkarten */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard label="Lieferungen" value={summary.deliveries} icon={Package} color="text-lime" />
        <KpiCard label="Erfolgsquote" value={`${successPct}%`} icon={Target} color={successPct >= 70 ? "text-lime" : successPct >= 50 ? "text-amber-300" : "text-coral"} />
        <KpiCard label="Umsatz" value={formatEuro(summary.revenue)} icon={Euro} color="text-sky-300" />
        <KpiCard label="Verfallen + Gescheitert" value={summary.failed + summary.expired} icon={TrendingDown} color={summary.failed + summary.expired > 0 ? "text-coral" : "text-muted-foreground"} />
      </div>

      {/* Trend-Chart */}
      <div className="glass border border-white/10 rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Tägliche Auftrags-KPIs</div>
        {hasData ? (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={history} margin={{ top: 5, right: 10, bottom: 5, left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="dayLabel" tick={{ fontSize: 9, fill: "hsl(var(--muted-text))" }} interval="preserveStartEnd" minTickGap={25} />
              <YAxis yAxisId="count" tick={{ fontSize: 9, fill: "hsl(var(--muted-text))" }} allowDecimals={false} />
              <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-text))" }} tickFormatter={v => `${v}%`} />
              <Tooltip content={<KpiTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="count" dataKey="deliveries" name="Lieferungen" fill="hsl(79 94% 75%)" radius={[2, 2, 0, 0]} barSize={6} />
              <Bar yAxisId="count" dataKey="failed" name="Gescheitert" fill="hsl(0 70% 50%)" radius={[2, 2, 0, 0]} barSize={6} />
              <Bar yAxisId="count" dataKey="expired" name="Verfallen" fill="hsl(43 74% 66%)" radius={[2, 2, 0, 0]} barSize={6} />
              <Line yAxisId="rate" type="monotone" dataKey="successRatePct" name="Erfolgsquote" stroke="hsl(192 100% 71%)" strokeWidth={2} dot={false} />
              {trainingEvents.map((ev, i) => (
                <ReferenceDot key={i} x={ev.dayLabel} y={100} yAxisId="rate" r={5} fill="hsl(255 100% 81%)" stroke="hsl(var(--ink))" strokeWidth={1} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Noch keine Auftragsdaten im gewählten Zeitraum.
          </div>
        )}
        {trainingEvents.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-[hsl(255_100%_81%)]" /> Weiterbildungs-Abschluss
          </div>
        )}
      </div>

      {/* Weiterbildungs-Effekte: Vorher/Nachher-Vergleich */}
      {impact.length > 0 && (
        <div className="glass border border-white/10 rounded-xl p-4">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
            <GraduationCap className="w-3.5 h-3.5" /> Weiterbildungs-Effekte auf die Effizienz
          </div>
          <div className="space-y-2">
            {impact.map((ev, i) => {
              const deltaPct = Math.round(ev.delta * 100);
              const positive = deltaPct > 0;
              const person = (state.drivers || []).find(d => d.name === ev.personName) || (state.employees || []).find(e => e.name === ev.personName);
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-2/40 border border-white/5">
                  {person && <Portrait portraitId={person.portraitId} name={person.name} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{ev.label}</div>
                    <div className="text-[10px] text-muted-foreground">{ev.personName} · {formatGameTime(ev.minute)}</div>
                  </div>
                  <div className="flex items-center gap-4 text-right shrink-0">
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Vorher</div>
                      <div className="text-xs font-medium tabular-nums">{Math.round(ev.beforeRate * 100)}%</div>
                    </div>
                    <div className={`flex items-center gap-0.5 ${positive ? "text-lime" : deltaPct < 0 ? "text-coral" : "text-muted-foreground"}`}>
                      {positive ? <ArrowUp className="w-3 h-3" /> : deltaPct < 0 ? <ArrowDown className="w-3 h-3" /> : null}
                      <span className="text-xs font-medium tabular-nums">{positive ? "+" : ""}{deltaPct}%</span>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">Nachher</div>
                      <div className="text-xs font-medium tabular-nums text-lime">{Math.round(ev.afterRate * 100)}%</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
        <Icon className={`w-3 h-3 ${color}`} /> {label}
      </div>
      <div className={`text-lg font-medium tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function KpiTooltip({ active = undefined, payload = undefined, label = undefined }) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="glass border border-white/15 rounded-lg p-2.5 text-xs space-y-1">
      <div className="font-medium text-foreground">Tag {data.day}</div>
      <div className="text-lime">Lieferungen: {data.deliveries}</div>
      <div className="text-red-300">Gescheitert: {data.failed}</div>
      <div className="text-amber-300">Verfallen: {data.expired}</div>
      {data.successRate != null && (
        <div className="text-sky-300">Erfolgsquote: {Math.round(data.successRate * 100)}%</div>
      )}
      {data.revenue > 0 && (
        <div className="text-foreground/70">Umsatz: {formatEuro(data.revenue)}</div>
      )}
    </div>
  );
}