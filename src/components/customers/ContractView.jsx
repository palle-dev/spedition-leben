import React from "react";
import { formatEuro, formatDay, CONTRACT_DURATION_DAYS } from "@/lib/customerData";
import { FileText, Clock, Truck, Wallet, TrendingUp, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";

export default function ContractView({ contract, onTerminate }) {
  const [showTerminateConfirm, setShowTerminateConfirm] = React.useState(false);
  const [terminating, setTerminating] = React.useState(false);

  if (!contract) return null;

  const totalTransports = contract.transportsPerDay * CONTRACT_DURATION_DAYS;
  const isActive = contract.status === "active";
  const isTerminated = contract.status === "terminated";
  const isCompleted = contract.status === "completed";
  const isOffered = contract.status === "offered";

  const successRate = totalTransports > 0 && contract.generatedCount > 0
    ? Math.round(contract.deliveredCount / contract.generatedCount * 100)
    : 0;

  async function handleTerminate() {
    setTerminating(true);
    try {
      await onTerminate(contract.id);
      setShowTerminateConfirm(false);
    } catch (e) {
      // Fehler wird vom Context als Toast angezeigt
    } finally {
      setTerminating(false);
    }
  }

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      isActive ? "border-lime/20 bg-lime/5" :
      isTerminated ? "border-coral/20 bg-coral/5" :
      isCompleted ? "border-white/10 glass" :
      "border-coral/20 bg-coral/5"
    }`}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <FileText className={`w-5 h-5 shrink-0 mt-0.5 ${
          isActive ? "text-lime" : isTerminated ? "text-coral" : "text-muted-foreground"
        }`} />
        <div className="flex-1">
          <h4 className="font-medium text-sm">
            {isOffered ? "Vertragsangebot" : `Rahmenvertrag ${contract.id.slice(-6)}`}
          </h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isOffered ? "Noch nicht abgeschlossen" :
             isActive ? `Aktiv bis ${formatDay(contract.endMin)}` :
             isTerminated ? `Beendet am ${formatDay(contract.earlyTerminatedAtMin)}` :
             `Abgeschlossen am ${formatDay(contract.evaluatedAtMin)}`}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Truck className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Relation:</span>
          <span className="font-medium">{contract.fromCity} → {contract.toCity}</span>
        </div>
        <div className="flex items-center gap-2">
          <Truck className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Fracht:</span>
          <span className="font-medium">{contract.cargo}, {contract.tons} t</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Laufzeit:</span>
          <span className="font-medium">{formatDay(contract.startMin)} – {formatDay(contract.endMin)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Wallet className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Vergütung:</span>
          <span className="font-medium tabular-nums">{formatEuro(contract.paymentPerTransportCents)}</span>
        </div>
      </div>

      {/* Kennzahlen (nur bei active/terminated/completed) */}
      {!isOffered && (
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <div className="font-medium tabular-nums text-lime">{contract.timelyCount}</div>
            <div className="text-muted-foreground text-[10px]">Pünktlich</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <div className="font-medium tabular-nums text-coral/80">{contract.lateCount}</div>
            <div className="text-muted-foreground text-[10px]">Verspätet</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <div className="font-medium tabular-nums text-coral">{contract.failedCount}</div>
            <div className="text-muted-foreground text-[10px]">Gescheitert</div>
          </div>
          <div className="rounded-lg bg-white/5 p-2 text-center">
            <div className="font-medium tabular-nums">{successRate}%</div>
            <div className="text-muted-foreground text-[10px]">Erfüllung</div>
          </div>
        </div>
      )}

      {/* Umsatz */}
      {!isOffered && contract.revenueCents > 0 && (
        <div className="flex justify-between text-xs rounded-lg bg-white/5 p-2.5">
          <span className="text-muted-foreground flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Erzielter Umsatz:
          </span>
          <span className="font-medium tabular-nums">{formatEuro(contract.revenueCents)}</span>
        </div>
      )}

      {/* Vorzeitige Beendigung */}
      {isActive && !showTerminateConfirm && (
        <button
          onClick={() => setShowTerminateConfirm(true)}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-coral/5 hover:bg-coral/10 border border-coral/20 text-coral py-2 text-xs font-medium transition"
        >
          <XCircle className="w-3.5 h-3.5" />
          Vertrag vorzeitig beenden
        </button>
      )}

      {isActive && showTerminateConfirm && (
        <div className="space-y-2 rounded-lg bg-coral/10 border border-coral/20 p-3">
          <div className="flex items-start gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-coral shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">Vorzeitige Beendigung bestätigen</p>
              <p className="text-muted-foreground">
                Dies stoppt zukünftige, noch nicht erzeugte Transporte. Bereits angenommene Aufträge
                bleiben bestehen und werden weiter abgewickelt.
              </p>
              <p className="text-coral">Vertrauen: −6 Punkte (einmalig)</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleTerminate}
              disabled={terminating}
              className="flex-1 rounded-lg bg-coral/15 hover:bg-coral/25 border border-coral/30 text-coral py-1.5 text-xs font-medium transition disabled:opacity-50"
            >
              {terminating ? "Wird beendet…" : "Ja, beenden"}
            </button>
            <button
              onClick={() => setShowTerminateConfirm(false)}
              className="px-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground py-1.5 text-xs transition"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {isCompleted && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="w-4 h-4 text-lime/70" />
          Vertrag wurde regulär abgewickelt und ausgewertet.
        </div>
      )}
    </div>
  );
}