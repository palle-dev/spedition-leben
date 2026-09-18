import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatEuro, directionClass, sourceIcon, certaintyLabel, certaintyClass } from "@/lib/forecastData";

// Tagesübersicht mit aufklappbarer Detailansicht der Zahlungen.
export default function ForecastTable({ forecast }) {
  const [expandedDay, setExpandedDay] = useState(null);

  if (!forecast || !forecast.days) {
    return <div className="text-sm text-muted-foreground py-4">Keine Daten</div>;
  }

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-white/5 text-xs font-medium text-muted-foreground">
        <div className="col-span-1">Tag</div>
        <div className="col-span-3 text-right">Firma Ein</div>
        <div className="col-span-3 text-right">Firma Aus</div>
        <div className="col-span-2 text-right">Firma Endsaldo</div>
        <div className="col-span-2 text-right">Privat Endsaldo</div>
        <div className="col-span-1 text-center">Detail</div>
      </div>

      {/* Zeilen */}
      {forecast.days.map((d) => {
        const isExpanded = expandedDay === d.day;
        const companyLow = d.companyEndBalance < 0;
        const privateLow = d.privateEndBalance < 0;
        return (
          <div key={d.day} className="border-t border-white/5">
            <div
              className={`grid grid-cols-12 gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-white/5 transition ${
                isExpanded ? "bg-white/5" : ""
              }`}
              onClick={() => setExpandedDay(isExpanded ? null : d.day)}
            >
              <div className="col-span-1 font-medium tabular-nums">T{d.day}</div>
              <div className="col-span-3 text-right tabular-nums text-lime">
                {d.companyIn > 0 ? "+" + formatEuro(d.companyIn) : "—"}
              </div>
              <div className="col-span-3 text-right tabular-nums text-coral">
                {d.companyOut > 0 ? "−" + formatEuro(d.companyOut) : "—"}
              </div>
              <div className={`col-span-2 text-right tabular-nums font-medium ${
                companyLow ? "text-red-400" : "text-foreground"
              }`}>
                {formatEuro(d.companyEndBalance)}
              </div>
              <div className={`col-span-2 text-right tabular-nums font-medium ${
                privateLow ? "text-red-400" : "text-foreground"
              }`}>
                {formatEuro(d.privateEndBalance)}
              </div>
              <div className="col-span-1 flex items-center justify-center">
                {d.positions.length > 0 && (
                  isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* Detailansicht */}
            {isExpanded && d.positions.length > 0 && (
              <div className="px-3 pb-3 bg-black/20">
                <div className="space-y-1 mt-1">
                  {d.positions
                    .sort((a, b) => (a.min || 0) - (b.min || 0))
                    .map((p, i) => (
                      <div
                        key={p.sourceId + ":" + i}
                        className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-white/3"
                      >
                        <span className="w-4 text-center">{sourceIcon(p.sourceType)}</span>
                        <span className="flex-1 truncate text-foreground/90">{p.label}</span>
                        <span className={`text-[10px] ${certaintyClass(p.certainty)}`}>
                          {certaintyLabel(p.certainty)}
                        </span>
                        <span className={`tabular-nums font-medium ${directionClass(p.direction)}`}>
                          {p.direction === "in" ? "+" : "−"}{formatEuro(p.amountCents)}
                        </span>
                        <span className="text-[10px] text-muted-foreground w-12 text-right">
                          {p.account === "company" ? "Firma" : "Privat"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Detailansicht: keine Positionen */}
            {isExpanded && d.positions.length === 0 && (
              <div className="px-3 pb-3 bg-black/20">
                <div className="text-xs text-muted-foreground py-2 px-2">
                  Keine Zahlungen an diesem Tag.
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Zusammenfassung */}
      <div className="border-t border-white/10 px-3 py-2 bg-white/5 grid grid-cols-12 gap-2 text-xs">
        <div className="col-span-1 font-medium">Σ</div>
        <div className="col-span-3 text-right tabular-nums text-lime">
          +{formatEuro(forecast.days.reduce((s, d) => s + d.companyIn, 0))}
        </div>
        <div className="col-span-3 text-right tabular-nums text-coral">
          −{formatEuro(forecast.days.reduce((s, d) => s + d.companyOut, 0))}
        </div>
        <div className="col-span-2 text-right tabular-nums font-medium">
          {formatEuro(forecast.company.endBalance)}
        </div>
        <div className="col-span-2 text-right tabular-nums font-medium">
          {formatEuro(forecast.private.endBalance)}
        </div>
        <div className="col-span-1"></div>
      </div>
    </div>
  );
}