import React from "react";
import { projectCity, ALL_CITIES } from "@/lib/branchData";

// Einfache SVG-basierte Deutschland-Übersicht mit Filial-Markern.
// Kein MapLibre – leichtgewichtig und schnell.
export default function BranchMap({ branches, selectedId, onSelect }) {
  const activeBranchCities = new Set(branches.filter(b => b.status === "active").map(b => b.city));

  return (
    <div className="relative w-full aspect-[4/5] max-w-md mx-auto glass border border-white/10 rounded-xl overflow-hidden">
      {/* Deutschland-Schema als Hintergrund */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 125" preserveAspectRatio="xMidYMid meet">
        <text x="5" y="10" fill="currentColor" fontSize="4">DACH · Standortübersicht</text>
        {/* Stadt-Punkte */}
        {ALL_CITIES.map(city => {
          const pos = projectCity(city);
          if (!pos) return null;
          const hasBranch = activeBranchCities.has(city);
          const branch = branches.find(b => b.city === city && b.status === "active");
          const isSelected = branch && branch.id === selectedId;
          return (
            <g key={city} onClick={() => branch && onSelect?.(branch.id)} className={branch ? "cursor-pointer" : ""}>
              {hasBranch && (
                <circle
                  cx={pos.x} cy={pos.y * 1.25} r={isSelected ? 3.5 : 2.5}
                  fill="hsl(var(--lime))"
                  stroke={isSelected ? "hsl(var(--lime))" : "hsl(var(--ink))"}
                  strokeWidth="1"
                  className="transition-all"
                />
              )}
              {!hasBranch && (
                <circle cx={pos.x} cy={pos.y * 1.25} r="1" fill="hsl(var(--text) / 0.15)" />
              )}
              {hasBranch && (
                <text
                  x={pos.x} y={pos.y * 1.25 - 4}
                  textAnchor="middle"
                  fontSize="2.5"
                  fill={isSelected ? "hsl(var(--lime))" : "hsl(var(--text) / 0.5)"}
                  className="select-none"
                >
                  {city.length > 8 ? city.slice(0, 7) + "." : city}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-2 left-2 text-[9px] text-muted-foreground/50 uppercase tracking-wider">
        Filialstandorte
      </div>
    </div>
  );
}