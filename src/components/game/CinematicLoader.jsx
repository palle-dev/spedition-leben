import React, { useState, useEffect } from "react";

const STATUS_TEXTS = [
  "Flotte wird zusammengestellt …",
  "Aufträge werden geladen …",
  "Spedition wird eingerichtet …",
  "Bereit zur Abfahrt …",
];

export default function CinematicLoader() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / 2400, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setProgress(eased * 92);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const statusIndex =
    progress < 25 ? 0 : progress < 55 ? 1 : progress < 80 ? 2 : 3;

  return (
    <div
      className="fixed inset-0 bg-ink flex flex-col items-center justify-center overflow-hidden"
      role="status"
      aria-live="polite"
    >
      {/* Atmosphärisches Spotlight */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 52%, rgba(196,245,111,0.035) 0%, transparent 70%)",
        }}
      />

      {/* FRACHTFIEBER Titel */}
      <h1
        className="relative font-display font-bold tracking-[0.18em] text-2xl sm:text-3xl lg:text-4xl mb-10 lg:mb-14"
        style={{
          background: "linear-gradient(180deg, #fefefe 0%, #8a8a8a 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        FRACHTFIEBER
      </h1>

      {/* Lkw-Szene */}
      <div className="relative w-full max-w-xl px-6">
        {/* Scheinwerferkegel */}
        <div
          className="absolute top-[38%] left-[73%] w-[28%] h-28 -translate-y-1/2 origin-left pointer-events-none animate-pulse"
          style={{
            background:
              "linear-gradient(90deg, rgba(248,225,198,0.28) 0%, rgba(248,225,198,0.06) 55%, transparent 100%)",
            clipPath: "polygon(0 38%, 100% 0%, 100% 100%, 0 62%)",
          }}
        />

        {/* Lkw-Silhouette */}
        <svg
          viewBox="0 0 400 110"
          className="relative w-full h-auto block"
          fill="#161a1b"
        >
          {/* Auspuff */}
          <rect x="206" y="4" width="3" height="16" rx="1" />

          {/* Auflieger */}
          <rect x="5" y="16" width="205" height="62" rx="2" />
          <line
            x1="5"
            y1="48"
            x2="210"
            y2="48"
            stroke="#1e2426"
            strokeWidth="1"
          />

          {/* Auflieger-Räder */}
          <g>
            <circle cx="45" cy="86" r="13" />
            <circle cx="75" cy="86" r="13" />
            <circle cx="135" cy="86" r="13" />
            <circle cx="165" cy="86" r="13" />
          </g>
          <g fill="#0a0d0e">
            <circle cx="45" cy="86" r="5" />
            <circle cx="75" cy="86" r="5" />
            <circle cx="135" cy="86" r="5" />
            <circle cx="165" cy="86" r="5" />
          </g>

          {/* Fahrerhaus */}
          <path d="M210 16 L210 80 L294 80 L294 44 L276 34 L266 16 Z" />
          {/* Windschutzscheibe */}
          <path d="M269 20 L274 32 L290 32 L290 20 Z" fill="#2a3032" />
          {/* Türlinie */}
          <line
            x1="244"
            y1="16"
            x2="244"
            y2="80"
            stroke="#1e2426"
            strokeWidth="1"
          />

          {/* Fahrerhaus-Rad */}
          <circle cx="270" cy="86" r="13" />
          <circle cx="270" cy="86" r="5" fill="#0a0d0e" />

          {/* Scheinwerfer */}
          <rect x="290" y="48" width="5" height="7" rx="1" fill="#f8e1c6" />
          <circle cx="293" cy="51" r="3" fill="#f8e1c6" opacity="0.35" />
        </svg>

        {/* Straße mit animierten Markierungen */}
        <div className="relative mt-1 h-5 overflow-hidden">
          <div
            className="absolute inset-0 flex items-center gap-3 animate-road-flow"
          >
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="w-6 h-0.5 bg-white/55 rounded-full shrink-0"
              />
            ))}
          </div>
        </div>

        {/* Fortschrittsbalken */}
        <div className="mt-5 w-full h-1 rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className="h-full rounded-full bg-lime"
            style={{
              width: `${progress}%`,
              boxShadow:
                "0 0 10px rgba(196,245,111,0.5), 0 0 4px rgba(196,245,111,0.8)",
            }}
          />
        </div>

        {/* Statustext */}
        <p className="mt-3 text-center text-xs sm:text-sm text-muted-foreground tracking-wide">
          {STATUS_TEXTS[statusIndex]}
        </p>
      </div>
    </div>
  );
}