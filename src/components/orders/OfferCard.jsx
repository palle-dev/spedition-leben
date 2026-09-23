import React from "react";
import { useNavigate } from "react-router-dom";
import { formatEuro, formatGameTime, getCargoCategory, VEHICLE_BODY_TYPES } from "@/lib/gameData";
import { getOfferTypeLabel, getOfferTypeStyle, formatPaymentTerms } from "@/lib/marketData";
import { MapPin, ArrowRight, Clock, Package, Zap, CalendarClock, Check, Route as RouteIcon, Search, Flame, Droplet, Building2, Truck } from "lucide-react";

// Angebot-Karte für die Frachtbörse.
// Zeigt Kundendaten, Route, Fracht, Preis, Fristen und Aktionen.
export default function OfferCard({ offer, assessment = null, onAccept, busy, branchName, branchCity, selected, onToggleSelect }) {
  const navigate = useNavigate();
  const typeIcon = offer.offerType === "express" ? Zap : offer.offerType === "advance" ? CalendarClock : Package;

  return (
    <div className={`glass border rounded-xl p-4 transition flex flex-col gap-3 ${selected ? "border-lime/50 bg-lime/5" : "border-white/10 hover:border-lime/30"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {onToggleSelect && (
            <button
              onClick={() => onToggleSelect(offer.id)}
              className={`shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition ${selected ? "bg-lime border-lime text-ink" : "border-white/20 hover:border-lime/50"}`}
              aria-label={selected ? "Abwählen" : "Auswählen"}
            >
              {selected && <Check className="w-3.5 h-3.5" />}
            </button>
          )}
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{offer.customer}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{offer.cargo} · {offer.tons} t</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-medium text-lime tabular-nums">{formatEuro(offer.paymentCents)}</div>
          <div className="text-[10px] text-muted-foreground">{formatPaymentTerms(offer.paymentTermsDays)}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{offer.fromCity}</span>
        <ArrowRight className="w-3 h-3 shrink-0" />
        <span className="truncate">{offer.toCity}</span>
      </div>

      {branchName && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
          <Building2 className="w-2.5 h-2.5" /> Zuständig: {branchName}{branchCity ? ` (${branchCity})` : ""}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${getOfferTypeStyle(offer.offerType)}`}>
          {React.createElement(typeIcon, { className: "w-2.5 h-2.5" })}
          {getOfferTypeLabel(offer.offerType)}
        </span>
        {assessment && (
          <span title={assessment.detail} className={`text-[10px] px-1.5 py-0.5 rounded border ${assessment.status === "on_time" ? "bg-lime/10 text-lime border-lime/20" : "bg-amber-500/10 text-amber-300 border-amber-400/20"}`}>
            {assessment.label}
          </span>
        )}
        {offer.isDangerousGoods && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-orange-500/10 text-orange-300 border-orange-400/20 inline-flex items-center gap-1">
            {offer.dgTransportType === "tank" ? <Droplet className="w-2.5 h-2.5" /> : <Flame className="w-2.5 h-2.5" />}
            ADR {offer.dgClass} · {offer.dgTransportType === "tank" ? "Tank" : "Versandstück"}
          </span>
        )}
        {(() => {
          const cat = getCargoCategory(offer);
          if (cat.requiredBodyType) {
            const body = VEHICLE_BODY_TYPES[cat.requiredBodyType];
            return (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-violet-500/10 text-violet-300 border-violet-400/20 inline-flex items-center gap-1">
                <Truck className="w-2.5 h-2.5" /> Erfordert: {body.label}
              </span>
            );
          }
          if (cat.bonusBodyType) {
            const body = VEHICLE_BODY_TYPES[cat.bonusBodyType];
            return (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-sky-500/10 text-sky-300 border-sky-400/20 inline-flex items-center gap-1">
                <Truck className="w-2.5 h-2.5" /> Bonus: {body.label}
              </span>
            );
          }
          return null;
        })()}
      </div>

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          Annahme bis {formatGameTime(offer.acceptDeadlineMin)}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        Lieferung bis {formatGameTime(offer.deliveryDeadlineMin)}
      </div>

      <div className="flex items-center gap-2 mt-auto pt-1">
        <button
          onClick={() => onAccept(offer)}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-lime text-ink text-xs font-semibold hover:brightness-110 disabled:opacity-50 transition active:scale-[0.98]"
        >
          {busy ? <span className="w-3.5 h-3.5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Nur annehmen</>}
        </button>
        <button
          onClick={() => onAccept(offer, true)}
          disabled={busy}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition active:scale-[0.98]"
        >
          <RouteIcon className="w-3.5 h-3.5" /> Annehmen & planen
        </button>
      </div>
      <button
        onClick={() => navigate(`/disposition?order=${offer.id}&action=return`)}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 bg-white/5 border border-white/10 text-[11px] text-muted-foreground hover:bg-white/10 transition active:scale-[0.98]"
      >
        <Search className="w-3 h-3" /> Rückladung finden
      </button>
    </div>
  );
}