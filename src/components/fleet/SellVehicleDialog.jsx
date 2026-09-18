import React, { useState, useEffect } from "react";
import { X, TrendingUp, TrendingDown, Truck, MapPin, Gauge, Clock, Package, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { vehicleDisplayName } from "@/lib/displayHelpers";

// Verkaufsvorschau und Abwicklung für eigene Lkw (Auftrag 21).
export default function SellVehicleDialog({ vehicle, onClose }) {
  const { state, send, showToast, automationEnabled, pauseAutomation } = useGame();
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selling, setSelling] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const r = await send("previewSale", { vehicleId: vehicle.id });
        if (active) setPreview(r);
      } catch (e) {
        if (active) showToast(e.message, "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [vehicle.id]);

  if (!preview || loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div className="glass border border-white/15 rounded-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  const bookValue = preview.bookValueCents;
  const marketValue = preview.marketValueCents;
  const dealerOffer = preview.dealerOfferCents;
  const gainLoss = preview.gainLossCents;
  const isGain = preview.isGain;
  const canSell = preview.canSellImmediately;
  const bankAfter = (state.company.accountCents || 0) + dealerOffer;
  const hasOffer = preview.saleOffer && preview.saleOffer.validUntilMin >= state.gameTime;
  const offerExpired = preview.saleOffer && preview.saleOffer.validUntilMin < state.gameTime;

  async function handleRequestOffer() {
    try {
      await send("requestSaleOffer", { vehicleId: vehicle.id });
      showToast("Händlerangebot eingeholt – 24 Stunden gültig.", "success");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleMarkForSale() {
    try {
      await send("markForSale", { vehicleId: vehicle.id });
      showToast("Fahrzeug für Verkauf vorgemerkt – nicht mehr für Disposition verfügbar.", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleUnmarkForSale() {
    try {
      await send("unmarkForSale", { vehicleId: vehicle.id });
      showToast("Vormerkung aufgehoben – Fahrzeug wieder für Disposition verfügbar.", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleSell() {
    setSelling(true);
    try {
      const r = await send("sellVehicle", { vehicleId: vehicle.id });
      showToast(`Lkw verkauft für ${formatEuro(r.salePriceCents)}. ${r.gainLossCents >= 0 ? "Gewinn" : "Verlust"}: ${formatEuro(Math.abs(r.gainLossCents))}.`, "success");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSelling(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="glass border border-white/15 rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto scrollbar-none" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 grid place-items-center text-muted-foreground hover:text-foreground transition" aria-label="Schließen">
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <Truck className="w-5 h-5 text-lime/70" />
          <h2 className="text-lg font-medium tracking-tight">{vehicleDisplayName(vehicle)} verkaufen</h2>
        </div>

        {/* Fahrzeugdaten */}
        <div className="grid grid-cols-2 gap-2 text-sm mb-4">
          <div className="flex items-center gap-1.5 text-muted-foreground"><MapPin className="w-3.5 h-3.5 text-foreground/40" /> {preview.locationCity}</div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><Gauge className="w-3.5 h-3.5 text-foreground/40" /> Zustand {preview.condition}/100</div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><Package className="w-3.5 h-3.5 text-foreground/40" /> {preview.odometerKm.toLocaleString("de-DE")} km</div>
          <div className="flex items-center gap-1.5 text-muted-foreground"><Truck className="w-3.5 h-3.5 text-foreground/40" /> Eigenes Fahrzeug</div>
        </div>

 {/* Bewertung */}
        <div className="space-y-2 mb-4">
          <Row label="Buchwert (aus Anlagenverzeichnis)" value={formatEuro(bookValue)} />
          <Row label="Geschätzter Marktwert" value={formatEuro(marketValue)} muted />
          <div className="flex items-center justify-between rounded-lg bg-lime/5 border border-lime/20 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm font-medium text-lime">
              {isGain ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4 text-red-300" />}
              Händler-Ankaufspreis
            </span>
            <span className="text-lg font-semibold tabular-nums text-lime">{formatEuro(dealerOffer)}</span>
          </div>
          <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${isGain ? "bg-lime/5 text-lime" : "bg-red-500/5 text-red-300"}`}>
            <span className="text-sm">{isGain ? "Erwarteter Gewinn" : "Erwarteter Verlust"}</span>
            <span className="text-sm font-medium tabular-nums">{isGain ? "+" : ""}{formatEuro(gainLoss)}</span>
          </div>
        </div>

        {/* Angebotsstatus */}
        {hasOffer && (
          <div className="flex items-center gap-2 text-xs text-lime bg-lime/5 border border-lime/20 rounded-lg px-3 py-2 mb-3">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Verbindliches Angebot: {formatEuro(preview.saleOffer.priceCents)} – gültig bis {formatGameTime(preview.saleOffer.validUntilMin)}
          </div>
        )}
        {offerExpired && (
          <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/5 border border-amber-400/20 rounded-lg px-3 py-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5" />
            Angebot abgelaufen – neues Angebot erforderlich.
          </div>
        )}

        {/* Bank nach Verkauf */}
        <div className="flex items-center justify-between text-sm border-t border-white/10 pt-3 mb-4">
          <span className="text-muted-foreground">Firmenbank nach Verkauf</span>
          <span className="font-medium tabular-nums text-foreground">{formatEuro(bankAfter)}</span>
        </div>

        {/* Bindungen */}
        {preview.activeTrip && (
          <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/5 border border-amber-400/20 rounded-lg px-3 py-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5" />
            Fahrzeug ist auf Tour bis {formatGameTime(preview.activeTrip.endMin)}. Verkauf erst nach Tourende möglich.
          </div>
        )}
        {preview.futureTours?.length > 0 && (
          <div className="text-xs text-amber-300 bg-amber-500/5 border border-amber-400/20 rounded-lg px-3 py-2 mb-3">
            {preview.futureTours.length} geplante Tour(s) werden beim Verkauf storniert.
          </div>
        )}
        {preview.assignedDispatchers?.length > 0 && (
          <div className="text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2 mb-3">
            Zugewiesene Disponenten: {preview.assignedDispatchers.map(d => d.name).join(", ")} – Zuweisung wird beim Verkauf entfernt.
          </div>
        )}

        {/* Automatik-Hinweis */}
        {automationEnabled && (
          <div className="flex items-center justify-between text-xs text-muted-foreground bg-white/5 rounded-lg px-3 py-2 mb-4">
            <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Zeitautomatik läuft – Angebot und Spielzeit weiter.</span>
            <button onClick={() => pauseAutomation()} className="text-lime hover:underline">Pause &amp; prüfen</button>
          </div>
        )}

        {/* Aktionen */}
        <div className="space-y-2">
          {!hasOffer && (
            <button onClick={handleRequestOffer} disabled={selling}
              className="w-full rounded-lg py-2.5 bg-white/5 border border-white/10 text-sm font-medium hover:bg-white/10 transition">
              Verbindliches Händlerangebot anfordern
            </button>
          )}
          {canSell && hasOffer && (
            <button onClick={handleSell} disabled={selling}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-3 bg-lime text-ink font-semibold text-sm hover:brightness-110 transition active:scale-[0.98]">
              {selling ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <TrendingUp className="w-4 h-4" />}
              Lkw für {formatEuro(dealerOffer)} verkaufen
            </button>
          )}
          {canSell && !hasOffer && (
            <div className="text-xs text-muted-foreground text-center py-1">Verbindliches Angebot erforderlich vor Verkauf.</div>
          )}
          {!canSell && !preview.activeTrip && (
            <div className="text-xs text-amber-300 text-center py-1">Fahrzeug muss frei sein für sofortigen Verkauf.</div>
          )}
          {preview.activeTrip && (
            <button onClick={handleMarkForSale} disabled={!preview.markedForSale}
              className="w-full rounded-lg py-2.5 bg-amber-500/10 border border-amber-400/20 text-sm font-medium text-amber-300 hover:bg-amber-500/15 disabled:opacity-40 transition">
              {preview.markedForSale ? "Bereits vorgemerkt" : "Nach Tour zum Verkauf vormerken"}
            </button>
          )}
          {preview.markedForSale && !preview.activeTrip && (
            <button onClick={handleUnmarkForSale}
              className="w-full rounded-lg py-2.5 bg-white/5 border border-white/10 text-sm hover:bg-white/10 transition">
              Vormerkung aufheben
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted = undefined }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  );
}