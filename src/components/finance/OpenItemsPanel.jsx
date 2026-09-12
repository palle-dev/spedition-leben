import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { accountName } from "@/lib/accountingData";
import { ArrowDownCircle, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

export default function OpenItemsPanel({ state }) {
  const { send, showToast } = useGame();
  const [paying, setPaying] = useState(null);
  const acc = state.accounting || {};
  const openItems = (acc.openItems || []).filter(i => i.remainingCents > 0).sort((a, b) => a.createdAtMin - b.createdAtMin);
  const paidItems = (acc.openItems || []).filter(i => i.remainingCents <= 0).slice(-10).reverse();

  async function payItem(item) {
    setPaying(item.id);
    try {
      const r = await send("payOpenItem", { itemId: item.id });
      showToast(`${formatEuro(r.paidCents)} bezahlt. ${r.remainingCents > 0 ? `Restbetrag: ${formatEuro(r.remainingCents)}` : "Posten vollständig beglichen."}`, "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setPaying(null);
    }
  }

  async function payAll() {
    setPaying("all");
    try {
      const r = await send("payOpenCosts", { account: "company" });
      showToast(`${formatEuro(r.paidCents)} offene Verbindlichkeiten bezahlt.`, "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setPaying(null);
    }
  }

  const totalOpen = openItems.reduce((s, i) => s + i.remainingCents, 0);

  return (
    <div className="space-y-4">
      {openItems.length === 0 && paidItems.length === 0 ? (
        <div className="glass border border-white/10 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-lime/60 mx-auto mb-3" />
          <h3 className="font-medium">Keine offenen Posten</h3>
          <p className="text-sm text-muted-foreground mt-1">Alle Verbindlichkeiten sind beglichen.</p>
        </div>
      ) : (
        <>
          {openItems.length > 0 && (
            <>
              <div className="flex items-center justify-between glass border border-red-400/20 rounded-xl p-4">
                <div>
                  <div className="text-sm text-red-200/80">Offene Verbindlichkeiten gesamt</div>
                  <div className="text-2xl font-medium tabular-nums text-red-200 mt-1">{formatEuro(totalOpen)}</div>
                </div>
                <button
                  onClick={payAll}
                  disabled={paying !== null}
                  className="flex items-center gap-2 rounded-lg px-4 py-2.5 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition active:scale-95"
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  Alle bezahlen
                </button>
              </div>

              <div className="space-y-2">
                {openItems.map(item => (
                  <div key={item.id} className="glass border border-white/10 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground/50 tabular-nums">{item.id}</span>
                          {item.dueMin && item.dueMin <= state.gameTime && (
                            <span className="flex items-center gap-1 rounded-full bg-red-500/20 text-red-200 text-xs px-2 py-0.5">
                              <AlertTriangle className="w-3 h-3" /> Fällig
                            </span>
                          )}
                          {item.dueMin && item.dueMin > state.gameTime && (
                            <span className="flex items-center gap-1 rounded-full bg-white/5 text-muted-foreground text-xs px-2 py-0.5">
                              <Clock className="w-3 h-3" /> Fällig {formatGameTime(item.dueMin)}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-foreground/80 mt-1">{item.cause || "Verbindlichkeit"}</div>
                        <div className="text-xs text-muted-foreground/60 mt-0.5">
                          {accountName(item.account)}
                          {item.partnerName && ` · ${item.partnerName}`}
                          {item.orderId && ` · Auftrag ${item.orderId}`}
                        </div>
                        {item.payments?.length > 0 && (
                          <div className="text-xs text-muted-foreground/40 mt-1">
                            {item.payments.length} Teilzahlung{item.payments.length > 1 ? "en" : ""} erfolgt
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-medium tabular-nums text-red-200">{formatEuro(item.remainingCents)}</div>
                        {item.remainingCents < item.amountCents && (
                          <div className="text-xs text-muted-foreground/50 tabular-nums line-through">{formatEuro(item.amountCents)}</div>
                        )}
                        <button
                          onClick={() => payItem(item)}
                          disabled={paying !== null}
                          className="mt-2 rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/15 text-xs font-medium transition active:scale-95 disabled:opacity-50"
                        >
                          {paying === item.id ? "Bezahle…" : "Bezahlen"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {paidItems.length > 0 && (
            <div>
              <h3 className="text-xs text-muted-foreground/50 uppercase tracking-wider mb-2">Kürzlich beglichen</h3>
              <div className="space-y-1">
                {paidItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
                    <span className="text-muted-foreground/70 truncate">{item.cause || "Verbindlichkeit"}</span>
                    <span className="text-lime/70 tabular-nums shrink-0 ml-3">{formatEuro(item.amountCents)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}