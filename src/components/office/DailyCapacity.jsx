import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getCapacitySummary, getTodayObligations, getAutonomousActions } from "@/lib/dailyOverviewData";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { Wallet, Truck, Users, Calendar, Briefcase, ArrowRight } from "lucide-react";

// Kompakte Übersicht: Mittel, Kapazität, Verpflichtungen und
// selbstständige Mitarbeiteraktionen — alle aus Spieldaten.
export default function DailyCapacity({ state }) {
  const navigate = useNavigate();
  const capacity = useMemo(() => getCapacitySummary(state), [state]);
  const obligations = useMemo(() => getTodayObligations(state), [state]);
  const autonomous = useMemo(() => getAutonomousActions(state), [state]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Mittel & Kapazität */}
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
            <Wallet className="w-4 h-4 text-lime/70" /> Mittel & Kapazität
          </h3>
          <button onClick={() => navigate("/finanzen")}
            className="text-[10px] text-lime/70 hover:text-lime transition flex items-center gap-0.5">
            Details <ArrowRight className="w-2.5 h-2.5" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Liquidität */}
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">Netto verfügbar</span>
              <span className={`text-lg font-semibold tabular-nums ${capacity.liquidity.netAvailable >= 0 ? "text-foreground" : "text-red-300"}`}>
                {formatEuro(capacity.liquidity.netAvailable)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 mt-1">
              <span>Firmenbank {formatEuro(capacity.liquidity.bankBalance)}</span>
              <span>Kreditlinie {formatEuro(capacity.liquidity.availableCredit)}</span>
            </div>
            {(capacity.liquidity.openCompanyCosts > 0 || capacity.liquidity.dueLiabilities > 0) && (
              <div className="text-[10px] text-amber-300 mt-1">
                Offen: {formatEuro(capacity.liquidity.openCompanyCosts + capacity.liquidity.dueLiabilities)}
              </div>
            )}
          </div>

          <div className="h-px bg-white/5" />

          {/* Flotte */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5" /> Flotte
            </span>
            <div className="flex items-center gap-2 text-xs tabular-nums">
              <span className="text-lime">{capacity.fleet.free} frei</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-sky-300">{capacity.fleet.onTrip} unterwegs</span>
              {capacity.fleet.maintenance > 0 && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-amber-300">{capacity.fleet.maintenance} Wartung</span>
                </>
              )}
            </div>
          </div>

          {/* Fahrer */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Fahrer
            </span>
            <span className="text-xs tabular-nums text-foreground/80">
              {capacity.personnel.freeDrivers} von {capacity.personnel.totalDrivers} frei
            </span>
          </div>
        </div>
      </div>

      {/* Verpflichtungen heute */}
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
            <Calendar className="w-4 h-4 text-coral/70" /> Verpflichtungen heute
          </h3>
        </div>

        {obligations.length === 0 ? (
          <div className="text-xs text-muted-foreground/50 py-4 text-center">
            Keine Verpflichtungen heute.
          </div>
        ) : (
          <div className="space-y-2">
            {obligations.slice(0, 5).map((o, i) => (
              <div key={i} className="flex items-start justify-between gap-2 bg-surface-2/30 rounded-lg border border-white/5 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-foreground/90 truncate">{o.label}</div>
                  <div className="text-[10px] text-muted-foreground">{o.type}</div>
                </div>
                <div className="text-right shrink-0">
                  {o.atMin && <div className="text-[10px] text-muted-foreground tabular-nums">{formatGameTime(o.atMin)}</div>}
                  {o.amountCents > 0 && <div className="text-xs font-medium text-coral tabular-nums">{formatEuro(o.amountCents)}</div>}
                  {o.detail && <div className="text-[10px] text-muted-foreground">{o.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selbstständige Mitarbeiteraktionen */}
      <div className="glass border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-lime/70" /> Mitarbeiter erledigen selbstständig
          </h3>
          <button onClick={() => navigate("/personal")}
            className="text-[10px] text-lime/70 hover:text-lime transition flex items-center gap-0.5">
            Personal <ArrowRight className="w-2.5 h-2.5" />
          </button>
        </div>

        {autonomous.length === 0 ? (
          <div className="text-xs text-muted-foreground/50 py-4 text-center">
            Keine selbstständigen Aktionen aktiv.
          </div>
        ) : (
          <div className="space-y-2">
            {autonomous.slice(0, 4).map((a, i) => (
              <div key={i} className="bg-surface-2/30 rounded-lg border border-white/5 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground/90">{a.type}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{a.person}</div>
                <div className="text-[10px] text-muted-foreground/60 mt-0.5 leading-relaxed">{a.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}