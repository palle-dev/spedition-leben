import React from "react";
import { Building2, ChevronDown } from "lucide-react";

// Kompakte Filial-Auswahl für Kauf- und Einstell-Aktionen.
// Zeigt nur aktive Filialen; bei einer einzigen Filiale wird nichts gerendert.
export default function BranchSelector({ branches, value, onChange, className = "" }) {
  const active = (branches || []).filter(b => b.status === "active");
  if (active.length <= 1) return null;
  return (
    <div className={`relative ${className}`}>
      <Building2 className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value || null)}
        className="appearance-none rounded-lg pl-8 pr-8 py-2.5 bg-white/5 border border-white/10 text-sm text-foreground hover:bg-white/10 transition cursor-pointer min-h-[44px]"
      >
        {active.map(b => (
          <option key={b.id} value={b.id} style={{ backgroundColor: '#0b1011', color: '#f4f0e8' }}>
            {b.name} · {b.city}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}