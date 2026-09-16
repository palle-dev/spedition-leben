import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatClock, formatDay, formatDuration } from "@/lib/partnerData";
import { Truck, Clock, MapPin, Wallet, AlertTriangle, X, RefreshCw, CheckCircle2, Loader2, Building2 } from "lucide-react";

// Modal zur Anfrage von Partner-Angeboten und Beauftragung externer Transporte.
// Wird über einen Portal auf document.body gerendert (vermeidet Containing-Block-Probleme).
export default function PartnerOfferDialog({ order, onClose }) {
  const { state, send } = useGame();
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [offers, setOffers] = useState(null);
  const [error, setError] = useState(null);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [preview, setPreview] = useState(null);

  const loadOffers = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setSelectedPartner(null);
    try {
      const result = await send("requestPartnerOffers", { orderId: order.id });
      if (result.ok) {
        setOffers(result.offers);
        if (result.offers.length === 0) {
          setError("Kein Partner kann diesen Auftrag übernehmen (Region, Qualifikation oder Kapazität).");
        }
      } else {
        setError(result.error || "Anfrage fehlgeschlagen.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [send, order.id]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  const handleSelectPartner = async (partnerId) => {
    setSelectedPartner(partnerId);
    setPreview(null);
    try {
      const result = await send("previewPartnerBooking", { orderId: order.id, partnerId });
      setPreview(result);
    } catch (e) {
      setPreview({ ok: false, error: e.message });
    }
  };

  const handleBook = async () => {
    if (!selectedPartner) return;
    setBooking(true);
    try {
      const result = await send("bookPartnerTransport", { orderId: order.id, partnerId: selectedPartner });
      if (result.ok) onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBooking(false);
    }
  };

  if (!order) return null;

  const modal = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-surface/95 backdrop-blur p-4">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-lime shrink-0" />
            <div>
              <h3 className="font-heading font-medium text-sm">Fremdvergabe an Partner</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{order.customer} — {order.fromCity} → {order.toCity}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-xs rounded-lg bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Fracht:</span>
              <span>{order.tons} t</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Frist:</span>
              <span>{formatDay(order.deliveryDeadlineMin)} {formatClock(order.deliveryDeadlineMin)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Vergütung:</span>
              <span>{formatEuro(order.paymentCents)}</span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-coral/10 border border-coral/20 p-3 text-xs text-coral">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Frage Partner an…</span>
            </div>
          )}

          {offers && offers.length > 0 && !loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Verfügbare Partner</h4>
                <button onClick={loadOffers} disabled={loading} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Aktualisieren
                </button>
              </div>
              {offers.map((offer) => (
                <button
                  key={offer.partnerId}
                  onClick={() => handleSelectPartner(offer.partnerId)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    selectedPartner === offer.partnerId ? "border-lime/40 bg-lime/5" : "border-white/10 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{offer.partnerName}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Wallet className="w-3 h-3" />{formatEuro(offer.priceCents)}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(offer.durationMin)}</span>
                        <span className="flex items-center gap-1"><Truck className="w-3 h-3" />Rest: {offer.remainingCapacity}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Deckungsbeitrag</p>
                      <p className={`text-sm font-medium ${offer.contributionCents > 0 ? "text-lime" : "text-coral"}`}>{formatEuro(offer.contributionCents)}</p>
                    </div>
                  </div>
                  {selectedPartner === offer.partnerId && preview && (
                    <div className="mt-3 pt-3 border-t border-white/10 space-y-2 text-xs">
                      {preview.ok ? (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <div><span className="text-muted-foreground">Lieferung:</span> <span>{formatDay(preview.deliveryMin)} {formatClock(preview.deliveryMin)}</span></div>
                            <div><span className="text-muted-foreground">Storno kostenlos bis:</span> <span>{formatClock(preview.cancellationFreeUntilMin)}</span></div>
                          </div>
                          <div className="flex items-center gap-2 text-lime"><CheckCircle2 className="w-3.5 h-3.5" /><span>Bereit zur Beauftragung</span></div>
                        </>
                      ) : (
                        <div className="flex items-start gap-2 text-coral"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /><span>{preview.error}</span></div>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {offers && offers.length === 0 && !loading && !error && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Kein Partner verfügbar für diese Relation.</p>
            </div>
          )}
        </div>

        {selectedPartner && preview?.ok && (
          <div className="sticky bottom-0 border-t border-white/10 bg-surface/95 backdrop-blur p-4 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Abbrechen</button>
            <button onClick={handleBook} disabled={booking} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-lime text-ink text-sm font-medium hover:bg-lime/90 transition-colors disabled:opacity-50">
              {booking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Beauftragen
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}