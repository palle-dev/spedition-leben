import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, dayOf } from "@/lib/gameData";
import Drawer from "@/components/ui/Drawer";
import { Plane, Stethoscope, Clock, Check, Send, X, AlertCircle, Calendar } from "lucide-react";

const DAY_MIN = 1440;

// Per-Person Abwesenheits-Sektion für den Mitarbeiter-Detail-Drawer.
// Zeigt Urlaubskonto, erlaubt Urlaubsplanung und Krankmeldung für diese Person.
export default function PersonAbsenceSection({ personId, personName, kind }) {
  const { state, send, showToast } = useGame();
  const [showVacation, setShowVacation] = useState(false);
  const [reportingSick, setReportingSick] = useState(false);

  const now = state.gameTime;
  const absences = state.absences || {};
  const vacationRequests = (absences.vacationRequests || []).filter(r => r.personId === personId);
  const sicknesses = (absences.sicknesses || []).filter(s => s.personId === personId);

  const pendingRequests = vacationRequests.filter(r => r.status === "pending");
  const approvedFuture = vacationRequests.filter(r => r.status === "approved" && r.endMin > now);
  const activeSickness = sicknesses.find(s => s.status === "active");

  // Urlaubskonto
  const person = kind === "driver"
    ? (state.drivers || []).find(d => d.id === personId)
    : (state.employees || []).find(e => e.id === personId);
  const vacationAccount = person?.vacationAccount;
  const availableDays = vacationAccount ? Math.max(0, vacationAccount.totalEarned - vacationAccount.daysUsed) : 0;

  async function handleReportSickness() {
    setReportingSick(true);
    try {
      await send("reportSickness", { personId });
      showToast("Krankmeldung erstellt.", "info");
    } catch (e) { showToast(e.message, "error"); }
    finally { setReportingSick(false); }
  }

  return (
    <div className="space-y-3">
      {/* Urlaubskonto */}
      {vacationAccount && (
        <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Verfügbare Tage</span>
            <span className="tabular-nums font-medium text-lime">{availableDays}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Gesamt verdient</span>
            <span className="tabular-nums">{vacationAccount.totalEarned}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Bereits verbraucht</span>
            <span className="tabular-nums">{vacationAccount.daysUsed}</span>
          </div>
        </div>
      )}

      {/* Aktive Krankmeldung */}
      {activeSickness && (
        <div className="p-3 rounded-lg bg-coral/10 border border-coral/20">
          <div className="flex items-center gap-2 text-sm font-medium text-coral">
            <Stethoscope className="w-4 h-4" /> Krankgemeldet
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Seit {formatGameTime(activeSickness.startMin)} · voraussichtlich bis {formatGameTime(activeSickness.expectedEndMin)}
          </div>
        </div>
      )}

      {/* Bevorstehender Urlaub */}
      {approvedFuture.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1">
            <Plane className="w-3 h-3" /> Bevorstehender Urlaub
          </h4>
          <div className="space-y-1.5">
            {approvedFuture.map(req => {
              const started = req.startMin <= now;
              return (
                <div key={req.id} className="p-2 rounded-lg bg-surface-2/40 border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{req.days} Tag(e)</span>
                    {started && <span className="text-[10px] text-amber-300">Laufend</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {formatGameTime(req.startMin)} – {formatGameTime(req.endMin - 1)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Offene Anträge */}
      {pendingRequests.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Offene Urlaubsanträge
          </h4>
          <div className="space-y-1.5">
            {pendingRequests.map(req => (
              <div key={req.id} className="p-2 rounded-lg bg-amber-400/5 border border-amber-400/15">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{req.days} Tag(e)</span>
                  <span className="text-[10px] text-amber-300">Ausstehend</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {formatGameTime(req.startMin)} – {formatGameTime(req.endMin - 1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aktionen */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowVacation(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium border border-white/10 text-foreground hover:border-lime/30 hover:text-lime transition"
        >
          <Plane className="w-3.5 h-3.5" /> Urlaub planen
        </button>
        <button
          onClick={handleReportSickness}
          disabled={reportingSick || !!activeSickness}
          className="flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-medium border border-white/10 text-foreground hover:border-coral/40 hover:text-coral transition disabled:opacity-40"
        >
          {reportingSick ? <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : <><Stethoscope className="w-3.5 h-3.5" /> Krankmelden</>}
        </button>
      </div>

      {/* Urlaub-Formular Drawer */}
      <Drawer
        open={showVacation}
        onClose={() => setShowVacation(false)}
        title="Urlaub planen"
        kicker={personName}
        maxWidth="max-w-md"
      >
        {showVacation && (
          <VacationForm
            personId={personId}
            personName={personName}
            state={state}
            send={send}
            showToast={showToast}
            availableDays={availableDays}
            onClose={() => setShowVacation(false)}
          />
        )}
      </Drawer>
    </div>
  );
}

function VacationForm({ personId, personName, state, send, showToast, availableDays, onClose }) {
  const [startDay, setStartDay] = useState(dayOf(state.gameTime) + 1);
  const [duration, setDuration] = useState(1);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const startMin = (startDay - 1) * DAY_MIN;
    const endMin = startMin + duration * DAY_MIN;
    setSubmitting(true);
    try {
      const r = await send("requestVacation", { personId, startMin, endMin, reason });
      showToast(`Urlaubsantrag gestellt: ${r.days} Tag(e), ${r.available} Tage verbleibend.`, "success");
      onClose();
    } catch (e) { showToast(e.message, "error"); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 text-xs space-y-1">
        <div className="flex justify-between"><span className="text-muted-foreground">Verfügbare Tage</span><span className="tabular-nums font-medium text-lime">{availableDays}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-muted-foreground">Ab Tag</label>
          <input type="number" min={dayOf(state.gameTime) + 1} value={startDay} onChange={e => setStartDay(parseInt(e.target.value) || 1)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Dauer (Tage)</label>
          <input type="number" min={1} max={20} value={duration} onChange={e => setDuration(Math.max(1, parseInt(e.target.value) || 1))} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none" />
        </div>
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">Grund (optional)</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none resize-none" placeholder="z.B. Familienurlaub..." />
      </div>
      <div className="text-[10px] text-muted-foreground/70">
        Zeitraum: Tag {startDay} bis Tag {startDay + duration - 1} ({duration} Tag(e))
      </div>
      <button
        onClick={submit}
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition"
      >
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Send className="w-4 h-4" /> Antrag stellen</>}
      </button>
    </div>
  );
}