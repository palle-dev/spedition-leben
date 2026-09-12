import React from "react";
import { getPortraitUrl } from "@/lib/portraitCatalog";

// Cartoon-Porträt für FERNWERK-Personen.
// Zeigt das persistente Porträt basierend auf portrait_id.
// size: "sm" (Listen), "md" (Karten), "lg" (Detail)
export default function Portrait({ portraitId, name, size = "md", className = "" }) {
  const url = getPortraitUrl(portraitId);
  const sizes = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-20 h-20",
  };
  const sizeClass = sizes[size] || sizes.md;

  return (
    <div className={`${sizeClass} rounded-full overflow-hidden shrink-0 bg-surface-2 ring-1 ring-white/10 ${className}`}>
      {url ? (
        <img
          src={url}
          alt={name ? `Porträt von ${name}` : "Porträt"}
          loading="lazy"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full grid place-items-center text-muted-foreground text-xs font-medium">
          {name ? name.slice(0, 2).toUpperCase() : "?"}
        </div>
      )}
    </div>
  );
}