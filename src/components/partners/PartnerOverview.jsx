import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, transportStatusLabel, transportStatusColor, getAllPartnersWithStats, getTransportForOrder } from "@/lib/partnerData";
import { Building2, Truck, Clock, X, TrendingUp, Wallet, ArrowRight, MapPin } from "lucide-react";
import PartnerOfferDialog from "@/components/partners/PartnerOfferDialog";

// Übersicht aller Partner-Speditionen mit Statistiken und aktiven Transporten.
// Wird als Drawer-Sektion oder eigenständige Ansicht verwendet.
export default function PartnerOverview({ onClose }) {
  const { state, send } = useGame();
  const partners = getAllPartnersWithStats(state);
  const activeTransports = (state?.partners?.transports || []).filter(t => t.status === "booked" || t.status === "in_progress");
  const [partnerOrder, setPartnerOrder] = useState(null);

  // Aufträge, die für eine Fremdvergabe in Frage kommen:
  // Status "angenommen", noch nicht extern vergeben, kein aktiver Trip
  const dispatchableOrders = (state.orders || []).filter(o =>
    o.status === "angenommen" &&
    !o.externalTransportId &&
    !(state.trips || []).some(t => t.orderId === o.id && t.status === "in_progress")
  );

  const handleCancel = async (transportId) => {
    if (!confirm("Partner-Transport stornieren? Stornogebühren können anfallen.")) return;
    try {
      await send("cancelPartnerTransport", { transportId });
    } catch (e) {
      // Fehler werden im Game-Context als Toast angezeigt
    }
  };

  return (
    <div className="space-y-4">
      {/* Vergebbare Aufträge */}
      {dispatchableOrders.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
            <ArrowRight className="w-3.5 h-3.5" />
            Zur Fremdvergabe ({dispatchableOrders.length})
          </h3>
          <p className="text-xs text-muted-foreground/70 mb-2">
            Wähle einen Auftrag zur externen Vergabe an einen Partner. Der Partner übernimmt Transport und Lieferung.
          </p>
          <div className="space-y-2">
            {dispatchableOrders.map(o => (
              <div key={o.id} className="rounded-lg border border-white/10 glass p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{o.customer}</p>
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                    <MapPin className="w-3 h-3" />
                    {o.fromCity} → {o.toCity} · {o.tons} t · {formatEuro(o.paymentCents)}
                  </p>
                </div>
                <button
                  onClick={() => setPartnerOrder(o)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime/10 border border-lime/30 text-lime text-xs font-medium hover:bg-lime/20 transition-colors shrink-0"
                >
                  <Truck className="w-3.5 h-3.5" /> Fremdvergabe
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Aktive Transporte */}
      {activeTransports.length > 0 && (
        <section>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
            <Truck className="w-3.5 h-3.5" />
            Aktive Fremdvergaben ({activeTransports.length})
          </h3>
          <div className="space-y-2">
            {activeTransports.map(t => {
              const order = (state.orders || []).find(o => o.id === t.orderId);
              return (
                <div key={t.id} className="rounded-lg border border-white/10 glass p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.partnerName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {order ? `${order.customer} — ${order.fromCity} → ${order.toCity}` : t.orderId}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs ${transportStatusColor(t.status)}`}>{transportStatusLabel(t.status)}</span>
                      {t.status === "booked" && (
                        <button
                          onClick={() => handleCancel(t.id)}
                          className="p-1 rounded text-muted-foreground hover:text-coral transition-colors"
                          title="Stornieren"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Partner-Verzeichnis */}
      <section>
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5" />
          Partner-Verzeichnis
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {partners.map(p => {
            const stats = p.stats;
            const hasActive = p.activeTransports.length > 0;
            return (
              <div key={p.id} className="rounded-lg border border-white/10 glass p-3">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <p className="text-sm font-medium">{p.name}</p>
                  {hasActive && <span className="text-xs text-lime shrink-0">{p.activeTransports.length} aktiv</span>}
                </div>
                <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{p.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Transporte:</span>
                    <span>{stats ? stats.totalTransports : 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Pünktlich:</span>
                    <span>{stats?.punctuality != null ? stats.punctuality + "%" : "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Wallet className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Kosten:</span>
                    <span>{stats ? formatEuro(stats.totalCostCents) : "—"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Tageskap.:</span>
                    <span>{p.dailyCapacity}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {partnerOrder && <PartnerOfferDialog order={partnerOrder} onClose={() => setPartnerOrder(null)} />}
    </div>
  );
}