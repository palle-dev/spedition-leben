import React from "react";
import { Play, Pause, Loader2 } from "lucide-react";
import { useGame, useDisplayGameTime } from "@/lib/gameContext";
import { clockOf } from "@/lib/gameData";

// Kompakte Zeitautomatik-Steuerung für den ShellHeader.
// Play/Pause-Schalter mit Live-Indikator und aktueller Spielzeit.
export default function AutomationControl() {
  const { state, automationEnabled, automationBusy, enableAutomation, pauseAutomation } = useGame();
  const displayGameTime = useDisplayGameTime();
  if (!state) return null;

  const gameTime = displayGameTime || state.gameTime || 0;
  const day = Math.floor(gameTime / 1440) + 1;
  const clock = clockOf(gameTime);

  const handleToggle = () => {
    if (automationBusy) return;
    if (automationEnabled) pauseAutomation();
    else enableAutomation();
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Spielzeit-Anzeige */}
      <div className="hidden md:block text-right leading-none">
        <div className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Tag {day}</div>
        <div className="text-xs font-medium tabular-nums text-foreground mt-0.5">{clock}</div>
      </div>

      {/* Play/Pause-Schalter */}
      <button
        onClick={handleToggle}
        disabled={automationBusy}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium border transition shrink-0 ${
          automationEnabled
            ? "bg-lime/15 border-lime/40 text-lime hover:bg-lime/25"
            : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10"
        } ${automationBusy ? "opacity-60 cursor-wait" : ""}`}
        aria-label={automationEnabled ? "Zeitautomatik pausieren" : "Zeitautomatik starten"}
        aria-pressed={automationEnabled}
        title={automationEnabled ? "Automatik läuft – Klick zum Pausieren" : "Automatik pausiert – Klick zum Starten"}
      >
        {automationBusy ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : automationEnabled ? (
          <Pause className="w-3.5 h-3.5" />
        ) : (
          <Play className="w-3.5 h-3.5" />
        )}
        <span className="hidden lg:inline">{automationEnabled ? "Läuft" : "Pausiert"}</span>
        {automationEnabled && !automationBusy && (
          <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse-ring" />
        )}
      </button>
    </div>
  );
}