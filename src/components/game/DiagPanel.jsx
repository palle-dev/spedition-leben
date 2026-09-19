import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { X, Copy, Play, Check, Loader2 } from "lucide-react";

// Entwickler-Diagnosepanel für den Tagesvorlauf.
// Aufruf: Strg+Umschalt+D (in ShellDock registriert).
// Führt einen gemessenen 1440-Min-Vorlauf aus und erfasst:
// - Wartezeit vor dem Worker-Aufruf (syncAutomation/send-Überschneidungen)
// - Worker-Rechenzeit (Tagesvorlauf in der Engine)
// - Ergebnisverarbeitung (processNewEvents, processResult, setState)
// - Dauer bis zur Ergebnisübernahme; kein Paint-/Persistenz-Abschluss
// - technische Mengen: Fahrzeuge, Fahrer, Disponenten, Aufträge, etc.
export default function DiagPanel({ onClose }) {
  const { runDiagnosedAdvance, getDiagReport } = useGame();
  const [running, setRunning] = useState(false);
  const [minutes, setMinutes] = useState(1440);
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleRun() {
    setRunning(true);
    setReport(null);
    try {
      await runDiagnosedAdvance(minutes);
      setReport(getDiagReport());
    } catch (e) {
      setReport({ error: e.message });
    } finally {
      setRunning(false);
    }
  }

  function handleCopy() {
    if (!report) return;
    const text = typeof report === "string" ? report : JSON.stringify(report, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const timings = report?.timings || {};

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="glass border border-white/15 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-lime">Diagnose: Zeitvorlauf</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground leading-relaxed">
            Misst einen Stunden- oder Tagesvorlauf bis zur Ergebnisübernahme. Rechenzeit und
            Worker-Rundlauf werden getrennt erfasst; spätere Darstellung und Speicherung sind nicht enthalten. Der Spielstand wird dabei normal
            fortgesetzt — verwende vorher eine manuelle Sicherung, falls du den
            Zustand erhalten möchtest.
          </div>

          <label className="flex items-center gap-3 text-sm">
            Zeitspanne
            <select aria-label="Zeitspanne für Diagnose" value={minutes} onChange={e => setMinutes(Number(e.target.value))} disabled={running} className="rounded-lg bg-black/40 border border-white/15 px-3 py-2">
              <option value={60}>1 Stunde</option><option value={1440}>1 Tag</option>
            </select>
          </label>
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition disabled:opacity-40 min-h-[44px]"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Messung läuft…" : "Gemessenen Vorlauf starten"}
          </button>

          {report && !report.error && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Messbericht</h3>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-lime" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Kopiert" : "Kopieren"}
                </button>
              </div>

              {/* Zusammenfassung */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="glass border border-white/10 rounded-lg p-2.5">
                  <div className="text-muted-foreground mb-0.5">Gesamtdauer</div>
                  <div className="text-lg font-semibold text-foreground tabular-nums">
                    {(timings.totalMs / 1000).toFixed(1)}s
                  </div>
                </div>
                <div className="glass border border-white/10 rounded-lg p-2.5">
                  <div className="text-muted-foreground mb-0.5">Worker-Rundlauf</div>
                  <div className="text-lg font-semibold text-foreground tabular-nums">
                    {(timings.workerMs / 1000).toFixed(1)}s
                  </div>
                </div>
                <div className="glass border border-white/10 rounded-lg p-2.5">
                  <div className="text-muted-foreground mb-0.5">Wartezeit vor Worker</div>
                  <div className="text-sm font-semibold text-foreground tabular-nums">
                    {(timings.waitMs / 1000).toFixed(1)}s
                    <span className="text-muted-foreground font-normal ml-1">({timings.waitPolls} Polls)</span>
                  </div>
                </div>
                <div className="glass border border-white/10 rounded-lg p-2.5">
                  <div className="text-muted-foreground mb-0.5">Ergebnisverarbeitung</div>
                  <div className="text-sm font-semibold text-foreground tabular-nums">
                    {(timings.processMs / 1000).toFixed(1)}s
                  </div>
                </div>
              </div>

              {timings.workerComputeMs != null && <p className="text-xs text-muted-foreground">
                Davon reine Berechnung: {(timings.workerComputeMs / 1000).toFixed(2)}s · Übertragung, Warteschlange und Zustellung: {(timings.workerOtherMs / 1000).toFixed(2)}s.
              </p>}
              {/* Zeitanteile Balken */}
              <div className="glass border border-white/10 rounded-lg p-3">
                <div className="text-xs text-muted-foreground mb-2">Zeitanteile</div>
                <div className="flex h-6 rounded overflow-hidden bg-black/30">
                  {timings.totalMs > 0 && (() => {
                    const waitPct = (timings.waitMs / timings.totalMs) * 100;
                    const workerPct = (timings.workerMs / timings.totalMs) * 100;
                    const processPct = (timings.processMs / timings.totalMs) * 100;
                    return (
                      <>
                        {waitPct > 0 && (
                          <div className="bg-coral/60 flex items-center justify-center text-[10px] text-ink" style={{ width: `${waitPct}%` }}>
                            {waitPct > 8 ? `Warten ${waitPct.toFixed(0)}%` : ""}
                          </div>
                        )}
                        {workerPct > 0 && (
                          <div className="bg-lime/60 flex items-center justify-center text-[10px] text-ink" style={{ width: `${workerPct}%` }}>
                            {workerPct > 8 ? `Worker ${workerPct.toFixed(0)}%` : ""}
                          </div>
                        )}
                        {processPct > 0 && (
                          <div className="bg-invest-cyan/60 flex items-center justify-center text-[10px] text-ink" style={{ width: `${processPct}%` }}>
                            {processPct > 8 ? `Verarb. ${processPct.toFixed(0)}%` : ""}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-coral/60" />Warten</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-lime/60" />Worker</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-invest-cyan/60" />Verarbeitung</span>
                </div>
              </div>

              {/* technische Mengen */}
              {report.stats && (
                <div className="glass border border-white/10 rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-2">Spielstand</div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                    <div><span className="text-muted-foreground">Fahrzeuge:</span> <span className="text-foreground tabular-nums">{report.stats.vehicles}</span></div>
                    <div><span className="text-muted-foreground">Fahrer:</span> <span className="text-foreground tabular-nums">{report.stats.drivers}</span></div>
                    <div><span className="text-muted-foreground">Disponenten:</span> <span className="text-foreground tabular-nums">{report.stats.dispatchers}</span></div>
                    <div><span className="text-muted-foreground">Aufträge:</span> <span className="text-foreground tabular-nums">{report.stats.ordersTotal}</span></div>
                    <div><span className="text-muted-foreground">Aktive Touren:</span> <span className="text-foreground tabular-nums">{report.stats.toursActive}</span></div>
                    <div><span className="text-muted-foreground">Laufende Trips:</span> <span className="text-foreground tabular-nums">{report.stats.tripsInProgress}</span></div>
                    <div><span className="text-muted-foreground">Events:</span> <span className="text-foreground tabular-nums">{report.stats.events}</span></div>
                    <div><span className="text-muted-foreground">Buchungen:</span> <span className="text-foreground tabular-nums">{report.stats.bookings}</span></div>
                    <div><span className="text-muted-foreground">Mitarbeiter:</span> <span className="text-foreground tabular-nums">{report.stats.employees}</span></div>
                    <div><span className="text-muted-foreground">Filialen:</span> <span className="text-foreground tabular-nums">{report.stats.branches}</span></div>
                    <div><span className="text-muted-foreground">State-Größe:</span> <span className="text-foreground tabular-nums">{report.stateSizeKb} KB</span></div>
                    <div><span className="text-muted-foreground">Automatik:</span> <span className="text-foreground">{report.automationEnabled ? "an" : "aus"}</span></div>
                  </div>
                </div>
              )}

              {/* Rohbericht */}
              <details className="glass border border-white/10 rounded-lg p-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition">Vollständiger Bericht (JSON)</summary>
                <pre className="text-[10px] font-mono bg-black/40 rounded-lg p-2 mt-2 overflow-auto max-h-48 border border-white/5">
                  {JSON.stringify(report, null, 2)}
                </pre>
              </details>
            </div>
          )}

          {report?.error && (
            <div className="glass border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
              Fehler: {report.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}