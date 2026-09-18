import React from "react";

const MOBILE_LOGO_URL = "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/b5773773c_bildzeichen.png";

// FRACHTFIEBER Mobile-Logo: Ff-Monogramm auf schwarzem Grund.
// mix-blend-lighten macht den schwarzen Hintergrund transparent —
// nur das Monogramm erscheint auf jedem Untergrund.
// Quadratisch, für die mobile Kopfzeile optimiert.
export default function FrachtfieberMobileSignet({ size = 28, className = "" }) {
  return (
    <img
      src={MOBILE_LOGO_URL}
      alt="FRACHTFIEBER"
      width={size}
      height={size}
      style={{ width: size, height: size, mixBlendMode: "lighten" }}
      className={className}
    />
  );
}