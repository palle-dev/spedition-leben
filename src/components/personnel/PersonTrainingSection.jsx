import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { COURSE_CATALOG, getCourseById, qualTypeLabel, qualStatusLabel, enrollmentStatusLabel } from "@/lib/trainingData";
import Drawer from "@/components/ui/Drawer";
import { BookOpen, Award, Check, X, AlertCircle, Clock, Euro, ChevronRight, GraduationCap, Calendar } from "lucide-react";

// Per-Person Weiterbildungs-Sektion für den Mitarbeiter-Detail-Drawer.
// Zeigt Qualifikationen, aktive Einschreibungen und erlaubt Kursbuchung für diese Person.
export default function PersonTrainingSection({ personId, kind, role }) {
  const { state, send, showToast } = useGame();
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [preview, setPreview] = useState(null);
  const [booking, setBooking] = useState(false);
  const [confirmPromotion, setConfirmPromotion] = useState(false);

  const now = state.gameTime;
  const quals = (state.training?.qualifications || []).filter(q => q.personId === personId);
  const enrollments = (state.training?.enrollments || []).filter(e => e.personId === personId && ["reserved", "in_progress"].includes(e.status));

  // Kurse filtern: Rollen-passende oder "any"
  const personRole = kind === "driver" ? "driver" : role;
  const availableCourses = COURSE_CATALOG.filter(c => c.targetRole === personRole || c.targetRole === "any");

  async function loadPreview() {
    if (!selectedCourse) { setPreview(null); return; }
    try {
      const r = await send("previewCourseBooking", { personId, courseId: selectedCourse });
      setPreview(r);
    } catch (e) {
      setPreview({ ok: false, reason: e.message });
    }
  }

  useEffect(() => { loadPreview(); }, [selectedCourse, state.gameTime]);

  async function handleBook() {
    setBooking(true);
    try {
      const r = await send("bookCourse", { personId, courseId: selectedCourse, confirmPromotion });
      showToast(`Kurs gebucht: ${formatGameTime(r.startMin)}`, "success");
      setSelectedCourse(null);
      setPreview(null);
      setConfirmPromotion(false);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Qualifikationen */}
      {quals.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1">
            <Award className="w-3 h-3" /> Qualifikationen
          </h4>
          <div className="space-y-1.5">
            {quals.map(q => {
              const status = qualStatusLabel(q, now);
              return (
                <div key={q.id} className="flex items-center justify-between p-2 rounded-lg bg-surface-2/30 border border-white/5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{qualTypeLabel(q.type)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {q.source === "course" ? "Kurs" : q.source === "apprenticeship" ? "Ausbildung" : "Initial"}
                      {q.acquiredAtMin ? ` · seit ${formatGameTime(q.acquiredAtMin)}` : ""}
                    </div>
                  </div>
                  <div className={`text-[10px] flex items-center gap-1 ${status.color} shrink-0`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Aktive Einschreibungen */}
      {enrollments.length > 0 && (
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Laufende Weiterbildung
          </h4>
          <div className="space-y-1.5">
            {enrollments.map(enr => {
              const course = getCourseById(enr.courseId);
              const status = enrollmentStatusLabel(enr.status);
              return (
                <div key={enr.id} className="p-2 rounded-lg bg-surface-2/40 border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium truncate">{course?.label || enr.courseId}</span>
                    <span className={`text-[10px] flex items-center gap-1 ${status.color} shrink-0`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{formatGameTime(enr.startMin)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Kurs buchen Button */}
      <button
        onClick={() => setSelectedCourse("__select")}
        className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime/10 border border-lime/30 text-lime text-xs font-medium hover:border-lime/50 transition"
      >
        <GraduationCap className="w-4 h-4" /> Kurs buchen
      </button>

      {/* Kurs-Auswahl Drawer */}
      <Drawer
        open={!!selectedCourse}
        onClose={() => { setSelectedCourse(null); setPreview(null); setConfirmPromotion(false); }}
        title="Kurs buchen"
        kicker={kind === "driver" ? "Fahrer" : roleLabel(role)}
        maxWidth="max-w-md"
      >
        {selectedCourse && (
          <div className="space-y-4">
            {/* Kurs-Liste zur Auswahl */}
            {!preview && (
              <div className="space-y-2">
                {availableCourses.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">Keine Kurse für diese Rolle verfügbar.</div>
                ) : (
                  availableCourses.map(course => (
                    <button
                      key={course.id}
                      onClick={() => setSelectedCourse(course.id)}
                      className={`w-full glass border rounded-xl p-3 text-left transition ${
                        selectedCourse === course.id ? "border-lime/40 bg-lime/5" : "border-white/10 hover:border-lime/20"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{course.label}</div>
                          <div className="text-[10px] text-lime mt-1">{course.effectDesc}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/5 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {course.hours} Std</span>
                        <span className="flex items-center gap-1"><Euro className="w-3 h-3" /> {formatEuro(course.feeCents)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Vorschau & Buchung */}
            {preview && !preview.ok && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-400/20 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
                <div className="text-xs text-red-300">{preview.reason}</div>
              </div>
            )}

            {preview && preview.ok && (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Kurs</span>
                    <span className="font-medium">{getCourseById(selectedCourse)?.label}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Termin</span>
                    <span className="font-medium">{formatGameTime(preview.startMin)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Ende</span>
                    <span className="font-medium">{formatGameTime(preview.endMin)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Blöcke</span>
                    <span className="font-medium">{preview.blocks} × 8 Std</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Kursgebühr</span>
                    <span className="font-medium tabular-nums">{formatEuro(preview.feeCents)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Lohn während Kurs</span>
                    <span className="font-medium tabular-nums">{formatEuro(preview.wageDuringCourse)}</span>
                  </div>
                </div>

                {preview.conflicts.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-400/20">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-amber-300 mb-1">Konflikte</div>
                    {preview.conflicts.map((c, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground">{c.label}</div>
                    ))}
                  </div>
                )}

                {preview.promotion && (
                  <div className="p-3 rounded-lg bg-lime/10 border border-lime/20">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-lime mb-1">Beförderung bei Abschluss</div>
                    <div className="text-xs text-foreground/80">Neuer Lohn: {formatEuro(preview.promotion.newWageCents)}/Tag</div>
                    <label className="flex items-center gap-2 mt-2 text-xs">
                      <input type="checkbox" checked={confirmPromotion} onChange={e => setConfirmPromotion(e.target.checked)} className="accent-lime" />
                      Beförderung bestätigen
                    </label>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => { setPreview(null); }} className="px-3 py-2.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:text-foreground transition">
                    Zurück
                  </button>
                  <button
                    onClick={handleBook}
                    disabled={booking || (preview.promotion && !confirmPromotion)}
                    className="flex-1 flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-2.5 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition"
                  >
                    {booking ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Buchen</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}