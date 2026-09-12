import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { previewOrder, formatPricePlain, formatCents, formatQty } from "@/lib/investmentData";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";

// Order-Formular: Markt- und Limit-Orders, Kauf und Verkauf.
export default function OrderTicket({ state, depotId, instrumentId }) {
  const { send, showToast } = useGame();
  const [side, setSide] = useState("buy");
  const [orderType, setOrderType] = useState("market");
  const [qtyInput, setQtyInput] = useState("");
  const [budgetInput, setBudgetInput] = useState("");
  const [limitInput, setLimitInput] = useState("");
  const [timeInForce, setTimeInForce] = useState("GTC");
  const [submitting, setSubmitting] = useState(false);

  const m = state.investment?.market;
  const inst = m?.instruments?.[instrumentId];

  const preview = useMemo(() => {
    if (!instrumentId || !inst) return null;
    const qty = parseFloat(qtyInput) || null;
    const budgetCents = parseFloat(budgetInput) ? Math.round(parseFloat(budgetInput) * 100) : null;
    const limitCents = parseFloat(limitInput) ? Math.round(parseFloat(limitInput) * 100) : null;
    if (!qty && !budgetCents) return null;
    return previewOrder(state, { depotId, instrumentId, side, orderType, qty, budgetCents, limitCents });
  }, [state, depotId, instrumentId, side, orderType, qtyInput, budgetInput, limitInput]);

  if (!inst) {
    return (
      <div className="glass border border-white/10 rounded-xl p-6 text-center text-sm text-muted-foreground">
        Wähle ein Instrument aus der Marktliste, um eine Order aufzugeben.
      </div>
    );
  }

  const isCrypto = inst.type === "crypto";
  const depotLabel = depotId === "company" ? "Firmendepot" : "Privatdepot";
  const depotAccent = depotId === "company" ? "text-lime" : "text-coral";

  async function submitOrder(e) {
    e?.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const qty = parseFloat(qtyInput) || null;
      const budgetCents = parseFloat(budgetInput) ? Math.round(parseFloat(budgetInput) * 100) : null;
      const limitCents = parseFloat(limitInput) ? Math.round(parseFloat(limitInput) * 100) : null;
      const res = await send("placeInvestmentOrder", {
        depotId, instrumentId, side, orderType,
        qty, budgetCents, limitCents, timeInForce,
      });
      if (res?.order?.status === "filled") {
        showToast(`${side === "buy" ? "Kauf" : "Verkauf"} ausgeführt: ${formatQty(res.fillQty || res.order.filledQty, inst.type)} ${inst.name}`, "success");
      } else if (res?.order?.status === "partially_filled") {
        showToast(`Teilweise ausgeführt: ${formatQty(res.order.filledQty, inst.type)} ${inst.name}`, "info");
      } else if (res?.order?.status === "open") {
        showToast(`Order platziert, wartet auf Ausführung`, "info");
      } else if (res?.order?.status === "cancelled") {
        showToast(`Order abgelehnt: ${res.order.rejectReason || "Preisabweichung"}`, "error");
      } else {
        showToast(`Order platziert`, "info");
      }
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass border border-white/10 rounded-xl p-5">
      {/* Instrument-Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-medium">{inst.name}</div>
          <div className="text-[10px] text-muted-foreground">{inst.id} · {inst.sector} · {inst.riskClass}</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">{formatPricePlain(inst.currentQuote.mid)} €</div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            Bid {formatPricePlain(inst.currentQuote.bid)} · Ask {formatPricePlain(inst.currentQuote.ask)}
          </div>
        </div>
      </div>

      {/* Depot-Kennzeichnung */}
      <div className={`text-[10px] uppercase tracking-wider mb-3 ${depotAccent}`}>{depotLabel}</div>

      {/* Seite: Kauf/Verkauf */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => setSide("buy")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${side === "buy" ? "bg-lime/15 text-lime border border-lime/30" : "bg-white/5 text-muted-foreground border border-white/10"}`}
        >
          <ArrowUp className="w-3.5 h-3.5" /> Kauf
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${side === "sell" ? "bg-red-500/15 text-red-300 border border-red-500/30" : "bg-white/5 text-muted-foreground border border-white/10"}`}
        >
          <ArrowDown className="w-3.5 h-3.5" /> Verkauf
        </button>
      </div>

      {/* Ordertyp */}
      <div className="flex items-center gap-1 mb-3 text-xs">
        {["market", "limit"].map(t => (
          <button
            key={t}
            onClick={() => setOrderType(t)}
            className={`flex-1 py-1.5 rounded-md transition ${orderType === t ? "bg-invest-purple/15 text-invest-purple" : "text-muted-foreground hover:text-foreground bg-white/5"}`}
          >
            {t === "market" ? "Markt" : "Limit"}
          </button>
        ))}
      </div>

      {/* Menge oder Budget */}
      <div className="space-y-2 mb-3">
        {side === "buy" && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Budget (€) — optional</label>
            <input
              type="number"
              value={budgetInput}
              onChange={e => { setBudgetInput(e.target.value); if (e.target.value) setQtyInput(""); }}
              placeholder="z.B. 1000"
              className="w-full bg-surface-2/50 border border-white/10 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-invest-purple/30"
            />
          </div>
        )}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {side === "buy" ? "Menge (optional, wenn Budget gesetzt)" : "Menge"} ({isCrypto ? "Einheiten" : "Anteile"})
          </label>
          <input
            type="number"
            value={qtyInput}
            onChange={e => { setQtyInput(e.target.value); if (e.target.value) setBudgetInput(""); }}
            placeholder={isCrypto ? "0.00000001" : "0.000001"}
            step={isCrypto ? "0.00000001" : "0.000001"}
            className="w-full bg-surface-2/50 border border-white/10 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-invest-purple/30"
          />
        </div>
        {orderType === "limit" && (
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Limit-Preis (€)</label>
            <input
              type="number"
              value={limitInput}
              onChange={e => setLimitInput(e.target.value)}
              placeholder={formatPricePlain(inst.currentQuote.mid)}
              className="w-full bg-surface-2/50 border border-white/10 rounded-lg px-3 py-2 text-sm tabular-nums focus:outline-none focus:border-invest-purple/30"
            />
          </div>
        )}
      </div>

      {/* Laufzeit */}
      <div className="flex items-center gap-1 mb-3 text-xs">
        {["GTC", "DAY"].map(t => (
          <button
            key={t}
            onClick={() => setTimeInForce(t)}
            className={`flex-1 py-1.5 rounded-md transition ${timeInForce === t ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground bg-white/5"}`}
          >
            {t === "GTC" ? "GTC (bis Storno)" : "DAY (Tages)"}
          </button>
        ))}
      </div>

      {/* Vorschau */}
      {preview?.ok && (
        <div className="bg-surface-2/30 border border-white/5 rounded-lg p-3 space-y-1.5 mb-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Ausführungspreis</span>
            <span className="tabular-nums">{formatPricePlain(preview.execPriceCents)} €</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Bruttowert</span>
            <span className="tabular-nums">{formatCents(preview.grossCents)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Gebühr</span>
            <span className="tabular-nums text-amber-300">{formatCents(preview.feeCents)}</span>
          </div>
          <div className="flex justify-between text-xs border-t border-white/5 pt-1.5">
            <span className="text-muted-foreground">{side === "buy" ? "Gesamtkosten" : "Nettoerlös"}</span>
            <span className="tabular-nums font-medium">{formatCents(preview.netCents)}</span>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={submitOrder}
        disabled={submitting || !preview?.ok}
        className={`w-full py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-40 flex items-center justify-center gap-2 ${
          side === "buy" ? "bg-lime/15 text-lime border border-lime/30 hover:bg-lime/25" : "bg-red-500/15 text-red-300 border border-red-500/30 hover:bg-red-500/25"
        }`}
      >
        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
        {side === "buy" ? "Kaufen" : "Verkaufen"}
      </button>
    </div>
  );
}