import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatDay } from "@/lib/customerData";
import { FileText, Clock, MapPin, Package, TrendingUp, ArrowLeft, Gavel, CheckCircle2, XCircle } from "lucide-react";

export default function TenderList({ tenders, onSelect }) {
  if (!tenders || tenders.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 glass p-6 text-center">
        <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Keine offenen Ausschreibungen</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Sprechen Sie Kunden gezielt an, um Ausschreibungseinladungen zu erhalten.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tenders.map(tender => {
        const timeLeft = tender.offerDeadlineMin - (tender._gameTime || 0);
        const isUrgent = timeLeft < 1440 && tender.status === "open";
        const hasBid = !!tender.playerBid;

        return (
          <button
            key={tender.id}
            onClick={() => onSelect(tender.id)}
            className="w-full text-left rounded-xl border border-white/10 glass p-3 hover:bg-white/10 hover:border-lime/30 transition group"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    tender.status === "open" ? "bg-lime/10 text-lime" :
                    tender.status === "evaluating" ? "bg-amber-500/10 text-amber-400" :
                    tender.status === "awarded" ? "bg-lime/20 text-lime" :
                    "bg-coral/10 text-coral"
                  }`}>
                    {tender.status === "open" ? "Offen" :
                     tender.status === "evaluating" ? "In Bewertung" :
                     tender.status === "awarded" ? "Zuschlag" :
                     tender.status === "lost" ? "Nicht gewonnen" :
                     "Abgelaufen"}
                  </span>
                  {hasBid && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/10 text-muted-foreground">
                      Angebot abgegeben
                    </span>
                  )}
                </div>
                <div className="font-medium text-sm truncate">{tender.customerName}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{tender.fromCity} → {tender.toCity}</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1">
                  <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {tender.tons} t</span>
                  <span>·</span>
                  <span>{tender.transportsPerDay}×/Tag</span>
                  <span>·</span>
                  <span>{tender.durationDays} Tage</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                {tender.status === "open" && (
                  <div className={`text-[11px] flex items-center gap-1 ${isUrgent ? "text-coral" : "text-muted-foreground"}`}>
                    <Clock className="w-3 h-3" />
                    Frist: {formatDay(tender.offerDeadlineMin)}
                  </div>
                )}
                {tender.status === "awarded" && (
                  <div className="flex items-center gap-1 text-[11px] text-lime">
                    <CheckCircle2 className="w-3 h-3" />
                    Zuschlag
                  </div>
                )}
                {tender.status === "lost" && (
                  <div className="flex items-center gap-1 text-[11px] text-coral">
                    <XCircle className="w-3 h-3" />
                    Nicht gewonnen
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}