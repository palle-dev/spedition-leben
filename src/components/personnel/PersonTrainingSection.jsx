import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { COURSE_CATALOG, getCourseById, qualTypeLabel, qualStatusLabel, enrollmentStatusLabel } from "@/lib/trainingData";
import Drawer from "@/components/ui/Drawer";
import { Award, Check, AlertCircle, Clock, Euro, ChevronRight, GraduationCap } from "lucide-react";

const DAY_MIN = 1440;

// Per-Person Weiterbildungs-Sektion für den Mitarbeiter-Detail-Drawer.
// Zeigt Qualifikationen, aktive Einschreibungen und erlaubt Kursbuchung für diese Person.
export default function PersonTrainingSection({ personId, kind, role }) {
  const { state, send, showToast } = useGame();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [preview, setPreview] = useState(null);
  const [booking, setBooking] = useState(false);
  const [confirmPromotion, setConfirmPromotion] = useState(false);

  const now = state.gameTime;
  const quals = (state.training?.qualifications || []).filter(q => q.personId === personId);
  const enrollments = (state.training?.enrollments || []).filter(e => e.personId === personId && ["reserved", "in_progress"].includes(e.status));

  const personRole = kind === "driver" ? "driver" : role;
  const activeQualTypes = new Set(quals.filter(q => q.status === "active").map(q => q.type));

  // Prüft, ob die Voraussetzungen für einen Kurs erfüllt sind.
  function meetsRequirements(course) {
    if (!course.requires || course.requires.length === 0) return true;
    for (const req of course.requires) {
      if (req === "driver_license") { if (kind !== "driver") return false; }
      else if (req === "dispatcher_role") { if (role !== "dispatcher" && role !== "dispatcher_senior") return false; }
      else if (req === "assistant_role") { if (role !== "assistant") return false; }
      else if (req === "branch_manager_role") { if (role !== "branch_manager") return false; }
      else if (req === "mechanic_role") { if (role !== "mechanic") return false; }
      else if (req === "cleaner_role") { if (role !== "cleaner") return false; }
      else if (req === "accountant_role") { if (role !== "accountant" && role !== "accountant_senior") return false; }
      else if (req === "adr_basic_valid") { if (!activeQualTypes.has("adr_basic")) return false; }
      else if (req === "adr_refresh_window") {
        const adr = quals.find(q => q.type === "adr_basic" && q.status === "active");
        if (!adr?.validUntilMin) return false;
        const daysLeft = Math.floor((adr.validUntilMin - now) / DAY_MIN);
        if (daysLeft > 365 || daysLeft <= 0) return false;
      }
      else if (req === "any_qualified") { if (activeQualTypes.size === 0) return false; }
    }
    return true;
  }

  // Kurse filtern: Rollen-passend, Voraussetzungen erfüllt, noch nicht abgeschlossen.
  const availableCourses = COURSE_CATALOG
    .filter(c => c.targetRole === personRole || c.targetRole === "any")
    .filter(c => meetsRequirements(c))
    .filter(c => !activeQualTypes.has(c.effect));

  async function loadPreview(courseId) {
    try {
      const r = await send("previewCourseBooking", { personId, courseId });
      setPreview(r);
    } catch (e) {
      setPreview({ ok: false, reason: e.message });
    }
  }

  useEffect(() => {
    if (selectedCourse) loadPreview(selectedCourse);
    else setPreview(null);
  }, [selectedCourse, state.gameTime]);

  function openDrawer() {
    setDrawerOpen(true);
    setSelectedCourse(null);
    setPreview(null);
    setConfirmPromotion(false);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedCourse(null);
    setPreview(null);
    setConfirmPromotion(false);
  }

  async function handleBook() {
    setBooking(true);
    try {
      const r = await send("bookCourse", { personId, courseId: selectedCourse, confirmPromotion });
      showToast(`Kurs gebucht: ${formatGameTime(r.startMin)}`, "success");
      closeDrawer();
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
        onClick={openDrawer}
        className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 bg-lime/10 border border-lime/30 text-lime text-xs font-medium hover:border-lime/50 transition"
      >
        <GraduationCap className="w-4 h-4" /> Kurs buchen
      </button>

      {/* Kurs-Auswahl Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Kurs buchen"
        kicker={kind === "driver" ? "Fahrer" : roleLabel(role)}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          {/* Kurs-Liste zur Auswahl (nur wenn kein Kurs ausgewählt) */}
          {!selectedCourse && (
            <div className="space-y-2">
              {availableCourses.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Keine Kurse verfügbar — entweder alle abgeschlossen oder Voraussetzungen nicht erfüllt.
                </div>
              ) : (
                availableCourses.map(course => (
                  <button
                    key={course.id}
                    onClick={() => setSelectedCourse(course.id)}
                    className="w-full glass border rounded-xl p-3 text-left transition border-white/10 hover:border-lime/20"
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

          {/* Vorschau & Buchung (nur wenn ein Kurs ausgewählt) */}
          {selectedCourse && !preview && (
            <div className="flex items-center justify-center py-6">
              <span className="w-5 h-5 border-2 border-lime/30 border-t-lime rounded-full animate-spin" />
            </div>
          )}

          {selectedCourse && preview && !preview.ok && (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-400/20 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-300 shrink-0 mt-0.5" />
                <div className="text-xs text-red-300">{preview.reason}</div>
              </div>
              <button onClick={() => { setSelectedCourse(null); setPreview(null); }} className="w-full px-3 py-2.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:text-foreground transition">
                Zurück zur Auswahl
              </button>
            </div>
          )}

          {selectedCourse && preview && preview.ok && (
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
                <button onClick={() => { setSelectedCourse(null); setPreview(null); }} className="px-3 py-2.5 rounded-lg border border-white/10 text-xs text-muted-foreground hover:text-foreground transition">
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
      </Drawer>
    </div>
  );
}