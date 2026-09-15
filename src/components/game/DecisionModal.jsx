import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useGame } from "@/lib/gameContext";
import { getPendingDecisions } from "@/lib/decisionQueue";
import { formatGameTime, formatEuro } from "@/lib/gameData";
import { Check, X, Calendar, Building2, Loader2, ChevronRight, User } from "lucide-react";
import { EASE } from "@/lib/motion";

const TYPE_ICON = {
  branch_decision: Building2,
  vacation_request: Calendar,
};

export default function DecisionModal() {
  const { state, send, showToast, overlay } = useGame();
  const [dismissedKeys, setDismissedKeys] = useState(() => new Set());
  const [processing, setProcessing] = useState(null);
  const [currentQueue, setCurrentQueue] = useState([]);
  const dismissedRef = useRef(new Set());

  // Neue Entscheidungen erkennen — nur neu aufgetauchte werden angezeigt,
  // bereits weggedrückte tauchen nicht wieder auf bis sie verschwinden.
  const allDecisions = getPendingDecisions(state);
  const visibleDecisions = allDecisions.filter(d => !dismissedRef.current.has(d.key));

  // Wenn keine Entscheidungen mehr da sind, Dismissed-Set zurücksetzen
  useEffect(() => {
    const allKeys = new Set(allDecisions.map(d => d.key));
    const stillRelevant = new Set();
    dismissedRef.current.forEach(k => { if (allKeys.has(k)) stillRelevant.add(k); });
    if (stillRelevant.size !== dismissedRef.current.size) {
      dismissedRef.current = stillRelevant;
      setDismissedKeys(new Set(stillRelevant));
    }
  }, [allDecisions.length]);

  // Nicht anzeigen wenn: anderes Overlay aktiv oder keine sichtbaren Entscheidungen.
  // Während Zeitvorlauf überdeckt das AdvanceProgressModal (z-50) dieses Modal (z-40).
  const show = visibleDecisions.length > 0 && !overlay;

  async function handleAction(decision, action) {
    setProcessing({ key: decision.key, action: action.kind });
    try {
      await send(action.command, action.params);
      showToast(action.kind === "approve" ? "Entscheidung umgesetzt." : "Entscheidung abgelehnt.", action.kind === "approve" ? "success" : "info");
      dismissedRef.current.add(decision.key);
      setDismissedKeys(new Set(dismissedRef.current));
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setProcessing(null);
    }
  }

  function dismissDecision(decision) {
    dismissedRef.current.add(decision.key);
    setDismissedKeys(new Set(dismissedRef.current));
  }

  if (!show) return null;
  const decision = visibleDecisions[0];
  if (!decision) return null;

  const Icon = TYPE_ICON[decision.type] || User;
  const remaining = visibleDecisions.length;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="glass border border-lime/20 rounded-2xl max-w-md w-full p-6 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-xl bg-lime/10 grid place-items-center shrink-0">
              <Icon className="w-5 h-5 text-lime" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-foreground">{decision.title}</h2>
              <p className="text-xs text-muted-foreground truncate">
                {decision.source}{decision.location ? ` · ${decision.location}` : ""} · {formatGameTime(decision.createdAt)}
              </p>
            </div>
            {remaining > 1 && (
              <span className="text-[10px] text-muted-foreground bg-white/5 rounded-full px-2 py-1 shrink-0">
                +{remaining - 1} weitere
              </span>
            )}
          </div>

          {/* Body */}
          <p className="text-sm text-foreground/85 leading-relaxed mb-4">{decision.description}</p>

          {/* Kosten / Nutzen */}
          {(decision.costCents > 0 || decision.benefitDesc) && (
            <div className="flex items-center gap-3 mb-5 text-xs">
              {decision.costCents > 0 && (
                <span className="text-coral">−{formatEuro(decision.costCents)}</span>
              )}
              {decision.benefitDesc && (
                <span className="text-lime">{decision.benefitDesc}</span>
              )}
            </div>
          )}

          {/* Aktionen */}
          <div className="flex items-center gap-2">
            {decision.actions.map(action => {
              const isProcessing = processing?.key === decision.key && processing?.action === action.kind;
              return (
                <button
                  key={action.kind}
                  onClick={() => handleAction(decision, action)}
                  disabled={!!processing}
                  className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium border transition disabled:opacity-50 ${
                    action.kind === "approve"
                      ? "bg-lime/15 text-lime border-lime/30 hover:bg-lime/25"
                      : "bg-white/5 text-muted-foreground border-white/10 hover:text-coral hover:border-coral/30"
                  }`}
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : action.kind === "approve" ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                  {action.label}
                </button>
              );
            })}
            <button
              onClick={() => dismissDecision(decision)}
              disabled={!!processing}
              className="px-3 py-2.5 rounded-lg text-xs text-muted-foreground hover:text-foreground border border-white/5 hover:bg-white/5 transition disabled:opacity-50"
              title="Später entscheiden"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}