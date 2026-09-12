import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime, CITIES } from "@/lib/gameData";
import { LEASING_OFFER_LIST, checkFinancingAccess } from "@/lib/financingData";
import { Truck, MapPin, Gauge, Package, Check, AlertCircle, RotateCcw, ShoppingBag, XCircle, Info } from "lucide-react";

export default function LeasingSection() {
  const { state, send, showToast } = useGame();
  const [selectedOfferId, setSelectedOfferId] = useState(LEASING_OFFER_LIST[0].id);
  const [provisionCity, setProvisionCity] = useState(LEASING_OFFER_LIST[0].returnLocationCity);
  const [signing, setSigning] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const offer = LEASING_OFFER_LIST.find(o => o.id === selectedOfferId) || LEASING_OFFER_LIST[0];
  const access = useMemo(() => checkFinancingAccess(state, { type: "leasing", offerId: selectedOfferId, provisionCity }), [state, selectedOfferId, provisionCity]);

  const contracts = (state.leasingContracts || []).filter(c => c.status === "active" || c.status === "ending");

  async function signLease() {
    setSigning(true);
    try {
      await send("leaseTruck", { provisionCity, offerId: selectedOfferId });
      showToast(`Leasingvertrag abgeschlossen — Fahrzeug in ${provisionCity}`, "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setSigning(false); }
  }

  async function doAction(contractId, action) {
    setBusyId(contractId + action);
    try {
      await send(action, { contractId });
      showToast("Aktion ausgeführt", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-4">
      {/* Varianten-Auswahl */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-muted-foreground">Leasingvariante wählen</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {LEASING_OFFER_LIST.map(o => {
            const active = o.id === selectedOfferId;
            return (
              <button key={o.id} onClick={() => { setSelectedOfferId(o.id); setProvisionCity(o.returnLocationCity); }}
                className={`text-left rounded-xl p-3 border transition active:scale-[0.98] ${active ? "bg-lime/10 border-lime/40" : "bg-surface-2/50 border-white/10 hover:border-white/20"}`}>
                <div className="text-sm font-semibold">{o.id === "standard_flex" ? "Variante A" : "Variante B"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{o.id === "standard_flex" ? "Flexibler Einstieg" : "Niedrigere Rate"}</div>
                <div className="mt-2 space-y-0.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Sonderzahlung</span><span className="tabular-nums">{formatEuro(o.specialPaymentCents)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Monatliche Rate</span><span className="tabular-nums">{formatEuro(o.monthlyRateCents)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Grundzahlungen</span><span className="tabular-nums">{formatEuro(o.specialPaymentCents + o.termMonths * o.monthlyRateCents)}</span></div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Angebot-Detail */}
      <div className="glass border border-white/10 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Truck className="w-4 h-4 text-lime/70" /> {offer.label}: {offer.vehicleType}</div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Info2 icon={Package} label="Nutzlast" value={`${offer.capacityTons} t`} />
          <Info2 icon={Gauge} label="Verbrauch" value={`${offer.consumptionPer100km} L/100km`} />
          <Info2 icon={MapPin} label="Rückgabeort" value={offer.returnLocationCity} />
          <Info2 icon={Truck} label="Laufzeit" value={`${offer.termMonths} Monate`} />
        </div>

        <div className="space-y-1.5 text-xs border-t border-white/10 pt-3">
          <Row label="Sonderzahlung bei Bereitstellung" value={formatEuro(offer.specialPaymentCents)} negative={offer.specialPaymentCents > 0} />
          <Row label="Monatliche Rate (nachschüssig)" value={formatEuro(offer.monthlyRateCents)} negative />
          <Row label="Erste Rate fällig" value={formatGameTime(state.gameTime + 30 * 1440)} />
          <Row label="Inklusive Kilometer (Gesamt)" value={`${offer.includedKm.toLocaleString("de-DE")} km`} />
          <Row label="Mehrkilometer-Preis" value={`${(offer.mileageRatePerKmCents / 100).toFixed(2)} €/km`} />
          <Row label="Kaufoption am Ende" value={formatEuro(offer.buyoutPriceCents)} />
          <Row label="Mindestzustand bei Rückgabe" value={`${offer.minConditionAtReturn}/100`} />
        </div>

        {/* Kostenvergleich */}
        <div className="text-xs bg-surface-2/50 rounded-lg p-3 border border-white/5 space-y-1">
          <div className="text-muted-foreground font-medium mb-1">Kostenvergleich</div>
          <Row label="Ohne Übernahme (Grundzahlungen)" value={formatEuro(offer.specialPaymentCents + offer.termMonths * offer.monthlyRateCents)} />
          <Row label="Mit Kaufoption (zusätzlich)" value={formatEuro(offer.specialPaymentCents + offer.termMonths * offer.monthlyRateCents + offer.buyoutPriceCents)} />
          <div className="text-[10px] text-muted-foreground/60 pt-1">Zuzüglich Kraftstoff, Maut, Wartung, Fahrerlöhne. Mehrkilometer bei Überschreitung.</div>
        </div>

        {/* Bereitstellungsort */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Bereitstellungsort</label>
          <select value={provisionCity} onChange={e => setProvisionCity(e.target.value)}
            className="w-full rounded-lg bg-surface-2 border border-white/10 px-3 py-2 text-sm focus:outline-none focus:border-lime/40">
            {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Hinweise (nicht sperrend) */}
        {access.notices.map((n, i) => (
          <div key={i} className="text-xs text-amber-300/80 flex items-start gap-1.5"><Info className="w-3 h-3 mt-0.5 shrink-0" /> {n}</div>
        ))}

        {/* Harte Blockaden */}
        {access.blockingReasons.map((r, i) => (
          <div key={i} className="text-xs text-coral flex items-start gap-1.5"><AlertCircle className="w-3 h-3 mt-0.5 shrink-0" /> {r}</div>
        ))}

        <button onClick={signLease} disabled={!access.allowed || signing}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime text-ink font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]">
          {signing ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
          Leasingvertrag abschließen{offer.specialPaymentCents > 0 ? ` (${formatEuro(offer.specialPaymentCents)})` : " (0 €)"}
        </button>
      </div>

      {/* Aktive Verträge */}
      {contracts.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Aktive Leasingverträge</div>
          {contracts.map(c => {
            const vehicle = state.vehicles.find(v => v.id === c.vehicleId);
            const drivenKm = (vehicle?.odometerKm || 0) - c.startOdometerKm;
            const excessKm = Math.max(0, drivenKm - c.includedKm);
            const isEnding = c.status === "ending";
            const atReturnCity = vehicle?.locationCity === c.returnLocationCity;
            const canReturn = vehicle && vehicle.status !== "on_trip" && atReturnCity;

            return (
              <div key={c.id} className={`glass border rounded-xl p-4 space-y-3 ${isEnding ? "border-amber-400/30" : "border-white/10"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.id}</span>
                    {c.offerId === "standard_flex" && <span className="text-xs px-1.5 py-0.5 rounded bg-lime/15 text-lime">Variante A</span>}
                    {c.offerId === "standard" && <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-foreground/70">Variante B</span>}
                    {isEnding && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">Endet</span>}
                    {c.overdueRatesCents > 0 && <span className="text-xs px-1.5 py-0.5 rounded bg-coral/20 text-coral">Rückstand</span>}
                  </div>
                  <span className="text-xs text-muted-foreground">Ende: {formatGameTime(c.endMin)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Fahrzeug:</span> <span className="text-foreground/80">{vehicle ? `Lkw ${vehicle.id.replace(/\D/g, "")}` : "—"}</span></div>
                  <div><span className="text-muted-foreground">Standort:</span> <span className="text-foreground/80">{vehicle?.locationCity || "—"}</span></div>
                  <div><span className="text-muted-foreground">Raten bezahlt:</span> <span className="text-foreground/80">{c.paidRates}/{c.termMonths}</span></div>
                  <div><span className="text-muted-foreground">Nächste Rate:</span> <span className="text-foreground/80">{c.nextRateDueMin ? formatGameTime(c.nextRateDueMin) : "—"}</span></div>
                  <div><span className="text-muted-foreground">Gefahrene km:</span> <span className="text-foreground/80">{drivenKm.toLocaleString("de-DE")} km</span></div>
                  <div><span className="text-muted-foreground">Inklusive km:</span> <span className="text-foreground/80">{c.includedKm.toLocaleString("de-DE")} km</span></div>
                  {excessKm > 0 && <div className="col-span-2"><span className="text-coral">Mehrkilometer: {excessKm.toLocaleString("de-DE")} km → {formatEuro(excessKm * c.mileageRatePerKmCents)}</span></div>}
                  {c.overdueRatesCents > 0 && <div className="col-span-2"><span className="text-coral">Offene Raten: {formatEuro(c.overdueRatesCents)}</span></div>}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
                  <button onClick={() => doAction(c.id, "returnLeasedTruck")} disabled={!canReturn || busyId === c.id + "returnLeasedTruck"}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-white/5 border border-white/10 text-xs hover:bg-white/10 disabled:opacity-40 transition active:scale-95">
                    {busyId === c.id + "returnLeasedTruck" ? <span className="w-3 h-3 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" /> : <RotateCcw className="w-3 h-3" />} Rückgabe
                  </button>
                  <button onClick={() => doAction(c.id, "buyoutLeasedTruck")} disabled={busyId === c.id + "buyoutLeasedTruck"}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-lime/10 border border-lime/20 text-xs text-lime hover:bg-lime/20 disabled:opacity-40 transition active:scale-95">
                    {busyId === c.id + "buyoutLeasedTruck" ? <span className="w-3 h-3 border-2 border-lime/30 border-t-lime rounded-full animate-spin" /> : <ShoppingBag className="w-3 h-3" />} Kaufoption ({formatEuro(c.buyoutPriceCents)})
                  </button>
                  <button onClick={() => doAction(c.id, "earlyTerminateLease")} disabled={busyId === c.id + "earlyTerminateLease"}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 bg-coral/5 border border-coral/20 text-xs text-coral hover:bg-coral/10 disabled:opacity-40 transition active:scale-95">
                    {busyId === c.id + "earlyTerminateLease" ? <span className="w-3 h-3 border-2 border-coral/30 border-t-coral rounded-full animate-spin" /> : <XCircle className="w-3 h-3" />} Vorzeitig auflösen
                  </button>
                </div>
                {vehicle && !atReturnCity && <div className="text-xs text-amber-300 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Fahrzeug muss nach {c.returnLocationCity} zur Rückgabe</div>}
                {vehicle?.status === "on_trip" && <div className="text-xs text-amber-300 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Fahrzeug ist auf Tour</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Info2({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="w-3.5 h-3.5 text-foreground/40" /> <span className="text-muted-foreground/60">{label}:</span> <span className="text-foreground/80">{value}</span></div>;
}
function Row({ label, value, negative }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className={`tabular-nums ${negative ? "text-coral" : "text-foreground/80"}`}>{value}</span></div>;
}