import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro } from "@/lib/gameData";
import { VEHICLE_CATALOG_LIST, VEHICLE_BODY_TYPE_LIST } from "@/lib/gameData";
import { Truck, Check, ArrowRight, Wallet, Gauge, Package } from "lucide-react";

export default function BuyVehicleDialog({ branchId, branchCity, onClose }) {
  const { state, send, showToast } = useGame();
  const [vehicleType, setVehicleType] = useState("standard");
  const [bodyType, setBodyType] = useState("planen");
  const [buying, setBuying] = useState(false);

  const profile = VEHICLE_CATALOG_LIST.find(v => v.id === vehicleType) || VEHICLE_CATALOG_LIST[1];
  const body = VEHICLE_BODY_TYPE_LIST.find(b => b.id === bodyType) || VEHICLE_BODY_TYPE_LIST[0];
  const totalPrice = Math.round(profile.priceCents * body.priceMultiplier);
  const canAfford = state.company.accountCents >= totalPrice;
  const openCompany = state.openCosts.some(o => o.account === "company");

  async function submit() {
    setBuying(true);
    try {
      await send("buyVehicle", { branchId, vehicleType, bodyType });
      showToast(`${profile.label} (${body.label}) in ${branchCity} übernommen.`, "success");
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBuying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="glass border border-white/15 rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <Truck className="w-5 h-5 text-lime" />
          <h2 className="text-lg font-medium">Neuen Lkw kaufen</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">Standort: {branchCity}</p>

        {openCompany && (
          <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2 mb-4">
            Es gibt offene betriebliche Kosten — Kauf derzeit nicht möglich.
          </div>
        )}

        {/* Fahrzeuggröße */}
        <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 block">Fahrzeuggröße</label>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {VEHICLE_CATALOG_LIST.map(v => {
            const price = Math.round(v.priceCents * body.priceMultiplier);
            return (
              <button
                key={v.id}
                onClick={() => setVehicleType(v.id)}
                className={`text-left rounded-lg p-3 border transition ${
                  vehicleType === v.id ? "border-lime/40 bg-lime/10" : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className="text-sm font-medium">{v.label}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{v.capacityTons} t · {v.powertrain === "electric" ? `${v.consumptionKWhPer100km} kWh` : `${v.consumptionPer100km} L`}/100 km</div>
                <div className="text-xs font-medium mt-1 tabular-nums">{formatEuro(price)}</div>
              </button>
            );
          })}
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
              <div className="text-[10px] text-muted-foreground/70 mt-1">
                {b.priceMultiplier > 1 ? `+${Math.round((b.priceMultiplier - 1) * 100)}% Preis` : "Basispreis"}
                {b.consumptionAdd > 0 && ` · +${b.consumptionAdd * (profile.powertrain === "electric" ? 2 : 1)} ${profile.powertrain === "electric" ? "kWh" : "L"}/100 km`}
              </div>
            </button>
          ))}
        </div>

        {/* Zusammenfassung */}
        <div className="rounded-lg border border-white/10 bg-surface-2/50 px-4 py-3 mb-4 space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5"><Package className="w-3.5 h-3.5" /> Fahrzeug</span>
            <span>{profile.label} · {body.label}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5"><Gauge className="w-3.5 h-3.5" /> Verbrauch</span>
            <span className="tabular-nums">{profile.powertrain === "electric" ? (( profile.consumptionKWhPer100km + body.consumptionAdd * 2) + " kWh/100 km") : ((profile.consumptionPer100km + body.consumptionAdd) + " L/100 km")}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Kaufpreis</span>
            <span className="font-medium tabular-nums">{formatEuro(totalPrice)}</span>
          </div>
        </div>

        {profile.powertrain === "electric" && <div className="rounded-lg border border-lime/20 bg-lime/5 p-3 mb-4 text-xs space-y-1"><p className="font-medium text-lime">{profile.batteryCapacityKWh} kWh Batterie · bis {profile.maxChargeKw} kW DC</p><p>Voll geladen bei Übergabe. Depotladung benötigt Wallbox oder DC-Lader unter Filialen → Energie & E-Mobilität. Öffentliche Ladestopps werden mit Zeit und Kosten in die Disposition einbezogen.</p><p className="text-muted-foreground">Fiktive Fahrzeugwerte und Spieltarife.</p></div>}
        {/* Buttons */}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg py-2.5 text-sm border border-white/10 text-muted-foreground hover:text-foreground transition">
            Abbrechen
          </button>
          <button
            onClick={submit}
            disabled={buying || !canAfford || openCompany}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
          >
            {buying ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><ArrowRight className="w-4 h-4" /> Kaufen</>}
          </button>
        </div>
      </div>
    </div>
  );
}