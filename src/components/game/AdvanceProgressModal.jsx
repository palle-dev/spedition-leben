import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Clock, Package, Truck, Calendar, Coffee, Wrench, Calculator, Mail, X, AlertTriangle, Circle, CheckCircle2, Loader2 } from "lucide-react";

function formatLogEvent(ev) {
  const map = {
    delivery: { icon: Package, label: `Lieferung abgeschlossen${ev.paymentCents ? ` · ${(ev.paymentCents / 100).toFixed(2)} €` : ""}`, color: "text-lime" },
    daily_accounting: { icon: Calculator, label: "Tagesabrechnung durchgeführt", color: "text-sky-400" },
    phase_end: { icon: Clock, label: "Fahrtphase abgeschlossen", color: "text-muted-foreground" },
    tour_deployment_started: { icon: Truck, label: "Tour gestartet", color: "text-coral" },
    rest_end: { icon: Coffee, label: "Fahrer erholt", color: "text-emerald-400" },
    maintenance_end: { icon: Wrench, label: "Wartung abgeschlossen", color: "text-amber-400" },
    invitation_appeared: { icon: Mail, label: "Einladung erschienen", color: "text-purple-400" },
    invitation_missed: { icon: Mail, label: "Einladung verpasst", color: "text-red-400" },
    order_expired: { icon: X, label: "Auftrag abgelaufen", color: "text-red-400" },
    appointment_started: { icon: Calendar, label: "Termin begonnen", color: "text-sky-400" },
    appointment_done: { icon: Calendar, label: "Termin beendet", color: "text-sky-400" },
    emptytrip_completed: { icon: Truck, label: "Leerfahrt abgeschlossen", color: "text-muted-foreground" },
    advance_stopped: { icon: AlertTriangle, label: "Verarbeitung pausiert (Budget)", color: "text-amber-400" },
    ersatz_started: { icon: Calendar, label: "Ersatztermin begonnen", color: "text-sky-400" },
    ersatz_missed: { icon: Calendar, label: "Ersatztermin verpasst", color: "text-red-400" },
  };
  return map[ev.type] || { icon: Circle, label: ev.type, color: "text-muted-foreground" };
}

export default function AdvanceProgressModal({ progress, onClose }) {
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress?.events]);

  if (!progress) return null;

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const hoursDone = Math.floor(progress.current / 60);
  const hoursTotal = Math.ceil(progress.total / 60);
  const done = progress.done;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass border border-white/15 rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl animate-pop">
        <div className="flex items-center gap-3 mb-5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${done ? "bg-lime/15" : "bg-white/5"}`}>
            {done ? <CheckCircle2 className="w-5 h-5 text-lime" /> : <Loader2 className="w-5 h-5 text-lime animate-spin" />}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">{done ? "Zeit fortgesetzt" : "Zeit wird fortgesetzt"}</h2>
            <p className="text-xs text-muted-foreground">{hoursTotal} Stunden · {progress.events.length} Vorgänge verarbeitet</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground truncate">{progress.status}</span>
            <span className="text-xs font-medium tabular-nums text-foreground ml-2 shrink-0">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${done && !progress.error ? "bg-lime" : "bg-lime/80"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground tabular-nums">{progress.current} / {progress.total} Min</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">Stunde {Math.min(hoursDone, hoursTotal)} / {hoursTotal}</span>
          </div>
        </div>

        <div className="mb-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">Verarbeitete Vorgänge</div>
          <div ref={logRef} className="max-h-64 overflow-y-auto rounded-xl bg-black/30 border border-white/5 p-2 space-y-0.5">
            {progress.events.length === 0 ? (
              <div className="text-xs text-muted-foreground/50 text-center py-4">Noch keine Vorgänge</div>
            ) : (
              progress.events.map((ev, i) => {
                const { icon: Icon, label, color } = formatLogEvent(ev);
                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-white/5">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                    <span className="text-xs text-foreground/80 truncate">{label}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>

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