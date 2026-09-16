import React from "react";
import { formatKEuro } from "@/lib/forecastData";

// Liquiditätskurve — zeigt den Kontostandverlauf über den Horizont.
// Verwendet Recharts (bereits installiert) für die Darstellung.
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from "recharts";

export default function ForecastChart({ forecast }) {
  if (!forecast || !forecast.days || forecast.days.length === 0) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Keine Daten</div>;
  }

  const data = forecast.days.map(d => ({
    day: "T" + d.day,
    Firma: d.companyEndBalance,
    Privat: d.privateEndBalance,
  }));

  // Startsaldo als erstes Datenpunkt
  data.unshift({
    day: "Jetzt",
    Firma: forecast.company.startBalance,
    Privat: forecast.private.startBalance,
  });

  const minBalance = Math.min(
    ...data.map(d => Math.min(d.Firma, d.Privat)),
  );
  const maxBalance = Math.max(
    ...data.map(d => Math.max(d.Firma, d.Privat)),
  );
  const padding = Math.max(10000, Math.round((maxBalance - minBalance) * 0.1));

  return (
    <div className="w-full h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorFirma" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--lime))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--lime))" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorPrivat" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--coral))" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(var(--coral))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--text) / 0.08)" />
          <XAxis
            dataKey="day"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => formatKEuro(v)}
            domain={[minBalance - padding, maxBalance + padding]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--surface))",
              border: "1px solid hsl(var(--text) / 0.1)",
              borderRadius: "0.5rem",
              fontSize: "12px",
            }}
            labelStyle={{ color: "hsl(var(--text))" }}
            formatter={(value) => formatKEuro(value) + " (" + (value / 100).toFixed(2) + " €)"}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px" }}
            iconType="line"
          />
          <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="2 2" />
          <Area
            type="monotone"
            dataKey="Firma"
            stroke="hsl(var(--lime))"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorFirma)"
            name="Firmenkonto"
          />
          <Area
            type="monotone"
            dataKey="Privat"
            stroke="hsl(var(--coral))"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorPrivat)"
            name="Privatkonto"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}