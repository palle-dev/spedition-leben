import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, XCircle, ArrowRight, Settings } from "lucide-react";
import { useGame } from "@/lib/gameContext";
import { getUrgencyColor, getViolatedRuleLabel, getApprovalExplanation, formatCents } from "@/lib/delegationData";

// Kompakte Freigabe-Warteschlange für die Büro-Seite.
// Zeigt ausstehende Freigaben mit Freigeben/Ablehnen-Buttons.
export default function OfficeApprovalQueue({ state }) {
  const { send, showToast } = useGame();
  const navigate = useNavigate();

  const pending = useMemo(() => {
    return (state.approvals?.pending || []).filter(a => a.status === "pending").slice(0, 5);
  }, [state.approvals]);

  if (pending.length === 0) return null;

  async function handleApprove(requestId) {
    try {
      const r = await send("approveApproval", { requestId });
      if (r?.superseded) showToast("Anfrage nicht mehr aktuell: " + r.reason, "info");
      else showToast("Freigabe erteilt", "success");
    } catch (e) { showToast(e.message, "error"); }
  }

  async function handleReject(requestId) {
    try {
      await send("rejectApproval", { requestId });
      showToast("Freigabe abgelehnt", "info");
    } catch (e) { showToast(e.message, "error"); }
  }

  return (
    <div className="glass border border-amber-500/20 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium tracking-tight flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-300/80" /> Ausstehende Freigaben
          <span className="text-xs text-muted-foreground tabular-nums">({pending.length})</span>
        </h3>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/fuehrung")}
            className="text-xs text-muted-foreground hover:text-foreground transition flex items-center gap-1">
            <Settings className="w-3 h-3" /> Limits konfigurieren
          </button>
          <button onClick={() => navigate("/fuehrung")}
            className="text-xs text-lime/70 hover:text-lime transition flex items-center gap-1">
            Führung <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {pending.map(req => (
          <div key={req.id} className="bg-surface-2/30 rounded-lg border border-white/5 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] ${getUrgencyColor(req.urgency)}`}>● {req.urgency}</span>
                  <span className="text-[10px] text-muted-foreground">{req.employeeName}</span>
                  {req.branchName && <span className="text-[10px] text-muted-foreground">· {req.branchName}</span>}
                </div>
                <div className="text-sm font-medium leading-tight">{req.title}</div>
                <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{getApprovalExplanation(req)}</div>
                {req.violatedRule && (
                  <div className="text-[10px] text-coral/80 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" /> {getViolatedRuleLabel(req.violatedRule)}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                {req.costCents > 0 && <div className="text-xs font-medium tabular-nums">{formatCents(req.costCents)}</div>}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-white/5">
              <button onClick={() => handleApprove(req.id)}
                className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] bg-lime/10 text-lime border border-lime/20 hover:bg-lime/20 transition">
                <CheckCircle2 className="w-3 h-3" /> Freigeben
              </button>
              <button onClick={() => handleReject(req.id)}
                className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] bg-white/5 text-muted-foreground hover:text-foreground border border-white/10 transition">
                <XCircle className="w-3 h-3" /> Ablehnen
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}