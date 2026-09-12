import React from "react";
import { CITIES, CITY_COORDS, getDistance } from "@/lib/gameData";

// Schematische Eigenkarte des Startgebiets (kein Karten- oder Routingdienst).
export default function GameMap({ vehicles, drivers, highlight }) {
  // Positionen sammeln
  const positions = {};
  CITIES.forEach((c) => { positions[c] = { vehicles: 0, drivers: 0, trips: 0 }; });
  (vehicles || []).forEach((v) => {
    if (positions[v.locationCity]) {
      positions[v.locationCity].vehicles += 1;
      if (v.status === "on_trip") positions[v.locationCity].trips += 1;
    }
  });
  (drivers || []).forEach((d) => {
    if (positions[d.locationCity]) positions[d.locationCity].drivers += 1;
  });

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-wood/40 bg-gradient-to-br from-office-2 to-office">
      <svg viewBox="0 0 100 90" className="w-full h-auto" style={{ aspectRatio: "100/90" }}>
        {/* Wasser/Hintergrund */}
        <rect x="0" y="0" width="100" height="90" fill="hsl(214 35% 16%)" />
        {/* Flüsse/Andeutung */}
        <path d="M0 48 Q 20 44, 45 50 T 100 52" stroke="hsl(200 40% 24%)" strokeWidth="0.6" fill="none" opacity="0.7" />

        {/* Verbindungen */}
        {CITIES.map((a, i) => CITIES.slice(i + 1).map((b) => {
          const ca = CITY_COORDS[a], cb = CITY_COORDS[b];
          const hi = highlight && ((highlight.from === a && highlight.to === b) || (highlight.from === b && highlight.to === a));
          return <line key={a + "-" + b} x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y} stroke={hi ? "hsl(38 92% 60%)" : "hsl(28 30% 40% / 0.35)"} strokeWidth={hi ? 0.9 : 0.4} />;
        }))}

        {/* Städte */}
        {CITIES.map((c) => {
          const co = CITY_COORDS[c];
          const p = positions[c];
          const isHq = c === "Hamburg";
          return (
            <g key={c}>
              <circle cx={co.x} cy={co.y} r={isHq ? 2.6 : 1.8} fill={isHq ? "hsl(38 92% 60%)" : "hsl(30 50% 65%)"} stroke="hsl(222 30% 8%)" strokeWidth="0.3" />
              <text x={co.x} y={co.y - 2.6} textAnchor="middle" fontSize="2.4" fill="hsl(40 40% 92%)" className="font-sans">{c}</text>
              {(p.vehicles > 0 || p.drivers > 0) && (
                <text x={co.x} y={co.y + 4.2} textAnchor="middle" fontSize="2" fill="hsl(150 50% 70%)">
                  {p.vehicles > 0 ? `🚚${p.vehicles}` : ""} {p.drivers > 0 ? `👤${p.drivers}` : ""}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-2 left-3 text-[10px] text-amber-100/50">Schematische Spielkarte – vereinfachte Spielentfernungen, keine Live-Routen.</div>
    </div>
  );
}