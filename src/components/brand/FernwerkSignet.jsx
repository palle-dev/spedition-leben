import React from "react";

const LOGO_URL = "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/63a723323_logo-dunkler-hintergrund.png";

// FRACHTFIEBER-Logo: FF-Monogramm + Wortmarke als Bild.
// Die Höhe wird über die size-Prop gesteuert, die Breite skaliert proportional.
// mix-blend-lighten macht den schwarzen Hintergrund transparent —
// nur Monogramm und Schrift erscheinen auf jedem Untergrund.
export default function FernwerkSignet({ size = 32, className = "", color, strokeWidth }) {
  return (
    <img
      src={LOGO_URL}
      alt="FRACHTFIEBER"
      height={size}
      style={{ height: size, width: "auto", mixBlendMode: "lighten" }}
      className={className}
    />
  );
}