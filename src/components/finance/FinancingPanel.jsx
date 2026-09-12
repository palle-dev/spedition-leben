import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { Landmark, Truck, FileText } from "lucide-react";
import LoanCalculator from "./LoanCalculator";
import LoanContractCard from "./LoanContractCard";
import LeasingSection from "./LeasingSection";

const SUBTABS = [
  { id: "credit", label: "Kredit", icon: Landmark },
  { id: "leasing", label: "Leasing", icon: Truck },
  { id: "contracts", label: "Meine Verträge", icon: FileText },
];

export default function FinancingPanel() {
  const { state, send } = useGame();
  const [subtab, setSubtab] = useState("credit");
  const [limit, setLimit] = useState(null);

  useEffect(() => {
    send("getCreditLimit", {}).then(r => setLimit(r.limit)).catch(() => {});
  }, [state.gameTime, state.company?.accountCents, (state.loans || []).length]);

  // Inject limit into state for LoanCalculator
  if (state) state._creditLimit = limit;

  const activeLoans = (state.loans || []).filter(l => l.status === "active");
  const activeLeases = (state.leasingContracts || []).filter(c => c.status === "active" || c.status === "ending");
  const allLoans = state.loans || [];
  const allLeases = state.leasingContracts || [];

  return (
    <div className="space-y-4">
      {/* Zusammenfassung */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard label="Firmenbank" value={formatEuro(state.company?.accountCents || 0)} />
        <SummaryCard label="Kreditschulden" value={formatEuro(activeLoans.reduce((s, l) => s + l.remainingPrincipalCents + l.accruedInterestCents + (l.overdueInterestCents || 0) + (l.overduePrincipalCents || 0), 0))} negative />
        <SummaryCard label="Verfügbarer Rahmen" value={limit ? formatEuro(limit.available) : "…"} />
        <SummaryCard label="Aktive Leasingverträge" value={activeLeases.length.toString()} />
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
        {SUBTABS.map(t => {
          const Icon = t.icon;
          const active = subtab === t.id;
          const badge = t.id === "contracts" ? (allLoans.length + allLeases.length) : null;
          return (
            <button key={t.id} onClick={() => setSubtab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition active:scale-95 ${active ? "bg-lime text-ink" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
              <Icon className="w-4 h-4" /> {t.label}
              {badge != null && badge > 0 && <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${active ? "bg-ink/20 text-ink" : "bg-white/10 text-foreground/60"}`}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* Inhalt */}
      {subtab === "credit" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <LoanCalculator />
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">Aktive Kredite</div>
            {activeLoans.length === 0 ? <div className="text-xs text-muted-foreground/50 p-4">Keine aktiven Kredite.</div> : activeLoans.map(l => <LoanContractCard key={l.id} loan={l} />)}
          </div>
        </div>
      )}
      {subtab === "leasing" && <LeasingSection />}
      {subtab === "contracts" && (
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-2">Kreditverträge</div>
            {allLoans.length === 0 ? <div className="text-xs text-muted-foreground/50 p-4">Keine Kreditverträge.</div> : allLoans.map(l => <LoanContractCard key={l.id} loan={l} />)}
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground mb-2">Leasingverträge</div>
            {allLeases.length === 0 ? <div className="text-xs text-muted-foreground/50 p-4">Keine Leasingverträge.</div> :
              <div className="text-xs text-muted-foreground/50 p-4">Siehe Leasing-Tab für aktive Verträge mit Aktionen.</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, negative }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-lg font-medium mt-1 tabular-nums ${negative ? "text-coral" : "text-foreground/90"}`}>{value}</div>
    </div>
  );
}