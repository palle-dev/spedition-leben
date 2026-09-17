import React from "react";

const LOGO_URL = "https://media.base44.com/images/public/6aa52ebc01a939da57f8b78f/63a723323_logo-dunkler-hintergrund.png";

// FRACHTFIEBER-Logo: FF-Monogramm + Wortmarke als Bild.
// showWord wird ignoriert, da das Bild die Wortmarke immer enthält.
export default function FernwerkLogo({
  size = 32,
  showWord = true,
  showTagline = false,
  className = "",
  signetColor,
  wordClassName,
  taglineClassName
}) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <img
        src={LOGO_URL}
        alt="FRACHTFIEBER"
        height={size}
        style={{ height: size, width: "auto", mixBlendMode: "lighten" }}
      />
      {showTagline && (
        <div className={`text-[10px] tracking-[0.02em] mt-1 ${taglineClassName || "text-muted-foreground"}`}>
          Kleine Firma. Große Pläne.
        </div>
      )}
    </div>
  );
}