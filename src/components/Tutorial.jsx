import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { X, ChevronRight, Check } from "lucide-react";

const STEPS = [
  { title: "1. Auftrag annehmen", body: "Du übernimmst eine kleine Hamburger Spedition mit drei Lkw und drei Fahrern. Öffne die Seite Aufträge und nimm das erste Angebot an (Hamburg nach Bremen). Annahme und Disposition kosten zu Beginn keine Spielzeit." },
  { title: "2. Transport disponieren", body: "Öffne Disposition, wähle den angenommenen Auftrag, einen freien Lkw und einen freien Fahrer. Das System prüft Kapazität, Zustand, gemeinsamen Standort, Einsatzgrenze und Kontostand automatisch." },
  { title: "3. Zeit fortsetzen", body: "Starte die Fahrt und nutze 'Nächstes Ereignis' oder '1 Std', um die Zeit bis zur Lieferung weiterlaufen zu lassen. Fahrten und Tagesabrechnungen laufen auch ohne deinen Klick weiter." },
  { title: "4. Abrechnung ansehen", body: "Öffne Finanzen – dort siehst du Kraftstoff, Maut, Vergütung und den Beitrag vor Fixkosten. Fahrerlohn und Standortkosten werden nur in der Tagesabrechnung gebucht." },
  { title: "5. Privat entscheiden", body: "Unter Zuhause wartet eine Einladung. Zusage, Verschiebung oder Absage haben echte Wirkungen auf Beziehung, Belastung und Zufriedenheit. Danach läuft das Spiel frei weiter." }
];

export default function Tutorial() {
  const { state, send, showToast } = useGame();
  const [open, setOpen] = useState(true);
  const step = state.tutorial.step;
  const displayStep = Math.min(step + 1, 5);

  if (!open) return null;

  async function dismiss() {
    try { await send("dismissTutorial", {}); } catch (e) { showToast(e.message, "error"); }
    setOpen(false);
  }
  async function next() {
    if (step < 4) {
      try { await send("setTutorialStep", { step: step + 1 }); } catch (e) { showToast(e.message, "error"); }
    } else { await dismiss(); }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-4">
      <div className="glass border border-white/15 rounded-2xl max-w-lg w-full p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-lime">Tutorial · Schritt {displayStep} / 5</div>
            <h3 className="text-lg font-semibold text-foreground mt-1">{STEPS[Math.min(step, 4)].title}</h3>
          </div>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground transition shrink-0" aria-label="Tutorial verlassen"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{STEPS[Math.min(step, 4)].body}</p>
        <div className="flex items-center justify-between mt-5">
          <button onClick={dismiss} className="text-sm text-muted-foreground hover:text-foreground underline transition">Tutorial verlassen</button>
          <button onClick={next} className="px-4 py-2 rounded-lg bg-lime text-ink hover:brightness-110 text-sm font-semibold flex items-center gap-1.5 transition active:scale-95">
            {step >= 4 ? <><Check className="w-4 h-4" /> Fertig</> : <>Weiter <ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}