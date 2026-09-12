import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import StatusBadge from "@/components/ui/StatusBadge";
import { Check, X, MapPin, Clock, Package, ArrowRight } from "lucide-react";

export default function Orders() {
  const { state, send, showToast } = useGame();
  const [busyId, setBusyId] = useState(null);

  async function accept(o) {
    setBusyId(o.id);
    try { await send("acceptOrder", { orderId: o.id }); showToast("Auftrag angenommen.", "success"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }
  async function cancel(o) {
    setBusyId(o.id);
    try { await send("cancelOrder", { orderId: o.id }); showToast("Auftrag storniert (10 % Gebühr).", "info"); }
    catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }

  const offered = state.orders.filter(o => o.status === "offered").sort((a, b) => a.acceptDeadlineMin - b.acceptDeadlineMin);
  const active = state.orders.filter(o => ["angenommen", "unterwegs"].includes(o.status));
  const done = state.orders.filter(o => ["geliefert", "storniert", "expired"].includes(o.status)).slice(-8);

  return (
    <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl lg:text-3xl font-medium tracking-tight">Aufträge</h1>
        <p className="text-sm text-muted-foreground mt-1">Der Auftragsmarkt – nimm Angebote an, bevor die Annahmefrist abläuft.</p>
      </div>

      <Section title="Offene Angebote" count={offered.length}>
        {offered.length === 0 ? <Empty text="Aktuell keine Angebote." /> : (
          <div className="grid md:grid-cols-2 gap-3">
            {offered.map(o => (
              <div key={o.id} className="glass border border-white/10 rounded-xl p-4 hover:border-lime/30 transition">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-foreground">{o.customer}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{o.cargo} · {o.tons} t</div>
                  </div>
                  <div className="text-lg font-medium text-lime tabular-nums">{formatEuro(o.paymentCents)}</div>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
                  <MapPin className="w-3.5 h-3.5" /> {o.fromCity} <ArrowRight className="w-3 h-3" /> {o.toCity}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-2">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Annahme bis {formatGameTime(o.acceptDeadlineMin)}</span>
                  <span>Frist {formatGameTime(o.deliveryDeadlineMin)}</span>
                </div>
                <button onClick={() => accept(o)} disabled={busyId === o.id}
                  className="w-full mt-3 flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-50 transition active:scale-[0.98]">
                  {busyId === o.id ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Annehmen</>}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Angenommen & unterwegs" count={active.length}>
        {active.length === 0 ? <Empty text="Keine aktiven Aufträge." /> : (
          <div className="space-y-2">
            {active.map(o => {
              const trip = state.trips.find(t => t.orderId === o.id && t.status === "in_progress");
              return (
                <div key={o.id} className="glass border border-white/10 rounded-lg p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{o.customer}: {o.fromCity} → {o.toCity}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <StatusBadge status={o.status} />
                      {trip && <span className="text-muted-foreground">· Ankunft {formatGameTime(trip.endMin)}</span>}
                      <span className="text-muted-foreground">· Frist {formatGameTime(o.deliveryDeadlineMin)}</span>
                    </div>
                  </div>
                  {o.status === "angenommen" && (
                    <button onClick={() => cancel(o)} disabled={busyId === o.id}
                      className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 bg-red-500/15 border border-red-400/30 text-red-200 text-xs hover:bg-red-500/25 disabled:opacity-50 transition active:scale-95">
                      <X className="w-3.5 h-3.5" /> Stornieren
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Abgeschlossen & verfallen" count={done.length}>
        {done.length === 0 ? <Empty text="Noch keine abgeschlossenen Aufträge." /> : (
          <div className="space-y-1.5">
            {done.map(o => (
              <div key={o.id} className="flex items-center justify-between text-sm border border-white/10 rounded-lg px-3 py-2 bg-surface/30">
                <span className="text-foreground/80">{o.customer}: {o.fromCity} → {o.toCity}</span>
                <span className="flex items-center gap-2 text-xs">
                  <StatusBadge status={o.status} />
                  {o.paidCents != null && <span className="text-muted-foreground tabular-nums">{formatEuro(o.paidCents)}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <div>
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">{title} <span className="text-muted-foreground/50">({count})</span></h2>
      {children}
    </div>
  );
}
function Empty({ text }) { return <div className="text-sm text-muted-foreground/50">{text}</div>; }