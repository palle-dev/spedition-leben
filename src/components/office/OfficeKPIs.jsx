import React from "react";
import { useNavigate } from "react-router-dom";
import { formatEuro } from "@/lib/gameData";
import { getLiquidity, getOperationalResult, getOrderStats, getFleetStats, getPersonnelStats, getDecisions } from "@/lib/officeData";
import { Wallet, TrendingUp, Package, Truck, Users, AlertTriangle } from "lucide-react";

// Priorisierte Kennzahlenzeile über den vollständigen Bestand.
export default function OfficeKPIs({ state, period }) {
  const navigate = useNavigate();
  const liquidity = getLiquidity(state);
  const opResult = getOperationalResult(state, period);
  const orders = getOrderStats(state);
  const fleet = getFleetStats(state);
  const personnel = getPersonnelStats(state);
  const decisions = getDecisions(state);

  const kpis = [
    {
      icon: Wallet, label: "Firmenliquidität",
      value: formatEuro(liquidity.bankBalance),
      sub: `Verfügbar: ${formatEuro(liquidity.netAvailable)}`,
      detail: liquidity.openCompanyCosts > 0 ? `Offen: ${formatEuro(liquidity.openCompanyCosts)}` : null,
      tone: liquidity.netAvailable < 0 ? "red" : "default",
      to: "/finanzen",
    },
    {
      icon: TrendingUp, label: opResult.hasData ? "Operatives Ergebnis" : "Einzahlungen/Auszahlungen",
      value: opResult.hasData ? formatEuro(opResult.result) : "—",
      sub: opResult.hasData
        ? `Umsatz ${formatEuro(opResult.revenue)} · Kosten ${formatEuro(opResult.expenses)}`
        : "Noch keine Vergleichsdaten",
      tone: opResult.hasData ? (opResult.result >= 0 ? "lime" : "red") : "muted",
      to: "/finanzen",
    },
    {
      icon: Package, label: "Auftragsbestand",
      value: `${orders.total}`,
      sub: `${orders.offered} Angebote · ${orders.unassigned} unzugewiesen · ${orders.active} aktiv`,
      detail: orders.unassigned > 0 ? `${orders.unassigned} wartet auf Disposition` : null,
      tone: orders.unassigned > 0 ? "amber" : "default",
      to: "/auftraege",
    },
    {
      icon: Truck, label: "Flotteneinsatz",
      value: `${fleet.total}`,
      sub: `${fleet.byStatus.free} frei · ${fleet.byStatus.on_trip} unterwegs · ${fleet.byStatus.maintenance} Wartung`,
      detail: fleet.byOwnership.leased > 0 ? `${fleet.byOwnership.owned} eigene · ${fleet.byOwnership.leased} geleast` : null,
      tone: fleet.criticalCondition > 0 ? "amber" : "default",
      to: "/fuhrpark",
    },
    {
      icon: Users, label: "Personal",
      value: `${personnel.total}`,
      sub: `${personnel.present} verfügbar · ${personnel.sick} krank · ${personnel.vacation} Urlaub`,
      detail: personnel.noticeGiven > 0 ? `${personnel.noticeGiven} Austritt angekündigt` : null,
      tone: personnel.criticalSatisfaction > 0 ? "amber" : "default",
      to: "/personal",
    },
    {
      icon: AlertTriangle, label: "Dringende Entscheidungen",
      value: `${decisions.length}`,
      sub: decisions.length > 0 ? decisions[0].title : "Alles ruhig",
      tone: decisions.length > 0 ? "amber" : "lime",
      to: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      {kpis.map((kpi, i) => {
        const Icon = kpi.icon;
        const toneClass = kpi.tone === "red" ? "text-red-300" : kpi.tone === "amber" ? "text-amber-300"
          : kpi.tone === "lime" ? "text-lime" : kpi.tone === "muted" ? "text-muted-foreground" : "text-foreground";
        return (
          <button
            key={i}
            onClick={kpi.to ? () => navigate(kpi.to) : undefined}
            className={`text-left glass border border-white/10 rounded-xl p-3 hover:border-white/20 transition ${kpi.to ? "cursor-pointer" : "cursor-default"}`}
          >
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
              <Icon className="w-3 h-3" /> {kpi.label}
            </div>
            <div className={`text-lg lg:text-xl font-medium tabular-nums ${toneClass}`}>{kpi.value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{kpi.sub}</div>
            {kpi.detail && <div className="text-[10px] text-amber-300 mt-0.5">{kpi.detail}</div>}
          </button>
        );
      })}
    </div>
  );
}