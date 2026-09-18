import React from "react";
import { useGame } from "@/lib/gameContext";
import { CheckCircle2, XCircle, Trophy } from "lucide-react";
import { formatGameTime } from "@/lib/gameData";

export default function ScenarioResultPanel() {
  const { state, busy, continueScenarioAsFreePlay, openStartScreen } = useGame();
  const result = state?.scenario?.result;
  if (!result) return null;
  return (
    <section className="glass border border-lime/25 rounded-2xl p-5 space-y-4" aria-label="Szenario-Ergebnis">
      <div className="flex items-start gap-3"><Trophy className="w-6 h-6 text-lime shrink-0" /><div>
        <h2 className="text-lg font-semibold">{result.success ? "Szenario geschafft!" : "Szenario beendet"}</h2>
        <p className="text-sm text-muted-foreground">{result.scenarioTitle} · Auswertung: {formatGameTime(result.evaluatedAtMin)}</p>
      </div></div>
      <p className="text-sm">{result.success ? "Du hast alle verbindlichen Ziele erreicht." : "Noch nicht alle verbindlichen Ziele erreicht. Die Auswertung zeigt dir, wo du beim nächsten Versuch ansetzen kannst."}</p>
      {[["Verbindliche Ziele", result.mandatoryGoals], ["Zusätzliche Ziele", result.optionalGoals]].map(([title, goals]) => goals?.length > 0 && (
        <div key={title} className="space-y-2"><h3 className="text-xs uppercase tracking-wide text-muted-foreground">{title}</h3>
          {goals.map(goal => <div key={goal.id} className="flex items-start gap-2 rounded-lg bg-white/5 p-3 text-sm">
            {goal.met ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-lime" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-coral" />}
            <div><p>{goal.label}</p><p className="text-xs text-muted-foreground mt-1">{goal.met ? "Erreicht" : "Nicht erreicht"} · {goal.display}</p></div>
          </div>)}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={continueScenarioAsFreePlay} className="px-4 py-2.5 rounded-lg bg-lime text-ink font-semibold disabled:opacity-50">Als freies Spiel weiterspielen</button>
        <button disabled={busy} onClick={openStartScreen} className="px-4 py-2.5 rounded-lg border border-white/20 disabled:opacity-50">Zur Spielauswahl</button>
      </div>
    </section>
  );
}
