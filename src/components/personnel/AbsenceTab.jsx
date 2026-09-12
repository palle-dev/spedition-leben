import React, { useState, useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, formatEuro, dayOf } from "@/lib/gameData";
import { roleLabel, employmentStatusLabel, attendanceLabel } from "@/lib/displayHelpers";
import Portrait from "@/components/ui/Portrait";
import Drawer from "@/components/ui/Drawer";
import { ABSENCE_TYPE_LABELS, ABSENCE_COLORS, VACATION_MAX_UNUSED } from "@/lib/absenceData";
import {
  Calendar, Plane, Heart, Moon, UserX, Check, X, AlertCircle, Clock,
  ChevronLeft, ChevronRight, Send, RotateCcw, Stethoscope,
} from "lucide-react";

const DAY_MIN = 1440;

export default function AbsenceTab({ state, send, showToast }) {
  const [viewMode, setViewMode] = useState("week"); // week | month
  const [calendarOffset, setCalendarOffset] = useState(0);
  const [showVacationForm, setShowVacationForm] = useState(null); // personId
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [rejectingRequest, setRejectingRequest] = useState(null);

  const now = state.gameTime;
  const todayStart = Math.floor(now / DAY_MIN) * DAY_MIN;
  const days = viewMode === "week" ? 7 : 30;
  const calStart = todayStart + calendarOffset * DAY_MIN;
  const calEnd = calStart + days * DAY_MIN;

  const absences = state.absences || {};
  const vacationRequests = absences.vacationRequests || [];
  const sicknesses = absences.sicknesses || [];

  const pendingRequests = vacationRequests.filter(r => r.status === "pending");
  const approvedFuture = vacationRequests.filter(r => r.status === "approved" && r.endMin > now);
  const activeSicknesses = sicknesses.filter(s => s.status === "active");

  // Kalender-Einträge berechnen
  const calendarEntries = useMemo(() => {
    const entries = [];
    for (const r of approvedFuture) {
      if (r.endMin <= calStart || r.startMin >= calEnd) continue;
      entries.push({ ...r, type: "vacation", label: "Urlaub", color: "lime" });
    }
    for (const s of sicknesses) {
      const end = s.status === "recovered" ? (s.actualEndMin || s.expectedEndMin) : s.expectedEndMin;
      if (end <= calStart || s.startMin >= calEnd) continue;
      entries.push({ ...s, type: "sickness", label: "Krankheit", color: "coral", endMin: end });
    }
    // Fahrer-Ruhezeiten
    for (const d of (state.drivers || [])) {
      if (d.restUntil && d.restUntil > now && d.restUntil > calStart && now < calEnd) {
        entries.push({ type: "driver_rest", personId: d.id, personName: d.name, startMin: Math.max(now, calStart), endMin: d.restUntil, label: "Ruhezeit", color: "sky", readOnly: true });
      }
    }
    // Austritte
    for (const p of [...(state.drivers || []), ...(state.employees || [])]) {
      if (p.employmentStatus === "notice_given" && p.exitMin && p.exitMin > calStart && p.exitMin < calEnd) {
        entries.push({ type: "termination", personId: p.id, personName: p.name, startMin: p.exitMode === "garden_leave" ? now : p.exitMin, endMin: p.exitMin, label: "Austritt", color: "amber" });
      }
    }
    // Vertretungen
    for (const c of (state.serviceContracts || [])) {
      if ((c.type !== "temp_driver" && c.type !== "temp_dispatcher") || (c.status !== "planned" && c.status !== "active")) continue;
      if (c.endMin <= calStart || c.startMin >= calEnd) continue;
      entries.push({ type: "substitution", personId: c.substitutesPersonId, personName: c.providerName, startMin: c.startMin, endMin: c.endMin, label: "Vertretung", color: "violet", isExternal: true });
    }
    return entries;
  }, [state, calStart, calEnd, now]);

  // Heute abwesende Personen
  const absentToday = useMemo(() => {
    const allPersons = [
      ...(state.drivers || []).map(d => ({ ...d, kind: "driver" })),
      ...(state.employees || []).map(e => ({ ...e, kind: "employee" })),
    ];
    return allPersons.filter(p => {
      if (p.employmentStatus !== "employed") return false;
      return !isPersonAvailableNow(p, now, absences);
    });
  }, [state, now, absences]);

  function isPersonAvailableNow(person, m, absences) {
    const sick = (absences.sicknesses || []).find(s => s.personId === person.id && s.status === "active" && s.startMin <= m && s.expectedEndMin > m);
    if (sick) return false;
    const vac = (absences.vacationRequests || []).find(r => r.personId === person.id && r.status === "approved" && r.startMin <= m && r.endMin > m);
    if (vac) return false;
    if (person.kind === "driver" && person.restUntil && person.restUntil > m) return false;
    return true;
  }

  async function handleApprove(req) {
    try {
      await send("approveVacation", { requestId: req.id, conflictResolution: "accepted" });
      showToast("Urlaub genehmigt.", "success");
      setSelectedRequest(null);
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleReject(req, reason) {
    try {
      await send("rejectVacation", { requestId: req.id, reason });
      showToast("Urlaub abgelehnt.", "info");
      setRejectingRequest(null);
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleCancel(req) {
    try {
      await send("cancelVacation", { requestId: req.id });
      showToast("Urlaub storniert.", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleReturnEarly(req) {
    try {
      await send("returnEarlyFromVacation", { requestId: req.id, returnMin: now });
      showToast("Vorzeitige Rückkehr eingeleitet.", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleReportSickness(personId) {
    try {
      await send("reportSickness", { personId });
      showToast("Krankmeldung erstellt.", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  return (
    <div className="space-y-5">
      {/* Zusammenfassung */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon={UserX} label="Heute abwesend" value={absentToday.length} color="coral" />
        <SummaryCard icon={Clock} label="Offene Anträge" value={pendingRequests.length} color="amber" />
        <SummaryCard icon={Heart} label="Aktiv krank" value={activeSicknesses.length} color="coral" />
        <SummaryCard icon={Plane} label="Bevorstehender Urlaub" value={approvedFuture.length} color="lime" />
      </div>

      {/* Heute abwesend */}
      {absentToday.length > 0 && (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
            <UserX className="w-3.5 h-3.5" /> Heute abwesend
          </h2>
          <div className="grid md:grid-cols-2 gap-3">
            {absentToday.map(p => {
              const sick = (absences.sicknesses || []).find(s => s.personId === p.id && s.status === "active");
              const vac = (absences.vacationRequests || []).find(r => r.personId === p.id && r.status === "approved" && r.startMin <= now && r.endMin > now);
              const reason = sick ? "Krankheit" : vac ? "Urlaub" : p.kind === "driver" && p.restUntil > now ? "Ruhezeit" : "Freigestellt";
              const until = sick ? sick.expectedEndMin : vac ? vac.endMin : p.restUntil;
              return (
                <div key={p.id} className="glass border border-white/10 rounded-xl p-3 flex items-center gap-3">
                  <Portrait portraitId={p.portraitId} name={p.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">{p.kind === "driver" ? "Fahrer" : roleLabel(p.role)} · {reason}</div>
                    {until && <div className="text-[10px] text-muted-foreground/70">bis {formatGameTime(until)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Offene Urlaubsanträge */}
      {pendingRequests.length > 0 && (
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Offene Urlaubsanträge
          </h2>
          <div className="space-y-2">
            {pendingRequests.map(req => {
              const person = [...(state.drivers || []), ...(state.employees || [])].find(p => p.id === req.personId);
              return (
                <div key={req.id} className="glass border border-amber-400/20 rounded-xl p-3">
                  <div className="flex items-start gap-3">
                    {person && <Portrait portraitId={person.portraitId} name={req.personName} size="sm" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{req.personName}</span>
                        <span className="text-xs text-amber-300">{req.days} Tag(e)</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {formatGameTime(req.startMin)} – {formatGameTime(req.endMin - 1)}
                      </div>
                      {req.reason && <div className="text-[10px] text-muted-foreground/70 mt-1">Grund: {req.reason}</div>}
                      {req.conflicts && req.conflicts.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {req.conflicts.map((c, i) => (
                            <div key={i} className={`text-[10px] flex items-start gap-1 ${c.severity === "hard" ? "text-red-300" : "text-amber-300"}`}>
                              <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" /> {c.description}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => handleApprove(req)} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 bg-lime text-ink text-xs font-semibold hover:brightness-110 transition">
                      <Check className="w-3.5 h-3.5" /> Genehmigen
                    </button>
                    <button onClick={() => setRejectingRequest(req)} className="flex items-center justify-center gap-1.5 rounded-lg py-2 px-3 border border-white/10 text-foreground hover:border-red-400/40 hover:text-red-300 text-xs font-medium transition">
                      <X className="w-3.5 h-3.5" /> Ablehnen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Kalender */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" /> Verfügbarkeitskalender
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              <button onClick={() => setViewMode("week")} className={`px-2.5 py-1 text-xs ${viewMode === "week" ? "bg-lime/20 text-lime" : "text-muted-foreground"}`}>7 Tage</button>
              <button onClick={() => setViewMode("month")} className={`px-2.5 py-1 text-xs ${viewMode === "month" ? "bg-lime/20 text-lime" : "text-muted-foreground"}`}>30 Tage</button>
            </div>
            <button onClick={() => setCalendarOffset(o => o - 1)} className="p-1.5 rounded-lg border border-white/10 hover:border-white/20 transition">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setCalendarOffset(o => o + 1)} className="p-1.5 rounded-lg border border-white/10 hover:border-white/20 transition">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="glass border border-white/10 rounded-xl p-3 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {Array.from({ length: days }).map((_, i) => {
              const dayStart = calStart + i * DAY_MIN;
              const dayEnd = dayStart + DAY_MIN;
              const dayEntries = calendarEntries.filter(e => e.startMin < dayEnd && e.endMin > dayStart);
              const isToday = dayStart === todayStart;
              return (
                <div key={i} className={`flex-1 min-w-[60px] rounded-lg p-1.5 border ${isToday ? "border-lime/30 bg-lime/5" : "border-white/5 bg-surface-2/30"}`}>
                  <div className={`text-[10px] text-center mb-1 ${isToday ? "text-lime font-medium" : "text-muted-foreground"}`}>
                    Tag {dayOf(dayStart)}
                  </div>
                  <div className="space-y-0.5">
                    {dayEntries.slice(0, 4).map((e, j) => (
                      <div key={j} className={`text-[9px] px-1 py-0.5 rounded truncate ${colorClass(e.color)}`} title={`${e.personName}: ${e.label}`}>
                        {e.personName?.split(" ")[0]}
                      </div>
                    ))}
                    {dayEntries.length > 4 && <div className="text-[9px] text-muted-foreground text-center">+{dayEntries.length - 4}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Legende */}
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-white/5">
            {Object.entries(ABSENCE_TYPE_LABELS).map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className={`w-2 h-2 rounded-full ${colorClass(ABSENCE_COLORS[type])}`} /> {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bevorstehender Urlaub & Krankheit */}
      {(approvedFuture.length > 0 || activeSicknesses.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">
          {approvedFuture.length > 0 && (
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5" /> Bevorstehender Urlaub
              </h2>
              <div className="space-y-2">
                {approvedFuture.map(req => {
                  const person = [...(state.drivers || []), ...(state.employees || [])].find(p => p.id === req.personId);
                  const started = req.startMin <= now;
                  return (
                    <div key={req.id} className="glass border border-white/10 rounded-xl p-3">
                      <div className="flex items-center gap-3">
                        {person && <Portrait portraitId={person.portraitId} name={req.personName} size="sm" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{req.personName}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatGameTime(req.startMin)} – {formatGameTime(req.endMin - 1)} · {req.days} Tag(e)
                          </div>
                          {started && <div className="text-[10px] text-amber-300 mt-0.5">Laufend</div>}
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        {started ? (
                          <button onClick={() => handleReturnEarly(req)} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs border border-white/10 hover:border-lime/30 text-foreground transition">
                            <RotateCcw className="w-3 h-3" /> Früher zurück
                          </button>
                        ) : (
                          <button onClick={() => handleCancel(req)} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs border border-white/10 hover:border-red-400/40 hover:text-red-300 text-foreground transition">
                            <X className="w-3 h-3" /> Stornieren
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {activeSicknesses.length > 0 && (
            <div>
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3 flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5" /> Aktive Krankmeldungen
              </h2>
              <div className="space-y-2">
                {activeSicknesses.map(s => {
                  const person = [...(state.drivers || []), ...(state.employees || [])].find(p => p.id === s.personId);
                  return (
                    <div key={s.id} className="glass border border-coral/20 rounded-xl p-3">
                      <div className="flex items-center gap-3">
                        {person && <Portrait portraitId={person.portraitId} name={s.personName} size="sm" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{s.personName}</div>
                          <div className="text-[10px] text-muted-foreground">
                            Seit {formatGameTime(s.startMin)} · voraussichtlich bis {formatGameTime(s.expectedEndMin)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Urlaub planen Button */}
      <button
        onClick={() => setShowVacationForm("__select")}
        className="w-full flex items-center justify-center gap-2 rounded-xl py-3 bg-lime/10 border border-lime/30 text-lime text-sm font-medium hover:border-lime/50 transition"
      >
        <Plane className="w-4 h-4" /> Urlaub planen/anfragen
      </button>

      {/* Urlaub-Formular Drawer */}
      <Drawer
        open={!!showVacationForm}
        onClose={() => setShowVacationForm(null)}
        title="Urlaub planen"
        maxWidth="max-w-md"
      >
        {showVacationForm && (
          <VacationRequestForm
            state={state}
            send={send}
            showToast={showToast}
            onClose={() => setShowVacationForm(null)}
          />
        )}
      </Drawer>

      {/* Ablehnungs-Dialog */}
      <Drawer
        open={!!rejectingRequest}
        onClose={() => setRejectingRequest(null)}
        title="Urlaub ablehnen"
        maxWidth="max-w-sm"
      >
        {rejectingRequest && (
          <RejectForm
            request={rejectingRequest}
            onReject={(reason) => handleReject(rejectingRequest, reason)}
            onClose={() => setRejectingRequest(null)}
          />
        )}
      </Drawer>
    </div>
  );
}

function colorClass(color) {
  const map = {
    lime: "bg-lime/20 text-lime",
    coral: "bg-coral/20 text-coral",
    amber: "bg-amber-500/20 text-amber-300",
    sky: "bg-sky-500/20 text-sky-300",
    violet: "bg-violet-500/20 text-violet-300",
  };
  return map[color] || "bg-white/10 text-muted-foreground";
}

function SummaryCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    coral: "text-coral",
    amber: "text-amber-300",
    lime: "text-lime",
  };
  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <Icon className={`w-4 h-4 ${colorMap[color] || "text-muted-foreground"} mb-1.5`} />
      <div className="text-2xl font-medium tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    </div>
  );
}

function VacationRequestForm({ state, send, showToast, onClose }) {
  const [personId, setPersonId] = useState("");
  const [startDay, setStartDay] = useState(dayOf(state.gameTime) + 1);
  const [duration, setDuration] = useState(1);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const allPersons = [
    ...(state.drivers || []).filter(d => d.employmentStatus === "employed").map(d => ({ ...d, kind: "driver" })),
    ...(state.employees || []).filter(e => e.employmentStatus === "employed").map(e => ({ ...e, kind: "employee" })),
  ];

  const selectedPerson = allPersons.find(p => p.id === personId);
  const vacationAccount = selectedPerson?.vacationAccount;
  const available = vacationAccount ? Math.max(0, vacationAccount.totalEarned - vacationAccount.daysUsed) : 0;

  async function submit() {
    if (!personId) { showToast("Bitte Mitarbeiter wählen.", "error"); return; }
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
      <div>
        <label className="text-[11px] text-muted-foreground">Mitarbeiter</label>
        <select value={personId} onChange={e => setPersonId(e.target.value)} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none">
          <option value="">– wählen –</option>
          {allPersons.map(p => (
            <option key={p.id} value={p.id}>{p.name} · {p.kind === "driver" ? "Fahrer" : roleLabel(p.role)}</option>
          ))}
        </select>
      </div>
      {selectedPerson && vacationAccount && (
        <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Verfügbare Tage</span><span className="tabular-nums font-medium">{available}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Gesamt verdient</span><span className="tabular-nums">{vacationAccount.totalEarned}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Bereits verbraucht</span><span className="tabular-nums">{vacationAccount.daysUsed}</span></div>
        </div>
      )}
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
        disabled={submitting || !personId}
        className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition"
      >
        {submitting ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Send className="w-4 h-4" /> Antrag stellen</>}
      </button>
    </div>
  );
}

function RejectForm({ request, onReject, onClose }) {
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Urlaub von {request.personName} ({formatGameTime(request.startMin)} – {formatGameTime(request.endMin - 1)}, {request.days} Tag(e)) ablehnen.
      </div>
      <div>
        <label className="text-[11px] text-muted-foreground">Grund</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none resize-none" placeholder="z.B. Dringender Einsatz..." />
      </div>
      <button
        onClick={() => onReject(reason)}
        className="w-full flex items-center justify-center gap-2 bg-coral/80 text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 transition"
      >
        <X className="w-4 h-4" /> Ablehnen
      </button>
    </div>
  );
}