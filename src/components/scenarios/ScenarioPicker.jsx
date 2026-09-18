import React, { useState } from "react";
import { Target, Clock, ArrowLeft, Play } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { SCENARIOS } from "@/lib/scenarios/scenarioCatalog";

export default function ScenarioPicker({ onClose }) {
  const { state, newScenarioGame, busy } = useGame();
  const [selectedId, setSelectedId] = useState(SCENARIOS[0].id);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const selected = SCENARIOS.find(s => s.id === selectedId);
  async function start() {
    if (starting || busy) return;
    setStarting(true);
    setError("");
    try {
      await newScenarioGame(selected.id, {
        playerName: state?.private?.playerName || "Spielerin",
        partnerName: state?.private?.partnerName || "Mara",
      });
    } catch (e) { setError(e.message); }
    finally { setStarting(false); }
  }
  return (
    <section className="glass border border-white/15 rounded-2xl p-5 space-y-4" aria-label="Szenario auswählen">
      <div className="flex items-center gap-2">
        <Target className="w-5 h-5 text-lime" />
        <h2 className="font-semibold">Deine nächste Herausforderung</h2>
      </div>
      <p className="text-sm text-muted-foreground">Drei eigenständige Partien mit fester Ausgangslage, klaren Zielen und einem Stichtag.</p>
      <div className="space-y-2" role="group" aria-label="Szenarien">
        {SCENARIOS.map(s => (
          <button key={s.id} type="button" aria-pressed={selectedId === s.id} disabled={starting || busy}
            onClick={() => setSelectedId(s.id)}
            className={`w-full text-left rounded-xl border p-3 transition disabled:opacity-50 ${selectedId === s.id ? "border-lime/50 bg-lime/10" : "border-white/10 hover:border-white/30"}`}>
            <span className="block font-medium">{s.title}</span>
            <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Clock className="w-3 h-3" />{s.durationDays} Spieltage · {s.difficulty}</span>
          </button>
        ))}
      </div>
      <div className="space-y-3 text-sm" aria-live="polite">
        <p>{selected.story}</p>
        <div><h3 className="font-medium text-lime">Dein Start</h3><p className="text-muted-foreground mt-1">{selected.startEquipment}</p></div>
        <div><h3 className="font-medium">Verpflichtungen</h3><p className="text-muted-foreground mt-1">{selected.obligations}</p></div>
        <div><h3 className="font-medium">Ziele am Stichtag</h3><ul className="mt-1 space-y-1 list-disc pl-5 text-muted-foreground">{selected.mandatoryGoals.map(g => <li key={g.id}>{g.label}</li>)}</ul></div>
        {selected.optionalGoals.length > 0 && <div><h3 className="font-medium">Zusätzliche Herausforderung</h3><ul className="mt-1 space-y-1 list-disc pl-5 text-muted-foreground">{selected.optionalGoals.map(g => <li key={g.id}>{g.label}</li>)}</ul></div>}
      </div>
      {state && <p className="text-xs text-muted-foreground">Deine laufende Partie wird vor dem Start als eigener Speicherstand gesichert. Du findest sie anschließend unter „Spielstand laden“.</p>}
      {error && <p role="alert" className="text-sm text-coral">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={start} disabled={starting || busy} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-lime text-ink font-semibold px-4 py-3 disabled:opacity-50"><Play className="w-4 h-4" />{starting ? "Szenario wird gestartet…" : "Szenario starten"}</button>
        <button onClick={onClose} disabled={starting || busy} className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-3 disabled:opacity-50"><ArrowLeft className="w-4 h-4" />Zurück</button>
      </div>
    </section>
  );
}
