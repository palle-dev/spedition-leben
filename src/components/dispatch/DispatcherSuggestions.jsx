import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { vehicleDisplayName, driverDisplayName, roleLabel } from "@/lib/displayHelpers";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import Portrait from "@/components/ui/Portrait";
import { Check, X, Truck, ArrowRight, Headset } from "lucide-react";

// Zeigt alle ausstehenden Disponenten-Vorschläge mit Bestätigen/Ablehnen.
export default function DispatcherSuggestions() {
  const { state, send, showToast } = useGame();
  const [busy, setBusy] = useState(null);

  // Alle Vorschläge von allen Disponenten sammeln
  const allSuggestions = (state.employees || [])
    .filter(e => e.role === "dispatcher" || e.role === "dispatcher_senior")
    .flatMap(emp => {
      return (emp.suggestions || [])
        .filter(s => s.status === "pending")
        .map(s => ({ ...s, employee: emp }));
    });

  async function confirm(empId, sugId) {
    const key = `${empId}:${sugId}`;
    setBusy(key);
    try {
      const r = await send("confirmDispatcherSuggestion", { employeeId: empId, suggestionId: sugId });
      showToast("Vorschlag bestätigt – Tour gestartet.", "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(empId, sugId) {
    const key = `${empId}:${sugId}:dismiss`;
    setBusy(key);
    try {
      await send("dismissDispatcherSuggestion", { employeeId: empId, suggestionId: sugId });
      showToast("Vorschlag abgelehnt.", "info");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  if (allSuggestions.length === 0) {
    const hasDispatchers = (state.employees || []).some(e => (e.role === "dispatcher" || e.role === "dispatcher_senior") && e.employmentStatus === "employed");
    return (
      <div className="space-y-3">
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5">
          <Headset className="w-3.5 h-3.5" /> Disponenten-Vorschläge
        </div>
        <div className="glass border border-white/10 rounded-xl p-5 text-center">
          <Headset className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
          {hasDispatchers ? (
            <>
              <p className="text-sm text-muted-foreground">Keine offenen Vorschläge.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Disponenten erstellen Vorschläge während der Dienstzeit (08:00–16:00), wenn angenommene Aufträge und freie Lkw vorhanden sind.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Kein Disponent eingestellt.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Stelle einen Disponenten unter Personal ein und weise ihm Lkw zu, um Vorschläge zu erhalten.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5">
        <Headset className="w-3.5 h-3.5" /> {allSuggestions.length} Vorschlag{allSuggestions.length > 1 ? "e" : ""} offen
      </div>
      {allSuggestions.map(sug => {
        const key = `${sug.employee.id}:${sug.id}`;
        const vehicle = state.vehicles.find(v => v.id === sug.vehicleId);
        const driver = state.drivers.find(d => d.id === sug.driverId);
        const orders = (sug.orderIds || []).map(oid => state.orders.find(o => o.id === oid)).filter(Boolean);
        const plan = sug.plan || {};
        const isBusy = busy === key || busy === `${key}:dismiss`;

        return (
          <div key={sug.id} className="glass border border-lime/20 rounded-xl p-3.5">
            {/* Disponent */}
            <div className="flex items-center gap-2 mb-3">
              <Portrait portraitId={sug.employee.portraitId} name={sug.employee.name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{sug.employee.name}</div>
                <div className="text-[10px] text-muted-foreground">{roleLabel(sug.employee.role)}</div>
              </div>
              <span className="text-[10px] text-muted-foreground">{formatGameTime(sug.createdAtMin)}</span>
            </div>

            {/* Fahrzeug & Fahrer */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-foreground/40" />
                <span className="truncate">{vehicleDisplayName(vehicle)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="truncate">{driverDisplayName(driver)}</span>
              </div>
            </div>

            {/* Aufträge */}
            {orders.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {orders.map(o => (
                  <div key={o.id} className="flex items-center justify-between text-xs bg-surface-2/50 rounded-lg px-2.5 py-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{o.customer}</span>
                      <span className="text-muted-foreground shrink-0">{o.fromCity} <ArrowRight className="w-2.5 h-2.5 inline" /> {o.toCity}</span>
                    </div>
                    <span className="text-lime tabular-nums shrink-0 ml-2">{formatEuro(o.paymentCents)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Plan-Zusammenfassung */}
            {plan.totalKm != null && (
              <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground mb-3 pt-2 border-t border-white/5">
                <div>
                  <div className="text-[9px] uppercase tracking-wider">Strecke</div>
                  <div className="text-foreground tabular-nums">{plan.totalKm} km</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider">Dauer</div>
                  <div className="text-foreground tabular-nums">{Math.floor((plan.totalDuration || 0) / 60)} h {(plan.totalDuration || 0) % 60} min</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-wider">Ende</div>
                  <div className="text-foreground tabular-nums">{formatGameTime(plan.endMin || 0)}</div>
                </div>
              </div>
            )}

            {/* Aktionen */}
            <div className="flex gap-2">
              <button
                onClick={() => confirm(sug.employee.id, sug.id)}
                disabled={isBusy}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 bg-lime text-ink text-xs font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-95"
              >
                {busy === key ? <span className="w-3.5 h-3.5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-3.5 h-3.5" /> Bestätigen</>}
              </button>
              <button
                onClick={() => dismiss(sug.employee.id, sug.id)}
                disabled={isBusy}
                className="flex items-center justify-center gap-1.5 rounded-lg py-2.5 px-3 border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 text-xs transition active:scale-95"
              >
                {busy === `${key}:dismiss` ? <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <><X className="w-3.5 h-3.5" /> Ablehnen</>}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}