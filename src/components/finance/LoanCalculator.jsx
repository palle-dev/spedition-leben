import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, dayOf, clockOf } from "@/lib/gameData";
import {
  LOAN_INTEREST_RATE_MONTHLY, LOAN_FEE_RATE, LOAN_MIN_CENTS, LOAN_TERMS,
  generateLoanSchedule, totalInterest,
} from "@/lib/financingData";
import { Landmark, FileText, TrendingDown, Check, ChevronDown, ChevronUp } from "lucide-react";

export default function LoanCalculator() {
  const { state, send, showToast } = useGame();
  const [amountEur, setAmountEur] = useState(5000);
  const [term, setTerm] = useState(12);
  const [showSchedule, setShowSchedule] = useState(false);
  const [taking, setTaking] = useState(false);

  const amountCents = amountEur * 100;
  const fee = Math.round(amountCents * LOAN_FEE_RATE);
  const netPayout = amountCents - fee;
  const schedule = useMemo(() => generateLoanSchedule(amountCents, term, LOAN_INTEREST_RATE_MONTHLY), [amountCents, term]);
  const totalInt = totalInterest(schedule);
  const totalCost = totalInt + fee;

  const limit = state._creditLimit;
  const canTake = amountCents >= LOAN_MIN_CENTS && amountCents <= (limit?.available || 0) && !taking;

  async function takeLoan() {
    setTaking(true);
    try {
      const r = await send("takeLoan", { amountCents, termMonths: term });
      showToast(`Kredit aufgenommen: ${(r.principalCents / 100).toFixed(0)} €, Auszahlung ${(r.netPayout / 100).toFixed(2)} €`, "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setTaking(false); }
  }

  return (
    <div className="space-y-4">
      <div className="glass border border-white/10 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Landmark className="w-4 h-4 text-lime/70" /> Kredit aufnehmen</div>

        {/* Kreditrahmen */}
        {limit && (
          <div className="text-xs space-y-1 bg-surface-2/50 rounded-lg p-3 border border-white/5">
            <div className="flex justify-between"><span className="text-muted-foreground">Verfügbarer Rahmen</span><span className="text-lime font-medium">{formatEuro(limit.available)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Eigenkapital</span><span className="text-foreground/70">{formatEuro(limit.equity)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Operativer CF (30 Tage)</span><span className="text-foreground/70">{formatEuro(limit.cashFlow30)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Gesamtrahmen</span><span className="text-foreground/70">{formatEuro(limit.totalLimit)}</span></div>
            {limit.outstanding > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Bereits ausstehend</span><span className="text-coral">{formatEuro(limit.outstanding)}</span></div>}
          </div>
        )}

        {/* Betrag */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Kreditbetrag (€)</label>
          <input type="number" min={5000} max={1000000} step={500} value={amountEur}
            onChange={e => setAmountEur(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full rounded-lg bg-surface-2 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-lime/40" />
          <div className="flex gap-1">
            {[5000, 25000, 50000, 100000].map(v => (
              <button key={v} onClick={() => setAmountEur(v)} className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-muted-foreground transition">{v.toLocaleString("de-DE")} €</button>
            ))}
          </div>
        </div>

        {/* Laufzeit */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Laufzeit</label>
          <div className="flex gap-2">
            {LOAN_TERMS.map(t => (
              <button key={t} onClick={() => setTerm(t)} className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${term === t ? "bg-lime text-ink" : "bg-surface-2 text-muted-foreground hover:bg-white/10"}`}>{t} Monate</button>
            ))}
          </div>
        </div>

        {/* Zusammenfassung */}
        <div className="space-y-1.5 text-xs border-t border-white/10 pt-3">
          <Row label="Kreditbetrag" value={formatEuro(amountCents)} />
          <Row label="Abschlussgebühr (1 %)" value={formatEuro(fee)} negative />
          <Row label="Netto-Auszahlung" value={formatEuro(netPayout)} strong />
          <Row label="Erste Rate fällig" value={formatGameTime(state.gameTime + 30 * 1440)} />
          <Row label="Monatszins" value={`${(LOAN_INTEREST_RATE_MONTHLY * 100).toFixed(2)} %`} />
          <Row label="Gesamte Zinsen (planmäßig)" value={formatEuro(totalInt)} negative />
          <Row label="Gesamte Kosten (Zinsen + Gebühr)" value={formatEuro(totalCost)} negative strong />
          <Row label="Firmenbank nach Auszahlung" value={formatEuro(state.company.accountCents + netPayout)} />
          <Row label="Kreditschuld nach Auszahlung" value={formatEuro(amountCents)} negative />
        </div>

        {/* Ratenplan */}
        <button onClick={() => setShowSchedule(s => !s)} className="flex items-center gap-1 text-xs text-lime/80 hover:text-lime transition">
          {showSchedule ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Vollständigen Ratenplan anzeigen
        </button>
        {showSchedule && (
          <div className="max-h-64 overflow-y-auto scrollbar-none rounded-lg border border-white/10">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface-2 text-muted-foreground">
                <tr><th className="text-left p-2 font-medium">Rate</th><th className="text-right p-2 font-medium">Tilgung</th><th className="text-right p-2 font-medium">Zins</th><th className="text-right p-2 font-medium">Gesamt</th><th className="text-right p-2 font-medium">Restschuld</th></tr>
              </thead>
              <tbody>
                {schedule.map(r => (
                  <tr key={r.installment} className="border-t border-white/5">
                    <td className="p-2">{r.installment}</td>
                    <td className="p-2 text-right tabular-nums">{formatEuro(r.principalCents)}</td>
                    <td className="p-2 text-right tabular-nums text-amber-300/70">{formatEuro(r.interestCents)}</td>
                    <td className="p-2 text-right tabular-nums">{formatEuro(r.totalCents)}</td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{formatEuro(r.remainingPrincipalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button onClick={takeLoan} disabled={!canTake}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime text-ink font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]">
          {taking ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <Check className="w-4 h-4" />} Kredit verbindlich aufnehmen
        </button>
        {amountCents < LOAN_MIN_CENTS && <div className="text-xs text-coral text-center">Mindestbetrag 5.000 €</div>}
        {amountCents > (limit?.available || 0) && <div className="text-xs text-coral text-center">Übersteigt verfügbaren Kreditrahmen</div>}
      </div>
    </div>
  );
}

function Row({ label, value, strong, negative }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""} ${negative ? "text-coral" : "text-foreground/80"}`}>{value}</span>
    </div>
  );
}