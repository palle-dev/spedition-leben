import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getDailyStatements } from "@/lib/dailyOverviewData";
import { AlertTriangle, Truck, Calendar, Wrench, Heart, Users, Target, ArrowRight } from "lucide-react";

// Tagesübersicht — beantwortet die zentralen Führungsfragen
// mit klaren, natürlichen Aussagen aus Spieldaten.
export default function DailyOverview({ state }) {
  const navigate = useNavigate();
  const statements = useMemo(() => getDailyStatements(state), [state]);

  if (statements.length === 0) {
    return (
      <div className="glass border border-lime/20 rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-lime/10 grid place-items-center shrink-0">
            <Target className="w-5 h-5 text-lime" />
          </div>
          <div>
            <h2 className="text-base font-medium text-foreground">Alles im grünen Bereich</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Keine dringenden Entscheidungen offen. Der Betrieb läuft.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const iconFor = (icon) => {
    const map = {
      alert: AlertTriangle, truck: Truck, calendar: Calendar,
      wrench: Wrench, heart: Heart, users: Users, target: Target,
    };
    return map[icon] || Target;
  };

  const toneFor = (priority) => {
    if (priority === "high") return { border: "border-amber-400/20", bg: "bg-amber-500/5", icon: "text-amber-300" };
    if (priority === "medium") return { border: "border-white/10", bg: "bg-surface-2/30", icon: "text-lime/70" };
    return { border: "border-white/8", bg: "bg-white/[0.02]", icon: "text-muted-foreground/60" };
  };

  return (
    <div className="space-y-2">
      {statements.map((s, i) => {
        const Icon = iconFor(s.icon);
        const tone = toneFor(s.priority);
        return (
          <button
            key={i}
            onClick={() => s.link && navigate(s.link)}
            className={`w-full text-left flex items-center gap-3 rounded-xl border ${tone.border} ${tone.bg} p-3.5 hover:border-lime/20 transition group`}
          >
            <Icon className={`w-4 h-4 ${tone.icon} shrink-0`} />
            <span className="text-sm text-foreground/90 flex-1">{s.text}</span>
            {s.link && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-lime/60 transition shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}