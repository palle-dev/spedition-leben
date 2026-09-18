import React from "react";
import { useGame } from "@/lib/gameContext";
import { getTrustLabel, getTrustColor, formatEuro, formatDay, TRUST_START, STAMMKUNDE_MIN_TRANSPORTS, STAMMKUNDE_MIN_TRUST } from "@/lib/customerData";
import ContractOfferCard from "./ContractOfferCard";
import ContractView from "./ContractView";
import OutreachPanel from "./OutreachPanel";
import { Star, MapPin, Phone, TrendingUp, ArrowLeft, Package } from "lucide-react";

export default function CustomerDetail({ customerId, onBack }) {
  const { state, send } = useGame();
  const [detail, setDetail] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  // Bestellungen des Kunden
  const customerOrders = React.useMemo(() => {
    if (!detail) return [];
    return (state.orders || []).filter(o => o.customerId === customerId && (o.status === "offered" || o.status === "angenommen" || o.status === "unterwegs"));
  }, [state.orders, customerId, detail]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await send("getCustomerDetail", { customerId });
        if (!cancelled) setDetail(r);
      } catch (e) {
        // Fehler wird als Toast angezeigt
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customerId, state.gameTime]);

  if (loading || !detail) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Lade Kundendaten…</div>;
  }

  const { customer, relation, isStammkunde, activeContract, completedContracts } = detail.summary;
  const offer = detail.offer;
  const capacity = detail.capacity;

  return (
    <div className="space-y-4">
      {/* Zurück-Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
      >
        <ArrowLeft className="w-4 h-4" /> Zurück zur Kundenübersicht
      </button>

      {/* Kundenprofil */}
      <div className="rounded-xl border border-white/10 glass p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-heading text-lg font-semibold">{customer.name}</h3>
              {isStammkunde && <Star className="w-4 h-4 text-lime fill-lime/30" />}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {customer.depots.join(", ")}</span>
              <span>·</span>
              <span>{customer.industry}</span>
              <span>·</span>
              <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {customer.contact}</span>
            </div>
          </div>
          {/* Vertrauen */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={`text-2xl font-bold tabular-nums ${getTrustColor(relation.trust)}`}>{relation.trust}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Vertrauen</div>
            <div className={`text-[10px] ${getTrustColor(relation.trust)}`}>{getTrustLabel(relation.trust)}</div>
          </div>
        </div>

        {/* Bevorzugte Relationen */}
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Bevorzugte Relationen:</div>
          <div className="flex flex-wrap gap-1.5">
            {customer.preferredRelations.map((r, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10">
                {r[0]} → {r[1]}
              </span>
            ))}
          </div>
        </div>

        {/* Frachtarten */}
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Frachtarten:</div>
          <div className="flex flex-wrap gap-1.5">
            {customer.cargoTypes.map((c, i) => (
              <span key={i} className="text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10">{c}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Beziehungsentwicklung */}
      <div className="rounded-xl border border-white/10 glass p-4 space-y-3">
        <h4 className="font-medium text-sm flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Beziehungsentwicklung</h4>

        {/* Statistiken */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <div className="font-medium tabular-nums">{relation.completedTransports}</div>
            <div className="text-muted-foreground text-[10px]">Erfolgreich</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <div className="font-medium tabular-nums text-lime">{relation.timelyTransports}</div>
            <div className="text-muted-foreground text-[10px]">Pünktlich</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <div className="font-medium tabular-nums text-coral/80">{relation.lateTransports}</div>
            <div className="text-muted-foreground text-[10px]">Verspätet</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <div className="font-medium tabular-nums text-coral">{relation.failedTransports}</div>
            <div className="text-muted-foreground text-[10px]">Gescheitert</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <div className="font-medium tabular-nums text-coral/70">{relation.cancelledTransports}</div>
            <div className="text-muted-foreground text-[10px]">Storniert</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <div className="font-medium tabular-nums">{formatEuro(relation.revenueCents)}</div>
            <div className="text-muted-foreground text-[10px]">Umsatz</div>
          </div>
        </div>

        {/* Stammkunden-Status */}
        <div className="text-xs space-y-1">
          {isStammkunde ? (
            <div className="flex items-center gap-1.5 text-lime">
              <Star className="w-3.5 h-3.5 fill-lime/30" />
              Stammkunde: ≥{STAMMKUNDE_MIN_TRANSPORTS} Transporte und ≥{STAMMKUNDE_MIN_TRUST} Vertrauen erreicht.
            </div>
          ) : (
            <div className="text-muted-foreground">
              Stammkunde bei ≥{STAMMKUNDE_MIN_TRANSPORTS} Transporten und ≥{STAMMKUNDE_MIN_TRUST} Vertrauen.
              Aktuell: {relation.completedTransports} Transporte, {relation.trust} Vertrauen.
            </div>
          )}
          <div className="text-muted-foreground/70 text-[11px]">
            Vertrauen startet bei {TRUST_START}. Pünktliche Lieferung: +2. Verspätet: −4. Gescheitert/Storniert: −6.
            Nicht angenommene Angebote haben keinen Einfluss.
            {relation.trackingSinceMin === state.gameTime && " Statistik seit Einführung dieses Systems erfasst."}
          </div>
        </div>

        {/* Historie */}
        {relation.history && relation.history.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Letzte Ereignisse:</div>
            <div className="max-h-32 overflow-y-auto space-y-0.5 scrollbar-none">
              {relation.history.slice(-10).reverse().map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                  <span className="text-muted-foreground tabular-nums shrink-0">{formatDay(h.min)}</span>
                  <span className={`shrink-0 ${h.delta > 0 ? "text-lime" : h.delta < 0 ? "text-coral" : "text-muted-foreground"}`}>
                    {h.delta > 0 ? "+" : ""}{h.delta}
                  </span>
                  <span className="text-muted-foreground truncate">{h.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Aktuelle Aufträge */}
      {customerOrders.length > 0 && (
        <div className="rounded-xl border border-white/10 glass p-4 space-y-2">
          <h4 className="font-medium text-sm flex items-center gap-1.5"><Package className="w-4 h-4" /> Aktuelle Aufträge ({customerOrders.length})</h4>
          <div className="space-y-1">
            {customerOrders.map(o => (
              <div key={o.id} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-white/5">
                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  o.isContractOrder ? "bg-lime/10 text-lime" : "bg-white/10 text-muted-foreground"
                }`}>
                  {o.isContractOrder ? "Vertrag" : "Markt"}
                </span>
                <span className="flex-1 truncate">{o.fromCity} → {o.toCity}</span>
                <span className="text-muted-foreground tabular-nums">{formatEuro(o.paymentCents)}</span>
                <span className="text-muted-foreground text-[10px]">{o.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gezielte Kundenansprache (nur ohne aktiven Vertrag) */}
      {(!activeContract || activeContract.status === "terminated") && (
        <OutreachPanel customerId={customerId} />
      )}

      {/* Vertragsangebot (nur Stammkunden ohne aktiven Vertrag) */}
      {offer && offer.status === "offered" && (
        <ContractOfferCard
          contract={offer}
          capacity={capacity}
          onAccept={async (cid) => { await send("acceptContract", { contractId: cid }); }}
          onDismiss={onBack}
        />
      )}

      {/* Aktiver/Abgeschlossener Vertrag */}
      {activeContract && activeContract.status !== "offered" && (
        <ContractView
          contract={activeContract}
          onTerminate={async (cid) => { await send("terminateContract", { contractId: cid }); }}
        />
      )}

      {/* Abgeschlossene Verträge */}
      {completedContracts.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Abgeschlossene Verträge</h4>
          {completedContracts.map(c => (
            <ContractView key={c.id} contract={c} onTerminate={async () => {}} />
          ))}
        </div>
      )}
    </div>
  );
}