import React from "react";
import FernwerkSignet from "./FernwerkSignet";

// FERNWERK Logo: Signet + Wortmarke, optional mit Markenzeile.
// Signet und Wortmarke separat nutzbar (showWord=false für reines Signet).
export default function FernwerkLogo({
  size = 32,
  showWord = true,
  showTagline = false,
  className = "",
  signetColor = "hsl(var(--lime))",
  wordClassName = "text-foreground",
  taglineClassName = "text-muted-foreground"
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <FernwerkSignet size={size} color={signetColor} />
      {showWord && (
        <div className="leading-none">
          <div
            className={`font-bold tracking-[0.08em] uppercase ${wordClassName}`}
            style={{ fontSize: Math.round(size * 0.46) }}
          >
            FRACHTFIEBER
          </div>
          {showTagline && (
            <div className={`text-[10px] tracking-[0.02em] mt-1 ${taglineClassName}`}>
              Kleine Firma. Große Pläne.
            </div>
          )}
        </div>
      )}
    </div>
  );
}