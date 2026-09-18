import React from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatGameTime, dayOf } from "@/lib/gameData";
import { MapPin, Pause, Play, Wifi, WifiOff } from "lucide-react";

// Kompakte, professionelle Kopfzeile: Firmenidentität, Spieltag/Uhrzeit,
// Automatikstatus und Zeitraum-Filter in klarer Hierarchie.
export default function OfficeHeader({ state, period, setPeriod }) {
  const navigate = useNavigate();
  const { automationEnabled, automationBusy, enableAutomation, pauseAutomation, connectionState } = useGame();
  const day = dayOf(state.gameTime);

  return (
    <div className="flex items-end justify-between flex-wrap gap-4 pb-4 border-b border-white/10">
      {/* Firmenidentität */}
      <div className="flex items-center gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 mb-1">
            Geschäftsleitung · Tag {day}
          </div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
            {state.company?.name || "Spedition"}
          </h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Hamburg · Hauptsitz
            </span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            <span className="tabular-nums">{formatGameTime(state.gameTime)}</span>
          </div>
        </div>
      </div>

      {/* Steuerung */}
      <div className="flex items-center gap-2.5">
        {/* Zeitraum-Filter */}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {[{ id: "today", label: "Heute" }, { id: "week", label: "7 Tage" }, { id: "month", label: "30 Tage" }].map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-3 py-2 text-xs font-medium transition ${period === p.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Automatik-Status */}
        <button
          onClick={() => automationEnabled ? pauseAutomation() : enableAutomation()}
          disabled={automationBusy}
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-medium border transition disabled:opacity-50 ${
            automationEnabled
              ? "bg-lime/10 border-lime/30 text-lime"
              : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"
          }`}
          title={automationEnabled ? "Automatik pausieren" : "Automatik starten"}
        >
          {automationEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {automationEnabled ? "Live" : "Pausiert"}
        </button>

        {/* Sync-Status */}
        <div className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded ${connectionState === "connected" ? "text-lime" : "text-amber-300"}`}>
          {connectionState === "connected" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span className="hidden sm:inline">{connectionState === "connected" ? "Synchron" : "Offline"}</span>
        </div>
      </div>
    </div>
  );
}