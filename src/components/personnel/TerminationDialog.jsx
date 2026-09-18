import React, { useState, useEffect } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { roleLabel } from "@/lib/displayHelpers";
import Portrait from "@/components/ui/Portrait";
import { AlertCircle, LogOut, Clock, Euro, Truck, Headset, FileText, RotateCcw } from "lucide-react";

export default function TerminationDialog({ personId, personName, kind, onClose }) {
  const { state, send, showToast } = useGame();
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState("continue_working");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);

  // Prüfe, ob bereits ein Austritt angekündigt wurde
  const found = kind === "driver"
    ? (state.drivers || []).find(d => d.id === personId)
    : (state.employees || []).find(e => e.id === personId);
  const alreadyNoticed = found?.employmentStatus === "notice_given";

  useEffect(() => {
    if (alreadyNoticed) { setLoading(false); return; }
    setLoading(true); setError(null);
    send("previewTermination", { personId })
      .then(r => { setPreview(r); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [personId]);

  async function confirm() {
    setConfirming(true); setError(null);
    try {
      const r = await send("terminateEmployee", { personId, mode });
      showToast(`Kündigung ausgesprochen. Austritt am ${r.exitDateLabel}.`, "success");
      onClose();
    } catch (e) {
      setError(e.message);
      showToast(e.message, "error");
    } finally {
      setConfirming(false);
    }
  }

  async function cancelTermination() {
    setConfirming(true); setError(null);
    try {
      await send("cancelTermination", { personId });
      showToast("Kündigung zurückgenommen.", "success");
      onClose();
    } catch (e) {
      setError(e.message);
      showToast(e.message, "error");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" /></div>;
  }

  // Bereits angekündigt: Austritt ansehen
  if (alreadyNoticed) {
    const exitMin = found.exitMin;
    const exitMode = found.exitMode;
    const remainingWages = computeRemainingWagesFromState(state, found);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-400/20">
          <AlertCircle className="w-5 h-5 text-amber-300 shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-amber-300">Austritt bereits angekündigt</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Vorgesehenes Ende: <span className="text-foreground/80">{formatGameTime(exitMin)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <Row icon={Clock} label="Ablauf" value={exitMode === "garden_leave" ? "Freistellung" : "Weiterarbeit bis Fristende"} />
          <Row icon={Euro} label="Verbleibende Lohnfälligkeiten" value={`${remainingWages.count} × ${formatEuro(found.costPerDayCents)} = ${formatEuro(remainingWages.total)}`} />
          <Row icon={Clock} label="Erklärt am" value={formatGameTime(found.noticeDeclaredAtMin)} />
        </div>

        {found.attendance === "released" && (
          <div className="text-xs text-sky-300 bg-sky-500/10 rounded-lg px-3 py-2">
            Diese Person wurde freigestellt und erbringt keine Arbeitsleistung mehr. Die Lohnpflicht besteht bis zum Austritt weiter.
          </div>
        )}

        <button
          onClick={cancelTermination}
          disabled={confirming || state.gameTime >= exitMin}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 border border-white/10 text-sm font-medium hover:border-lime/30 hover:text-lime transition disabled:opacity-40"
        >
          {confirming ? <span className="w-4 h-4 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" /> : <><RotateCcw className="w-4 h-4" /> Kündigung zurücknehmen</>}
        </button>
        {state.gameTime >= exitMin && (
          <div className="text-xs text-muted-foreground/60 text-center">Der Austritt ist bereits wirksam geworden.</div>
        )}
      </div>
    );
  }

  if (error) {
    return <div className="text-sm text-coral p-4 text-center">{error}</div>;
  }

  if (!preview) return null;

  return (
    <div className="space-y-4">
      {/* Kopf: Person */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-2/50 border border-white/5">
        <Portrait portraitId={preview.portraitId} name={preview.name} size="md" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{preview.name}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{roleLabel(preview.role)} · {preview.attendance === "released" ? "Freigestellt" : "Aktiv"}</div>
        </div>
      </div>

      {/* Austrittsdatum */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-400/10">
        <Clock className="w-5 h-5 text-amber-300 shrink-0" />
        <div className="text-sm">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Reguläres Austrittsdatum</div>
          <div className="font-medium text-foreground/90">{preview.exitDateLabel}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">7 Spieltage Kündigungsfrist</div>
        </div>
      </div>

      {/* Lohnkosten */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Verbleibende Lohnkosten</div>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-surface-2/50 border border-white/5">
          <Euro className="w-4 h-4 text-lime/60" />
          <div className="flex-1 text-sm">
            <span className="text-foreground/80">{preview.remainingWageCount} Lohnfälligkeiten</span>
            <span className="text-muted-foreground mx-1.5">×</span>
            <span className="text-foreground/80">{formatEuro(preview.dailyWageCents)}</span>
          </div>
          <div className="text-sm font-medium tabular-nums text-amber-300">{formatEuro(preview.remainingWageCents)}</div>
        </div>
        <div className="text-[10px] text-muted-foreground/70 px-1">Tageslohn wird bis zum Austritt an jedem Mitternacht fällig. Danach keine weiteren Löhne.</div>
      </div>

      {/* Betroffene Aufgaben */}
      {preview.affectedItems.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Betroffene Aufgaben und Zuständigkeiten</div>
          <div className="space-y-1.5">
            {preview.affectedItems.map((item, i) => {
              const Icon = item.type === "active_trip" || item.type === "assigned_vehicle" ? Truck
                : item.type === "pending_suggestion" ? Headset : FileText;
              return (
                <div key={i} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-surface-2/30 border border-white/5">
                  <Icon className="w-3.5 h-3.5 text-foreground/40 shrink-0" />
                  <span className="text-foreground/70">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Aktive Fahrt Hinweis */}
      {preview.onTrip && (
        <div className="text-xs text-amber-300 bg-amber-500/10 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            <div>Diese Person ist auf einer laufenden Fahrt bis {formatGameTime(preview.tripEndMin)}.</div>
            <div className="text-muted-foreground mt-0.5">Die Fahrt wird sicher abgeschlossen. Das Austrittsdatum liegt frühestens nach Fahrtende.</div>
          </div>
        </div>
      )}

      {/* Ablauf-Modus Auswahl */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ablauf wählen</div>
        <button
          onClick={() => setMode("continue_working")}
          className={`w-full text-left rounded-lg p-3 border transition ${mode === "continue_working" ? "border-lime/40 bg-lime/10" : "border-white/10 hover:border-white/20"}`}
        >
          <div className={`text-sm font-medium ${mode === "continue_working" ? "text-lime" : "text-foreground"}`}>Weiterarbeiten bis Fristende</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Person arbeitet normal weiter bis zum Austrittsdatum.</div>
        </button>
        <button
          onClick={() => setMode("garden_leave")}
          disabled={!preview.canReleaseImmediately}
          className={`w-full text-left rounded-lg p-3 border transition ${mode === "garden_leave" ? "border-lime/40 bg-lime/10" : "border-white/10 hover:border-white/20"} ${!preview.canReleaseImmediately ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          <div className={`text-sm font-medium ${mode === "garden_leave" ? "text-lime" : "text-foreground"}`}>Freistellung vorbereiten</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {preview.canReleaseImmediately
              ? "Person wird sofort freigestellt. Lohnpflicht bleibt bis zum Austritt bestehen."
              : "Erst nach sicherem Abschluss der laufenden Fahrt möglich."}
          </div>
        </button>
      </div>

      {/* Fehler */}
      {error && <div className="text-sm text-coral p-2 text-center">{error}</div>}

      {/* Bestätigung */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg py-2.5 border border-white/10 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-white/20 transition"
        >
          Abbrechen
        </button>
        <button
          onClick={confirm}
          disabled={confirming}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 bg-coral/90 text-ink text-sm font-semibold hover:brightness-110 disabled:opacity-40 transition active:scale-[0.98]"
        >
          {confirming ? <span className="w-4 h-4 border-2 border-ink/30 border-t-ink rounded-full animate-spin" /> : <><LogOut className="w-4 h-4" /> Kündigung bestätigen</>}
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground/60 text-center -mt-2">Die Erklärung kostet kein Geld. Die Lohnpflicht besteht bis zum Austritt weiter.</div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-surface-2/30 border border-white/5">
      <span className="flex items-center gap-2 text-muted-foreground"><Icon className="w-3.5 h-3.5" /> {label}</span>
      <span className="text-foreground/80 font-medium">{value}</span>
    </div>
  );
}

// Client-seitige Berechnung der verbleibenden Löhne für bereits angekündigte Austritte
function computeRemainingWagesFromState(state, person) {
  const exitMin = person.exitMin;
  if (!exitMin) return { count: 0, total: 0 };
  const now = state.gameTime;
  const dailyWage = person.costPerDayCents || 0;
  let nextMidnight = Math.floor(now / 1440) * 1440 + 1440;
  if (nextMidnight === now) nextMidnight = now + 1440;
  let count = 0;
  let m = nextMidnight;
  while (m <= exitMin) { count++; m += 1440; }
  return { count, total: count * dailyWage };
}