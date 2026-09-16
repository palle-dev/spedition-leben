import React, { useMemo, useState } from "react";
import { X, GraduationCap, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { formatPlanningTime } from "@/lib/planningData";

// Dialog zum Verlegen eines planbaren Lerntermins.
// Bricht die bestehende Einschreibung ab und bucht denselben Kurs neu.
// Der Anbieter weist neue Block-Termine zu — keine rein optische Verschiebung.
export default function TrainingRescheduleDialog({ open, onClose, enrollmentId }) {
  const { state, send } = useGame();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  const enrollment = useMemo(() => {
    return (state.training?.enrollments || []).find(e => e.id === enrollmentId);
  }, [state.training, enrollmentId]);

  const course = useMemo(() => {
    if (!enrollment) return null;
    return (state.training?.courses || []).find(c => c.id === enrollment.courseId);
  }, [state.training, enrollment]);

  const person = useMemo(() => {
    if (!enrollment) return null;
    const drivers = (state.drivers || []).find(d => d.id === enrollment.personId);
    const employees = (state.employees || []).find(e => e.id === enrollment.personId);
    return drivers || employees || null;
  }, [state, enrollment]);

  const firstBlock = (enrollment?.blockStarts || [])[0];
  const alreadyStarted = firstBlock != null && firstBlock <= state.gameTime;
  const canReschedule = enrollment && !alreadyStarted && !["completed", "cancelled", "in_progress"].includes(enrollment.status);

  async function handleReschedule() {
    setConfirming(true);
    setError("");
    try {
      await send("rescheduleTraining", { enrollmentId });
      onClose();
    } catch (e) {
      setError(e.message);
    }
    setConfirming(false);
  }

  if (!open || !enrollment) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-white/15 rounded-xl shadow-2xl max-w-md w-full mx-4 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-violet-400" />
            Lerntermin verlegen
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Aktuelle Einschreibung */}
          <div className="rounded-lg border border-white/10 bg-white/3 p-3 space-y-1">
            <div className="text-[11px] text-muted-foreground">Aktuelle Weiterbildung</div>
            <div className="text-sm font-medium">{course?.label || enrollment.courseId}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {person?.name || enrollment.personId}
            </div>
            {firstBlock != null && (
              <div className="text-xs text-muted-foreground">
                Erster Block: {formatPlanningTime(firstBlock)}
              </div>
            )}
            <div className="text-[10px] text-muted-foreground">
              Status: {enrollment.status}
            </div>
          </div>

          {/* Hinweis */}
          <div className="text-xs text-muted-foreground rounded-lg border border-violet-500/15 bg-violet-500/5 p-2">
            Die Einschreibung wird storniert und derselbe Kurs neu gebucht. Der Anbieter weist neue Block-Termine zu — die Weiterbildung wird in den nächsten verfügbaren Slot eingeplant.
          </div>

          {/* Warnung bei bereits begonnenem Kurs */}
          {alreadyStarted && (
            <div className="text-xs text-amber-400 rounded border border-amber-500/20 bg-amber-500/5 p-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              Diese Weiterbildung hat bereits begonnen und kann nicht mehr verlegt werden.
            </div>
          )}

          {/* Fehler */}
          {error && (
            <div className="text-xs text-red-400 rounded border border-red-500/20 bg-red-500/5 p-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Bestätigen */}
          {canReschedule && (
            <button
              onClick={handleReschedule}
              disabled={confirming}
              className="w-full rounded-md bg-violet-500 text-white text-sm font-medium py-2 disabled:opacity-40 hover:brightness-110 transition flex items-center justify-center gap-2"
            >
              {confirming ? "Verlege…" : <><CheckCircle className="w-4 h-4" /> Lerntermin verlegen</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}