import React, { useMemo, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { getDepotSummary, formatCents, formatQty, formatPricePlain, formatPct } from "@/lib/investmentData";
import { ArrowLeftRight, X, Loader2 } from "lucide-react";

// Depot-Ansicht: Positionen, Umbuchung, Position schließen.
export default function DepotView({ state, depotId }) {
  const { send, showToast } = useGame();
  const summary = useMemo(() => getDepotSummary(state, depotId), [state, depotId]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDir, setTransferDir] = useState("in");
  const [closing, setClosing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!summary) return null;

  const depotLabel = depotId === "company" ? "Firmendepot" : "Privatdepot";
  const bankLabel = depotId === "company" ? "Firmenbank" : "Privatbank";
  const bankCents = depotId === "company" ? state.company.accountCents : state.private.accountCents;

  async function doTransfer() {
    const cents = Math.round(parseFloat(transferAmount) * 100);
    if (!cents || cents <= 0) { showToast("Betrag ungültig", "error"); return; }
    setSubmitting(true);
    try {
      if (transferDir === "in") {
        await send("depositToDepot", { depotId, amountCents: cents });
        showToast(`${(cents / 100).toFixed(2)} € in ${depotLabel} eingezahlt`, "success");
      } else {
        await send("withdrawFromDepot", { depotId, amountCents: cents });
        showToast(`${(cents / 100).toFixed(2)} € auf ${bankLabel} zurücküberwiesen`, "success");
      }
      setTransferAmount("");
      setTransferOpen(false);
    } catch (err) { showToast(err.message, "error"); }
    finally { setSubmitting(false); }
  }

  async function closePosition(instId, availableQty, type) {
    if (closing) return;
    setClosing(instId);
    try {
      const res = await send("placeInvestmentOrder", {
        depotId, instrumentId: instId, side: "sell", orderType: "market",
        qty: availableQty, timeInForce: "GTC", closePosition: true,
      });
      if (res?.order?.status === "filled") {
        showToast("Position vollständig geschlossen", "success");
      } else if (res?.order?.status === "open") {
        showToast("Verkaufsorder platziert, wartet auf Marktöffnung", "info");
      } else {
        showToast("Position geschlossen", "info");
      }
    } catch (err) { showToast(err.message, "error"); }
    finally { setClosing(null); }
  }

  return (
    <div className="space-y-4">
      {/* Verrechnungskonto + Umbuchung */}
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">{depotLabel} · Verrechnungskonto</h3>
          <button
            onClick={() => setTransferOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs text-invest-purple hover:text-invest-purple/80 transition"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Umbuchung
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Verrechnungskonto</div>
            <div className="text-lg font-semibold tabular-nums">{formatCents(summary.settlementCents)}</div>
            <div className="text-[10px] text-muted-foreground/60 tabular-nums">frei: {formatCents(summary.freeSettlementCents)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{bankLabel}</div>
            <div className="text-lg font-semibold tabular-nums">{formatCents(bankCents)}</div>
          </div>
        </div>

        {transferOpen && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
            <div className="flex items-center gap-1 text-xs">
              <button onClick={() => setTransferDir("in")} className={`flex-1 py-1.5 rounded-md transition ${transferDir === "in" ? "bg-lime/10 text-lime" : "bg-white/5 text-muted-foreground"}`}>
                ← Einzahlen
              </button>
              <button onClick={() => setTransferDir("out")} className={`flex-1 py-1.5 rounded-md transition ${transferDir === "out" ? "bg-coral/10 text-coral" : "bg-white/5 text-muted-foreground"}`}>
                → Auszahlen
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={transferAmount}
                onChange={e => setTransferAmount(e.target.value)}
                placeholder="Betrag in €"
                className="flex-1 bg-surface-2/50 border border-white/10 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-invest-purple/30"
              />
              <button
                onClick={doTransfer}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-invest-purple/15 text-invest-purple border border-invest-purple/30 text-sm font-medium hover:bg-invest-purple/25 transition disabled:opacity-40 flex items-center gap-1.5"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Bestätigen
              </button>
            </div>
            <div className="text-[10px] text-muted-foreground/60">
              {transferDir === "in"
                ? `Umbuchung von ${bankLabel} ins Verrechnungskonto. Kein Gewinn/Verlust, keine Entnahme.`
                : `Rücküberweisung vom Verrechnungskonto auf ${bankLabel}. Nur freie Liquidität.`}
            </div>
          </div>
        )}
      </div>

      {/* Positionen */}
      <div className="glass border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium">Positionen ({summary.positions.length})</h3>
        </div>
        {summary.positions.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            Keine Positionen in diesem Depot.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {summary.positions.map(p => (
              <div key={p.instrumentId} className="px-5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      <span className="text-[10px] text-muted-foreground/60">{p.instrumentId}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {formatQty(p.qty, p.type)} {p.type === "crypto" ? "Einheiten" : "Anteile"} · frei: {formatQty(p.availableQty, p.type)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold tabular-nums">{formatCents(p.marketValueCents)}</div>
                    <div className={`text-[10px] tabular-nums ${p.unrealizedPnlCents >= 0 ? "text-lime" : "text-red-300"}`}>
                      {formatPct(p.unrealizedPct)} · {formatCents(p.unrealizedPnlCents)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground/60">
                  <span>Kostenbasis: {formatCents(p.costBasisCents)} · Einstand {formatPricePlain(p.qty > 0 ? Math.round(p.costBasisCents / p.qty) : 0)} €</span>
                  {p.availableQty > 0 && (
                    <button
                      onClick={() => closePosition(p.instrumentId, p.availableQty, p.type)}
                      disabled={closing === p.instrumentId}
                      className="flex items-center gap-1 text-red-300/80 hover:text-red-300 transition disabled:opacity-40"
                    >
                      {closing === p.instrumentId ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                      Schließen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}