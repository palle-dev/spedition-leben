import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { X, ChevronRight, Check } from "lucide-react";

const STEPS = [
  { title: "Willkommen, Chefin / Chef", body: `Du übernimmst eine kleine Hamburger Spedition mit drei Lkw und drei Fahrern. Dieses Tutorial führt dich in fünf Schritten durch die Grundlagen. Du kannst es jederzeit verlassen, ohne deinen Spielstand zu verlieren.` },
  { title: "1. Auftrag annehmen", body: `Öffne die Seite Aufträge und nimm das Tutorial-Angebot von Hanse Handelskontor (Hamburg nach Bremen) an. Annahme und Disposition kosten zu Beginn keine Spielzeit.` },
  { title: "2. Transport disponieren", body: `Öffne Disposition & Karte, wähle den angenommenen Auftrag, einen freien Lkw und einen freien Fahrer. Das Backend prüft Kapazität, Zustand, gemeinsamen Standort, Einsatzgrenze und Geld.` },
  { title: "3. Zeit fortsetzen", body: `Starte die Fahrt und nutze Nächstes Ereignis oder 1 Std, um die Zeit bis zur Lieferung weiterlaufen zu lassen. Fahrten und Tagesabrechnungen laufen auch ohne deinen Klick weiter.` },
  { title: "4. Abrechnung ansehen", body: `Öffne Finanzen – dort siehst du Kraftstoff, Maut, Vergütung und den Auftragsbeitrag vor Fixkosten. Fahrerlohn und Standortkosten werden nur in der Tagesabrechnung gebucht.` },
  { title: "5. Privat entscheiden", body: `Unter Zuhause wartet eine Einladung. Zusage, Verschiebung oder Absage haben echte Wirkungen auf Beziehung, Belastung und Zufriedenheit. Danach läuft das Spiel frei weiter.` }
];

export default function Tutorial() {
  const { state, send, showToast } = useGame();
  const [open, setOpen] = useState(true);
  const step = state.tutorial.step;

  if (!open) return null;

  async function dismiss() {
    try { await send("dismissTutorial", {}); } catch (e) { showToast(e.message, "error"); }
    setOpen(false);
  }
  async function next() {
    if (step < 5) {
      try { await send("setTutorialStep", { step: step + 1 }); } catch (e) { showToast(e.message, "error"); }
    } else { await dismiss(); }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end md:items-center justify-center p-4">
      <div className="bg-office-2 border border-wood/50 rounded-xl max-w-lg w-full p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-amber-300/80">Tutorial · Schritt {Math.min(step + 1, 6)} / 6</div>
            <h3 className="text-lg font-semibold text-amber-100 mt-1">{STEPS[Math.min(step, 5)].title}</h3>
          </div>
          <button onClick={dismiss} className="text-amber-100/60 hover:text-amber-50"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-sm text-amber-100/80 mt-3 leading-relaxed">{STEPS[Math.min(step, 5)].body}</p>
        <div className="flex items-center justify-between mt-5">
          <button onClick={dismiss} className="text-sm text-amber-100/60 hover:text-amber-50 underline">Tutorial verlassen</button>
          <button onClick={next} className="px-4 py-2 rounded-md bg-amber-500 text-amber-950 hover:bg-amber-400 text-sm font-semibold flex items-center gap-1.5">
            {step >= 5 ? <><Check className="w-4 h-4" /> Fertig</> : <>Weiter <ChevronRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}