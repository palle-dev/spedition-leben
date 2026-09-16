import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { X, Search, ChevronDown } from "lucide-react";
import { HELP_TOPICS, PAGE_HINTS } from "@/lib/helpContent";
import { Compass, Package, Map, Truck, Users, Wallet, Home, Sparkles, LineChart, Building2, Mail, Trophy, BarChart3 } from "lucide-react";

const ICONS = { Compass, Package, Map, Truck, Users, Wallet, Home, Sparkles, LineChart, Building2, Mail, Trophy, BarChart3 };

const COLOR_MAP = {
  lime:   { text: "text-lime",     bg: "bg-lime/10",     border: "border-lime/20" },
  cyan:   { text: "text-cyan-300",  bg: "bg-cyan-300/10",  border: "border-cyan-300/20" },
  violet: { text: "text-violet-300", bg: "bg-violet-300/10", border: "border-violet-300/20" },
  coral:  { text: "text-coral",    bg: "bg-coral/10",    border: "border-coral/20" },
};

// Mappt Routen auf Help-Topic-IDs für die automatische Vorauswahl.
const ROUTE_TOPIC = {
  "/": "basics",
  "/auftraege": "orders",
  "/disposition": "dispatch",
  "/fuhrpark": "fleet",
  "/personal": "personnel",
  "/finanzen": "finances",
  "/zuhause": "private",
  "/investment": "investment",
  "/filialen": "branches",
  "/journal": "automation",
  "/postfach": "mail",
  "/erfolge": "achievements",
  "/auslastung": "analytics",
  "/effizienz": "analytics",
};

export default function HelpPanel({ open, onClose }) {
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(null);

  // Automatisch das zur aktuellen Seite passende Thema vorauswählen.
  const initialTopic = useMemo(() => ROUTE_TOPIC[location.pathname] || "basics", [location.pathname]);

  React.useEffect(() => {
    if (open) setActiveId(initialTopic);
  }, [open, initialTopic]);

  const filtered = useMemo(() => {
    if (!query.trim()) return HELP_TOPICS;
    const q = query.toLowerCase();
    return HELP_TOPICS.map(t => ({
      ...t,
      sections: t.sections.filter(s =>
        s.heading.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)
      ),
    })).filter(t => t.sections.length > 0 || t.title.toLowerCase().includes(q));
  }, [query]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-md h-full glass border-l border-white/10 flex flex-col animate-reveal">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="grid place-items-center w-9 h-9 rounded-xl bg-lime/10 border border-lime/20">
              <Compass className="w-4.5 h-4.5 text-lime" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Hilfe & Erklärungen</div>
              <div className="text-[11px] text-muted-foreground/70">FERNWERK Spielführer</div>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition shrink-0" aria-label="Hilfe schließen">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Suche */}
        <div className="px-5 py-3 border-b border-white/5 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Begriff suchen…"
              className="w-full bg-surface-2/50 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-lime/30 transition"
            />
          </div>
        </div>

        {/* Inhalt */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground/50">
              Keine Treffer für „{query}".
            </div>
          ) : (
            filtered.map(topic => {
              const Icon = ICONS[topic.icon] || Compass;
              const color = COLOR_MAP[topic.color] || COLOR_MAP.lime;
              const isActive = activeId === topic.id;
              return (
                <div key={topic.id} className="rounded-xl border border-white/8 overflow-hidden bg-white/[0.015]">
                  <button
                    onClick={() => setActiveId(isActive ? null : topic.id)}
                    className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-white/[0.03] transition"
                    aria-expanded={isActive}
                  >
                    <span className={`grid place-items-center w-8 h-8 rounded-lg ${color.bg} border ${color.border} shrink-0`}>
                      <Icon className={`w-4 h-4 ${color.text}`} />
                    </span>
                    <span className="text-xs font-semibold text-foreground flex-1">{topic.title}</span>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground/50 transition-transform shrink-0 ${isActive ? "rotate-180" : ""}`} />
                  </button>
                  {isActive && (
                    <div className="px-3.5 pb-4 space-y-3.5">
                      {topic.sections.map((s, i) => (
                        <div key={i} className="space-y-1">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">{s.heading}</div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">{s.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 shrink-0">
          <p className="text-[10px] text-muted-foreground/50 text-center leading-relaxed">
            Tipp: Auf jeder Seite findest du <span className="inline-grid place-items-center w-4 h-4 rounded-full bg-white/5 align-middle"><span className="text-[9px]">ⓘ</span></span> Symbole für kontextsensitive Hinweise.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}