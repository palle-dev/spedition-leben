import React from "react";
import { CITIES, CITY_COORDS } from "@/lib/gameData";
import { getVehiclePosition, vehicleDisplayName } from "@/lib/displayHelpers";
import { useGame } from "@/lib/gameContext";

// Räumliche Übersichtskarte: Städte, Verbindungen, Hauptsitz, Fahrzeugpositionen, gewählte Route.
// Schematische Darstellung – gerade Verbindungslinien, keine erfundene Straßenroute.
export default function DispatchMap({ selectedTripId, compact = false }) {
  const { state } = useGame();

  const selectedTrip = selectedTripId ? state.trips.find(t => t.id === selectedTripId) : null;

  const vehicleMarkers = state.vehicles.map(v => ({
    id: v.id,
    name: vehicleDisplayName(v),
    status: v.status,
    pos: getVehiclePosition(v, state)
  })).filter(m => m.pos);

  return (
    <div className={`relative rounded-xl bg-surface-2 border border-white/10 overflow-hidden ${compact ? "" : ""}`} style={{ aspectRatio: "16 / 10" }}>
      <svg viewBox="0 0 100 80" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Hintergrund-Gradient */}
        <defs>
          <radialGradient id="mapGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="hsl(var(--lime))" stopOpacity="0.04" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
        </defs>
        <rect width="100" height="80" fill="url(#mapGlow)" />

        {/* Verbindungslinien (Netzwerk, nicht Straßen) */}
        {CITIES.map((a, i) =>
          CITIES.slice(i + 1).map(b => {
            const ca = CITY_COORDS[a], cb = CITY_COORDS[b];
            if (!ca || !cb) return null;
            return (
              <line
                key={`${a}-${b}`}
                x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="0.25"
              />
            );
          })
        )}

        {/* Gewählte Route */}
        {selectedTrip && selectedTrip.legs.map((leg, i) => {
          const ca = CITY_COORDS[leg.fromCity], cb = CITY_COORDS[leg.toCity];
          if (!ca || !cb || (leg.fromCity === leg.toCity)) return null;
          const isLoaded = leg.type === "drive";
          const isEmpty = leg.type === "empty" || leg.type === "empty_drive";
          const isPast = selectedTrip.currentLeg > i;
          return (
            <line
              key={i}
              x1={ca.x} y1={ca.y} x2={cb.x} y2={cb.y}
              stroke={isLoaded ? "hsl(var(--lime))" : isEmpty ? "hsl(var(--coral))" : "rgba(255,255,255,0.3)"}
              strokeWidth="0.7"
              strokeDasharray={isEmpty ? "2 1.5" : "none"}
              opacity={isPast ? 0.35 : 0.85}
            />
          );
        })}

        {/* Städte */}
        {CITIES.map(c => {
          const coord = CITY_COORDS[c];
          if (!coord) return null;
          const isHQ = c === "Hamburg";
          return (
            <g key={c}>
              {isHQ && <circle cx={coord.x} cy={coord.y} r="3.5" fill="none" stroke="hsl(var(--lime))" strokeWidth="0.3" opacity="0.4" />}
              <circle cx={coord.x} cy={coord.y} r={isHQ ? 1.6 : 1.1} fill={isHQ ? "hsl(var(--lime))" : "rgba(255,255,255,0.45)"} />
              <text
                x={coord.x}
                y={coord.y - 2.5}
                textAnchor="middle"
                fill={isHQ ? "hsl(var(--lime))" : "rgba(255,255,255,0.55)"}
                fontSize="2.6"
                fontWeight={isHQ ? "600" : "400"}
                fontFamily="Inter, sans-serif"
              >
                {c}
              </text>
            </g>
          );
        })}

        {/* Fahrzeugmarker */}
        {vehicleMarkers.map(m => (
          <g key={m.id}>
            {m.status === "on_trip" && (
              <circle cx={m.pos.x} cy={m.pos.y} r="2.5" fill="hsl(var(--lime))" opacity="0.2">
                <animate attributeName="r" values="2;3.5;2" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={m.pos.x}
              cy={m.pos.y}
              r="1.4"
              fill={m.status === "on_trip" ? "hsl(var(--lime))" : m.status === "maintenance" ? "hsl(200 80% 60%)" : "hsl(var(--coral))"}
              stroke="hsl(var(--ink))"
              strokeWidth="0.4"
            />
          </g>
        ))}
      </svg>

      {/* Legende */}
      <div className="absolute bottom-2 left-3 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-lime" /> Beladen</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-coral" /> Leer</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400" /> Wartung</span>
      </div>
      <div className="absolute top-2 right-3 text-[10px] text-muted-foreground/50">Schematisch · keine Straßenroute</div>
    </div>
  );
}