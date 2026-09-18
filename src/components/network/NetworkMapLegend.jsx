import React from "react";
import { Building2, Users, Package, Truck, Route } from "lucide-react";

// Legende für die Netzkarte mit unterscheidbaren Symbolen (Form + Farbe).
export default function NetworkMapLegend({ layers }) {
  const items = [
    { key: "branches", label: "Filialen", icon: Building2, shape: "square", color: "#D5FB83", symbol: "B" },
    { key: "customers", label: "Kunden", icon: Users, shape: "circle", color: "#7DD3FC", symbol: "K" },
    { key: "orders", label: "Aufträge", icon: Package, shape: "diamond", color: "#FCD34D", symbol: "A" },
    { key: "tours", label: "Laufende Touren", icon: Route, shape: "line", color: "#D5FB83" },
    { key: "vehicles", label: "Fahrzeuge", icon: Truck, shape: "circle", color: "#FCD34D", symbol: "F" },
  ];

  const activeItems = items.filter(i => layers.has(i.key));

  if (activeItems.length === 0) return null;

  return (
    <div className="absolute bottom-3 right-3 z-10 glass border border-white/15 rounded-xl p-3 max-w-[200px]">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Legende</div>
      <div className="space-y-1.5">
        {activeItems.map(item => (
          <div key={item.key} className="flex items-center gap-2 text-xs text-foreground/90">
            <LegendShape item={item} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="w-3 h-3 rounded-full bg-[#A78BFA]" /> Stammkunde
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="w-3 h-3 rounded-full bg-[#60A5FA]" /> Angeboten
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="w-3 h-3 rounded-full bg-[#FCD34D]" /> Angenommen
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="w-3 h-0.5 bg-[#FF9E7A] border-t border-dashed border-[#FF9E7A]" /> Leerfahrt
        </div>
      </div>
    </div>
  );
}

function LegendShape({ item }) {
  if (item.shape === "square") {
    return <span className="w-3.5 h-3.5 rounded-sm grid place-items-center text-[8px] font-bold text-ink" style={{ background: item.color }}>{item.symbol}</span>;
  }
  if (item.shape === "diamond") {
    return <span className="w-3 h-3 rotate-45 grid place-items-center" style={{ background: item.color }}><span className="text-[7px] font-bold text-ink -rotate-45">{item.symbol}</span></span>;
  }
  if (item.shape === "line") {
    return <span className="w-4 h-0.5 rounded" style={{ background: item.color }} />;
  }
  return <span className="w-3.5 h-3.5 rounded-full grid place-items-center text-[8px] font-bold text-ink" style={{ background: item.color }}>{item.symbol}</span>;
}