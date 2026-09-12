import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import {
  LOAN_INTEREST_RATE_MONTHLY, LOAN_FEE_RATE, LOAN_MIN_CENTS, LOAN_TERMS, DEFAULT_LOAN_TERM,
  generateLoanSchedule, totalInterest, computeCreditLimit, checkFinancingAccess,
} from "@/lib/financingData";
import { Landmark, Check, ChevronDown, ChevronUp, Info, AlertCircle } from "lucide-react";

export default function LoanCalculator() {
  const { state, send, showToast } = useGame();
  const [amountEur, setAmountEur] = useState(5000);
  const [term, setTerm] = useState(DEFAULT_LOAN_TERM);
  const [clearArrears, setClearArrears] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [taking, setTaking] = useState(false);

  const amountCents = amountEur * 100;
  const fee = Math.round(amountCents * LOAN_FEE_RATE);
  const netPayout = amountCents - fee;
  const schedule = useMemo(() => generateLoanSchedule(amountCents, term, LOAN_INTEREST_RATE_MONTHLY), [amountCents, term]);
  const totalInt = totalInterest(schedule);
  const totalCost = totalInt + fee;

  const limit = useMemo(() => computeCreditLimit(state), [state]);
  const access = useMemo(() => checkFinancingAccess(state, { type: "loan", amountCents, termMonths: term, clearArrears }), [state, amountCents, term, clearArrears]);

  const hasSevereArrears = (access.severeArrears || []).length > 0;

  async function takeLoan() {
    setTaking(true);
    try {
      const r = await send("takeLoan", { amountCents, termMonths: term, clearArrears });
      showToast(`Kredit aufgenommen: ${(r.principalCents / 100).toFixed(0)} €, Auszahlung ${(r.netPayout / 100).toFixed(2)} €`, "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setTaking(false); }
  }

  return (
    <div className="space-y-4">
      <div className="glass border border-white/10 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Landmark className="w-4 h-4 text-lime/70" /> Kredit aufnehmen</div>

        {/* Kreditrahmen */}
        <div className="text-xs space-y-1 bg-surface-2/50 rounded-lg p-3 border border-white/5">
          <div className="flex justify-between"><span className="text-muted-foreground">Verfügbarer Rahmen</span><span className="text-lime font-medium">{formatEuro(limit.available)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Eigenkapital</span><span className="text-foreground/70">{formatEuro(limit.equity)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Gesamtrahmen</span><span className="text-foreground/70">{formatEuro(limit.totalLimit)}</span></div>
          {limit.outstanding > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Bereits ausstehend</span><span className="text-coral">{formatEuro(limit.outstanding)}</span></div>}
        </div>

        {/* Betrag */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Kreditbetrag (€)</label>
          <input type="number" min={5000} max={1000000} step={500} value={amountEur}
            onChange={e => setAmountEur(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full rounded-lg bg-surface-2 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-lime/40" />
          <div className="flex gap-1 flex-wrap">
            {[5000, 25000, 50000, 100000].map(v => (
              <button key={v} onClick={() => setAmountEur(v)} className={`text-xs px-2 py-1 rounded transition ${amountEur === v ? "bg-lime/15 text-lime" : "bg-white/5 hover:bg-white/10 text-muted-foreground"}`}>{v.toLocaleString("de-DE")} €</button>
            ))}
          </div>
          {limit.available < LOAN_MIN_CENTS && <div className="text-xs text-coral">Verfügbarer Rahmen ({formatEuro(limit.available)}) liegt unter dem Mindestbetrag ({formatEuro(LOAN_MIN_CENTS)}).</div>}
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

        {/* Schwere Rückstände: Option zur Begleichung */}
        {hasSevereArrears && (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 space-y-2">
            <div className="text-xs font-medium text-amber-300">Schwere Finanzierungsrückstände erkannt</div>
            {(access.severeArrears || []).map((a, i) => (
              <div key={i} className="text-xs text-amber-300/80">
                {a.type === "leasing" ? `Leasing ${a.contractId}` : `Kredit ${a.loanId}`}: offen {formatEuro(a.overdueCents)}, {a.daysOverdue} Tage überfällig
              </div>
            ))}
            <label className="flex items-center gap-2 text-xs text-foreground/80 cursor-pointer">
              <input type="checkbox" checked={clearArrears} onChange={e => setClearArrears(e.target.checked)} className="rounded" />
              Kredit zur Begleichung der Rückstände verwenden
            </label>
          </div>
        )}

        {/* Hinweise (nicht sperrend) */}
        {access.notices.map((n, i) => (
          <div key={i} className="text-xs text-amber-300/80 flex items-start gap-1.5"><Info className="w-3 h-3 mt-0.5 shrink-0" /> {n}</div>
        ))}

        {/* Harte Blockaden */}
        {access.blockingReasons.map((r, i) => (
          <div key={i} className="text-xs text-coral flex items-start gap-1.5"><AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {r}</div>
        ))}

        <button onClick={takeLoan} disabled={!access.allowed || taking}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime text-ink font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]">
          {taking ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
          {clearArrears ? "Kredit aufnehmen und Rückstände begleichen" : "Kredit verbindlich aufnehmen"}
        </button>
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