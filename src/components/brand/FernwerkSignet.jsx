import React from "react";

// FERNWERK-Signet: zwei abstrahierte Fahrspuren, die ein F bilden.
// Skalierbar, einfarbig verwendbar, auch auf hellem Untergrund.
// Spine + Oberholm als eine durchgehende Spur; Mittelholm als zweite.
export default function FernwerkSignet({ size = 32, className = "", color = "hsl(var(--lime))", strokeWidth }) {
  const sw = strokeWidth || Math.max(3.5, size * 0.14);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M9 27V5h13"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 16h11"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
      />
    </svg>
  );
}