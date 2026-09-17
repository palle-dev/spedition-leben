import React from "react";
import { Image } from "@/components/ui/image";

const LOGO_URL = "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/63a723323_logo-dunkler-hintergrund.png";

// FRACHTFIEBER-Logo: FF-Monogramm + Wortmarke als Bild.
// Die Höhe wird über die size-Prop gesteuert, die Breite skaliert proportional.
// mix-blend-lighten macht den schwarzen Hintergrund transparent —
// nur Monogramm und Schrift erscheinen auf jedem Untergrund.
export default function FernwerkSignet({ size = 32, className = "", color, strokeWidth }) {
  return (
    <div className={`flex items-center ${className}`} style={{ height: size }}>
      <Image
        src={LOGO_URL}
        alt="FRACHTFIEBER"
        fittingType="fit"
        className="h-full w-auto mix-blend-lighten"
      />
    </div>
  );
}