import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Building2, Heart, LineChart } from "lucide-react";

// Icon-only Welt-Umschaltung — drei Bereiche als animierte Icon-Buttons.
// Tooltip beim Hovern, aktiver Zustand mit farbigem Pill-Hintergrund + Glow.
const WORLDS = [
  { path: "/", label: "Unternehmen", icon: Building2, activeColor: "lime", match: (loc) => loc !== "/zuhause" && !loc.startsWith("/investment") },
  { path: "/zuhause", label: "Privatleben", icon: Heart, activeColor: "coral", match: (loc) => loc === "/zuhause" },
  { path: "/investment", label: "Investment", icon: LineChart, activeColor: "invest-purple", match: (loc) => loc.startsWith("/investment") },
];

const COLOR_MAP = {
  lime: { active: "bg-lime text-ink", glow: "shadow-[0_0_12px_-2px_hsl(var(--lime)/0.5)]", ring: "group-hover:text-lime" },
  coral: { active: "bg-coral text-ink", glow: "shadow-[0_0_12px_-2px_hsl(var(--coral)/0.5)]", ring: "group-hover:text-coral" },
  "invest-purple": { active: "bg-invest-purple text-ink", glow: "shadow-[0_0_12px_-2px_hsl(var(--invest-purple)/0.5)]", ring: "group-hover:text-invest-purple" },
};

export default function WorldSwitch() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hovered, setHovered] = useState(null);

  return (
    <div className="flex items-center bg-ink/90 border border-white/10 rounded-full p-0.5 gap-0.5 shrink-0">
      {WORLDS.map((w) => {
        const isActive = w.match(location.pathname);
        const colors = COLOR_MAP[w.activeColor];
        const isHovered = hovered === w.path;
        const Icon = w.icon;
        return (
          <button
            key={w.path}
            onClick={() => navigate(w.path)}
            onMouseEnter={() => setHovered(w.path)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(w.path)}
            onBlur={() => setHovered(null)}
            className={`relative grid place-items-center w-9 h-9 rounded-full transition-all duration-300 [transition-timing-function:cubic-bezier(.2,.75,.2,1)] active:scale-90 ${
              isActive
                ? `${colors.active} ${colors.glow}`
                : `text-muted-foreground ${colors.ring} hover:bg-white/5`
            }`}
            aria-pressed={isActive}
            aria-label={w.label}
          >
            <Icon className={`w-4 h-4 transition-transform duration-300 [transition-timing-function:cubic-bezier(.2,.75,.2,1)] ${isHovered || isActive ? "scale-110" : "scale-100"}`} />
            {/* Tooltip */}
            <span
              className={`pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface-2 border border-white/15 px-2 py-1 text-[10px] font-medium text-foreground shadow-lg transition-all duration-200 [transition-timing-function:cubic-bezier(.2,.75,.2,1)] ${
                isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
              }`}
            >
              {w.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}