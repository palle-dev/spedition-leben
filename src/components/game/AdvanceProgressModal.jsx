import React from "react";
import { createPortal } from "react-dom";
import { Truck, Package, CheckCircle2, Loader2, MapPin, AlertTriangle } from "lucide-react";
import { formatEuro } from "@/lib/gameData";

function branchLabel(state, branchId) {
  if (!branchId || branchId === "_haupt") return "Hauptsitz";
  const b = (state?.branches || []).find(b => b.id === branchId);
  return b ? b.name : "Filiale";
}

export default function AdvanceProgressModal({ progress, onClose, state }) {
  if (!progress) return null;

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const hoursDone = Math.floor(progress.current / 60);
  const hoursTotal = Math.ceil(progress.total / 60);
  const done = progress.done;
  const stats = progress.stats || null;
  const branchEntries = stats ? Object.entries(stats.branches || {}) : [];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass border border-white/15 rounded-2xl max-w-md w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl animate-pop">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${done ? "bg-lime/15" : "bg-white/5"}`}>
            {progress.error ? <AlertTriangle className="w-5 h-5 text-amber-300"/> : done ? <CheckCircle2 className="w-5 h-5 text-lime" /> : <Loader2 className="w-5 h-5 text-lime animate-spin" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{progress.error ? "Vorlauf unterbrochen" : done ? "Zeit fortgesetzt" : "Zeit wird fortgesetzt"}</h2>
            <p className="text-xs text-muted-foreground">{hoursTotal} Stunden · {progress.eventCount || 0} Vorgänge</p>
          </div>
        </div>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground whitespace-normal break-words">{progress.status}</span>
            <span className="text-xs font-medium tabular-nums text-foreground ml-2 shrink-0">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${done && !progress.error ? "bg-lime" : "bg-lime/80"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground tabular-nums">Stunde {Math.min(hoursDone, hoursTotal)} / {hoursTotal}</span>
          </div>
        </div>

        {/* Gesamt-Übersicht */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
            <Truck className="w-4 h-4 text-coral mx-auto mb-1" />
            <div className="text-lg font-semibold tabular-nums text-foreground">{stats ? stats.totalTours : "—"}</div>
            <div className="text-[10px] text-muted-foreground">Touren</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
            <Package className="w-4 h-4 text-lime mx-auto mb-1" />
            <div className="text-lg font-semibold tabular-nums text-foreground">{stats ? stats.totalDeliveries : "—"}</div>
            <div className="text-[10px] text-muted-foreground">Lieferungen</div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <div className="text-sm font-semibold tabular-nums text-foreground leading-tight mt-1">{stats ? formatEuro(stats.totalRevenue) : "—"}</div>
            <div className="text-[10px] text-muted-foreground">Umsatz</div>
          </div>
        </div>

        {/* Standort-Aufschlüsselung */}
        {branchEntries.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Standorte
            </div>
            <div className="space-y-1.5">
              {branchEntries.map(([bid, s]) => (
                <div key={bid} className="flex items-center justify-between rounded-lg bg-black/30 border border-white/5 px-3 py-2">
                  <span className="text-xs text-foreground/80 truncate">{branchLabel(state, bid)}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[10px] text-muted-foreground tabular-nums">{s.tours}T</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{s.deliveries}L</span>
                    <span className="text-xs font-medium tabular-nums text-lime">{formatEuro(s.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {done && (
          <button
            onClick={onClose}
            className={`w-full rounded-lg py-2.5 text-sm font-medium border transition ${
              progress.error
                ? "bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/25"
                : "bg-lime/15 text-lime border-lime/30 hover:bg-lime/25"
            }`}
          >
            Schließen
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}