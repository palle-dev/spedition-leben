import React from "react";
import { createPortal } from "react-dom";
import { X, Settings, Check, Mail, Heart } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { DIFFICULTY_PROFILES } from "@/lib/simulation/difficultyProfiles";
import { HELP_OPTIONS } from "@/lib/simulation/helpSettings";

// Einstellungs-Dialog: Zeigt das aktive Schwierigkeitsprofil und die
// gewählten Einstiegshilfen an. Die Auswahl erfolgt beim Spielstart
// und kann während des Spiels nicht geändert werden.
export default function SettingsDialog({ open, onClose }) {
  const { state } = useGame();
  if (!open || !state) return null;

  const profile = DIFFICULTY_PROFILES.find(p => p.id === state.difficulty?.profileId) || DIFFICULTY_PROFILES[1];
  const activeHelps = HELP_OPTIONS.filter(opt => state.helpSettings?.[opt.id]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border border-white/15 bg-surface shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 sticky top-0 bg-surface z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-lime" />
            <h2 className="font-semibold text-foreground">Spieleinstellungen</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Schwierigkeitsprofil */}
          <div>
            <h3 className="text-xs uppercase tracking-[0.1em] text-muted-foreground mb-2">Schwierigkeitsprofil</h3>
            <div className="rounded-xl border border-lime/30 bg-lime/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base font-semibold text-foreground">{profile.label}</span>
                {state.difficulty?.migrated && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground">übernommen</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{profile.description}</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-white/5 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Startkapital</div>
                <div className="text-sm font-medium text-foreground mt-0.5">{(profile.startCapitalCents / 100).toLocaleString("de-DE")} €</div>
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Zeitpuffer</div>
                <div className="text-sm font-medium text-foreground mt-0.5">{Math.round(profile.bufferHoursFactor * 100)}%</div>
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Störungen</div>
                <div className="text-sm font-medium text-foreground mt-0.5">{Math.round(profile.disruptionRateFactor * 100)}%</div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-2">
              Das Profil wird beim Spielstart festgelegt und kann im laufenden Spiel nicht geändert werden.
            </p>
          </div>

          {/* Einstiegshilfen */}
          <div>
            <h3 className="text-xs uppercase tracking-[0.1em] text-muted-foreground mb-2">Einstiegshilfen</h3>
            {activeHelps.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-muted-foreground">
                Keine Hilfestellungen aktiviert.
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeHelps.map(opt => (
                  <div key={opt.id} className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="mt-0.5 w-4 h-4 rounded border border-lime bg-lime grid place-items-center flex-shrink-0">
                      <Check className="w-3 h-3 text-ink" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{opt.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{opt.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ersteller & Credits */}
        <div className="px-5 pb-5 pt-1 border-t border-white/10 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Erstellt von</span>
            <span className="font-medium text-foreground">Werner Pallentin</span>
          </div>
          <a href="mailto:werner@pallentin.me" className="flex items-center justify-between text-xs group">
            <span className="text-muted-foreground">Kontakt</span>
            <span className="flex items-center gap-1.5 text-muted-foreground group-hover:text-lime transition">
              <Mail className="w-3 h-3" />
              werner@pallentin.me
            </span>
          </a>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 pt-1">
            <Heart className="w-3 h-3 text-lime/50" />
            <span>Entwickelt mit Unterstützung von KI</span>
          </div>
          <p className="text-[10px] text-muted-foreground/50 text-center pt-1">
            © {new Date().getFullYear()} Werner Pallentin · Alle Rechte vorbehalten
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}