import React from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatDay } from "@/lib/customerData";
import {
  Gavel, Check, X, ArrowRight, Clock, AlertTriangle, Shield, CheckCircle2
} from "lucide-react";

export default function NegotiationPanel({ tenderId, onCheckCapacity, capacityCheck }) {
  const { state, send } = useGame();
  const [negStatus, setNegStatus] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [action, setAction] = React.useState(null); // "accept" | "propose" | "reject"
  const [proposedTerms, setProposedTerms] = React.useState({
    pricePerTransportCents: "",
    transportsPerDay: "",
    startMin: "",
    deliveryBufferMin: "",
  });
  const [processing, setProcessing] = React.useState(false);

  const loadStatus = React.useCallback(async () => {
    try {
      const r = await send("getNegotiationStatus", { tenderId });
      setNegStatus(r);
      // Default-Werte aus aktuellen Konditionen
      if (r?.negotiation?.currentTerms) {
        const ct = r.negotiation.currentTerms;
        setProposedTerms({
          pricePerTransportCents: String(Math.round(ct.pricePerTransportCents / 100)),
          transportsPerDay: String(ct.transportsPerDay),
          startMin: String(ct.startMin),
          deliveryBufferMin: String(ct.deliveryBufferMin),
        });
      }
    } catch (e) { /* toast */ }
    finally { setLoading(false); }
  }, [tenderId, send]);

  React.useEffect(() => {
    loadStatus();
  }, [tenderId, state.gameTime]);

  const handleStart = async () => {
    setProcessing(true);
    try {
      await send("startNegotiation", { tenderId });
      await loadStatus();
    } catch (e) { /* toast */ }
    finally { setProcessing(false); }
  };

  const handleAction = async (act) => {
    setProcessing(true);
    setAction(act);
    try {
      if (act === "accept") {
        await send("processNegotiationRound", { tenderId, action: "accept" });
      } else if (act === "reject") {
        await send("processNegotiationRound", { tenderId, action: "reject" });
      } else if (act === "propose") {
        const terms = {
          pricePerTransportCents: parseInt(proposedTerms.pricePerTransportCents, 10) * 100,
          transportsPerDay: parseInt(proposedTerms.transportsPerDay, 10),
          startMin: parseInt(proposedTerms.startMin, 10),
          deliveryBufferMin: parseInt(proposedTerms.deliveryBufferMin, 10),
        };
        await send("processNegotiationRound", { tenderId, action: "propose", proposedTerms: terms });
      }
      await loadStatus();
    } catch (e) { /* toast */ }
    finally { setProcessing(false); setAction(null); }
  };

  if (loading || !negStatus) {
    return <div className="text-sm text-muted-foreground py-4">Lade Verhandlungsstatus…</div>;
  }

  const { negotiation, contract, maxRounds, roundsRemaining } = negStatus;

  // Keine Verhandlung gestartet
  if (!negotiation) {
    return (
      <div className="rounded-xl border border-lime/20 bg-lime/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-lime" />
          <h4 className="font-medium text-sm">Zuschlag erhalten!</h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Sie haben die Ausschreibung gewonnen. Ein befristetes Vertragsangebot steht bereit.
          Sie können die Konditionen verhandeln (max. {maxRounds} Runden) oder direkt annehmen.
        </p>
        <button
          onClick={handleStart}
          disabled={processing}
          className="text-sm px-3 py-2 rounded-lg bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition disabled:opacity-50"
        >
          Verhandlung starten
        </button>
      </div>
    );
  }

  const ct = negotiation.currentTerms;
  const isCompleted = negotiation.status === "completed";
  const isFailed = negotiation.status === "failed";
  const canAct = negotiation.status === "active" && !processing;

  return (
    <div className="space-y-4">
      {/* Verhandlungsstatus */}
      <div className={`rounded-xl border p-4 space-y-3 ${
        isCompleted ? "border-lime/20 bg-lime/5" :
        isFailed ? "border-coral/20 bg-coral/5" :
        "border-white/10 glass"
      }`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Gavel className="w-4 h-4" />
            <h4 className="font-medium text-sm">Verhandlung</h4>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded ${
              isCompleted ? "bg-lime/10 text-lime" :
              isFailed ? "bg-coral/10 text-coral" :
              "bg-white/10 text-foreground"
            }`}>
              {isCompleted ? "Abgeschlossen" : isFailed ? "Gescheitert" : "Aktiv"}
            </span>
            <span className="text-muted-foreground">
              Runde {negotiation.roundsUsed} / {maxRounds}
            </span>
          </div>
        </div>

        {/* Aktuelle Konditionen */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Preis/Transport</div>
            <div className="font-medium tabular-nums">{formatEuro(ct.pricePerTransportCents)}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Transporte/Tag</div>
            <div className="font-medium tabular-nums">{ct.transportsPerDay}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Beginn</div>
            <div className="font-medium">{formatDay(ct.startMin)}</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2">
            <div className="text-muted-foreground text-[10px] uppercase tracking-wider">Lieferfenster</div>
            <div className="font-medium tabular-nums">{(ct.deliveryBufferMin / 60).toFixed(1)} h</div>
          </div>
        </div>

        {/* Verlauf */}
        {negotiation.rounds.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] text-muted-foreground">Verhandlungverlauf:</div>
            {negotiation.rounds.map((r, i) => (
              <div key={i} className="text-[11px] flex items-center gap-2 py-1 px-2 rounded bg-white/5">
                <span className="text-muted-foreground shrink-0">R{r.round}</span>
                <span className="shrink-0">
                  {r.action === "accept" ? "Akzeptiert" : r.action === "reject" ? "Abgelehnt" : "Vorschlag"}
                </span>
                {r.proposedTerms && (
                  <span className="text-muted-foreground">
                    → {formatEuro(r.proposedTerms.pricePerTransportCents)}
                  </span>
                )}
                <span className={`shrink-0 ml-auto ${
                  r.response === "accept" || r.response === "accepted" ? "text-lime" :
                  r.response === "reject" || r.response === "rejected" ? "text-coral" :
                  "text-amber-400"
                }`}>
                  {r.response === "accept" || r.response === "accepted" ? "✓" :
                   r.response === "reject" || r.response === "rejected" ? "✗" :
                   "↔"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Kapazitätsprüfung bei Annahme */}
      {isCompleted && contract && contract.status === "offered" && (
        <CapacityCheckSection onCheck={onCheckCapacity} capacityCheck={capacityCheck} contract={contract} />
      )}

      {/* Aktions-Buttons */}
      {canAct && (
        <div className="rounded-xl border border-white/10 glass p-4 space-y-3">
          <div className="text-sm font-medium">Aktion</div>

          {/* Gegenangebot-Formular */}
          {action === "propose" && (
            <div className="space-y-2 rounded-lg bg-white/5 p-3 border border-white/10">
              <div className="text-xs text-muted-foreground">Neues Angebot:</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Preis/Transport (€)</label>
                  <input
                    type="number"
                    value={proposedTerms.pricePerTransportCents}
                    onChange={(e) => setProposedTerms(p => ({ ...p, pricePerTransportCents: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-xs tabular-nums focus:outline-none focus:border-lime/30"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Transporte/Tag</label>
                  <input
                    type="number"
                    value={proposedTerms.transportsPerDay}
                    onChange={(e) => setProposedTerms(p => ({ ...p, transportsPerDay: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded bg-white/5 border border-white/10 text-xs tabular-nums focus:outline-none focus:border-lime/30"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAction("propose")}
                  disabled={processing}
                  className="flex-1 text-xs px-3 py-1.5 rounded-lg bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition disabled:opacity-50"
                >
                  Angebot senden
                </button>
                <button
                  onClick={() => setAction(null)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleAction("accept")}
              disabled={processing}
              className="flex-1 min-w-[120px] text-sm px-3 py-2 rounded-lg bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Akzeptieren
            </button>
            <button
              onClick={() => setAction("propose")}
              disabled={processing}
              className="flex-1 min-w-[120px] text-sm px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <ArrowRight className="w-4 h-4" /> Gegenangebot
            </button>
            <button
              onClick={() => handleAction("reject")}
              disabled={processing}
              className="text-sm px-3 py-2 rounded-lg bg-coral/5 text-coral border border-coral/20 hover:bg-coral/10 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <X className="w-4 h-4" /> Ablehnen
            </button>
          </div>

          {roundsRemaining <= 1 && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400">
              <Clock className="w-3 h-3" />
              Letzte Runde — danach ist die Verhandlung abgeschlossen.
            </div>
          )}
        </div>
      )}

      {/* Abschluss-Hinweis */}
      {isCompleted && (
        <div className="rounded-lg bg-lime/5 border border-lime/20 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 text-lime font-medium mb-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Verhandlung abgeschlossen
          </div>
          Das Vertragsangebot steht in der Kundendetailansicht zur bewussten Bestätigung bereit.
          Ein verbindlicher Vertrag entsteht erst durch bewusste Annahme.
        </div>
      )}

      {isFailed && (
        <div className="rounded-lg bg-coral/5 border border-coral/20 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 text-coral font-medium mb-1">
            <X className="w-3.5 h-3.5" /> Verhandlung gescheitert
          </div>
          Das Vertragsangebot verfällt. Bestehende Verträge bleiben unberührt.
          Kein Vertrauensverlust durch die Ablehnung allein.
        </div>
      )}
    </div>
  );
}

function CapacityCheckSection({ onCheck, capacityCheck, contract }) {
  return (
    <div className="rounded-xl border border-white/10 glass p-4 space-y-3">
      <h4 className="font-medium text-sm flex items-center gap-1.5">
        <Shield className="w-4 h-4" /> Kapazitätsprüfung bei Annahme
      </h4>
      <p className="text-[11px] text-muted-foreground">
        Vor der verbindlichen Annahme: Prüfung auf harte Hindernisse und Risiken.
      </p>

      {!capacityCheck ? (
        <button
          onClick={onCheck}
          className="text-xs px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition"
        >
          Kapazität prüfen
        </button>
      ) : (
        <div className="space-y-2">
          {capacityCheck.hardObstacles.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] text-coral font-medium">Harte Hindernisse:</div>
              {capacityCheck.hardObstacles.map((o, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-coral">
                  <X className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{o}</span>
                </div>
              ))}
            </div>
          )}

          {capacityCheck.risks.length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] text-amber-400 font-medium">Risiken:</div>
              {capacityCheck.risks.map((r, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-400">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {capacityCheck.canAccept && capacityCheck.risks.length === 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-lime">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Keine Hindernisse oder Risiken — Annahme gefahrlos möglich.
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 text-[11px] pt-1">
            <div className="rounded bg-white/5 p-1.5 text-center">
              <div className="tabular-nums">{capacityCheck.vehicleCount}</div>
              <div className="text-muted-foreground text-[10px]">Fahrzeuge</div>
            </div>
            <div className="rounded bg-white/5 p-1.5 text-center">
              <div className="tabular-nums">{capacityCheck.driverCount}</div>
              <div className="text-muted-foreground text-[10px]">Fahrer</div>
            </div>
            <div className="rounded bg-white/5 p-1.5 text-center">
              <div className="tabular-nums">{capacityCheck.prepDays}</div>
              <div className="text-muted-foreground text-[10px]">Vorb.-Tage</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}