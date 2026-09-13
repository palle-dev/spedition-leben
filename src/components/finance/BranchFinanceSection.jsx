import React, { useMemo } from "react";
import { formatEuro } from "@/lib/gameData";
import { getBranchFinancials, periodOf, periodStartMin, periodEndMin } from "@/lib/accountingData";
import { Building2, Crown, MapPin } from "lucide-react";

// Filialvergleich in der Finanzübersicht: Umsatz, direkte Kosten,
// Personalkosten, Standortkosten und Gewinn pro aktiver Filiale.
export default function BranchFinanceSection({ state }) {
  const currentPeriod = periodOf(state.gameTime);
  const pStart = periodStartMin(currentPeriod);
  const pEnd = Math.min(periodEndMin(currentPeriod), state.gameTime);

  const rows = useMemo(() => getBranchFinancials(state, pStart, pEnd), [state, pStart, pEnd]);

  if (rows.length === 0) {
    return (
      <div className="glass border border-white/10 rounded-xl p-4">
        <h3 className="font-medium text-sm mb-1">Filialvergleich</h3>
        <p className="text-sm text-muted-foreground/50 py-4 text-center">Keine aktiven Filialen.</p>
      </div>
    );
  }

  const totals = rows.reduce((acc, r) => {
    acc.revenue += r.revenue;
    acc.directCosts += r.directCosts;
    acc.personnelCosts += r.personnelCosts;
    acc.branchCosts += r.branchCosts;
    acc.totalCosts += r.totalCosts;
    acc.profit += r.profit;
    return acc;
  }, { revenue: 0, directCosts: 0, personnelCosts: 0, branchCosts: 0, totalCosts: 0, profit: 0 });

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Building2 className="w-4 h-4 text-lime/70" /> Filialvergleich
        </h3>
        <span className="text-xs text-muted-foreground/60">Periode {currentPeriod}</span>
      </div>

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="text-left font-medium px-2 py-2">Standort</th>
              <th className="text-right font-medium px-2 py-2">Umsatz</th>
              <th className="text-right font-medium px-2 py-2">Direkte Kosten</th>
              <th className="text-right font-medium px-2 py-2">Personal</th>
              <th className="text-right font-medium px-2 py-2">Standort</th>
              <th className="text-right font-medium px-2 py-2">Gewinn</th>
              <th className="text-right font-medium px-2 py-2">Marge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.branch.id} className="border-b border-white/5 hover:bg-white/[0.02] transition">
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {r.branch.isHeadquarters
                      ? <Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      : <Building2 className="w-3.5 h-3.5 text-lime/60 shrink-0" />}
                    <div>
                      <div className="font-medium leading-tight">{r.branch.name}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5" /> {r.branch.city} · {r.vehicleCount} Lkw · {r.driverCount + r.employeeCount} Personal
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">{formatEuro(r.revenue)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-red-300/70">−{formatEuro(r.directCosts)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-red-300/70">−{formatEuro(r.personnelCosts)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-red-300/70">−{formatEuro(r.branchCosts)}</td>
                <td className={`px-2 py-2.5 text-right tabular-nums font-medium ${r.profit >= 0 ? "text-lime" : "text-red-300"}`}>
                  {r.profit >= 0 ? "+" : "−"}{formatEuro(Math.abs(r.profit))}
                </td>
                <td className={`px-2 py-2.5 text-right tabular-nums text-xs ${r.margin >= 0 ? "text-lime/80" : "text-red-300/80"}`}>
                  {r.revenue > 0 ? `${r.margin}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10 bg-white/[0.02]">
              <td className="px-2 py-2.5 font-medium text-xs uppercase tracking-wider text-muted-foreground">Gesamt</td>
              <td className="px-2 py-2.5 text-right tabular-nums font-medium">{formatEuro(totals.revenue)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-red-300/70">−{formatEuro(totals.directCosts)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-red-300/70">−{formatEuro(totals.personnelCosts)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums text-red-300/70">−{formatEuro(totals.branchCosts)}</td>
              <td className={`px-2 py-2.5 text-right tabular-nums font-medium ${totals.profit >= 0 ? "text-lime" : "text-red-300"}`}>
                {totals.profit >= 0 ? "+" : "−"}{formatEuro(Math.abs(totals.profit))}
              </td>
              <td className="px-2 py-2.5" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}