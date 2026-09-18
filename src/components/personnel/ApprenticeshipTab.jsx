import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { APPRENTICE_ROLES, apprenticeshipStatusLabel, APPRENTICE_ADMISSION_FEE, APPRENTICE_THEORY_FEE, APPRENTICE_COMPLETION_FEE, APPRENTICE_TRAINING_WAGE, APPRENTICE_THEORY_HOURS, APPRENTICE_PRACTICE_HOURS, APPRENTICE_MIN_DAYS } from "@/lib/trainingData";
import Portrait from "@/components/ui/Portrait";
import Drawer from "@/components/ui/Drawer";
import { GraduationCap, AlertCircle, HeartHandshake, X } from "lucide-react";

// Ausbildung-Tab: Nachwuchsausbildung verwalten.
export default function ApprenticeshipTab() {
  const { state, send, showToast } = useGame();
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [preview, setPreview] = useState(null);
  const [takeoverAuthorized, setTakeoverAuthorized] = useState(false);
  const [booking, setBooking] = useState(false);

  const apprenticePersons = (state.availableApplicants || []).filter(a => a.isApprentice);

  async function loadPreview() {
    if (!selectedRole || !selectedPersonId) { setPreview(null); return; }
    try {
      const r = await send("previewApprenticeship", { personId: selectedPersonId, role: selectedRole });
      setPreview(r);
    } catch (e) {
      setPreview({ ok: false, reason: e.message });
    }
  }

  useEffect(() => { loadPreview(); }, [selectedRole, selectedPersonId, state.gameTime]);

  async function handleStart() {
    setBooking(true);
    try {
      const r = await send("startApprenticeship", { personId: selectedPersonId, role: selectedRole, takeoverAuthorized });
      showToast("Ausbildung gestartet.", "success");
      setSelectedRole(null);
      setSelectedPersonId("");
      setPreview(null);
      setTakeoverAuthorized(false);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBooking(false);
    }
  }

  async function handleTakeover(apprenticeshipId) {
    try {
      await send("takeoverApprentice", { apprenticeshipId });
      showToast("Auszubildender übernommen.", "success");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function handleRelease(apprenticeshipId) {
    try {
      await send("releaseApprentice", { apprenticeshipId });
      showToast("Ausbildungsvertrag beendet.", "info");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  const activeApprenticeships = (state.training?.apprenticeships || []).filter(a => ["theory", "practice", "takeover_pending"].includes(a.status));

  return (
    <div className="space-y-4">
      {/* Aktive Ausbildungen */}
      {activeApprenticeships.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Laufende Ausbildungen</h3>
          <div className="space-y-2">
            {activeApprenticeships.map(a => {
              const person = (state.drivers || []).find(d => d.id === a.personId) || (state.employees || []).find(e => e.id === a.personId);
              const status = apprenticeshipStatusLabel(a.status);
              const progress = (a.theoryHoursCompleted + a.practiceHoursCompleted) / (APPRENTICE_THEORY_HOURS + APPRENTICE_PRACTICE_HOURS);
              return (
                <div key={a.id} className="glass border border-white/10 rounded-xl p-3">
                  <div className="flex items-start gap-3">
                    {person && <Portrait portraitId={person.portraitId} name={person.name} size="sm" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium truncate">{person?.name || a.personId}</div>
                        <div className={`text-[10px] flex items-center gap-1 ${status.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {roleLabel(a.role)} · {a.theoryHoursCompleted}/{APPRENTICE_THEORY_HOURS} Theorie · {a.practiceHoursCompleted}/{APPRENTICE_PRACTICE_HOURS} Praxis
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mt-2">
                        <div className="h-full bg-lime/60" style={{ width: `${progress * 100}%` }} />
                      </div>
                    </div>
                  </div>
                  {a.status === "takeover_pending" && (
                    <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
                      <button
                        onClick={() => handleTakeover(a.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-lime text-ink text-xs font-semibold hover:brightness-110 transition"
                      >
                        <HeartHandshake className="w-3.5 h-3.5" /> Übernehmen ({formatEuro(a.takeoverWageCents)}/Tag)
                      </button>
                      <button
                        onClick={() => handleRelease(a.id)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-xs text-muted-foreground hover:text-foreground transition"
                      >
                        <X className="w-3.5 h-3.5" /> Nicht übernehmen
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Neue Ausbildung starten */}
      <div>
        <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5" /> Neue Ausbildung starten
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {APPRENTICE_ROLES.map(r => (
            <button
              key={r.id}
              onClick={() => { setSelectedRole(r.id); setSelectedPersonId(""); }}
              className={`flex flex-col items-center gap-1.5 rounded-xl p-3 border transition ${
                selectedRole === r.id
                  ? "bg-lime/15 border-lime/40 text-lime"
                  : "border-white/10 text-muted-foreground hover:border-lime/30 hover:text-lime"
              }`}
            >
              <span className="text-sm font-medium">{r.label}</span>
              <span className="text-[10px]">Übernahme: {formatEuro(r.wage)}/Tag</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ausbildungs-Drawer */}
      <Drawer
        open={!!selectedRole}
        onClose={() => { setSelectedRole(null); setPreview(null); setTakeoverAuthorized(false); }}
        title="Spielausbildung – verkürzter Nachwuchsweg"
        kicker={selectedRole ? APPRENTICE_ROLES.find(r => r.id === selectedRole)?.label : ""}
        maxWidth="max-w-md"
      >
        {selectedRole && (
          <div className="space-y-4">
            {/* Kostenübersicht */}
            <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">Kosten</div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Aufnahmegebühr</span><span className="tabular-nums">{formatEuro(APPRENTICE_ADMISSION_FEE)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Theoriegebühr (bei Beginn)</span><span className="tabular-nums">{formatEuro(APPRENTICE_THEORY_FEE)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Abschlussgebühr</span><span className="tabular-nums">{formatEuro(APPRENTICE_COMPLETION_FEE)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Ausbildungsvergütung</span><span className="tabular-nums">{formatEuro(APPRENTICE_TRAINING_WAGE)}/Tag</span></div>
              <div className="flex justify-between text-xs border-t border-white/5 pt-1.5 mt-1.5"><span className="text-muted-foreground">Gesamtgebühren</span><span className="tabular-nums font-medium">{formatEuro(APPRENTICE_ADMISSION_FEE + APPRENTICE_THEORY_FEE + APPRENTICE_COMPLETION_FEE)}</span></div>
            </div>

            {/* Dauer */}
            <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 space-y-1.5">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">Dauer</div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Theorie</span><span>{APPRENTICE_THEORY_HOURS} Stunden</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Praxis (mit Mentor)</span><span>{APPRENTICE_PRACTICE_HOURS} Stunden</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Mindestens</span><span>{APPRENTICE_MIN_DAYS} Tage</span></div>
            </div>

            {/* Person-Auswahl */}
            <div>
              <label className="text-[11px] text-muted-foreground">Auszubildenden auswählen</label>
              <select
                value={selectedPersonId}
                onChange={e => setSelectedPersonId(e.target.value)}
                className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none"
              >
                <option value="">– wählen –</option>
                {apprenticePersons.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {apprenticePersons.length === 0 && (
                <div className="text-[10px] text-amber-300 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Keine Auszubildenden im Bewerbermarkt. Stelle Nachwuchskräfte ein.
                </div>
              )}
            </div>

            {/* Vorschau */}
            {preview && !preview.ok && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-400/20 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
                <div className="text-xs text-red-300">{preview.reason}</div>
              </div>
            )}

            {preview && preview.ok && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 space-y-1.5">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Mentor verfügbar</span>
                    <span className={preview.mentorAvailable ? "text-lime" : "text-amber-300"}>
                      {preview.mentorAvailable ? `Ja (${preview.mentorName})` : "Nein – Praxis wartet"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Theoriebeginn</span><span>{preview.theorySlot ? formatGameTime(preview.theorySlot) : "—"}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Übernahmelohn</span><span className="tabular-nums">{formatEuro(preview.takeoverWageCents)}/Tag</span></div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={takeoverAuthorized} onChange={e => setTakeoverAuthorized(e.target.checked)} className="accent-lime" />
                  Übernahme nach Abschluss autorisieren
                </label>
              </div>
            )}

            <button
              onClick={handleStart}
              disabled={booking || !selectedPersonId}
              className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition"
            >
              {booking ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><GraduationCap className="w-4 h-4" /> Ausbildung starten</>}
            </button>
          </div>
        )}
      </Drawer>
    </div>
  );
}