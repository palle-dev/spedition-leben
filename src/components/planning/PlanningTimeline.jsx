import React from "react";
import PlanningResourceRow from "./PlanningResourceRow";
import { dayOfLocal, PLANNING_DAY_MIN } from "@/lib/planningData";

// Die 7-Tage-Zeitachse mit Tages-Spalten und Ressourcen-Zeilen.
// Zeigt einen Zeitstempel, auf den sich die Daten beziehen.
export default function PlanningTimeline({ rows, horizonStart, horizonEnd, selectedBlockId, onSelectBlock, showPrivateBar, privateAppointments }) {
  const totalDays = Math.round((horizonEnd - horizonStart) / PLANNING_DAY_MIN);
  const dayWidthPct = 100 / totalDays;

  return (
    <div className="rounded-lg border border-white/10 glass overflow-hidden">
      {/* Zeitstempel */}
      <div className="px-4 py-2.5 border-b border-white/10 bg-white/3 text-[11px] text-muted-foreground flex items-center justify-between">
        <span>Bezugszeitpunkt: Tag {dayOfLocal(horizonStart)}</span>
        <span className="text-[10px]">Prognose — keine garantierte Verfügbarkeit</span>
      </div>

      {/* Tages-Spalten-Header */}
      <div className="flex border-b border-white/10">
        <div className="w-32 shrink-0 px-3 py-2.5 text-[11px] font-medium text-muted-foreground border-r border-white/10">
          Ressource
        </div>
        <div className="flex-1 relative">
          <div className="flex">
            {Array.from({ length: totalDays }, (_, i) => {
              const dayMin = horizonStart + i * PLANNING_DAY_MIN;
              const dayNum = dayOfLocal(dayMin);
              const isToday = dayNum === dayOfLocal(horizonStart);
              return (
                <div
                  key={i}
                  className={`flex-1 px-3 py-2.5 text-[11px] font-medium border-r border-white/5 ${
                    isToday ? "text-lime" : "text-muted-foreground"
                  }`}
                >
                  T{dayNum}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Private Termine (optional) */}
      {showPrivateBar && privateAppointments && privateAppointments.length > 0 && (
        <PrivateAppointmentsRow
          appointments={privateAppointments}
          horizonStart={horizonStart}
          horizonEnd={horizonEnd}
        />
      )}

      {/* Ressourcen-Zeilen */}
      <div>
        {rows.length === 0 ? (
          <div className="px-3 py-12 text-center text-sm text-muted-foreground">
            Keine Ressourcen in dieser Ansicht.
          </div>
        ) : (
          rows.map((resource) => (
            <div key={resource.id} className="flex border-b border-white/5 hover:bg-white/2">
              <div className="w-32 shrink-0 px-3 py-2.5 border-r border-white/10">
                <div className="text-xs font-medium truncate">{resource.label}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {resource.type} · {resource.locationCity || resource.currentCity || "—"}
                </div>
              </div>
              <div className="flex-1 relative">
                {/* Tages-Spalten-Gitter */}
                <div className="absolute inset-0 flex pointer-events-none">
                  {Array.from({ length: totalDays }, (_, i) => (
                    <div
                      key={i}
                      className={`flex-1 border-r border-white/5 ${i % 2 === 1 ? "bg-white/2" : ""}`}
                    />
                  ))}
                </div>
                <PlanningResourceRow
                  resource={resource}
                  horizonStart={horizonStart}
                  horizonEnd={horizonEnd}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={onSelectBlock}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PrivateAppointmentsRow({ appointments, horizonStart, horizonEnd }) {
  const totalMin = horizonEnd - horizonStart;
  function minToPct(min) {
    return ((min - horizonStart) / totalMin) * 100;
  }

  return (
    <div className="flex border-b border-coral/20 bg-coral/5">
      <div className="w-32 shrink-0 px-2 py-1.5 border-r border-white/10">
        <div className="text-[11px] font-medium text-coral flex items-center gap-1">
          🏠 Privat
        </div>
      </div>
      <div className="flex-1 relative h-7">
        {appointments.map((a) => {
          const leftPct = minToPct(a.startMin);
          const widthPct = minToPct(a.endMin) - leftPct;
          if (widthPct < 0.3) return null;
          return (
            <div
              key={a.id}
              className="absolute top-1 bottom-1 rounded border border-coral/40 bg-coral/15 px-1 overflow-hidden"
              style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 0.5)}%` }}
              title={a.text + " — " + (a.isPlayerBlocked ? "blockiert operative Aktionen" : "keine operative Sperre")}
            >
              <div className="text-[10px] truncate text-coral">{a.text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}