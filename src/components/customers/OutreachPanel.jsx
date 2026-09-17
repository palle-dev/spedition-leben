import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatDay } from "@/lib/customerData";
import { Handshake, Clock, CheckCircle2, AlertTriangle, Info } from "lucide-react";

export default function OutreachPanel({ customerId }) {
  const { state, send } = useGame();
  const [status, setStatus] = React.useState(null);
  const [feasibility, setFeasibility] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await send("getOutreachStatus", { customerId });
        const f = await send("getOutreachFeasibility", { customerId });
        if (!cancelled) { setStatus(s.status); setFeasibility(f.feasibility); }
      } catch (e) { /* toast */ }
    })();
    return () => { cancelled = true; };
  }, [customerId, state.gameTime]);

  const handleOutreach = async () => {
    setLoading(true);
    setResult(null);
    try {
      const r = await send("initiateOutreach", { customerId });
      setResult(r);
      // Status aktualisieren
      const s = await send("getOutreachStatus", { customerId });
      setStatus(s.status);
    } catch (e) {
      // toast zeigt Fehler
    } finally {
      setLoading(false);
    }
  };

  if (!status || !feasibility) return null;

  // Bestehender Vertrag — keine Ansprache nötig
  if (feasibility.existingContract) {
    return (
      <div className="rounded-xl border border-white/10 glass p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="w-4 h-4 shrink-0" />
          <span>Bestehender Vertrag aktiv — gezielte Ansprache nicht sinnvoll.</span>
        </div>
      </div>
    );
  }

  // Keine Gelegenheit
  if (!feasibility.hasAnyOpportunity) {
    return (
      <div className="rounded-xl border border-white/10 glass p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Handshake className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">Gezielte Kundenansprache</span>
        </div>
        {(feasibility.missingRequirements?.length ?? 0) > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {feasibility.missingRequirements.map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-coral/70" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
        <button
          onClick={handleOutreach}
          disabled={loading || !status.canOutreach}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition disabled:opacity-50"
        >
          {loading ? "Anfrage läuft…" : "Trotzdem ansprechen"}
        </button>
        {result && result.outreach && (
          <div className="text-xs text-muted-foreground mt-1">{result.outreach.resultMessage}</div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 glass p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Handshake className="w-4 h-4 text-lime" />
          <span className="font-medium">Gezielte Kundenansprache</span>
        </div>
        {status.hasOutreach && status.lastContactMin && (
          <span className="text-[10px] text-muted-foreground">
            Letzte Ansprache: {formatDay(status.lastContactMin)}
          </span>
        )}
      </div>

      {/* Machbarkeits-Info */}
      <div className="flex flex-wrap gap-1.5 text-[11px]">
        {feasibility.canOfferContract && (
          <span className="px-2 py-0.5 rounded-md bg-lime/10 text-lime border border-lime/20">Vertragsgespräch möglich</span>
        )}
        {feasibility.canOfferTender && (
          <span className="px-2 py-0.5 rounded-md bg-white/10 text-foreground border border-white/10">Ausschreibung möglich</span>
        )}
        {feasibility.canOfferTrial && (
          <span className="px-2 py-0.5 rounded-md bg-white/10 text-muted-foreground border border-white/10">Probeauftrag möglich</span>
        )}
      </div>

      {/* Ergebnis der letzten Ansprache */}
      {result && result.outreach ? (
        <div className={`rounded-lg p-2.5 text-xs space-y-1 ${
          result.outreach.result === "tender_invitation" ? "bg-lime/10 border border-lime/20" :
          result.outreach.result === "contract_discussion" ? "bg-lime/10 border border-lime/20" :
          result.outreach.result === "trial_order" ? "bg-white/10 border border-white/10" :
          "bg-white/5 border border-white/10"
        }`}>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium">{result.outreach.resultMessage}</span>
          </div>
          {result.outreach.tenderId && (
            <div className="text-[11px] text-muted-foreground pl-5">
              → Ausschreibungsdetail in der Kundenübersicht verfügbar
            </div>
          )}
        </div>
      ) : status.hasOutreach && status.result ? (
        <div className="rounded-lg p-2.5 text-xs bg-white/5 border border-white/10">
          <div className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span>{status.resultMessage}</span>
          </div>
        </div>
      ) : null}

      {/* Sperrfrist */}
      {status.hasOutreach && !status.canOutreach && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>Nächste Ansprache möglich ab {status.nextAllowedLabel}</span>
        </div>
      )}

      {/* Button */}
      <button
        onClick={handleOutreach}
        disabled={loading || !status.canOutreach}
        className="w-full text-sm px-3 py-2 rounded-lg bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Anfrage läuft…" : "Geschäftsmöglichkeiten ansprechen"}
      </button>

      <div className="text-[10px] text-muted-foreground/70">
        7-tägige Sperrfrist pro Kunde. Kein Vertrauensgewinn durch Ansprache allein.
      </div>
    </div>
  );
}