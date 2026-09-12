import React from "react";

const MAP = {
  free: { label: "Bereit", cls: "text-lime" },
  on_trip: { label: "Unterwegs", cls: "text-amber-300" },
  maintenance: { label: "Wartung", cls: "text-sky-300" },
  resting: { label: "Erholung", cls: "text-sky-300" },
  offered: { label: "Angebot", cls: "text-muted-foreground" },
  angenommen: { label: "Angenommen", cls: "text-amber-300" },
  unterwegs: { label: "Unterwegs", cls: "text-amber-300" },
  geliefert: { label: "Geliefert", cls: "text-lime" },
  storniert: { label: "Storniert", cls: "text-red-300" },
  expired: { label: "Verfallen", cls: "text-muted-foreground" },
};

// Einheitliche Statusanzeige mit Punkt und Farbe.
export default function StatusBadge({ status, className = "" }) {
  const m = MAP[status] || { label: status, cls: "text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${m.cls} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-current ${status === "free" || status === "geliefert" ? "animate-pulse" : ""}`} />
      {m.label}
    </span>
  );
}