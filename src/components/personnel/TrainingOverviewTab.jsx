import React, { useMemo } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime } from "@/lib/gameData";
import { qualTypeLabel, qualStatusLabel } from "@/lib/trainingData";
import { getTrainingOverview } from "@/lib/trainingOverviewData";
import Portrait from "@/components/ui/Portrait";
import { BookOpen, GraduationCap, AlertCircle, Clock, Users, CheckCircle } from "lucide-react";

// Übersicht-Tab: zeigt aktive Teilnehmer, nächste Abschlüsse,
// ablaufende Qualifikationen und offene Übernahmen.
// Berechnet die Daten direkt aus dem State — kein Worker-Roundtrip,
// der hängen bleiben kann.
export default function TrainingOverviewTab() {
  const { state } = useGame();
  const overview = useMemo(() => getTrainingOverview(state), [state]);

  const now = state.gameTime;

  return (
    <div className="space-y-4">
      {/* Zusammenfassung */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard label="Aktive Kurse" value={overview.activeEnrollments} icon={BookOpen} color="text-sky-300" />
        <SummaryCard label="Ausbildungen" value={overview.activeApprenticeships} icon={GraduationCap} color="text-amber-300" />
        <SummaryCard label="Ablaufende" value={overview.expiringSoon.length} icon={AlertCircle} color={overview.expiringSoon.length > 0 ? "text-coral" : "text-muted-foreground"} />
        <SummaryCard label="Übernahmen" value={overview.pendingTakeovers.length} icon={Users} color={overview.pendingTakeovers.length > 0 ? "text-coral" : "text-muted-foreground"} />
      </div>

      {/* Anbieterplätze */}
      <div className="glass border border-white/10 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Bildungspartner Hamburg</div>
          <div className="text-sm font-medium tabular-nums">{overview.providerSlotsUsed}/{overview.providerSlotsTotal} Plätze</div>
        </div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mt-2">
          <div className="h-full bg-sky-300/60" style={{ width: `${(overview.providerSlotsUsed / overview.providerSlotsTotal) * 100}%` }} />
        </div>
      </div>

      {/* Nächste Abschlüsse */}
      {overview.upcomingCompletions.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Nächste Abschlüsse
          </h3>
          <div className="space-y-2">
            {overview.upcomingCompletions.slice(0, 5).map(c => {
              const person = (state.drivers || []).find(d => d.id === c.personId) || (state.employees || []).find(e => e.id === c.personId);
              return (
                <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-2/40 border border-white/5">
                  {person && <Portrait portraitId={person.portraitId} name={person.name} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{person?.name || c.personId}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {c.type === "course" ? "Kurs" : "Ausbildung"} · {formatGameTime(c.endMin)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Ablaufende Qualifikationen */}
      {overview.expiringSoon.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" /> Ablaufende Qualifikationen
          </h3>
          <div className="space-y-2">
            {overview.expiringSoon.slice(0, 5).map(q => {
              const person = (state.drivers || []).find(d => d.id === q.personId) || (state.employees || []).find(e => e.id === q.personId);
              const status = qualStatusLabel(q, now);
              return (
                <div key={q.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-amber-400/5 border border-amber-400/15">
                  {person && <Portrait portraitId={person.portraitId} name={person.name} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{person?.name || q.personId}</div>
                    <div className="text-[10px] text-muted-foreground">{qualTypeLabel(q.type)}</div>
                  </div>
                  <div className={`text-[10px] font-medium ${status.color}`}>{q.daysLeft} Tage</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Offene Übernahmen */}
      {overview.pendingTakeovers.length > 0 && (
        <div>
          <h3 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" /> Offene Übernahmen
          </h3>
          <div className="space-y-2">
            {overview.pendingTakeovers.map(a => {
              const person = (state.drivers || []).find(d => d.id === a.personId) || (state.employees || []).find(e => e.id === a.personId);
              return (
                <div key={a.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-coral/5 border border-coral/15">
                  {person && <Portrait portraitId={person.portraitId} name={person.name} size="sm" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{person?.name || a.personId}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {a.role} · Frist: {formatGameTime(a.completionAtMin + 7 * 1440)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {overview.upcomingCompletions.length === 0 && overview.expiringSoon.length === 0 && overview.pendingTakeovers.length === 0 && (
        <div className="text-center py-8">
          <CheckCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <div className="text-sm text-muted-foreground">Keine offenen Ausbildungsthemen.</div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  return (
    <div className="glass border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1">
        <Icon className={`w-3 h-3 ${color}`} /> {label}
      </div>
      <div className={`text-xl font-medium tabular-nums ${value > 0 ? color : "text-foreground"}`}>{value}</div>
    </div>
  );
}