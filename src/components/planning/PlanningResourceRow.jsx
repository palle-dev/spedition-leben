import React from "react";
import PlanningBlock from "./PlanningBlock";

// Eine einzelne Ressourcen-Zeile in der Zeitachse.
// Zeigt alle Blöcke einer Ressource (Fahrzeug, Fahrer, Werkstattplatz)
// entlang der 7-Tage-Zeitachse.
export default function PlanningResourceRow({ resource, horizonStart, horizonEnd, selectedBlockId, onSelectBlock }) {
  const totalMin = horizonEnd - horizonStart;

  function minToPct(min) {
    return ((min - horizonStart) / totalMin) * 100;
  }

  // Freie Bereiche markieren
  const freeGaps = [];
  let cursor = horizonStart;
  const sortedBlocks = [...resource.blocks].sort((a, b) => a.startMin - b.startMin);
  for (const b of sortedBlocks) {
    if (b.startMin > cursor) {
      freeGaps.push({ startMin: cursor, endMin: b.startMin });
    }
    cursor = Math.max(cursor, b.endMin);
  }
  if (cursor < horizonEnd) {
    freeGaps.push({ startMin: cursor, endMin: horizonEnd });
  }

  return (
    <div className="relative h-9 border-b border-white/5 hover:bg-white/3 transition group">
      {/* Freie Bereiche (subtil markiert) */}
      {freeGaps.map((gap, i) => {
        const leftPct = minToPct(gap.startMin);
        const widthPct = minToPct(gap.endMin) - leftPct;
        if (widthPct < 0.5) return null;
        return (
          <div
            key={"free_" + i}
            className="absolute top-1 bottom-1 rounded border border-dashed border-green-500/15 bg-green-500/5"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            title="Nach aktueller Planung verfügbar"
          >
            <div className="flex items-center justify-center h-full text-[9px] text-green-500/30 truncate px-1">
              {widthPct > 3 ? "✓ verfügbar" : ""}
            </div>
          </div>
        );
      })}

      {/* Blöcke */}
      {sortedBlocks.map((block, i) => {
        const leftPct = minToPct(block.startMin);
        const widthPct = minToPct(block.endMin) - leftPct;
        if (widthPct < 0.3) return null;
        return (
          <PlanningBlock
            key={block.sourceId || i}
            block={block}
            leftPct={leftPct}
            widthPct={widthPct}
            isSelected={selectedBlockId === block.sourceId}
            onClick={() => onSelectBlock?.(block)}
          />
        );
      })}
    </div>
  );
}