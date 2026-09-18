import React from "react";
import { formatPct } from "@/lib/investmentData";
import { TrendingUp, TrendingDown } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from "recharts";

// Kompakter Kursverlauf-Chart für ein Investment-Instrument.
// Zeigt die letzten Preispunkte als Sparkline mit %-Änderung.
export default function PriceChart({ priceHistory = [], changePct = 0 }) {
  if (!priceHistory || priceHistory.length < 2) return null;

  const data = priceHistory.map((p, i) => ({ i, v: p / 100 }));
  const up = changePct >= 0;
  const color = up ? "hsl(var(--lime))" : "hsl(0 70% 50%)";

  return (
    <div className="bg-surface-2/30 border border-white/5 rounded-lg p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Kursverlauf ({priceHistory.length} Ticks)</span>
        <span className={`text-[10px] tabular-nums flex items-center gap-0.5 ${up ? "text-lime" : "text-red-300"}`}>
          {up ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
          {formatPct(changePct)}
        </span>
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <YAxis domain={["auto", "auto"]} hide />
            <Tooltip
              contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--line) / 0.1)", borderRadius: 8, fontSize: 11 }}
              formatter={(v) => typeof v === "number" ? v.toFixed(2) + " €" : "—"}
              labelFormatter={() => ""}
            />
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}