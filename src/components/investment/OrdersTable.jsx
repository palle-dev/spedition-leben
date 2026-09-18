import React, { useMemo, useState } from "react";
import { useGame } from "@/lib/gameContext";
import { getOrdersList, formatQty, formatPricePlain, formatCents } from "@/lib/investmentData";
import { X, Loader2 } from "lucide-react";

// Orders-Tabelle: offene und historische Orders, Fills, Storno.
export default function OrdersTable({ state, depotId }) {
  const { send, showToast } = useGame();
  const { orders, fills } = useMemo(() => getOrdersList(state, depotId), [state, depotId]);
  const [cancelling, setCancelling] = useState(null);

  async function cancel(orderId) {
    if (cancelling) return;
    setCancelling(orderId);
    try {
      await send("cancelInvestmentOrder", { orderId });
      showToast("Order storniert", "info");
    } catch (err) { showToast(err.message, "error"); }
    finally { setCancelling(null); }
  }

  const statusLabel = (s) => ({
    open: "Offen", partially_filled: "Teilweise", filled: "Ausgeführt",
    cancelled: "Storniert", expired: "Abgelaufen", rejected: "Abgelehnt", pending_stop: "Stop vorgemerkt", active_stop: "Stop ausgelöst",
  })[s] || s;

  const statusColor = (s) => ({
    open: "text-invest-cyan", partially_filled: "text-amber-300", filled: "text-lime",
    cancelled: "text-muted-foreground", expired: "text-muted-foreground", rejected: "text-red-300",
  })[s] || "text-muted-foreground";

  return (
    <div className="space-y-4">
      {/* Offene Orders */}
      <div className="glass border border-white/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium">Orders</h3>
        </div>
        {orders.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Keine Orders vorhanden.</div>
        ) : (
          <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto scrollbar-none">
            {orders.map(o => (
              <div key={o.id} className="px-5 py-3 flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${o.side === "buy" ? "bg-lime" : "bg-red-400"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium truncate">{o.instrumentName}</span>
                    <span className="text-[10px] text-muted-foreground/60 uppercase">{o.side === "buy" ? "Kauf" : "Verkauf"}</span>
                    <span className="text-[10px] text-muted-foreground/60 uppercase">{({ market: "Markt", limit: "Limit", stop: "Stop", stop_limit: "Stop-Limit", trailing_stop: "Trailing-Stop" })[o.orderType] || o.orderType}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 tabular-nums mt-0.5">
                    {formatQty(o.filledQty, o.instrumentType)}/{formatQty(o.qty, o.instrumentType)} ·
                    {o.limitCents ? ` Limit ${formatPricePlain(o.limitCents)} €` : " Markt"}
                    {o.feeCents > 0 && ` · Gebühr ${formatCents(o.feeCents)}`}
                    {o.rejectReason && <div className="text-amber-300 mt-1">{o.rejectReason}</div>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[10px] font-medium ${statusColor(o.status)}`}>{statusLabel(o.status)}</div>
                </div>
                {(["open", "partially_filled", "pending_stop", "active_stop"].includes(o.status)) && (
                  <button
                    aria-label={"Order für " + o.instrumentName + " stornieren"}
                    onClick={() => cancel(o.id)}
                    disabled={cancelling === o.id}
                    className="w-7 h-7 grid place-items-center rounded-md bg-white/5 text-muted-foreground hover:text-red-300 transition disabled:opacity-40 shrink-0"
                  >
                    {cancelling === o.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fills */}
      {fills.length > 0 && (
        <div className="glass border border-white/10 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-white/10">
            <h3 className="text-sm font-medium">Letzte Ausführungen</h3>
          </div>
          <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto scrollbar-none">
            {fills.map(f => (
              <div key={f.id} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.side === "buy" ? "bg-lime" : "bg-red-400"}`} />
                <span className="font-medium truncate flex-1">{f.instrumentName}</span>
                <span className="text-muted-foreground tabular-nums">{formatQty(f.qty, f.instrumentType)}</span>
                <span className="tabular-nums text-foreground/80">@ {formatPricePlain(f.priceCents)} €</span>
                <span className="text-amber-300/60 tabular-nums">{formatCents(f.feeCents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}