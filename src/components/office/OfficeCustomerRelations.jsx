import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CUSTOMER_PROFILES } from "@/lib/simulation/gameRules";
import {
  TRUST_START, STAMMKUNDE_MIN_TRANSPORTS, STAMMKUNDE_MIN_TRUST,
  CONTRACT_DURATION_DAYS,
} from "@/lib/simulation/customerEngine";
import { getTrustLabel, getTrustColor, formatEuro } from "@/lib/customerData";
import { Handshake, Heart, ArrowRight, TrendingUp, Package, Clock } from "lucide-react";

// Büro-Ansicht: aktive Rahmenverträge und Stammkunden-Zufriedenheit.
// Zeigt alle aktiven Verträge mit Fortschritt und Umsatz,
// sowie alle Stammkunden mit Vertrauensbarometer und Statistik.
export default function OfficeCustomerRelations({ state }) {
  const navigate = useNavigate();

  const { activeContracts, stammkunden } = useMemo(() => {
    const contracts = (state.contracts?.contracts || []).filter(c => c.status === "active");
    const currentDay = Math.floor((state.gameTime || 0) / 1440) + 1;

    const activeContracts = contracts.map(c => {
      const totalTransports = c.transportsPerDay * CONTRACT_DURATION_DAYS;
      const progress = totalTransports > 0 ? Math.round(c.deliveredCount / totalTransports * 100) : 0;
      const remainingDays = Math.max(0, c.endDay - currentDay);
      const customer = CUSTOMER_PROFILES.find(p => p.id === c.customerId);
      return { contract: c, customer, progress, remainingDays, totalTransports };
    }).sort((a, b) => a.contract.endDay - b.contract.endDay);

    const stammkunden = CUSTOMER_PROFILES
      .map(c => {
        const r = state.customerRelations?.relations?.[c.id];
        if (!r || !r.isStammkunde) return null;
        return { customer: c, relation: r };
      })
      .filter(Boolean)
      .sort((a, b) => b.relation.trust - a.relation.trust);

    return { activeContracts, stammkunden };
  }, [state.contracts, state.customerRelations, state.gameTime]);

  if (activeContracts.length === 0 && stammkunden.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Aktive Rahmenverträge */}
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
            <Handshake className="w-4 h-4 text-lime/70" /> Aktive Rahmenverträge
            <span className="text-xs text-muted-foreground tabular-nums">({activeContracts.length})</span>
          </h3>
          <button onClick={() => navigate("/kunden")}
            className="text-xs text-lime/70 hover:text-lime transition flex items-center gap-1">
            Kunden <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {activeContracts.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            Keine aktiven Rahmenverträge.
          </div>
        ) : (
          <div className="space-y-3">
            {activeContracts.map(({ contract: c, customer, progress, remainingDays, totalTransports }) => (
              <div key={c.id} className="bg-surface-2/30 rounded-lg border border-white/5 p-3.5 space-y-2.5">
                {/* Kopf */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm leading-tight truncate">
                      {customer?.name || c.customerName}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Package className="w-2.5 h-2.5" />
                      {c.fromCity} → {c.toCity} · {c.cargo} {c.tons}t
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-medium tabular-nums text-lime">
                      {formatEuro(c.paymentPerTransportCents)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">pro Transport</div>
                  </div>
                </div>

                {/* Fortschritt */}
                <div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                    <span>{c.deliveredCount} / {totalTransports} geliefert</span>
                    <span className="tabular-nums">{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-lime"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Kennzahlen */}
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <TrendingUp className="w-3 h-3" />
                      <span className="tabular-nums text-foreground">{formatEuro(c.revenueCents)}</span>
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {remainingDays > 0 ? `noch ${remainingDays} Tg` : "endet heute"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px]">
                    {c.timelyCount > 0 && <span className="text-lime tabular-nums">✓{c.timelyCount}</span>}
                    {c.lateCount > 0 && <span className="text-amber-300 tabular-nums">⚠{c.lateCount}</span>}
                    {c.failedCount > 0 && <span className="text-coral tabular-nums">✗{c.failedCount}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stammkunden-Zufriedenheit */}
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
            <Heart className="w-4 h-4 text-coral/70" /> Stammkunden
            <span className="text-xs text-muted-foreground tabular-nums">({stammkunden.length})</span>
          </h3>
          <button onClick={() => navigate("/kunden")}
            className="text-xs text-lime/70 hover:text-lime transition flex items-center gap-1">
            Kunden <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {stammkunden.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            Noch keine Stammkunden. Erreiche {STAMMKUNDE_MIN_TRANSPORTS} Transporte
            und {STAMMKUNDE_MIN_TRUST} Vertrauen bei einem Kunden.
          </div>
        ) : (
          <div className="space-y-2.5">
            {stammkunden.map(({ customer: c, relation: r }) => (
              <div key={c.id} className="bg-surface-2/30 rounded-lg border border-white/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm leading-tight truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{c.industry}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-sm font-semibold tabular-nums ${getTrustColor(r.trust)}`}>
                      {Math.round(r.trust)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">/100</span>
                  </div>
                </div>

                {/* Vertrauensbarometer */}
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      r.trust >= 80 ? "bg-lime" : r.trust >= 60 ? "bg-lime/70" : "bg-amber-300/70"
                    }`}
                    style={{ width: `${r.trust}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{getTrustLabel(r.trust)}</span>
                  <span className="tabular-nums">
                    {r.completedTransports} Transporte · {formatEuro(r.revenueCents)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}