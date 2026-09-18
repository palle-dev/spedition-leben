import React from "react";
import { WORK_BUDGET_MIN, DRIVE_BUDGET_MIN } from "@/lib/gameData";
import { driverDisplayName } from "@/lib/displayHelpers";
import { formatGameTime } from "@/lib/gameData";
import { Clock, Coffee, Moon, Gauge } from "lucide-react";

// Grafische Fortschrittsanzeige für Fahrerarbeitszeiten unter dem Touren-Reiter.
// Zeigt Arbeitsbudget (480 Min) und Lenkzeitbudget (270 Min) pro Fahrer.
function BudgetBar({ used, total, label, color }) {
  const pct = Math.min(100, Math.round((used / total) * 100));
  const remaining = Math.max(0, total - used);
  const isCritical = remaining < total * 0.15;
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-muted-foreground flex items-center gap-1">
          <Gauge className="w-2.5 h-2.5" /> {label}
        </span>
        <span className={`tabular-nums ${isCritical ? "text-coral" : "text-muted-foreground"}`}>
          {remaining} min frei
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isCritical ? "bg-coral" : color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DriverRow({ driver }) {
  const workUsed = driver.workMinutesSinceRest || 0;
  const driveUsed = driver.driveMinutesSinceBreak || 0;
  const workPct = Math.min(100, Math.round((workUsed / WORK_BUDGET_MIN) * 100));
  const isResting = driver.status === "resting" && driver.restUntil;
  const isOnTrip = driver.status === "on_trip";

  const statusIcon = isResting ? <Moon className="w-3 h-3 text-sky-300" />
    : isOnTrip ? <Clock className="w-3 h-3 text-amber-300" />
    : <Coffee className="w-3 h-3 text-lime" />;
  const statusLabel = isResting ? `Ruhe bis ${formatGameTime(driver.restUntil)}`
    : isOnTrip ? "Unterwegs"
    : "Bereit";

  return (
    <div className="rounded-lg p-2.5 border border-white/10 bg-surface/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium truncate">{driverDisplayName(driver)}</span>
        <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
          {statusIcon} {statusLabel}
        </span>
      </div>
      <div className="flex gap-3">
        <BudgetBar used={workUsed} total={WORK_BUDGET_MIN} label="Arbeit" color="bg-lime" />
        <BudgetBar used={driveUsed} total={DRIVE_BUDGET_MIN} label="Lenkzeit" color="bg-coral" />
      </div>
    </div>
  );
}

export default function DriverWorkBudget({ state }) {
  const drivers = (state.drivers || []).filter(d => d.employmentStatus !== "terminated");
  if (drivers.length === 0) return null;

  return (
    <div className="space-y-2 mb-3">
      <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground flex items-center gap-1.5 px-1">
        <Gauge className="w-3 h-3" /> Fahrerarbeitszeiten
      </div>
      {drivers.map(d => <DriverRow key={d.id} driver={d} />)}
    </div>
  );
}