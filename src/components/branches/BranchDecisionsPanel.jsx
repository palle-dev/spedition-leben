import React, { useState } from "react";
import { useGame } from "@/lib/gameContext";
import { formatEuro, formatGameTime } from "@/lib/gameData";
import { Check, X, Building2, TrendingUp, Wrench, Users, Lightbulb, GraduationCap, Loader2, Truck, Hammer, UserPlus } from "lucide-react";

const DECISION_ICON = {
  hire_driver: Users,
  accept_order: TrendingUp,
  maintenance: Wrench,
  cost_optimization: Lightbulb,
  staff_training: GraduationCap,
  buy_vehicle: Truck,
  build_workshop_slot: Hammer,
  hire_employee: UserPlus,
};

export default function BranchDecisionsPanel() {
  const { state, send, showToast } = useGame();
  const [busyId, setBusyId] = useState(null);

  const pending = (state.branchDecisions || []).filter(d => d.status === "pending");
  if (pending.length === 0) return null;

  async function approve(id) {
    setBusyId(id);
    try {
      await send("approveBranchDecision", { decisionId: id });
      showToast("Entscheidung freigegeben.", "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }

  async function reject(id) {
    setBusyId(id);
    try {
      await send("rejectBranchDecision", { decisionId: id });
      showToast("Entscheidung abgelehnt.", "info");
    } catch (e) { showToast(e.message, "error"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Building2 className="w-4 h-4 text-lime" />
        Filialleiter-Entscheidungen
        <span className="text-xs text-muted-foreground">({pending.length} offen)</span>
      </div>
      <div className="space-y-2">
        {pending.map(d => {
          const branch = (state.branches || []).find(b => b.id === d.branchId);
          const manager = (state.employees || []).find(e => e.id === d.managerId);
          const Icon = DECISION_ICON[d.type] || Lightbulb;
          return (
            <div key={d.id} className="glass border border-lime/20 rounded-xl p-3.5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-lime/10 grid place-items-center shrink-0">
                  <Icon className="w-4 h-4 text-lime" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-foreground">{d.title}</span>
                    {manager && (
                      <span className="text-xs text-muted-foreground">
                        · {manager.name} · {branch?.name || "Filiale"} ({branch?.city || ""})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{d.description}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {d.costCents > 0 && (
                      <span className="text-xs text-coral">−{formatEuro(d.costCents)}</span>
                    )}
                    {d.benefitDesc && (
                      <span className="text-xs text-lime">{d.benefitDesc}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatGameTime(d.createdAt)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => approve(d.id)}
                    disabled={busyId === d.id}
                    className="w-9 h-9 grid place-items-center rounded-lg bg-lime/15 border border-lime/30 text-lime hover:bg-lime/25 disabled:opacity-50 transition"
                    title="Freigeben"
                  >
                    {busyId === d.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => reject(d.id)}
                    disabled={busyId === d.id}
                    className="w-9 h-9 grid place-items-center rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-coral hover:border-coral/30 disabled:opacity-50 transition"
                    title="Ablehnen"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}