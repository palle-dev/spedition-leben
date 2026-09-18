import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { enrollmentStatusLabel, apprenticeshipStatusLabel } from "@/lib/trainingData";
import Portrait from "@/components/ui/Portrait";
import { Calendar, BookOpen, GraduationCap } from "lucide-react";

// Termine-Tab: zeigt den Ausbildungskalender mit allen geplanten Blöcken.
export default function TrainingScheduleTab() {
  const { state, send } = useGame();
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadSchedule() {
    try {
      const r = await send("getTrainingSchedule", { fromMin: state.gameTime, toMin: state.gameTime + 30 * 1440 });
      setSchedule(r.events || []);
    } catch (e) {
      setSchedule([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSchedule(); }, [state.gameTime]);

  if (loading) return <div className="text-sm text-muted-foreground text-center py-4">Lade Termine…</div>;

  if (schedule.length === 0) {
    return (
      <div className="text-center py-8">
        <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
        <div className="text-sm text-muted-foreground">Keine Ausbildungstermine in den nächsten 30 Tagen.</div>
      </div>
    );
  }

  // Nach Tag gruppieren
  const byDay = {};
  for (const ev of schedule) {
    const day = Math.floor(ev.startMin / 1440);
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(ev);
  }
  const sortedDays = Object.keys(byDay).sort((a, b) => parseInt(a) - parseInt(b));

  return (
    <div className="space-y-4">
      {sortedDays.map(dayKey => {
        const dayMin = parseInt(dayKey) * 1440;
        const events = byDay[dayKey];
        return (
          <div key={dayKey}>
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> {formatGameTime(dayMin).split(",")[0]}
            </div>
            <div className="space-y-2">
              {events.map(ev => {
                const person = (state.drivers || []).find(d => d.id === ev.personId) || (state.employees || []).find(e => e.id === ev.personId);
                const isCourse = ev.type === "course_block";
                const status = isCourse ? enrollmentStatusLabel(ev.status) : apprenticeshipStatusLabel(ev.status);
                const Icon = isCourse ? BookOpen : GraduationCap;
                return (
                  <div key={ev.id} className="glass border border-white/10 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-surface-2 grid place-items-center shrink-0">
                      <Icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    {person && <Portrait portraitId={person.portraitId} name={person.name} size="sm" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {isCourse ? ev.courseLabel : `${roleLabel(ev.role)}-Ausbildung`}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {person?.name || ev.personId} · {formatGameTime(ev.startMin).split(", ")[1]} – {formatGameTime(ev.endMin).split(", ")[1]}
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
        );
      })}
    </div>
  );
}