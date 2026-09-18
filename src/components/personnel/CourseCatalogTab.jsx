import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { COURSE_CATALOG, getCourseById, targetRoleLabel, enrollmentStatusLabel } from "@/lib/trainingData";
import Portrait from "@/components/ui/Portrait";
import Drawer from "@/components/ui/Drawer";
import { Clock, Euro, Check, AlertCircle, ChevronRight } from "lucide-react";

// Weiterbildungen-Tab: Kurskatalog mit Buchungsfunktion.
export default function CourseCatalogTab() {
  const { state, send, showToast } = useGame();
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [preview, setPreview] = useState(null);
  const [booking, setBooking] = useState(false);
  const [confirmPromotion, setConfirmPromotion] = useState(false);

  const allPersons = [
    ...(state.drivers || []).filter(d => d.employmentStatus === "employed").map(d => ({ ...d, kind: "driver", role: "driver" })),
    ...(state.employees || []).filter(e => e.employmentStatus === "employed").map(e => ({ ...e, kind: "employee" })),
  ];

  async function loadPreview() {
    if (!selectedCourse || !selectedPersonId) { setPreview(null); return; }
    try {
      const r = await send("previewCourseBooking", { personId: selectedPersonId, courseId: selectedCourse });
      setPreview(r);
    } catch (e) {
      setPreview({ ok: false, reason: e.message });
    }
  }

  useEffect(() => { loadPreview(); }, [selectedCourse, selectedPersonId, state.gameTime]);

  async function handleBook() {
    setBooking(true);
    try {
      const r = await send("bookCourse", { personId: selectedPersonId, courseId: selectedCourse, confirmPromotion });
      showToast(`Kurs gebucht: ${formatGameTime(r.startMin)}`, "success");
      setSelectedCourse(null);
      setSelectedPersonId("");
      setPreview(null);
      setConfirmPromotion(false);
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBooking(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Kurskatalog */}
      <div>
        <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">Verfügbare Kurse</h3>
        <div className="grid md:grid-cols-2 gap-3">
          {COURSE_CATALOG.map(course => (
            <CourseCard
              key={course.id}
              course={course}
              onSelect={() => { setSelectedCourse(course.id); setSelectedPersonId(""); }}
              isSelected={selectedCourse === course.id}
            />
          ))}
        </div>
      </div>

      {/* Buchungs-Drawer */}
      <Drawer
        open={!!selectedCourse}
        onClose={() => { setSelectedCourse(null); setPreview(null); setConfirmPromotion(false); }}
        title={selectedCourse ? getCourseById(selectedCourse)?.label : ""}
        kicker="Kurs buchen"
        maxWidth="max-w-md"
      >
        {selectedCourse && (
          <div className="space-y-4">
            {/* Kurs-Details */}
            <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 space-y-2">
              <div className="text-sm text-foreground/80">{getCourseById(selectedCourse)?.description}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3 h-3" /> {getCourseById(selectedCourse)?.hours} Stunden
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Euro className="w-3 h-3" /> {formatEuro(getCourseById(selectedCourse)?.feeCents)}
                </div>
              </div>
              <div className="text-[10px] text-lime">{getCourseById(selectedCourse)?.effectDesc}</div>
            </div>

            {/* Person-Auswahl */}
            <div>
              <label className="text-[11px] text-muted-foreground">Teilnehmer auswählen</label>
              <select
                value={selectedPersonId}
                onChange={e => { setSelectedPersonId(e.target.value); setConfirmPromotion(false); }}
                className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-2 border border-white/10 text-foreground text-sm focus:border-lime/50 outline-none"
              >
                <option value="">– wählen –</option>
                {allPersons.map(p => (
                  <option key={p.id} value={p.id}>{p.name} · {p.kind === "driver" ? "Fahrer" : roleLabel(p.role)}</option>
                ))}
              </select>
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
                {/* Termin */}
                <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 space-y-1.5">
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
                    <span className="text-muted-foreground">Ort</span>
                    <span className="font-medium">{preview.providerCity}</span>
                  </div>
                </div>

                {/* Kosten */}
                <div className="p-3 rounded-lg bg-surface-2/50 border border-white/5 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Kursgebühr (bei Beginn)</span>
                    <span className="font-medium tabular-nums">{formatEuro(preview.feeCents)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Lohn während Kurs</span>
                    <span className="font-medium tabular-nums">{formatEuro(preview.wageDuringCourse)}</span>
                  </div>
                </div>

                {/* Konflikte */}
                {preview.conflicts.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-400/20">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-amber-300 mb-1">Konflikte</div>
                    {preview.conflicts.map((c, i) => (
                      <div key={i} className="text-[10px] text-muted-foreground">
                        {c.label}: {c.startMin ? formatGameTime(c.startMin) : ""} {c.endMin ? `→ ${formatGameTime(c.endMin)}` : ""}
                      </div>
                    ))}
                  </div>
                )}

                {/* Beförderung */}
                {preview.promotion && (
                  <div className="p-3 rounded-lg bg-lime/10 border border-lime/20">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-lime mb-1">Beförderung bei Abschluss</div>
                    <div className="text-xs text-foreground/80 space-y-0.5">
                      <div>Neue Rolle: {preview.promotion.newRole === "dispatcher_senior" ? "Erf. Disponent" : "Erf. Buchhaltung"}</div>
                      <div>Neuer Lohn: {formatEuro(preview.promotion.newWageCents)}/Tag (max. bisher, {formatEuro(preview.promotion.currentWageCents)})</div>
                    </div>
                    <label className="flex items-center gap-2 mt-2 text-xs">
                      <input type="checkbox" checked={confirmPromotion} onChange={e => setConfirmPromotion(e.target.checked)} className="accent-lime" />
                      Beförderung bestätigen
                    </label>
                  </div>
                )}

                {/* Buchen-Button */}
                <button
                  onClick={handleBook}
                  disabled={booking || (preview.promotion && !confirmPromotion)}
                  className="w-full flex items-center justify-center gap-2 bg-lime text-ink rounded-lg py-3 font-semibold text-sm hover:brightness-110 disabled:opacity-40 transition"
                >
                  {booking ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Kurs buchen</>}
                </button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Aktive Einschreibungen */}
      <ActiveEnrollments />
    </div>
  );
}

function CourseCard({ course, onSelect, isSelected }) {
  return (
    <button
      onClick={onSelect}
      className={`glass border rounded-xl p-4 text-left transition w-full ${
        isSelected ? "border-lime/40 bg-lime/5" : "border-white/10 hover:border-lime/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{course.label}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{targetRoleLabel(course.targetRole)}</div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
      <div className="text-[10px] text-lime mt-2">{course.effectDesc}</div>
      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="w-3 h-3" /> {course.hours} Std
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Euro className="w-3 h-3" /> {formatEuro(course.feeCents)}
        </div>
      </div>
    </button>
  );
}

function ActiveEnrollments() {
  const { state } = useGame();
  const enrollments = (state.training?.enrollments || []).filter(e => ["reserved", "in_progress"].includes(e.status));

  if (enrollments.length === 0) return null;

  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Aktive Einschreibungen</h3>
      <div className="space-y-2">
        {enrollments.map(enr => {
          const course = getCourseById(enr.courseId);
          const person = (state.drivers || []).find(d => d.id === enr.personId) || (state.employees || []).find(e => e.id === enr.personId);
          const status = enrollmentStatusLabel(enr.status);
          return (
            <div key={enr.id} className="glass border border-white/10 rounded-xl p-3 flex items-center gap-3">
              {person && <Portrait portraitId={person.portraitId} name={person.name} size="sm" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{person?.name || enr.personId}</div>
                <div className="text-[10px] text-muted-foreground">{course?.label || enr.courseId}</div>
              </div>
              <div className="text-right">
                <div className={`text-[10px] flex items-center gap-1 ${status.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{formatGameTime(enr.startMin)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}