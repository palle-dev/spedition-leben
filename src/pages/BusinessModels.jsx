import React from "react";
import { useGame } from "@/lib/gameContext";
import FocusSelector from "@/components/business/FocusSelector";
import SegmentStatsView from "@/components/business/SegmentStatsView";
import MarketOverview from "@/components/business/MarketOverview";
import { Briefcase, Globe } from "lucide-react";

export default function BusinessModels() {
  const { state, send, showToast } = useGame();

  return (
    <div className="relative z-10 min-h-screen pb-24 lg:pb-12">
      <div className="px-4 sm:px-6 lg:px-12 py-6 lg:py-10 max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-lime/10 grid place-items-center">
            <Briefcase className="w-5 h-5 text-lime" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-semibold tracking-tight text-foreground">Geschäftsmodelle</h1>
            <p className="text-sm text-muted-foreground">Betriebliche Spezialisierung, Marktlage und Segment-Ergebnisse</p>
          </div>
        </div>

        {/* Marktübersicht (Regionen, Saisonal, Ereignisse) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-invest-cyan" />
            <h2 className="text-lg font-medium text-foreground">Marktlage</h2>
          </div>
          <MarketOverview state={state} send={send} />
        </div>

        {/* Trennlinie */}
        <div className="h-px bg-white/10" />

        {/* Fokus-Auswahl */}
        <FocusSelector state={state} send={send} showToast={showToast} />

        {/* Trennlinie */}
        <div className="h-px bg-white/10" />

        {/* Segment-Statistiken */}
        <SegmentStatsView state={state} send={send} />
      </div>
    </div>
  );
}