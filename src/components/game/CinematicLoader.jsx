import React from "react";

export default function CinematicLoader({ progress = 0, phase = "" }) {
  const pct = Math.round(progress);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - Math.min(progress, 100) / 100);

  return (
    <div
      className="fixed inset-0 bg-ink flex flex-col items-center justify-center overflow-hidden"
      role="status"
      aria-live="polite"
    >
      {/* F-Logo */}
      <div className="relative flex flex-col items-center mb-10">
        <img
          src="https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/d627d2612_icon-512.png"
          alt="Frachtfieber"
          className="w-12 h-12 rounded-xl object-cover mb-2.5 shadow-[0_0_24px_rgba(196,245,111,0.3)]"
        />
        <span className="text-lg font-medium tracking-wide text-foreground/90">
          Frachtfieber
        </span>
      </div>

      {/* Fortschrittsring */}
      <div className="relative w-40 h-40 mb-8">
        {/* Pulsierender Glow */}
        <div className="absolute inset-0 rounded-full bg-lime/5 animate-pulse-ring" />

        {/* Rotierender Punkt */}
        <div
          className="absolute inset-0 animate-spin"
          style={{ animationDuration: "2.5s" }}
        >
          <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-lime shadow-[0_0_10px_rgba(196,245,111,0.9)]" />
        </div>

        {/* Ring */}
        <svg
          viewBox="0 0 120 120"
          className="absolute inset-0 w-full h-full -rotate-90"
        >
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="2.5"
          />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="hsl(var(--lime))"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              filter: "drop-shadow(0 0 6px rgba(196,245,111,0.6))",
              transition:
                "stroke-dashoffset 0.4s cubic-bezier(0.2, 0.75, 0.2, 1)",
            }}
          />
        </svg>

        {/* Prozentzahl */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl font-bold text-lime tabular-nums">
            {pct}
            <span className="text-xl text-lime/70">%</span>
          </span>
        </div>
      </div>

      {/* Phasentext */}
      <p className="text-sm text-muted-foreground tracking-wide text-center max-w-xs px-6 min-h-[1.5rem]">
        {phase || "Spiel wird vorbereitet …"}
      </p>
    </div>
  );
}