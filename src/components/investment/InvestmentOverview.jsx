import React, { useMemo } from "react";
import { getDepotSummary, getMarketStatus, formatCents, formatPct } from "@/lib/investmentData";
import { Building2, User, CircleDot } from "lucide-react";

// Übersicht beider Depots mit Kennzahlen und Marktstatus.
export default function InvestmentOverview({ state }) {
  const company = useMemo(() => getDepotSummary(state, "company"), [state]);
  const priv = useMemo(() => getDepotSummary(state, "private"), [state]);
  const market = useMemo(() => getMarketStatus(state), [state]);

  return (
    <div className="space-y-4">
      {/* Marktstatus */}
      <div className="glass border border-white/10 rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <CircleDot className="w-4 h-4 text-invest-cyan shrink-0" />
        <div className="text-sm font-medium text-foreground">Marktstatus</div>
        <div className="flex items-center gap-3 text-xs">
          <span className={`px-2 py-1 rounded-md ${market.stockOpen ? "bg-lime/10 text-lime" : "bg-white/5 text-muted-foreground"}`}>
            Aktien {market.stockOpen ? "offen" : "geschlossen"}
          </span>
          <span className={`px-2 py-1 rounded-md ${market.cryptoOpen ? "bg-lime/10 text-lime" : "bg-white/5 text-muted-foreground"}`}>
            Krypto {market.cryptoOpen ? "offen" : "geschlossen"}
          </span>
          <span className="text-muted-foreground">Regime: <span className="text-invest-purple capitalize">{({ neutral: "Neutral", positive: "Aufschwung", negative: "Abschwung" })[market.regime] || market.regime}</span></span>
        </div>
      </div>

      {/* Depot-Karten */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DepotCard summary={company} label="Firmendepot" icon={Building2} accent="lime" />
        <DepotCard summary={priv} label="Privatdepot" icon={User} accent="coral" />
      </div>
    </div>
  );
}

function DepotCard({ summary, label, icon: Icon, accent }) {
  if (!summary) return null;
  const accentText = accent === "lime" ? "text-lime" : "text-coral";
  const accentBg = accent === "lime" ? "bg-lime/10" : "bg-coral/10";

  return (
    <div className="glass border border-white/10 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-8 h-8 rounded-lg ${accentBg} grid place-items-center`}>
          <Icon className={`w-4 h-4 ${accentText}`} />
        </div>
        <h3 className="text-sm font-medium">{label}</h3>
      </div>

      <div className="text-2xl font-semibold tabular-nums mb-1">{formatCents(summary.totalValueCents)}</div>
      <div className="text-xs text-muted-foreground mb-4">Gesamtwert</div>

      <div className="space-y-2 border-t border-white/5 pt-3">
        <Row label="Verrechnungskonto" value={formatCents(summary.settlementCents)} />
        <Row label="Freie Liquidität" value={formatCents(summary.freeSettlementCents)} tone={summary.freeSettlementCents > 0 ? "default" : "muted"} />
        <Row label="Reserviert" value={formatCents(summary.reservedCents)} tone="muted" />
        <Row label="Marktwert Positionen" value={formatCents(summary.marketValueCents)} />
        <Row label="Realisierter Gewinn/Verlust"
          value={formatCents(summary.realizedPnlCents)}
          tone={summary.realizedPnlCents >= 0 ? "lime" : "red"} />
      </div>

      {summary.positions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Größte Positionen</div>
          <div className="space-y-1.5">
            {summary.positions.slice(0, 3).map(p => (
              <div key={p.instrumentId} className="flex items-center justify-between text-xs">
                <span className="text-foreground/80 truncate">{p.name}</span>
                <span className={`tabular-nums ${p.unrealizedPnlCents >= 0 ? "text-lime" : "text-red-300"}`}>
                  {formatPct(p.unrealizedPct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone = undefined }) {
  const toneClass = tone === "lime" ? "text-lime" : tone === "red" ? "text-red-300" : tone === "muted" ? "text-muted-foreground/60" : "text-foreground/80";
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}