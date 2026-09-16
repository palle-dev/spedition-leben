import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import { COURSE_CATALOG, qualTypeLabel, qualStatusLabel } from "@/lib/trainingData";
import { CheckCircle, TrendingUp } from "lucide-react";

const DAY_MIN = 1440;

// Zeigt alle erfolgreich abgeschlossenen Weiterbildungen einer Person.
// Klar strukturiert mit Kurs-Label, Abschlussdatum, Effekt und Status.
export default function CompletedCoursesSection({ personId }) {
  const { state } = useGame();
  const now = state.gameTime;

  const quals = (state.training?.qualifications || [])
    .filter(q => q.personId === personId && q.source === "course" && (q.status === "active" || q.status === "expired"));

  if (quals.length === 0) {
    return (
      <div className="text-center py-3">
        <CheckCircle className="w-7 h-7 text-muted-foreground/30 mx-auto mb-1" />
        <div className="text-[11px] text-muted-foreground">Noch keine Kurse abgeschlossen.</div>
      </div>
    );
  }

  // Nach Abschlussdatum sortieren (neueste zuerst)
  const sorted = [...quals].sort((a, b) => (b.acquiredAtMin || 0) - (a.acquiredAtMin || 0));

  return (
    <div className="space-y-1.5">
      {sorted.map(q => {
        const course = COURSE_CATALOG.find(c => c.effect === q.type);
        const status = qualStatusLabel(q, now);
        const daysAgo = q.acquiredAtMin ? Math.floor((now - q.acquiredAtMin) / DAY_MIN) : null;
        return (
          <div key={q.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-lime/5 border border-lime/15">
            <div className="w-7 h-7 rounded-full bg-lime/15 grid place-items-center shrink-0 mt-0.5">
              <CheckCircle className="w-3.5 h-3.5 text-lime" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium truncate">{course?.label || qualTypeLabel(q.type)}</span>
                <span className={`text-[10px] flex items-center gap-1 shrink-0 ${status.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} /> {status.label}
                </span>
              </div>
              {course?.effectDesc && (
                <div className="text-[10px] text-lime/80 mt-0.5 flex items-start gap-1">
                  <TrendingUp className="w-2.5 h-2.5 shrink-0 mt-0.5" /> {course.effectDesc}
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {q.acquiredAtMin ? `Abgeschlossen ${formatGameTime(q.acquiredAtMin)}` : "Abgeschlossen"}
                {daysAgo != null && ` · vor ${daysAgo} Tagen`}
                {course?.feeCents ? ` · ${formatEuro(course.feeCents)}` : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}