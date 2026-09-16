import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { getVehicleProfile } from "@/lib/gameData";
import { Truck, ShoppingCart, Clock, Gauge, Wrench, TrendingUp, AlertCircle } from "lucide-react";

// Gebrauchtfahrzeugmarkt — zeigt verfügbare Gebrauchtangebote und ermöglicht den Kauf.
export default function UsedVehicleMarket({ state, send, showToast, branches }) {
  const { state: gameState } = useGame();
  const [buying, setBuying] = useState(null);
  const [market, setMarket] = useState(null);
  const [loading, setLoading] = useState(false);

  async function loadMarket() {
    setLoading(true);
    try {
      const res = await send("getUsedVehicleMarket", {});
      setMarket(res);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLoading(false);
    }
  }

  // Automatisch beim ersten Mount laden
  useMemo(() => {
    if (!market) loadMarket();
  }, []);

  async function buy(offer) {
    setBuying(offer.id);
    try {
      const branch = branches[0];
      const r = await send("buyUsedVehicle", { offerId: offer.id, branchId: branch?.id });
      showToast(`${offer.vehicleType} für ${formatEuro(offer.askingPriceCents)} gekauft. Zustand ${offer.condition}/100.`, "success");
      await loadMarket();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBuying(null);
    }
  }

  const offers = market?.offers || [];
  const nextGen = market?.nextGenerateMin ? formatGameTime(market.nextGenerateMin) : "—";
  const accountCents = state.company.accountCents;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Truck className="w-5 h-5 text-lime/70" /> Gebrauchtfahrzeugmarkt
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {offers.length} Angebot{offers.length !== 1 ? "e" : ""} verfügbar · Nächste Generierung: {nextGen}
          </p>
        </div>
        <button onClick={loadMarket} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 transition">
          {loading ? <span className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" /> : <Clock className="w-4 h-4" />} Aktualisieren
        </button>
      </div>

      {offers.length === 0 ? (
        <div className="glass border border-white/10 rounded-xl p-8 text-center text-muted-foreground">
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Aktuell keine Gebrauchtangebote verfügbar.</p>
          <p className="text-xs mt-1">Neue Angebote erscheinen alle 3 Spieltage.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {offers.map(offer => {
            const canAfford = accountCents >= offer.askingPriceCents;
            const discount = offer.marketValueCents > 0
              ? Math.round((1 - offer.askingPriceCents / offer.marketValueCents) * 100)
              : 0;
            return (
              <div key={offer.id} className="glass border border-white/10 rounded-xl p-4 hover:border-lime/20 transition flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium flex items-center gap-2">
                    <Truck className="w-4 h-4 text-lime/70" /> {offer.vehicleType}
                  </div>
                  {discount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-lime/15 text-lime">-{discount}% vom Neupreis</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Gauge className="w-3.5 h-3.5 text-foreground/40" />
                    <span className="text-muted-foreground/60">Zustand:</span>
                    <span className={offer.condition < 50 ? "text-amber-300" : "text-foreground/80"}>{offer.condition}/100</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="w-3.5 h-3.5 text-foreground/40" />
                    <span className="text-muted-foreground/60">Alter:</span>
                    <span className="text-foreground/80">{offer.ageDays} Tage</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                    <TrendingUp className="w-3.5 h-3.5 text-foreground/40" />
                    <span className="text-muted-foreground/60">km:</span>
                    <span className="text-foreground/80">{offer.odometerKm.toLocaleString("de-DE")} km</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground col-span-2">
                    <span className="text-muted-foreground/60">Kapazität:</span>
                    <span className="text-foreground/80">{offer.capacityTons} t · {offer.consumptionPer100km} L/100km</span>
                  </div>
                </div>
                {offer.needsMaintenance && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-300 bg-amber-500/10 border border-amber-400/20 rounded-lg px-2.5 py-1.5 mb-3">
                    <Wrench className="w-3.5 h-3.5" /> Wartung empfohlen (Zustand unter 70)
                  </div>
                )}
                <div className="mt-auto space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Preis:</span>
                    <span className="font-medium">{formatEuro(offer.askingPriceCents)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Marktwert: {formatEuro(offer.marketValueCents)}</span>
                    <span>Händlerankauf: {formatEuro(offer.dealerBuyValueCents)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground/50">
                    Gültig bis {formatGameTime(offer.expireMin)}
                  </div>
                  <button
                    onClick={() => buy(offer)}
                    disabled={!canAfford || buying === offer.id}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-lime text-ink font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
                  >
                    {buying === offer.id
                      ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                      : <><ShoppingCart className="w-4 h-4" /> Kaufen</>}
                  </button>
                  {!canAfford && <div className="text-xs text-red-300 text-center">Firmenkonto reicht nicht aus</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}