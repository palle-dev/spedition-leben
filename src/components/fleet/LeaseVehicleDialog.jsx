import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { VEHICLE_BODY_TYPE_LIST } from "@/lib/gameData";
import { FileText, Check, ArrowRight, Wallet, Gauge } from "lucide-react";

const LEASE_OFFERS = [
  { id: "regional_flex", label: "Regional-Lkw", capacityTons: 8, consumptionPer100km: 22, monthlyRateCents: 54000, specialPaymentCents: 0, termMonths: 24 },
  { id: "standard_flex", label: "Standard-Lkw (Flex)", capacityTons: 12, consumptionPer100km: 28, monthlyRateCents: 90000, specialPaymentCents: 0, termMonths: 24 },
  { id: "standard", label: "Standard-Lkw (Niedrige Rate)", capacityTons: 12, consumptionPer100km: 28, monthlyRateCents: 80000, specialPaymentCents: 150000, termMonths: 24 },
  { id: "heavy_flex", label: "Schwerer Fernverkehrs-Lkw", capacityTons: 24, consumptionPer100km: 35, monthlyRateCents: 140000, specialPaymentCents: 0, termMonths: 24 },
];

export default function LeaseVehicleDialog({ branchId, branchCity, onClose }) {
  const { state, send, showToast } = useGame();
  const [offerId, setOfferId] = useState("standard_flex");
  const [bodyType, setBodyType] = useState("planen");
  const [leasing, setLeasing] = useState(false);

  const offer = LEASE_OFFERS.find(o => o.id === offerId) || LEASE_OFFERS[1];
  const body = VEHICLE_BODY_TYPE_LIST.find(b => b.id === bodyType) || VEHICLE_BODY_TYPE_LIST[0];
  const adjMonthly = Math.round(offer.monthlyRateCents * body.priceMultiplier);
  const adjSpecial = Math.round(offer.specialPaymentCents * body.priceMultiplier);
  const canAfford = state.company.accountCents >= adjSpecial + 150000;

  async function submit() {
    setLeasing(true);
    try {
      await send("leaseTruck", { provisionCity: branchCity, branchId, offerId: offer.id, bodyType });
      showToast(`${offer.label} (${body.label}) in ${branchCity} geleast.`, "success");
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setLeasing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass border border-white/15 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5 text-lime" />
          <h2 className="text-lg font-medium">Lkw leasen</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Standort: {branchCity}</p>

        {/* Leasing-Variante */}
        <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Leasing-Variante</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {LEASE_OFFERS.map(o => (
            <button
              key={o.id}
              onClick={() => setOfferId(o.id)}
              className={`text-left rounded-lg p-3 border transition ${
                offerId === o.id ? "border-lime/40 bg-lime/10" : "border-white/10 hover:border-white/20"
              }`}
            >
              <div className="text-sm font-medium">{o.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{o.capacityTons} t · {o.consumptionPer100km} L/100km</div>
              <div className="text-xs font-medium mt-1 tabular-nums">{formatEuro(o.monthlyRateCents)}/Monat</div>
              {o.specialPaymentCents > 0 && <div className="text-[10px] text-muted-foreground/70">+ {formatEuro(o.specialPaymentCents)} Sonderzahlung</div>}
            </button>
          ))}
        </div>

        {/* Aufbau */}
        <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Aufbau</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {VEHICLE_BODY_TYPE_LIST.map(b => (
            <button
              key={b.id}
              onClick={() => setBodyType(b.id)}
              className={`text-left rounded-lg p-3 border transition ${
                bodyType === b.id ? "border-lime/40 bg-lime/10" : "border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{b.label}</span>
                {bodyType === b.id && <Check className="w-3.5 h-3.5 text-lime" />}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{b.description}</div>
            </button>
          ))}
        </div>

        {/* Zusammenfassung */}
        <div className="rounded-lg border border-white/10 bg-surface-2/50 px-4 py-3 mb-4 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Fahrzeug</span>
            <span>{offer.label} · {body.label}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" /> Verbrauch</span>
            <span className="tabular-nums">{offer.consumptionPer100km + body.consumptionAdd} L/100km</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Monatliche Rate</span>
            <span className="font-medium tabular-nums">{formatEuro(adjMonthly)}</span>
          </div>
          {adjSpecial > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Sonderzahlung</span>
              <span className="font-medium tabular-nums">{formatEuro(adjSpecial)}</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg py-2.5 text-sm border border-white/10 text-muted-foreground hover:text-foreground transition">
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={leasing || !canAfford}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
          >
            {leasing ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><ArrowRight className="w-4 h-4" /> Leasen</>}
          </button>
        </div>
      </div>
    </div>
  );
}