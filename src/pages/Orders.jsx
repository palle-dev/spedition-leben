import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { Check, X, Truck, Clock, MapPin } from "lucide-react";

const STATUS_LABEL = {
  offered: "Angebot", angenommen: "Angenommen", unterwegs: "Unterwegs",
  geliefert: "Geliefert", storniert: "Storniert", expired: "Verfallen"
};

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

  const groups = {
    offered: state.orders.filter(o => o.status === "offered").sort((a, b) => a.acceptDeadlineMin - b.acceptDeadlineMin),
    active: state.orders.filter(o => ["angenommen", "unterwegs"].includes(o.status)),
    done: state.orders.filter(o => ["geliefert", "storniert", "expired"].includes(o.status)).slice(-8)
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-display text-amber-200">Aufträge</h1>
        <p className="text-amber-100/60 text-sm">Der Auftragsmarkt – nimm Angebote an, bevor die Annahmefrist abläuft.</p>
      </div>

      <Section title="Offene Angebote" count={groups.offered.length}>
        {groups.offered.length === 0 ? <Empty text="Aktuell keine Angebote." /> : (
          <div className="grid md:grid-cols-2 gap-3">
            {groups.offered.map(o => (
              <div key={o.id} className="bg-office-2/50 border border-wood/30 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium text-amber-100">{o.customer}</div>
                    <div className="text-xs text-amber-100/50">{o.cargo} · {o.tons} t</div>
                  </div>
                  <div className="text-right">
                    <div className="text-emerald-300 font-semibold">{formatEuro(o.paymentCents)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-amber-100/70 mt-2">
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {o.fromCity} → {o.toCity}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-amber-100/50 mt-1">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Annahme bis {formatGameTime(o.acceptDeadlineMin)}</span>
                  <span>Lieferfrist {formatGameTime(o.deliveryDeadlineMin)}</span>
                </div>
                <button onClick={() => accept(o)} disabled={busyId === o.id}
                  className="mt-3 w-full px-3 py-1.5 rounded-md bg-amber-500 text-amber-950 hover:bg-amber-400 disabled:opacity-40 text-sm font-medium flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" /> Annehmen
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Angenommen & unterwegs" count={groups.active.length}>
        {groups.active.length === 0 ? <Empty text="Keine aktiven Aufträge." /> : (
          <div className="space-y-2">
            {groups.active.map(o => {
              const trip = state.trips.find(t => t.orderId === o.id && t.status === "in_progress");
              return (
                <div key={o.id} className="bg-office-2/50 border border-wood/30 rounded-md p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-amber-100">{o.customer}: {o.fromCity} → {o.toCity} ({o.tons} t)</div>
                    <div className="text-xs text-amber-100/50">{STATUS_LABEL[o.status]} · Lieferfrist {formatGameTime(o.deliveryDeadlineMin)}{trip ? ` · Ankunft ${formatGameTime(trip.endMin)}` : ""}</div>
                  </div>
                  {o.status === "angenommen" && (
                    <button onClick={() => cancel(o)} disabled={busyId === o.id}
                      className="px-3 py-1.5 rounded-md bg-red-500/20 border border-red-400/40 text-red-200 hover:bg-red-500/30 text-sm flex items-center gap-1.5">
                      <X className="w-4 h-4" /> Stornieren (10 %)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Abgeschlossen & verfallen" count={groups.done.length}>
        {groups.done.length === 0 ? <Empty text="Noch keine abgeschlossenen Aufträge." /> : (
          <div className="space-y-1.5">
            {groups.done.map(o => (
              <div key={o.id} className="text-sm border border-wood/20 rounded-md p-2 bg-office-2/30 flex items-center justify-between">
                <span className="text-amber-100/80">{o.customer}: {o.fromCity} → {o.toCity}</span>
                <span className="text-xs text-amber-100/50">{STATUS_LABEL[o.status]}{o.paidCents != null ? ` · ${formatEuro(o.paidCents)}` : ""}</span>
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
      <h2 className="text-sm uppercase tracking-wide text-amber-300/70 mb-2">{title} <span className="text-amber-100/40">({count})</span></h2>
      {children}
    </div>
  );
}
function Empty({ text }) { return <div className="text-sm text-amber-100/40">{text}</div>; }