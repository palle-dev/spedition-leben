import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import { qualTypeLabel, qualStatusLabel } from "@/lib/trainingData";
import Portrait from "@/components/ui/Portrait";
import { Award, CheckCircle, AlertCircle, Clock } from "lucide-react";

// Qualifikationen-Tab: zeigt alle Qualifikationen des Teams.
export default function QualificationsTab() {
  const { state, send } = useGame();
  const [filter, setFilter] = useState("active");
  const [selectedPersonId, setSelectedPersonId] = useState(null);

  const allPersons = [
    ...(state.drivers || []).filter(d => d.employmentStatus !== "former").map(d => ({ ...d, kind: "driver", role: "driver" })),
    ...(state.employees || []).filter(e => e.employmentStatus !== "former").map(e => ({ ...e, kind: "employee" })),
  ];

  const now = state.gameTime;

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-1.5">
        {[
          { id: "active", label: "Aktiv" },
          { id: "expiring", label: "Bald ablaufend" },
          { id: "expired", label: "Abgelaufen" },
          { id: "all", label: "Alle" },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter === f.id
                ? "bg-lime/15 text-lime border border-lime/30"
                : "bg-white/5 text-muted-foreground border border-white/10 hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Personen-Liste */}
      <div className="grid md:grid-cols-2 gap-3">
        {allPersons.map(p => {
          const quals = (state.training?.qualifications || []).filter(q => q.personId === p.id);
          const filtered = quals.filter(q => {
            if (filter === "active") return q.status === "active";
            if (filter === "expired") return q.status === "expired";
            if (filter === "expiring") {
              if (q.status !== "active" || !q.validUntilMin) return false;
              const daysLeft = Math.floor((q.validUntilMin - now) / 1440);
              return daysLeft <= 120 && daysLeft > 0;
            }
            return true;
          });
          if (filtered.length === 0 && filter !== "all") return null;

          return (
            <div key={p.id} className="glass border border-white/10 rounded-xl p-3">
              <div className="flex items-start gap-3 mb-3">
                <Portrait portraitId={p.portraitId} name={p.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">{p.kind === "driver" ? "Fahrer" : roleLabel(p.role)}</div>
                </div>
              </div>
              {filtered.length === 0 ? (
                <div className="text-[10px] text-muted-foreground text-center py-2">Keine Qualifikationen in diesem Filter.</div>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map(q => {
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
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}