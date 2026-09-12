import React from "react";
import { Link } from "react-router-dom";

// Ein bedienbarer Bereich über der Szenenillustration. Funktioniert per
// Maus und Tastatur, zeigt eine Bezeichnung bei Hover/Fokus und einen
// optionalen Zähler sowie ein Klingel-Indikator für offene Ereignisse.
export default function SceneHotspot({
  to, onClick, label, hint, badge, ringing, style, className, disabled,
}) {
  const Comp = to ? Link : "button";
  const props = to
    ? { to }
    : { onClick, type: "button", disabled };
  return (
    <Comp
      {...props}
      aria-label={hint ? `${label} – ${hint}` : label}
      title={hint ? `${label} – ${hint}` : label}
      style={style}
      className={`group absolute rounded-md cursor-pointer transition outline-none
        focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-office/60
        hover:bg-amber-300/10 hover:shadow-[inset_0_0_0_1px_rgba(252,211,77,0.35)]
        ${disabled ? "opacity-40 pointer-events-none" : ""} ${className || ""}`}
    >
      {ringing && (
        <span className="absolute inset-0 rounded-md ring-2 ring-amber-300/80 pointer-events-none animate-pulse motion-reduce:animate-none" />
      )}
      {badge != null && badge !== 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-amber-500 text-amber-950 text-[11px] font-bold flex items-center justify-center shadow-md z-10">
          {badge}
        </span>
      )}
      <span
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -bottom-1 translate-y-full
          whitespace-nowrap rounded bg-office-2/95 border border-wood/40 px-2 py-1 text-[11px] text-amber-100
          opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition shadow-lg z-20"
      >
        {label}
      </span>
    </Comp>
  );
}