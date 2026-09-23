import React from "react";
import { NordSprintGuide } from "@/components/world/NordSprintChallengePanel";
import { nordSprintActive } from "@/lib/simulation/nordSprintChallenge";
import { HarborOpeningGuide } from "@/components/world/HarborOpeningPanel";
import { harborOpeningActive, harborOpeningStartReason } from "@/lib/simulation/harborOpening";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/lib/gameContext";
import { detectOnboardingStep, getOnboardingBlocker, ONBOARDING_STEPS } from "@/lib/developmentEngine.js";
import { X, Pause, ChevronRight, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { EASE } from "@/lib/motion";
import { motion } from "framer-motion";

// Geführter Einstieg — zustandsbasiert, robust gegen abweichende Reihenfolge.
// Zeigt einen kompakten Hinweis-Kasten (kein blockierendes Modal).
export default function OnboardingGuide() {
  const { state, send, showToast } = useGame();
  const navigate = useNavigate();

  if (nordSprintActive(state)) return <NordSprintGuide state={state} />;
  if (harborOpeningActive(state)) return <HarborOpeningGuide state={state} />;
  if (!state.onboarding?.active) return null;

  const stepId = detectOnboardingStep(state);
  const stepIdx = ONBOARDING_STEPS.findIndex(s => s.id === stepId);
  const invitation = stepId === "choose_order" && !harborOpeningStartReason(state);
  const step = invitation ? { ...ONBOARDING_STEPS[stepIdx], title: "Anna wartet in deinem Büro", hint: "Lerne Anna kennen und fahre deinen ersten Transport für sie. Ihre Einladung wartet im Büro. Du kannst auch direkt einen Auftrag auf dem Markt wählen.", linkPath: "/" } : ONBOARDING_STEPS[stepIdx];
  const blocker = getOnboardingBlocker(state);

  async function handlePause() {
    try { await send("pauseOnboarding", {}); showToast("Begleitung pausiert", "info"); }
    catch (e) { showToast(e.message, "error"); }
  }
  async function handleDismiss() {
    try { await send("dismissOnboarding", {}); showToast("Begleitung beendet", "info"); }
    catch (e) { showToast(e.message, "error"); }
  }
  async function handleReview() {
    try { await send("markOnboardingReviewed", {}); }
    catch (e) { showToast(e.message, "error"); }
  }

  if (state.onboarding.paused) return (
    <div className="glass border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">Begleitung pausiert</span>
      <button onClick={async () => {
        try { await send("resumeOnboarding", {}); }
        catch (e) { showToast(e.message, "error"); }
      }} className="text-xs font-medium text-lime hover:underline">Begleitung fortsetzen</button>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="glass border border-lime/20 rounded-xl overflow-hidden"
    >
      {/* Kopfzeile */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-lime/5">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.14em] text-lime/80 font-medium">
            Begleitung · Schritt {stepIdx + 1} / {ONBOARDING_STEPS.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handlePause} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition" title="Begleitung pausieren" aria-label="Begleitung pausieren">
            <Pause className="w-3.5 h-3.5" />
          </button>
          <button onClick={handleDismiss} className="p-1.5 rounded-md text-muted-foreground hover:text-coral hover:bg-white/5 transition" title="Begleitung beenden" aria-label="Begleitung beenden">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inhalt */}
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg bg-lime/10 grid place-items-center shrink-0 mt-0.5">
            {blocker.blocked ? <AlertCircle className="w-3.5 h-3.5 text-amber-300/80" /> : <Info className="w-3.5 h-3.5 text-lime/70" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-foreground">{step?.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step?.hint}</p>

            {/* Blocker-Hinweis */}
            {blocker.blocked && blocker.reason && (
              <div className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5">
                <AlertCircle className="w-3 h-3 text-amber-300/80 shrink-0 mt-0.5" />
                <span className="text-[11px] text-amber-200/80 leading-snug">{blocker.reason}</span>
              </div>
            )}
            {blocker.alternative && (
              <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-snug">Alternative: {blocker.alternative}</p>
            )}

            {/* Fortschritts-Indikator */}
            <div className="flex items-center gap-1 mt-3">
              {ONBOARDING_STEPS.map((s, i) => (
                <div key={s.id}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i < stepIdx ? "w-3 bg-lime/50" : i === stepIdx ? "w-6 bg-lime" : "w-3 bg-white/10"
                  }`} />
              ))}
            </div>

            {/* Aktionen */}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => navigate(step?.linkPath || "/")}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition text-xs font-medium active:scale-95"
              >
                {invitation ? "Zu Anna" : step?.linkPath === "/auftraege" ? "Zu den Aufträgen" :
                 step?.linkPath === "/disposition" ? "Zur Disposition" :
                 step?.linkPath === "/finanzen" ? "Zu den Finanzen" : "Öffnen"}
                <ChevronRight className="w-3 h-3" />
              </button>
              {stepId === "review_delivery" && (
                <button
                  onClick={handleReview}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition text-xs"
                >
                  <CheckCircle2 className="w-3 h-3" /> Als gesehen markieren
                </button>
              )}
              {stepId === "next_decision" && (
                <button onClick={handleDismiss}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition text-xs">
                  <CheckCircle2 className="w-3 h-3" /> Begleitung abschließen
                </button>
              )}
              {blocker.blocked && (
                <button
                  onClick={handlePause}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 text-muted-foreground hover:text-foreground border border-white/10 hover:border-white/20 transition text-xs"
                >
                  Begleitung pausieren <Pause className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}