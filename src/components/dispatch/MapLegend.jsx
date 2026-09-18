import React, { useState } from "react";
import { TRAFFIC_LEVELS } from "@/lib/trafficSystem";
import { ChevronDown, TrafficCone } from "lucide-react";
import { formatGameTimeShort } from "@/lib/siteData";

export default function MapLegend({ showTraffic, gameTime = 0 }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="absolute bottom-9 left-3 z-10 max-w-[240px]">
      <div className="glass border border-white/15 rounded-xl overflow-hidden shadow-xl shadow-black/40">
        <button onClick={() => setExpanded(v => !v)} aria-expanded={expanded} aria-controls="traffic-map-legend"
          className="w-full flex items-center justify-between gap-3 px-3 py-2 text-xs font-medium hover:bg-white/5">
          <span className="flex items-center gap-1.5"><TrafficCone className="w-3.5 h-3.5 text-amber-300" />{showTraffic ? "Simulierte Verkehrslage" : "Kartenlegende"}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
        {showTraffic && <div className="px-3 pb-2 space-y-1.5">
          <div className="flex flex-wrap gap-x-3 gap-y-1">{TRAFFIC_LEVELS.map(l => <span key={l.id} className="flex items-center gap-1 text-[10px]"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: l.color }} />{l.label}</span>)}</div>
          <p className="text-[10px] text-muted-foreground">Stand {formatGameTimeShort(Math.floor(gameTime / 60) * 60)} · stündlich</p>
        </div>}
        {expanded && <div id="traffic-map-legend" className="px-3 pb-3 space-y-2 text-[11px] text-muted-foreground">
          {showTraffic && <p>Spielmodell, keine Live-Verkehrsdaten. Die Farben verändern die geplanten Ankunftszeiten nicht.</p>}
          <p><span className="inline-block w-5 border-t-2 border-foreground mr-2 align-middle" />Beladene Fahrt</p>
          <p><span className="inline-block w-5 border-t-2 border-dashed border-foreground mr-2 align-middle" />Leerfahrt</p>
          <p>Dünne Linien: Verkehrsübersicht zwischen benachbarten Städten. Breite Linien: eigene Touren.</p>
          <p>Ohne Straßengeometrie wird eine vereinfachte Verbindung angezeigt. Route oder Verkehrsabschnitt anklicken für Details.</p>
        </div>}
      </div>
    </div>
  );
}
