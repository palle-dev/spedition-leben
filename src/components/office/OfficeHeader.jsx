import React from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { formatGameTime } from "@/lib/gameData";
import { MapPin, Clock, Pause, Play, Wifi, WifiOff } from "lucide-react";

// Kompakte Kopfzeile: Firma, Spieltag/Uhrzeit, Automatikstatus, Sync.
export default function OfficeHeader({ state, period, setPeriod }) {
  const navigate = useNavigate();
  const { automationEnabled, automationBusy, enableAutomation, pauseAutomation, connectionState } = useGame();

  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-medium tracking-tight">{state.company?.name || "Spedition"}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Hamburg · Hauptsitz</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatGameTime(state.gameTime)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Zeitraum-Filter */}
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {[{ id: "today", label: "Heute" }, { id: "week", label: "7 T" }, { id: "month", label: "30 T" }].map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-2.5 py-1.5 text-xs font-medium transition ${period === p.id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Automatik-Status */}
        <button
          onClick={() => automationEnabled ? pauseAutomation() : enableAutomation()}
          disabled={automationBusy}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition disabled:opacity-50 ${
            automationEnabled
              ? "bg-lime/10 border-lime/30 text-lime"
              : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"
          }`}
          title={automationEnabled ? "Automatik pausieren" : "Automatik starten"}
        >
          {automationEnabled ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {automationEnabled ? "Live" : "Pause"}
        </button>

        {/* Sync-Status */}
        <div className={`flex items-center gap-1 text-[10px] ${connectionState === "connected" ? "text-lime" : "text-amber-300"}`}>
          {connectionState === "connected" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
        </div>
      </div>
    </div>
  );
}