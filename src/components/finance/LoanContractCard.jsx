import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { ChevronDown, ChevronUp, TrendingDown, Check } from "lucide-react";

export default function LoanContractCard({ loan }) {
  const { send, showToast } = useGame();
  const [expanded, setExpanded] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [repaying, setRepaying] = useState(false);

  const totalDebt = loan.remainingPrincipalCents + loan.accruedInterestCents + (loan.overduePrincipalCents || 0) + (loan.overdueInterestCents || 0);
  const nextRate = loan.schedule[loan.paidInstallments];
  const isOverdue = (loan.overduePrincipalCents || 0) > 0 || (loan.overdueInterestCents || 0) > 0;

  async function doRepay() {
    const amt = Math.round(parseFloat(repayAmount) * 100);
    if (!amt || amt <= 0) { showToast("Betrag eingeben", "error"); return; }
    setRepaying(true);
    try {
      const r = await send("earlyRepayLoan", { loanId: loan.id, amountCents: amt });
      showToast(`Sondertilgung: ${formatEuro(amt)} — Restschuld ${formatEuro(r.remainingPrincipalCents)}`, "success");
      setRepayAmount("");
    } catch (e) { showToast(e.message, "error"); }
    finally { setRepaying(false); }
  }

  return (
    <div className={`glass border rounded-xl p-4 space-y-3 ${isOverdue ? "border-coral/30" : "border-white/10"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{loan.id}</span>
          {loan.status === "paid_off" && <span className="text-xs px-1.5 py-0.5 rounded bg-lime/20 text-lime">Getilgt</span>}
          {isOverdue && <span className="text-xs px-1.5 py-0.5 rounded bg-coral/20 text-coral">Rückstand</span>}
        </div>
        <span className="text-xs text-muted-foreground">{formatGameTime(loan.startMin)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-muted-foreground">Kreditsumme:</span> <span className="text-foreground/80">{formatEuro(loan.principalCents)}</span></div>
        <div><span className="text-muted-foreground">Restschuld:</span> <span className="text-foreground/80">{formatEuro(loan.remainingPrincipalCents)}</span></div>
        <div><span className="text-muted-foreground">Aufgelaufener Zins:</span> <span className="text-amber-300/70">{formatEuro(loan.accruedInterestCents)}</span></div>
        <div><span className="text-muted-foreground">Gesamtschuld:</span> <span className={totalDebt > 0 ? "text-coral" : "text-lime"}>{formatEuro(totalDebt)}</span></div>
        <div><span className="text-muted-foreground">Raten bezahlt:</span> <span className="text-foreground/80">{loan.paidInstallments}/{loan.termMonths}</span></div>
        <div><span className="text-muted-foreground">Nächste Rate:</span> <span className="text-foreground/80">{loan.nextDueMin ? formatGameTime(loan.nextDueMin) : "—"}</span></div>
      </div>

      {nextRate && loan.status === "active" && (
        <div className="text-xs bg-surface-2/50 rounded-lg p-2 border border-white/5">
          <div className="flex justify-between"><span className="text-muted-foreground">Nächste Rate</span><span className="text-foreground/80">{formatEuro(nextRate.totalCents)}</span></div>
          <div className="flex justify-between pl-3"><span className="text-muted-foreground/60">davon Tilgung</span><span className="text-foreground/60">{formatEuro(nextRate.principalCents)}</span></div>
          <div className="flex justify-between pl-3"><span className="text-muted-foreground/60">davon Zins</span><span className="text-amber-300/60">{formatEuro(nextRate.interestCents)}</span></div>
        </div>
      )}

      {isOverdue && (
        <div className="text-xs text-coral bg-coral/5 rounded-lg p-2 border border-coral/20">
          Überfällig: {formatEuro(loan.overduePrincipalCents || 0)} Tilgung, {formatEuro(loan.overdueInterestCents || 0)} Zinsen
        </div>
      )}

      {/* Sondertilgung */}
      {loan.status === "active" && totalDebt > 0 && (
        <div className="flex gap-2">
          <input type="number" placeholder="Sondertilgung €" value={repayAmount}
            onChange={e => setRepayAmount(e.target.value)}
            className="flex-1 rounded-lg bg-surface-2 border border-white/10 px-2.5 py-1.5 text-xs focus:outline-none focus:border-lime/40" />
          <button onClick={doRepay} disabled={repaying}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40 transition active:scale-95">
            {repaying ? <span className="w-3 h-3 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" /> : <TrendingDown className="w-3 h-3" />} Tilgen
          </button>
        </div>
      )}

      {/* Zahlungsplan */}
      <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-1 text-xs text-lime/80 hover:text-lime transition">
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Zahlungsverlauf
      </button>
      {expanded && (
        <div className="max-h-48 overflow-y-auto scrollbar-none">
          {loan.payments.length === 0 ? <div className="text-xs text-muted-foreground p-2">Noch keine Zahlungen.</div> : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground"><tr><th className="text-left p-1.5">Rate</th><th className="text-right p-1.5">Datum</th><th className="text-right p-1.5">Tilgung</th><th className="text-right p-1.5">Zins</th><th className="text-right p-1.5">Status</th></tr></thead>
              <tbody>
                {loan.payments.map((p, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="p-1.5">{p.installment}</td>
                    <td className="p-1.5 text-right text-muted-foreground">{formatGameTime(p.atMin)}</td>
                    <td className="p-1.5 text-right tabular-nums">{formatEuro(p.principalPaidCents)}</td>
                    <td className="p-1.5 text-right tabular-nums text-amber-300/60">{formatEuro(p.interestPaidCents)}</td>
                    <td className="p-1.5 text-right">{p.status === "paid" ? <Check className="w-3 h-3 text-lime inline" /> : <span className="text-coral">Teil</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}