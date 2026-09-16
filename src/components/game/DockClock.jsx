import React from "react";
import { useDisplayGameTime } from "@/lib/gameContext";
import { dayOf, clockOf } from "@/lib/gameData";

// Isolierte Uhrzeit-Anzeige für das Dock.
// Nutzt den separaten DisplayGameTime-Context, sodass nur diese
// Komponente alle 500ms re-rendert — nicht das gesamte Dock
// (dessen backdrop-blur bei häufigen Re-Renders flackert).
export default function DockClock({ fallbackGameTime }) {
  const displayGameTime = useDisplayGameTime();
  const t = displayGameTime || fallbackGameTime || 0;
  return (
    <>
      <div className="text-right hidden sm:block leading-tight">
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Tag {dayOf(t)}</div>
        <div className="text-sm font-medium tabular-nums">{clockOf(t)} Uhr</div>
      </div>
      <div className="text-right sm:hidden leading-tight">
        <div className="text-[9px] text-muted-foreground">T{dayOf(t)}</div>
        <div className="text-xs font-medium tabular-nums">{clockOf(t)}</div>
      </div>
    </>
  );
}