import React from "react";
import { dayPhase } from "@/components/scene/sceneUtils";

// Betriebshof im Fenster. Zeigt ausschließlich vorhandene Fahrzeugdaten:
// am Heimatstandort stehende freie Lkw, in Wartung befindliche Lkw im
// Werkstattbereich, Fahrzeuge auf Fahrt werden nicht als parkend gezeigt.
// Helligkeit und Lampen richten sich nach der gespeicherten Spielzeit.

const SKY = {
  morning: { from: "#f4c98a", to: "#a9c9e6", sun: "#ffd98a", lamp: false, ground: "#5a4a3a" },
  day: { from: "#86b6e6", to: "#cfe4f4", sun: "#fff3c4", lamp: false, ground: "#6b5a48" },
  evening: { from: "#e8916b", to: "#4a3a5e", sun: "#ff9d5c", lamp: true, ground: "#4a3a2e" },
  night: { from: "#16203a", to: "#0a0f1e", sun: null, lamp: true, ground: "#241a12" },
};

function Truck({ x, y, tint, maintenance }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect x="0" y="12" width="32" height="13" rx="2" fill={tint} />
      <rect x="24" y="4" width="9" height="9" rx="2" fill={tint} />
      <rect x="26" y="6" width="5" height="5" fill="#1a3a5c" />
      <circle cx="7" cy="27" r="3.5" fill="#140d05" />
      <circle cx="25" cy="27" r="3.5" fill="#140d05" />
      {maintenance && (
        <g stroke="#ffd98a" strokeWidth="1.4" strokeLinecap="round">
          <line x1="16" y1="-1" x2="16" y2="4" />
          <line x1="13" y1="1.5" x2="19" y2="1.5" />
        </g>
      )}
    </g>
  );
}

export default function FleetYard({ vehicles, gameTime }) {
  const phase = dayPhase(gameTime);
  const sky = SKY[phase];
  const home = "Hamburg";
  const parked = vehicles.filter((v) => v.status === "free" && v.locationCity === home);
  const maint = vehicles.filter((v) => v.status === "maintenance");
  const onTrip = vehicles.filter((v) => v.status === "on_trip").length;
  const shown = parked.slice(0, 6);
  const more = parked.length - shown.length;

  return (
    <div className="w-full h-full overflow-hidden relative">
      <svg viewBox="0 0 240 180" preserveAspectRatio="xMidYMid slice" className="w-full h-full">
        <defs>
          <linearGradient id="yard-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={sky.from} />
            <stop offset="1" stopColor={sky.to} />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="240" height="180" fill="url(#yard-sky)" />
        {sky.sun ? (
          <circle cx="200" cy="38" r="13" fill={sky.sun} opacity="0.85" />
        ) : (
          <circle cx="200" cy="38" r="9" fill="#e8e0d0" opacity="0.8" />
        )}
        <rect x="0" y="120" width="240" height="60" fill={sky.ground} />
        <line x1="0" y1="120" x2="240" y2="120" stroke="#000" strokeOpacity="0.25" />
        {/* Tor / Garage */}
        <rect x="188" y="74" width="46" height="56" fill="#3a2a1c" stroke="#140d05" />
        <line x1="211" y1="74" x2="211" y2="130" stroke="#140d05" />
        {/* Lampen bei Dunkelheit */}
        {sky.lamp && (
          <>
            <circle cx="28" cy="58" r="3" fill="#ffd98a" />
            <circle cx="28" cy="58" r="10" fill="#ffd98a" opacity="0.18" />
            <circle cx="120" cy="58" r="3" fill="#ffd98a" />
            <circle cx="120" cy="58" r="10" fill="#ffd98a" opacity="0.18" />
          </>
        )}
        {/* Parkende Lkw (eine Reihe, max. 6) */}
        {shown.map((v, i) => (
          <Truck key={v.id} x={12 + i * 36} y={92} tint="#5a7a9a" />
        ))}
        {/* Wartungsecke (max. 2, dahinter, bernsteinfarben) */}
        {maint.slice(0, 2).map((v, i) => (
          <Truck key={v.id} x={20 + i * 40} y={74} tint="#b8803a" maintenance />
        ))}
      </svg>
      <div className="absolute bottom-0 left-0 right-0 bg-office/80 backdrop-blur-sm px-2 py-0.5 text-[10px] text-amber-100 flex justify-between">
        <span>{parked.length} Hof</span>
        <span>{onTrip} unterwegs</span>
        <span>{maint.length} Wartung</span>
      </div>
      {more > 0 && (
        <div className="absolute top-1 right-1 text-[10px] text-amber-100/80 bg-office/70 rounded px-1">
          +{more}
        </div>
      )}
    </div>
  );
}