import React, { useState, useRef, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { TrendingUp, Scale, Layers, ChevronDown, Check } from "lucide-react";

// Steuerelement für die Marktpriorität der Disponenten.
// "balanced" — Beitrag pro km (Standard)
// "high_margin" — Höchster Beitrag zuerst (Gewinnmaximierung)
// "low_empty" — Mehr Aufträge, weniger Leerfahrten
const PRIORITIES = [
  { id: "balanced", label: "Ausgewogen", desc: "Beitrag pro km, dann Fristpuffer", icon: Scale },
  { id: "high_margin", label: "Hohe Marge", desc: "Höchster Beitrag zuerst — maximiert Gewinn", icon: TrendingUp },
  { id: "low_empty", label: "Wenig Leerfahrt", desc: "Mehr Aufträge, weniger Leer-km", icon: Layers },
];

export default function MarketPriorityControl() {
  const { state, send, showToast } = useGame();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);

  const current = PRIORITIES.find(p => p.id === (state?.marketPriority || "balanced")) || PRIORITIES[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  async function selectPriority(id) {
    if (id === (state?.marketPriority || "balanced")) { setOpen(false); return; }
    setSaving(true);
    try {
      await send("setMarketPriority", { priority: id });
      showToast("Marktpriorität aktualisiert.", "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
      setOpen(false);
    }
  }

  const Icon = current.icon;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-2/50 border border-white/10 text-[11px] text-muted-foreground hover:text-foreground hover:border-white/20 transition disabled:opacity-40"
      >
        <Icon className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className={`w-3 h-3 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-64 rounded-xl border border-white/10 bg-ink/95 backdrop-blur-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10">
            <div className="text-[10px] tracking-[0.14em] uppercase text-muted-foreground">Marktpriorität</div>
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">Steuert, welche Aufträge Disponenten bevorzugen</div>
          </div>
          <div className="p-1.5 space-y-0.5">
            {PRIORITIES.map(p => {
              const PIcon = p.icon;
              const active = (state?.marketPriority || "balanced") === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => selectPriority(p.id)}
                  className={`w-full text-left rounded-lg px-2.5 py-2 flex items-start gap-2.5 transition ${
                    active ? "bg-lime/10" : "hover:bg-white/5"
                  }`}
                >
                  <PIcon className={`w-4 h-4 mt-0.5 shrink-0 ${active ? "text-lime" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${active ? "text-lime" : "text-foreground"}`}>{p.label}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{p.desc}</div>
                  </div>
                  {active && <Check className="w-3.5 h-3.5 text-lime shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}