import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { vehicleDisplayName, driverDisplayName, roleLabel, workModeLabel, attendanceLabel } from "@/lib/displayHelpers";
import { formatGameTime, formatEuro, dayOf } from "@/lib/gameData";
import Portrait from "@/components/ui/Portrait";
import { Check, X, Truck, ArrowRight, Headset, Mail, Users, Clock } from "lucide-react";

// Disponenten-Übersicht: Mitarbeiter, Status, zugewiesene Lkw,
// Arbeitsergebnisse heute und offene Vorschläge mit Bestätigen/Ablehnen.
export default function DispatcherPanel() {
  const { state, send, showToast } = useGame();
  const [busy, setBusy] = useState(null);

  const dispatchers = (state.employees || []).filter(
    e => (e.role === "dispatcher" || e.role === "dispatcher_senior") && e.employmentStatus === "employed"
  );

  if (dispatchers.length === 0) {
    return (
      <div className="space-y-3">
        <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5">
          <Headset className="w-3.5 h-3.5" /> Disponenten
        </div>
        <div className="glass border border-white/10 rounded-xl p-5 text-center">
          <Headset className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Kein Disponent eingestellt.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Stelle einen Disponenten unter Personal ein und weise ihm Lkw zu, um Vorschläge zu erhalten.
          </p>
          <Link to="/personal" className="inline-flex items-center gap-1.5 mt-3 px-3 py-2 rounded-lg bg-lime/10 border border-lime/30 text-lime text-xs font-medium hover:border-lime/50 transition">
            <Users className="w-3.5 h-3.5" /> Personal öffnen
          </Link>
        </div>
      </div>
    );
  }

  // Alle offenen Vorschläge sammeln
  const allSuggestions = dispatchers.flatMap(emp =>
    (emp.suggestions || []).filter(s => s.status === "pending").map(s => ({ ...s, employee: emp }))
  );

  async function confirm(empId, sugId) {
    const key = `${empId}:${sugId}`;
    setBusy(key);
    try {
      await send("confirmDispatcherSuggestion", { employeeId: empId, suggestionId: sugId });
      showToast("Vorschlag bestätigt – Tour gestartet.", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusy(null); }
  }

  async function dismiss(empId, sugId) {
    const key = `${empId}:${sugId}:dismiss`;
    setBusy(key);
    try {
      await send("dismissDispatcherSuggestion", { employeeId: empId, suggestionId: sugId });
      showToast("Vorschlag abgelehnt.", "info");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5">
        <Headset className="w-3.5 h-3.5" /> Disponenten
      </div>

      {/* Disponenten-Karten */}
      {dispatchers.map(emp => {
        const att = attendanceLabel(emp.attendance);
        const wm = workModeLabel(emp.workMode);
        const assignedVehicles = (emp.assignedVehicleIds || [])
          .map(vid => state.vehicles.find(v => v.id === vid)).filter(Boolean);
        const stats = emp.dailyStats || {};
        const empSuggestions = (emp.suggestions || []).filter(s => s.status === "pending");

        return (
          <div key={emp.id} className="glass border border-white/10 rounded-xl p-3.5">
            {/* Kopf */}
            <div className="flex items-center gap-2.5">
              <Portrait portraitId={emp.portraitId} name={emp.name} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{emp.name}</div>
                <div className="text-[10px] text-muted-foreground">{roleLabel(emp.role)}</div>
              </div>
              <span className={`text-[10px] flex items-center gap-1 ${att.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${att.dot}`} />
                {att.label}
              </span>
            </div>

            {/* Arbeitsweise */}
            <div className="mt-2.5 text-xs">
              <span className="text-muted-foreground">Modus: </span>
              <span className="text-foreground font-medium">{wm.label}</span>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{wm.desc}</p>
            </div>

            {/* Zugewiesene Lkw */}
            <div className="mt-2.5 flex flex-wrap gap-1">
              {assignedVehicles.length === 0 ? (
                <span className="text-[10px] text-muted-foreground/60">Keine Lkw zugewiesen</span>
              ) : (
                assignedVehicles.map(v => (
                  <span key={v.id} className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2/60 border border-white/10 flex items-center gap-1">
                    <Truck className="w-2.5 h-2.5" /> {vehicleDisplayName(v)}
                  </span>
                ))
              )}
            </div>

            {/* Ergebnis heute */}
            {stats.day === dayOf(state.gameTime) && (stats.ordersAccepted || stats.ordersPlanned || stats.toursStarted) ? (
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 pt-2.5 border-t border-white/5">
                <Stat label="Angenommen" value={stats.ordersAccepted || 0} />
                <Stat label="Geplant" value={stats.ordersPlanned || 0} />
                <Stat label="Gestartet" value={stats.toursStarted || 0} />
              </div>
            ) : (
              <div className="mt-2.5 pt-2.5 border-t border-white/5 text-[10px] text-muted-foreground/60">
                Noch keine Aktivität heute
              </div>
            )}

            {/* E-Mail Link */}
            <Link
              to="/postfach"
              className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg py-2 border border-white/10 text-xs text-muted-foreground hover:text-foreground hover:border-white/20 transition"
            >
              <Mail className="w-3.5 h-3.5" /> E-Mail schreiben
            </Link>
          </div>
        );
      })}

      {/* Offene Vorschläge */}
      {allSuggestions.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5 pt-1">
            <Clock className="w-3.5 h-3.5" /> {allSuggestions.length} Vorschlag{allSuggestions.length > 1 ? "e" : ""} offen
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
                <div className="flex items-center gap-2 mb-2.5">
                  <Portrait portraitId={sug.employee.portraitId} name={sug.employee.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{sug.employee.name}</div>
                    <div className="text-[10px] text-muted-foreground">{formatGameTime(sug.createdAtMin)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-foreground/40" />
                    <span className="truncate">{vehicleDisplayName(vehicle)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{driverDisplayName(driver)}</span>
                  </div>
                </div>

                {orders.length > 0 && (
                  <div className="space-y-1 mb-2.5">
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

                {plan.totalKm != null && (
                  <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground mb-2.5 pt-2 border-t border-white/5">
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
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="text-center">
      <div className="text-sm font-medium tabular-nums text-foreground">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}