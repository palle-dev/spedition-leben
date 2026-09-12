import React from "react";
import { useNavigate } from "react-router-dom";
import { formatEuro } from "@/lib/gameData";
import { getLiquidity, getOperationalResult, getOrderStats, getFleetStats } from "@/lib/officeData";
import { Wallet, TrendingUp, Package, Truck, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

// Vier primäre Kennzahlen mit klarer Hierarchie und Kontext.
// Reduziert von sechs kleinen auf vier substantielle KPI-Kacheln.
export default function OfficeKPIs({ state, period }) {
  const navigate = useNavigate();
  const liquidity = getLiquidity(state);
  const opResult = getOperationalResult(state, period);
  const orders = getOrderStats(state);
  const fleet = getFleetStats(state);

  const kpis = [
    {
      icon: Wallet,
      label: "Firmenliquidität",
      value: formatEuro(liquidity.bankBalance),
      primary: liquidity.netAvailable >= 0,
      lines: [
        { label: "Netto verfügbar", value: formatEuro(liquidity.netAvailable), tone: liquidity.netAvailable < 0 ? "red" : "default" },
        { label: "Offene Kosten", value: formatEuro(liquidity.openCompanyCosts), tone: liquidity.openCompanyCosts > 0 ? "amber" : "muted" },
      ],
      to: "/finanzen",
    },
    {
      icon: TrendingUp,
      label: opResult.hasData ? `Operatives Ergebnis · ${opResult.period.label}` : "Einzahlungen / Auszahlungen",
      value: opResult.hasData ? formatEuro(opResult.result) : "—",
      primary: opResult.hasData && opResult.result >= 0,
      trend: opResult.hasData ? (opResult.result >= 0 ? "up" : "down") : null,
      lines: opResult.hasData ? [
        { label: "Umsatz", value: formatEuro(opResult.revenue), tone: "default" },
        { label: "Kosten", value: formatEuro(opResult.expenses), tone: "muted" },
      ] : [
        { label: "Hinweis", value: "Noch keine Buchungsdaten", tone: "muted" },
      ],
      to: "/finanzen",
    },
    {
      icon: Package,
      label: "Auftragslage",
      value: `${orders.total}`,
      primary: orders.unassigned === 0,
      lines: [
        { label: "Angebote offen", value: `${orders.offered}`, tone: orders.offered > 0 ? "default" : "muted" },
        { label: "Aktiv unterwegs", value: `${orders.active}`, tone: "default" },
        { label: "Unzugewiesen", value: `${orders.unassigned}`, tone: orders.unassigned > 0 ? "amber" : "muted" },
      ],
      alert: orders.unassigned > 0 ? `${orders.unassigned} Auftrag${orders.unassigned > 1 ? "e" : ""} wartet auf Disposition` : null,
      to: "/auftraege",
    },
    {
      icon: Truck,
      label: "Flotteneinsatz",
      value: `${fleet.total}`,
      primary: fleet.criticalCondition === 0,
      lines: [
        { label: "Frei", value: `${fleet.byStatus.free}`, tone: "lime" },
        { label: "Unterwegs", value: `${fleet.byStatus.on_trip}`, tone: "default" },
        { label: "Wartung", value: `${fleet.byStatus.maintenance}`, tone: fleet.byStatus.maintenance > 0 ? "sky" : "muted" },
      ],
      alert: fleet.criticalCondition > 0 ? `${fleet.criticalCondition} Lkw im kritischen Zustand` : null,
      to: "/fuhrpark",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((kpi, i) => {
        const Icon = kpi.icon;
        return (
          <button
            key={i}
            onClick={() => navigate(kpi.to)}
            className="text-left glass border border-white/10 rounded-xl p-4 hover:border-lime/20 transition group"
          >
            {/* Kopf */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <Icon className="w-3.5 h-3.5" /> {kpi.label}
              </div>
              {kpi.trend === "up" && <ArrowUpRight className="w-3.5 h-3.5 text-lime" />}
              {kpi.trend === "down" && <ArrowDownRight className="w-3.5 h-3.5 text-red-300" />}
              {kpi.trend === null && kpi.primary && <Minus className="w-3.5 h-3.5 text-muted-foreground/30" />}
            </div>

            {/* Hauptwert */}
            <div className={`text-2xl lg:text-[28px] font-semibold tabular-nums leading-none mb-3 ${
              kpi.tone === "red" ? "text-red-300" : kpi.primary ? "text-foreground" : "text-foreground"
            }`}>
              {kpi.value}
            </div>

            {/* Detailzeilen */}
            <div className="space-y-1.5 border-t border-white/5 pt-2.5">
              {kpi.lines.map((line, j) => (
                <div key={j} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className={`tabular-nums font-medium ${
                    line.tone === "red" ? "text-red-300" :
                    line.tone === "amber" ? "text-amber-300" :
                    line.tone === "lime" ? "text-lime" :
                    line.tone === "sky" ? "text-sky-300" :
                    line.tone === "muted" ? "text-muted-foreground/60" :
                    "text-foreground/80"
                  }`}>{line.value}</span>
                </div>
              ))}
            </div>

            {/* Alert */}
            {kpi.alert && (
              <div className="mt-2.5 text-[11px] text-amber-300 bg-amber-500/5 border border-amber-400/15 rounded-lg px-2.5 py-1.5">
                {kpi.alert}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}