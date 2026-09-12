import React from "react";
import { useNavigate } from "react-router-dom";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { getOfferTypeLabel, getOfferTypeStyle, formatPaymentTerms } from "@/lib/marketData";
import { MapPin, ArrowRight, Clock, Package, Zap, CalendarClock, Check, Route as RouteIcon, Search } from "lucide-react";

// Angebot-Karte für die Frachtbörse.
// Zeigt Kundendaten, Route, Fracht, Preis, Fristen und Aktionen.
export default function OfferCard({ offer, onAccept, busy }) {
  const navigate = useNavigate();
  const typeIcon = offer.offerType === "express" ? Zap : offer.offerType === "advance" ? CalendarClock : Package;

  return (
    <div className="glass border border-white/10 rounded-xl p-4 hover:border-lime/30 transition flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-foreground truncate">{offer.customer}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{offer.cargo} · {offer.tons} t</div>
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

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${getOfferTypeStyle(offer.offerType)}`}>
          {React.createElement(typeIcon, { className: "w-2.5 h-2.5" })}
          {getOfferTypeLabel(offer.offerType)}
        </span>
        {offer.feasible === false && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-300 border-amber-400/20">
            Schwer ausführbar
          </span>
        )}
        {offer.feasible === true && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-lime/10 text-lime border-lime/20">
            Passend
          </span>
        )}
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
          onClick={() => navigate(`/disposition?order=${offer.id}`)}
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