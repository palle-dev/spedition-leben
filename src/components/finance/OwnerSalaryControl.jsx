import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { Wallet, Loader2 } from "lucide-react";

// Steuerung der täglichen Geschäftsführer-Entnahme (Gehalt).
// Der Betrag wird jeden Spieltag vom Firmenkonto auf das Privatkonto überwiesen.
export default function OwnerSalaryControl() {
  const { state, send, showToast } = useGame();
  const current = state.private.dailyWithdrawalCents ?? 10000;
  const [amount, setAmount] = useState((current / 100).toString());
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    const cents = Math.round(parseFloat(amount) * 100);
    if (isNaN(cents) || cents < 0 || cents > 100000) {
      showToast("Betrag muss zwischen 0 € und 1.000 € liegen.", "error");
      return;
    }
    setSubmitting(true);
    try {
      await send("setOwnerSalary", { dailyWithdrawalCents: cents });
      showToast("Tägliche Entnahme aktualisiert.", "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  const monthlyTotal = (current / 100) * 30;

  return (
    <div className="glass border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Wallet className="w-4 h-4 text-coral/70" />
        <h3 className="font-medium text-sm">Geschäftsführergehalt</h3>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 items-end">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tägliche Entnahme</div>
          <div className="text-lg font-semibold tabular-nums">{formatEuro(current)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Monatlich (30 Tage)</div>
          <div className="text-lg font-semibold tabular-nums">{formatEuro(Math.round(monthlyTotal * 100))}</div>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder={(current / 100).toString()}
            min="0"
            max="1000"
            className="flex-1 min-w-0 bg-surface-2/50 border border-white/10 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-coral/30"
          />
          <button
            onClick={save}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-coral/15 text-coral border border-coral/30 text-sm font-medium hover:bg-coral/25 transition disabled:opacity-40 flex items-center gap-1.5 shrink-0"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Setzen
          </button>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground/60 mt-2">
        Wird täglich vom Firmenkonto auf das Privatkonto überwiesen. 0 € stoppt die Entnahme.
      </div>
    </div>
  );
}