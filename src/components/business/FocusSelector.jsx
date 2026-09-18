import React from "react";
import { BUSINESS_FOCI } from "@/lib/simulation/businessFocusEngine";
import { motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Check, MapPin, Zap, AlertTriangle, Layers } from "lucide-react";

const FOCUS_ICONS = {
  mixed: Layers,
  regional: MapPin,
  express: Zap,
  dangerousGoods: AlertTriangle,
};

const FOCUS_COLORS = {
  mixed: "text-lime",
  regional: "text-invest-cyan",
  express: "text-coral",
  dangerousGoods: "text-yellow-400",
};

export default function FocusSelector({ state, send, showToast }) {
  const currentFocus = state.businessFocus?.companyFocus || "mixed";
  const [busy, setBusy] = React.useState(null);

  async function selectFocus(focusId) {
    if (focusId === currentFocus) return;
    setBusy(focusId);
    try {
      await send("setBusinessFocus", { focusId });
      const f = BUSINESS_FOCI.find(x => x.id === focusId);
      showToast(`Geschäftsfokus gesetzt: ${f?.label}`, "success");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-foreground">Betriebliche Ausrichtung</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Der Fokus steuert, welche Auftragstypen der Markt bevorzugt generiert.
          Er kann jederzeit geändert werden.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {BUSINESS_FOCI.map(focus => {
          const Icon = FOCUS_ICONS[focus.id] || Layers;
          const color = FOCUS_COLORS[focus.id] || "text-lime";
          const active = focus.id === currentFocus;
          const isBusy = busy === focus.id;
          return (
            <motion.button
              key={focus.id}
              onClick={() => selectFocus(focus.id)}
              disabled={isBusy}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              whileHover={{ scale: active ? 1 : 1.01 }}
              className={`relative text-left p-4 rounded-xl border transition disabled:opacity-50 ${
                active
                  ? "glass border-lime/40 shadow-[0_0_20px_-6px_hsl(var(--lime)/0.3)]"
                  : "glass border-white/10 hover:border-white/20"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-5 h-5 ${color}`} />
                  <div>
                    <div className="font-medium text-foreground">{focus.label}</div>
                  </div>
                </div>
                {active && (
                  <div className="w-5 h-5 rounded-full bg-lime/20 grid place-items-center">
                    <Check className="w-3 h-3 text-lime" />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{focus.desc}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Object.entries(focus.marketWeights).map(([key, w]) => (
                  <span key={key} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground tabular-nums">
                    {labelSegment(key)} {Math.round(w * 100)}%
                  </span>
                ))}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function labelSegment(key) {
  const map = {
    regional: "Regional",
    express: "Express",
    dangerousGoods: "Gefahrgut",
    standard: "Standard",
  };
  return map[key] || key;
}