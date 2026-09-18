import React from "react";

// Ein einzelner Planungsblock in der Zeitachse.
// Unterscheidung nicht allein über Farben — zusätzlich über Symbole
// und Beschriftungen. Certainty wird über Rahmenstil dargestellt.
export default function PlanningBlock({ block, leftPct, widthPct, onClick, isSelected }) {
  if (!block) return null;

  const colorClasses = {
    lime: "bg-lime/25 border-lime/40 text-lime",
    cyan: "bg-cyan-500/20 border-cyan-500/40 text-cyan-300",
    amber: "bg-amber-500/20 border-amber-500/40 text-amber-300",
    slate: "bg-slate-500/20 border-slate-500/40 text-slate-300",
    indigo: "bg-indigo-500/20 border-indigo-500/40 text-indigo-300",
    orange: "bg-orange-500/20 border-orange-500/40 text-orange-300",
    teal: "bg-teal-500/20 border-teal-500/40 text-teal-300",
    rose: "bg-rose-500/20 border-rose-500/40 text-rose-300",
    violet: "bg-violet-500/20 border-violet-500/40 text-violet-300",
    purple: "bg-purple-500/20 border-purple-500/40 text-purple-300",
    sky: "bg-sky-500/20 border-sky-500/40 text-sky-300",
    coral: "bg-coral/20 border-coral/40 text-coral",
    green: "bg-green-500/15 border-green-500/30 text-green-300",
    red: "bg-red-500/20 border-red-500/40 text-red-300",
    yellow: "bg-yellow-500/15 border-yellow-500/30 text-yellow-300",
  };

  const colorClass = colorClasses[block.colorClass] || colorClasses.slate;

  // Certainty: running = durchgezogen, planned = gestrichelt, uncertain = gepunktet
  const borderStyle = block.certainty === "running"
    ? "border-solid"
    : block.certainty === "uncertain"
    ? "border-dotted"
    : "border-dashed";

  // Zu schmale Blöcke: nur Icon, kein Text
  const isNarrow = widthPct < 4;
  const isVeryNarrow = widthPct < 2;

  return (
    <div
      onClick={onClick}
      className={`absolute top-1 bottom-1 rounded border ${colorClass} ${borderStyle} ${
        isSelected ? "ring-2 ring-white/50 z-10" : ""
      } cursor-pointer overflow-hidden transition hover:brightness-125 ${
        isVeryNarrow ? "flex items-center justify-center" : "px-1"
      }`}
      style={{
        left: `${leftPct}%`,
        width: `${Math.max(widthPct, 0.5)}%`,
      }}
      title={block.label + " (" + block.typeLabel + ")"}
    >
      {isVeryNarrow ? (
        <span className="text-[10px]">{block.icon}</span>
      ) : isNarrow ? (
        <div className="flex items-center gap-0.5 h-full">
          <span className="text-[10px] shrink-0">{block.icon}</span>
          <span className="text-[9px] truncate">{block.typeLabel}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 h-full">
          <span className="text-[11px] shrink-0">{block.icon}</span>
          <span className="text-[10px] truncate font-medium">{block.label}</span>
        </div>
      )}
    </div>
  );
}