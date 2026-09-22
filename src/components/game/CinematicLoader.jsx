import React, { useState, useEffect } from "react";

const STATUS_TEXTS = [
  "Flotte wird zusammengestellt …",
  "Aufträge werden geladen …",
  "Spedition wird eingerichtet …",
  "Bereit zur Abfahrt …",
];

const GRAY = { top: "#2D3939", right: "#1D2626", left: "#151C1C" };
const LIME = { top: "#D4FF48", right: "#AED832", left: "#86AC1E" };

function IsoContainer({ x, y, w, d, h, colors }) {
  const top = `${x},${y - h} ${x + w},${y - h + w * 0.5} ${x + w - d},${y - h + (w + d) * 0.5} ${x - d},${y - h + d * 0.5}`;
  const right = `${x},${y} ${x},${y - h} ${x + w},${y - h + w * 0.5} ${x + w},${y + w * 0.5}`;
  const left = `${x},${y} ${x},${y - h} ${x - d},${y - h + d * 0.5} ${x - d},${y + d * 0.5}`;
  return (
    <g>
      <polygon points={left} fill={colors.left} />
      <polygon points={right} fill={colors.right} />
      <polygon points={top} fill={colors.top} />
      {[0.2, 0.4, 0.6, 0.8].map((f, i) => (
        <line key={`r${i}`} x1={x} y1={y - h * f} x2={x + w} y2={y + w * 0.5 - h * f} stroke={colors.left} strokeWidth="0.8" opacity="0.3" />
      ))}
      {[0.2, 0.4, 0.6, 0.8].map((f, i) => (
        <line key={`l${i}`} x1={x} y1={y - h * f} x2={x - d} y2={y + d * 0.5 - h * f} stroke={colors.left} strokeWidth="0.8" opacity="0.2" />
      ))}
    </g>
  );
}

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

  const statusIndex = progress < 25 ? 0 : progress < 55 ? 1 : progress < 80 ? 2 : 3;

  const W = 70, D = 30, H = 45, X = -20;
  const stackY = [45, 0, -45];
  const landY = -90;

  return (
    <div className="fixed inset-0 bg-ink flex flex-col items-center justify-center overflow-hidden" role="status" aria-live="polite">
      {/* F-Logo */}
      <div className="relative flex flex-col items-center mb-3">
        <div className="w-11 h-11 rounded-xl bg-lime flex items-center justify-center mb-2 shadow-[0_0_20px_rgba(196,245,111,0.25)]">
          <span className="text-ink font-bold text-xl leading-none">F</span>
        </div>
        <span className="text-base font-medium tracking-wide text-foreground/90">Frachtfieber</span>
      </div>

      {/* Container-Stack Animation */}
      <div className="relative flex-1 flex items-center justify-center w-full min-h-0">
        <svg viewBox="-60 -245 120 325" className="w-full max-w-[260px] h-auto max-h-[52vh]">
          <defs>
            <linearGradient id="shaftGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#D4FF48" stopOpacity="0" />
              <stop offset="100%" stopColor="#D4FF48" stopOpacity="0.22" />
            </linearGradient>
          </defs>

          {/* Lichtstrahl */}
          <polygon
            points={`${X - 10},${landY - H - 95} ${X + 10},${landY - H - 95} ${X + 24},${landY - H} ${X - 24},${landY - H}`}
            fill="url(#shaftGrad)"
            className="animate-light-shaft"
          />

          {/* Stapel (3 graue Container) */}
          {stackY.map((y, i) => (
            <IsoContainer key={i} x={X} y={y} w={W} d={D} h={H} colors={GRAY} />
          ))}

          {/* Einschlag-Blitz */}
          <g className="animate-impact-flash">
            <circle cx={0} cy={landY + 25} r={26} fill="#D4FF48" opacity="0.15" />
            <circle cx={0} cy={landY + 25} r={16} fill="#D4FF48" opacity="0.3" />
          </g>

          {/* Zweiter fallender Container (grau, verzögert) */}
          <g className="animate-container-drop" style={{ animationDelay: "-1s" }}>
            <IsoContainer x={X} y={landY} w={W} d={D} h={H} colors={GRAY} />
          </g>

          {/* Haupt fallender Container (lime, glühend) */}
          <g className="animate-container-drop">
            <circle cx={0} cy={landY - H * 0.5} r={42} fill="#D4FF48" opacity="0.06" />
            <IsoContainer x={X} y={landY} w={W} d={D} h={H} colors={LIME} />
          </g>
        </svg>
      </div>

      {/* Fortschrittsbereich */}
      <div className="relative w-full max-w-[260px] px-4 mt-2">
        {/* Tick-Markierungen */}
        <svg className="w-14 h-3 mb-1 mx-auto block" viewBox="0 0 56 12">
          <line x1="6" y1="2" x2="20" y2="10" stroke="#D4FF48" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
          <line x1="50" y1="2" x2="36" y2="10" stroke="#D4FF48" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
        </svg>

        {/* Fortschrittsbalken */}
        <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-lime"
            style={{ width: `${progress}%`, boxShadow: "0 0 10px rgba(196,245,111,0.5), 0 0 4px rgba(196,245,111,0.8)" }}
          />
        </div>

        {/* Statustext */}
        <p className="mt-3 text-center text-xs sm:text-sm text-muted-foreground tracking-wide">{STATUS_TEXTS[statusIndex]}</p>
      </div>
    </div>
  );
}